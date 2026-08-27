import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createDesktopCoordinator, GITHUB_POLL_MS } from '../main/coordinator.js';
import { defaultPreferences } from '../main/preferences.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function snapshot(featureHome, sources) {
  return {
    schemaVersion: 1,
    mode: 'governed',
    featureHome,
    featureId: 'desktop-fixture',
    projection: { feature: { state: 'DELIVERING_SLICES' } },
    active: { sliceId: 'shell' },
    artifacts: [],
    sources,
  };
}

test('selection publishes local state before enrichment and polls GitHub only while needed', async () => {
  const worktree = await mkdtemp(join(tmpdir(), 'gatereeve-worktree-'));
  const gitDeferred = deferred();
  const gitStarted = deferred();
  const saved = [];
  const intervals = [];
  const closedWatchers = [];
  let githubCalls = 0;
  const protocol = {
    async resolve(path) { return { featureHome: join(path, 'docs/issues/desktop-fixture') }; },
    async snapshot(featureHome, options) { return snapshot(featureHome, options.sources); },
    async read() { return { schemaVersion: 1, kind: 'model' }; },
  };
  const coordinator = createDesktopCoordinator({
    protocol,
    preferenceStore: {
      async load() { return defaultPreferences(); },
      async save(value) { saved.push(value); return value; },
    },
    gitObserver: () => {
      gitStarted.resolve();
      return gitDeferred.promise;
    },
    githubObserver: async () => {
      githubCalls += 1;
      if (githubCalls === 2) {
        return {
          source: { status: 'unavailable', detail: 'offline', checkedAt: 'now' },
          pullRequest: null,
          needsPolling: null,
        };
      }
      const open = githubCalls === 1;
      return {
        source: { status: 'current', detail: open ? 'PR open' : 'PR merged', checkedAt: 'now' },
        pullRequest: { state: open ? 'OPEN' : 'MERGED', checks: [] },
        needsPolling: open,
      };
    },
    watcherFactory: async () => ({ close() { closedWatchers.push(true); } }),
    setIntervalFn(callback, delay) {
      intervals.push({ callback, delay, cleared: false });
      return intervals.at(-1);
    },
    clearIntervalFn(timer) { timer.cleared = true; },
    now: () => new Date('2026-08-26T12:00:00Z'),
  });

  await coordinator.initialize();
  const opening = coordinator.open(worktree);
  await gitStarted.promise;
  assert.equal(coordinator.current().phase, 'ready');
  assert.equal(coordinator.current().snapshot.sources.git.status, 'not-checked');
  assert.equal(coordinator.current().snapshot.sources.github.status, 'not-checked');
  assert.equal(coordinator.current().refreshing, true);

  gitDeferred.resolve({
    source: { status: 'current', detail: 'Git current', checkedAt: 'now' },
    facts: { worktree: { sourceDirty: false } },
    repositoryRoot: worktree,
    branch: 'topic',
  });
  await opening;
  assert.equal(coordinator.current().snapshot.sources.git.status, 'current');
  assert.equal(coordinator.current().snapshot.sources.github.detail, 'PR open');
  assert.equal(coordinator.current().githubPolling, true);
  assert.equal(intervals[0].delay, GITHUB_POLL_MS);
  assert.equal(saved.length, 1);
  assert.deepEqual(Object.keys(saved[0]).sort(), [
    'lastWorktree', 'recentWorktrees', 'schemaVersion', 'window',
    'notificationsEnabled', 'selectedAgents',
  ].sort());

  intervals[0].callback();
  for (let index = 0; index < 4; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(coordinator.current().snapshot.sources.github.detail, 'offline');
  assert.equal(coordinator.current().githubPolling, true);
  intervals[0].callback();
  for (let index = 0; index < 4; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(coordinator.current().snapshot.sources.github.detail, 'PR merged');
  assert.equal(coordinator.current().githubPolling, false);
  assert.equal(intervals[0].cleared, true);
  coordinator.close();
  assert.equal(closedWatchers.length, 1);
});

test('unavailable GitHub enrichment preserves a readable local snapshot', async () => {
  const worktree = await mkdtemp(join(tmpdir(), 'gatereeve-worktree-'));
  const coordinator = createDesktopCoordinator({
    protocol: {
      async resolve(path) { return { featureHome: join(path, 'docs/issues/fixture') }; },
      async snapshot(featureHome, options) { return snapshot(featureHome, options.sources); },
      async read() { throw new Error('not used'); },
    },
    preferenceStore: {
      async load() { return defaultPreferences(); },
      async save(value) { return value; },
    },
    gitObserver: async () => ({
      source: { status: 'current', detail: 'Git current', checkedAt: 'now' },
      facts: {}, repositoryRoot: worktree, branch: 'topic',
    }),
    githubObserver: async () => ({
      source: { status: 'unavailable', detail: 'offline', checkedAt: 'now' },
      pullRequest: null, needsPolling: false,
    }),
    watcherFactory: async () => ({ close() {} }),
  });
  await coordinator.initialize();
  const state = await coordinator.open(worktree);
  assert.equal(state.phase, 'ready');
  assert.equal(state.snapshot.sources.local.status, 'current');
  assert.equal(state.snapshot.sources.github.status, 'unavailable');
  assert.equal(state.error, null);
  assert.equal(state.githubPolling, false);
  coordinator.close();
});

test('notifications are opt-in, baseline current state, deduplicate refreshes, and stop with the coordinator', async () => {
  const worktree = await mkdtemp(join(tmpdir(), 'gatereeve-worktree-'));
  let gate = null;
  const emitted = [];
  let watcherClosed = false;
  const coordinator = createDesktopCoordinator({
    protocol: {
      async resolve(path) { return { featureHome: join(path, 'docs/issues/fixture') }; },
      async snapshot(featureHome, options) {
        return {
          ...snapshot(featureHome, options.sources),
          projection: {
            feature: { state: 'DELIVERING_SLICES' },
            suspension: { paused: false },
            boundaryAttempts: gate === null ? [] : [{ id: 'attempt-1', gates: [gate] }],
          },
          events: { recent: [] },
          actions: [],
        };
      },
      async read() { throw new Error('not used'); },
    },
    preferenceStore: {
      async load() { return defaultPreferences(); },
      async save(value) { return value; },
    },
    gitObserver: async () => ({
      source: { status: 'current', detail: 'Git current', checkedAt: 'now' },
      facts: {}, repositoryRoot: worktree, branch: 'topic',
    }),
    githubObserver: async () => ({
      source: { status: 'current', detail: 'No PR', checkedAt: 'now' },
      pullRequest: null, needsPolling: false,
    }),
    watcherFactory: async () => ({ close() { watcherClosed = true; } }),
    notify: (item) => emitted.push(item),
  });

  await coordinator.initialize();
  await coordinator.open(worktree);
  gate = { id: 'verification', outcome: 'FAIL', freshness: 'CURRENT', reason: null };
  await coordinator.refresh();
  assert.deepEqual(emitted, []);

  await coordinator.setNotificationsEnabled(true);
  await coordinator.refresh();
  assert.deepEqual(emitted, []);
  gate = null;
  await coordinator.refresh();
  gate = { id: 'verification', outcome: 'FAIL', freshness: 'CURRENT', reason: null };
  await coordinator.refresh();
  assert.equal(emitted.length, 1);
  await coordinator.refresh();
  assert.equal(emitted.length, 1);

  coordinator.close();
  assert.equal(watcherClosed, true);
});

test('selected-agent Setup persists explicit choice and rechecks without requiring a worktree', async () => {
  const observed = [];
  const saved = [];
  const coordinator = createDesktopCoordinator({
    protocol: {},
    preferenceStore: {
      async load() { return defaultPreferences(); },
      async save(value) { saved.push(value); return value; },
    },
    async setupObserver(selectedAgents) {
      observed.push([...selectedAgents]);
      return {
        schemaVersion: 1,
        phase: selectedAgents.length === 0 ? 'unconfigured' : 'incomplete',
        operationalReady: false,
        checkedAt: selectedAgents.length === 0 ? null : '2026-08-27T12:00:00.000Z',
        desktop: { version: '0.1.0' },
        selectedAgents,
        prerequisites: [],
        agents: [],
      };
    },
  });
  await coordinator.initialize();
  const state = await coordinator.setSelectedAgents(['claude']);
  assert.deepEqual(observed, [[], ['claude']]);
  assert.deepEqual(state.preferences.selectedAgents, ['claude']);
  assert.equal(state.setup.phase, 'incomplete');
  assert.deepEqual(saved.at(-1).selectedAgents, ['claude']);
  assert.equal(state.selection, null);
  await coordinator.recheckSetup();
  assert.deepEqual(observed.at(-1), ['claude']);
  coordinator.close();
});
