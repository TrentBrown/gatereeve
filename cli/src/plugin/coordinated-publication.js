import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  approveCoordinatedPublication,
  assertCoordinatedRelease,
  convergeCoordinatedPublication,
  publicationPlanSha256,
  verifyCoordinatedReleaseWorkspace,
  writeCoordinatedRelease,
} from './coordinated-release.js';
import { assertDesktopReleaseManifest } from './desktop-release-manifest.js';
import {
  preflightPublicationRepository,
  publishRepositoryFileViaPullRequest,
  readRepositoryFile,
  requestGitHubApi,
} from './github-publication.js';
import {
  defaultCommandRunner,
  verifyMarketplaceRelease,
  watchRelease,
} from './release-operations.js';

const RELEASES_URL = 'https://github.com/TrentBrown/gatereeve/releases';
const MANIFEST_PATH = 'workflow-site/releases/desktop.json';
const MANIFEST_URL = 'https://gatereeve.pages.dev/releases/desktop.json';
const MAX_WEB_BYTES = 64 * 1024;

function repositoryName(url) {
  const match = /(?:github\.com[/:])([^/]+\/[^/.]+)(?:\.git)?$/u.exec(url ?? '');
  if (!match) throw new Error(`Unsupported GitHub source repository: ${url}`);
  return match[1];
}

function runCommand(runner, executable, arguments_, cwd) {
  return runner(executable, arguments_, { cwd });
}

async function inspectTag(request, repository, tag) {
  return request({
    endpoint: `repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`,
    allowNotFound: true,
  });
}

function assertExactTag(reference, record) {
  if (reference?.object?.sha !== record.source.commit) {
    throw new Error(`Existing tag ${record.source.tag} differs from the approved source`);
  }
}

