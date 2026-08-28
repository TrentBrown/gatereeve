import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTOMATIC_UPDATE_INTERVAL_MS,
  createUpdateCoordinator,
} from '../main/update-coordinator.js';
import { emptyUpdateCache } from '../main/update-cache.js';

function release(version) {
  return {
    version,
    publishedAt: '2026-08-28T00:00:00.000Z',
    sourceCommit: 'a'.repeat(40),
    artifact: { name: `GateReeve-${version}-macos-universal.dmg`, bytes: 1, sha256: 'b'.repeat(64) },
    appleTrust: {
      developerIdApplication: true, hardenedRuntime: true, secureTimestamp: true,
      notarized: true, stapled: true, gatekeeperAccepted: true,
    },
  };
}

function manifest(rc = null, stable = null) {
  return {
    schemaVersion: 1,
    product: 'gatereeve-desktop',
    generatedAt: rc === null && stable === null ? null : '2026-08-28T00:00:00.000Z',
    channels: { stable, rc },
  };
}

function memoryStore(initial = emptyUpdateCache()) {
  let value = initial;
  return {
    async load() { return value; },
    async save(next) { value = structuredClone(next); return value; },
    value: () => value,
  };
}

async function settle() {
  for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setImmediate(resolve));
}

test('starts a stale automatic check without blocking initialization and caches its result', async () => {
  const store = memoryStore();
  let resolveFetch;
  const coordinator = createUpdateCoordinator({
    currentVersion: '0.1.0-rc.3',
    cacheStore: store,
    now: () => new Date('2026-08-28T12:00:00.000Z'),
    fetchManifest: () => new Promise((resolve) => { resolveFetch = resolve; }),
  });
  await coordinator.initialize();
  assert.equal(coordinator.current().status, 'checking');
  resolveFetch(manifest(release('0.1.0-rc.4')));
  await settle();
  assert.equal(coordinator.current().status, 'available');
  assert.equal(coordinator.current().available.version, '0.1.0-rc.4');
  assert.equal(store.value().checkedAt, '2026-08-28T12:00:00.000Z');
});

test('a fresh cache suppresses automatic network access while manual checks are always fresh', async () => {
  const checkedAt = '2026-08-28T00:00:00.000Z';
  const cachedState = {
    schemaVersion: 1, status: 'current', source: 'automatic', currentVersion: '0.1.0',
    checkedAt, available: null, detail: 'GateReeve Desktop is current.',
  };
  const store = memoryStore({
    schemaVersion: 1, checkedAt, result: cachedState, lastNotifiedVersion: null,
  });
  let calls = 0;
  const coordinator = createUpdateCoordinator({
    currentVersion: '0.1.0', cacheStore: store,
    now: () => new Date(Date.parse(checkedAt) + AUTOMATIC_UPDATE_INTERVAL_MS - 1),
    fetchManifest: async () => { calls += 1; return manifest(null, release('0.1.1')); },
  });
  await coordinator.initialize();
  assert.equal(coordinator.current().source, 'cache');
  assert.equal(calls, 0);
  await coordinator.check('manual');
  assert.equal(calls, 1);
  assert.equal(coordinator.current().available.version, '0.1.1');
});

test('failures become quiet unavailable state and never reject the caller', async () => {
  const coordinator = createUpdateCoordinator({
    currentVersion: '0.1.0', cacheStore: memoryStore(),
    fetchManifest: async () => { throw new Error('network details must not escape'); },
  });
  const state = await coordinator.check('manual');
  assert.equal(state.status, 'unavailable');
  assert.equal(state.detail, 'Update information is temporarily unavailable.');
});

test('native update notification is opt-in and deduplicated across persisted checks', async () => {
  const store = memoryStore();
  const emitted = [];
  const coordinator = createUpdateCoordinator({
    currentVersion: '0.1.0-rc.3', cacheStore: store,
    fetchManifest: async () => manifest(release('0.1.0-rc.4')),
    notificationsEnabled: () => true,
    notify: (item) => emitted.push(item),
  });
  await coordinator.check('manual');
  await coordinator.check('manual');
  assert.equal(emitted.length, 1);
  assert.equal(store.value().lastNotifiedVersion, '0.1.0-rc.4');
  assert.equal(
    coordinator.releasePage(),
    'https://github.com/TrentBrown/gatereeve/releases/tag/v0.1.0-rc.4',
  );
});
