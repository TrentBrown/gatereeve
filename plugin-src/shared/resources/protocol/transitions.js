import { randomUUID } from 'node:crypto';

import { GUARD_DESCRIPTORS } from './guards.js';
import { appendEvent, createEvent } from './journal.js';
import { projectRecord, projectionFacts } from './projection.js';
import { readFeatureRecord } from './feature.js';
import { ProtocolError, TransitionRejectedError } from './errors.js';

function authoritySatisfied(authority, actor) {
  if (authority === 'human-confirmation') return actor?.kind === 'human-confirmed';
  if (authority === 'agent') {
    return actor?.kind === 'agent' || actor?.kind === 'human-confirmed';
  }
  return actor?.kind === 'system';
}

function factResult(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { passed: value.passed === true, evidence: value.evidence ?? null };
  }
  return { passed: value === true, evidence: null };
}

function transitionFacts(projection, transition, actor, suppliedFacts) {
  const facts = { ...projectionFacts(projection), ...suppliedFacts };
  if (actor?.kind === 'human-confirmed') {
    if (transition.id === 'approve-design') facts.designApprovalCurrent = true;
    if (transition.id === 'authorize-plan') facts.planAuthorizationCurrent = true;
    if (transition.id.startsWith('abandon-')) facts.featureAbandonmentConfirmed = true;
  }
  return facts;
}

function evaluateTransition(transition, projection, actor, suppliedFacts = {}) {
  const facts = transitionFacts(projection, transition, actor, suppliedFacts);
  const guards = transition.guards.map((id) => {
    const descriptor = GUARD_DESCRIPTORS[id];
    const result = factResult(facts[descriptor.fact]);
    return { id, passed: result.passed, evidence: result.evidence };
  });
  const blockers = guards
    .filter((guard) => !guard.passed)
    .map((guard) => ({ type: 'guard', id: guard.id }));
  if (!authoritySatisfied(transition.authority, actor)) {
    blockers.unshift({ type: 'authority', required: transition.authority });
  }
  return { eligible: blockers.length === 0, blockers, guards };
}

function machineTransition(machine, transitionId) {
  return machine.transitions.find((transition) => transition.id === transitionId) ?? null;
}

function currentSlice(projection, sliceId) {
  return projection.slices.find((slice) => slice.id === sliceId) ?? null;
}

export function preflightFeatureTransition(record, transitionId, { actor, facts = {} } = {}) {
  const projection = projectRecord(record);
  const transition = machineTransition(record.modelLock.model.feature, transitionId);
  if (!transition) throw new ProtocolError('TRANSITION_UNKNOWN', `Unknown feature transition ${transitionId}`);
  const blockers = [];
  if (projection.feature.state !== transition.from) {
    blockers.push({ type: 'state', expected: transition.from, actual: projection.feature.state });
  }
  const evaluation = evaluateTransition(transition, projection, actor, facts);
  return {
    machine: 'feature',
    transition,
    projection,
    eligible: blockers.length === 0 && evaluation.eligible,
    blockers: [...blockers, ...evaluation.blockers],
    guards: evaluation.guards,
  };
}

export function preflightSliceTransition(
  record,
  transitionId,
  sliceId,
  { actor, facts = {} } = {}
) {
  const projection = projectRecord(record);
  const transition = machineTransition(record.modelLock.model.slice, transitionId);
  if (!transition) throw new ProtocolError('TRANSITION_UNKNOWN', `Unknown slice transition ${transitionId}`);
  const slice = currentSlice(projection, sliceId);
  const blockers = [];
  if (!slice) blockers.push({ type: 'slice', id: sliceId, reason: 'not found' });
  else if (slice.state !== transition.from) {
    blockers.push({ type: 'state', expected: transition.from, actual: slice.state });
  }
  const evaluation = evaluateTransition(transition, projection, actor, facts);
  return {
    machine: 'slice',
    transition,
    slice,
    projection,
    eligible: blockers.length === 0 && evaluation.eligible,
    blockers: [...blockers, ...evaluation.blockers],
    guards: evaluation.guards,
  };
}

function reject(preflight) {
  throw new TransitionRejectedError(
    `${preflight.transition.id} is not eligible`,
    { blockers: preflight.blockers }
  );
}