async function inspectRelease(request, repository, tag) {
  return request({
    endpoint: `repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
    allowNotFound: true,
  });
}

function expectedReleaseAssets(record) {
  return [
    {
      ...record.candidates.desktop.artifact,
      absolutePath: null,
    },
    {
      ...record.publication.outputs.checksums,
      absolutePath: null,
    },
  ];
}

function assertReleaseIdentity(release, record, expectedAssets, { allowMissing = false } = {}) {
  if (
    release?.tag_name !== record.source.tag
    || release.prerelease !== (record.channel === 'rc')
    || release.target_commitish !== record.source.commit
  ) {
    throw new Error(`Existing GitHub release differs from ${record.source.tag}`);
  }
  const actual = new Map((release.assets ?? []).map((asset) => [asset.name, asset]));
  for (const expected of expectedAssets) {
    const asset = actual.get(expected.filename);
    if (!asset && allowMissing) continue;
    if (
      asset?.size !== expected.bytes
      || asset?.digest !== `sha256:${expected.sha256}`
    ) {
      throw new Error(`Existing GitHub asset differs: ${expected.filename}`);
    }
    actual.delete(expected.filename);
  }
  if (actual.size > 0) {
    throw new Error(`Existing GitHub release has unapproved assets: ${[...actual.keys()].join(', ')}`);
  }
}

function createTagAdapter({ request, repository }) {
  return {
    async preflight(record) {
      const existing = await inspectTag(request, repository, record.source.tag);
      if (existing) assertExactTag(existing, record);
    },
    async converge({ record }) {
      let reference = await inspectTag(request, repository, record.source.tag);
      if (reference === null) {
        reference = await request({
          method: 'POST',
          endpoint: `repos/${repository}/git/refs`,
          body: {
            ref: `refs/tags/${record.source.tag}`,
            sha: record.source.commit,
          },
        });
      }
      assertExactTag(reference, record);
      return { identity: `refs/tags/${record.source.tag}@${record.source.commit}` };
    },
  };
}

function createPluginAdapter({ repositoryRoot, runner }) {
  return {
    async preflight() {},
    async converge({ record }) {
      let verification = await verifyMarketplaceRelease({
        repositoryRoot,
        tag: record.source.tag,
        runner,
      });
      if (!verification.complete) {
        await watchRelease({
          repositoryRoot,
          tag: record.source.tag,
          runner,
          json: true,
          attempts: 30,
          delayMs: 2_000,
        });
        verification = await verifyMarketplaceRelease({
          repositoryRoot,
          tag: record.source.tag,
          runner,
        });
      }
      if (
        !verification.complete
        || verification.release?.sourceCommit !== record.source.commit
        || typeof verification.marketplaceCommit !== 'string'
      ) {
        throw new Error(`Plugin marketplace publication is incomplete for ${record.source.tag}`);
      }
      return { identity: `marketplace@${verification.marketplaceCommit}` };
    },
  };
}

function createDesktopAdapter({ request, runner, repository, repositoryRoot, workspaceRoot }) {
  const assetsFor = (record) => expectedReleaseAssets(record).map((asset) => ({
    ...asset,
    absolutePath: resolve(workspaceRoot, asset.path),
  }));
  return {
    async preflight(record) {
      const existing = await inspectRelease(request, repository, record.source.tag);
      if (existing) {
        assertReleaseIdentity(existing, record, assetsFor(record), { allowMissing: true });
      }
    },
    async converge({ record }) {
      const assets = assetsFor(record);
      let release = await inspectRelease(request, repository, record.source.tag);
      if (release === null) {
        runCommand(runner, 'gh', [
          'release',
          'create',
          record.source.tag,
          '--repo',
          repository,
          '--target',
          record.source.commit,
          '--verify-tag',
          '--title',
          `GateReeve ${record.version}`,
          '--notes-file',
          resolve(workspaceRoot, 'publication-plan.md'),
          ...(record.channel === 'rc' ? ['--prerelease'] : []),
          ...assets.map((asset) => asset.absolutePath),
        ], repositoryRoot);
      } else {
        assertReleaseIdentity(release, record, assets, { allowMissing: true });
        const actualNames = new Set((release.assets ?? []).map((asset) => asset.name));
        const missing = assets.filter((asset) => !actualNames.has(asset.filename));
        if (missing.length > 0) {
          runCommand(runner, 'gh', [
            'release',
            'upload',
            record.source.tag,
            '--repo',
            repository,
            ...missing.map((asset) => asset.absolutePath),
          ], repositoryRoot);
        }
      }
      release = await inspectRelease(request, repository, record.source.tag);
      assertReleaseIdentity(release, record, assets);
      return { identity: release.html_url };
    },
  };
}

function createManifestAdapter({ request, repository, workspaceRoot, planSha256 }) {
  const expectedPath = resolve(
    workspaceRoot,
    'publication',
    'desktop.json'
  );
  return {
    async preflight(record) {
      await preflightPublicationRepository({ request, repository, baseBranch: 'main' });
      const expected = await readFile(expectedPath, 'utf8');
      assertDesktopReleaseManifest(JSON.parse(expected));
      if (sha256(expected) !== record.publication.outputs.updateManifest.sha256) {
        throw new Error('Approved update manifest output changed');
      }
      const current = await readRepositoryFile({
        request,
        repository,
        path: MANIFEST_PATH,
        reference: 'main',
      });
      assertDesktopReleaseManifest(JSON.parse(current.content));
      const currentSha256 = sha256(current.content);
      if (
        currentSha256 !== record.publication.inputs.updateManifest.sha256
        && currentSha256 !== record.publication.outputs.updateManifest.sha256
      ) {
        throw new Error('Remote update manifest changed after the approved release was prepared');
      }
    },
    async converge({ record }) {
      const content = await readFile(expectedPath, 'utf8');
      return publishRepositoryFileViaPullRequest({
        request,
        repository,
        baseBranch: 'main',
        version: record.version,
        sourceCommit: record.source.commit,
        planSha256,
        title: `Publish GateReeve ${record.version} Desktop update metadata`,
        path: MANIFEST_PATH,
        content,
        fileSha256: record.publication.outputs.updateManifest.sha256,
      });
    },
  };
}

function createWebsiteAdapter({ fetchFn, sleep, attempts, intervalMilliseconds, workspaceRoot }) {
  return {
    async preflight() {
      const response = await fetchFn('https://gatereeve.pages.dev/', {
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`GateReeve website returned ${response.status}`);
    },
    async converge({ record }) {
      const expected = await readFile(resolve(workspaceRoot, 'publication', 'desktop.json'), 'utf8');
      return waitForEarlyAccessManifest({
        fetchFn,
        sleep,
        attempts,
        intervalMilliseconds,
        expected,
        tag: record.source.tag,
      });
    },
  };
}

export async function readBoundedText(response, maximumBytes = MAX_WEB_BYTES) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new Error('Early Access response is too large');
  }
  if (!response.body?.getReader) {
    const content = await response.text();
    if (Buffer.byteLength(content) > maximumBytes) {
      throw new Error('Early Access response is too large');
    }
    return content;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel('Early Access response is too large');
      throw new Error('Early Access response is too large');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function waitForEarlyAccessManifest({
  fetchFn,
  expected,
  tag,
  sleep,
  attempts,
  intervalMilliseconds,
}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchFn(MANIFEST_URL, {
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      const content = await readBoundedText(response);
      if (response.ok && content === expected) {
        const releasePage = `${RELEASES_URL}/tag/${tag}`;
        return { identity: `${MANIFEST_URL}#${sha256(content)} -> ${releasePage}` };
      }
    } catch {
      // A deployment transition is retryable until the bounded attempt limit.
    }
    if (attempt < attempts) await sleep(intervalMilliseconds);
  }
  throw new Error(`Early Access website did not serve ${tag} in time`);
}

