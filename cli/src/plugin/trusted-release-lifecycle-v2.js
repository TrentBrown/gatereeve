import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  advanceReleaseStageV2,
  bindAppleArtifactV2,
  createReleaseLifecycleV2,
} from './release-lifecycle-v2.js';
import {
  assertNativeTrustAggregateV2,
  trustDigest,
} from './native-trust-evidence-v2.js';
import { verifyPluginCandidateIntegrity } from './plugin-candidate-integrity.js';
import { validateDeployedRelease } from './release-version.js';

const SHA256 = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const TEAM_ID = /^[A-Z0-9]{10}$/u;

async function assertPluginCandidateIdentity(root, source) {
  let metadata;
  try {
    metadata = JSON.parse(await readFile(resolve(root, 'RELEASE.json'), 'utf8'));
  } catch (error) {
    throw new Error('Trusted release Plugin candidate is missing valid RELEASE.json metadata', {
      cause: error,
    });
  }
  let release;
  try {
    release = validateDeployedRelease(metadata);
  } catch (error) {
    throw new Error('Trusted release Plugin candidate metadata is invalid', { cause: error });
  }
  if (
    release.tag !== source.tag
    || release.version !== source.tag.slice(1)
    || release.sourceCommit !== source.commit
  ) {
    throw new Error('Trusted release Plugin candidate does not match the exact tag and source commit');
  }
  return release;
}

function assertArtifact(value, label) {
  if (
    typeof value?.filename !== 'string'
    || value.filename === ''
    || value.filename.includes('/')
    || value.filename.includes('\\')
    || !Number.isSafeInteger(value.bytes)
    || value.bytes < 1
    || !SHA256.test(value.sha256 ?? '')
  ) throw new Error(`${label} identity is invalid`);
  return value;
}

function assertTrustedInputs({ source, appleTrust, nativeAggregate }) {
  if (
    appleTrust?.schemaVersion !== 2
    || appleTrust.kind !== 'gatereeve-apple-trust'
    || appleTrust.status !== 'developer-id-notarized'
    || appleTrust?.source?.tag !== source.tag
    || appleTrust.source.commit !== source.commit
    || appleTrust?.candidate?.id !== `gatereeve-${source.tag}`
    || appleTrust.candidate.version !== source.tag.slice(1)
    || appleTrust.candidate.sourceCommit !== source.commit
    || typeof appleTrust.signature?.identity !== 'string'
    || !appleTrust.signature.identity.startsWith('Developer ID Application: ')
    || !TEAM_ID.test(appleTrust.signature.teamId ?? '')
    || !appleTrust.signature.identity.endsWith(` (${appleTrust.signature.teamId})`)
    || appleTrust.signature.hardenedRuntime !== true
    || appleTrust.signature.secureTimestamp !== true
    || !UUID.test(appleTrust.notarization?.attemptId ?? '')
    || !UUID.test(appleTrust.notarization?.requestId ?? '')
    || appleTrust.notarization?.status !== 'Accepted'
    || appleTrust.notarization.submittedArtifactSha256 !== appleTrust.submittedArtifact?.sha256
    || appleTrust.staple?.validated !== true
    || appleTrust.gatekeeper?.diskImage !== 'accepted'
    || !Number.isFinite(Date.parse(appleTrust.verifiedAt))
  ) throw new Error('Apple trust evidence does not match the schema-v2 release source');
  assertArtifact(appleTrust.submittedArtifact, 'Submitted Apple artifact');
  assertArtifact(appleTrust.artifact, 'Final trusted Apple artifact');
  assertNativeTrustAggregateV2(nativeAggregate, appleTrust);
}

export async function buildTrustedReleaseLifecycleV2({
  source,
  pluginRoot,
  pluginIntegrityPath,
  appleTrust,
  nativeAggregate,
  now = () => new Date(),
}) {
  assertTrustedInputs({ source, appleTrust, nativeAggregate });
  const pluginRelease = await assertPluginCandidateIdentity(pluginRoot, source);
  const plugin = await verifyPluginCandidateIntegrity({
    pluginRoot,
    integrityPath: pluginIntegrityPath,
    sourceTag: source.tag,
    sourceCommit: source.commit,
  });
  let record = createReleaseLifecycleV2({ source, now });
  record = advanceReleaseStageV2(record, 'policy-resolved', {
    trustEnvironment: 'release-trust',
    publicationAuthority: false,
    topology: { plugin: true, desktop: 'universal-dmg', nativeAuthorities: ['arm64', 'x64'] },
  }, now);
  record = advanceReleaseStageV2(record, 'plugin-candidate-built', {
    release: {
      tag: pluginRelease.tag,
      version: pluginRelease.version,
      sourceCommit: pluginRelease.sourceCommit,
    },
    treeSha256: plugin.treeSha256,
    files: plugin.files,
    integrityManifest: {
      schemaVersion: plugin.manifest.schemaVersion,
      bytes: plugin.manifestBytes,
      sha256: plugin.manifestSha256,
      treeSha256: plugin.treeSha256,
    },
  }, now);
  record = advanceReleaseStageV2(record, 'universal-desktop-packaged', {
    submittedArtifact: appleTrust.submittedArtifact,
  }, now);
  record = advanceReleaseStageV2(record, 'artifact-digests-established', {
    pluginTreeSha256: plugin.treeSha256,
    submittedDmgSha256: appleTrust.submittedArtifact.sha256,
    finalTrustedDmgSha256: appleTrust.artifact.sha256,
    appleTrustEvidenceSha256: trustDigest(appleTrust),
  }, now);
  record = advanceReleaseStageV2(record, 'candidate-qualified', {
    sourceCommit: source.commit,
    candidateId: appleTrust.candidate.id,
    topology: 'plugin-plus-universal-dmg',
  }, now);
  record = bindAppleArtifactV2(record, appleTrust.artifact, now);
  record = advanceReleaseStageV2(record, 'trusted-universal-dmg-established', {
    artifact: appleTrust.artifact,
    submittedArtifact: appleTrust.submittedArtifact,
    notarization: {
      attemptId: appleTrust.notarization.attemptId,
      requestId: appleTrust.notarization.requestId,
      status: appleTrust.notarization.status,
    },
    appleTrustEvidenceSha256: trustDigest(appleTrust),
  }, now);
  record = advanceReleaseStageV2(record, 'authoritative-native-verified', {
    aggregateSha256: trustDigest(nativeAggregate),
    architectures: nativeAggregate.architectures,
    documents: nativeAggregate.documents,
  }, now);
  return advanceReleaseStageV2(record, 'desktop-trust-verified', {
    appleTrustEvidenceSha256: trustDigest(appleTrust),
    signature: appleTrust.signature,
    notarization: appleTrust.notarization,
    staple: appleTrust.staple,
    gatekeeper: appleTrust.gatekeeper,
  }, now);
}
