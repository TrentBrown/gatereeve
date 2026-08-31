// @ts-check

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { requireSelectedAgents } from '../shared/contracts.js';

export const PREFERENCES_SCHEMA_VERSION = 3;
export const DEFAULT_TERMINAL_HEIGHT = 260;
export const MIN_TERMINAL_HEIGHT = 140;
export const MAX_TERMINAL_HEIGHT = 720;

export function defaultPreferences() {
  return {
    schemaVersion: PREFERENCES_SCHEMA_VERSION,
    projectPaths: [],
    lastProjectPath: null,
    window: null,
    notificationsEnabled: false,
    selectedAgents: [],
    terminalHeight: DEFAULT_TERMINAL_HEIGHT,
  };
}

function validGeometry(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && ['x', 'y', 'width', 'height'].every((key) => Number.isSafeInteger(value[key]))
    && value.width >= 760
    && value.height >= 560;
}

export function normalizePreferences(value) {
  const fallback = defaultPreferences();
  if (!value || typeof value !== 'object') return fallback;

  const sourcePaths = value.schemaVersion === 1
    ? value.recentWorktrees
    : [2, PREFERENCES_SCHEMA_VERSION].includes(value.schemaVersion)
      ? value.projectPaths
      : null;
  if (!Array.isArray(sourcePaths)) return fallback;

  const projectPaths = [
    ...new Set(sourcePaths.filter((path) => typeof path === 'string' && isAbsolute(path))),
  ];
  const sourceLastPath = value.schemaVersion === 1 ? value.lastWorktree : value.lastProjectPath;
  const lastProjectPath = typeof sourceLastPath === 'string'
    && isAbsolute(sourceLastPath)
    && projectPaths.includes(sourceLastPath)
    ? sourceLastPath
    : null;
  let selectedAgents = [];
  try {
    selectedAgents = requireSelectedAgents(value.selectedAgents ?? []);
  } catch {
    selectedAgents = [];
  }
  return {
    schemaVersion: PREFERENCES_SCHEMA_VERSION,
    projectPaths,
    lastProjectPath,
    window: validGeometry(value.window) ? {
      x: value.window.x,
      y: value.window.y,
      width: value.window.width,
      height: value.window.height,
    } : null,
    notificationsEnabled: value.notificationsEnabled === true,
    selectedAgents,
    terminalHeight: Number.isFinite(Number(value.terminalHeight))
      ? Math.min(
        MAX_TERMINAL_HEIGHT,
        Math.max(MIN_TERMINAL_HEIGHT, Math.round(Number(value.terminalHeight))),
      )
      : DEFAULT_TERMINAL_HEIGHT,
  };
}

function requireProjectPath(path) {
  if (!isAbsolute(path)) throw new Error('Project path must be absolute.');
  return path;
}

export function addProjectReference(preferences, path) {
  requireProjectPath(path);
  const current = normalizePreferences(preferences);
  return {
    ...current,
    projectPaths: current.projectPaths.includes(path)
      ? current.projectPaths
      : [...current.projectPaths, path],
    lastProjectPath: path,
  };
}

export function activateProjectReference(preferences, path) {
  requireProjectPath(path);
  const current = normalizePreferences(preferences);
  if (!current.projectPaths.includes(path)) throw new Error('Project path is not saved.');
  return { ...current, lastProjectPath: path };
}

export function reorderProjectReferences(preferences, orderedPaths) {
  const current = normalizePreferences(preferences);
  if (
    !Array.isArray(orderedPaths)
    || orderedPaths.some((path) => typeof path !== 'string' || !isAbsolute(path))
    || new Set(orderedPaths).size !== orderedPaths.length
    || orderedPaths.length !== current.projectPaths.length
    || orderedPaths.some((path) => !current.projectPaths.includes(path))
  ) {
    throw new Error('Project order must contain every saved path exactly once.');
  }
  return { ...current, projectPaths: [...orderedPaths] };
}

export function removeProjectReference(preferences, path) {
  requireProjectPath(path);
  const current = normalizePreferences(preferences);
  const index = current.projectPaths.indexOf(path);
  if (index === -1) throw new Error('Project path is not saved.');
  const projectPaths = current.projectPaths.filter((candidate) => candidate !== path);
  const lastProjectPath = current.lastProjectPath === path
    ? projectPaths[Math.min(index, projectPaths.length - 1)] ?? null
    : current.lastProjectPath;
  return { ...current, projectPaths, lastProjectPath };
}

export function selectAgents(preferences, selectedAgents) {
  return {
    ...normalizePreferences(preferences),
    selectedAgents: requireSelectedAgents(selectedAgents),
  };
}

export function setTerminalHeight(preferences, height) {
  if (!Number.isFinite(Number(height))) throw new TypeError('Terminal panel height is invalid.');
  return normalizePreferences({ ...preferences, terminalHeight: height });
}

export function createPreferenceStore(userDataPath) {
  const path = join(userDataPath, 'preferences.json');
  let writeQueue = Promise.resolve();
  return Object.freeze({
    path,
    async load() {
      try {
        return normalizePreferences(JSON.parse(await readFile(path, 'utf8')));
      } catch (error) {
        if (error?.code === 'ENOENT' || error instanceof SyntaxError) return defaultPreferences();
        throw error;
      }
    },
    save(value) {
      const preferences = normalizePreferences(value);
      const write = writeQueue.then(async () => {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.${randomUUID()}.tmp`;
        await writeFile(temporary, `${JSON.stringify(preferences, null, 2)}\n`, {
          encoding: 'utf8',
          mode: 0o600,
        });
        await rename(temporary, path);
        return preferences;
      });
      writeQueue = write.catch(() => {});
      return write;
    },
  });
}
