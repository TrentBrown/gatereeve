import { ProtocolError } from './errors.js';
import { discoverFeatureMode, readFeatureRecord } from './feature.js';
import { currentGraph, modelGraph } from './graph.js';
import { loadDefaultModel } from './model.js';
import { projectRecord } from './projection.js';
import { failureResult, successResult } from './result.js';

function activeAttempt(projection) {
  const activeSlice = projection.slices.find(
    (slice) => slice.id === projection.activeSliceId
  );
  return projection.boundaryAttempts.find(
    (attempt) => attempt.id === activeSlice?.activeAttemptId
  ) ?? null;
}

export function projectionBlockers(projection, facts = {}) {
  const blockers = [];
  if (projection.suspension.paused) {
    blockers.push({ type: 'suspension', reason: projection.suspension.reason });
  }
  if (!projection.implementationAuthorization.current && projection.feature.state === 'DELIVERING_SLICES') {
    blockers.push({ type: 'implementation-authorization' });
  }
  for (const changeId of projection.blockingChangeIds) {
    blockers.push({ type: 'change', changeId });
  }
  const attempt = activeAttempt(projection);
  if (attempt) {
    for (const gate of attempt.gates) {
      if (gate.outcome === 'FAIL') blockers.push({ type: 'gate-failure', gateId: gate.id });
      if (gate.freshness === 'STALE') blockers.push({ type: 'gate-stale', gateId: gate.id });
      if (gate.freshness === 'UNKNOWN' && gate.outcome !== 'UNSET') {
        blockers.push({ type: 'gate-freshness-unknown', gateId: gate.id });
      }
    }
  }
  if (facts.worktree?.journalDirty === true) {
    blockers.push({ type: 'journal-uncommitted' });
  }
  return blockers;
}

function action(command, eligible, authority, reasons = []) {
  return { command, eligible, authority, reasons };
}

export function nextActions(projection) {
  if (projection.suspension.paused) {
    return [action('feature resume', true, 'agent')];
  }
  const actions = [];
  for (const change of projection.changes) {
    if (change.state === 'PROPOSED') {
      const authority = ['design', 'spec'].includes(change.target)
        ? 'human-confirmation'
        : 'agent';
      actions.push(action(`change approve ${change.id}`, true, authority));
      actions.push(action(`change reject ${change.id}`, true, authority));
    } else if (change.state === 'APPROVED') {
      actions.push(action(`change apply ${change.id}`, true, 'agent'));
    } else if (change.state === 'APPLIED') {
      actions.push(
        action(
          `change validate ${change.id}`,
          !['design', 'spec'].includes(change.target) ||
            projection.implementationAuthorization.current,
          'agent',
          projection.implementationAuthorization.current
            ? []
            : ['implementation reauthorization required']
        )
      );
    }
  }
  if (projection.blockingChangeIds.length > 0) return actions;

  switch (projection.feature.state) {
    case 'DESIGNING':
      actions.push(action('feature approve-design', true, 'human-confirmation'));
      break;
    case 'SPECIFYING':
      actions.push(action('feature validate-spec', true, 'agent'));
      break;
    case 'PLANNING':
      actions.push(action('feature authorize-plan', true, 'human-confirmation'));
      break;
    case 'DELIVERING_SLICES': {
      actions.push(action('slice propose', true, 'agent'));
      for (const slice of projection.slices) {
        if (slice.state === 'PROPOSED') actions.push(action(`slice plan ${slice.id}`, true, 'agent'));
        if (slice.state === 'PLANNED') {
          actions.push(
            action(
              `slice start ${slice.id}`,
              projection.activeSliceId === null &&
                projection.implementationAuthorization.current,
              'agent',
              projection.activeSliceId === null
                ? []
                : [`slice ${projection.activeSliceId} is active`]
            )
          );
        }
      }
      const activeSlice = projection.slices.find(
        (slice) => slice.id === projection.activeSliceId
      );
      if (activeSlice?.state === 'IMPLEMENTING') {
        actions.push(action(`slice begin-boundary ${activeSlice.id}`, true, 'agent'));
      } else if (activeSlice?.state === 'PR_BOUNDARY') {
        const attempt = activeAttempt(projection);
        for (const gate of attempt?.gates ?? []) {
          if (
            gate.eligible &&
            (['UNSET', 'FAIL'].includes(gate.outcome) || gate.freshness !== 'CURRENT')
          ) {
            actions.push(
              action(`gate record ${attempt.id} ${gate.id}`, true, 'agent')
            );
          }
        }
        actions.push(
          action(
            `boundary request-review ${attempt?.id ?? '<attempt-id>'}`,
            attempt?.requiredCurrentAndNonblocking === true,
            'agent',
            attempt?.requiredCurrentAndNonblocking ? [] : ['boundary gates not current and nonblocking']
          )
        );
        actions.push(action(`slice remediate ${activeSlice.id}`, true, 'agent'));
      } else if (activeSlice?.state === 'HUMAN_REVIEW') {
        actions.push(action(`slice accept-review ${activeSlice.id}`, true, 'human-confirmation'));
        actions.push(action(`slice changes-requested ${activeSlice.id}`, true, 'human-confirmation'));
      }
      break;
    }
    case 'FINALIZING':
      actions.push(action('feature finalize', true, 'agent'));
      actions.push(action('slice propose', true, 'agent'));
      break;
    default:
      break;
  }
  return actions;
}

