import { GATE_OUTCOMES } from './constants.js';
import { ContractError, TransitionRejectedError } from './errors.js';
import {
  gateInputFingerprint,
  validateEvidenceReference,
} from './fingerprint.js';
import { readFeatureRecord } from './feature.js';
import { appendProjectedEvent, createEvent } from './journal.js';
import { projectRecord } from './projection.js';
import { recordSliceTransition } from './transitions.js';

function activeAttempt(projection, attemptId) {
  const attempt = projection.boundaryAttempts.find((item) => item.id === attemptId);
  if (!attempt) {
    throw new TransitionRejectedError(`Unknown boundary attempt ${attemptId}`);
  }
  return attempt;
}

function selectedGate(attempt, gateId) {
  const gate = attempt.gates.find((item) => item.id === gateId);
  if (!gate) throw new TransitionRejectedError(`Unknown boundary gate ${gateId}`);
  return gate;
}

function fingerprintProjection(record, attemptId, currentFingerprints) {
  return projectRecord(record, {
    gateFingerprints: { [attemptId]: currentFingerprints },
  });
}

function assertAgentActor(actor) {
  if (!actor || !['agent', 'human-confirmed'].includes(actor.kind)) {
    throw new TransitionRejectedError('Gate recording requires an agent-capable actor');
  }
}

function dependencyEventIds(attempt, gate) {
  return Object.fromEntries(
    gate.dependsOn.map((dependencyId) => {
      const dependency = selectedGate(attempt, dependencyId);
      return [dependencyId, dependency.recordedEventId];
    })
  );
}

async function appendGateEvent(
  record,
  {
    attemptId,
    gateId,
    outcome,
    inputFingerprint,
    evidence,
    reason,
    dependencyIds,
    actor,
    waiver,
    eventId,
    recordedAt,
  }
) {
  const event = createEvent({
    sequence: record.events.length + 1,
    featureId: record.events[0].featureId,
    type: waiver ? 'GATE_WAIVER_RECORDED' : 'GATE_OUTCOME_RECORDED',
    modelHash: record.modelLock.modelHash,
    actor,
    payload: {
      attemptId,
      gateId,
      outcome,
      inputFingerprint,
      evidence,
      reason,
      dependencyEventIds: dependencyIds,
    },
    eventId,
    recordedAt,
  });
  await appendProjectedEvent(record, event, {
    currentModelHash: record.modelLock.modelHash,
  });
  return event;
}

export async function recordGateOutcome(
  featureHome,
  {
    attemptId,
    gateId,
    outcome,
    inputs,
    currentFingerprints = {},
    evidence = null,
    reason = null,
    actor,
    eventId,
    recordedAt,
  }
) {
  assertAgentActor(actor);
  if (!GATE_OUTCOMES.includes(outcome) || ['UNSET', 'WAIVED'].includes(outcome)) {
    throw new ContractError(`recordGateOutcome does not accept outcome ${outcome}`);
  }
  const record = await readFeatureRecord(featureHome);
  const inputFingerprint = gateInputFingerprint({
    modelHash: record.modelLock.modelHash,
    attemptId,
    gateId,
    inputs,
  });
  const fingerprints = { ...currentFingerprints, [gateId]: inputFingerprint };
  const projection = fingerprintProjection(record, attemptId, fingerprints);
  const attempt = activeAttempt(projection, attemptId);
  const gate = selectedGate(attempt, gateId);
  if (!gate.eligible) {
    throw new TransitionRejectedError(`${gateId} is not eligible`, {
      blockers: gate.blockers,
    });
  }
  if (outcome === 'NOT_APPLICABLE') {
    if (!gate.optional || typeof reason !== 'string' || reason.trim().length === 0) {
      throw new TransitionRejectedError(`${gateId} cannot be marked not applicable`);
    }
    validateEvidenceReference(evidence, { required: false });
  } else {
    validateEvidenceReference(evidence);
  }
  const event = await appendGateEvent(record, {
    attemptId,
    gateId,
    outcome,
    inputFingerprint,
    evidence,
    reason,
    dependencyIds: dependencyEventIds(attempt, gate),
    actor,
    waiver: false,
    eventId,
    recordedAt,
  });
  const updated = await readFeatureRecord(featureHome);
  return {
    event,
    inputFingerprint,
    projection: fingerprintProjection(updated, attemptId, fingerprints),
  };
}

