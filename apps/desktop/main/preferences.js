// @ts-check

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const PREFERENCES_SCHEMA_VERSION = 1;
export const MAX_RECENT_WORKTREES = 10;

export function defaultPreferences() {
  return {
    schemaVersion: PREFERENCES_SCHEMA_VERSION,
    recentWorktrees: [],
    lastWorktree: null,
    window: null,
    notificationsEnabled: false,
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
  if (!value || typeof value !== 'object' || value.schemaVersion !== PREFERENCES_SCHEMA_VERSION) {
    return fallback;
  }
  const recentWorktrees = Array.isArray(value.recentWorktrees)
    ? [...new Set(value.recentWorktrees.filter((path) => typeof path === 'string' && isAbsolute(path)))]
      .slice(0, MAX_RECENT_WORKTREES)
    : [];
  const lastWorktree = typeof value.lastWorktree === 'string' && isAbsolute(value.lastWorktree)
    ? value.lastWorktree
    : null;
  return {
    schemaVersion: PREFERENCES_SCHEMA_VERSION,
    recentWorktrees,
    lastWorktree,
    window: validGeometry(value.window) ? {
      x: value.window.x,
      y: value.window.y,
      width: value.window.width,
      height: value.window.height,
    } : null,
    notificationsEnabled: value.notificationsEnabled === true,
  };
}

export function rememberWorktree(preferences, path) {
  if (!isAbsolute(path)) throw new Error('Recent worktree must be an absolute path.');
  const current = normalizePreferences(preferences);
  return {
    ...current,
    recentWorktrees: [path, ...current.recentWorktrees.filter((item) => item !== path)]
      .slice(0, MAX_RECENT_WORKTREES),
    lastWorktree: path,
  };
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
