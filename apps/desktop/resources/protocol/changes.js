import { ContractError, TransitionRejectedError } from './errors.js';
import { validateEvidenceReference } from './fingerprint.js';
import { readFeatureRecord } from './feature.js';
import { appendEvent, createEvent } from './journal.js';
import { projectRecord } from './projection.js';

function actorSatisfies(authority, actor) {
  if (authority === 'human-confirmation') return actor?.kind === 'human-confirmed';
  return actor?.kind === 'agent' || actor?.kind === 'human-confirmed';
}

function projectedChange(projection, changeId) {
  const change = projection.changes.find((item) => item.id === changeId);
  if (!change) throw new TransitionRejectedError(`Unknown change ${changeId}`);
  return change;
}

function changeTransition(model, transitionId) {
  const transition = model.change.transitions.find((item) => item.id === transitionId);
  if (!transition) throw new TransitionRejectedError(`Unknown change transition ${transitionId}`);
  return transition;
}

function targetAuthority(model, change, transition) {
  return ['approve-change', 'reject-change'].includes(transition.id)
    ? model.change.authorityByTarget[change.target]
    : transition.authority;
}

export async function proposeChange(
  featureHome,
  {
    changeId,
    target,
    origin = null,
    rationale,
    impact,
    actor,
    eventId,
    recordedAt,
  }
) {
  const record = await readFeatureRecord(featureHome);
  const projection = projectRecord(record);
  const model = record.modelLock.model;
  if (!actorSatisfies('agent', actor)) {
    throw new TransitionRejectedError('Change proposal requires an agent-capable actor');
  }
  if (!['DELIVERING_SLICES', 'FINALIZING'].includes(projection.feature.state)) {
    throw new TransitionRejectedError(
      `Changes cannot be proposed from ${projection.feature.state}`
    );
  }
  if (
    typeof changeId !== 'string' ||
    changeId.length === 0 ||
    projection.changes.some((change) => change.id === changeId)
  ) {
    throw new ContractError('Change ID must be nonempty and unique');
  }
  if (!(target in model.change.authorityByTarget)) {
    throw new ContractError(`Unknown change target ${target}`);
  }
  if (typeof rationale !== 'string' || rationale.trim().length === 0) {
    throw new ContractError('Change rationale must be nonempty');
  }
  const event = createEvent({
    sequence: record.events.length + 1,
    featureId: record.events[0].featureId,
    type: 'CHANGE_PROPOSED',
    modelHash: record.modelLock.modelHash,
    actor,
    payload: {
      changeId,
      target,
      origin,
      rationale,
      impact: impact ?? null,
      invalidation: model.change.invalidationByTarget[target],
    },
    eventId,
    recordedAt,
  });
  await appendEvent(featureHome, event, { currentModelHash: record.modelLock.modelHash });
  return { event, projection: projectRecord(await readFeatureRecord(featureHome)) };
}

export function preflightChangeTransition(
  record,
  transitionId,
  changeId,
  { actor, payload = {} } = {}
) {
  const projection = projectRecord(record);
  const change = projectedChange(projection, changeId);
  const transition = changeTransition(record.modelLock.model, transitionId);
  const blockers = [];
  if (change.state !== transition.from) {
    blockers.push({ type: 'state', expected: transition.from, actual: change.state });
  }
  const authority = targetAuthority(record.modelLock.model, change, transition);
  if (!actorSatisfies(authority, actor)) {
    blockers.push({ type: 'authority', required: authority });
  }
  const guards = transition.guards.map((id) => {
    let passed = true;
    if (id === 'suspension.notPaused') passed = !projection.suspension.paused;
    if (id === 'change.authority.satisfied') {
      passed = actorSatisfies(authority, actor);
      if (transition.id === 'validate-change') {
        passed =
          passed &&
          Array.isArray(payload.dependentArtifacts) &&
          payload.dependentArtifacts.length > 0 &&
          (!['design', 'spec'].includes(change.target) ||
            (projection.implementationAuthorization.current &&
              projection.implementationAuthorization.sequence > change.appliedSequence));
      }
    }
    return { id, passed, evidence: null };
  });
  for (const guard of guards.filter((item) => !item.passed)) {
    blockers.push({ type: 'guard', id: guard.id });
  }
  return {
    projection,
    change,
    transition,
    guards,
    blockers,
    eligible: blockers.length === 0,
  };
}

export async function recordChangeTransition(
  featureHome,
  transitionId,
  changeId,
  { actor, payload = {}, eventId, recordedAt } = {}
) {
  const record = await readFeatureRecord(featureHome);
  const preflight = preflightChangeTransition(record, transitionId, changeId, {
    actor,
    payload,
  });
  if (!preflight.eligible) {
    throw new TransitionRejectedError(`${transitionId} is not eligible`, {
      blockers: preflight.blockers,
    });
  }
  if (transitionId === 'validate-change') {
    for (const evidence of payload.dependentArtifacts) validateEvidenceReference(evidence);
  }
  const event = createEvent({
    sequence: record.events.length + 1,
    featureId: record.events[0].featureId,
    type: preflight.transition.eventType,
    modelHash: record.modelLock.modelHash,
    actor,
    payload: {
      ...payload,
      changeId,
      passage: {
        transitionId: preflight.transition.id,
        guards: preflight.guards,
      },
    },
    eventId,
    recordedAt,
  });
  await appendEvent(featureHome, event, { currentModelHash: record.modelLock.modelHash });
  return { event, projection: projectRecord(await readFeatureRecord(featureHome)) };
}

export async function reauthorizeImplementation(
  featureHome,
  {
    changeIds,
    downstreamArtifactsCurrent,
    actor,
    eventId,
    recordedAt,
  }
) {
  if (actor?.kind !== 'human-confirmed') {
    throw new TransitionRejectedError('Implementation reauthorization requires human confirmation');
  }
  const record = await readFeatureRecord(featureHome);
  const projection = projectRecord(record);
  const applied = projection.changes.filter(
    (change) => ['design', 'spec'].includes(change.target) && change.state === 'APPLIED'
  );
  const supplied = new Set(changeIds ?? []);
  if (
    applied.length === 0 ||
    supplied.size !== applied.length ||
    applied.some((change) => !supplied.has(change.id)) ||
    downstreamArtifactsCurrent !== true
  ) {
    throw new TransitionRejectedError('Implementation reauthorization is not eligible', {
      requiredChangeIds: applied.map((change) => change.id),
    });
  }
  const event = createEvent({
    sequence: record.events.length + 1,
    featureId: record.events[0].featureId,
    type: 'IMPLEMENTATION_REAUTHORIZED',
    modelHash: record.modelLock.modelHash,
    actor,
    payload: {
      changeIds: [...supplied].sort(),
      downstreamArtifactsCurrent: true,
    },
    eventId,
    recordedAt,
  });
  await appendEvent(featureHome, event, { currentModelHash: record.modelLock.modelHash });
  return { event, projection: projectRecord(await readFeatureRecord(featureHome)) };
}
