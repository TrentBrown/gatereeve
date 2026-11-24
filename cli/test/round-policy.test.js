import './helpers/private-scratch.js';
// Round policy (spec AC6, rubric R6; interview D7, D14, D23): one counter per
// review scope, UNAVAILABLE rounds counted, reset only by a human amendment,
// the three schedule bands, the round 6 hand-back, planning and light runs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { project } from '../../plugin-src/shared/resources/protocol/current/core.js';
import { boundaryReviews } from '../../plugin-src/shared/resources/protocol/current/boundary-review.js';
import { eligibleResidualRisk } from '../../plugin-src/shared/resources/protocol/current/autonomous.js';
import { DELEGATED_AUTHORITY } from '../../plugin-src/shared/resources/protocol/current/contracts.js';
import { git } from '../../plugin-src/shared/resources/protocol/current/evidence.js';
import { scheduledBlocking, roundHandBack, roundStatus, ROUND_POLICY } from '../../plugin-src/shared/resources/protocol/current/round-policy.js';
import { fixture, human, evaluator, reviewConfig, delegate } from './helpers/lightweight-fixture.js';
import { selection } from './helpers/paired-review-fixture.js';
import { revise, seedRounds, simulateSeverity, reviewers } from './helpers/round-fixture.js';

const finding = (severity, extra = {}) => ({ blocking: true, ...(severity ? { severity } : {}), ...extra });

test('the schedule: rounds 1-3 block non-low, rounds 4-5 only high and medium regressions, low never', () => {
  for (const round of [1, 2, 3]) {
    for (const severity of ['high', 'medium', undefined]) assert.equal(scheduledBlocking(finding(severity), { round }), true, `${severity} round ${round}`);
    assert.equal(scheduledBlocking(finding('low'), { round, regression: true }), false);
  }
  for (const round of [4, 5, 6, 7]) {
    assert.equal(scheduledBlocking(finding('high'), { round }), true);
    assert.equal(scheduledBlocking(finding('medium'), { round }), false, 'medium non-regression is demoted');
    assert.equal(scheduledBlocking(finding('medium'), { round, regression: true }), true, 'medium regression of the previous fix blocks');
    assert.equal(scheduledBlocking(finding('low'), { round, regression: true }), false, 'a low regression never blocks');
    assert.equal(scheduledBlocking(finding(undefined), { round }), true, 'unrated findings from earlier contracts block as before');
  }
  assert.equal(scheduledBlocking(finding('medium'), { round: null }), true, 'legacy rounds keep the original flag');
  assert.equal(scheduledBlocking({ blocking: false, severity: 'high' }, { round: 1 }), false, 'the reviewer flag stays the in-scope judgment');
});

const H = n => `sha256:${String(n).padStart(64, '0')}`;
function journal(rigor = 'full') {
  let n = 0;
  const events = [];
  const event = (type, payload) => { n++; events.push({ sequence: n, hash: `event-${n}`, recordedAt: new Date(Date.parse('2026-11-24T00:00:00Z') + n * 1000).toISOString(), type, payload }); };
  event('STARTED', { featureId: 'feature', implementers: ['implementer'], optionalGates: [], dials: {
    rigor: { value: rigor, source: 'explicit', actor: 'human', authority: human, reason: 'Fixture' }, autonomy: { value: 'supervised', source: 'built-in', actor: null } } });
  const reviewed = (scope, revision, marked = true) => event('BOUNDARY_REVIEWED', { candidate: { hash: H(revision) }, selection: 'selection', round: H(900 + n), outcomes: [],
    ...(marked ? { roundPolicy: { policy: ROUND_POLICY, scope, revision: H(revision) } } : {}) });
  return { events, event, reviewed };
}

