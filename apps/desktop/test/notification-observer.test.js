import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNotificationObserver,
  notificationCandidates,
} from '../main/notification-observer.js';

function snapshot({
  mode = 'governed',
  state = 'DELIVERING_SLICES',
  paused = false,
  events = [],
  gates = [],
  actions = [],
} = {}) {
  return {
    mode,
    featureId: 'desktop-fixture',
    projection: {
      feature: { state },
      suspension: { paused },
      boundaryAttempts: gates.length ? [{ id: 'attempt-1', gates }] : [],
    },
    events: { recent: events },
    actions,
  };
}

test('notification candidates cover every specified attention class', () => {
  const values = notificationCandidates(snapshot({
    mode: 'inconsistent',
    paused: true,
    state: 'COMPLETE',
    events: [
      { type: 'HUMAN_REVIEW_REQUESTED', eventId: 'evt-review', payload: { sliceId: 'slice-1' } },
      { type: 'SLICE_MERGE_RECORDED', eventId: 'evt-merge', payload: { pullRequest: 8, sliceId: 'slice-1' } },
    ],
    gates: [
      { id: 'verification', outcome: 'FAIL', freshness: 'CURRENT', reason: 'Tests failed' },
      { id: 'judge', outcome: 'PASS', freshness: 'STALE', reason: null },
    ],
    actions: [{ id: 'approve', command: 'feature approve', authority: 'human-confirmation', readiness: 'ready' }],
  })).values();
  assert.deepEqual(new Set([...values].map((item) => item.kind)), new Set([
    'human-attention', 'pull-request-merged', 'gate-failed', 'gate-stale',
    'inconsistent', 'suspended', 'feature-complete',
  ]));
});

test('observer establishes a quiet baseline and emits only newly entered transitions', () => {
  const emitted = [];
  const observer = createNotificationObserver({ notify: (item) => emitted.push(item) });
  const failing = snapshot({
    gates: [{ id: 'verification', outcome: 'FAIL', freshness: 'CURRENT', reason: null }],
  });
  observer.reset(failing);
  assert.deepEqual(observer.observe(failing), []);
  assert.deepEqual(emitted, []);

  const clear = snapshot();
  assert.deepEqual(observer.observe(clear), []);
  assert.equal(observer.observe(failing).length, 1);
  assert.equal(emitted.length, 1);
  assert.deepEqual(observer.observe(failing), []);
});

test('event and GitHub observations deduplicate the same pull-request merge', () => {
  const emitted = [];
  const observer = createNotificationObserver({ notify: (item) => emitted.push(item) });
  observer.reset(snapshot());
  const merged = { number: 12, state: 'MERGED', mergedAt: '2026-08-27T00:00:00Z' };
  observer.observe(snapshot(), merged);
  observer.observe(snapshot(), null);
  observer.observe(snapshot({
    events: [{
      type: 'SLICE_MERGE_RECORDED', eventId: 'evt-merge',
      payload: { pullRequest: 12, sliceId: 'slice-1', integrationBranch: 'main' },
    }],
  }), null);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].key, 'merge:pr:12');
});
