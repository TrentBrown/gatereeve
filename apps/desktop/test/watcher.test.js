import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
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
    watch(_path, options, callback) {
      assert.equal(options.recursive, true);
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
  callbacks[0]();
  assert.equal(timers.length, 3);
  assert.equal(timers.filter((timer) => !timer.cleared).length, 1);
  await timers.at(-1).callback();
  assert.equal(refreshes, 1);
  watcher.close();
});

test('real watcher observes a current event created in a new nested run directory', async t => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-current-watch-'));
  let notify; const changed = new Promise(resolve => { notify = resolve; });
  const watcher = await createWorktreeWatcher(root, notify, { debounceMs: 20 });
  t.after(async () => { watcher.close(); await rm(root, { recursive: true, force: true }); });
  const events = join(root, '.gatereeve-current/runs/new-run/events');
  await mkdir(events, { recursive: true }); await writeFile(join(events, '00000001.json'), '{}');
  let timer;
  try { await Promise.race([changed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Nested current event was not observed')), 3000); })]); }
  finally { clearTimeout(timer); }
});
