import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { currentFixture } from './helpers/current-fixture.js';
const exec = promisify(execFile);
const cli = resolve(import.meta.dirname, '../bin/workflow.js');
async function run(repo, args) {
  try { const result = await exec(process.execPath, [cli, ...args, '--cwd', repo, '--json']); return { ...result, code: 0 }; }
  catch (error) { return error; }
}

test('CLI and native adapter share current parent-workspace status and preserve old files', async t => {
  const f = await currentFixture(t);
  const started = await run(f.repo, ['run', 'resume-current', '--implementer', 'fixture-context', '--operation-id', 'resume']);
  assert.equal(started.code, 0, started.stderr);
  const cliStatus = JSON.parse((await run(f.repo, ['status'])).stdout);
  const native = await f.request('status');
  assert.deepEqual(cliStatus, native);
  assert.equal(cliStatus.data.current.phase, 'DESIGNING');
  assert.equal(await readFile(join(f.home, 'events.jsonl'), 'utf8'), 'historical bytes\n');
});

test('current queries are read-only and blocked milestone passage fails without appending', async t => {
  const f = await currentFixture(t);
  await f.request('run.start', { implementers: ['fixture'] }, 'start');
  const before = (await f.core.state()).events;
  assert.equal((await run(f.repo, ['status'])).code, 0);
  const check = JSON.parse((await run(f.repo, ['milestone', 'check', 'acceptance'])).stdout);
  assert.equal(check.data.allowed, false);
  const passage = await run(f.repo, ['milestone', 'pass', 'acceptance']);
  assert.equal(passage.code, 1);
  assert.deepEqual((await f.core.state()).events, before);
});

test('retired mutation commands are unavailable and help explains explicit execution', async t => {
  const f = await currentFixture(t);
  assert.notEqual((await run(f.repo, ['feature', 'migrate-model'])).code, 0);
  const { stdout } = await exec(process.execPath, [cli, 'evaluate', '--help']);
  assert.match(stdout, /actual receipts/);
  assert.doesNotMatch(stdout, /run-eligible/);
});
