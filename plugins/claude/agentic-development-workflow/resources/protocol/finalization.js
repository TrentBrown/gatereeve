import { randomUUID } from 'node:crypto';

import { GATE_OUTCOMES } from './constants.js';
import { ContractError, TransitionRejectedError } from './errors.js';
import { gateInputFingerprint, validateEvidenceReference } from './fingerprint.js';
import { readFeatureRecord } from './feature.js';
import { appendProjectedEvent, createEvent } from './journal.js';
import { finalizationModuleDefinitions } from './modules.js';
import { projectRecord } from './projection.js';
import { recordFeatureTransition } from './transitions.js';

const SHA1 = /^[0-9a-f]{40}$/u;

export function recordedFeatureFinalMergeSha(record) {
  const event = record.events.findLast((item) => (
    item.type === 'SLICE_MERGE_RECORDED' && item.payload?.featureFinal === true
  ));
  const values = [event?.payload?.integrationSha, event?.payload?.mergeCommitSha]
    .filter((value) => SHA1.test(value));
  if (new Set(values).size > 1) {
    throw new ContractError('The recorded feature-final merge has conflicting commit identities');
  }
  return values[0] ?? null;
}

function currentAttempt(projection, attemptId) {
  const attempt = projection.finalizationAttempts.find((item) => item.id === attemptId);
  if (!attempt || attempt.state !== 'ACTIVE') {
    throw new TransitionRejectedError(`Finalization attempt ${attemptId} is not active`);
  }
  return attempt;
}

function selectedModule(attempt, moduleId) {
  const module = attempt.modules.find((item) => item.id === moduleId);
  if (!module) throw new TransitionRejectedError(`Unknown finalization module ${moduleId}`);
  return module;
}

function moduleInputs(attempt, module) {
  return {
    schemaVersion: 1,
    scope: 'FEATURE',
    mergeInputSha: attempt.mergeInputSha,
    module: {
      id: module.moduleId,
      version: module.moduleVersion,
      digest: module.moduleDigest,
    },
    dependencyEventIds: Object.fromEntries(module.dependsOn.map((dependencyId) => {
      const dependency = selectedModule(attempt, dependencyId);
      return [dependencyId, dependency.recordedEventId];
    })),
  };
}

function dependencyEventIds(attempt, module) {
  return Object.fromEntries(module.dependsOn.map((dependencyId) => [
    dependencyId,
    selectedModule(attempt, dependencyId).recordedEventId,
  ]));
}

function assertAgent(actor) {
  if (!actor || !['agent', 'human-confirmed'].includes(actor.kind)) {
    throw new TransitionRejectedError('Finalization outcome requires an agent-capable actor');
  }
}

export async function startFeatureFinalization(featureHome, {
  attemptId,
  mergeInputSha,
  actor,
  eventId = `evt-${randomUUID()}`,
  recordedAt,
} = {}) {
  assertAgent(actor);
  if (typeof attemptId !== 'string' || attemptId.length === 0) {
    throw new ContractError('Finalization attempt ID must be nonempty');
  }
  if (!SHA1.test(mergeInputSha)) {
    throw new ContractError('Finalization merge input must be a full Git SHA');
  }
  const record = await readFeatureRecord(featureHome);
  const projection = projectRecord(record);
  if (projection.feature.state !== 'FINALIZING' || projection.suspension.paused) {
    throw new TransitionRejectedError('Feature finalization is not eligible');
  }
  if (
    projection.boundaryAttempts.some((attempt) => attempt.id === attemptId)
    || projection.finalizationAttempts.some((attempt) => attempt.id === attemptId)
  ) {
    throw new TransitionRejectedError(`Duplicate finalization attempt ${attemptId}`);
  }
  const activeAttempt = projection.finalizationAttempts.find((attempt) => attempt.state === 'ACTIVE');
  if (activeAttempt && activeAttempt.modelHash === record.modelLock.modelHash) {
    throw new TransitionRejectedError('A finalization attempt is already active');
  }
  if (recordedFeatureFinalMergeSha(record) !== mergeInputSha) {
    throw new TransitionRejectedError('Finalization merge input must match the recorded feature-final merge');
  }
  const moduleGraph = record.modelLock.model.moduleGraph;
  if (!moduleGraph) throw new ContractError('Finalization requires a pinned module graph');
  const event = createEvent({
    sequence: record.events.length + 1,
    featureId: record.events[0].featureId,
    type: 'FEATURE_FINALIZATION_STARTED',
    modelHash: record.modelLock.modelHash,
    actor,
    payload: { attemptId, mergeInputSha, moduleGraph: structuredClone(moduleGraph) },
    eventId,
    recordedAt,
  });
  await appendProjectedEvent(record, event, { currentModelHash: record.modelLock.modelHash });
  return { event, projection: projectRecord(await readFeatureRecord(featureHome)) };
}