export async function publishCoordinatedRelease({
  recordPath,
  repositoryRoot,
  planSha256: approvedPlanSha256,
  approvedBy,
  confirm = false,
  dryRun = false,
  request = requestGitHubApi,
  runner = defaultCommandRunner,
  fetchFn = globalThis.fetch,
  sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
  websiteAttempts = 60,
  websiteIntervalMilliseconds = 5_000,
  now = () => new Date(),
}) {
  let record = await verifyCoordinatedReleaseWorkspace(recordPath);
  const workspaceRoot = dirname(resolve(recordPath));
  const repository = repositoryName(record.source.repository);
  const exactPlanSha256 = publicationPlanSha256(record);
  if (approvedPlanSha256 !== exactPlanSha256) {
    throw new Error(`Publication plan digest differs; expected ${exactPlanSha256}`);
  }
  if (record.publication.outputs.updateManifest === null) {
    throw new Error('Public publication requires an immutable trusted update manifest output');
  }
  const adapters = {
    tag: createTagAdapter({ request, repository }),
    pluginMarketplace: createPluginAdapter({ repositoryRoot, runner }),
    desktopPrerelease: createDesktopAdapter({
      request,
      runner,
      repository,
      repositoryRoot,
      workspaceRoot,
    }),
    updateManifest: createManifestAdapter({
      request,
      repository,
      workspaceRoot,
      planSha256: exactPlanSha256,
    }),
    earlyAccessWebsite: createWebsiteAdapter({
      fetchFn,
      sleep,
      attempts: websiteAttempts,
      intervalMilliseconds: websiteIntervalMilliseconds,
      workspaceRoot,
    }),
  };
  for (const surface of record.publication.order) {
    await adapters[surface].preflight(record);
  }
  if (dryRun) {
    return { dryRun: true, record, planSha256: exactPlanSha256 };
  }
  if (record.publication.approval.state === 'unapproved') {
    if (!confirm) {
      throw new Error(`Publication requires exact approval of plan ${exactPlanSha256}`);
    }
    record = approveCoordinatedPublication(record, {
      approvedBy,
      planSha256: exactPlanSha256,
    }, now);
    await writeCoordinatedRelease(recordPath, record);
  } else {
    assertCoordinatedRelease(record);
  }
  const published = await convergeCoordinatedPublication({
    recordPath,
    adapters,
    now,
  });
  return { dryRun: false, record: published, planSha256: exactPlanSha256 };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
