// @ts-check

function candidate(key, kind, title, body) {
  return { key, kind, title, body };
}

function eventCandidates(snapshot) {
  const result = [];
  for (const event of snapshot?.events?.recent ?? []) {
    if (event.type === 'HUMAN_REVIEW_REQUESTED') {
      result.push(candidate(
        `attention:event:${event.eventId}`,
        'human-attention',
        'GateReeve needs your review',
        `Review is ready for ${event.payload?.sliceId ?? snapshot.featureId ?? 'the current feature'}.`,
      ));
    }
    if (event.type === 'SLICE_MERGE_RECORDED') {
      const pullRequest = event.payload?.pullRequest;
      result.push(candidate(
        pullRequest ? `merge:pr:${pullRequest}` : `merge:event:${event.eventId}`,
        'pull-request-merged',
        pullRequest ? `Pull request #${pullRequest} merged` : 'Pull request slice merged',
        `${event.payload?.sliceId ?? 'The current slice'} is recorded on ${event.payload?.integrationBranch ?? 'the integration branch'}.`,
      ));
    }
    if (event.type === 'FEATURE_FINALIZED') {
      result.push(candidate(
        `complete:feature:${snapshot.featureId ?? 'selected'}`,
        'feature-complete',
        'GateReeve feature complete',
        `${snapshot.featureId ?? 'The selected feature'} has completed its governed workflow.`,
      ));
    }
  }
  return result;
}

function conditionCandidates(snapshot) {
  const result = [];
  for (const action of snapshot?.actions ?? []) {
    if (action.authority === 'human-confirmation' && action.readiness === 'ready') {
      result.push(candidate(
        `attention:action:${action.id}`,
        'human-attention',
        'GateReeve needs your confirmation',
        `${action.command} is ready and requires human confirmation.`,
      ));
    }
  }
  for (const attempt of snapshot?.projection?.boundaryAttempts ?? []) {
    for (const gate of attempt.gates ?? []) {
      if (gate.outcome === 'FAIL') {
        result.push(candidate(
          `gate:failed:${attempt.id}:${gate.id}`,
          'gate-failed',
          'GateReeve gate failed',
          `${gate.id} failed in ${attempt.id}${gate.reason ? `: ${gate.reason}` : '.'}`,
        ));
      }
      if (gate.freshness === 'STALE') {
        result.push(candidate(
          `gate:stale:${attempt.id}:${gate.id}`,
          'gate-stale',
          'GateReeve gate is stale',
          `${gate.id} must be refreshed in ${attempt.id}.`,
        ));
      }
    }
  }
  if (snapshot?.mode === 'inconsistent') {
    result.push(candidate(
      'state:inconsistent',
      'inconsistent',
      'GateReeve record is inconsistent',
      'The selected feature record needs attention before its state can be trusted.',
    ));
  }
  if (snapshot?.projection?.suspension?.paused === true || snapshot?.mode === 'suspended') {
    result.push(candidate(
      'state:suspended',
      'suspended',
      'GateReeve feature suspended',
      `${snapshot.featureId ?? 'The selected feature'} is paused.`,
    ));
  }
  if (snapshot?.projection?.feature?.state === 'COMPLETE') {
    result.push(candidate(
      `complete:feature:${snapshot.featureId ?? 'selected'}`,
      'feature-complete',
      'GateReeve feature complete',
      `${snapshot.featureId ?? 'The selected feature'} has completed its governed workflow.`,
    ));
  }
  return result;
}

export function notificationCandidates(snapshot, pullRequest = null) {
  const values = [...eventCandidates(snapshot), ...conditionCandidates(snapshot)];
  if (pullRequest?.state === 'MERGED') {
    values.push(candidate(
      `merge:pr:${pullRequest.number}`,
      'pull-request-merged',
      `Pull request #${pullRequest.number} merged`,
      pullRequest.mergedAt ? `Merged at ${pullRequest.mergedAt}.` : 'The observed pull request is merged.',
    ));
  }
  return new Map(values.map((item) => [item.key, item]));
}

export function createNotificationObserver({ notify }) {
  if (typeof notify !== 'function') throw new TypeError('Notification observer requires a notifier.');
  let active = new Map();
  let observedEvents = new Set();

  function eventIdentity(key) {
    return key.startsWith('attention:event:')
      || key.startsWith('merge:')
      || key.startsWith('complete:');
  }

  return Object.freeze({
    reset(snapshot = null, pullRequest = null) {
      active = notificationCandidates(snapshot, pullRequest);
      observedEvents = new Set([...active.keys()].filter(eventIdentity));
    },
    observe(snapshot, pullRequest = null) {
      const next = notificationCandidates(snapshot, pullRequest);
      const emitted = [];
      for (const [key, item] of next) {
        if (active.has(key) || observedEvents.has(key)) continue;
        try {
          notify(item);
          emitted.push(item);
          if (eventIdentity(key)) observedEvents.add(key);
        } catch {
          // Native notification failures must not degrade canonical observation.
        }
      }
      active = next;
      return emitted;
    },
  });
}
