import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { composePackages } from './compose.js';
import { writePluginCandidateIntegrity } from './plugin-candidate-integrity.js';
import { prepareLocalMarketplace } from './smoke.js';

export function parseReleaseTag(sourceTag) {
  const match = sourceTag.match(/^v([^+]+)(?:\+(.+))?$/);
  const coreAndPrerelease = match?.[1] ?? '';
  const separator = coreAndPrerelease.indexOf('-');
  const baseVersion =
    separator === -1
      ? coreAndPrerelease
      : coreAndPrerelease.slice(0, separator);
  const prerelease =
    separator === -1 ? null : coreAndPrerelease.slice(separator + 1);
  const build = match?.[2] ?? null;
  const numericIdentifier = /^(?:0|[1-9]\d*)$/;
  const validIdentifier = /^[0-9A-Za-z-]+$/;
  const baseParts = baseVersion.split('.');
  const validBase =
    baseParts.length === 3 && baseParts.every((part) => numericIdentifier.test(part));
  const prereleaseParts = prerelease?.split('.') ?? [];
  const validPrerelease =
    prerelease === null ||
    (prereleaseParts.length > 0 &&
      prereleaseParts.every(
        (part) =>
          validIdentifier.test(part) &&
          (!/^\d+$/.test(part) || numericIdentifier.test(part))
      ));
  const buildParts = build?.split('.') ?? [];
  const validBuild =
    build === null ||
    (buildParts.length > 0 && buildParts.every((part) => validIdentifier.test(part)));

  if (!match || !validBase || !validPrerelease || !validBuild) {
    throw new Error(`Release tag must be semantic and begin with v: ${sourceTag}`);
  }

  return {
    version: sourceTag.slice(1),
    baseVersion,
    prerelease,
    build,
  };
}

function stableVersion(version) {
  return parseReleaseTag(`v${version}`).prerelease === null;
}

function validateEvidence(payload, version, sourceCommit = null) {
  const finalTag = parseReleaseTag(`v${version}`);
  let candidateTag = null;
  try {
    candidateTag = parseReleaseTag(payload?.releaseCandidate ?? '');
  } catch {
    candidateTag = null;
  }
  if (
    payload?.schemaVersion !== 1 ||
    payload?.status !== 'passed' ||
    candidateTag?.baseVersion !== finalTag.baseVersion ||
    !candidateTag?.prerelease?.startsWith('rc.') ||
    typeof payload?.candidateSourceCommit !== 'string' ||
    !payload.candidateSourceCommit ||
    (sourceCommit !== null && payload.candidateSourceCommit !== sourceCommit) ||
    payload?.ubuntu?.passed !== true ||
    typeof payload?.ubuntu?.version !== 'string' ||
    !payload.ubuntu.version ||
    payload?.platforms?.codex?.passed !== true ||
    typeof payload?.platforms?.codex?.transcript !== 'string' ||
    !payload.platforms.codex.transcript ||
    payload?.platforms?.claude?.passed !== true ||
    typeof payload?.platforms?.claude?.transcript !== 'string' ||
    !payload.platforms.claude.transcript
  ) {
    throw new Error(
      `Stable v${version} requires passing Ubuntu RC evidence for both platforms`
    );
  }
  return payload;
}

export async function validateReleaseEvidence({
  sourceTag,
  ubuntuRcEvidencePath = null,
  sourceCommit = null,
}) {
  const parsed = parseReleaseTag(sourceTag);
  if (parsed.prerelease !== null) return null;
  if (!ubuntuRcEvidencePath) {
    throw new Error(`Stable v${parsed.version} requires --ubuntu-rc-evidence`);
  }
  return validateEvidence(
    JSON.parse(await readFile(resolve(ubuntuRcEvidencePath), 'utf8')),
    parsed.version,
    sourceCommit
  );
}

async function requireAbsentOrEmpty(path) {
  try {
    const entries = await readdir(path);
    if (entries.length > 0) {
      throw new Error(`Release output must be absent or empty: ${path}`);
    }
    await rm(path, { recursive: true, force: false });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export async function prepareRelease({
  sourceRoot,
  outputRoot,
  sourceTag,
  sourceCommit,
  ubuntuRcEvidencePath = null,
  integrityManifestPath = null,
}) {
  const version = parseReleaseTag(sourceTag).version;
  if (!sourceCommit?.trim()) {
    throw new Error('Release source commit must be non-empty');
  }

  const ubuntuRcEvidence = await validateReleaseEvidence({
    sourceTag,
    ubuntuRcEvidencePath,
    sourceCommit,
  });

  const output = resolve(outputRoot);
  await requireAbsentOrEmpty(output);
  await mkdir(dirname(output), { recursive: true });
  const stagingParent = await mkdtemp(resolve(dirname(output), '.workflow-release-'));
  const distRoot = resolve(stagingParent, 'dist');
  const releaseRoot = resolve(stagingParent, 'release');

  try {
    const build = await composePackages({
      sourceRoot: resolve(sourceRoot),
      distRoot,
      platforms: ['codex', 'claude'],
      version,
      sourceCommit,
      sourceTag,
    });
    await prepareLocalMarketplace({
      sourceRoot: resolve(sourceRoot),
      distRoot,
      marketplaceRoot: releaseRoot,
    });
    await writeFile(
      resolve(releaseRoot, 'RELEASE.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          plugin: 'agentic-development-workflow',
          marketplace: 'quality-code',
          version,
          sourceTag,
          sourceCommit,
          ubuntuRcEvidence: ubuntuRcEvidence
            ? {
                releaseCandidate: ubuntuRcEvidence.releaseCandidate,
                candidateSourceCommit: ubuntuRcEvidence.candidateSourceCommit,
                ubuntuVersion: ubuntuRcEvidence.ubuntu.version,
              }
            : null,
        },
        null,
        2
      )}\n`
    );
    await rename(releaseRoot, output);
    let integrity = null;
    try {
      integrity = integrityManifestPath
        ? await writePluginCandidateIntegrity({
            pluginRoot: output,
            integrityPath: integrityManifestPath,
            sourceTag,
            sourceCommit,
          })
        : null;
    } catch (error) {
      await rm(output, { recursive: true, force: true });
      throw error;
    }
    return {
      schemaVersion: 1,
      outputRoot: output,
      version,
      sourceTag,
      sourceCommit,
      stable: stableVersion(version),
      packageCount: build.packages.length,
      fileCounts: Object.fromEntries(
        build.packages.map((item) => [item.platform, item.fileCount])
      ),
      integrity: integrity
        ? { path: integrity.path, bytes: integrity.bytes, sha256: integrity.sha256 }
        : null,
    };
  } finally {
    await rm(stagingParent, { recursive: true, force: true });
  }
}
