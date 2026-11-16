import assert from 'node:assert/strict';
import { isolatedTests } from './helpers/isolated-tests.js';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CurrentCore, project } from '../../plugin-src/shared/resources/protocol/current/core.js';
import { CONTRACT, DEFAULT_DIALS, dialChange, startDial } from '../../plugin-src/shared/resources/protocol/current/contracts.js';
import { git } from '../../plugin-src/shared/resources/protocol/current/evidence.js';

const test = isolatedTests(import.meta.url);
const human = { kind: 'human-confirmed', instruction: 'Light for this one.', context: 'test user conversation' };

async function fixture(t, start = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gatereeve-dials-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'app'), home = join(root, 'docs/issues/feature');
  await mkdir(repo, { recursive: true }); await mkdir(home, { recursive: true });
  await git(repo, ['init', '-b', 'topic']);
  await git(repo, ['config', 'user.email', 'fixture@example.test']);
  await git(repo, ['config', 'user.name', 'Fixture']);
  await git(repo, ['config', 'commit.gpgsign', 'false']);
  await writeFile(join(repo, 'app.js'), 'export const answer = 42;\n');
  await git(repo, ['add', 'app.js']); await git(repo, ['commit', '-m', 'fixture']);
  const context = { featureId: 'feature', featureHome: home, workspaceRoot: root, repositories: [{ alias: 'app', path: repo }] };
  const core = await CurrentCore.at(context);
  const request = (operation, input = {}, operationId) => core.execute({ operation, input, operationId });
  return { root, repo, home, core, request, start: input => request('run.start', { runId: 'run-one', implementers: ['implementer-one'], ...start, ...input }, 'start-one') };
}

test('new runs default to full/supervised with built-in provenance and time', async t => {
  const f = await fixture(t); await f.start();
  const status = await f.request('status');
  assert.equal(status.contract, CONTRACT);
  assert.equal(CONTRACT, 'gatereeve/current/7');
  for (const dial of ['rigor', 'autonomy']) {
    assert.equal(status.dials[dial].value, DEFAULT_DIALS[dial]);
    assert.equal(status.dials[dial].source, 'built-in');
    assert.equal(status.dials[dial].actor, null);
    assert.ok(Date.parse(status.dials[dial].at));
  }
  assert.deepEqual(status.dialHistory.map(item => item.dial), ['rigor', 'autonomy']);
});

test('explicit light at start records the observed human instruction', async t => {
  const f = await fixture(t);
  await f.start({ rigor: { value: 'light', authority: human, reason: 'Small UX slice' } });
  const { rigor, autonomy } = (await f.request('status')).dials;
  assert.deepEqual({ value: rigor.value, source: rigor.source, actor: rigor.actor, reason: rigor.reason },
    { value: 'light', source: 'explicit', actor: 'human', reason: 'Small UX slice' });
  assert.equal(rigor.authority.instruction, 'Light for this one.');
  assert.equal(autonomy.value, 'supervised');
});

test('invalid, unauthorized or unavailable start choices never yield light or delegated', async t => {
  for (const [input, pattern] of [
    [{ rigor: { value: 'light' } }, /observed human instruction/],
    [{ rigor: { value: 'lite', authority: human } }, /Invalid rigor/],
    [{ rigor: 'light' }, /must be an object/],
    [{ rigor: { value: 'light', authority: human, scope: 'repo' } }, /Unsupported rigor choice field/],
    [{ rigor: { value: 'light', authority: { kind: 'agent', instruction: 'x', context: 'y' } } }, /observed human instruction/],
    [{ autonomy: { value: 'delegated', authority: human } }, /protection checks/],
  ]) {
    const f = await fixture(t);
    await assert.rejects(f.start(input), pattern);
    await assert.rejects(f.core.state(), /No current run/);
  }
  // An explicit default needs no human instruction and is recorded as explicit.
  assert.deepEqual(startDial('rigor', { value: 'full' }), { value: 'full', source: 'explicit', actor: 'agent' });
});

test('configuration cannot change dial defaults', async t => {
  const f = await fixture(t);
  const { executeCurrentRequest } = await import('../../plugin-src/shared/resources/protocol/current/adapter.js');
  await git(f.repo, ['config', 'agentic-workflow.rigor', 'light']);
  await git(f.repo, ['config', 'agentic-workflow.autonomy', 'delegated']);
  await git(f.repo, ['config', 'gatereeve.rigor', 'light']);
  await writeFile(join(f.root, '.agentic-workflow.json'), JSON.stringify({ schemaVersion: 1, featureId: 'feature', rigor: 'light', autonomy: 'delegated',
    repositories: { app: { path: 'app', integrationBranch: 'main', rigor: 'light' } } }));
  const before = await executeCurrentRequest({ operation: 'status', cwd: f.repo });
  // Unknown configuration fields are ignored, never interpreted as dial choices.
  assert.equal(before.ok, true, JSON.stringify(before.error));
  {
    assert.equal(before.data.dials, null);
    assert.deepEqual(before.data.dialDefaults, { rigor: 'full', autonomy: 'supervised' });
    const started = await executeCurrentRequest({ operation: 'run.start', cwd: f.repo, operationId: 'cfg-start', input: { implementers: ['implementer-one'] } });
    assert.equal(started.ok, true);
    const status = await executeCurrentRequest({ operation: 'status', cwd: f.repo });
    assert.deepEqual(status.data.dials, { rigor: 'full', autonomy: 'supervised' });
  }
});

