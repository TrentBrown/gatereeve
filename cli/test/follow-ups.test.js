import './helpers/private-scratch.js';
// Follow-up records (issue #148; spec AC1-AC8, AC10 and amendment 1, rubric
// R1-R8, R10). Reviewer output, GitHub and the evaluators are simulated; the
// journal, source pins and decisions are real.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hostname } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fixture, human, openPr, candidate } from './helpers/lightweight-fixture.js';
import { selection, pairedAdapters } from './helpers/paired-review-fixture.js';
import { revise, seedRounds, reviewers } from './helpers/round-fixture.js';
import { fixed } from './helpers/sweep-fixture.js';
import { currentFixture } from './helpers/current-fixture.js';
import { establishCurrentRun } from './helpers/established-current-run.js';
import { recordFollowUps, followUpRecords, followUpId, followUpMarker, defaultDecision, deriveReviewRecords, currentDecision, issueText, redactor,
  FOLLOW_UPS_FILE } from '../../plugin-src/shared/resources/protocol/current/follow-ups.js';
import { boundaryReviews } from '../../plugin-src/shared/resources/protocol/current/boundary-review.js';
import { identity } from '../../plugin-src/shared/resources/protocol/current/contracts.js';
import { git } from '../../plugin-src/shared/resources/protocol/current/evidence.js';

const exec = promisify(execFile);
const cliPath = resolve(import.meta.dirname, '../bin/workflow.js');
const F = index => `codex/codex-finding-${index}`;
const finding = (evidence, extra = {}) => ({ path: 'app/app.js', evidence, classId: 'class-a', classStatement: `Class of ${evidence}`, ...extra });
const low = (extra = {}) => finding('[low] A low risk.', extra);
const medium = (extra = {}) => finding('[medium] A medium risk.', extra);
const high = (extra = {}) => finding('[high] A high risk.', extra);
const named = id => verdict => { verdict.findings.forEach((row, index) => { if (index === 0) row.id = id; }); };
// Dispositions on earlier findings (a low one is disclosed but not required).
const dispose = rows => verdict => {
  verdict.dispositions = rows.map(([id, status]) => ({ id, status, evidence: `Reviewer says ${status}.` }));
};
const records = async f => (await followUpRecords(f.core)).records;
const byFinding = (list, id) => list.find(record => record.origin.findingId === id);
const missing = async (f, name) => (await f.request('milestone.check', { name })).missing.join('; ');
const scan = (extra = {}) => ({ repository: 'app', manifest: 'package-lock.json', vulnId: 'SNYK-JS-LODASH-1', package: 'lodash', version: '4.17.20', severity: 'high', title: 'Prototype pollution', ...extra });
const scanOrigin = { kind: 'dependency-scan' };

async function run(t, options = {}) {
  const f = await fixture(t, { rigor: 'full', files: { 'other.js': 'export const other = 1;\n' }, ...options });
  await revise(f, { 'app.js': 'export const answer = 42;\n' }, 'r1');
  await f.request('review.select', selection(), 'select');
  return f;
}
// One paired round: codex raises `findings`, claude PASSes unless patched.
async function round(f, label, findings, patch = {}) {
  reviewers(f, { findings: { codex: findings }, patch });
  return f.request('review.execute', {}, `round-${label}`);
}
const decide = (f, input, id) => f.request('followup.decide', { reason: 'Test decision.', authority: { ...human, instruction: 'Decide these.' }, ...input }, id);
// GitHub issues double: list and create, recording every call.
function issues(f, { fail = () => false, searchLag = false } = {}) {
  const host = { issues: [], calls: [] };
  const previous = f.core.runtime.gh;
  f.core.runtime.gh = async (root, args) => {
    if (args[0] !== 'issue') return previous(root, args);
    host.calls.push(args);
    const repo = args[args.indexOf('--repo') + 1];
    if (fail(args, host)) throw Object.assign(new Error('Command failed: gh issue'), { stderr: 'HTTP 502' });
    // searchLag: the search index has not seen any issue yet; a plain list has.
    if (args[1] === 'list') return JSON.stringify(searchLag && args.includes('--search') ? [] : host.issues.filter(issue => issue.repo === repo && issue.state === 'open'));
    if (args[1] === 'create') {
      const number = host.issues.length + 100;
      host.issues.push({ repo, number, url: `https://github.com/${repo}/issues/${number}`, title: args[args.indexOf('--title') + 1], body: args[args.indexOf('--body') + 1], state: 'open' });
      return `https://github.com/${repo}/issues/${number}\n`;
    }
    throw new Error(`Unexpected gh issue call ${args.join(' ')}`);
  };
  return host;
}

