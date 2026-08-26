import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createWorktreeWatcher } from '../main/worktree-watcher.js';

test('filesystem bursts coalesce into one full refresh request', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-watch-'));
  await mkdir(join(root, 'pr-2'));
  const callbacks = [];
  const timers = [];
  let refreshes = 0;
  const watcher = await createWorktreeWatcher(root, async () => { refreshes += 1; }, {
    watch(_path, _options, callback) {
      callbacks.push(callback);
      return Object.assign(new EventEmitter(), { close() {} });
    },
    setTimer(callback, delay) {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer(timer) { timer.cleared = true; },
  });
  callbacks[0]();
  callbacks[0]();
  callbacks[1]();
  assert.equal(timers.length, 3);
  assert.equal(timers.filter((timer) => !timer.cleared).length, 1);
  await timers.at(-1).callback();
  assert.equal(refreshes, 1);
  watcher.close();
});