test('one counter per scope: revisions count once, legacy rounds do not, a human amendment resets and integration closes the slice', () => {
  const { events, event, reviewed } = journal();
  reviewed('slice', 1, false); // Executed before this policy: not counted (spec AC11).
  reviewed('slice', 1); reviewed('slice', 1); reviewed('slice', 2); reviewed('feature-final', 3);
  event('PLANNING_REVIEWED', { artifact: 'spec', subject: H(10), documents: {}, outcome: 'FAIL', result: { hash: H(11) }, evaluator: {}, roundPolicy: ROUND_POLICY });
  event('PLANNING_REVIEWED', { artifact: 'spec', subject: H(12), documents: {}, outcome: 'FAIL', result: { hash: H(13) }, evaluator: {}, roundPolicy: ROUND_POLICY });
  event('PLANNING_REVIEWED', { artifact: 'design', subject: H(14), documents: {}, outcome: 'PASS', result: { hash: H(15) }, evaluator: {} });
  let state = project(events);
  assert.deepEqual(Object.fromEntries(Object.entries(state.reviewScopes).map(([key, value]) => [key, value.round])), { slice: 2, 'feature-final': 1, 'planning:spec': 2 });
  event('DECIDED', { kind: 'amend', subject: H(20), authority: { kind: 'autonomous-evaluator', delegation: H(1), evaluation: H(2) }, reason: 'x', consequences: 'y' });
  event('DECIDED', { kind: 'authorize-implementation', subject: H(21), authority: human, reason: 'x', consequences: 'y' });
  state = project(events);
  assert.equal(state.reviewScopes.slice.round, 2, 'neither an autonomous amendment nor a full-rigor authorization resets rounds');
  event('DECIDED', { kind: 'amend', subject: H(22), authority: human, reason: 'Human-approved amendment', consequences: 'y' });
  state = project(events);
  assert.deepEqual(state.reviewScopes, {}, 'a human-approved amendment resets every scope');
  assert.deepEqual(state.reviewScopeHistory.map(row => [row.scope, row.round, row.closed.reason]), [['slice', 2, 'amendment'], ['feature-final', 1, 'amendment'], ['planning:spec', 2, 'amendment']]);
  reviewed('slice', 4); reviewed('feature-final', 5);
  event('INTEGRATED', { repository: 'app', candidate: { hash: H(4) } });
  reviewed('slice', 6);
  state = project(events);
  assert.equal(state.reviewScopes.slice.round, 1, 'the next slice PR after integration is a new scope');
  assert.equal(state.reviewScopes['feature-final'].round, 1);
});

test('a light run resets rounds only when the human re-authorizes a changed brief', () => {
  const { events, event, reviewed } = journal('light');
  event('DECIDED', { kind: 'authorize-implementation', subject: H(1), authority: human, reason: 'x', consequences: 'y' });
  reviewed('slice', 1); reviewed('slice', 2);
  event('DECIDED', { kind: 'authorize-implementation', subject: H(1), authority: human, reason: 'Same brief', consequences: 'y' });
  assert.equal(project(events).reviewScopes.slice.round, 2);
  event('DECIDED', { kind: 'authorize-implementation', subject: H(2), authority: human, reason: 'Changed brief', consequences: 'y' });
  assert.deepEqual(project(events).reviewScopes, {});
});

test('round 6 hands back: goal runs park and adjudication is refused', () => {
  const state = { reviewScopes: { slice: { scope: 'slice', round: 6, revisions: [], decisions: [] } } };
  assert.match(roundHandBack(state, 'slice', 6, false), /not qualifying until the human records continue or split .*amendment, or a waiver/);
  assert.match(roundHandBack(state, 'slice', 6, true), /goal run records goal\.park/);
  assert.equal(roundHandBack(state, 'slice', 5, false), null);
  const status = roundStatus(state, { goal: true });
  assert.deepEqual(status.scopes.map(row => [row.scope, row.round, row.band]), [['slice', 6, 'hand-back']]);
  assert.match(status.advice.join('\n'), /goal\.park/);
  assert.throws(() => eligibleResidualRisk({ members: [{}, {}], initialEstablished: true, round: { round: 6 } }), /Adjudication at round 6 is refused/);
  state.reviewScopes.slice.decisions.push({ choice: 'continue', round: 6, event: 'decision' });
  assert.equal(roundHandBack(state, 'slice', 7, false), null, 'a recorded continue covers later rounds');
});

