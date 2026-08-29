// @ts-check

import {
  DESKTOP_STATE_SCHEMA_VERSION,
  requireDesktopState,
  requireSelectedAgents,
  requireSetupState,
} from '../shared/contracts.js';
import { observeGit } from './git-observer.js';
import { observeGitHub } from './github-observer.js';
import { createNotificationObserver } from './notification-observer.js';
import {
  activateProjectReference,
  addProjectReference,
  removeProjectReference,
  reorderProjectReferences,
  selectAgents,
} from './preferences.js';
import { inspectProject } from './project-registry.js';
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
  let projects = [];
  let candidateDiagnostic = null;
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
      projects,
      candidateDiagnostic,
      preferences: {
        projectPaths: preferences?.projectPaths ?? [],
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

  function updateProject(project) {
    const current = projects.findIndex((item) => item.path === project.path);
    if (current === -1) projects = [...projects, project];
    else projects = projects.map((item, index) => index === current ? project : item);
  }

  function syncActiveProject() {
    if (selection === null || snapshot === null) return;
    const project = projects.find((item) => item.path === selection.worktreePath);
    if (!project || project.status !== 'ready') return;
    updateProject({
      ...project,
      featureHome: selection.featureHome,
      featureId: snapshot.featureId ?? project.featureId,
      workflowState: snapshot.projection?.feature?.state ?? project.workflowState,
    });
  }

  function localProjectSources() {
    return localSources(now);
  }

  async function inspect(path) {
    return inspectProject(path, { protocol, sources: localProjectSources() });
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

  function applyInspection(inspection) {
    const project = inspection.project;
    updateProject(project);
    currentFacts = {};
    currentPullRequest = null;
    currentSources = localProjectSources();
    selection = { worktreePath: project.path, featureHome: project.featureHome };
    snapshot = inspection.snapshot;
    phase = 'ready';
    error = null;
    candidateDiagnostic = null;
    publish();
  }

  async function activateInspection(inspection) {
    const token = ++generation;
    stopPolling();
    watcher?.close();
    watcher = null;
    refreshing = true;
    error = null;
    applyInspection(inspection);
    if (!inspection.ready) return { token, ready: false };
    await replaceWatcher(inspection.project.featureHome, token);
    await enrich(token);
    notificationObserver.reset(snapshot, currentPullRequest);
    return { token, ready: true };
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
    syncActiveProject();
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
    syncActiveProject();
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
    syncActiveProject();
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
    refreshing = true;
    error = null;
    candidateDiagnostic = null;
    publish();
    let token = generation;
    try {
      const inspection = await inspect(path);
      if (!inspection.ready) {
        candidateDiagnostic = inspection.project.diagnostic;
      } else {
        preferences = addProjectReference(preferences, inspection.project.path);
        if (preferences.projectPaths.length > 0) await preferenceStore.save(preferences);
        ({ token } = await activateInspection(inspection));
      }
    } catch (caught) {
      if (token === generation) {
        error = safeError(caught);
      }
    } finally {
      if (token === generation) {
        refreshing = false;
        publish();
      }
    }
    return state();
  }

  async function refresh(_reason = 'manual') {
    if (selection === null) return state();
    const token = ++generation;
    const path = selection.worktreePath;
    refreshing = true;
    error = null;
    publish();
    try {
      const inspection = await inspect(path);
      if (token !== generation) return state();
      applyInspection(inspection);
      if (!inspection.ready) {
        stopPolling();
        watcher?.close();
        watcher = null;
      } else {
        await replaceWatcher(selection.featureHome, token);
        await enrich(token);
        if (preferences?.notificationsEnabled) {
          notificationObserver.observe(snapshot, currentPullRequest);
        }
      }
    } catch (caught) {
      if (token === generation) {
        phase = snapshot === null ? 'error' : 'ready';
        error = safeError(caught);
      }
    } finally {
      if (token === generation) {
        refreshing = false;
        publish();
      }
    }
    return state();
  }

  async function activate(path) {
    if (!preferences.projectPaths.includes(path)) throw new Error('Project path is not saved.');
    refreshing = true;
    error = null;
    candidateDiagnostic = null;
    publish();
    let token = generation;
    try {
      const inspection = await inspect(path);
      if (inspection.project.path !== path) {
        const canonicalPaths = preferences.projectPaths.map(
          (candidate) => candidate === path ? inspection.project.path : candidate
        );
        preferences = {
          ...preferences,
          projectPaths: [...new Set(canonicalPaths)],
          lastProjectPath: inspection.project.path,
        };
      } else {
        preferences = activateProjectReference(preferences, path);
      }
      if (preferences.projectPaths.length > 0) await preferenceStore.save(preferences);
      ({ token } = await activateInspection(inspection));
    } finally {
      if (token === generation) {
        refreshing = false;
        publish();
      }
    }
    return state();
  }

  async function reorderProjects(orderedPaths) {
    preferences = reorderProjectReferences(preferences, orderedPaths);
    const byPath = new Map(projects.map((project) => [project.path, project]));
    projects = orderedPaths.map((path) => byPath.get(path));
    await preferenceStore.save(preferences);
    return publish();
  }

  async function removeProject(path) {
    const wasActive = selection?.worktreePath === path;
    preferences = removeProjectReference(preferences, path);
    projects = projects.filter((project) => project.path !== path);
    await preferenceStore.save(preferences);
    if (!wasActive) return publish();

    generation += 1;
    stopPolling();
    watcher?.close();
    watcher = null;
    selection = null;
    snapshot = null;
    error = null;
    candidateDiagnostic = null;
    currentFacts = {};
    currentSources = localProjectSources();
    currentPullRequest = null;
    phase = 'idle';
    notificationObserver.reset(null, null);
    if (preferences.lastProjectPath !== null) return activate(preferences.lastProjectPath);
    return publish();
  }

  return Object.freeze({
    current: state,
    async initialize() {
      preferences ??= await preferenceStore.load();
      await recheckSetup();
      const inspected = [];
      const canonicalPaths = [];
      const canonicalByStoredPath = new Map();
      for (const path of preferences.projectPaths) {
        const inspection = await inspect(path);
        inspected.push(inspection);
        canonicalByStoredPath.set(path, inspection.project.path);
        if (!canonicalPaths.includes(inspection.project.path)) {
          canonicalPaths.push(inspection.project.path);
          updateProject(inspection.project);
        }
      }
      const restoredPath = preferences.lastProjectPath === null
        ? null
        : canonicalByStoredPath.get(preferences.lastProjectPath) ?? preferences.lastProjectPath;
      preferences = {
        ...preferences,
        projectPaths: canonicalPaths,
        lastProjectPath: restoredPath !== null && canonicalPaths.includes(restoredPath)
          ? restoredPath
          : null,
      };
      if (preferences.projectPaths.length > 0) await preferenceStore.save(preferences);
      if (preferences.lastProjectPath !== null) {
        const inspection = inspected.find(
          (item) => item.project.path === preferences.lastProjectPath
        );
        if (inspection) {
          const { token } = await activateInspection(inspection);
          if (token === generation) {
            refreshing = false;
            publish();
          }
          return state();
        }
      }
      return state();
    },
    open,
    activate,
    reorderProjects,
    removeProject,
    refresh,
    focus: () => refresh('focus'),
    async read(kind, id = null) {
      if (selection === null) throw new Error('Choose a project before reading details.');
      return protocol.read(selection.featureHome, kind, id, {
        facts: currentFacts,
        sources: currentSources,
      });
    },
    async listSession() {
      if (selection === null) throw new Error('Choose a project before reading Session context.');
      return listSessionContext(selection.worktreePath);
    },
    async readSession(id) {
      if (selection === null) throw new Error('Choose a project before reading Session context.');
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
