import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

import { parseHTML } from 'linkedom';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function idleState() {
  return {
    schemaVersion: 1,
    phase: 'idle',
    refreshing: false,
    githubPolling: false,
    selection: null,
    snapshot: null,
    error: null,
    preferences: { notificationsEnabled: false, recentWorktrees: ['/repo/recent'] },
  };
}

test('renderer presents selection first and then canonical observation status', async () => {
  const html = await readFile(resolve(desktopRoot, 'renderer/index.html'), 'utf8');
  const { window } = parseHTML(html);
  let subscriber;
  window.gatereeveDesktop = {
    async chooseWorktree() {},
    async openRecent() {},
    async refresh() {},
    async setNotificationsEnabled() { return idleState(); },
    async getState() { return idleState(); },
    subscribe(callback) { subscriber = callback; return () => {}; },
  };
  globalThis.window = window;
  globalThis.document = window.document;
  await import(`${pathToFileURL(resolve(desktopRoot, 'renderer/renderer.js')).href}?test=renderer`);
  await new Promise((done) => setImmediate(done));
  assert.equal(window.document.querySelector('#chooser').hidden, false);
  assert.equal(window.document.querySelector('#overview').hidden, true);
  assert.equal(window.document.querySelectorAll('.recent').length, 1);

  subscriber({
    ...idleState(),
    phase: 'ready',
    githubPolling: true,
    selection: { worktreePath: '/repo/current', featureHome: '/repo/current/docs/issues/feature' },
    snapshot: {
      schemaVersion: 1,
      mode: 'governed',
      featureId: 'feature',
      projection: { feature: { state: 'DELIVERING_SLICES' } },
      active: { sliceId: 'desktop-shell' },
      sources: {
        local: { status: 'current', detail: 'Local read' },
        git: { status: 'current', detail: 'Git topic' },
        github: { status: 'current', detail: 'PR open' },
      },
    },
  });
  assert.equal(window.document.querySelector('#chooser').hidden, true);
  assert.equal(window.document.querySelector('#overview').hidden, false);
  assert.equal(window.document.querySelector('#mode').textContent, 'governed');
  assert.equal(window.document.querySelector('#feature-state').textContent, 'DELIVERING_SLICES');
  assert.match(window.document.querySelector('#activity').textContent, /polling GitHub/);
  delete globalThis.window;
  delete globalThis.document;
});

