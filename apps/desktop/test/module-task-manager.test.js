import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { hashModuleDefinition } from '../../../plugin-src/shared/resources/protocol/modules.js';
import { createModuleTaskManager } from '../main/module-task-manager.js';

function processFixture(pid) {
  const emitter = new EventEmitter();
  const writes = [];
  const resizes = [];
  return {
    pid, writes, resizes,
    onData(listener) { emitter.on('data', listener); return { dispose: () => emitter.off('data', listener) }; },
    onExit(listener) { emitter.on('exit', listener); return { dispose: () => emitter.off('exit', listener) }; },
    write(value) { writes.push(value); },
    resize(cols, rows) { resizes.push([cols, rows]); },
    data(value) { emitter.emit('data', value); },
    exit(value) { emitter.emit('exit', value); },
  };
}

function commandModule({ observed = false, timeoutSeconds = 30 } = {}) {
  const module = {
    schemaVersion: 1,
    id: 'example/check',
    version: '1.0.0',
    digest: `sha256:${'0'.repeat(64)}`,
    label: 'Repository check',
    description: 'Run repository check.',
    slot: 'feature.finalization',
    dependsOn: [],
    disposition: 'optional',
    locked: false,
    enabledByDefault: false,
    waiverAllowed: true,
    evidence: { kind: 'reference', requiredFor: ['PASS', 'FAIL'] },
    fingerprint: { kind: 'feature-finalization-v1', dependencyBinding: 'event-ids' },
    run: {
      kind: 'command', executable: '/usr/bin/env', args: ['true'],
      workingDirectory: 'tasks', effects: ['Runs a test command.'], timeoutSeconds,
    },
    ...(observed ? { observe: { providerId: 'example/provider', version: '1.0.0' } } : {}),
  };
  module.digest = hashModuleDefinition(module);
  return module;
}

async function harness(options = {}) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'gatereeve-task-'));
  await mkdir(join(repositoryRoot, 'tasks'));
  const processes = [];
  const spawns = [];
  const signals = [];
  let timer = null;
  let sequence = 0;
  const manager = createModuleTaskManager({
    spawn(file, args, spawnOptions) {
      const process = processFixture(500 + processes.length);
      processes.push(process);
      spawns.push({ file, args, options: spawnOptions });
      return process;
    },
    killProcessGroup(pid, signal) { signals.push([pid, signal]); },
    createId: () => String(++sequence),
    now: () => `2026-09-03T12:00:0${sequence}Z`,
    setTimer(callback) { timer = callback; return 1; },
    clearTimer() { timer = null; },
    outputLimit: 8,
    ...options,
  });
  return {
    repositoryRoot,
    project: { path: repositoryRoot, name: 'repo' },
    manager, processes, spawns, signals,
    timeout: () => timer?.(),
  };
}

test('module commands use dedicated direct PTYs and retain bounded attributable results', async () => {
  const fixture = await harness();
  const module = commandModule();
  const task = await fixture.manager.start(fixture.project, module, { cols: 80, rows: 24 });
  assert.equal(task.kind, 'module-task');
  assert.equal(task.moduleId, module.id);
  assert.equal(task.attemptId, null);
  assert.equal(fixture.spawns[0].file, '/usr/bin/env');
  assert.deepEqual(fixture.spawns[0].args, ['true']);
  assert.equal(fixture.spawns[0].options.cwd, join(fixture.repositoryRoot, 'tasks'));
  assert.equal('shell' in fixture.spawns[0].options, false);

  fixture.manager.write(fixture.repositoryRoot, task.id, 'yes\n');
  fixture.processes[0].data('12345');
  fixture.processes[0].data('67890');
  fixture.processes[0].exit({ exitCode: 0, signal: 0 });
  const finished = fixture.manager.current(fixture.repositoryRoot, task.id);
  assert.equal(finished.output, '34567890');
  assert.equal(finished.result.outcome, 'PASS');
  assert.deepEqual(fixture.processes[0].writes, ['yes\n']);
});

test('provider-backed success awaits observation while process failures remain failures', async () => {
  const success = await harness();
  const task = await success.manager.start(success.project, commandModule({ observed: true }), { cols: 80, rows: 24 });
  success.processes[0].exit({ exitCode: 0, signal: 0 });
  assert.deepEqual(success.manager.current(success.repositoryRoot, task.id).result, {
    attemptStatus: 'awaiting-provider', outcome: 'UNSET', reason: 'Command completed; awaiting provider',
  });

  const failure = await harness();
  const failed = await failure.manager.start(failure.project, commandModule({ observed: true }), { cols: 80, rows: 24 });
  failure.processes[0].exit({ exitCode: 9, signal: 0 });
  assert.equal(failure.manager.current(failure.repositoryRoot, failed.id).result.outcome, 'FAIL');
});

test('explicit cancellation and timeout are distinct and preserve the project shell boundary', async () => {
  const cancelled = await harness();
  const first = await cancelled.manager.start(cancelled.project, commandModule(), { cols: 80, rows: 24 });
  assert.equal(cancelled.manager.cancel(cancelled.repositoryRoot, first.id).status, 'terminating');
  cancelled.processes[0].exit({ exitCode: 1, signal: 1 });
  assert.equal(cancelled.manager.current(cancelled.repositoryRoot, first.id).result.outcome, 'UNSET');
  assert.equal(cancelled.manager.current(cancelled.repositoryRoot, first.id).status, 'cancelled');

  const timedOut = await harness();
  const second = await timedOut.manager.start(timedOut.project, commandModule({ timeoutSeconds: 1 }), { cols: 80, rows: 24 });
  timedOut.timeout();
  timedOut.timeout();
  timedOut.processes[0].exit({ exitCode: 1, signal: 1 });
  assert.equal(timedOut.manager.current(timedOut.repositoryRoot, second.id).result.outcome, 'FAIL');
  assert.equal(timedOut.manager.current(timedOut.repositoryRoot, second.id).status, 'timed-out');
  assert.deepEqual(timedOut.signals, [[500, 'SIGHUP'], [500, 'SIGKILL']]);
});

test('closing the app cleans up all live task process groups', async () => {
  const fixture = await harness();
  await fixture.manager.start(fixture.project, commandModule(), { cols: 80, rows: 24 });
  await fixture.manager.start(fixture.project, commandModule(), { cols: 80, rows: 24 });
  fixture.manager.close();
  assert.deepEqual(fixture.signals, [
    [500, 'SIGHUP'], [500, 'SIGKILL'],
    [501, 'SIGHUP'], [501, 'SIGKILL'],
  ]);
  assert.deepEqual(fixture.manager.list(fixture.repositoryRoot), []);
});
