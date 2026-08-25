import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  acceptHumanReview,
  fingerprint,
  initializeFeature,
  pauseFeature,
  projectRecord,
  proposeSlice,
  readFeatureRecord,
  recordGateOutcome,
  recordFeatureTransition,
  recordSliceTransition,
  resumeFeature,
  requestBoundaryHumanReview,
} from '../../plugin-src/shared/resources/protocol/index.js';

const agent = { kind: 'agent', label: 'test-agent' };
const human = { kind: 'human-confirmed', label: 'test-user' };

async function createFeature() {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve lifecycle '));
  const featureHome = resolve(root, 'docs/issues/protocol-lifecycle');
  await initializeFeature({
    featureHome,
    featureId: 'protocol-lifecycle',
    actor: agent,
    eventId: 'evt-01-init',
  });
  return featureHome;
}

async function enterDelivery(featureHome) {
  await recordFeatureTransition(featureHome, 'approve-design', {
    actor: human,
    eventId: 'evt-02-design',
  });
  await recordFeatureTransition(featureHome, 'validate-spec', {
    actor: agent,
    facts: { specValidationCurrent: true },
    eventId: 'evt-03-spec',
  });
  return recordFeatureTransition(featureHome, 'authorize-plan', {
    actor: human,
    eventId: 'evt-04-plan',
  });
}

