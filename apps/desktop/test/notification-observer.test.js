import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNotificationObserver,
  notificationCandidates,
} from '../main/notification-observer.js';

function snapshot({
  mode = 'governed',
  state = 'IMPLEMENTING',
  paused = false,
  events = [],
  gates = [],
  actions = [],
} = {}) {
  return {
    mode,
    featureId: 'desktop-fixture',
    current: { phase: state, paused },
    milestones: [{ outcomes: gates }],
    recentEvents: events,
    actions,
  };
}

test('notification candidates cover every specified attention class', () => {
  const values = notificationCandidates(snapshot({
    mode: 'inconsistent',
    paused: true,
    state: 'COMPLETE',
    events: [
      { type: 'MILESTONE', hash: 'evt-review', payload: { name: 'acceptance' } },
      { type: 'INTEGRATED', hash: 'evt-merge', payload: { repository: 'app', branch: 'main' } },
    ],
    gates: [
      { id: 'verification', outcome: 'FAIL', result: { hash: 'proof' }, reason: 'Tests failed' },
      { id: 'judge', outcome: 'UNAVAILABLE', result: null, reason: 'Source changed' },
    ],
    actions: [{ id: 'approve', command: 'feature approve', authority: 'human-confirmation', readiness: 'ready' }],
  })).values();
  assert.deepEqual(new Set([...values].map((item) => item.kind)), new Set([
    'human-attention', 'integration-observed', 'gate-failed', 'gate-stale', 'suspended', 'feature-complete',
  ]));
});

test('observer establishes a quiet baseline and emits only newly entered transitions', () => {
  const emitted = [];
  const observer = createNotificationObserver({ notify: (item) => emitted.push(item) });
  const failing = snapshot({
    gates: [{ id: 'verification', outcome: 'FAIL', result: { hash: 'proof' }, reason: null }],
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

test('repeated hosted observations deduplicate the same pull-request merge', () => {
  const emitted = []; const observer = createNotificationObserver({ notify: item => emitted.push(item) });
  observer.reset(snapshot()); const pr = { number: 12, state: 'MERGED' };
  observer.observe(snapshot(), pr); observer.observe(snapshot(), null); observer.observe(snapshot(), pr);
  assert.equal(emitted.length, 1);
});