async function lightRun(t) {
  const f = await fixture(t, { rigor: 'light', files: { 'other.js': 'export const other = 1;\n' } });
  await revise(f, { 'app.js': 'export const answer = 42;\n' }, 'r1');
  await f.request('review.select', selection(), 'select');
  return f;
}
const pair = async f => { const { state } = await f.core.state(); return boundaryReviews(f.core, state, await f.core.store.json(state.candidate)); };

test('status shows the scope round on unpushed local commits, counts an UNAVAILABLE round once and advises raising light rigor at round 4', async t => {
  const f = await lightRun(t);
  const { state } = await f.core.state();
  const head = (await f.core.store.json(state.candidate)).repositories[0].head;
  assert.doesNotMatch(await git(f.repo, ['ls-remote', 'origin']), new RegExp(head), 'the candidate head exists only locally');
  reviewers(f, { unavailable: 'claude-code' });
  await f.request('review.execute', {}, 'round-1');
  let status = await f.request('status');
  assert.deepEqual(status.rounds.scopes.map(row => [row.scope, row.round]), [['slice', 1]], 'an UNAVAILABLE reviewer still makes a round');
  assert.equal((await pair(f)).outcome, 'UNAVAILABLE');
  reviewers(f);
  await f.request('review.execute', {}, 'round-1-recovered');
  status = await f.request('status');
  assert.equal(status.rounds.scopes[0].round, 1, 'a second review of the same revision is the same round');
  assert.equal((await pair(f)).outcome, 'PASS');
  assert.deepEqual(status.rounds.advice, []);
  await seedRounds(f, 2);
  await revise(f, { 'app.js': 'export const answer = 42; // round 4\n' }, 'r4');
  reviewers(f);
  await f.request('review.execute', {}, 'round-4');
  status = await f.request('status');
  assert.equal(status.rounds.scopes[0].round, 4);
  assert.equal(status.rounds.scopes[0].band, 'high-and-medium-regressions');
  assert.match(status.rounds.advice.join('\n'), /Light run review scope slice is at round 4: consider raising rigor/);
});

// Each case: seeded earlier rounds, then one real round on a fix that changes app.js.
const bands = [
  { name: 'round 2 blocks a medium finding', round: 2, codex: [{ path: 'app/other.js', evidence: '[medium] The other export is unused.' }], outcome: 'FAIL' },
  { name: 'round 4 demotes a medium non-regression and a low regression', round: 4,
    codex: [{ path: 'app/other.js', evidence: '[medium] The other export is unused.' }],
    claude: [{ path: 'app/app.js', evidence: '[low] The fix comment is terse.' }], outcome: 'PASS', demoted: 2 },
  { name: 'round 4 blocks a medium regression of the previous fix', round: 4, codex: [{ path: 'app/app.js', evidence: '[medium] The fix broke the export contract.' }], outcome: 'FAIL' },
  { name: 'round 5 blocks a high finding anywhere', round: 5, codex: [{ path: 'app/other.js', evidence: '[high] The other export leaks data.' }], outcome: 'FAIL' },
  { name: 'round 4 keeps an unrated finding blocking as under its original contract', round: 4, codex: [{ path: 'app/other.js', evidence: 'No severity recorded.' }], outcome: 'FAIL' },
];
for (const band of bands) test(`schedule band: ${band.name}`, async t => {
  const f = await lightRun(t);
  simulateSeverity(f);
  await seedRounds(f, band.round - 1);
  await revise(f, { 'app.js': 'export const answer = 42; // fix\n' }, 'fix');
  reviewers(f, { findings: { codex: band.codex, ...(band.claude ? { 'claude-code': band.claude } : {}) } });
  await f.request('review.execute', {}, 'band-round');
  const reviewed = await pair(f);
  assert.equal(reviewed.round.round, band.round);
  assert.equal(reviewed.outcome, band.outcome, reviewed.summary);
  if (band.demoted) {
    assert.equal(reviewed.members.flatMap(member => member.demotedFindings).length, band.demoted, 'demoted findings stay visible');
    assert.ok(reviewed.members.every(member => member.result.outcome === 'FAIL'), 'original reviewer outcomes are retained');
    assert.match(reviewed.summary, /PASS under the round 4 schedule; demoted/);
  }
});