test('R1: non-blocking findings become follow-ups with their origin, finding and reason; blocking ones never do', async t => {
  const f = await run(t);
  await round(f, 1, [low(), medium({ blocking: false }), high()]);
  const list = await records(f);
  const reports = await Promise.all((await f.core.state()).state.results.map(async ref => ({ ref, report: await f.core.store.json(ref) })));
  const resultHash = reports.find(item => item.report.gate === 'review' && item.report.findings?.length).ref.hash;
  assert.deepEqual(list.map(record => [record.origin.findingId, record.reason, record.finding.severity]).sort(), [[F(0), 'low', 'low'], [F(1), 'reviewer-non-blocking', 'medium']]);
  const record = byFinding(list, F(0));
  assert.equal(record.dedupKey, `review:${resultHash}:${F(0)}`);
  assert.equal(record.id, followUpId(record.dedupKey));
  assert.match(record.id, /^fu-[0-9a-f]{12}$/u);
  assert.equal(record.repository, 'app');
  assert.deepEqual(record.origin, { kind: 'review', result: resultHash, findingId: F(0), provider: 'codex', model: 'fixture', reviewScope: 'slice', round: 1 });
  assert.deepEqual(record.finding, { findingId: F(0), classId: 'class-a', class: 'Class of [low] A low risk.', criterion: 'R1', path: 'app/app.js', severity: 'low',
    failureScenario: 'Fixture input -> wrong observable output' });
  assert.deepEqual([record.status, record.decision], ['undecided', null]);
});

test('R1: round 4 demotes a medium and keeps a low; a regression-path finding, a missed swept site and a latest blocking report are not follow-ups', async t => {
  const f = await run(t);
  await seedRounds(f, 2);
  // Round 3 raises a blocking medium; round 4 re-reports it demoted (amendment 1).
  await round(f, 3, [medium({ path: 'app/other.js', classId: 'class-b' })], { codex: named('carried') });
  assert.equal(byFinding(await records(f), 'codex/carried'), undefined, 'a blocking first raise is not a follow-up');
  await revise(f, { 'app.js': 'export const answer = 42; // r4\n' }, 'r4');
  await round(f, 4, [medium({ path: 'app/other.js', classId: 'class-b' }), low({ path: 'app/other.js' }), medium({ path: 'app/app.js', classId: 'class-c' })], {
    codex: verdict => { verdict.findings[0].id = 'carried'; verdict.findings[1].id = 'low-4'; verdict.findings[2].id = 'on-fix'; } });
  const list = await records(f);
  const carried = byFinding(list, 'codex/carried');
  assert.deepEqual([carried?.reason, carried?.origin.round], ['demoted', 3], 'blocked when raised, demoted when re-reported: a follow-up with its first origin');
  assert.equal(byFinding(list, 'codex/low-4')?.reason, 'low');
  assert.equal(byFinding(list, 'codex/on-fix'), undefined, 'a medium on the previous fix\'s changed path is a regression and blocks');
  // Round 5: a fixed claim sweeps class-b; a new medium of that class is a missed site and blocks.
  await revise(f, { 'other.js': 'export const other = 2;\n' }, 'r5');
  reviewers(f, { findings: { codex: [medium({ path: 'app/app.js', classId: 'class-b', evidence: '[medium] A missed site.' })] },
    patch: { codex: verdict => { verdict.findings[0].id = 'missed-site'; } } });
  await f.request('review.execute', { claims: [fixed('codex/carried', 'Fixed every site.')] }, 'round-5');
  assert.equal(byFinding(await records(f), 'codex/missed-site'), undefined, 'a missed site of a swept class blocks');
  // A later blocking report of a follow-up removes it (its latest report blocked).
  await revise(f, { 'app.js': 'export const answer = 42; // r6\n' }, 'r6');
  await round(f, 6, [high({ path: 'app/other.js' })], { codex: verdict => { verdict.findings[0].id = 'low-4'; } });
  assert.equal(byFinding(await records(f), 'codex/low-4'), undefined);
});

