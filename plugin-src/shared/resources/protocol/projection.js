import { BOUNDARY_SCOPES, GATE_OUTCOMES } from './constants.js';
import { ContractError } from './errors.js';
import { SHA256_FINGERPRINT } from './fingerprint.js';
import { boundaryGateDefinitions, validateResolvedModuleGraph } from './modules.js';

const ACTIVE_SLICE_STATES = new Set(['IMPLEMENTING', 'PR_BOUNDARY', 'HUMAN_REVIEW']);
const PASSAGE_FREE_EVENTS = new Set([
  'FEATURE_INITIALIZED',
  'FEATURE_PAUSED',
  'FEATURE_RESUMED',
  'IMPLEMENTATION_REAUTHORIZED',
  'MODEL_MIGRATED',
  'HUMAN_REVIEW_ACCEPTED',
  'GATE_OUTCOME_RECORDED',
  'GATE_WAIVER_RECORDED',
  'GATE_INVALIDATED',
  'CHANGE_PROPOSED',
  'CHANGE_APPROVED',
  'CHANGE_REJECTED',
  'CHANGE_APPLIED',
  'CHANGE_VALIDATED',
  'CHANGE_SUPERSEDED',
]);

function assertActorAuthority(event, authority) {
  const kind = event.actor.kind;
  const allowed =
    authority === 'human-confirmation'
      ? kind === 'human-confirmed'
      : authority === 'agent'
        ? kind === 'agent' || kind === 'human-confirmed'
        : kind === 'system';
  if (!allowed) {
    throw new ContractError(
      `Event ${event.eventId} actor ${kind} does not satisfy ${authority}`
    );
  }
}

function assertPassage(event, transition, passage = event.payload.passage) {
  if (!passage || passage.transitionId !== transition.id) {
    throw new ContractError(
      `Event ${event.eventId} must record passage through ${transition.id}`
    );
  }
  if (!Array.isArray(passage.guards)) {
    throw new ContractError(`Event ${event.eventId} passage guards must be an array`);
  }
  const results = new Map(passage.guards.map((guard) => [guard.id, guard]));
  for (const guardId of transition.guards) {
    if (results.get(guardId)?.passed !== true) {
      throw new ContractError(
        `Event ${event.eventId} did not record passing guard ${guardId}`
      );
    }
  }
  assertActorAuthority(event, transition.authority);
}

function transitionFor(machine, state, event, passage = event.payload.passage) {
  const candidates = machine.transitions.filter(
    (transition) => transition.from === state && transition.eventType === event.type
  );
  const transition = passage
    ? candidates.find((candidate) => candidate.id === passage.transitionId)
    : candidates.length === 1
      ? candidates[0]
      : null;
  if (!transition) {
    throw new ContractError(
      `Event ${event.eventId} cannot apply ${event.type} from ${state}`
    );
  }
  assertPassage(event, transition, passage);
  return transition;
}

function sliceFor(slices, event) {
  const sliceId = event.payload.sliceId;
  if (typeof sliceId !== 'string' || !slices.has(sliceId)) {
    throw new ContractError(`Event ${event.eventId} references unknown slice ${sliceId}`);
  }
  return slices.get(sliceId);
}

function activeSlices(slices) {
  return [...slices.values()].filter((slice) => ACTIVE_SLICE_STATES.has(slice.state));
}

function assertSingleActiveSlice(slices, event) {
  const active = activeSlices(slices);
  if (active.length > 1) {
    throw new ContractError(
      `Event ${event.eventId} violates the one-active-slice invariant: ` +
        active.map((slice) => slice.id).join(', ')
    );
  }
}