export async function recordGateWaiver(
  featureHome,
  {
    attemptId,
    gateId,
    inputs,
    currentFingerprints = {},
    reason,
    actor,
    eventId,
    recordedAt,
  }
) {
  if (actor?.kind !== 'human-confirmed') {
    throw new TransitionRejectedError('Gate waiver requires human confirmation');
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new ContractError('Gate waiver requires a nonempty risk-acceptance reason');
  }
  const record = await readFeatureRecord(featureHome);
  const inputFingerprint = gateInputFingerprint({
    modelHash: record.modelLock.modelHash,
    attemptId,
    gateId,
    inputs,
  });
  const fingerprints = { ...currentFingerprints, [gateId]: inputFingerprint };
  const projection = fingerprintProjection(record, attemptId, fingerprints);
  const attempt = activeAttempt(projection, attemptId);
  const gate = selectedGate(attempt, gateId);
  if (!gate.eligible || !gate.waiverAllowed) {
    throw new TransitionRejectedError(`${gateId} cannot be waived`, {
      blockers: gate.blockers,
    });
  }
  const event = await appendGateEvent(record, {
    attemptId,
    gateId,
    outcome: 'WAIVED',
    inputFingerprint,
    evidence: null,
    reason,
    dependencyIds: dependencyEventIds(attempt, gate),
    actor,
    waiver: true,
    eventId,
    recordedAt,
  });
  const updated = await readFeatureRecord(featureHome);
  return {
    event,
    inputFingerprint,
    projection: fingerprintProjection(updated, attemptId, fingerprints),
  };
}

export async function invalidateGates(
  featureHome,
  { attemptId, gateIds, reason, actor, eventId, recordedAt }
) {
  assertAgentActor(actor);
  if (!Array.isArray(gateIds) || gateIds.length === 0) {
    throw new ContractError('Gate invalidation requires at least one gate ID');
  }
  const record = await readFeatureRecord(featureHome);
  const projection = projectRecord(record);
  const attempt = activeAttempt(projection, attemptId);
  for (const gateId of gateIds) selectedGate(attempt, gateId);
  const event = createEvent({
    sequence: record.events.length + 1,
    featureId: record.events[0].featureId,
    type: 'GATE_INVALIDATED',
    modelHash: record.modelLock.modelHash,
    actor,
    payload: { attemptId, gateIds: [...new Set(gateIds)], reason: reason ?? null },
    eventId,
    recordedAt,
  });
  await appendProjectedEvent(record, event, { currentModelHash: record.modelLock.modelHash });
  return { event, projection: projectRecord(await readFeatureRecord(featureHome)) };
}

export async function requestBoundaryHumanReview(
  featureHome,
  { attemptId, currentFingerprints, actor, eventId, recordedAt }
) {
  const record = await readFeatureRecord(featureHome);
  const projection = fingerprintProjection(record, attemptId, currentFingerprints);
  const attempt = activeAttempt(projection, attemptId);
  if (!attempt.requiredCurrentAndNonblocking) {
    throw new TransitionRejectedError('Boundary is not ready for human review', {
      gates: attempt.gates.map((gate) => ({
        id: gate.id,
        outcome: gate.outcome,
        freshness: gate.freshness,
      })),
    });
  }
  const result = await recordSliceTransition(
    featureHome,
    'request-human-review',
    attempt.sliceId,
    {
      actor,
      facts: { requiredBoundaryGatesCurrentAndNonblocking: true },
      payload: { attemptId },
      eventId,
      recordedAt,
    }
  );
  return {
    ...result,
    projection: fingerprintProjection(
      await readFeatureRecord(featureHome),
      attemptId,
      currentFingerprints
    ),
  };
}
