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

test('raising rigor and returning to supervised are open to either actor; lowering needs a human', async t => {
  const f = await fixture(t);
  await f.start({ rigor: { value: 'light', authority: human } });
  await assert.rejects(f.request('run.set-dial', { dial: 'rigor', value: 'full', actor: 'agent' }, 'no-reason'), /reason/);
  await assert.rejects(f.request('run.set-dial', { dial: 'rigor', value: 'full', actor: 'agent', authority: human, reason: 'x' }, 'claim'), /cannot claim human authority/);
  await f.request('run.set-dial', { dial: 'rigor', value: 'full', actor: 'agent', reason: 'Tripped on a migration' }, 'raise');
  let status = await f.request('status');
  assert.equal(status.dials.rigor.value, 'full'); assert.equal(status.dials.rigor.actor, 'agent'); assert.equal(status.dials.rigor.previous, 'light');
  await assert.rejects(f.request('run.set-dial', { dial: 'rigor', value: 'full', actor: 'agent', reason: 'again' }, 'same'), /already full/);
  await assert.rejects(f.request('run.set-dial', { dial: 'rigor', value: 'light', actor: 'agent', reason: 'faster' }, 'agent-lower'), /Only a human can lower rigor/);
  await assert.rejects(f.request('run.set-dial', { dial: 'rigor', value: 'light', actor: 'human', reason: 'faster' }, 'no-quote'), /observed instruction/);
  await f.request('run.set-dial', { dial: 'rigor', value: 'light', actor: 'human', authority: human, reason: 'Back to light' }, 'lower');
  status = await f.request('status');
  assert.equal(status.dials.rigor.value, 'light');
  assert.deepEqual(status.dialHistory.map(item => `${item.dial}:${item.value}:${item.actor ?? 'built-in'}`),
    ['rigor:light:human', 'autonomy:supervised:built-in', 'rigor:full:agent', 'rigor:light:human']);
});

test('delegation is human-only and unavailable before protection checks', async t => {
  const f = await fixture(t); await f.start();
  await assert.rejects(f.request('run.set-dial', { dial: 'autonomy', value: 'delegated', actor: 'agent', reason: 'go' }, 'agent-delegate'), /Only a human can delegate/);
  await assert.rejects(f.request('run.set-dial', { dial: 'autonomy', value: 'delegated', actor: 'human', authority: human, reason: 'go' }, 'human-delegate'), /protection checks/);
  assert.equal((await f.request('status')).dials.autonomy.value, 'supervised');
});

test('rules: lowering rigor is refused under delegation or unresolved required FAIL; hand-back is open to either actor', () => {
  const dials = (rigor, autonomy) => ({ dials: { rigor: { value: rigor }, autonomy: { value: autonomy } } });
  const lower = { dial: 'rigor', value: 'light', actor: 'human', authority: human, reason: 'r' };
  assert.throws(() => dialChange(dials('full', 'delegated'), lower), /under delegated autonomy/);
  assert.throws(() => dialChange(dials('full', 'supervised'), lower, ['review']), /unresolved FAIL: review/);
  assert.equal(dialChange(dials('full', 'supervised'), lower, []).value, 'light');
  for (const actor of ['agent', 'human']) {
    const change = dialChange(dials('full', 'delegated'), { dial: 'autonomy', value: 'supervised', actor, reason: 'uncertain', ...(actor === 'human' ? { authority: human } : {}) });
    assert.equal(change.value, 'supervised'); assert.equal(change.previous, 'delegated');
  }
  assert.throws(() => dialChange(dials('full', 'supervised'), { ...lower, dial: 'mode' }), /Unknown run dial/);
  assert.throws(() => dialChange(dials('full', 'supervised'), { ...lower, extra: 1 }), /Unsupported dial change field/);
  assert.throws(() => dialChange(dials('full', 'supervised'), { ...lower, actor: 'system' }), /human or agent/);
});

