// @ts-check

import { fetchDesktopUpdateManifest } from './update-client.js';
import { requireUpdateState } from '../shared/contracts.js';
import {
  desktopReleasePage,
  parseDesktopVersion,
  selectDesktopUpdate,
} from './update-manifest.js';

export const AUTOMATIC_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1_000;
export const UPDATE_STATE_SCHEMA_VERSION = 1;

export function initialUpdateState(currentVersion) {
  parseDesktopVersion(currentVersion);
  return {
    schemaVersion: UPDATE_STATE_SCHEMA_VERSION,
    status: 'idle',
    source: null,
    currentVersion,
    checkedAt: null,
    available: null,
    detail: null,
  };
}

function checkedState(currentVersion, source, checkedAt, release) {
  return requireUpdateState({
    schemaVersion: UPDATE_STATE_SCHEMA_VERSION,
    status: release === null ? 'current' : 'available',
    source,
    currentVersion,
    checkedAt,
    available: release === null ? null : {
      version: release.version,
      channel: parseDesktopVersion(release.version).channel,
      publishedAt: release.publishedAt,
    },
    detail: release === null ? 'GateReeve Desktop is current.' : null,
  });
}

function unavailableState(currentVersion, source, checkedAt) {
  return requireUpdateState({
    schemaVersion: UPDATE_STATE_SCHEMA_VERSION,
    status: 'unavailable',
    source,
    currentVersion,
    checkedAt,
    available: null,
    detail: 'Update information is temporarily unavailable.',
  });
}

function cacheIsFresh(cache, now) {
  if (cache.checkedAt === null) return false;
  const age = now.valueOf() - Date.parse(cache.checkedAt);
  return age >= 0 && age < AUTOMATIC_UPDATE_INTERVAL_MS;
}

export function createUpdateCoordinator({
  currentVersion,
  cacheStore,
  fetchManifest = fetchDesktopUpdateManifest,
  now = () => new Date(),
  notificationsEnabled = () => false,
  notify = () => {},
} = {}) {
  parseDesktopVersion(currentVersion);
  if (!cacheStore?.load || !cacheStore?.save) {
    throw new TypeError('Update coordinator requires a cache store.');
  }
  let state = initialUpdateState(currentVersion);
  let cache = null;
  let inFlight = null;
  let abortController = null;
  let closed = false;
  const subscribers = new Set();

  function publish() {
    const value = requireUpdateState(state);
    for (const subscriber of subscribers) subscriber(value);
    return value;
  }

  async function persist() {
    if (cache === null) return;
    try { cache = await cacheStore.save(cache); } catch {
      // Cache persistence must never interfere with local GateReeve use.
    }
  }

  async function performCheck(source) {
    state = requireUpdateState({
      ...initialUpdateState(currentVersion),
      status: 'checking',
      source,
      detail: source === 'manual' ? 'Checking for updates…' : null,
    });
    publish();
    abortController = new AbortController();
    const checkedAt = now().toISOString();
    try {
      const manifest = await fetchManifest({ signal: abortController.signal });
      const release = selectDesktopUpdate(currentVersion, manifest);
      state = checkedState(currentVersion, source, checkedAt, release);
    } catch {
      if (closed) return state;
      state = unavailableState(currentVersion, source, checkedAt);
    } finally {
      abortController = null;
    }
    if (closed) return state;
    cache = {
      schemaVersion: 1,
      checkedAt,
      result: state,
      lastNotifiedVersion: cache?.lastNotifiedVersion ?? null,
    };
    await persist();
    if (
      state.status === 'available'
      && notificationsEnabled() === true
      && cache.lastNotifiedVersion !== state.available.version
    ) {
      try {
        notify({
          key: `desktop-update:${state.available.version}`,
          kind: 'desktop-update',
          title: 'GateReeve Desktop update available',
          body: `Version ${state.available.version} is ready to view.`,
        });
        cache = { ...cache, lastNotifiedVersion: state.available.version };
        await persist();
      } catch {
        // Native notification failures do not change the in-app result.
      }
    }
    return publish();
  }

  function check(source = 'manual') {
    if (!['automatic', 'manual'].includes(source)) {
      throw new TypeError('Update check source must be automatic or manual.');
    }
    if (closed) return Promise.resolve(state);
    if (inFlight !== null) return inFlight;
    inFlight = performCheck(source).finally(() => { inFlight = null; });
    return inFlight;
  }

  return Object.freeze({
    current: () => requireUpdateState(state),
    async initialize() {
      try { cache = await cacheStore.load(); } catch { cache = null; }
      if (cache?.result !== null && cache?.result !== undefined) {
        try {
          const cached = requireUpdateState(cache.result);
          if (cached.currentVersion === currentVersion && !['idle', 'checking'].includes(cached.status)) {
            state = { ...cached, source: 'cache' };
            publish();
          }
        } catch {
          cache = null;
        }
      }
      if (!cacheIsFresh(cache ?? { checkedAt: null }, now())) void check('automatic');
      return state;
    },
    check,
    releasePage() {
      if (state.status !== 'available') throw new Error('No Desktop update is available.');
      return desktopReleasePage(state.available.version);
    },
    subscribe(callback) {
      if (typeof callback !== 'function') throw new TypeError('Update subscriber must be a function.');
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    close() {
      closed = true;
      abortController?.abort();
      subscribers.clear();
    },
  });
}
