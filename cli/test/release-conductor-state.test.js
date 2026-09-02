import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONDUCTOR_STAGES,
  conductorStateArtifactName,
  createConductorState,
  projectConductorStatus,
  releaseStateSha256,
  renderConductorSummary,
  validateConductorState,
  validateConductorStateChain,
} from '../src/plugin/release-conductor-state.js';

const TAG = 'v0.1.0-rc.9';
const SOURCE = 'a'.repeat(40);
const DMG = 'b'.repeat(64);

function run(sequence) {
  return {
    id: String(9000 + sequence),
    attempt: 1,
    repository: 'TrentBrown/gatereeve',
    workflowRef: 'TrentBrown/gatereeve/.github/workflows/release-conductor.yml@refs/heads/main',
  };
}

function actor(login = 'TrentBrown') {
  return { login };
}

function time(sequence) {
  return `2026-09-02T00:${String(sequence).padStart(2, '0')}:00.000Z`;
}

const EVIDENCE = {
  INITIALIZED: { version: '0.1.0-rc.9' },
  TRUST_PENDING: { preparationArtifact: 'coordinated-plugin-candidate' },
  TRUSTED: {
    pluginArtifact: 'coordinated-plugin-candidate',
    trustArtifact: 'coordinated-desktop-trusted',
    dmgSha256: DMG,
  },
  PRIMARY_FINALIZED: {
    primaryPlanArtifact: 'gatereeve-v0.1.0-rc.9-hosted-publication',
    primaryPlanSha256: 'c'.repeat(64),
  },
  PRIMARY_REHEARSED: { primaryRehearsalArtifact: 'primary-rehearsal' },
  PRIMARY_PUBLISHED: {
    primaryPublicationArtifact: 'primary-publication',
    primaryRecordSha256: 'd'.repeat(64),
  },
  WAITING_FOR_DIRECT_INSTALL: { publicDmgSha256: DMG },
  CASK_FINALIZED: {
    directInstallAttestation: {
      confirmedAt: '2026-09-02T00:07:00.000Z',
      confirmedBy: 'TrentBrown',
      publicDmgSha256: DMG,
    },
    caskPlanArtifact: 'linked-cask-plan',
    caskPlanSha256: 'e'.repeat(64),
  },
  CASK_REHEARSED: { caskRehearsalArtifact: 'cask-rehearsal' },
  CASK_PUBLISHED: {
    caskPublicationArtifact: 'cask-publication',
    caskRecordSha256: 'f'.repeat(64),
  },
  SMOKE_VERIFIED: {
    smokeArtifacts: [
      'linked-arm64',
      'linked-x64',
      'public-arm64',
      'public-x64',
    ],
  },
  COMPLETE: {},
};

function fullChain() {
  const chain = [];
  for (const [index, stage] of CONDUCTOR_STAGES.entries()) {
    chain.push(createConductorState({
      previous: chain.at(-1) ?? null,
      tag: TAG,
      sourceCommit: SOURCE,
      stage,
      evidence: EVIDENCE[stage],
      run: run(index + 1),
      actor: actor(),
      recordedAt: time(index + 1),
    }));
  }
  return chain;
}

test('creates a canonical initialized record and deterministic artifact identity', () => {
  const record = fullChain()[0];
  assert.equal(record.sequence, 1);
  assert.equal(record.condition, 'ready');
  assert.equal(record.nextAction, 'PREPARE_TRUST');
  assert.equal(record.predecessorSha256, null);
  assert.match(releaseStateSha256(record), /^[a-f0-9]{64}$/u);
  assert.equal(
    conductorStateArtifactName(record),
    'gatereeve-v0.1.0-rc.9-release-conductor-0001-initialized',
  );
});

test('validates the complete lifecycle and renders matching JSON and summary status', () => {
  const chain = fullChain();
  assert.deepEqual(validateConductorStateChain([...chain].reverse()), chain);
  const status = projectConductorStatus(chain);
  assert.equal(status.stage, 'COMPLETE');
  assert.equal(status.condition, 'complete');
  assert.equal(status.nextAction, 'NONE');
  assert.equal(status.sequence, CONDUCTOR_STAGES.length);
  assert.equal(status.history.length, CONDUCTOR_STAGES.length);
  assert.equal(status.stateSha256, releaseStateSha256(chain.at(-1)));
  const summary = renderConductorSummary(status);
  assert.match(summary, /GateReeve Release v0\.1\.0-rc\.9/u);
  assert.match(summary, /Current stage: \*\*COMPLETE\*\*/u);
  assert.match(summary, new RegExp(status.stateSha256, 'u'));
});