async function appendPassage(record, transition, actor, guards, payload, options = {}) {
  const event = createEvent({
    sequence: record.events.length + 1,
    featureId: record.events[0].featureId,
    type: transition.eventType,
    modelHash: record.modelLock.modelHash,
    actor,
    payload: {
      ...payload,
      passage: { transitionId: transition.id, guards },
    },
    recordedAt: options.recordedAt,
    eventId: options.eventId,
  });
  await appendEvent(record.featureHome, event, {
    featureId: event.featureId,
    allowedModelHashes: new Set([record.modelLock.modelHash]),
  });
  return event;
}

export async function recordFeatureTransition(
  featureHome,
  transitionId,
  { actor, facts = {}, payload = {}, eventId, recordedAt } = {}
) {
  const record = await readFeatureRecord(featureHome);
  const preflight = preflightFeatureTransition(record, transitionId, { actor, facts });
  if (!preflight.eligible) reject(preflight);
  await appendPassage(
    record,
    preflight.transition,
    actor,
    preflight.guards,
    payload,
    { eventId, recordedAt }
  );
  const updated = await readFeatureRecord(featureHome);
  return { event: updated.events.at(-1), projection: projectRecord(updated) };
}

export async function proposeSlice(
  featureHome,
  {
    sliceId,
    name = sliceId,
    branch = null,
    scope = null,
    planSteps = [],
    rubricCriteria = [],
    actor,
    facts = {},
    eventId,
    recordedAt,
  }
) {
  const record = await readFeatureRecord(featureHome);
  const projection = projectRecord(record);
  const blockers = [];
  if (typeof sliceId !== 'string' || sliceId.length === 0) blockers.push({ type: 'sliceId' });
  if (projection.slices.some((slice) => slice.id === sliceId)) blockers.push({ type: 'duplicate', id: sliceId });
  if (!['DELIVERING_SLICES', 'FINALIZING'].includes(projection.feature.state)) {
    blockers.push({ type: 'featureState', actual: projection.feature.state });
  }
  if (projection.suspension.paused) blockers.push({ type: 'suspension' });
  if (!authoritySatisfied('agent', actor)) blockers.push({ type: 'authority', required: 'agent' });

  let passage = null;
  if (projection.feature.state === 'FINALIZING') {
    const transition = machineTransition(record.modelLock.model.feature, 'resume-delivery');
    const evaluation = evaluateTransition(transition, projection, actor, facts);
    blockers.push(...evaluation.blockers);
    passage = { transitionId: transition.id, guards: evaluation.guards };
  }
  if (blockers.length > 0) {
    throw new TransitionRejectedError('propose-slice is not eligible', { blockers });
  }
  const event = createEvent({
    sequence: record.events.length + 1,
    featureId: record.events[0].featureId,
    type: 'SLICE_PROPOSED',
    modelHash: record.modelLock.modelHash,
    actor,
    payload: {
      sliceId,
      name,
      branch,
      scope,
      planSteps,
      rubricCriteria,
      ...(passage ? { passage } : {}),
    },
    recordedAt,
    eventId,
  });
  await appendEvent(featureHome, event, { allowedModelHashes: new Set([record.modelLock.modelHash]) });
  const updated = await readFeatureRecord(featureHome);
  return { event, projection: projectRecord(updated) };
}

export async function recordSliceTransition(
  featureHome,
  transitionId,
  sliceId,
  { actor, facts = {}, payload = {}, eventId, recordedAt } = {}
) {
  const record = await readFeatureRecord(featureHome);
  const preflight = preflightSliceTransition(record, transitionId, sliceId, { actor, facts });
  if (!preflight.eligible) reject(preflight);
  let featurePassage = null;
  if (transitionId === 'record-merge' && payload.featureFinal === true) {
    const featureTransition = machineTransition(record.modelLock.model.feature, 'begin-finalizing');
    const featureEvaluation = evaluateTransition(featureTransition, preflight.projection, actor, facts);
    if (preflight.projection.feature.state !== featureTransition.from || !featureEvaluation.eligible) {
      throw new TransitionRejectedError('feature-final merge is not eligible', {
        blockers: featureEvaluation.blockers,
      });
    }
    featurePassage = {
      transitionId: featureTransition.id,
      guards: featureEvaluation.guards,
    };
  }
  await appendPassage(
    record,
    preflight.transition,
    actor,
    preflight.guards,
    {
      ...payload,
      sliceId,
      ...(featurePassage ? { featurePassage } : {}),
    },
    { eventId, recordedAt }
  );
  const updated = await readFeatureRecord(featureHome);
  return { event: updated.events.at(-1), projection: projectRecord(updated) };
}

