import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  fingerprint,
  initializeFeature,
  nextActions,
  projectRecord,
  proposeSlice,
  readFeatureRecord,
  recordFeatureTransition,
  recordGateOutcome,
  recordGateWaiver,
  recordSliceTransition,
  requestBoundaryHumanReview,
} from '../../plugin-src/shared/resources/protocol/index.js';

const agent = { kind: 'agent', label: 'boundary-agent' };
const human = { kind: 'human-confirmed', label: 'boundary-user' };

async function createBoundary() {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve boundary '));
  const featureHome = resolve(root, 'docs/issues/boundary-feature');
  await initializeFeature({
    featureHome,
    featureId: 'boundary-feature',
    actor: agent,
    eventId: 'evt-init',
  });
  await recordFeatureTransition(featureHome, 'approve-design', {
    actor: human,
    eventId: 'evt-design',
  });
  await recordFeatureTransition(featureHome, 'validate-spec', {
    actor: agent,
    facts: { specValidationCurrent: true },
    eventId: 'evt-spec',
  });
  await recordFeatureTransition(featureHome, 'authorize-plan', {
    actor: human,
    eventId: 'evt-plan',
  });
  await proposeSlice(featureHome, {
    sliceId: 'slice-1',
    actor: agent,
    eventId: 'evt-propose',
  });
  await recordSliceTransition(featureHome, 'plan-slice', 'slice-1', {
    actor: agent,
    eventId: 'evt-slice-plan',
  });
  await recordSliceTransition(featureHome, 'start-slice', 'slice-1', {
    actor: agent,
    facts: { sliceReadinessCurrent: true },
    eventId: 'evt-start',
  });
  await recordSliceTransition(featureHome, 'begin-boundary', 'slice-1', {
    actor: agent,
    payload: {
      attemptId: 'attempt-1',
      scope: 'SLICE',
      context: { headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40) },
    },
    eventId: 'evt-boundary',
  });
  return { featureHome, attemptId: 'attempt-1' };
}

function evidence(gateId, revision = 1) {
  return {
    path: `${gateId}.md`,
    hash: fingerprint({ gateId, revision }),
  };
}

async function record(
  fixture,
  currentFingerprints,
  gateId,
  outcome = 'PASS',
  revision = 1
) {
  const result = await recordGateOutcome(fixture.featureHome, {
    attemptId: fixture.attemptId,
    gateId,
    outcome,
    inputs: { gateId, revision },
    currentFingerprints,
    evidence: outcome === 'NOT_APPLICABLE' ? null : evidence(gateId, revision),
    reason: outcome === 'NOT_APPLICABLE' ? 'No pattern-review scope is configured' : null,
    actor: agent,
    eventId: `evt-${gateId}-${revision}-${outcome}`,
  });
  currentFingerprints[gateId] = result.inputFingerprint;
  return result;
}

test('boundary DAG rejects out-of-order gates without recording an event', async () => {
  const fixture = await createBoundary();
  const before = (await readFeatureRecord(fixture.featureHome)).events.length;
  await assert.rejects(
    record(fixture, {}, 'verification'),
    /verification is not eligible/
  );
  assert.equal((await readFeatureRecord(fixture.featureHome)).events.length, before);

  const projection = projectRecord(await readFeatureRecord(fixture.featureHome));
  const attempt = projection.boundaryAttempts[0];
  assert.equal(attempt.gates.find((gate) => gate.id === 'pinContext').eligible, true);
  assert.equal(attempt.gates.find((gate) => gate.id === 'verification').eligible, false);
  assert(
    nextActions(projection).some(
      (item) => item.command === 'gate record attempt-1 pinContext'
    )
  );
});

