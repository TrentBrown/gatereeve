import { createHash } from 'node:crypto';

import { parseReleaseTag } from './release.js';

export const COORDINATED_RELEASE_SCHEMA_VERSION_V2 = 2;
export const RELEASE_STAGE_SEQUENCE_V2 = Object.freeze([
  'source-pinned',
  'policy-resolved',
  'plugin-candidate-built',
  'universal-desktop-packaged',
  'artifact-digests-established',
  'candidate-qualified',
  'trusted-universal-dmg-established',
  'authoritative-native-verified',
  'desktop-trust-verified',
  'distribution-finalized',
  'publication-approved',
  'published',
]);

const COMMIT = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireTimestamp(value, label) {
  requireString(value, label);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
  return value;
}

function assertArtifact(value, label = 'Apple-bound artifact') {
  if (
    typeof value?.filename !== 'string'
    || value.filename === ''
    || value.filename.includes('/')
    || value.filename.includes('\\')
    || !Number.isSafeInteger(value.bytes)
    || value.bytes < 1
    || !SHA256.test(value.sha256 ?? '')
  ) {
    throw new Error(`${label} identity is invalid`);
  }
  return value;
}

function artifactIdentity(value) {
  return { filename: value.filename, bytes: value.bytes, sha256: value.sha256 };
}

function sourceIdentity(value) {
  return { repository: value?.repository, commit: value?.commit, tag: value?.tag };
}

function hasExactKeys(value, keys) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function assertEvidence(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Release stage evidence must be an object');
  }
  return value;
}

function stageDigest(record, entry) {
  return digest({
    releaseId: record.releaseId,
    version: record.version,
    channel: record.channel,
    source: sourceIdentity(record.source),
    reservedAt: record.candidate.reservation.reservedAt,
    sequence: entry.sequence,
    stage: entry.stage,
    completedAt: entry.completedAt,
    evidenceSha256: entry.evidenceSha256,
    previousStageSha256: entry.previousStageSha256,
  });
}

function appendStage(record, stage, evidence, now) {
  const next = structuredClone(record);
  const completedAt = now().toISOString();
  const entry = {
    sequence: next.stages.length + 1,
    stage,
    completedAt,
    evidence: structuredClone(assertEvidence(evidence)),
    evidenceSha256: digest(evidence),
    previousStageSha256: next.stages.at(-1)?.stageSha256 ?? null,
  };
  entry.stageSha256 = stageDigest(next, entry);
  next.stages.push(entry);
  next.updatedAt = completedAt;
  return next;
}

export function createReleaseLifecycleV2({ source, now = () => new Date() }) {
  const parsed = parseReleaseTag(source?.tag ?? '');
  if (!COMMIT.test(source?.commit ?? '')) {
    throw new Error('Release source commit must be a full lowercase Git SHA');
  }
  requireString(source?.repository, 'Release source repository');
  const normalizedSource = sourceIdentity(source);
  const createdAt = now().toISOString();
  const record = {
    schemaVersion: COORDINATED_RELEASE_SCHEMA_VERSION_V2,
    kind: 'gatereeve-coordinated-release',
    releaseId: `gatereeve-v${parsed.version}`,
    version: parsed.version,
    channel: parsed.prerelease === null ? 'stable' : 'rc',
    source: normalizedSource,
    candidate: {
      id: `gatereeve-v${parsed.version}`,
      version: parsed.version,
      sourceCommit: source.commit,
      reservation: { state: 'reserved', reservedAt: createdAt },
      appleArtifact: null,
    },
    stages: [],
    createdAt,
    updatedAt: createdAt,
  };
  const initialized = appendStage(record, 'source-pinned', { source: normalizedSource }, now);
  initialized.createdAt = createdAt;
  return assertReleaseLifecycleV2(initialized);
}

