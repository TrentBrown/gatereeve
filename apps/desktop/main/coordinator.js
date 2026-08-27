// @ts-check

import { realpath, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import {
  DESKTOP_STATE_SCHEMA_VERSION,
  requireDesktopState,
  requireSelectedAgents,
  requireSetupState,
} from '../shared/contracts.js';
import { observeGit } from './git-observer.js';
import { observeGitHub } from './github-observer.js';
import { createNotificationObserver } from './notification-observer.js';
import { rememberWorktree, selectAgents } from './preferences.js';
import { listSessionContext, readSessionContext } from './session-observer.js';
import { createWorktreeWatcher } from './worktree-watcher.js';

const GITHUB_POLL_MS = 60_000;

function defaultSetup() {
  return {
    schemaVersion: 1,
    phase: 'unconfigured',
    operationalReady: false,
    checkedAt: null,
    desktop: { version: '0.1.0' },
    selectedAgents: [],
    prerequisites: [],
    agents: [],
  };
}

function timestamp(now) {
  return now().toISOString();
}

function localSources(now) {
  return {
    local: { status: 'current', detail: 'Canonical feature record read locally', checkedAt: timestamp(now) },
    git: { status: 'not-checked', detail: null, checkedAt: null },
    github: { status: 'not-checked', detail: null, checkedAt: null },
  };
}

function safeError(error) {
  return {
    code: typeof error?.code === 'string' ? error.code : 'DESKTOP_OBSERVATION_ERROR',
    message: error instanceof Error ? error.message : String(error),
  };
}

async function requireDirectory(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) {
    throw new Error('Choose an absolute worktree path.');
  }
  const canonical = await realpath(path);
  if (!(await stat(canonical)).isDirectory()) throw new Error('The selected worktree is not a directory.');
  return canonical;
}

