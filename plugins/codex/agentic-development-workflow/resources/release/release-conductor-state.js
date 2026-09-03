import { createHash } from 'node:crypto';

const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const RC_TAG = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-rc\.(?:0|[1-9]\d*)$/u;
const REPOSITORY = /^[^/\s]+\/[^/\s]+$/u;

export const CONDUCTOR_STATE_KIND = 'gatereeve-release-conductor-state';
export const CONDUCTOR_STATE_SCHEMA_VERSION = 1;
export const CONDUCTOR_STAGES = Object.freeze([
  'INITIALIZED',
  'TRUST_PENDING',
  'TRUSTED',
  'PRIMARY_FINALIZED',
  'PRIMARY_REHEARSED',
  'PRIMARY_PUBLISHED',
  'WAITING_FOR_DIRECT_INSTALL',
  'CASK_FINALIZED',
  'CASK_REHEARSED',
  'CASK_PUBLISHED',
  'SMOKE_VERIFIED',
  'COMPLETE',
]);

const WAITING_STAGES = new Set([
  'TRUST_PENDING',
  'PRIMARY_REHEARSED',
  'WAITING_FOR_DIRECT_INSTALL',
  'CASK_REHEARSED',
]);

const NEXT_ACTION = Object.freeze({
  INITIALIZED: 'PREPARE_TRUST',
  TRUST_PENDING: 'APPROVE_TRUST',
  TRUSTED: 'FINALIZE_PRIMARY',
  PRIMARY_FINALIZED: 'REHEARSE_PRIMARY',
  PRIMARY_REHEARSED: 'APPROVE_PRIMARY_PUBLICATION',
  PRIMARY_PUBLISHED: 'CONFIRM_DIRECT_INSTALL',
  WAITING_FOR_DIRECT_INSTALL: 'CONFIRM_DIRECT_INSTALL',
  CASK_FINALIZED: 'REHEARSE_CASK',
  CASK_REHEARSED: 'APPROVE_CASK_PUBLICATION',
  CASK_PUBLISHED: 'VERIFY_CASK',
  SMOKE_VERIFIED: 'FINALIZE_RELEASE',
  COMPLETE: 'NONE',
});

const REQUIRED_EVIDENCE = Object.freeze({
  INITIALIZED: ['version'],
  TRUST_PENDING: ['preparationArtifact'],
  TRUSTED: ['pluginArtifact', 'trustArtifact', 'dmgSha256'],
  PRIMARY_FINALIZED: ['primaryPlanArtifact', 'primaryPlanSha256'],
  PRIMARY_REHEARSED: ['primaryRehearsalArtifact'],
  PRIMARY_PUBLISHED: ['primaryPublicationArtifact', 'primaryRecordSha256'],
  WAITING_FOR_DIRECT_INSTALL: ['publicDmgSha256'],
  CASK_FINALIZED: ['directInstallAttestation', 'caskPlanArtifact', 'caskPlanSha256'],
  CASK_REHEARSED: ['caskRehearsalArtifact'],
  CASK_PUBLISHED: ['caskPublicationArtifact', 'caskRecordSha256'],
  SMOKE_VERIFIED: ['smokeArtifacts'],
  COMPLETE: [],
});

function contract(message) {
  throw new Error(`Release conductor state is invalid: ${message}`);
}

function assertObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    contract(`${label} must be an object`);
  }
}

function assertExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    contract(`${label} keys must be exactly ${expected.join(', ')}`);
  }
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.length === 0) contract(`${label} must be a nonempty string`);
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

export function canonicalConductorJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function releaseStateSha256(value) {
  validateConductorState(value);
  return createHash('sha256').update(canonicalConductorJson(value)).digest('hex');
}

function expectedCondition(stage, failure) {
  if (failure) return 'failed';
  if (stage === 'COMPLETE') return 'complete';
  if (WAITING_STAGES.has(stage)) return 'waiting';
  return 'ready';
}

function expectedNextAction(stage, failure) {
  if (failure) return failure.retryable ? 'RESUME' : 'BURN_RC';
  return NEXT_ACTION[stage];
}

function validateRun(run) {
  assertObject(run, 'run');
  assertExactKeys(run, ['attempt', 'id', 'repository', 'workflowRef'], 'run');
  assertString(run.id, 'run.id');
  if (!/^\d+$/u.test(run.id)) contract('run.id must contain decimal digits');
  if (!Number.isSafeInteger(run.attempt) || run.attempt < 1) {
    contract('run.attempt must be a positive integer');
  }
  if (!REPOSITORY.test(run.repository ?? '')) contract('run.repository must be owner/name');
  assertString(run.workflowRef, 'run.workflowRef');
}