export function assertReleaseLifecycleV2(value) {
  if (value?.schemaVersion !== COORDINATED_RELEASE_SCHEMA_VERSION_V2) {
    throw new Error('Release lifecycle must use schema version 2');
  }
  if (value.kind !== 'gatereeve-coordinated-release') {
    throw new Error('Release lifecycle kind is invalid');
  }
  const parsed = parseReleaseTag(value?.source?.tag ?? '');
  const normalizedSource = sourceIdentity(value.source);
  if (
    value.releaseId !== `gatereeve-v${parsed.version}`
    || value.version !== parsed.version
    || value.channel !== (parsed.prerelease === null ? 'stable' : 'rc')
    || !COMMIT.test(value?.source?.commit ?? '')
    || typeof value.source.repository !== 'string'
    || value.source.repository === ''
    || !hasExactKeys(value.source, ['repository', 'commit', 'tag'])
    || value?.candidate?.id !== value.releaseId
    || value.candidate.version !== value.version
    || value.candidate.sourceCommit !== value.source.commit
    || !['reserved', 'apple-bound'].includes(value?.candidate?.reservation?.state)
  ) {
    throw new Error('Release lifecycle identity is internally inconsistent');
  }
  requireTimestamp(value.createdAt, 'Release creation time');
  requireTimestamp(value.updatedAt, 'Release update time');
  requireTimestamp(value.candidate.reservation.reservedAt, 'Candidate reservation time');
  if (
    !Array.isArray(value.stages)
    || value.stages.length < 1
    || value.stages.length > RELEASE_STAGE_SEQUENCE_V2.length
  ) {
    throw new Error('Release stages must form an ordered prefix');
  }
  let previousStageSha256 = null;
  value.stages.forEach((entry, index) => {
    if (
      entry?.sequence !== index + 1
      || entry.stage !== RELEASE_STAGE_SEQUENCE_V2[index]
      || entry.previousStageSha256 !== previousStageSha256
      || !SHA256.test(entry.evidenceSha256 ?? '')
      || digest(assertEvidence(entry.evidence)) !== entry.evidenceSha256
    ) {
      throw new Error('Release stages must form an ordered prefix with immutable evidence');
    }
    requireTimestamp(entry.completedAt, `Release stage ${entry.stage} completion time`);
    if (stageDigest(value, entry) !== entry.stageSha256) {
      throw new Error(`Release stage digest is invalid for ${entry.stage}`);
    }
    previousStageSha256 = entry.stageSha256;
  });
  const pinnedSource = value.stages[0].evidence?.source;
  if (!hasExactKeys(pinnedSource, ['repository', 'commit', 'tag'])
    || digest(pinnedSource) !== digest(normalizedSource)) {
    throw new Error('Source-pinned stage does not match the release identity');
  }
  const currentStageIndex = value.stages.length - 1;
  const qualifiedIndex = RELEASE_STAGE_SEQUENCE_V2.indexOf('candidate-qualified');
  const trustedIndex = RELEASE_STAGE_SEQUENCE_V2.indexOf('trusted-universal-dmg-established');
  if (value.candidate.appleArtifact === null) {
    if (value.candidate.reservation.state !== 'reserved' || currentStageIndex >= trustedIndex) {
      throw new Error('Trusted release stages require immutable Apple-bound bytes');
    }
  } else {
    assertArtifact(value.candidate.appleArtifact, 'Candidate Apple artifact');
    requireTimestamp(value.candidate.appleArtifact.boundAt, 'Apple artifact binding time');
    if (
      value.candidate.appleArtifact.bindingSha256 !== digest({
        releaseId: value.releaseId,
        source: normalizedSource,
        artifact: artifactIdentity(value.candidate.appleArtifact),
        boundAt: value.candidate.appleArtifact.boundAt,
      })
    ) {
      throw new Error('Candidate Apple artifact binding digest is invalid');
    }
    if (value.candidate.reservation.state !== 'apple-bound' || currentStageIndex < qualifiedIndex) {
      throw new Error('Candidate Apple artifact was bound outside the qualified lifecycle');
    }
  }
  if (currentStageIndex >= trustedIndex) {
    const evidence = value.stages[trustedIndex].evidence;
    if (
      JSON.stringify(artifactIdentity(evidence.artifact ?? {}))
      !== JSON.stringify(artifactIdentity(value.candidate.appleArtifact))
    ) {
      throw new Error('Trusted universal DMG stage does not match Apple-bound bytes');
    }
  }
  const lastMutationAt = value.candidate.appleArtifact !== null
    && Date.parse(value.candidate.appleArtifact.boundAt) > Date.parse(value.stages.at(-1).completedAt)
    ? value.candidate.appleArtifact.boundAt
    : value.stages.at(-1).completedAt;
  if (value.updatedAt !== lastMutationAt) {
    throw new Error('Release update time does not match the latest append');
  }
  return value;
}

