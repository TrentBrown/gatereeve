// @ts-check

function candidate(key, kind, title, body) {
  return { key, kind, title, body };
}

function eventCandidates(snapshot) {
  const result = [];
  for (const event of snapshot?.recentEvents ?? []) {
    if (event.type === 'MILESTONE' && event.payload.name === 'acceptance') result.push(candidate(
      `attention:event:${event.hash}`, 'human-attention', 'GateReeve needs your review',
      `Current validation proof is ready for ${snapshot.featureId}.`,
    ));
    if (event.type === 'INTEGRATED') result.push(candidate(
      `merge:event:${event.hash}`, 'integration-observed', 'GateReeve integration observed',
      `${event.payload.repository} is verified on ${event.payload.branch}. Acceptance remains separate.`,
    ));
  }
  return result;
}
function conditionCandidates(snapshot) {
  const result = [];
  const outcomes = new Map((snapshot?.milestones ?? []).flatMap(item => item.outcomes ?? []).map(item => [item.id, item]));
  for (const gate of outcomes.values()) {
    if (gate.outcome === 'FAIL') result.push(candidate(
      `gate:failed:${gate.id}`, 'gate-failed', 'GateReeve gate failed',
      `${gate.id} failed${gate.exception ? ' (accepted scoped exception)' : ''}${gate.reason ? `: ${gate.reason}` : '.'}`,
    ));
    if (!gate.result && gate.reason) result.push(candidate(
      `gate:stale:${gate.id}`, 'gate-stale', 'GateReeve evidence needs attention', `${gate.id}: ${gate.reason}`,
    ));
  }
  if (snapshot?.current?.paused) result.push(candidate('state:suspended', 'suspended', 'GateReeve feature paused', `${snapshot.featureId} is paused.`));
  if (snapshot?.current?.phase === 'COMPLETE') result.push(candidate(`complete:feature:${snapshot.featureId}`, 'feature-complete', 'GateReeve feature complete', `${snapshot.featureId} has completed its governed workflow.`));
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