test('R1: a waived or adjudicated blocking finding is not a follow-up; a path outside every alias belongs to the first repository', async t => {
  const mandate = { goal: 'Export the constant answer.', constraints: ['Keep the public export named answer.'] };
  const f = await run(t);
  await f.request('run.set-dial', { dial: 'autonomy', value: 'goal', actor: 'human', runId: 'run-one', authority: { ...human, instruction: 'Run run-one in goal mode.' },
    reason: 'Unattended mandate', mandate }, 'goal');
  await f.request('candidate.ready', {}, 'ready');
  pairedAdapters(f, { blocking: ['claude-code'] });
  await f.request('review.execute', {}, 'blocked');
  const { state } = await f.core.state();
  const pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  const blockingId = pair.members[1].result.findings[0].id;
  await f.request('review.adjudicate', { candidate: state.candidate.hash, pair: pair.identity, reason: 'In-scope judgment call.', evidence: pair.members.map(member => member.ref),
    dispositions: [{ findingId: blockingId, outcome: 'accepted-risk', reason: 'Bounded', evidence: 'Both reviewers assessed it.', residualRisk: 'Documented.' }] }, 'adjudicate');
  assert.equal(byFinding(await records(f), blockingId), undefined, 'adjudicated');
  await f.request('human.decide', { kind: 'waive', subject: state.candidate.hash, gates: ['review'], authority: { ...human, instruction: 'Waive the review.' },
    reason: 'Accepted', consequences: 'Residual risk' }, 'waive');
  assert.equal(byFinding(await records(f), blockingId), undefined, 'waived');
  // Pure derivation: repository routing, and earlier-contract findings without severity.
  const report = findings => ({ ref: { hash: identity({ findings }) }, report: { gate: 'review', findings, dispositions: [] },
    input: { configuration: { provider: 'codex', model: 'm' }, roundPolicy: { scope: 'slice', round: 1, epoch: 0, revision: 'r' } }, candidate: { repositories: [{ alias: 'docs' }, { alias: 'app' }] }, sequence: 1 });
  const derived = deriveReviewRecords([{ alias: 'app' }, { alias: 'docs' }], [report([
    { id: 'a', severity: 'low', blocking: false, path: 'app/x.js' }, { id: 'b', severity: 'low', blocking: false, path: 'docs/guide.md' },
    { id: 'c', severity: 'low', blocking: false, path: 'requirements/spec.md' }, { id: 'd', severity: 'low', blocking: false, path: 'README.md' },
    { id: 'legacy', blocking: false, path: 'app/x.js' }])]);
  assert.deepEqual(derived.map(row => [row.origin.findingId, row.repository]), [['a', 'app'], ['b', 'docs'], ['c', 'docs'], ['d', 'docs']]);
});

test('R1: resolved makes a follow-up fixed, unsupported leaves it, a peer still present keeps it open, and a re-report reopens it as undecided', () => {
  // Pure derivation over retained reports in journal order (the review
  // pipeline decides which dispositions a reviewer may give; this tests how
  // follow-ups read them).
  let sequence = 0;
  const report = (provider, round, findings, dispositions) => ({ ref: { hash: identity({ provider, round, sequence }) }, report: { gate: 'review', findings, dispositions },
    input: { configuration: { provider, model: 'm' }, roundPolicy: { scope: 'slice', round, epoch: 0, revision: `rev-${round}` } }, candidate: null, sequence: sequence++ });
  const raised = { id: 'L', severity: 'low', blocking: false, path: 'app/app.js' };
  const at = rounds => deriveReviewRecords([{ alias: 'app' }], rounds.flat())[0];
  const round1 = [report('codex', 1, [raised], []), report('claude-code', 1, [], [])];
  const disposed = (round, codex, claude) => [report('codex', round, [], [{ id: 'L', status: codex }]), report('claude-code', round, [], [{ id: 'L', status: claude }])];
  assert.deepEqual([at([round1]).fixed, at([round1]).reopenedAt], [false, -1]);
  assert.equal(at([round1, disposed(2, 'unsupported', 'unsupported')]).fixed, false, 'unsupported does not change the status');
  assert.equal(at([round1, disposed(2, 'resolved', 'present')]).fixed, false, 'a peer still marking it present keeps it open');
  assert.equal(at([round1, disposed(2, 'resolved', 'resolved')]).fixed, true, 'resolved by every perspective of the round');
  const reopenedRounds = [round1, disposed(2, 'resolved', 'resolved'), [report('codex', 3, [raised], []), report('claude-code', 3, [], [])]];
  const reopened = at(reopenedRounds);
  assert.deepEqual([reopened.fixed, reopened.reopenedAt], [false, reopenedRounds.flat().at(-1).sequence], 'a re-report after fixed reopens it');
  // A later `present` disposition after fixed reopens it too.
  const presentRounds = [round1, disposed(2, 'resolved', 'resolved'), disposed(3, 'present', 'resolved')];
  const byPresent = at(presentRounds);
  assert.deepEqual([byPresent.fixed, byPresent.reopenedAt], [false, presentRounds.flat().at(-1).sequence], 'a present disposition after fixed reopens it');
  // Decisions recorded before the reopening no longer count.
  const decided = [{ decision: 'accept-risk', authorityKind: 'human-confirmed', sequence: 1 }];
  assert.equal(currentDecision(decided, -1)?.decision, 'accept-risk');
  assert.equal(currentDecision(decided, reopened.reopenedAt), null);
  assert.equal(currentDecision([...decided, { decision: 'reject', authorityKind: 'policy-default', sequence: reopened.reopenedAt + 1 }], reopened.reopenedAt)?.decision, 'reject');
});

test('R1: a decided follow-up keeps its decision across rounds and status reports the derived status end to end', async t => {
  const f = await run(t);
  await round(f, 1, [low()]);
  const [record] = await records(f);
  await decide(f, { followUps: [record.id], decision: 'accept-risk' }, 'accept');
  await revise(f, { 'app.js': 'export const answer = 42; // r2\n' }, 'r2');
  await round(f, 2, []);
  const [after] = (await f.request('status')).followUps.records;
  assert.deepEqual([after.id, after.status, after.decision.decision, after.decision.authorityKind], [record.id, 'accepted-risk', 'accept-risk', 'human-confirmed']);
});