export function advanceReleaseStageV2(record, stage, evidence, now = () => new Date()) {
  assertReleaseLifecycleV2(record);
  const stageIndex = RELEASE_STAGE_SEQUENCE_V2.indexOf(stage);
  if (stageIndex === -1) throw new Error(`Unknown release stage: ${stage}`);
  const expected = RELEASE_STAGE_SEQUENCE_V2[record.stages.length];
  if (stage !== expected) {
    throw new Error(`Release lifecycle expected ${expected ?? 'no further stage'}, received ${stage}`);
  }
  if (stage === 'trusted-universal-dmg-established') {
    if (record.candidate.appleArtifact === null) {
      throw new Error('Trusted universal DMG stage requires Apple-bound bytes');
    }
    if (
      JSON.stringify(artifactIdentity(evidence?.artifact ?? {}))
      !== JSON.stringify(artifactIdentity(record.candidate.appleArtifact))
    ) {
      throw new Error('Trusted universal DMG evidence does not match Apple-bound bytes');
    }
  }
  return assertReleaseLifecycleV2(appendStage(record, stage, evidence, now));
}

export function bindAppleArtifactV2(record, artifact, now = () => new Date()) {
  assertReleaseLifecycleV2(record);
  const nextArtifact = artifactIdentity(assertArtifact(artifact));
  const qualifiedIndex = RELEASE_STAGE_SEQUENCE_V2.indexOf('candidate-qualified');
  if (record.stages.length - 1 < qualifiedIndex) {
    throw new Error('Apple-bound bytes require a qualified candidate');
  }
  if (record.candidate.appleArtifact !== null) {
    const existing = { ...record.candidate.appleArtifact };
    delete existing.boundAt;
    delete existing.bindingSha256;
    if (JSON.stringify(existing) !== JSON.stringify(nextArtifact)) {
      throw new Error('The candidate version is already bound to different Apple bytes');
    }
    return structuredClone(record);
  }
  const next = structuredClone(record);
  next.candidate.reservation.state = 'apple-bound';
  const boundAt = now().toISOString();
  next.candidate.appleArtifact = {
    ...nextArtifact,
    boundAt,
    bindingSha256: digest({
      releaseId: next.releaseId,
      source: sourceIdentity(next.source),
      artifact: nextArtifact,
      boundAt,
    }),
  };
  next.updatedAt = next.candidate.appleArtifact.boundAt;
  return assertReleaseLifecycleV2(next);
}

export function assertMutableReleaseRecord(value) {
  if (value?.schemaVersion === 1) {
    throw new Error('Published and existing schema-v1 records are read-only');
  }
  return assertReleaseLifecycleV2(value);
}

export function dispatchReleaseRecordSchema(value, { assertLegacy } = {}) {
  if (value?.schemaVersion === 1) {
    if (typeof assertLegacy !== 'function') {
      throw new Error('Schema-v1 inspection requires an explicit legacy validator');
    }
    assertLegacy(value);
    return { schemaVersion: 1, mode: 'read-only-v1', record: value };
  }
  if (value?.schemaVersion === COORDINATED_RELEASE_SCHEMA_VERSION_V2) {
    return { schemaVersion: 2, mode: 'mutable-v2', record: assertReleaseLifecycleV2(value) };
  }
  throw new Error(`Unsupported release record schema: ${value?.schemaVersion ?? 'missing'}`);
}
