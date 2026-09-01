import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  bindTerminalQuitGuard,
  bindTerminalWindowCloseGuard,
  confirmProjectTerminalTermination,
  confirmQuitTerminalTermination,
} from '../main/terminal-lifecycle.js';

test('terminal warnings expose exactly cancel and terminate-and-continue choices', async () => {
  const calls = [];
  const dialog = {
    async showMessageBox(window, options) {
      calls.push([window, options]);
      return { response: calls.length === 1 ? 0 : 1 };
    },
  };
  const window = {};
  assert.equal(await confirmProjectTerminalTermination(dialog, window, 'GateReeve'), false);
  assert.equal(await confirmQuitTerminalTermination(dialog, window, 2), true);
  assert.deepEqual(calls[0][1].buttons, ['Cancel', 'Terminate and Remove']);
  assert.deepEqual(calls[1][1].buttons, ['Cancel', 'Terminate and Quit']);
  assert.equal(calls[0][1].cancelId, 0);
  assert.equal(calls[1][1].cancelId, 0);
});

test('last-window close remains cancellable while a terminal is live', async () => {
  const window = new EventEmitter();
  let closes = 0;
  window.close = () => {
    closes += 1;
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    window.emit('close', event);
  };
  let live = ['/repo'];
  let terminalCloses = 0;
  const confirmations = [false, true];
  bindTerminalWindowCloseGuard({
    window,
    terminalManager: {
      liveProjects: () => live,
      close() { terminalCloses += 1; live = []; },
    },
    confirmQuit: async () => confirmations.shift(),
  });

  const first = { prevented: false, preventDefault() { this.prevented = true; } };
  window.emit('close', first);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(first.prevented, true);
  assert.equal(closes, 0);
  assert.equal(terminalCloses, 0);

  const second = { prevented: false, preventDefault() { this.prevented = true; } };
  window.emit('close', second);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(second.prevented, true);
  assert.equal(closes, 1);
  assert.equal(terminalCloses, 1);
});

test('quit guard cancels first and closes all PTYs only after explicit confirmation', async () => {
  const app = new EventEmitter();
  let quits = 0;
  app.quit = () => {
    quits += 1;
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    app.emit('before-quit', event);
  };
  let live = ['/repo'];
  let closes = 0;
  let cleanups = 0;
  const confirmations = [false, true];
  bindTerminalQuitGuard({
    app,
    terminalManager: {
      liveProjects: () => live,
      close() { closes += 1; live = []; },
    },
    confirmQuit: async () => confirmations.shift(),
    cleanup() { cleanups += 1; },
  });

  const first = { prevented: false, preventDefault() { this.prevented = true; } };
  app.emit('before-quit', first);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(first.prevented, true);
  assert.equal(quits, 0);
  assert.equal(closes, 0);
  assert.equal(cleanups, 0);

  const second = { prevented: false, preventDefault() { this.prevented = true; } };
  app.emit('before-quit', second);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(second.prevented, true);
  assert.equal(quits, 1);
  assert.equal(closes, 1);
  assert.equal(cleanups, 1);
});