test('unresolved required FAIL detection binds the current candidate and honours waivers', async () => {
  const candidate = { hash: 'sha256:' + 'c'.repeat(64) }, other = { hash: 'sha256:' + 'd'.repeat(64) };
  const objects = {
    rf: { gate: 'review', outcome: 'FAIL', input: { hash: 'in-current' } },
    vp: { gate: 'verification', outcome: 'PASS', input: { hash: 'in-current' } },
    old: { gate: 'verification', outcome: 'FAIL', input: { hash: 'in-other' } },
    'in-current': { candidate }, 'in-other': { candidate: other },
  };
  const fake = { store: { json: async ref => objects[ref.hash] } };
  const state = { candidate, optionalGates: [], results: [{ hash: 'old' }, { hash: 'vp' }, { hash: 'rf' }], decisions: [] };
  const failures = CurrentCore.prototype.unresolvedRequiredFailures;
  assert.deepEqual(await failures.call(fake, state), ['review']);
  const waived = { ...state, decisions: [{ kind: 'waive', subject: candidate.hash, gates: ['review'] }] };
  assert.deepEqual(await failures.call(fake, waived), []);
  assert.deepEqual(await failures.call(fake, { ...state, candidate: null }), []);
  // The earlier FAIL for another candidate is not the latest current result.
  assert.deepEqual(await failures.call(fake, { ...state, results: [{ hash: 'old' }] }), []);
});

test('dial changes retain recorded evidence', () => {
  const event = (sequence, type, payload) => ({ runId: 'r', sequence, type, payload, recordedAt: `2026-11-15T00:00:0${sequence}Z`, hash: `h${sequence}` });
  const ref = { hash: 'sha256:' + 'e'.repeat(64), bytes: 1, format: 'json' };
  const state = project([
    event(1, 'STARTED', { featureId: 'feature', implementers: ['i'], optionalGates: [], dials: { rigor: startDial('rigor'), autonomy: startDial('autonomy') } }),
    event(2, 'JOB_STARTED', { jobId: 'j', gates: ['review'] }),
    event(3, 'JOB_FINISHED', { jobId: 'j', results: [ref] }),
    event(4, 'DIAL_SET', { dial: 'rigor', value: 'light', previous: 'full', source: 'explicit', actor: 'human', authority: human, reason: 'r' }),
  ]);
  assert.deepEqual(state.results, [ref]);
  assert.equal(state.dials.rigor.value, 'light'); assert.equal(state.dials.rigor.at, '2026-11-15T00:00:04Z');
});

test('an earlier-contract run is retained, reported as needing resumption, and resumes at the defaults', async t => {
  const f = await fixture(t);
  const { executeCurrentRequest } = await import('../../plugin-src/shared/resources/protocol/current/adapter.js');
  await writeFile(join(f.root, '.agentic-workflow.json'), JSON.stringify({ schemaVersion: 1, featureId: 'feature',
    repositories: { app: { path: 'app', integrationBranch: 'main' } } }));
  await mkdir(join(f.home, '.gatereeve-current'), { recursive: true });
  const legacy = '{"contract":"gatereeve/current/6","runId":"old"}';
  await writeFile(join(f.home, '.gatereeve-current/active.json'), legacy);
  const status = await executeCurrentRequest({ operation: 'status', cwd: f.repo });
  assert.equal(status.ok, true); assert.equal(status.data.mode, 'current-entry');
  assert.equal(status.data.dials, null);
  assert.equal(status.data.actions[0].id, 'resume-current');
  const resumed = await executeCurrentRequest({ operation: 'run.resume-current', cwd: f.repo, operationId: 'resume', input: { implementers: ['implementer-one'] } });
  assert.equal(resumed.ok, true, JSON.stringify(resumed.error));
  const after = await executeCurrentRequest({ operation: 'status', cwd: f.repo });
  assert.deepEqual(after.data.dials, { rigor: 'full', autonomy: 'supervised' });
  assert.equal(await readFile(join(f.home, '.gatereeve-current/active.json'), 'utf8'), legacy);
});