test('R2: a non-review origin records one follow-up per dedup key and returns each input\'s ID in order; bad input is refused with nothing recorded', async t => {
  const f = await run(t);
  const ids = await recordFollowUps(f.core, { origin: scanOrigin, findings: [scan(), scan({ vulnId: 'SNYK-JS-X-2' }), scan()] });
  const again = await recordFollowUps(f.core, { origin: scanOrigin, findings: [scan()] });
  assert.equal(ids.length, 3); assert.equal(ids[0], ids[2]); assert.notEqual(ids[0], ids[1]); assert.deepEqual(again, [ids[0]]);
  const { events } = await f.core.state();
  assert.equal(events.filter(event => event.type === 'FOLLOW_UP_RECORDED').length, 2);
  const record = (await records(f)).find(row => row.id === ids[0]);
  const dedupKey = 'dependency-scan:app:package-lock.json:SNYK-JS-LODASH-1:lodash@4.17.20';
  assert.deepEqual([record.id, record.dedupKey, record.repository, record.reason, record.status], [followUpId(dedupKey), dedupKey, 'app', 'pre-existing', 'undecided']);
  assert.deepEqual(record.origin, { kind: 'dependency-scan', ...scan(), preExisting: true });
  assert.deepEqual(record.finding, { findingId: null, classId: null, class: 'Prototype pollution', criterion: null, path: 'package-lock.json', severity: 'high', failureScenario: null });
  const count = (await f.core.state()).events.length;
  const refused = async (input, pattern) => assert.rejects(recordFollowUps(f.core, input), pattern);
  await refused({ origin: { kind: 'review' }, findings: [scan()] }, /origin\.kind must be dependency-scan/);
  await refused({ origin: { kind: 'dependency-scan', extra: 1 }, findings: [scan()] }, /origin has exactly kind/);
  await refused({ origin: scanOrigin, findings: [{ ...scan(), title: undefined }] }, /findings\[0\]\.title must be nonempty text/);
  await refused({ origin: scanOrigin, findings: [scan(), { ...scan(), cvss: 7 }] }, /findings\[1\]\.cvss is not allowed/);
  await refused({ origin: scanOrigin, findings: [scan({ repository: 'unknown' })] }, /findings\[0\]\.repository must be a configured repository alias/);
  await refused({ origin: scanOrigin, findings: [scan({ severity: 'severe' })] }, /findings\[0\]\.severity must be/);
  assert.equal((await f.core.state()).events.length, count, 'nothing recorded');
});

test('R3: decisions by IDs and by select, supersession, policy defaults skipping human decisions, and eight refusals', async t => {
  const f = await run(t);
  await round(f, 1, [low(), low({ path: 'app/other.js' }), medium({ blocking: false })]);
  const list = await records(f);
  const [a, b] = [F(0), F(1)].map(id => byFinding(list, id)), m = byFinding(list, F(2));
  const byId = await decide(f, { followUps: [a.id], decision: 'reject' }, 'reject-a');
  assert.equal(byId.event.type, 'FOLLOW_UP_DECIDED');
  assert.deepEqual(byId.event.payload.decisions, [{ id: a.id, decision: 'reject' }]);
  assert.equal(byId.event.payload.authority.kind, 'human-confirmed');
  const bySelect = await decide(f, { select: { status: 'undecided', severity: 'low' }, decision: 'accept-risk' }, 'select-low');
  assert.deepEqual(bySelect.decided.map(row => row.id), [b.id]);
  // A policy default never supersedes a human decision; a later human one does.
  issues(f);
  const defaults = await f.request('followup.decide', { reason: 'Defaults.', defaults: true, select: { origin: 'review' },
    authority: { kind: 'policy-default', instruction: 'Accept the defaults.', context: 'Completion question' } }, 'defaults');
  assert.deepEqual(defaults.decided.map(row => [row.id, row.decision]), [[m.id, 'new-work']]);
  assert.deepEqual(defaults.skipped.map(row => row.id).sort(), [a.id, b.id].sort());
  await decide(f, { followUps: [m.id], decision: 'accept-risk' }, 'human-over-default');
  const current = await records(f);
  assert.deepEqual(current.map(row => [row.id, row.status]).sort(), [[a.id, 'rejected'], [b.id, 'accepted-risk'], [m.id, 'accepted-risk']].sort());
  const again = await f.request('followup.decide', { reason: 'Again.', defaults: true, followUps: [m.id], authority: { kind: 'policy-default', instruction: 'Defaults.', context: 'x' } }, 'default-after-human');
  assert.deepEqual([again.decided, again.skipped[0].reason, again.event], [[], 'human-decided', null]);
  const count = (await f.core.state()).events.length;
  const refused = (input, pattern, id) => assert.rejects(decide(f, input, id), pattern);
  await refused({ followUps: ['fu-000000000000'], decision: 'reject' }, /Unknown follow-up fu-000000000000/, 'r1');
  await refused({ followUps: [], decision: 'reject' }, /followUps must list 1 to 512/, 'r2a');
  await refused({ followUps: Array.from({ length: 513 }, () => a.id), decision: 'reject' }, /followUps must list 1 to 512/, 'r2b');
  await refused({ select: {}, decision: 'reject' }, /select needs at least one of/, 'r3a');
  await refused({ select: { severity: 'high' }, decision: 'reject' }, /select matches no follow-up/, 'r3b');
  await refused({ followUps: [a.id], select: { status: 'undecided' }, decision: 'reject' }, /exactly one of followUps or select/, 'r4');
  await refused({ decision: 'reject' }, /exactly one of followUps or select/, 'r5');
  await refused({ followUps: [a.id], decision: 'reject', defaults: true }, /exactly one of decision or defaults/, 'r6');
  await refused({ followUps: [a.id] }, /exactly one of decision or defaults/, 'r7');
  await refused({ followUps: [a.id], decision: 'reject', note: 'x' }, /followup\.decide\.note is not allowed/, 'r8');
  assert.equal((await f.core.state()).events.length, count, 'nothing recorded');
});