test('renderer exposes state, gate, artifact, history, model, command, and Session inspection', async () => {
  const html = await readFile(resolve(desktopRoot, 'renderer/index.html'), 'utf8');
  const { window } = parseHTML(html);
  const copied = [];
  const notificationPreferences = [];
  const sessionId = 'session:latest-checkpoint:Q0hFQ0tQT0lOVC5tZA';
  const event = {
    sequence: 10,
    eventId: 'evt-review',
    recordedAt: '2026-08-26T12:00:00.000Z',
    type: 'HUMAN_REVIEW_REQUESTED',
    actor: { kind: 'agent', label: 'GateReeve' },
    modelHash: 'sha256:model',
    payload: { passage: { transitionId: 'request-human-review', guards: [] } },
  };
  const attempt = {
    id: 'slice-attempt-1',
    sliceId: 'slice',
    scope: 'SLICE',
    state: 'ACTIVE',
    context: { pullRequest: 8 },
    gates: [{
      id: 'verification',
      dependsOn: ['reconcile'],
      outcome: 'PASS',
      freshness: 'CURRENT',
      blockers: [],
      reason: null,
      evidence: { path: 'pr-8/verification.md' },
      recordedEventId: 'evt-gate',
    }],
  };
  const artifacts = [
    {
      id: 'design', label: 'Approved design', status: 'present', exists: true, unsafe: false,
      path: 'design.md', format: 'markdown', context: { kind: 'feature' },
    },
    {
      id: 'attempt:slice-attempt-1:gate:explainDiff', label: 'Explain diff', status: 'present',
      exists: true, unsafe: false, path: 'pr-8/explain-diff.html', format: 'html',
      context: { kind: 'gate', attemptId: 'slice-attempt-1', gateId: 'explainDiff' },
    },
  ];
  const snapshot = {
    schemaVersion: 1,
    mode: 'governed',
    featureId: 'feature',
    model: { pinned: { hash: 'sha256:model' }, bundled: {} },
    projection: {
      feature: { state: 'DELIVERING_SLICES' },
      suspension: { paused: false },
      slices: [{
        id: 'slice', name: 'Workflow experience', state: 'PR_BOUNDARY', branch: 'topic',
        scope: 'SLICE', planSteps: ['P6', 'P7'], activeAttemptId: 'slice-attempt-1',
      }],
      boundaryAttempts: [attempt],
    },
    active: { sliceId: 'slice', boundaryAttemptId: 'slice-attempt-1' },
    sources: {
      local: { status: 'current', detail: 'Local record' },
      git: { status: 'current', detail: 'Topic branch' },
      github: { status: 'current', detail: 'PR #8' },
    },
    blockers: [],
    warnings: [{ type: 'source-uncommitted', severity: 'activity' }],
    milestones: [{ id: 'delivery.boundary', label: 'PR boundary active', state: 'DELIVERING_SLICES', status: 'active' }],
    actions: [{
      id: 'boundary.request.review', command: 'boundary request-review slice-attempt-1',
      copyCommand: 'gatereeve boundary request-review slice-attempt-1',
      authority: 'agent', readiness: 'ready', inputs: [], reasons: [],
    }],
    artifacts,
    events: { count: 1, lastEventId: event.eventId, recent: [event] },
  };
  const readyState = {
    ...idleState(),
    phase: 'ready',
    selection: { worktreePath: '/repo/current', featureHome: '/repo/current/docs/issues/feature' },
    snapshot,
  };
  window.gatereeveDesktop = {
    async chooseWorktree() {},
    async openRecent() {},
    async refresh() {},
    async setNotificationsEnabled(enabled) {
      notificationPreferences.push(enabled);
      return { ...readyState, preferences: { ...readyState.preferences, notificationsEnabled: enabled } };
    },
    async getState() { return readyState; },
    async copyText(value) { copied.push(value); return true; },
    async openArtifact() { return true; },
    async revealArtifact() { return true; },
    async listSession() {
      return { schemaVersion: 1, items: [{
        id: sessionId, kind: 'latest-checkpoint', label: 'Latest checkpoint',
        path: 'CHECKPOINT.md', modifiedAt: '2026-08-26T12:00:00.000Z', size: 20,
      }] };
    },
    async readSession(id) {
      const item = (await this.listSession()).items[0];
      return { schemaVersion: 1, id, item, content: '# Current position\nReady.' };
    },
    async readDetail(kind, id) {
      if (kind === 'model') return {
        kind,
        data: {
          lock: { model: { presentation: { featureOrder: ['DESIGNING', 'DELIVERING_SLICES', 'COMPLETE'] } } },
          provenance: {
            pinned: { id: 'workflow', version: '1', hash: 'sha256:model' },
            bundled: { id: 'workflow', version: '1', hash: 'sha256:model' },
            migration: {
              relationship: 'bundled-newer',
              available: true,
              impact: { addedStates: ['FINALIZING'] },
            },
          },
          graph: {
            nodes: [
              { id: 'feature:DESIGNING', label: 'DESIGNING', group: 'Feature lifecycle' },
              { id: 'feature:DELIVERING_SLICES', label: 'DELIVERING_SLICES', group: 'Feature lifecycle' },
            ],
            edges: [{ id: 'edge', from: 'feature:DESIGNING', to: 'feature:DELIVERING_SLICES', label: 'approve', authority: 'human' }],
            mermaid: 'flowchart LR\n  DESIGNING --> DELIVERING_SLICES',
          },
        },
      };
      if (kind === 'events') return { kind, data: { events: [event] } };
      if (kind === 'attempt') return { kind, data: { attempt } };
      const artifact = artifacts.find((item) => item.id === id);
      return {
        kind,
        data: {
          artifact,
          content: artifact.format === 'html' ? '<html><body>Diff</body></html>' : '# Design\nApproved.',
          structured: null,
        },
      };
    },
    subscribe() { return () => {}; },
  };
  globalThis.window = window;
  globalThis.document = window.document;
  await import(`${pathToFileURL(resolve(desktopRoot, 'renderer/renderer.js')).href}?test=renderer-rich`);
  for (let index = 0; index < 3; index += 1) await new Promise((done) => setImmediate(done));

  assert.equal(
    window.document.querySelectorAll('.state-node').length,
    3,
    `${window.document.querySelector('#model-graph').textContent} | ${window.document.querySelector('#chooser-error').textContent}`,
  );
  assert.equal(window.document.querySelector('.state-node.current small').textContent, 'DELIVERING_SLICES');
  assert.equal(window.document.querySelectorAll('.gate-card').length, 1);
  assert.equal(window.document.querySelectorAll('.action-card').length, 1);
  const notifications = window.document.querySelector('#notifications');
  notifications.checked = true;
  notifications.dispatchEvent(new window.Event('change'));
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(notificationPreferences, [true]);
  assert.equal(notifications.checked, true);
  window.document.querySelector('.action-card button.secondary').click();
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(copied, ['gatereeve boundary request-review slice-attempt-1']);

  window.document.querySelector('[data-view="artifacts"]').click();
  window.document.querySelector('[data-artifact-id="design"]').click();
  await new Promise((done) => setImmediate(done));
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /Approved design/);
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /Approved\./);
  window.document.querySelector('[data-artifact-id="attempt:slice-attempt-1:gate:explainDiff"]').click();
  await new Promise((done) => setImmediate(done));
  assert.match(window.document.querySelector('#artifact-viewer iframe').getAttribute('src'), /^gatereeve-artifact:/);
  assert.equal(window.document.querySelector('#artifact-viewer iframe').hasAttribute('sandbox'), false);

  window.document.querySelector('[data-view="history"]').click();
  for (let index = 0; index < 2; index += 1) await new Promise((done) => setImmediate(done));
  window.document.querySelector('[data-event-id="evt-review"]').click();
  assert.match(window.document.querySelector('#history-detail').textContent, /Request human review/i);
  assert.match(window.document.querySelector('#history-detail').textContent, /request-human-review/);

  window.document.querySelector('[data-view="model"]').click();
  assert.equal(window.document.querySelectorAll('.model-state').length, 2);
  assert.match(window.document.querySelector('#model-mermaid').textContent, /flowchart/);
  assert.match(window.document.querySelector('#model-provenance').textContent, /Read-only migration impact/);

  window.document.querySelector('[data-view="session"]').click();
  for (let index = 0; index < 2; index += 1) await new Promise((done) => setImmediate(done));
  window.document.querySelector(`[data-session-id="${sessionId}"]`).click();
  await new Promise((done) => setImmediate(done));
  assert.match(window.document.querySelector('#session-detail').textContent, /non-authoritative/);
  assert.match(window.document.querySelector('#session-detail').textContent, /Current position/);

  delete globalThis.window;
  delete globalThis.document;
});