test('raising rigor is open to either actor and a raised run can never be lowered', async t => {
  const f = await fixture(t);
  await f.start({ rigor: { value: 'light', authority: human } });
  await assert.rejects(f.request('run.set-dial', { dial: 'rigor', value: 'full', actor: 'agent' }, 'no-reason'), /reason/);
  await assert.rejects(f.request('run.set-dial', { dial: 'rigor', value: 'full', actor: 'agent', authority: human, reason: 'x' }, 'claim'), /cannot claim human authority/);
  await f.request('run.set-dial', { dial: 'rigor', value: 'full', actor: 'agent', reason: 'Tripped on a migration' }, 'raise');
  let status = await f.request('status');
  assert.equal(status.dials.rigor.value, 'full'); assert.equal(status.dials.rigor.actor, 'agent'); assert.equal(status.dials.rigor.previous, 'light');
  await assert.rejects(f.request('run.set-dial', { dial: 'rigor', value: 'full', actor: 'agent', reason: 'again' }, 'same'), /already full/);
  for (const [actor, extra] of [['agent', {}], ['human', { authority: human }]]) {
    await assert.rejects(f.request('run.set-dial', { dial: 'rigor', value: 'light', actor, reason: 'faster', ...extra }, `lower-${actor}`),
      /cannot be lowered within a run; to work at light rigor, start a new light run/);
  }
  status = await f.request('status');
  assert.equal(status.dials.rigor.value, 'full');
  assert.deepEqual(status.dialHistory.map(item => `${item.dial}:${item.value}:${item.actor ?? 'built-in'}`),
    ['rigor:light:human', 'autonomy:supervised:built-in', 'rigor:full:agent']);
});

test('delegation is human-only and unavailable before protection checks', async t => {
  const f = await fixture(t); await f.start();
  await assert.rejects(f.request('run.set-dial', { dial: 'autonomy', value: 'delegated', actor: 'agent', reason: 'go' }, 'agent-delegate'), /Only a human can delegate/);
  await assert.rejects(f.request('run.set-dial', { dial: 'autonomy', value: 'delegated', actor: 'human', authority: human, reason: 'go' }, 'human-delegate'), /protection checks/);
  assert.equal((await f.request('status')).dials.autonomy.value, 'supervised');
});

test('rules: rigor never falls within a run for any actor or autonomy; hand-back is open to either actor', () => {
  const dials = (rigor, autonomy) => ({ dials: { rigor: { value: rigor }, autonomy: { value: autonomy } } });
  for (const autonomy of ['supervised', 'delegated']) for (const actor of ['human', 'agent']) {
    const lower = { dial: 'rigor', value: 'light', actor, reason: 'r', ...(actor === 'human' ? { authority: human } : {}) };
    assert.throws(() => dialChange(dials('full', autonomy), lower), /cannot be lowered within a run; to work at light rigor, start a new light run/);
  }
  for (const actor of ['agent', 'human']) {
    const change = dialChange(dials('full', 'delegated'), { dial: 'autonomy', value: 'supervised', actor, reason: 'uncertain', ...(actor === 'human' ? { authority: human } : {}) });
    assert.equal(change.value, 'supervised'); assert.equal(change.previous, 'delegated');
  }
  const raise = { dial: 'rigor', value: 'full', actor: 'agent', reason: 'r' };
  assert.equal(dialChange(dials('light', 'supervised'), raise).value, 'full');
  assert.throws(() => dialChange(dials('light', 'supervised'), { ...raise, dial: 'mode' }), /Unknown run dial/);
  assert.throws(() => dialChange(dials('light', 'supervised'), { ...raise, extra: 1 }), /Unsupported dial change field/);
  assert.throws(() => dialChange(dials('light', 'supervised'), { ...raise, actor: 'system' }), /human or agent/);
});

test('dial changes retain recorded evidence', () => {
  const event = (sequence, type, payload) => ({ runId: 'r', sequence, type, payload, recordedAt: `2026-11-15T00:00:0${sequence}Z`, hash: `h${sequence}` });
  const ref = { hash: 'sha256:' + 'e'.repeat(64), bytes: 1, format: 'json' };
  const state = project([
    event(1, 'STARTED', { featureId: 'feature', implementers: ['i'], optionalGates: [], dials: { rigor: startDial('rigor', { value: 'light', authority: human }), autonomy: startDial('autonomy') } }),
    event(2, 'JOB_STARTED', { jobId: 'j', gates: ['review'] }),
    event(3, 'JOB_FINISHED', { jobId: 'j', results: [ref] }),
    event(4, 'DIAL_SET', { dial: 'rigor', value: 'full', previous: 'light', source: 'explicit', actor: 'agent', reason: 'Tripwire' }),
  ]);
  assert.deepEqual(state.results, [ref]);
  assert.equal(state.dials.rigor.value, 'full'); assert.equal(state.dials.rigor.at, '2026-11-15T00:00:04Z');
});