test('records retryable failure without advancing and then resumes forward', () => {
  const [initialized, trustPending] = fullChain();
  const failed = createConductorState({
    previous: trustPending,
    stage: 'TRUST_PENDING',
    evidence: {},
    run: run(20),
    actor: actor('github-actions[bot]'),
    recordedAt: time(20),
    failure: { code: 'APPLE_POLL_TIMEOUT', message: 'Polling reached its bound', retryable: true },
  });
  assert.equal(failed.condition, 'failed');
  assert.equal(failed.nextAction, 'RESUME');
  const trusted = createConductorState({
    previous: failed,
    stage: 'TRUSTED',
    evidence: EVIDENCE.TRUSTED,
    run: run(21),
    actor: actor('github-actions[bot]'),
    recordedAt: time(21),
  });
  assert.equal(trusted.predecessorSha256, releaseStateSha256(failed));
  assert.equal(validateConductorStateChain([initialized, trustPending, failed, trusted]).at(-1), trusted);
});

test('marks nonretryable conflicts as requiring a burned RC', () => {
  const [initialized] = fullChain();
  const failed = createConductorState({
    previous: initialized,
    stage: 'INITIALIZED',
    run: run(2),
    actor: actor(),
    recordedAt: time(2),
    failure: { code: 'TAG_CONFLICT', message: 'The tag already identifies other bytes', retryable: false },
  });
  assert.equal(failed.nextAction, 'BURN_RC');
  assert.match(renderConductorSummary(projectConductorStatus([initialized, failed])), /TAG_CONFLICT/u);
});

test('rejects skipped, reversed, repeated-success, and terminal passages', () => {
  const chain = fullChain();
  assert.throws(() => createConductorState({
    previous: chain[0],
    stage: 'TRUSTED',
    evidence: EVIDENCE.TRUSTED,
    run: run(2),
    actor: actor(),
    recordedAt: time(2),
  }), /skips or reverses/u);
  assert.throws(() => createConductorState({
    previous: chain[2],
    stage: 'TRUST_PENDING',
    run: run(4),
    actor: actor(),
    recordedAt: time(4),
  }), /skips or reverses/u);
  assert.throws(() => createConductorState({
    previous: chain[2],
    stage: 'TRUSTED',
    run: run(4),
    actor: actor(),
    recordedAt: time(4),
  }), /repeats a stage without failure/u);
  assert.throws(() => createConductorState({
    previous: chain.at(-1),
    stage: 'COMPLETE',
    run: run(30),
    actor: actor(),
    recordedAt: time(30),
    failure: { code: 'IMPOSSIBLE', message: 'Terminal state changed', retryable: false },
  }), /COMPLETE is terminal/u);
});

test('rejects tampered predecessors, identity changes, duplicate sequences, and time reversal', () => {
  const chain = fullChain().slice(0, 3);
  const tampered = structuredClone(chain);
  tampered[1].predecessorSha256 = '0'.repeat(64);
  assert.throws(() => validateConductorStateChain(tampered), /predecessor digest differs/u);

  const changedIdentity = structuredClone(chain);
  changedIdentity[2].release.tag = 'v0.1.0-rc.10';
  changedIdentity[2].evidence.version = '0.1.0-rc.10';
  assert.throws(() => validateConductorStateChain(changedIdentity), /changes the release identity/u);

  assert.throws(() => validateConductorStateChain([chain[0], chain[1], chain[1]]), /not contiguous/u);

  const reversedTime = structuredClone(chain);
  reversedTime[2].recordedAt = '2026-09-01T00:00:00.000Z';
  reversedTime[2].predecessorSha256 = releaseStateSha256(reversedTime[1]);
  assert.throws(() => validateConductorStateChain(reversedTime), /predates its predecessor/u);
});

test('rejects malformed evidence, wrong version, and misbound attestation', () => {
  const chain = fullChain();
  const missingSmoke = structuredClone(chain[10]);
  missingSmoke.evidence.smokeArtifacts = ['one', 'two', 'three'];
  assert.throws(() => validateConductorState(missingSmoke), /four unique artifact names/u);

  const wrongVersion = structuredClone(chain[0]);
  wrongVersion.evidence.version = '0.1.0-rc.8';
  assert.throws(() => validateConductorState(wrongVersion), /must match release.tag/u);

  const wrongDmg = structuredClone(chain[7]);
  wrongDmg.evidence.directInstallAttestation.publicDmgSha256 = '0'.repeat(64);
  assert.throws(() => validateConductorState(wrongDmg), /must bind the public DMG digest/u);
});

test('rejects unknown keys so state cannot carry unreviewed authority', () => {
  const value = structuredClone(fullChain()[0]);
  value.publicationToken = 'secret';
  assert.throws(() => validateConductorState(value), /record keys must be exactly/u);
});
