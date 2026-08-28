import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  predecessorCask,
  smokeHomebrewCask,
} from '../../apps/desktop/scripts/smoke-homebrew-cask.mjs';
import {
  assertHomebrewCaskRecord,
  HOMEBREW_CASK_PATH,
  homebrewCaskPlanSha256,
  publishHomebrewCask,
  renderHomebrewCask,
  renderHomebrewCaskPublicationPlan,
  verifyHomebrewCaskWorkspace,
} from '../src/plugin/homebrew-cask.js';

const sourceCommit = '117a58511ef20957426d3fc5e801f6d5b1173b32';
const desktopSha256 = '9cbe51065692857ba929e153863fa92c8fe2dc4d275eb29453014a04e1f1ea92';

function sourceRecord() {
  return {
    schemaVersion: 1,
    releaseId: 'gatereeve-v0.1.0-rc.1',
    version: '0.1.0-rc.1',
    channel: 'rc',
    source: {
      repository: 'https://github.com/TrentBrown/gatereeve',
      commit: sourceCommit,
      tag: 'v0.1.0-rc.1',
    },
    promotion: null,
    state: 'prepared',
    candidates: {
      plugin: {
        artifact: { path: 'plugin/marketplace', fileCount: 1, sha256: '1'.repeat(64) },
        verification: { status: 'passed' },
      },
      desktop: {
        applicationVersion: '0.1.0-rc.1',
        artifact: {
          path: 'desktop/GateReeve-0.1.0-rc.1-macos-universal.dmg',
          filename: 'GateReeve-0.1.0-rc.1-macos-universal.dmg',
          bytes: 246098110,
          sha256: desktopSha256,
        },
        verification: {
          status: 'passed',
          architectures: ['arm64', 'x64'],
          evidence: [
            { architecture: 'arm64', path: 'evidence/desktop-arm64.json', sha256: '2'.repeat(64) },
            { architecture: 'x64', path: 'evidence/desktop-x64.json', sha256: '3'.repeat(64) },
          ],
        },
        trust: {
          status: 'developer-id-notarized',
          identity: 'Developer ID Application: Trent Brown (PMWYD5A82A)',
          teamId: 'PMWYD5A82A',
          hardenedRuntime: true,
          secureTimestamp: true,
          notarizationId: '575a7de0-0e6c-4b42-a6af-fca52d709eb8',
          notarizationStatus: 'Accepted',
          stapled: true,
          gatekeeperAccepted: true,
          evidence: [
            'codesign:Developer ID Application: Trent Brown (PMWYD5A82A)',
            'notarytool:575a7de0-0e6c-4b42-a6af-fca52d709eb8',
            'stapler:validated',
            'spctl:accepted',
          ],
        },
      },
    },
    publication: {
      order: ['tag', 'pluginMarketplace', 'desktopPrerelease', 'updateManifest', 'earlyAccessWebsite'],
      approval: { state: 'unapproved' },
      inputs: {
        updateManifest: {
          path: 'publication/desktop.base.json',
          filename: 'desktop.base.json',
          bytes: 1,
          sha256: '4'.repeat(64),
        },
      },
      outputs: {
        checksums: {
          path: 'publication/SHA256SUMS',
          filename: 'SHA256SUMS',
          bytes: 1,
          sha256: '5'.repeat(64),
        },
        updateManifest: {
          path: 'publication/desktop.json',
          filename: 'desktop.json',
          bytes: 1,
          sha256: '6'.repeat(64),
        },
      },
      surfaces: Object.fromEntries(
        ['tag', 'pluginMarketplace', 'desktopPrerelease', 'updateManifest', 'earlyAccessWebsite']
          .map((surface) => [surface, { state: 'pending', receipt: null }])
      ),
    },
    createdAt: '2026-08-28T15:14:01.037Z',
    updatedAt: '2026-08-28T15:14:01.037Z',
  };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function caskRecord(source = sourceRecord()) {
  const content = renderHomebrewCask(source);
  return {
    schemaVersion: 1,
    caskReleaseId: 'gatereeve-cask-v0.1.0-rc.1',
    version: '0.1.0-rc.1',
    channel: 'rc',
    source: structuredClone(source.source),
    desktop: {
      filename: source.candidates.desktop.artifact.filename,
      bytes: source.candidates.desktop.artifact.bytes,
      sha256: source.candidates.desktop.artifact.sha256,
      url: 'https://github.com/TrentBrown/gatereeve/releases/download/v0.1.0-rc.1/GateReeve-0.1.0-rc.1-macos-universal.dmg',
      trust: structuredClone(source.candidates.desktop.trust),
    },
    directInstallation: {
      status: 'passed',
      confirmedBy: 'Trent Brown',
      confirmedAt: '2026-08-28T16:00:00.000Z',
    },
    cask: {
      repository: 'TrentBrown/homebrew-gatereeve',
      tap: 'TrentBrown/gatereeve',
      token: 'gatereeve',
      path: HOMEBREW_CASK_PATH,
      outputPath: HOMEBREW_CASK_PATH,
      sha256: sha256(content),
      createRepositoryIfAbsent: true,
    },
    state: 'prepared',
    publication: {
      approval: { state: 'unapproved' },
      surface: { state: 'pending', receipt: null },
    },
    createdAt: '2026-08-28T16:01:00.000Z',
    updatedAt: '2026-08-28T16:01:00.000Z',
  };
}

async function packetFixture() {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve cask packet '));
  const source = sourceRecord();
  const record = caskRecord(source);
  await mkdir(join(root, 'Casks'));
  await writeFile(join(root, HOMEBREW_CASK_PATH), renderHomebrewCask(source));
  await writeFile(join(root, 'source-release-record.json'), `${JSON.stringify(source, null, 2)}\n`);
  await writeFile(join(root, 'cask-record.json'), `${JSON.stringify(record, null, 2)}\n`);
  await writeFile(join(root, 'publication-plan.md'), renderHomebrewCaskPublicationPlan(record));
  return { root, record, recordPath: join(root, 'cask-record.json') };
}

test('renders one checksum-pinned Cask for the exact approved universal DMG', () => {
  const content = renderHomebrewCask(sourceRecord());
  assert.match(content, /^cask "gatereeve" do$/mu);
  assert.match(content, new RegExp(`sha256 "${desktopSha256}"`, 'u'));
  assert.match(content, /GateReeve-0\.1\.0-rc\.1-macos-universal\.dmg/u);
  assert.match(content, /app "GateReeve\.app"/u);
  assert.match(content, /Plugin is required/u);
  assert.match(content, /installs\n    neither the Plugin nor the optional GateReeve CLI/u);
  assert.doesNotMatch(content, /pkg |binary |installer package/iu);
});

test('binds tap creation, exact Cask bytes, and direct-install proof to one plan', () => {
  const record = caskRecord();
  assert.doesNotThrow(() => assertHomebrewCaskRecord(record));
  assert.match(renderHomebrewCaskPublicationPlan(record), /create publicly if absent/u);
  assert.match(homebrewCaskPlanSha256(record), /^[a-f0-9]{64}$/u);
  const unsafe = structuredClone(record);
  unsafe.cask.path = 'Casks/other.rb';
  assert.throws(() => assertHomebrewCaskRecord(unsafe), /destination is invalid/u);
  const unproven = structuredClone(record);
  unproven.directInstallation.status = 'assumed';
  assert.throws(() => assertHomebrewCaskRecord(unproven), /installation proof/u);
});

test('verifies packet identity and performs an absent-tap dry run without mutation', async () => {
  const fixture = await packetFixture();
  await assert.doesNotReject(verifyHomebrewCaskWorkspace(fixture.recordPath));
  const mutations = [];
  const result = await publishHomebrewCask({
    recordPath: fixture.recordPath,
    planSha256: homebrewCaskPlanSha256(fixture.record),
    dryRun: true,
    request: async (request) => {
      if (request.method && request.method !== 'GET') mutations.push(request);
      if (request.endpoint.includes('/releases/tags/')) {
        return {
          tag_name: fixture.record.source.tag,
          prerelease: true,
          target_commitish: fixture.record.source.commit,
          assets: [{
            name: fixture.record.desktop.filename,
            size: fixture.record.desktop.bytes,
            digest: `sha256:${fixture.record.desktop.sha256}`,
          }],
        };
      }
      if (request.endpoint === 'repos/TrentBrown/homebrew-gatereeve') return null;
      throw new Error(`Unexpected request: ${request.endpoint}`);
    },
  });
  assert.equal(result.dryRun, true);
  assert.equal(result.tapState, 'absent');
  assert.deepEqual(mutations, []);
});

test('models an upgrade from a predecessor while preserving exact download bytes', () => {
  const exact = renderHomebrewCask(sourceRecord());
  const predecessor = predecessorCask(exact);
  assert.match(predecessor, /version "0\.1\.0-rc\.0"/u);
  assert.doesNotMatch(predecessor, /version "0\.1\.0-rc\.1"/u);
  assert.equal(
    predecessor.match(/^  sha256 .*$/mu)?.[0],
    exact.match(/^  sha256 .*$/mu)?.[0],
  );
  assert.equal(
    predecessor.match(/^  url .*$/mu)?.[0],
    exact.match(/^  url .*$/mu)?.[0],
  );
});

test('rejects architecture labels that do not match the native smoke process', async () => {
  const wrongArchitecture = process.arch === 'x64' ? 'arm64' : 'x64';
  await assert.rejects(
    smokeHomebrewCask({
      recordPath: '/not/read/because/architecture/is/rejected.json',
      platform: 'darwin',
      architecture: wrongArchitecture,
    }),
    /Expected .* Homebrew host/u,
  );
});

test('creates the dedicated public tap only after exact approval and persists a receipt', async () => {
  const fixture = await packetFixture();
  const mutations = [];
  let tapExists = false;
  let publishedContent = null;
  let publishCalls = 0;
  const request = async (request_) => {
    if (request_.endpoint.includes('/releases/tags/')) {
      return {
        tag_name: fixture.record.source.tag,
        prerelease: true,
        target_commitish: fixture.record.source.commit,
        assets: [{
          name: fixture.record.desktop.filename,
          size: fixture.record.desktop.bytes,
          digest: `sha256:${fixture.record.desktop.sha256}`,
        }],
      };
    }
    if (request_.endpoint === 'repos/TrentBrown/homebrew-gatereeve') {
      return tapExists ? {
        full_name: 'TrentBrown/homebrew-gatereeve',
        private: false,
        default_branch: 'main',
        owner: { login: 'TrentBrown' },
      } : null;
    }
    if (request_.endpoint === 'user/repos' && request_.method === 'POST') {
      mutations.push(request_);
      tapExists = true;
      return {
        full_name: 'TrentBrown/homebrew-gatereeve',
        private: false,
        default_branch: 'main',
        owner: { login: 'TrentBrown' },
      };
    }
    if (request_.endpoint === 'repos/TrentBrown/homebrew-gatereeve/branches/main') {
      return { name: 'main' };
    }
    if (request_.endpoint.startsWith('repos/TrentBrown/homebrew-gatereeve/contents/')) {
      if (publishedContent === null) return null;
      return {
        type: 'file',
        sha: 'blob',
        content: Buffer.from(publishedContent).toString('base64'),
      };
    }
    throw new Error(`Unexpected request: ${request_.method ?? 'GET'} ${request_.endpoint}`);
  };
  const result = await publishHomebrewCask({
    recordPath: fixture.recordPath,
    planSha256: homebrewCaskPlanSha256(fixture.record),
    approvedBy: 'Trent Brown',
    confirm: true,
    request,
    publishFile: async (options) => {
      publishCalls += 1;
      assert.equal(options.repository, 'TrentBrown/homebrew-gatereeve');
      assert.equal(options.path, HOMEBREW_CASK_PATH);
      assert.equal(sha256(options.content), fixture.record.cask.sha256);
      publishedContent = options.content;
      return {
        pullRequestUrl: 'https://github.com/TrentBrown/homebrew-gatereeve/pull/1',
        mergeCommit: 'abcdef1234567890abcdef1234567890abcdef12',
      };
    },
    now: () => new Date('2026-08-28T16:05:00.000Z'),
  });
  assert.equal(result.record.state, 'published');
  assert.equal(result.record.publication.approval.approvedBy, 'Trent Brown');
  assert.equal(result.record.publication.surface.state, 'complete');
  assert.equal(publishCalls, 1);
  assert.equal(mutations.length, 1);
  assert.deepEqual(mutations[0].body, {
    name: 'homebrew-gatereeve',
    description: 'Homebrew Cask for GateReeve',
    private: false,
    auto_init: true,
    has_issues: false,
    has_projects: false,
    has_wiki: false,
  });
  const persisted = JSON.parse(await readFile(fixture.recordPath, 'utf8'));
  assert.equal(persisted.publication.surface.receipt.mergeCommit, 'abcdef1234567890abcdef1234567890abcdef12');

  const retry = await publishHomebrewCask({
    recordPath: fixture.recordPath,
    planSha256: homebrewCaskPlanSha256(result.record),
    approvedBy: 'Trent Brown',
    confirm: true,
    request,
    publishFile: async () => {
      publishCalls += 1;
      throw new Error('Completed publication must not mutate again');
    },
  });
  assert.equal(retry.record.state, 'published');
  assert.equal(publishCalls, 1);
});

test('detects changed Cask bytes inside a prepared packet', async () => {
  const fixture = await packetFixture();
  await writeFile(join(fixture.root, HOMEBREW_CASK_PATH), 'changed\n');
  await assert.rejects(verifyHomebrewCaskWorkspace(fixture.recordPath), /Cask bytes changed/u);
  assert.equal((await readFile(fixture.recordPath, 'utf8')).includes('unapproved'), true);
});