test('an earlier-contract run is retained, reported as needing resumption, and resumes at the defaults', async t => {
  const f = await fixture(t);
  const { executeCurrentRequest } = await import('../../plugin-src/shared/resources/protocol/current/adapter.js');
  const { DATABASE_NAME } = await import('../../plugin-src/shared/resources/protocol/current/workflow-database.js');
  const { DatabaseSync } = await import('node:sqlite');
  const { createHash } = await import('node:crypto');
  await writeFile(join(f.root, '.agentic-workflow.json'), JSON.stringify({ schemaVersion: 1, featureId: 'feature',
    repositories: { app: { path: 'app', integrationBranch: 'main' } } }));
  // A real contract-6 store: plain workflow.sqlite with an active run and events.
  const store = join(f.home, '.gatereeve-current');
  await mkdir(store, { recursive: true, mode: 0o700 });
  const legacyPath = join(store, 'workflow.sqlite');
  // Contract 5 pointer retained from the earlier 5 -> 6 upgrade.
  await writeFile(join(store, 'active.json'), '{"contract":"gatereeve/current/5","runId":"older"}');
  const legacy = new DatabaseSync(legacyPath);
  legacy.exec('PRAGMA journal_mode = WAL');
  legacy.exec(`CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    CREATE TABLE events(run_id TEXT NOT NULL, sequence INTEGER NOT NULL, operation_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(run_id,sequence), UNIQUE(run_id,operation_id)) STRICT;
    PRAGMA user_version = 1;`);
  legacy.prepare('INSERT INTO metadata VALUES (?,?)').run('contract', 'gatereeve/current/6');
  legacy.prepare('INSERT INTO metadata VALUES (?,?)').run('active', JSON.stringify({ contract: 'gatereeve/current/6', runId: 'old' }));
  legacy.prepare('INSERT INTO events VALUES (?,?,?,?)').run('old', 1, 'start', JSON.stringify({ contract: 'gatereeve/current/6', type: 'STARTED' }));
  legacy.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  legacy.close();
  const digest = async () => createHash('sha256').update(await readFile(legacyPath)).digest('hex');
  const before = await digest();
  assert.notEqual(DATABASE_NAME, 'workflow.sqlite');
  const status = await executeCurrentRequest({ operation: 'status', cwd: f.repo });
  assert.equal(status.ok, true, JSON.stringify(status.error)); assert.equal(status.data.mode, 'current-entry');
  assert.equal(status.data.dials, null);
  assert.equal(status.data.actions[0].id, 'resume-current');
  // A fresh start cannot bypass the retained earlier-contract run.
  const started = await executeCurrentRequest({ operation: 'run.start', cwd: f.repo, operationId: 'bypass', input: { implementers: ['implementer-one'] } });
  assert.equal(started.ok, false); assert.match(JSON.stringify(started.error), /resume-current/);
  const resumed = await executeCurrentRequest({ operation: 'run.resume-current', cwd: f.repo, operationId: 'resume', input: { implementers: ['implementer-one'] } });
  assert.equal(resumed.ok, true, JSON.stringify(resumed.error));
  const after = await executeCurrentRequest({ operation: 'status', cwd: f.repo });
  assert.equal(after.data.mode, 'governed');
  assert.deepEqual(after.data.dials, { rigor: 'full', autonomy: 'supervised' });
  assert.equal(await digest(), before, 'The earlier-contract database is retained byte-for-byte');
  // The resumed run links the newest earlier activation (contract 6, not the
  // older contract-5 pointer) as provenance without interpreting it.
  const core = await CurrentCore.at({ featureId: 'feature', featureHome: f.home, workspaceRoot: f.root, repositories: [{ alias: 'app', path: f.repo }] });
  const first = (await core.state()).events[0];
  assert.ok(first.payload.priorActive, 'STARTED records the earlier activation');
  assert.equal((await core.store.get(first.payload.priorActive)).toString(), JSON.stringify({ contract: 'gatereeve/current/6', runId: 'old' }));
});

test('resuming an active run reports a differing dial choice instead of dropping it', async t => {
  const f = await fixture(t); await f.start();
  const resume = (input, id) => f.request('run.resume-current', { runId: 'run-one', implementers: ['implementer-one'], ...input }, id);
  await resume({ rigor: { value: 'full' } }, 'same');
  await assert.rejects(resume({ rigor: { value: 'light', authority: human } }, 'differs'), /already rigor full; change it with run.set-dial/);
  assert.equal((await f.request('status')).dials.rigor.value, 'full');
});