export function createDesktopCoordinator({
  protocol,
  preferenceStore,
  gitObserver = observeGit,
  githubObserver = observeGitHub,
  watcherFactory = createWorktreeWatcher,
  now = () => new Date(),
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  initialPreferences = null,
  initialSetup = defaultSetup(),
  setupObserver = async () => defaultSetup(),
  notify = () => {},
} = {}) {
  let preferences = initialPreferences;
  let selection = null;
  let snapshot = null;
  let phase = 'idle';
  let refreshing = false;
  let error = null;
  let watcher = null;
  let pollTimer = null;
  let pollRequired = false;
  let generation = 0;
  let currentFacts = {};
  let currentSources = localSources(now);
  let gitContext = { repositoryRoot: null, branch: null };
  let currentPullRequest = null;
  let setup = requireSetupState(initialSetup);
  const notificationObserver = createNotificationObserver({ notify });
  const subscribers = new Set();

  function state() {
    return requireDesktopState({
      schemaVersion: DESKTOP_STATE_SCHEMA_VERSION,
      phase,
      refreshing,
      githubPolling: pollTimer !== null,
      selection,
      snapshot,
      error,
      setup,
      preferences: {
        recentWorktrees: preferences?.recentWorktrees ?? [],
        notificationsEnabled: preferences?.notificationsEnabled === true,
        selectedAgents: preferences?.selectedAgents ?? [],
      },
    });
  }

  function publish() {
    const value = state();
    for (const subscriber of subscribers) subscriber(value);
    return value;
  }

  function stopPolling() {
    if (pollTimer !== null) clearIntervalFn(pollTimer);
    pollTimer = null;
  }

  function updatePolling(required) {
    pollRequired = required;
    if (!required) {
      stopPolling();
      return;
    }
    if (pollTimer === null) {
      pollTimer = setIntervalFn(() => void refreshGitHub(), GITHUB_POLL_MS);
    }
  }

  async function replaceWatcher(featureHome, token) {
    watcher?.close();
    watcher = await watcherFactory(featureHome, async () => {
      if (token === generation) await refresh('filesystem');
    });
    if (token !== generation) {
      watcher.close();
      watcher = null;
    }
  }

  async function localObservation(worktreePath, token) {
    const context = await protocol.resolve(worktreePath);
    if (token !== generation) return false;
    currentFacts = {};
    currentPullRequest = null;
    currentSources = localSources(now);
    const nextSnapshot = await protocol.snapshot(context.featureHome, {
      facts: currentFacts,
      sources: currentSources,
    });
    if (token !== generation) return false;
    selection = { worktreePath, featureHome: context.featureHome };
    snapshot = nextSnapshot;
    phase = 'ready';
    error = null;
    publish();
    return true;
  }

  async function enrich(token) {
    if (token !== generation || selection === null) return;
    const git = await gitObserver(selection.worktreePath, selection.featureHome);
    if (token !== generation || selection === null) return;
    gitContext = { repositoryRoot: git.repositoryRoot, branch: git.branch };
    currentFacts = { ...currentFacts, ...git.facts };
    currentSources = { ...currentSources, git: git.source };
    snapshot = await protocol.snapshot(selection.featureHome, {
      facts: currentFacts,
      sources: currentSources,
    });
    publish();

    const github = await githubObserver(git.repositoryRoot, git.branch);
    if (token !== generation || selection === null) return;
    currentSources = { ...currentSources, github: github.source };
    currentPullRequest = github.pullRequest;
    currentFacts = { ...currentFacts, github: { pullRequest: github.pullRequest } };
    snapshot = await protocol.snapshot(selection.featureHome, {
      facts: currentFacts,
      sources: currentSources,
    });
    if (typeof github.needsPolling === 'boolean') updatePolling(github.needsPolling);
    publish();
  }

  async function refreshGitHub() {
    const token = generation;
    if (!pollRequired || selection === null) return state();
    const github = await githubObserver(gitContext.repositoryRoot, gitContext.branch);
    if (token !== generation || selection === null) return state();
    currentSources = { ...currentSources, github: github.source };
    currentPullRequest = github.pullRequest;
    currentFacts = { ...currentFacts, github: { pullRequest: github.pullRequest } };
    snapshot = await protocol.snapshot(selection.featureHome, {
      facts: currentFacts,
      sources: currentSources,
    });
    if (typeof github.needsPolling === 'boolean') updatePolling(github.needsPolling);
    const value = publish();
    if (preferences?.notificationsEnabled) notificationObserver.observe(snapshot, currentPullRequest);
    return value;
  }

  async function recheckSetup() {
    const selectedAgents = requireSelectedAgents(preferences?.selectedAgents ?? []);
    if (selectedAgents.length > 0) {
      setup = requireSetupState({
        schemaVersion: 1,
        phase: 'checking',
        operationalReady: false,
        checkedAt: setup.checkedAt,
        desktop: setup.desktop,
        selectedAgents,
        prerequisites: [],
        agents: [],
      });
      publish();
    }
    try {
      setup = requireSetupState(await setupObserver(selectedAgents));
    } catch (caught) {
      setup = requireSetupState({
        schemaVersion: 1,
        phase: 'incomplete',
        operationalReady: false,
        checkedAt: timestamp(now),
        desktop: setup.desktop,
        selectedAgents,
        prerequisites: [{
          id: 'setup-observer',
          label: 'Setup detection',
          status: 'unavailable',
          version: null,
          detail: caught instanceof Error ? caught.message : String(caught),
          remediation: {
            summary: 'Review the Setup diagnostic and recheck.',
            command: null,
            guideUrl: 'https://gatereeve.pages.dev/',
          },
        }],
        agents: [],
      });
    }
    return publish();
  }

  async function open(path) {
    const token = ++generation;
    stopPolling();
    watcher?.close();
    watcher = null;
    phase = 'loading';
    refreshing = true;
    error = null;
    publish();
    try {
      const worktreePath = await requireDirectory(path);
      if (!(await localObservation(worktreePath, token))) return state();
      preferences = rememberWorktree(preferences, worktreePath);
      await preferenceStore.save(preferences);
      await replaceWatcher(selection.featureHome, token);
      await enrich(token);
      notificationObserver.reset(snapshot, currentPullRequest);
      return state();
    } catch (caught) {
      if (token === generation) {
        phase = 'error';
        error = safeError(caught);
        snapshot = null;
        selection = null;
      }
      return state();
    } finally {
      if (token === generation) {
        refreshing = false;
        publish();
      }
    }
  }

  async function refresh(_reason = 'manual') {
    if (selection === null) return state();
    const token = ++generation;
    const path = selection.worktreePath;
    refreshing = true;
    error = null;
    publish();
    try {
      if (!(await localObservation(path, token))) return state();
      await replaceWatcher(selection.featureHome, token);
      await enrich(token);
      if (preferences?.notificationsEnabled) notificationObserver.observe(snapshot, currentPullRequest);
      return state();
    } catch (caught) {
      if (token === generation) {
        phase = snapshot === null ? 'error' : 'ready';
        error = safeError(caught);
      }
      return state();
    } finally {
      if (token === generation) {
        refreshing = false;
        publish();
      }
    }
  }

  return Object.freeze({
    current: state,
    async initialize() {
      preferences ??= await preferenceStore.load();
      await recheckSetup();
      if (preferences.lastWorktree !== null) return open(preferences.lastWorktree);
      return state();
    },
    open,
    refresh,
    focus: () => refresh('focus'),
    async read(kind, id = null) {
      if (selection === null) throw new Error('Choose a worktree before reading details.');
      return protocol.read(selection.featureHome, kind, id, {
        facts: currentFacts,
        sources: currentSources,
      });
    },
    async listSession() {
      if (selection === null) throw new Error('Choose a worktree before reading Session context.');
      return listSessionContext(selection.worktreePath);
    },
    async readSession(id) {
      if (selection === null) throw new Error('Choose a worktree before reading Session context.');
      return readSessionContext(selection.worktreePath, id);
    },
    artifact(artifactId) {
      const artifact = snapshot?.artifacts?.find((item) => item.id === artifactId);
      if (!artifact?.exists || !artifact.absolutePath || artifact.unsafe) {
        throw new Error('The requested artifact is not safely available.');
      }
      return artifact;
    },
    async saveWindow(bounds) {
      preferences = { ...preferences, window: bounds };
      preferences = await preferenceStore.save(preferences);
    },
    async setNotificationsEnabled(enabled) {
      if (typeof enabled !== 'boolean') throw new TypeError('Notification preference must be boolean.');
      preferences = { ...preferences, notificationsEnabled: enabled };
      preferences = await preferenceStore.save(preferences);
      notificationObserver.reset(snapshot, currentPullRequest);
      return publish();
    },
    async setSelectedAgents(selectedAgents) {
      preferences = selectAgents(preferences, selectedAgents);
      preferences = await preferenceStore.save(preferences);
      return recheckSetup();
    },
    recheckSetup,
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    close() {
      generation += 1;
      watcher?.close();
      watcher = null;
      stopPolling();
      subscribers.clear();
    },
  });
}

export { GITHUB_POLL_MS };