function validateActor(actor) {
  assertObject(actor, 'actor');
  assertExactKeys(actor, ['login'], 'actor');
  assertString(actor.login, 'actor.login');
}

function validateFailure(failure) {
  if (failure === null) return;
  assertObject(failure, 'failure');
  assertExactKeys(failure, ['code', 'message', 'retryable'], 'failure');
  assertString(failure.code, 'failure.code');
  assertString(failure.message, 'failure.message');
  if (typeof failure.retryable !== 'boolean') contract('failure.retryable must be boolean');
}

function validateEvidence(stage, evidence) {
  assertObject(evidence, 'evidence');
  for (const key of REQUIRED_EVIDENCE[stage]) {
    if (!(key in evidence)) contract(`evidence.${key} is required at ${stage}`);
  }
  for (const [key, value] of Object.entries(evidence)) {
    if (key.endsWith('Sha256') && !SHA256.test(value ?? '')) {
      contract(`evidence.${key} must be SHA-256`);
    }
    if (key.endsWith('Artifact')) assertString(value, `evidence.${key}`);
  }
  if ('version' in evidence && typeof evidence.version !== 'string') {
    contract('evidence.version must be a string');
  }
  if ('smokeArtifacts' in evidence) {
    if (!Array.isArray(evidence.smokeArtifacts)
      || evidence.smokeArtifacts.length !== 4
      || new Set(evidence.smokeArtifacts).size !== 4
      || evidence.smokeArtifacts.some((item) => typeof item !== 'string' || item.length === 0)) {
      contract('evidence.smokeArtifacts must contain four unique artifact names');
    }
  }
  if ('directInstallAttestation' in evidence) {
    const attestation = evidence.directInstallAttestation;
    assertObject(attestation, 'evidence.directInstallAttestation');
    assertExactKeys(
      attestation,
      ['confirmedAt', 'confirmedBy', 'publicDmgSha256'],
      'evidence.directInstallAttestation',
    );
    assertString(attestation.confirmedBy, 'evidence.directInstallAttestation.confirmedBy');
    if (!Number.isFinite(Date.parse(attestation.confirmedAt))) {
      contract('evidence.directInstallAttestation.confirmedAt must be an ISO timestamp');
    }
    if (!SHA256.test(attestation.publicDmgSha256 ?? '')) {
      contract('evidence.directInstallAttestation.publicDmgSha256 must be SHA-256');
    }
    if (evidence.publicDmgSha256 !== attestation.publicDmgSha256) {
      contract('direct-install attestation must bind the public DMG digest');
    }
  }
}

export function validateConductorState(value) {
  assertObject(value, 'record');
  assertExactKeys(value, [
    'actor',
    'condition',
    'evidence',
    'failure',
    'kind',
    'nextAction',
    'predecessorSha256',
    'recordedAt',
    'release',
    'run',
    'schemaVersion',
    'sequence',
    'stage',
  ], 'record');
  if (value.kind !== CONDUCTOR_STATE_KIND) contract('kind is not recognized');
  if (value.schemaVersion !== CONDUCTOR_STATE_SCHEMA_VERSION) {
    contract(`schemaVersion must be ${CONDUCTOR_STATE_SCHEMA_VERSION}`);
  }
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 1) {
    contract('sequence must be a positive integer');
  }
  if (!CONDUCTOR_STAGES.includes(value.stage)) contract('stage is not recognized');
  if (value.condition !== expectedCondition(value.stage, value.failure)) {
    contract('condition differs from stage/failure state');
  }
  if (value.nextAction !== expectedNextAction(value.stage, value.failure)) {
    contract('nextAction differs from stage/failure state');
  }
  if (value.sequence === 1) {
    if (value.predecessorSha256 !== null) contract('initial predecessorSha256 must be null');
    if (value.stage !== 'INITIALIZED') contract('first stage must be INITIALIZED');
    if (value.failure !== null) contract('initial state cannot be a failed attempt');
  } else if (!SHA256.test(value.predecessorSha256 ?? '')) {
    contract('predecessorSha256 must be SHA-256 after initialization');
  }
  assertObject(value.release, 'release');
  assertExactKeys(value.release, ['sourceCommit', 'tag'], 'release');
  if (!RC_TAG.test(value.release.tag ?? '')) contract('release.tag must be a canonical RC tag');
  if (!SHA1.test(value.release.sourceCommit ?? '')) contract('release.sourceCommit must be a Git SHA-1');
  validateRun(value.run);
  validateActor(value.actor);
  if (!Number.isFinite(Date.parse(value.recordedAt))) contract('recordedAt must be an ISO timestamp');
  validateFailure(value.failure);
  validateEvidence(value.stage, value.evidence);
  if (value.evidence.version !== value.release.tag.slice(1)) {
    contract('evidence.version must match release.tag');
  }
  return value;
}

