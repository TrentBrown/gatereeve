import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { currentFixture } from './helpers/current-fixture.js';
import { establishCurrentRun } from './helpers/established-current-run.js';

const exec = promisify(execFile);
const cli = resolve(import.meta.dirname, '../bin/workflow.js');

test('runner CLI requires an explicit scope and executes the documented configuration', async t => {
  const f = await currentFixture(t);
  await establishCurrentRun(f.core);
  const checks = [{ repository: 'app', command: process.execPath, args: ['-e', 'process.exit(0)'], purpose: 'Dependency-free fixture' }];
  const configuration = join(f.root, 'verification.json');
  const invoke = (...args) => exec(process.execPath, [cli, 'evaluate', 'verification', '--cwd', f.repo, '--json', ...args]);
  await writeFile(configuration, JSON.stringify({ checks }));
  await assert.rejects(invoke('--configuration', configuration), error => {
    assert.equal(error.code, 1);
    assert.match(JSON.parse(error.stdout).error.message, /externalRuntimeInputs/);
    return true;
  });
  await writeFile(configuration, JSON.stringify({ checks, externalRuntimeInputs: { app: [] } }));
  const result = JSON.parse((await invoke('--configuration', configuration)).stdout);
  assert.equal(result.ok, true);
  const recorded = await f.core.store.json(result.data.event.payload.results[0]);
  assert.equal(recorded.outcome, 'PASS');
  for (const args of [['--checks', 'unused.json'], ['--configuration', configuration, '--checks', 'unused.json'], ['--checks', 'unused.json', '--configuration', configuration]]) {
    await assert.rejects(invoke(...args), error => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /--checks has been retired.*--configuration.*externalRuntimeInputs/);
      return true;
    });
  }
});
