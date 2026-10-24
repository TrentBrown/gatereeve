// @ts-check

import { watch as nodeWatch } from 'node:fs';
import { resolve } from 'node:path';

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
  try {
    const watcher = watch(resolve(featureHome), { persistent: false, recursive: true }, schedule);
    watcher.on?.('error', schedule);
    watchers.push(watcher);
  } catch {
    // Focus/manual refresh remains available when OS watching is unavailable.
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