async function completeBoundary(featureHome, attemptId) {
  const currentFingerprints = {};
  const gates = [
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
  for (const gateId of gates) {
    const notApplicable = gateId === 'patternReview';
    const result = await recordGateOutcome(featureHome, {
      attemptId,
      gateId,
      outcome: notApplicable ? 'NOT_APPLICABLE' : 'PASS',
      inputs: { revision: 1, gateId },
      currentFingerprints,
      evidence: notApplicable
        ? null
        : { path: `${gateId}.md`, hash: fingerprint({ gateId, revision: 1 }) },
      reason: notApplicable ? 'No pattern-review scope is configured' : null,
      actor: agent,
      eventId: `evt-gate-${attemptId}-${gateId}`,
    });
    currentFingerprints[gateId] = result.inputFingerprint;
  }
  return currentFingerprints;
}

test('feature lifecycle rejects out-of-order passage without appending an event', async () => {
  const featureHome = await createFeature();
  const before = (await readFeatureRecord(featureHome)).events.length;

  await assert.rejects(
    recordFeatureTransition(featureHome, 'validate-spec', {
      actor: agent,
      facts: { specValidationCurrent: true },
      eventId: 'evt-invalid-spec',
    }),
    /not eligible/
  );
  assert.equal((await readFeatureRecord(featureHome)).events.length, before);

  const delivered = await enterDelivery(featureHome);
  assert.equal(delivered.projection.feature.state, 'DELIVERING_SLICES');
  assert.equal(delivered.projection.implementationAuthorization.current, true);
});

test('many slices may be planned but only one may be active', async () => {
  const featureHome = await createFeature();
  await enterDelivery(featureHome);
  await proposeSlice(featureHome, {
    sliceId: 'slice-1',
    actor: agent,
    eventId: 'evt-05-propose-1',
  });
  await proposeSlice(featureHome, {
    sliceId: 'slice-2',
    actor: agent,
    eventId: 'evt-06-propose-2',
  });
  await recordSliceTransition(featureHome, 'plan-slice', 'slice-1', {
    actor: agent,
    eventId: 'evt-07-plan-1',
  });
  await recordSliceTransition(featureHome, 'plan-slice', 'slice-2', {
    actor: agent,
    eventId: 'evt-08-plan-2',
  });
  await recordSliceTransition(featureHome, 'start-slice', 'slice-1', {
    actor: agent,
    facts: { sliceReadinessCurrent: true },
    eventId: 'evt-09-start-1',
  });

  const before = (await readFeatureRecord(featureHome)).events.length;
  await assert.rejects(
    recordSliceTransition(featureHome, 'start-slice', 'slice-2', {
      actor: agent,
      facts: { sliceReadinessCurrent: true },
      eventId: 'evt-invalid-start-2',
    }),
    /not eligible/
  );
  const projection = projectRecord(await readFeatureRecord(featureHome));
  assert.equal(projection.activeSliceId, 'slice-1');
  assert.equal(projection.slices.find((slice) => slice.id === 'slice-2').state, 'PLANNED');
  assert.equal(projection.journal.eventCount, before);
});

test('pause preserves lifecycle position and blocks ordinary passage until resume', async () => {
  const featureHome = await createFeature();
  await enterDelivery(featureHome);
  await proposeSlice(featureHome, {
    sliceId: 'slice-1',
    actor: agent,
    eventId: 'evt-05-propose',
  });
  await recordSliceTransition(featureHome, 'plan-slice', 'slice-1', {
    actor: agent,
    eventId: 'evt-06-plan',
  });
  await recordSliceTransition(featureHome, 'start-slice', 'slice-1', {
    actor: agent,
    facts: { sliceReadinessCurrent: true },
    eventId: 'evt-07-start',
  });
  const paused = await pauseFeature(featureHome, {
    actor: agent,
    reason: 'operator interruption',
    eventId: 'evt-08-pause',
  });
  assert.equal(paused.projection.suspension.paused, true);
  assert.equal(paused.projection.slices[0].state, 'IMPLEMENTING');

  await assert.rejects(
    recordSliceTransition(featureHome, 'begin-boundary', 'slice-1', {
      actor: agent,
      eventId: 'evt-invalid-boundary',
    }),
    /not eligible/
  );
  const resumed = await resumeFeature(featureHome, {
    actor: agent,
    eventId: 'evt-09-resume',
  });
  assert.equal(resumed.projection.suspension.paused, false);
  assert.equal(resumed.projection.slices[0].state, 'IMPLEMENTING');
});

test('sequential slices reach a feature-final closeout through human review', async () => {
  const featureHome = await createFeature();
  await enterDelivery(featureHome);
  for (const [index, sliceId] of ['slice-1', 'slice-2'].entries()) {
    await proposeSlice(featureHome, {
      sliceId,
      actor: agent,
      eventId: `evt-${5 + index}-propose-${sliceId}`,
    });
    await recordSliceTransition(featureHome, 'plan-slice', sliceId, {
      actor: agent,
      eventId: `evt-${7 + index}-plan-${sliceId}`,
    });
  }

  async function deliver(sliceId, offset, featureFinal) {
    await recordSliceTransition(featureHome, 'start-slice', sliceId, {
      actor: agent,
      facts: { sliceReadinessCurrent: true },
      eventId: `evt-${offset}-start`,
    });
    await recordSliceTransition(featureHome, 'begin-boundary', sliceId, {
      actor: agent,
      payload: {
        attemptId: `${sliceId}-attempt-1`,
        scope: featureFinal ? 'FEATURE_FINAL' : 'SLICE',
      },
      eventId: `evt-${offset + 1}-boundary`,
    });
    const attemptId = `${sliceId}-attempt-1`;
    const currentFingerprints = await completeBoundary(featureHome, attemptId);
    await requestBoundaryHumanReview(featureHome, {
      attemptId,
      currentFingerprints,
      actor: agent,
      eventId: `evt-${offset + 2}-review-request`,
    });
    await assert.rejects(
      recordSliceTransition(featureHome, 'record-merge', sliceId, {
        actor: agent,
        facts: { reviewedContentMerged: true },
        payload: { featureFinal },
        eventId: `evt-${offset + 3}-early-merge`,
      }),
      /not eligible/
    );
    await acceptHumanReview(featureHome, sliceId, {
      actor: human,
      eventId: `evt-${offset + 3}-review-accepted`,
    });
    return recordSliceTransition(featureHome, 'record-merge', sliceId, {
      actor: agent,
      facts: { reviewedContentMerged: true },
      payload: { featureFinal },
      eventId: `evt-${offset + 4}-merge`,
    });
  }

  const first = await deliver('slice-1', 9, false);
  assert.equal(first.projection.feature.state, 'DELIVERING_SLICES');
  assert.equal(first.projection.activeSliceId, null);

  const final = await deliver('slice-2', 14, true);
  assert.equal(final.projection.feature.state, 'FINALIZING');
  const finalAttempt = final.projection.boundaryAttempts.find(
    (attempt) => attempt.id === 'slice-2-attempt-1'
  );
  assert.equal(
    finalAttempt.gates.find((gate) => gate.id === 'verification').evaluationScope,
    'FEATURE'
  );
  assert.equal(
    finalAttempt.gates.find((gate) => gate.id === 'codeReview').evaluationScope,
    'SLICE'
  );
  const complete = await recordFeatureTransition(featureHome, 'complete-feature', {
    actor: agent,
    facts: { featureCloseoutCurrent: true },
    eventId: 'evt-19-complete',
  });
  assert.equal(complete.projection.feature.state, 'COMPLETE');
});