async function appendResult(featureHome, {
  attemptId,
  moduleId,
  outcome,
  evidence,
  reason,
  actor,
  waiver,
  eventId,
  recordedAt,
}) {
  const record = await readFeatureRecord(featureHome);
  const projection = projectRecord(record);
  if (projection.suspension.paused) {
    throw new TransitionRejectedError('Finalization outcomes cannot be recorded while paused');
  }
  const attempt = currentAttempt(projection, attemptId);
  const module = selectedModule(attempt, moduleId);
  if (!module.eligible) {
    throw new TransitionRejectedError(`${moduleId} is not eligible`, { blockers: module.blockers });
  }
  const inputs = moduleInputs(attempt, module);
  const inputFingerprint = gateInputFingerprint({
    modelHash: attempt.modelHash,
    attemptId,
    gateId: moduleId,
    inputs,
  });
  const event = createEvent({
    sequence: record.events.length + 1,
    featureId: record.events[0].featureId,
    type: waiver
      ? 'FEATURE_FINALIZATION_WAIVER_RECORDED'
      : 'FEATURE_FINALIZATION_OUTCOME_RECORDED',
    modelHash: record.modelLock.modelHash,
    actor,
    payload: {
      attemptId,
      moduleId,
      outcome,
      inputFingerprint,
      evidence,
      reason: reason ?? null,
      dependencyEventIds: dependencyEventIds(attempt, module),
    },
    eventId: eventId ?? `evt-${randomUUID()}`,
    recordedAt,
  });
  await appendProjectedEvent(record, event, { currentModelHash: record.modelLock.modelHash });
  return {
    event,
    inputFingerprint,
    projection: projectRecord(await readFeatureRecord(featureHome)),
  };
}

export async function recordFinalizationOutcome(featureHome, options) {
  assertAgent(options.actor);
  if (!GATE_OUTCOMES.includes(options.outcome) || ['UNSET', 'WAIVED'].includes(options.outcome)) {
    throw new ContractError(`Finalization outcome ${options.outcome} is invalid`);
  }
  const record = await readFeatureRecord(featureHome);
  const attempt = currentAttempt(projectRecord(record), options.attemptId);
  const module = selectedModule(attempt, options.moduleId);
  if (options.outcome === 'NOT_APPLICABLE') {
    if (!module.optional || typeof options.reason !== 'string' || options.reason.trim().length === 0) {
      throw new TransitionRejectedError(`${options.moduleId} cannot be marked not applicable`);
    }
    validateEvidenceReference(options.evidence ?? null, { required: false });
  } else {
    validateEvidenceReference(options.evidence);
  }
  return appendResult(featureHome, { ...options, waiver: false });
}

export async function recordFinalizationWaiver(featureHome, options) {
  if (options.actor?.kind !== 'human-confirmed') {
    throw new TransitionRejectedError('Finalization waiver requires human confirmation');
  }
  if (typeof options.reason !== 'string' || options.reason.trim().length === 0) {
    throw new ContractError('Finalization waiver requires a nonempty risk-acceptance reason');
  }
  const record = await readFeatureRecord(featureHome);
  const attempt = currentAttempt(projectRecord(record), options.attemptId);
  const module = selectedModule(attempt, options.moduleId);
  if (!module.waiverAllowed || module.locked) {
    throw new TransitionRejectedError(`${options.moduleId} cannot be waived`);
  }
  return appendResult(featureHome, {
    ...options,
    outcome: 'WAIVED',
    evidence: null,
    waiver: true,
  });
}

export async function invalidateFinalizationModules(featureHome, {
  attemptId,
  moduleIds,
  reason = null,
  actor,
  eventId = `evt-${randomUUID()}`,
  recordedAt,
} = {}) {
  assertAgent(actor);
  if (!Array.isArray(moduleIds) || moduleIds.length === 0) {
    throw new ContractError('Finalization invalidation requires module IDs');
  }
  const record = await readFeatureRecord(featureHome);
  const projection = projectRecord(record);
  if (projection.suspension.paused) {
    throw new TransitionRejectedError('Finalization cannot be invalidated while paused');
  }
  const attempt = currentAttempt(projection, attemptId);
  for (const moduleId of moduleIds) selectedModule(attempt, moduleId);
  const event = createEvent({
    sequence: record.events.length + 1,
    featureId: record.events[0].featureId,
    type: 'FEATURE_FINALIZATION_INVALIDATED',
    modelHash: record.modelLock.modelHash,
    actor,
    payload: { attemptId, moduleIds: [...new Set(moduleIds)], reason },
    eventId,
    recordedAt,
  });
  await appendProjectedEvent(record, event, { currentModelHash: record.modelLock.modelHash });
  return { event, projection: projectRecord(await readFeatureRecord(featureHome)) };
}

export async function completeFinalizedFeature(featureHome, {
  attemptId,
  actor,
  eventId = `evt-${randomUUID()}`,
  recordedAt,
} = {}) {
  const record = await readFeatureRecord(featureHome);
  const projection = projectRecord(record);
  if (attemptId === null || attemptId === undefined) {
    if (
      projection.feature.state !== 'FINALIZING'
      || projection.suspension.paused
      || projection.blockingChangeIds.length > 0
      || finalizationModuleDefinitions(record.modelLock.model).length > 0
    ) {
      throw new TransitionRejectedError('Feature cannot complete without a finalization attempt');
    }
    return recordFeatureTransition(featureHome, 'complete-feature', {
      actor,
      facts: { featureCloseoutCurrent: true },
      payload: { finalizationAttemptId: null },
      eventId,
      recordedAt,
    });
  }
  const attempt = projection.finalizationAttempts.find((item) => item.id === attemptId);
  if (!attempt || attempt.state !== 'ACTIVE' || !attempt.requiredCurrentAndNonblocking) {
    throw new TransitionRejectedError('Feature finalization modules are not current and nonblocking');
  }
  return recordFeatureTransition(featureHome, 'complete-feature', {
    actor,
    facts: { featureCloseoutCurrent: true },
    payload: { finalizationAttemptId: attemptId, mergeInputSha: attempt.mergeInputSha },
    eventId,
    recordedAt,
  });
}