test('R3, R5: a bulk new-work call whose second filing fails records nothing; the retry reuses the first issue, even before search sees it', async t => {
  const f = await run(t);
  await round(f, 1, [medium({ blocking: false }), medium({ blocking: false, path: 'app/other.js' })]);
  const ids = (await records(f)).map(row => row.id);
  let creates = 0;
  const host = issues(f, { fail: args => args[1] === 'create' && ++creates === 2, searchLag: true });
  await assert.rejects(decide(f, { followUps: ids, decision: 'new-work' }, 'bulk'), /Filing follow-up fu-[0-9a-f]{12} as new work failed; nothing was recorded/);
  assert.equal((await f.core.state()).events.filter(event => event.type === 'FOLLOW_UP_DECIDED').length, 0);
  assert.equal(host.issues.length, 1);
  const retry = await decide(f, { followUps: ids, decision: 'new-work' }, 'bulk-retry');
  assert.equal(host.issues.length, 2);
  assert.deepEqual(retry.decided.map(row => row.tracking.reused), [true, false]);
  assert.ok((await records(f)).every(row => row.status === 'new-work'));
});

test('R4: defaults and who may apply them', async t => {
  const review = severity => ({ origin: { kind: 'review' }, finding: { severity } });
  assert.deepEqual(['low', 'medium', 'high'].map(severity => defaultDecision(review(severity))), ['accept-risk', 'new-work', null]);
  assert.deepEqual(['low', 'high', 'critical'].map(severity => defaultDecision({ origin: { kind: 'dependency-scan', preExisting: true }, finding: { severity } })), ['new-work', 'new-work', 'new-work']);
  const agent = { kind: 'policy-default' }, cited = { kind: 'policy-default', instruction: 'Accept the defaults.', context: 'Completion question' };
  const mandate = { goal: 'Export the constant answer.', constraints: ['Keep the public export named answer.'] };
  const dial = (f, value, id) => f.request('run.set-dial', { dial: 'autonomy', value, actor: 'human', runId: 'run-one', authority: { ...human, instruction: `Run run-one ${value}.` },
    reason: 'Test dial', ...(value === 'delegated' ? {} : { mandate }) }, id);
  for (const value of ['supervised', 'delegated', 'mandated', 'goal']) {
    const f = await run(t);
    if (value !== 'supervised') await dial(f, value, `dial-${value}`);
    await round(f, 1, [low(), high({ blocking: false })]);
    await recordFollowUps(f.core, { origin: scanOrigin, findings: [scan({ severity: 'low' })] });
    issues(f);
    const apply = (authority, id) => f.request('followup.decide', { reason: 'Defaults.', defaults: true, select: { status: 'undecided' }, authority }, id);
    if (['supervised', 'delegated'].includes(value)) {
      await assert.rejects(apply(agent, 'agent'), /policy-default authority\.instruction/, value);
      await assert.rejects(f.request('followup.decide', { reason: 'x', decision: 'accept-risk', select: { status: 'undecided' }, authority: cited }, 'no-defaults'), /applies only the defaults/);
    }
    const applied = await apply(['supervised', 'delegated'].includes(value) ? cited : agent, 'apply');
    const list = await records(f);
    assert.deepEqual(list.map(row => [row.finding.severity, row.origin.kind, row.status]).sort(),
      [['high', 'review', 'undecided'], ['low', 'dependency-scan', 'new-work'], ['low', 'review', 'accepted-risk']], value);
    assert.equal(applied.event.payload.authority.kind, 'policy-default');
    assert.ok(list.filter(row => row.decision).every(row => row.decision.authorityKind === 'policy-default'));
    const status = (await f.request('status')).followUps;
    assert.deepEqual(status.defaults.map(row => row.decision).sort(), ['accept-risk', 'new-work']);
    assert.equal(applied.skipped.find(row => row.reason === 'no-default')?.id, list.find(row => row.finding.severity === 'high').id);
  }
});