function stageIndex(stage) {
  return CONDUCTOR_STAGES.indexOf(stage);
}

function validatePassage(previous, current) {
  if (current.release.tag !== previous.release.tag
    || current.release.sourceCommit !== previous.release.sourceCommit) {
    contract(`sequence ${current.sequence} changes the release identity`);
  }
  if (current.sequence !== previous.sequence + 1) {
    contract(`sequence ${current.sequence} is not contiguous`);
  }
  if (current.predecessorSha256 !== releaseStateSha256(previous)) {
    contract(`sequence ${current.sequence} predecessor digest differs`);
  }
  const delta = stageIndex(current.stage) - stageIndex(previous.stage);
  if (delta < 0 || delta > 1) contract(`sequence ${current.sequence} skips or reverses a stage`);
  if (current.failure !== null && delta !== 0) {
    contract(`sequence ${current.sequence} cannot advance while recording failure`);
  }
  if (delta === 0 && current.failure === null) {
    contract(`sequence ${current.sequence} repeats a stage without failure evidence`);
  }
  if (previous.stage === 'COMPLETE') contract('COMPLETE is terminal');
  if (Date.parse(current.recordedAt) < Date.parse(previous.recordedAt)) {
    contract(`sequence ${current.sequence} predates its predecessor`);
  }
}

export function validateConductorStateChain(values) {
  if (!Array.isArray(values) || values.length === 0) contract('chain must be a nonempty array');
  const chain = [...values].sort((left, right) => left.sequence - right.sequence);
  for (const value of chain) validateConductorState(value);
  for (let index = 1; index < chain.length; index += 1) {
    validatePassage(chain[index - 1], chain[index]);
  }
  if (chain[0].sequence !== 1) contract('chain must begin at sequence 1');
  return chain;
}

export function createConductorState({
  previous = null,
  tag,
  sourceCommit,
  stage,
  evidence = {},
  run,
  actor,
  recordedAt = new Date().toISOString(),
  failure = null,
}) {
  if (previous !== null) validateConductorState(previous);
  const record = {
    actor,
    condition: expectedCondition(stage, failure),
    evidence: { ...(previous?.evidence ?? {}), ...evidence },
    failure,
    kind: CONDUCTOR_STATE_KIND,
    nextAction: expectedNextAction(stage, failure),
    predecessorSha256: previous === null ? null : releaseStateSha256(previous),
    recordedAt,
    release: {
      sourceCommit: previous?.release.sourceCommit ?? sourceCommit,
      tag: previous?.release.tag ?? tag,
    },
    run,
    schemaVersion: CONDUCTOR_STATE_SCHEMA_VERSION,
    sequence: (previous?.sequence ?? 0) + 1,
    stage,
  };
  validateConductorState(record);
  if (previous !== null) validatePassage(previous, record);
  return record;
}

export function conductorStateArtifactName(record) {
  validateConductorState(record);
  return [
    'gatereeve',
    record.release.tag,
    'release-conductor',
    String(record.sequence).padStart(4, '0'),
    record.stage.toLowerCase().replaceAll('_', '-'),
  ].join('-');
}

export function projectConductorStatus(values) {
  const chain = validateConductorStateChain(values);
  const latest = chain.at(-1);
  return {
    schemaVersion: CONDUCTOR_STATE_SCHEMA_VERSION,
    release: latest.release,
    stage: latest.stage,
    condition: latest.condition,
    nextAction: latest.nextAction,
    failure: latest.failure,
    sequence: latest.sequence,
    stateSha256: releaseStateSha256(latest),
    actor: latest.actor,
    recordedAt: latest.recordedAt,
    run: latest.run,
    evidence: latest.evidence,
    history: chain.map((record) => ({
      sequence: record.sequence,
      stage: record.stage,
      condition: record.condition,
      recordedAt: record.recordedAt,
      sha256: releaseStateSha256(record),
    })),
  };
}

export function renderConductorSummary(status) {
  const failure = status.failure
    ? `\n\nFailure: **${status.failure.code}** — ${status.failure.message}`
    : '';
  const history = status.history
    .map((entry) => `| ${entry.sequence} | ${entry.stage} | ${entry.condition} | \`${entry.sha256}\` |`)
    .join('\n');
  return `# GateReeve Release ${status.release.tag}\n\n`
    + `- Source: \`${status.release.sourceCommit}\`\n`
    + `- Current stage: **${status.stage}**\n`
    + `- Condition: **${status.condition}**\n`
    + `- Next action: **${status.nextAction}**\n`
    + `- State SHA-256: \`${status.stateSha256}\`${failure}\n\n`
    + '| Sequence | Stage | Condition | State SHA-256 |\n'
    + '|---:|---|---|---|\n'
    + `${history}\n`;
}
