import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createTerminalManager } from '../main/terminal-manager.js';
import { createModuleTaskManager } from '../main/module-task-manager.js';
import { killPtyProcessGroup, spawnPty } from '../main/terminal-pty.js';
import { hashModuleDefinition } from '../../../plugin-src/shared/resources/protocol/modules.js';

const supported = ['darwin', 'linux'].includes(process.platform);

async function waitFor(predicate, label, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`Timed out waiting for ${label}`);
}

test('real PTY supports cwd, input, resize, exit, restart, and cleanup', { skip: !supported }, async () => {
  const projectPath = await mkdtemp(join(tmpdir(), 'gatereeve-terminal-'));
  const events = [];
  const pids = [];
  const manager = createTerminalManager({
    spawn(...values) {
      const pty = spawnPty(...values);
      pids.push(pty.pid);
      return pty;
    },
    userInfo: () => ({ shell: '/bin/sh' }),
    environment: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
    platform: process.platform,
    killProcessGroup: killPtyProcessGroup,
  });
  const unsubscribe = manager.subscribe((event) => events.push(event));
  try {
    const first = manager.ensure({ path: projectPath, name: 'probe' }, { cols: 80, rows: 24 });
    manager.resize(projectPath, first.id, { cols: 91, rows: 37 });
    manager.write(
      projectPath,
      first.id,
      "printf 'GATEREEVE_PTY_READY\\n'; pwd; stty size; exit 7\r",
    );
    const exited = await waitFor(
      () => events.find((event) => event.type === 'exited' && event.session.id === first.id),
      'first PTY exit',
    );
    assert.equal(exited.session.exit.code, 7);
    assert.match(exited.session.output, /GATEREEVE_PTY_READY/);
    assert.match(exited.session.output, new RegExp(projectPath.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(exited.session.output, /37 91/);

    const restarted = manager.restart(
      { path: projectPath, name: 'probe' },
      first.id,
      { cols: 90, rows: 30 },
    );
    assert.notEqual(restarted.id, first.id);
    manager.write(projectPath, restarted.id, "printf 'GATEREEVE_RESTARTED\\n'; exit 0\r");
    const secondExit = await waitFor(
      () => events.find((event) => event.type === 'exited' && event.session.id === restarted.id),
      'restarted PTY exit',
    );
    assert.equal(secondExit.session.exit.code, 0);
    assert.match(secondExit.session.output, /GATEREEVE_RESTARTED/);

    const live = manager.restart(
      { path: projectPath, name: 'probe' },
      restarted.id,
      { cols: 80, rows: 24 },
    );
    manager.write(projectPath, live.id, "printf 'GATEREEVE_CLEANUP_READY\\n'\r");
    await waitFor(
      () => events.some((event) => event.type === 'data' && event.data.includes('GATEREEVE_CLEANUP_READY')),
      'cleanup probe output',
    );
    const livePid = pids.at(-1);
    manager.close();
    await waitFor(
      () => {
        try { process.kill(livePid, 0); return false; }
        catch (error) { return error.code === 'ESRCH'; }
      },
      'cleanup PTY process termination',
    );
  } finally {
    unsubscribe();
    manager.close();
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('real PTY cleanup terminates a descendant sentinel process', { skip: !supported }, async () => {
  const projectPath = await mkdtemp(join(tmpdir(), 'gatereeve-terminal-child-'));
  let output = '';
  let shellPid = null;
  const manager = createTerminalManager({
    spawn(...values) {
      const pty = spawnPty(...values);
      shellPid = pty.pid;
      return pty;
    },
    userInfo: () => ({ shell: '/bin/sh' }),
    environment: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
    platform: process.platform,
    killProcessGroup: killPtyProcessGroup,
  });
  manager.subscribe((event) => {
    if (event.type === 'data') output += event.data;
  });
  try {
    const session = manager.ensure(
      { path: projectPath, name: 'child-probe' },
      { cols: 80, rows: 24 },
    );
    manager.write(projectPath, session.id, "sleep 30 & printf 'GATEREEVE_CHILD:%s\\n' \"$!\"\r");
    const childPid = Number((await waitFor(
      () => output.match(/GATEREEVE_CHILD:(\d+)/)?.[1],
      'descendant sentinel PID',
    )));
    assert.equal(Number.isInteger(childPid) && childPid > 0, true);
    manager.close();
    for (const [pid, label] of [[shellPid, 'shell'], [childPid, 'descendant']]) {
      await waitFor(() => {
        try { process.kill(pid, 0); return false; }
        catch (error) { return error.code === 'ESRCH'; }
      }, `${label} process termination`);
    }
  } finally {
    manager.close();
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('real module task PTY is direct, interactive, attributable, and separate from the project shell', { skip: !supported }, async () => {
  const projectPath = await mkdtemp(join(tmpdir(), 'gatereeve-module-task-'));
  const module = {
    schemaVersion: 1,
    id: 'example/interactive-check', version: '1.0.0', digest: `sha256:${'0'.repeat(64)}`,
    label: 'Interactive check', description: 'Reads one answer.',
    slot: 'feature.finalization', dependsOn: [], disposition: 'optional', locked: false,
    enabledByDefault: false, waiverAllowed: true,
    evidence: { kind: 'reference', requiredFor: ['PASS', 'FAIL'] },
    fingerprint: { kind: 'feature-finalization-v1', dependencyBinding: 'event-ids' },
    run: {
      kind: 'command', executable: process.execPath,
      args: ['-e', 'process.stdin.once("data", value => { console.log(`task:${value.toString().trim()}`); process.exit(0); })'],
      workingDirectory: 'repository', effects: ['Reads one terminal answer.'], timeoutSeconds: 10,
    },
  };
  module.digest = hashModuleDefinition(module);
  const manager = createModuleTaskManager({ spawn: spawnPty, killProcessGroup: killPtyProcessGroup });
  try {
    const finished = new Promise((resolve) => {
      manager.subscribe((event) => { if (event.type === 'finished') resolve(event.session); });
    });
    const task = await manager.start(
      { path: projectPath, name: 'module-task' }, module, { cols: 80, rows: 24 },
    );
    manager.write(projectPath, task.id, 'ready\r');
    const result = await finished;
    assert.match(result.output, /task:ready/);
    assert.equal(result.result.outcome, 'PASS');
    assert.equal(result.kind, 'module-task');
  } finally {
    manager.close();
    await rm(projectPath, { recursive: true, force: true });
  }
});