test('R5: filing creates a marked, backlinked issue in the follow-up\'s repository, reuses an open one, seeds without GitHub, and keeps local names out', async t => {
  const f = await run(t);
  // A second configured repository with its own GitHub remote.
  const other = join(f.root, 'tools');
  await mkdir(other); await git(other, ['init', '-b', 'main']);
  await git(other, ['remote', 'add', 'origin', 'https://github.com/fixture/tools.git']);
  f.core.sourceContext.repositories.push({ alias: 'tools', path: other, remote: 'origin', integrationBranch: 'main', releaseBranch: 'main' });
  f.core.sourceContext.repositories[0].followUpRedactions = ['Acme Corp'];
  const { state } = await f.core.state();
  const local = `${f.root}/app/app.js`;
  await round(f, 1, [medium({ blocking: false, classStatement: `Acme Corp import breaks at ${local} on ${hostname()} in run ${state.runId}`,
    failureScenario: `Run from ~/work/${basename(f.root)}/x with tools/ and ${f.home} -> /Users/someone/secret is read` })]);
  const [record] = await records(f);
  const host = issues(f);
  const filed = await decide(f, { followUps: [record.id], decision: 'new-work', pr: 12 }, 'file');
  const [issue] = host.issues;
  assert.equal(issue.repo, 'fixture/project');
  assert.deepEqual(filed.decided[0].tracking, { kind: 'issue', repository: 'app', number: 100, url: 'https://github.com/fixture/project/issues/100', reused: false });
  assert.ok(issue.body.includes(followUpMarker(record.dedupKey)));
  assert.match(issue.body, /Raised in the review of #12\./u);
  const text = `${issue.title}\n${issue.body}`;
  for (const secret of [f.root, f.home, basename(f.root), state.runId, hostname(), 'Acme Corp', '/Users/someone', '~/work', 'tools/', other])
    assert.ok(!text.includes(secret), `issue text must not contain ${secret}`);
  assert.match(text, /`app\.js`/u, 'the path is repository-relative');
  // Reuse: an open issue with the marker is found before creating.
  const [scanId] = await recordFollowUps(f.core, { origin: scanOrigin, findings: [scan({ repository: 'tools' })] });
  const scanRecord = (await records(f)).find(row => row.id === scanId);
  host.issues.push({ repo: 'fixture/tools', number: 7, url: 'https://github.com/fixture/tools/issues/7', state: 'open', body: `Old.\n<!-- ${followUpMarker(scanRecord.dedupKey)} -->` });
  const reused = await decide(f, { followUps: [scanId], decision: 'new-work' }, 'reuse');
  assert.deepEqual(reused.decided[0].tracking, { kind: 'issue', repository: 'tools', number: 7, url: 'https://github.com/fixture/tools/issues/7', reused: true });
  assert.ok(host.calls.some(args => args[1] === 'list' && args.includes('fixture/tools')), 'filed in the follow-up\'s own repository');
  // No GitHub remote: a seed, without calling gh.
  await git(other, ['remote', 'set-url', 'origin', join(f.root, 'host.git')]);
  const [seedId] = await recordFollowUps(f.core, { origin: scanOrigin, findings: [scan({ repository: 'tools', version: '4.17.19' })] });
  const calls = host.calls.length;
  const seeded = await decide(f, { followUps: [seedId], decision: 'new-work' }, 'seed');
  assert.deepEqual([seeded.decided[0].tracking, host.calls.length], [{ kind: 'seed', repository: 'tools' }, calls]);
  // The checkout folder named after its own repository is not redacted (amendment 1).
  const own = redactor({ context: { ...f.core.context, workspaceRoot: join(f.root, 'project') } }, state, 'app', 'project');
  assert.equal(own('The project export'), 'The project export');
  assert.equal(redactor({ context: { ...f.core.context, workspaceRoot: join(f.root, 'secretname') } }, state, 'app', 'project')('secretname breaks'), '<redacted> breaks');
  assert.match(issueText(record, value => value, null).body, /<!-- gatereeve-follow-up:[0-9a-f]{64} -->/u);
  // The committed follow-ups.md and the PR summary are public too: redacted the same way.
  const view = await readFile(join(f.home, FOLLOW_UPS_FILE), 'utf8');
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  openPr(f, 'topic', f.integration, head);
  const section = (await f.request('review.publish', { repository: 'app', number: 12 }, 'publish')).section;
  const followUpSection = section.slice(section.indexOf('**Follow-ups**'));
  for (const [label, surface] of [['follow-ups.md', view], ['PR summary', followUpSection]])
    for (const secret of [f.root, f.home, basename(f.root), state.runId, hostname(), 'Acme Corp', '/Users/someone', other])
      assert.ok(!surface.includes(secret), `${label} must not contain ${secret}`);
  assert.ok(view.includes('<redacted> import breaks') && followUpSection.includes('<redacted> import breaks'));
});

test('R6: Completion and the release merge wait on follow-ups; status reports them; unmarked runs and unreadable records', async t => {
  const f = await run(t);
  await round(f, 1, [low(), high({ blocking: false })]);
  const list = await records(f);
  const [l, h] = ['low', 'high'].map(severity => list.find(row => row.finding.severity === severity));
  assert.match(await missing(f, 'completion'), /follow-ups: 2 undecided \(fu-[0-9a-f]{12}, fu-[0-9a-f]{12}\)/u);
  assert.ok((await missing(f, 'completion')).includes(l.id) && (await missing(f, 'completion')).includes(h.id));
  // A slice into the distinct integration branch is not a release merge; a FEATURE candidate is.
  assert.doesNotMatch(await missing(f, 'merge'), /open high follow-up/u);
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await candidate(f, 'FEATURE', head, 'feature-candidate');
  assert.ok((await missing(f, 'merge')).includes(`open high follow-up (${h.id})`));
  await recordFollowUps(f.core, { origin: scanOrigin, findings: [scan({ severity: 'critical' })] });
  const status = (await f.request('status')).followUps;
  assert.deepEqual([status.counts.byStatus, status.counts.bySeverity, status.undecided.length, status.openHigh], [{ undecided: 3 }, { low: 1, high: 1, critical: 1 }, 3, [h.id]]);
  assert.match(status.next, /Open high follow-up/u);
  await decide(f, { followUps: [h.id], decision: 'accept-risk' }, 'accept-high');
  assert.doesNotMatch(await missing(f, 'merge'), /open high follow-up/u, 'a pre-existing critical never counts as an open high');
  issues(f);
  await f.request('followup.decide', { reason: 'Defaults.', defaults: true, select: { status: 'undecided' }, authority: { kind: 'policy-default', instruction: 'Accept the defaults.', context: 'Completion' } }, 'defaults');
  assert.doesNotMatch(await missing(f, 'completion'), /follow-ups/u);
  // A run without the STARTED marker derives the same follow-ups.
  const { events } = await f.core.state();
  const unmarked = events.map((event, index) => index ? event : { ...event, payload: { ...event.payload, followUps: undefined } });
  assert.equal((await followUpRecords(f.core, unmarked)).records.length, (await records(f)).length);
  // An unreadable review record is reported, never decided.
  const reviewRef = (await Promise.all(events.filter(event => event.type === 'JOB_FINISHED').flatMap(event => event.payload.results ?? [])
    .map(async ref => ({ ref, report: await f.core.store.json(ref) })))).find(item => item.report.gate === 'review').ref;
  const original = f.core.store.json.bind(f.core.store);
  f.core.store.json = async ref => ref?.hash === reviewRef.hash ? Promise.reject(new Error('lost')) : original(ref);
  try { assert.match(await missing(f, 'completion'), /follow-ups unavailable: result sha256:[0-9a-f]{64}: lost/u); }
  finally { f.core.store.json = original; }
});

test('R6: goal readiness and park advice; a decision or a new record makes a ready record stale; a light run is blocked the same way', async t => {
  const mandate = { goal: 'Export the constant answer.', constraints: ['Keep the public export named answer.'] };
  const f = await run(t);
  await f.request('run.set-dial', { dial: 'autonomy', value: 'goal', actor: 'human', runId: 'run-one', authority: { ...human, instruction: 'Run run-one in goal mode.' },
    reason: 'Unattended mandate', mandate }, 'goal');
  await round(f, 1, [low(), high({ blocking: false })]);
  let goal = (await f.request('status')).goal;
  assert.equal(goal.terminal, null);
  assert.match(goal.reason, /Open high follow-up\(s\) fu-[0-9a-f]{12} have no default decision: record goal\.park/u);
  issues(f);
  await f.request('followup.decide', { reason: 'Defaults.', defaults: true, select: { status: 'undecided' }, authority: { kind: 'policy-default' } }, 'defaults');
  goal = (await f.request('status')).goal;
  assert.match(goal.reason, /Open high follow-up/u, 'the high has no default');
  const highRecord = (await records(f)).find(row => row.finding.severity === 'high');
  await decide(f, { followUps: [highRecord.id], decision: 'reject' }, 'reject-high');
  goal = (await f.request('status')).goal;
  assert.doesNotMatch(goal.reason, /follow-up/u, 'every follow-up decided');
  // A published ready record goes stale on a decision and on a new record.
  for (const [label, change] of [['decision', () => decide(f, { followUps: [highRecord.id], decision: 'accept-risk' }, 'change')],
    ['record', () => recordFollowUps(f.core, { origin: scanOrigin, findings: [scan()] })]]) {
    const { state } = await f.core.state();
    await f.core.append(state, 'GOAL_READY', { candidate: state.candidate.hash, repository: 'app', number: 12, head: 'x', review: null, decisions: null }, { id: `ready-${label}`, hash: identity({ label }) });
    assert.ok((await f.core.state()).state.goalReady);
    await change();
    assert.equal((await f.core.state()).state.goalReady, null, label);
  }
  const light = await fixture(t, { rigor: 'light' });
  await revise(light, { 'app.js': 'export const answer = 42;\n' }, 'r1');
  await light.request('review.select', selection(), 'select');
  await round(light, 1, [low()]);
  assert.match(await missing(light, 'completion'), /follow-ups: 1 undecided/u);
});

test('R7, R8: follow-ups.md and the PR summary list every follow-up with its details and decision', async t => {
  const f = await run(t);
  await round(f, 1, [low(), medium({ blocking: false, path: 'app/other.js' })]);
  const host = issues(f);
  const decided = await f.request('followup.decide', { reason: 'Defaults.', defaults: true, select: { status: 'undecided' }, authority: { kind: 'policy-default', instruction: 'Accept the defaults.', context: 'Completion' } }, 'defaults');
  // The decision itself regenerates the view.
  assert.equal(decided.rendered.path, join(f.home, FOLLOW_UPS_FILE));
  assert.deepEqual(decided.rendered.undecided, []);
  const written = await readFile(join(f.home, FOLLOW_UPS_FILE), 'utf8');
  assert.match(written, /- \*\*Decision:\*\* accept-risk by policy-default: Defaults\./u, 'decide wrote follow-ups.md');
  await f.request('followup.render', {}, 'render');
  const markdown = await readFile(join(f.home, FOLLOW_UPS_FILE), 'utf8');
  assert.equal(markdown, written, 'render regenerates the same view');
  assert.match(markdown, /Generated by GateReeve[^\n]*Do not edit/u);
  for (const heading of ['## Undecided', '## Decided', '## Fixed', '## Seeds for the next feature']) assert.ok(markdown.includes(heading), heading);
  for (const record of await records(f)) {
    assert.ok(markdown.includes(`\`${record.id}\` (${record.finding.severity})`));
    assert.ok(markdown.includes(record.finding.class));
  }
  assert.match(markdown, /- \*\*Origin:\*\* review codex fixture, round 1 \(slice\)/u);
  assert.match(markdown, /- \*\*Failure scenario:\*\* Fixture input -> wrong observable output/u);
  assert.match(markdown, /- \*\*Decision:\*\* accept-risk by policy-default: Defaults\./u);
  assert.ok(markdown.includes(`- **Decision:** new-work by policy-default (${host.issues[0].url}): Defaults.`));
  // The published summary lists both, the accepted low included.
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  openPr(f, 'topic', f.integration, head);
  const published = await f.request('review.publish', { repository: 'app', number: 12 }, 'publish');
  assert.match(published.section, /\*\*Follow-ups\*\*/u);
  for (const record of await records(f)) {
    const line = published.section.split('\n').find(row => row.includes(record.id));
    assert.ok(line, record.id);
    assert.ok(line.includes(record.finding.severity) && line.includes(record.status) && line.includes('(policy-default)'), line);
  }
  assert.ok(published.section.includes(host.issues[0].url));
  // Unreadable review records are reported as unavailable, never as "none".
  const { followUpLines, followUpSummary } = await import('../../plugin-src/shared/resources/protocol/current/follow-ups.js');
  const lines = followUpLines(followUpSummary({ records: [], unavailable: ['result x: lost'] })).join('\n');
  assert.match(lines, /Unavailable:\*\* 1 unreadable review record/u);
  assert.doesNotMatch(lines, /no follow-ups/u);
  const none = await run(t);
  await round(none, 1, []);
  openPr(none, 'topic', none.integration, (await git(none.repo, ['rev-parse', 'HEAD'])).trim());
  assert.match((await none.request('review.publish', { repository: 'app', number: 12 }, 'publish')).section, /- This run has no follow-ups\./u);
});

test('R10: the follow-ups CLI lists, decides and renders', async t => {
  const f = await currentFixture(t);
  await establishCurrentRun(f.core);
  const [id] = await recordFollowUps(f.core, { origin: scanOrigin, findings: [scan()] });
  const invoke = async (...args) => JSON.parse((await exec(process.execPath, [cliPath, 'follow-ups', ...args, '--cwd', f.repo, '--json'])).stdout);
  const listed = await invoke();
  assert.equal(listed.ok, true, JSON.stringify(listed.error));
  assert.deepEqual(listed.data.records.map(row => [row.id, row.status]), [[id, 'undecided']]);
  const file = join(f.root, 'decide.json');
  await writeFile(file, JSON.stringify({ followUps: [id], defaults: true, reason: 'Accept the defaults.', authority: { ...human, instruction: 'Accept the defaults.' } }));
  const decided = await invoke('decide', file);
  assert.equal(decided.ok, true, JSON.stringify(decided.error));
  assert.deepEqual(decided.data.decided.map(row => [row.id, row.decision, row.tracking.kind]), [[id, 'new-work', 'seed']]);
  const rendered = await invoke('render');
  assert.equal(rendered.ok, true);
  assert.match(await readFile(rendered.data.path, 'utf8'), /seed for the next feature/u);
});
