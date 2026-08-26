import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  fingerprint,
  initializeFeature,
  projectRecord,
  proposeChange,
  proposeSlice,
  readFeatureRecord,
  reauthorizeImplementation,
  recordChangeTransition,
  recordFeatureTransition,
  recordGateOutcome,
  recordSliceTransition,
} from '../../plugin-src/shared/resources/protocol/index.js';

const agent = { kind: 'agent', label: 'change-agent' };
const human = { kind: 'human-confirmed', label: 'change-user' };

async function implementingFeature() {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve changes '));
  const featureHome = resolve(root, 'docs/issues/change-feature');
  await initializeFeature({
    featureHome,
    featureId: 'change-feature',
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
    eventId: 'evt-propose-slice',
  });
  await recordSliceTransition(featureHome, 'plan-slice', 'slice-1', {
    actor: agent,
    eventId: 'evt-plan-slice',
  });
  await recordSliceTransition(featureHome, 'start-slice', 'slice-1', {
    actor: agent,
    facts: { sliceReadinessCurrent: true },
    eventId: 'evt-start-slice',
  });
  return featureHome;
}

function artifact(path) {
  return { path, hash: fingerprint({ path, current: true }) };
}

test('design changes block delivery and require human approval plus renewed authorization', async () => {
  const featureHome = await implementingFeature();
  const proposed = await proposeChange(featureHome, {
    changeId: 'change-design-1',
    target: 'design',
    origin: { kind: 'implementation-discovery', event: 'unexpected invariant' },
    rationale: 'The approved design needs a clarified persistence invariant.',
    impact: 'Amend design, reconcile spec and plan, then resume implementation.',
    actor: agent,
    eventId: 'evt-change-proposed',
  });
  assert.deepEqual(proposed.projection.blockingChangeIds, ['change-design-1']);

  const before = (await readFeatureRecord(featureHome)).events.length;
  await assert.rejects(
    recordSliceTransition(featureHome, 'begin-boundary', 'slice-1', {
      actor: agent,
      payload: { attemptId: 'blocked-attempt', scope: 'SLICE' },
      eventId: 'evt-blocked-boundary',
    }),
    /not eligible/
  );
  await assert.rejects(
    recordChangeTransition(featureHome, 'approve-change', 'change-design-1', {
      actor: agent,
      eventId: 'evt-invalid-agent-approval',
    }),
    /not eligible/
  );
  assert.equal((await readFeatureRecord(featureHome)).events.length, before);

  await recordChangeTransition(featureHome, 'approve-change', 'change-design-1', {
    actor: human,
    eventId: 'evt-human-approval',
  });
  const applied = await recordChangeTransition(
    featureHome,
    'apply-change',
    'change-design-1',
    { actor: agent, eventId: 'evt-change-applied' }
  );
  assert.equal(applied.projection.implementationAuthorization.current, false);

  await assert.rejects(
    recordChangeTransition(featureHome, 'validate-change', 'change-design-1', {
      actor: agent,
      payload: { dependentArtifacts: [artifact('design.md')] },
      eventId: 'evt-premature-validation',
    }),
    /not eligible/
  );
  await assert.rejects(
    reauthorizeImplementation(featureHome, {
      changeIds: ['change-design-1'],
      downstreamArtifactsCurrent: true,
      actor: agent,
      eventId: 'evt-invalid-reauthorization',
    }),
    /requires human confirmation/
  );

  const reauthorized = await reauthorizeImplementation(featureHome, {
    changeIds: ['change-design-1'],
    downstreamArtifactsCurrent: true,
    actor: human,
    eventId: 'evt-reauthorized',
  });
  assert.equal(reauthorized.projection.implementationAuthorization.current, true);
  const validated = await recordChangeTransition(
    featureHome,
    'validate-change',
    'change-design-1',
    {
      actor: agent,
      payload: {
        dependentArtifacts: [
          artifact('design.md'),
          artifact('spec.md'),
          artifact('plan.md'),
        ],
      },
      eventId: 'evt-change-validated',
    }
  );
  assert.deepEqual(validated.projection.blockingChangeIds, []);
  assert.equal(validated.projection.changes[0].state, 'VALIDATED');
});

test('in-scope plan changes remain agent-manageable and invalidate boundary dependents', async () => {
  const featureHome = await implementingFeature();
  await recordSliceTransition(featureHome, 'begin-boundary', 'slice-1', {
    actor: agent,
    payload: { attemptId: 'attempt-1', scope: 'SLICE' },
    eventId: 'evt-boundary',
  });
  const current = {};
  for (const gateId of ['pinContext', 'reconcile']) {
    const result = await recordGateOutcome(featureHome, {
      attemptId: 'attempt-1',
      gateId,
      outcome: 'PASS',
      inputs: { gateId, revision: 1 },
      currentFingerprints: current,
      evidence: artifact(`${gateId}.md`),
      actor: agent,
      eventId: `evt-${gateId}`,
    });
    current[gateId] = result.inputFingerprint;
  }

  await proposeChange(featureHome, {
    changeId: 'change-plan-1',
    target: 'plan',
    rationale: 'Split a planned task without changing approved behavior.',
    impact: 'Update plan and slice mapping.',
    actor: agent,
    eventId: 'evt-plan-change-proposed',
  });
  await recordChangeTransition(featureHome, 'approve-change', 'change-plan-1', {
    actor: agent,
    eventId: 'evt-plan-change-approved',
  });
  const applied = await recordChangeTransition(
    featureHome,
    'apply-change',
    'change-plan-1',
    { actor: agent, eventId: 'evt-plan-change-applied' }
  );
  assert.equal(applied.projection.implementationAuthorization.current, true);
  const attempt = applied.projection.boundaryAttempts[0];
  assert.equal(attempt.gates.find((gate) => gate.id === 'pinContext').invalidatedSequence, null);
  assert.notEqual(
    attempt.gates.find((gate) => gate.id === 'reconcile').invalidatedSequence,
    null
  );

  const validated = await recordChangeTransition(
    featureHome,
    'validate-change',
    'change-plan-1',
    {
      actor: agent,
      payload: { dependentArtifacts: [artifact('plan.md')] },
      eventId: 'evt-plan-change-validated',
    }
  );
  assert.deepEqual(validated.projection.blockingChangeIds, []);
  const withFingerprints = projectRecord(await readFeatureRecord(featureHome), {
    gateFingerprints: { 'attempt-1': current },
  });
  assert.equal(
    withFingerprints.boundaryAttempts[0].gates.find((gate) => gate.id === 'reconcile').freshness,
    'STALE'
  );
});
