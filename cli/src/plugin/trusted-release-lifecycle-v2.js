import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

import {
  advanceReleaseStageV2,
  bindAppleArtifactV2,
  createReleaseLifecycleV2,
} from './release-lifecycle-v2.js';
import {
  assertNativeTrustAggregateV2,
  trustDigest,
} from './native-trust-evidence-v2.js';

const SHA256 = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const TEAM_ID = /^[A-Z0-9]{10}$/u;

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function fileIdentity(path) {
  const content = await readFile(path);
  const details = await stat(path);
  return {
    filename: path.split(sep).at(-1),
    bytes: details.size,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

async function inventoryTree(root) {
  const resolvedRoot = resolve(root);
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Trusted release inputs must not contain symbolic links: ${path}`);
      }
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const identity = await fileIdentity(path);
        files.push({ ...identity, path: relative(resolvedRoot, path).split(sep).join('/') });
      } else throw new Error(`Unsupported trusted release input: ${path}`);
    }
  }
  await visit(resolvedRoot);
  if (files.length === 0) throw new Error('Trusted release Plugin candidate is empty');
  return {
    files,
    sha256: createHash('sha256').update(stableJson(files)).digest('hex'),
  };
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
  appleTrust,
  nativeAggregate,
  now = () => new Date(),
}) {
  assertTrustedInputs({ source, appleTrust, nativeAggregate });
  const plugin = await inventoryTree(pluginRoot);
  let record = createReleaseLifecycleV2({ source, now });
  record = advanceReleaseStageV2(record, 'policy-resolved', {
    trustEnvironment: 'release-trust',
    publicationAuthority: false,
    topology: { plugin: true, desktop: 'universal-dmg', nativeAuthorities: ['arm64', 'x64'] },
  }, now);
  record = advanceReleaseStageV2(record, 'plugin-candidate-built', {
    treeSha256: plugin.sha256,
    files: plugin.files,
  }, now);
  record = advanceReleaseStageV2(record, 'universal-desktop-packaged', {
    submittedArtifact: appleTrust.submittedArtifact,
  }, now);
  record = advanceReleaseStageV2(record, 'artifact-digests-established', {
    pluginTreeSha256: plugin.sha256,
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
