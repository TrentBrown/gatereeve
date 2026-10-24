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

test('CLI records and revokes standing authority through the native core and fails closed without proof', async t => {
  const f = await currentFixture(t); await establishCurrentRun(f.core);
  const { git } = await import('../../plugin-src/shared/resources/protocol/current/evidence.js');
  const bare = join(f.root, 'host.git');
  await git(f.root, ['init', '--bare', bare]);
  await git(f.repo, ['remote', 'add', 'origin', 'https://github.com/fixture/project.git']);
  await git(f.repo, ['config', `url.${bare}.insteadOf`, 'https://github.com/fixture/project.git']);
  await git(f.repo, ['push', 'origin', 'HEAD:refs/heads/main']);
  const scope = join(f.root, 'standing.json');
  await writeFile(scope, JSON.stringify({ actions: ['accept'], candidateScopes: ['SLICE', 'FEATURE'],
    repositories: [{ alias: 'app', headPrefix: 'topic', baseBranch: 'main' }], expiresAt: null }));
  const invoke = (...args) => exec(process.execPath, [cli, ...args, '--cwd', f.repo, '--json']);
  const human = ['--instruction', 'Accept the approved feature when every gate passes.', '--context', 'User fixture conversation', '--reason', 'Overnight operation', '--consequences', 'No merge or deployment'];
  const grant = JSON.parse((await invoke('decide', 'authorize-standing', '--subject', (await f.core.commitments()).subject, '--scope', scope, ...human)).stdout);
  assert.equal(grant.ok, true);
  const grantId = grant.data.event.hash;
  const status = JSON.parse((await invoke('status')).stdout);
  assert.equal(status.data.current.standingAuthorizations[0].grant, grantId);
  assert.equal(status.data.current.standingAuthorizations[0].allowed, true);
  await assert.rejects(invoke('apply-authorization', '--grant', grantId), error => {
    assert.match(JSON.parse(error.stdout).error.message, /current PASS/); return true;
  });
  const revoked = JSON.parse((await invoke('decide', 'revoke-standing', '--subject', grantId, ...human)).stdout);
  assert.equal(revoked.ok, true);
  assert.match(JSON.parse((await invoke('status')).stdout).data.current.standingAuthorizations[0].reason, /revoked/);
});