test('failed gates block dependents and a permitted human waiver unblocks passage', async () => {
  const fixture = await createBoundary();
  const current = {};
  await record(fixture, current, 'pinContext');
  await record(fixture, current, 'reconcile');
  await record(fixture, current, 'verification');
  await record(fixture, current, 'specEvaluation');
  await record(fixture, current, 'patternReview', 'NOT_APPLICABLE');
  await record(fixture, current, 'judge', 'FAIL');
  await record(fixture, current, 'codeReview');

  await assert.rejects(
    record(fixture, current, 'decisionTriage'),
    /decisionTriage is not eligible/
  );
  await assert.rejects(
    recordGateWaiver(fixture.featureHome, {
      attemptId: fixture.attemptId,
      gateId: 'pinContext',
      inputs: { gateId: 'pinContext', revision: 1 },
      currentFingerprints: current,
      reason: 'not permitted',
      actor: human,
      eventId: 'evt-invalid-pin-waiver',
    }),
    /cannot be waived/
  );

  const waiver = await recordGateWaiver(fixture.featureHome, {
    attemptId: fixture.attemptId,
    gateId: 'judge',
    inputs: { gateId: 'judge', revision: 1 },
    currentFingerprints: current,
    reason: 'User accepts the documented judge risk for this exact fingerprint',
    actor: human,
    eventId: 'evt-judge-waiver',
  });
  current.judge = waiver.inputFingerprint;
  await record(fixture, current, 'decisionTriage');
  await record(fixture, current, 'explainDiff');
  await record(fixture, current, 'packetValidation');

  const readyProjection = projectRecord(await readFeatureRecord(fixture.featureHome), {
    gateFingerprints: { [fixture.attemptId]: current },
  });
  assert(
    nextActions(readyProjection).some(
      (item) => item.command === 'boundary request-review attempt-1'
    )
  );

  const review = await requestBoundaryHumanReview(fixture.featureHome, {
    attemptId: fixture.attemptId,
    currentFingerprints: current,
    actor: agent,
    eventId: 'evt-request-review',
  });
  assert.equal(review.projection.slices[0].state, 'HUMAN_REVIEW');
  assert.equal(
    review.projection.boundaryAttempts[0].gates.find((gate) => gate.id === 'judge').outcome,
    'WAIVED'
  );
});

test('changed inputs and upstream reruns make dependent evidence stale', async () => {
  const fixture = await createBoundary();
  const current = {};
  const ordered = [
    'pinContext',
    'reconcile',
    'verification',
    'specEvaluation',
    'patternReview',
    'judge',
    'codeReview',
    'decisionTriage',
    'explainDiff',
    'packetValidation',
  ];
  for (const gateId of ordered) {
    await record(
      fixture,
      current,
      gateId,
      gateId === 'patternReview' ? 'NOT_APPLICABLE' : 'PASS'
    );
  }

  const changed = {
    ...current,
    verification: fingerprint({ different: 'source head moved' }),
  };
  const staleProjection = projectRecord(await readFeatureRecord(fixture.featureHome), {
    gateFingerprints: { [fixture.attemptId]: changed },
  });
  const staleAttempt = staleProjection.boundaryAttempts[0];
  assert.equal(staleAttempt.gates.find((gate) => gate.id === 'verification').freshness, 'STALE');
  assert.equal(staleAttempt.gates.find((gate) => gate.id === 'judge').freshness, 'STALE');
  assert.equal(staleAttempt.requiredCurrentAndNonblocking, false);
  await assert.rejects(
    requestBoundaryHumanReview(fixture.featureHome, {
      attemptId: fixture.attemptId,
      currentFingerprints: changed,
      actor: agent,
      eventId: 'evt-stale-review',
    }),
    /not ready for human review/
  );

  await record(fixture, current, 'verification', 'PASS', 2);
  const rerunProjection = projectRecord(await readFeatureRecord(fixture.featureHome), {
    gateFingerprints: { [fixture.attemptId]: current },
  });
  assert.equal(
    rerunProjection.boundaryAttempts[0].gates.find((gate) => gate.id === 'judge').freshness,
    'STALE'
  );
});

test('remediation preserves the failed attempt and a later attempt starts cleanly', async () => {
  const fixture = await createBoundary();
  const current = {};
  await record(fixture, current, 'pinContext');
  await record(fixture, current, 'reconcile');
  await record(fixture, current, 'verification', 'FAIL');

  const remediation = await recordSliceTransition(
    fixture.featureHome,
    'remediate-boundary',
    'slice-1',
    { actor: agent, eventId: 'evt-remediate' }
  );
  assert.equal(remediation.projection.slices[0].state, 'IMPLEMENTING');
  assert.equal(remediation.projection.boundaryAttempts[0].state, 'REMEDIATION');

  await recordSliceTransition(fixture.featureHome, 'begin-boundary', 'slice-1', {
    actor: agent,
    payload: { attemptId: 'attempt-2', scope: 'SLICE' },
    eventId: 'evt-boundary-2',
  });
  const projection = projectRecord(await readFeatureRecord(fixture.featureHome));
  assert.deepEqual(
    projection.boundaryAttempts.map((attempt) => [attempt.id, attempt.state]),
    [
      ['attempt-1', 'REMEDIATION'],
      ['attempt-2', 'ACTIVE'],
    ]
  );
  assert(projection.boundaryAttempts[1].gates.every((gate) => gate.outcome === 'UNSET'));
});