async function recordOverlay(
  featureHome,
  type,
  actor,
  payload,
  eventId,
  recordedAt,
  preparedRecord = null
) {
  const record = preparedRecord ?? (await readFeatureRecord(featureHome));
  const event = createEvent({
    sequence: record.events.length + 1,
    featureId: record.events[0].featureId,
    type,
    modelHash: record.modelLock.modelHash,
    actor,
    payload,
    recordedAt,
    eventId,
  });
  await appendEvent(featureHome, event, { allowedModelHashes: new Set([record.modelLock.modelHash]) });
  const updated = await readFeatureRecord(featureHome);
  return { event, projection: projectRecord(updated) };
}

export async function pauseFeature(featureHome, { actor, reason = null, eventId, recordedAt } = {}) {
  const record = await readFeatureRecord(featureHome);
  const projection = projectRecord(record);
  if (
    !authoritySatisfied('agent', actor) ||
    projection.suspension.paused ||
    ['COMPLETE', 'ABANDONED_FEATURE'].includes(projection.feature.state)
  ) {
    throw new TransitionRejectedError('pause is not eligible');
  }
  return recordOverlay(
    featureHome,
    'FEATURE_PAUSED',
    actor,
    { reason },
    eventId,
    recordedAt,
    record
  );
}

export async function resumeFeature(featureHome, { actor, eventId, recordedAt } = {}) {
  const record = await readFeatureRecord(featureHome);
  const projection = projectRecord(record);
  if (!authoritySatisfied('agent', actor) || !projection.suspension.paused) {
    throw new TransitionRejectedError('resume is not eligible');
  }
  return recordOverlay(
    featureHome,
    'FEATURE_RESUMED',
    actor,
    {},
    eventId,
    recordedAt,
    record
  );
}

export async function acceptHumanReview(
  featureHome,
  sliceId,
  { actor, eventId = `evt-${randomUUID()}`, recordedAt } = {}
) {
  if (actor?.kind !== 'human-confirmed') {
    throw new TransitionRejectedError('human review acceptance requires human confirmation');
  }
  const record = await readFeatureRecord(featureHome);
  const projection = projectRecord(record);
  const slice = currentSlice(projection, sliceId);
  if (!slice || slice.state !== 'HUMAN_REVIEW') {
    throw new TransitionRejectedError('human review acceptance is not eligible');
  }
  return recordOverlay(
    featureHome,
    'HUMAN_REVIEW_ACCEPTED',
    actor,
    { sliceId },
    eventId,
    recordedAt,
    record
  );
}

export async function abandonFeature(featureHome, input = {}) {
  const record = await readFeatureRecord(featureHome);
  const state = projectRecord(record).feature.state;
  const transitionByState = {
    DESIGNING: 'abandon-designing-feature',
    SPECIFYING: 'abandon-specifying-feature',
    PLANNING: 'abandon-planning-feature',
    DELIVERING_SLICES: 'abandon-delivering-feature',
    FINALIZING: 'abandon-finalizing-feature',
  };
  const transitionId = transitionByState[state];
  if (!transitionId) {
    throw new TransitionRejectedError(`Feature cannot be abandoned from ${state}`);
  }
  return recordFeatureTransition(featureHome, transitionId, input);
}

export async function abandonSlice(featureHome, sliceId, input = {}) {
  const record = await readFeatureRecord(featureHome);
  const slice = currentSlice(projectRecord(record), sliceId);
  const transitionByState = {
    PLANNED: 'abandon-planned-slice',
    IMPLEMENTING: 'abandon-implementing-slice',
  };
  const transitionId = transitionByState[slice?.state];
  if (!transitionId) {
    throw new TransitionRejectedError(
      `Slice ${sliceId} cannot be abandoned from ${slice?.state ?? 'missing'}`
    );
  }
  return recordSliceTransition(featureHome, transitionId, sliceId, input);
}