function alphabeticBranch(index) {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(97 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function dependencyOrdering(definitions) {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const stages = new Map();
  const visiting = new Set();

  function stageFor(id) {
    if (stages.has(id)) return stages.get(id);
    if (visiting.has(id)) throw new ContractError(`Boundary gate dependencies contain a cycle at ${id}`);
    const definition = byId.get(id);
    if (!definition) throw new ContractError(`Boundary gate dependency ${id} is not defined`);
    visiting.add(id);
    const stage = definition.dependsOn.length === 0
      ? 1
      : 1 + Math.max(...definition.dependsOn.map(stageFor));
    visiting.delete(id);
    stages.set(id, stage);
    return stage;
  }

  const grouped = new Map();
  for (const definition of definitions) {
    const stage = stageFor(definition.id);
    const group = grouped.get(stage) ?? [];
    group.push(definition.id);
    grouped.set(stage, group);
  }

  return new Map(definitions.map((definition) => {
    const stage = stages.get(definition.id);
    const peers = grouped.get(stage);
    const branch = peers.length > 1 ? alphabeticBranch(peers.indexOf(definition.id)) : null;
    return [definition.id, {
      stage,
      branch,
      label: `${stage}${branch ?? ''}`,
    }];
  }));
}

function boundaryModelFromSnapshot(model, snapshot, event) {
  if (snapshot?.moduleGraph !== undefined && snapshot?.boundary === undefined) {
    validateResolvedModuleGraph(snapshot.moduleGraph);
    return { ...model, moduleGraph: snapshot.moduleGraph };
  }
  if (snapshot?.boundary !== undefined && snapshot?.moduleGraph === undefined) {
    if (!Array.isArray(snapshot.boundary?.gates) || snapshot.boundary.gates.length === 0) {
      throw new ContractError(
        `Event ${event.eventId} has an invalid legacy boundary snapshot`
      );
    }
    return { ...model, moduleGraph: undefined, boundary: snapshot.boundary };
  }
  throw new ContractError(`Event ${event.eventId} has an invalid boundary snapshot`);
}

function historicalBoundarySnapshots(events) {
  const snapshots = new Map();
  for (const event of events) {
    if (event.type !== 'MODEL_MIGRATED' || event.payload.previousBoundary === undefined) {
      continue;
    }
    const modelHash = event.payload.fromModelHash;
    const existing = snapshots.get(modelHash);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(event.payload.previousBoundary)) {
      throw new ContractError(`Model ${modelHash} has conflicting boundary snapshots`);
    }
    snapshots.set(modelHash, event.payload.previousBoundary);
  }
  return snapshots;
}

function createAttempt(model, slice, event, boundarySnapshots) {
  const attemptId = event.payload.attemptId;
  if (typeof attemptId !== 'string' || attemptId.length === 0) {
    throw new ContractError(`Event ${event.eventId} has an invalid boundary attemptId`);
  }
  if (!BOUNDARY_SCOPES.includes(event.payload.scope)) {
    throw new ContractError(`Event ${event.eventId} has an invalid boundary scope`);
  }
  const attemptModel = event.payload.moduleGraph !== undefined
    ? boundaryModelFromSnapshot(model, { moduleGraph: event.payload.moduleGraph }, event)
    : boundarySnapshots.has(event.modelHash)
      ? boundaryModelFromSnapshot(model, boundarySnapshots.get(event.modelHash), event)
      : model;
  const definitions = boundaryGateDefinitions(attemptModel);
  const ordering = dependencyOrdering(definitions);
  return {
    id: attemptId,
    modelHash: event.modelHash,
    sliceId: slice.id,
    scope: event.payload.scope,
    context: event.payload.context ?? null,
    startedBy: event.eventId,
    startedSequence: event.sequence,
    state: 'ACTIVE',
    gates: definitions.map((definition) => ({
      id: definition.id,
      moduleId: definition.moduleId,
      moduleVersion: definition.moduleVersion,
      moduleDigest: definition.moduleDigest,
      dependsOn: [...definition.dependsOn],
      dependencyStage: ordering.get(definition.id).stage,
      dependencyBranch: ordering.get(definition.id).branch,
      orderLabel: ordering.get(definition.id).label,
      evaluationScope: definition.evaluationScope[event.payload.scope],
      optional: definition.optional,
      locked: definition.locked,
      waiverAllowed: definition.waiverAllowed,
      outcome: 'UNSET',
      evidence: null,
      inputFingerprint: null,
      recordedEventId: null,
      recordedSequence: null,
      invalidatedSequence: null,
      reason: null,
      freshness: 'UNKNOWN',
      eligible: false,
      blockers: [],
    })),
  };
}

function attemptFor(boundaryAttempts, event) {
  const attempt = boundaryAttempts.find((item) => item.id === event.payload.attemptId);
  if (!attempt) {
    throw new ContractError(
      `Event ${event.eventId} references unknown boundary attempt ${event.payload.attemptId}`
    );
  }
  return attempt;
}

function gateFor(attempt, gateId, event) {
  const gate = attempt.gates.find((item) => item.id === gateId);
  if (!gate) {
    throw new ContractError(`Event ${event.eventId} references unknown gate ${gateId}`);
  }
  return gate;
}

function nonblockingOutcome(outcome) {
  return ['PASS', 'WAIVED', 'NOT_APPLICABLE'].includes(outcome);
}

function historicallyCurrent(gate, attempt) {
  if (gate.outcome === 'UNSET' || gate.recordedSequence === null) return false;
  if (
    gate.invalidatedSequence !== null &&
    gate.invalidatedSequence > gate.recordedSequence
  ) {
    return false;
  }
  return gate.dependsOn.every((dependencyId) => {
    const dependency = gateFor(attempt, dependencyId, {
      eventId: gate.recordedEventId,
    });
    return (
      nonblockingOutcome(dependency.outcome) &&
      dependency.recordedSequence !== null &&
      dependency.recordedSequence < gate.recordedSequence
    );
  });
}

function attemptHistoricallyReady(attempt) {
  return attempt.gates.every(
    (gate) => nonblockingOutcome(gate.outcome) && historicallyCurrent(gate, attempt)
  );
}

function applyGateEvent(boundaryAttempts, event) {
  const attempt = attemptFor(boundaryAttempts, event);
  if (attempt.state !== 'ACTIVE') {
    throw new ContractError(`Event ${event.eventId} cannot mutate a ${attempt.state} attempt`);
  }
  if (event.type === 'GATE_INVALIDATED') {
    assertActorAuthority(event, 'agent');
    if (!Array.isArray(event.payload.gateIds) || event.payload.gateIds.length === 0) {
      throw new ContractError(`Event ${event.eventId} must identify invalidated gates`);
    }
    for (const gateId of event.payload.gateIds) {
      gateFor(attempt, gateId, event).invalidatedSequence = event.sequence;
    }
    return;
  }

  const gate = gateFor(attempt, event.payload.gateId, event);
  const outcome = event.type === 'GATE_WAIVER_RECORDED' ? 'WAIVED' : event.payload.outcome;
  if (!GATE_OUTCOMES.includes(outcome) || outcome === 'UNSET') {
    throw new ContractError(`Event ${event.eventId} has invalid gate outcome ${outcome}`);
  }
  if (!SHA256_FINGERPRINT.test(event.payload.inputFingerprint)) {
    throw new ContractError(`Event ${event.eventId} has an invalid input fingerprint`);
  }
  const dependencyEventIds = event.payload.dependencyEventIds ?? {};
  for (const dependencyId of gate.dependsOn) {
    const dependency = gateFor(attempt, dependencyId, event);
    if (
      !nonblockingOutcome(dependency.outcome) ||
      !historicallyCurrent(dependency, attempt) ||
      dependencyEventIds[dependencyId] !== dependency.recordedEventId
    ) {
      throw new ContractError(
        `Event ${event.eventId} was recorded before dependency ${dependencyId} was current`
      );
    }
  }
  if (event.type === 'GATE_WAIVER_RECORDED') {
    assertActorAuthority(event, 'human-confirmation');
    if (!gate.waiverAllowed || typeof event.payload.reason !== 'string' || event.payload.reason.length === 0) {
      throw new ContractError(`Event ${event.eventId} is not a permitted gate waiver`);
    }
  } else {
    assertActorAuthority(event, 'agent');
    if (
      outcome === 'NOT_APPLICABLE' &&
      (!gate.optional || typeof event.payload.reason !== 'string' || event.payload.reason.length === 0)
    ) {
      throw new ContractError(`Event ${event.eventId} is not a valid not-applicable result`);
    }
  }
  gate.outcome = outcome;
  gate.evidence = event.payload.evidence ?? null;
  gate.inputFingerprint = event.payload.inputFingerprint;
  gate.recordedEventId = event.eventId;
  gate.recordedSequence = event.sequence;
  gate.reason = event.payload.reason ?? null;
}

function finalizeAttempts(
  boundaryAttempts,
  slices,
  gateFingerprints,
  blockingChangeIds,
  currentModelHash
) {
  for (const attempt of boundaryAttempts) {
    const current = gateFingerprints?.[attempt.id] ?? {};
    const slice = slices.get(attempt.sliceId);
    for (const gate of attempt.gates) {
      if (gate.outcome === 'UNSET') {
        gate.freshness = 'UNKNOWN';
      } else if (!historicallyCurrent(gate, attempt)) {
        gate.freshness = 'STALE';
      } else if (!(gate.id in current)) {
        gate.freshness = 'UNKNOWN';
      } else if (current[gate.id] !== gate.inputFingerprint) {
        gate.freshness = 'STALE';
      } else {
        gate.freshness = 'CURRENT';
      }
      if (
        gate.freshness === 'CURRENT' &&
        gate.dependsOn.some((dependencyId) => {
          const dependency = gateFor(attempt, dependencyId, {
            eventId: gate.recordedEventId ?? attempt.startedBy,
          });
          return (
            !nonblockingOutcome(dependency.outcome) ||
            dependency.freshness !== 'CURRENT'
          );
        })
      ) {
        gate.freshness = 'STALE';
      }

      const blockers = [];
      if (attempt.state !== 'ACTIVE' || slice?.state !== 'PR_BOUNDARY') {
        blockers.push({ type: 'attempt', state: attempt.state });
      }
      if (blockingChangeIds.length > 0) {
        blockers.push({ type: 'changes', changeIds: blockingChangeIds });
      }
      if (attempt.modelHash !== currentModelHash) {
        blockers.push({
          type: 'model-migration',
          attemptModelHash: attempt.modelHash,
          currentModelHash,
        });
      }
      for (const dependencyId of gate.dependsOn) {
        const dependency = gateFor(attempt, dependencyId, {
          eventId: gate.recordedEventId ?? attempt.startedBy,
        });
        if (!nonblockingOutcome(dependency.outcome)) {
          blockers.push({ type: 'dependency-outcome', gateId: dependencyId });
        } else if (dependency.freshness !== 'CURRENT') {
          blockers.push({
            type: 'dependency-freshness',
            gateId: dependencyId,
            freshness: dependency.freshness,
          });
        }
      }
      gate.blockers = blockers;
      gate.eligible = blockers.length === 0;
    }
    attempt.requiredCurrentAndNonblocking =
      blockingChangeIds.length === 0 &&
      attempt.modelHash === currentModelHash &&
      attempt.gates.every(
        (gate) => nonblockingOutcome(gate.outcome) && gate.freshness === 'CURRENT'
      );
  }
}

function changeFor(changes, event) {
  const changeId = event.payload.changeId;
  if (typeof changeId !== 'string' || !changes.has(changeId)) {
    throw new ContractError(`Event ${event.eventId} references unknown change ${changeId}`);
  }
  return changes.get(changeId);
}

function assertTargetAuthority(model, change, event) {
  assertActorAuthority(event, model.change.authorityByTarget[change.target]);
}

function sameInvalidation(left, right) {
  return (
    left?.implementationAuthorization === right.implementationAuthorization &&
    JSON.stringify([...(left?.gateIds ?? [])].sort()) ===
      JSON.stringify([...(right.gateIds ?? [])].sort())
  );
}

export function projectRecord(record, { gateFingerprints = {} } = {}) {
  const { modelLock, events } = record;
  const model = modelLock.model;
  if (!Array.isArray(events) || events.length === 0 || events[0].type !== 'FEATURE_INITIALIZED') {
    throw new ContractError('A governed feature journal must begin with FEATURE_INITIALIZED');
  }
  if (events[0].payload.featureState !== model.feature.initial) {
    throw new ContractError('FEATURE_INITIALIZED state differs from the pinned model');
  }

  let featureState = model.feature.initial;
  let paused = false;
  let suspension = null;
  let implementationAuthorization = null;
  const slices = new Map();
  const boundaryAttempts = [];
  const acceptedReviews = new Set();
  const changes = new Map();
  const boundarySnapshots = historicalBoundarySnapshots(events);

  for (const [index, event] of events.entries()) {
    if (index === 0) continue;
    switch (event.type) {
      case 'DESIGN_APPROVED':
      case 'SPEC_VALIDATED':
      case 'PLAN_AUTHORIZED':
      case 'FEATURE_ABANDONED':
      case 'FEATURE_FINALIZED': {
        const transition = transitionFor(model.feature, featureState, event);
        featureState = transition.to;
        if (event.type === 'PLAN_AUTHORIZED') {
          implementationAuthorization = {
            eventId: event.eventId,
            sequence: event.sequence,
            current: true,
          };
        }
        break;
      }
      case 'FEATURE_PAUSED':
        assertActorAuthority(event, 'agent');
        if (paused || ['COMPLETE', 'ABANDONED_FEATURE'].includes(featureState)) {
          throw new ContractError(`Event ${event.eventId} cannot pause the feature`);
        }
        paused = true;
        suspension = {
          eventId: event.eventId,
          reason: event.payload.reason ?? null,
          pausedAt: event.recordedAt,
        };
        break;
      case 'FEATURE_RESUMED':
        assertActorAuthority(event, 'agent');
        if (!paused) throw new ContractError(`Event ${event.eventId} resumes an active feature`);
        paused = false;
        suspension = null;
        break;
      case 'IMPLEMENTATION_REAUTHORIZED': {
        assertActorAuthority(event, 'human-confirmation');
        if (!Array.isArray(event.payload.changeIds) || event.payload.changeIds.length === 0) {
          throw new ContractError(`Event ${event.eventId} must identify amended changes`);
        }
        const expected = [...changes.values()].filter(
          (change) => ['design', 'spec'].includes(change.target) && change.state === 'APPLIED'
        );
        const supplied = new Set(event.payload.changeIds);
        if (
          expected.length === 0 ||
          supplied.size !== expected.length ||
          expected.some((change) => !supplied.has(change.id))
        ) {
          throw new ContractError(
            `Event ${event.eventId} does not cover all applied design/spec changes`
          );
        }
        if (event.payload.downstreamArtifactsCurrent !== true) {
          throw new ContractError(
            `Event ${event.eventId} lacks current downstream amendment evidence`
          );
        }
        implementationAuthorization = {
          eventId: event.eventId,
          sequence: event.sequence,
          current: true,
          renewedFor: [...supplied].sort(),
        };
        break;
      }
      case 'SLICE_PROPOSED': {
        assertActorAuthority(event, 'agent');
        const sliceId = event.payload.sliceId;
        if (typeof sliceId !== 'string' || sliceId.length === 0 || slices.has(sliceId)) {
          throw new ContractError(`Event ${event.eventId} has an invalid or duplicate sliceId`);
        }
        if (featureState === 'FINALIZING') {
          const transition = transitionFor(model.feature, featureState, event);
          featureState = transition.to;
        } else if (featureState !== 'DELIVERING_SLICES') {
          throw new ContractError(`Event ${event.eventId} cannot propose a slice from ${featureState}`);
        }
        slices.set(sliceId, {
          id: sliceId,
          deliveryOrdinal: slices.size + 1,
          state: model.slice.initial,
          name: event.payload.name ?? sliceId,
          branch: event.payload.branch ?? null,
          scope: event.payload.scope ?? null,
          planSteps: event.payload.planSteps ?? [],
          rubricCriteria: event.payload.rubricCriteria ?? [],
          proposedBy: event.eventId,
          latestEventId: event.eventId,
          activeAttemptId: null,
        });
        break;
      }
      case 'SLICE_PLANNED':
      case 'SLICE_STARTED':
      case 'BOUNDARY_STARTED':
      case 'REMEDIATION_STARTED':
      case 'HUMAN_REVIEW_REQUESTED':
      case 'HUMAN_REVIEW_CHANGES_REQUESTED':
      case 'SLICE_ABANDONED':
      case 'SLICE_MERGE_RECORDED': {
        const slice = sliceFor(slices, event);
        const transition = transitionFor(model.slice, slice.state, event);
        slice.state = transition.to;
        slice.latestEventId = event.eventId;
        if (event.type === 'BOUNDARY_STARTED') {
          const attemptId = event.payload.attemptId;
          if (typeof attemptId !== 'string' || boundaryAttempts.some((item) => item.id === attemptId)) {
            throw new ContractError(`Event ${event.eventId} has an invalid boundary attemptId`);
          }
          const attempt = createAttempt(model, slice, event, boundarySnapshots);
          boundaryAttempts.push(attempt);
          slice.activeAttemptId = attemptId;
        }
        if (event.type === 'REMEDIATION_STARTED') {
          const attempt = boundaryAttempts.find((item) => item.id === slice.activeAttemptId);
          if (attempt) attempt.state = 'REMEDIATION';
          slice.activeAttemptId = null;
        }
        if (event.type === 'HUMAN_REVIEW_REQUESTED') {
          const attempt = boundaryAttempts.find((item) => item.id === slice.activeAttemptId);
          if (!attempt || !attemptHistoricallyReady(attempt)) {
            throw new ContractError(
              `Event ${event.eventId} requests review before boundary gates are complete`
            );
          }
          if (attempt) attempt.state = 'HUMAN_REVIEW';
        }
        if (event.type === 'HUMAN_REVIEW_CHANGES_REQUESTED') {
          acceptedReviews.delete(slice.id);
          slice.activeAttemptId = null;
        }
        if (event.type === 'SLICE_MERGE_RECORDED') {
          if (!acceptedReviews.has(slice.id)) {
            throw new ContractError(`Event ${event.eventId} merges without accepted human review`);
          }
          const attempt = boundaryAttempts.find((item) => item.id === slice.activeAttemptId);
          if (attempt) attempt.state = 'MERGED';
          slice.activeAttemptId = null;
          if (event.payload.featureFinal === true) {
            const passage = event.payload.featurePassage;
            const transition = transitionFor(model.feature, featureState, event, passage);
            featureState = transition.to;
          }
        }
        break;
      }
      case 'HUMAN_REVIEW_ACCEPTED': {
        const slice = sliceFor(slices, event);
        if (slice.state !== 'HUMAN_REVIEW' || event.actor.kind !== 'human-confirmed') {
          throw new ContractError(`Event ${event.eventId} is not a valid human review acceptance`);
        }
        acceptedReviews.add(slice.id);
        break;
      }
      case 'MODEL_MIGRATED':
        assertActorAuthority(event, 'human-confirmation');
        break;
      case 'GATE_OUTCOME_RECORDED':
      case 'GATE_WAIVER_RECORDED':
      case 'GATE_INVALIDATED':
        applyGateEvent(boundaryAttempts, event);
        break;
      case 'CHANGE_PROPOSED': {
        assertActorAuthority(event, 'agent');
        const { changeId, target } = event.payload;
        if (
          typeof changeId !== 'string' ||
          changeId.length === 0 ||
          changes.has(changeId) ||
          !(target in model.change.authorityByTarget)
        ) {
          throw new ContractError(`Event ${event.eventId} has an invalid change identity`);
        }
        if (!['DELIVERING_SLICES', 'FINALIZING'].includes(featureState)) {
          throw new ContractError(`Event ${event.eventId} cannot propose a change from ${featureState}`);
        }
        const expectedInvalidation = model.change.invalidationByTarget[target];
        if (!sameInvalidation(event.payload.invalidation, expectedInvalidation)) {
          throw new ContractError(`Event ${event.eventId} has an invalid change invalidation set`);
        }
        changes.set(changeId, {
          id: changeId,
          target,
          state: model.change.initial,
          origin: event.payload.origin ?? null,
          rationale: event.payload.rationale ?? null,
          impact: event.payload.impact ?? null,
          invalidation: event.payload.invalidation,
          proposedBy: event.eventId,
          latestEventId: event.eventId,
          appliedSequence: null,
        });
        break;
      }
      case 'CHANGE_APPROVED':
      case 'CHANGE_REJECTED':
      case 'CHANGE_APPLIED':
      case 'CHANGE_VALIDATED':
      case 'CHANGE_SUPERSEDED': {
        const change = changeFor(changes, event);
        const transition = transitionFor(model.change, change.state, event);
        if (['CHANGE_APPROVED', 'CHANGE_REJECTED'].includes(event.type)) {
          assertTargetAuthority(model, change, event);
        }
        if (event.type === 'CHANGE_VALIDATED') {
          if (!Array.isArray(event.payload.dependentArtifacts) || event.payload.dependentArtifacts.length === 0) {
            throw new ContractError(`Event ${event.eventId} lacks dependent artifact evidence`);
          }
          if (
            ['design', 'spec'].includes(change.target) &&
            (!implementationAuthorization?.current ||
              implementationAuthorization.sequence <= change.appliedSequence)
          ) {
            throw new ContractError(
              `Event ${event.eventId} validates a higher-level change without renewed authorization`
            );
          }
        }
        change.state = transition.to;
        change.latestEventId = event.eventId;
        if (event.type === 'CHANGE_APPLIED') {
          change.appliedSequence = event.sequence;
          if (change.invalidation.implementationAuthorization) {
            implementationAuthorization = {
              ...(implementationAuthorization ?? {}),
              current: false,
              invalidatedBy: event.eventId,
              invalidatedSequence: event.sequence,
            };
          }
          for (const attempt of boundaryAttempts.filter(
            (item) => ['ACTIVE', 'HUMAN_REVIEW'].includes(item.state)
          )) {
            for (const gateId of change.invalidation.gateIds) {
              gateFor(attempt, gateId, event).invalidatedSequence = event.sequence;
            }
          }
        }
        break;
      }
      default:
        if (!PASSAGE_FREE_EVENTS.has(event.type)) {
          throw new ContractError(`Projection does not understand event ${event.type}`);
        }
    }
    assertSingleActiveSlice(slices, event);
  }

  const projectedChanges = [...changes.values()];
  const blockingChanges = projectedChanges.filter(
    (change) => !['REJECTED', 'VALIDATED', 'SUPERSEDED'].includes(change.state)
  );
  finalizeAttempts(
    boundaryAttempts,
    slices,
    gateFingerprints,
    blockingChanges.map((change) => change.id),
    modelLock.modelHash
  );
  const active = activeSlices(slices);
  return {
    schemaVersion: 1,
    mode: 'governed',
    featureId: events[0].featureId,
    model: {
      id: modelLock.modelId,
      version: modelLock.modelVersion,
      hash: modelLock.modelHash,
    },
    feature: { state: featureState },
    suspension: { paused, ...(suspension ?? {}) },
    implementationAuthorization: implementationAuthorization ?? { current: false },
    slices: [...slices.values()],
    activeSliceId: active[0]?.id ?? null,
    boundaryAttempts,
    changes: projectedChanges,
    blockingChangeIds: blockingChanges.map((change) => change.id),
    acceptedReviewSliceIds: [...acceptedReviews].sort(),
    journal: {
      eventCount: events.length,
      lastEventId: events.at(-1).eventId,
      lastSequence: events.at(-1).sequence,
    },
  };
}

export function projectionFacts(projection) {
  const activeSlice = projection.slices.find(
    (slice) => slice.id === projection.activeSliceId
  );
  const activeAttempt = projection.boundaryAttempts.find(
    (attempt) => attempt.id === activeSlice?.activeAttemptId
  );
  return {
    featureRecordAbsent: false,
    designApprovalCurrent: false,
    specValidationCurrent: false,
    planAuthorizationCurrent: projection.implementationAuthorization.current,
    noActiveSlice: projection.activeSliceId === null,
    sliceReadinessCurrent: false,
    activeSliceExists: projection.activeSliceId !== null,
    boundaryContextCurrent: false,
    requiredBoundaryGatesCurrentAndNonblocking:
      activeAttempt?.requiredCurrentAndNonblocking === true,
    humanReviewAccepted:
      projection.activeSliceId !== null &&
      projection.acceptedReviewSliceIds.includes(projection.activeSliceId),
    reviewedContentMerged: false,
    featureCloseoutCurrent: false,
    featureAbandonmentConfirmed: false,
    featureNotPaused: !projection.suspension.paused,
    noBlockingChanges: projection.blockingChangeIds.length === 0,
    changeAuthoritySatisfied: false,
    modelMigrationConfirmed: false,
  };
}