test('renderer reloads optional Session context when a refresh begins', async () => {
  const html = await readFile(resolve(desktopRoot, 'renderer/index.html'), 'utf8');
  const { window } = parseHTML(html);
  let subscriber;
  let sessionReads = 0;
  const state = {
    ...idleState(),
    phase: 'ready',
    selection: { worktreePath: '/repo/current', featureHome: '/repo/current/docs/issues/feature' },
    snapshot: {
      schemaVersion: 1,
      mode: 'governed',
      featureId: 'feature',
      model: null,
      projection: null,
      sources: {},
      artifacts: [],
      events: { count: 0, lastEventId: null, recent: [] },
    },
  };
  window.gatereeveDesktop = {
    async chooseWorktree() {},
    async openRecent() {},
    async refresh() {},
    async setNotificationsEnabled() { return state; },
    async getState() { return state; },
    async listSession() {
      sessionReads += 1;
      return { schemaVersion: 1, items: [] };
    },
    subscribe(callback) { subscriber = callback; return () => {}; },
  };
  globalThis.window = window;
  globalThis.document = window.document;
  await import(`${pathToFileURL(resolve(desktopRoot, 'renderer/renderer.js')).href}?test=session-refresh`);
  await new Promise((done) => setImmediate(done));

  window.document.querySelector('[data-view="session"]').click();
  await new Promise((done) => setImmediate(done));
  assert.equal(sessionReads, 1);

  subscriber({ ...state, refreshing: true });
  await new Promise((done) => setImmediate(done));
  assert.equal(sessionReads, 2);

  delete globalThis.window;
  delete globalThis.document;
});
