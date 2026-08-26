// @ts-check

import { watch as nodeWatch } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

async function watchDirectories(featureHome) {
  const directories = [resolve(featureHome)];
  try {
    const entries = await readdir(featureHome, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) directories.push(resolve(featureHome, entry.name));
    }
  } catch {
    // A missing or moving feature directory remains observable through refresh.
  }
  return directories;
}

export async function createWorktreeWatcher(featureHome, onChange, {
  debounceMs = 180,
  watch = nodeWatch,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let timer = null;
  let closed = false;
  const schedule = () => {
    if (closed) return;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      void onChange();
    }, debounceMs);
  };
  const watchers = [];
  for (const directory of await watchDirectories(featureHome)) {
    try {
      const watcher = watch(directory, { persistent: false }, schedule);
      watcher.on?.('error', schedule);
      watchers.push(watcher);
    } catch {
      // Other watched directories and focus/manual refresh remain available.
    }
  }
  return Object.freeze({
    close() {
      closed = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
      for (const watcher of watchers) watcher.close();
    },
  });
}
