import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  createTerminalManager,
  resolveAccountShell,
  TERMINAL_OUTPUT_LIMIT,
} from '../main/terminal-manager.js';
import { descendantProcessIds } from '../main/terminal-pty.js';

test('descendant process discovery returns deepest children before parents', () => {
  assert.deepEqual(descendantProcessIds(10, `
    10 1
    11 10
    12 11
    13 10
    20 1
  `), [12, 11, 13]);
});

function fakeProcess(pid = 100) {
  const events = new EventEmitter();
  const writes = [];
  const resizes = [];
  return {
    pid,
    writes,
    resizes,
    onData(listener) {
      events.on('data', listener);
      return { dispose: () => events.off('data', listener) };
    },
    onExit(listener) {
      events.on('exit', listener);
      return { dispose: () => events.off('exit', listener) };
    },
    write(value) { writes.push(value); },
    resize(cols, rows) { resizes.push([cols, rows]); },
    data(value) { events.emit('data', value); },
    exit(value) { events.emit('exit', value); },
  };
}

function harness(overrides = {}) {
  const spawns = [];
  const signals = [];
  const processes = [];
  let id = 0;
  const manager = createTerminalManager({
    spawn(file, args, options) {
      const process = fakeProcess(100 + processes.length);
      processes.push(process);
      spawns.push({ file, args, options });
      return process;
    },
    userInfo: () => ({ shell: '/bin/zsh' }),
    environment: { PATH: '/usr/bin', SHELL: '/bin/ignored', GATEREEVE_TEST: undefined },
    platform: 'darwin',
    createId: () => `id_${++id}`,
    killProcessGroup: (pid, signal) => signals.push([pid, signal]),
    ...overrides,
  });
  return { manager, spawns, signals, processes };
}

const projectA = { path: '/project/a', name: 'a' };
const projectB = { path: '/project/b', name: 'b' };
const size = { cols: 80, rows: 24 };

test('account shell resolution is platform-bound and does not silently substitute', () => {
  assert.deepEqual(resolveAccountShell({
    platform: 'linux',
    user: { shell: '/usr/bin/fish' },
    environment: { SHELL: '/bin/bash' },
  }), { path: '/usr/bin/fish', name: 'fish', args: ['-l'] });
  assert.throws(() => resolveAccountShell({
    platform: 'linux', user: { shell: '' }, environment: {},
  }), /no usable configured login shell/);
  assert.throws(() => resolveAccountShell({
    platform: 'win32', user: { shell: 'cmd.exe' }, environment: {},
  }), /not supported/);
});

test('first ensure creates one trusted login shell and subsequent ensure reuses it', () => {
  const { manager, spawns } = harness();
  const first = manager.ensure(projectA, size);
  const second = manager.ensure(projectA, { cols: 120, rows: 40 });

  assert.equal(first.id, 'terminal_id_1');
  assert.equal(second.id, first.id);
  assert.equal(spawns.length, 1);
  assert.deepEqual(spawns[0], {
    file: '/bin/zsh',
    args: ['-l'],
    options: {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: '/project/a',
      env: { PATH: '/usr/bin', SHELL: '/bin/ignored', TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    },
  });
});

test('sessions are isolated by project and reject cross-project authority', () => {
  const { manager, processes } = harness();
  const a = manager.ensure(projectA, size);
  const b = manager.ensure(projectB, size);

  manager.write(projectA.path, a.id, 'a');
  manager.write(projectB.path, b.id, 'b');
  assert.deepEqual(processes[0].writes, ['a']);
  assert.deepEqual(processes[1].writes, ['b']);
  assert.throws(() => manager.write(projectB.path, a.id, 'wrong'), /unavailable/);
  assert.deepEqual(manager.liveProjects(), ['/project/a', '/project/b']);
});

test('output is bounded and exit retains the final buffer until restart', () => {
  const { manager, processes, spawns } = harness({ outputLimit: 5 });
  const events = [];
  manager.subscribe((event) => events.push(event));
  const first = manager.ensure(projectA, size);
  processes[0].data('1234');
  processes[0].data('5678');
  processes[0].exit({ exitCode: 7, signal: 0 });

  assert.equal(manager.current(projectA.path).output, '45678');
  assert.deepEqual(manager.current(projectA.path).exit, { code: 7, signal: 0 });
  assert.equal(manager.current(projectA.path).status, 'exited');
  assert.throws(() => manager.write(projectA.path, first.id, 'x'), /not accepting input/);
  assert.equal(events.at(-1).type, 'exited');

  const restarted = manager.restart(projectA, first.id, { cols: 90, rows: 30 });
  assert.notEqual(restarted.id, first.id);
  assert.equal(restarted.output, '');
  assert.equal(restarted.status, 'running');
  assert.equal(spawns.length, 2);
});

test('resize validates dimensions and terminate targets the exact process group', () => {
  const { manager, processes, signals } = harness();
  const session = manager.ensure(projectA, size);
  const resized = manager.resize(projectA.path, session.id, { cols: 120, rows: 42 });
  assert.deepEqual(processes[0].resizes, [[120, 42]]);
  assert.deepEqual([resized.cols, resized.rows], [120, 42]);
  assert.throws(() => manager.resize(projectA.path, session.id, { cols: 0, rows: 42 }), /invalid/);

  const terminating = manager.terminate(projectA.path, session.id);
  assert.equal(terminating.status, 'terminating');
  assert.deepEqual(signals, [[100, 'SIGHUP']]);
  assert.throws(() => manager.terminate(projectA.path, session.id), /not running/);
});

test('failed spawn remains visible and can be restarted', () => {
  let attempts = 0;
  const { manager } = harness({
    spawn() {
      attempts += 1;
      if (attempts === 1) throw new Error('spawn denied');
      return fakeProcess(202);
    },
  });
  const failed = manager.ensure(projectA, size);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'spawn denied');
  const restarted = manager.restart(projectA, failed.id, size);
  assert.equal(restarted.status, 'running');
});

test('missing configured account shell is retained as a restartable failure without substitution', () => {
  const { manager, spawns } = harness({
    userInfo: () => ({ shell: '' }),
    environment: { SHELL: 'relative-shell' },
  });
  const failed = manager.ensure({ path: '/repo/a', name: 'a' }, { cols: 80, rows: 24 });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.shell, 'unavailable');
  assert.match(failed.error, /no usable configured login shell/);
  assert.equal(spawns.length, 0);
  const retried = manager.restart({ path: '/repo/a', name: 'a' }, failed.id, { cols: 80, rows: 24 });
  assert.equal(retried.status, 'failed');
  assert.notEqual(retried.id, failed.id);
  assert.equal(spawns.length, 0);
});

test('discard and close terminate only live project groups and reject later use', () => {
  const { manager, signals } = harness();
  manager.ensure(projectA, size);
  const b = manager.ensure(projectB, size);
  manager.discardProject(projectA.path);
  assert.deepEqual(signals, [[100, 'SIGHUP']]);
  assert.equal(manager.current(projectA.path), null);
  assert.equal(manager.current(projectB.path).id, b.id);

  manager.close();
  assert.deepEqual(signals, [[100, 'SIGHUP'], [101, 'SIGHUP']]);
  assert.throws(() => manager.ensure(projectA, size), /closed/);
});

test('default output bound is finite', () => {
  assert.equal(TERMINAL_OUTPUT_LIMIT, 1_000_000);
});
