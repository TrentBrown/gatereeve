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
  ]);

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