export async function status(featureHome, { gateFingerprints = {}, facts = {} } = {}) {
  const mode = await discoverFeatureMode(featureHome);
  if (mode.mode !== 'governed') {
    return successResult('status', {
      mode: mode.mode,
      featureHome: mode.featureHome,
      reason: mode.reason ?? null,
      projection: null,
      blockers: mode.mode === 'legacy' ? [] : [{ type: mode.mode }],
      nextActions: [],
      facts,
    });
  }
  const record = await readFeatureRecord(featureHome);
  const projection = projectRecord(record, { gateFingerprints });
  return successResult('status', {
    mode: 'governed',
    featureHome: mode.featureHome,
    projection,
    blockers: projectionBlockers(projection, facts),
    nextActions: nextActions(projection),
    facts,
  });
}

export async function next(featureHome, options = {}) {
  const result = await status(featureHome, options);
  return successResult('next', {
    mode: result.data.mode,
    featureId: result.data.projection?.featureId ?? null,
    actions: result.data.nextActions,
    blockers: result.data.blockers,
  });
}

export async function history(featureHome) {
  const record = await readFeatureRecord(featureHome);
  return successResult('history', {
    featureId: record.events[0].featureId,
    events: record.events.map((event) => ({
      sequence: event.sequence,
      eventId: event.eventId,
      recordedAt: event.recordedAt,
      type: event.type,
      actor: event.actor,
      payload: event.payload,
      modelHash: event.modelHash,
    })),
  });
}

export async function explain(featureHome, target, options = {}) {
  const result = await status(featureHome, options);
  const projection = result.data.projection;
  if (!projection) {
    return successResult('explain', { target, mode: result.data.mode, match: null });
  }
  const gate = projection.boundaryAttempts
    .flatMap((attempt) => attempt.gates.map((item) => ({ ...item, attemptId: attempt.id })))
    .find((item) => item.id === target);
  const change = projection.changes.find((item) => item.id === target);
  const slice = projection.slices.find((item) => item.id === target);
  const match = gate
    ? { kind: 'gate', value: gate }
    : change
      ? { kind: 'change', value: change }
      : slice
        ? { kind: 'slice', value: slice }
        : target === projection.feature.state
          ? { kind: 'feature-state', value: projection.feature }
          : null;
  return successResult('explain', { target, match });
}

export async function check(featureHome, assertion, options = {}) {
  const result = await status(featureHome, options);
  const projection = result.data.projection;
  const attempt = projection ? activeAttempt(projection) : null;
  const assertions = {
    governed: result.data.mode === 'governed',
    'not-blocked': result.data.blockers.length === 0,
    'implementation-authorized': projection?.implementationAuthorization.current === true,
    'boundary-ready': attempt?.requiredCurrentAndNonblocking === true,
  };
  if (!(assertion in assertions)) {
    return failureResult(
      'check',
      new ProtocolError('CHECK_UNKNOWN', `Unknown assertion: ${assertion}`)
    );
  }
  if (!assertions[assertion]) {
    return failureResult(
      'check',
      new ProtocolError('CHECK_FAILED', `Assertion failed: ${assertion}`, {
        blockers: result.data.blockers,
      })
    );
  }
  return successResult('check', { assertion, passed: true });
}

export async function graphFeature(featureHome, options = {}) {
  const result = await status(featureHome, options);
  if (!result.data.projection) {
    return successResult('graph', {
      mode: result.data.mode,
      graph: null,
    });
  }
  return successResult('graph', {
    mode: 'governed',
    graph: currentGraph(result.data.projection),
  });
}

export async function graphModel() {
  return successResult('graph --model', { graph: modelGraph(await loadDefaultModel()) });
}