test('round 6 is not qualifying until the human records continue; a seventh revision is refused before then', async t => {
  const f = await lightRun(t);
  await seedRounds(f, 5);
  await revise(f, { 'app.js': 'export const answer = 42; // round 6\n' }, 'r6');
  reviewers(f);
  await f.request('review.execute', {}, 'round-6');
  let reviewed = await pair(f);
  assert.equal(reviewed.round.round, 6);
  assert.equal(reviewed.outcome, 'UNAVAILABLE');
  assert.ok(reviewed.members.every(member => /reached round 6/.test(member.qualification)));
  const review = (await f.request('milestone.check', { name: 'acceptance' })).outcomes.find(row => row.id === 'review');
  assert.equal(review.satisfied, false);
  assert.match((await f.request('status')).rounds.advice.join('\n'), /reached round 6/);
  const { state } = await f.core.state();
  const decide = (choice, operationId, subject = state.candidate.hash) => f.request('human.decide', { kind: 'review-rounds', reviewScope: 'slice', choice, subject,
    authority: { ...human, instruction: `Round 6: ${choice}.` }, reason: 'Hand-back at round 6', consequences: 'Rounds continue under the round 4-5 band' }, operationId);
  await assert.rejects(decide('stop', 'bad-choice'), /Choose continue or split/);
  await assert.rejects(f.request('human.decide', { kind: 'review-rounds', reviewScope: 'slice', choice: 'continue', subject: state.candidate.hash,
    authority: { kind: DELEGATED_AUTHORITY, delegation: state.candidate.hash, evaluation: state.candidate.hash }, reason: 'x', consequences: 'y' }, 'delegated-choice'), /observed human instruction/);
  await decide('continue', 'continue');
  reviewed = await pair(f);
  assert.equal(reviewed.outcome, 'PASS', reviewed.summary);
});

test('past round 6 a new revision is not reviewed until the human decides', async t => {
  const f = await lightRun(t);
  await seedRounds(f, 6);
  await revise(f, { 'app.js': 'export const answer = 42; // round 7\n' }, 'r7');
  const launches = reviewers(f);
  await assert.rejects(f.request('review.execute', {}, 'round-7'), /reached round 6: the review is not qualifying until the human records continue or split/);
  assert.equal(launches(), 0);
});

test('planning reviews count rounds per document and a delegated decision cannot cite a round 6 review', async t => {
  const f = await fixture(t, { rigor: 'light', authorize: false });
  const delegation = (await delegate(f)).event.hash;
  evaluator(f);
  let last;
  for (let round = 1; round <= 6; round++) {
    const brief = join(f.home, 'brief.md');
    await writeFile(brief, `${await readFile(brief, 'utf8')}- planning round ${round} note\n`);
    last = await f.request('planning.review', { artifact: 'brief', configuration: reviewConfig }, `brief-review-${round}`);
  }
  const status = await f.request('status');
  assert.deepEqual(status.rounds.scopes.map(row => [row.scope, row.round]), [['planning:brief', 6]]);
  await assert.rejects(f.request('human.decide', { kind: 'authorize-implementation', subject: (await f.core.commitments()).subject,
    authority: { kind: DELEGATED_AUTHORITY, delegation, evaluation: last.event.hash }, reason: 'Delegated', consequences: 'May implement' }, 'delegated-authorize'),
  /planning:brief reached round 6/);
});
