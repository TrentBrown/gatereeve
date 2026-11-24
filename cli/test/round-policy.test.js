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
import { scheduledBlocking, roundHandBack, roundStatus, ROUND_POLICY, countRound, roundOf, currentRevision, recordRoundDecision } from '../../plugin-src/shared/resources/protocol/current/round-policy.js';
import { fixture, human, evaluator, reviewConfig, delegate } from './helpers/lightweight-fixture.js';
import { retainedContractQualifies, REVIEW_CONTRACT_VERSION } from '../../plugin-src/shared/resources/protocol/current/execution.js';
import { selection } from './helpers/paired-review-fixture.js';
import { revise, seedRounds, reviewers } from './helpers/round-fixture.js';

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
    // The low finding never blocked (B1 records it non-blocking), so only the medium one is demoted.
    claude: [{ path: 'app/app.js', evidence: '[low] The fix comment is terse.' }], outcome: 'PASS', demoted: 1 },
  { name: 'round 4 blocks a medium regression of the previous fix', round: 4, codex: [{ path: 'app/app.js', evidence: '[medium] The fix broke the export contract.' }], outcome: 'FAIL' },
  { name: 'round 5 blocks a high finding anywhere', round: 5, codex: [{ path: 'app/other.js', evidence: '[high] The other export leaks data.' }], outcome: 'FAIL' },
];
for (const band of bands) test(`schedule band: ${band.name}`, async t => {
  const f = await lightRun(t);
  await seedRounds(f, band.round - 1);
  await revise(f, { 'app.js': 'export const answer = 42; // fix\n' }, 'fix');
  // A demoting band: the reviewer kept a blocking flag the band no longer
  // allows, while every criterion and responsibility passed.
  const passRows = verdict => { verdict.dimensions.forEach(row => { row.outcome = 'PASS'; }); verdict.criteria.forEach(row => { row.outcome = 'PASS'; }); };
  reviewers(f, { findings: { codex: band.codex, ...(band.claude ? { 'claude-code': band.claude } : {}) }, patch: band.demoted ? { codex: passRows } : {} });
  await f.request('review.execute', {}, 'band-round');
  const reviewed = await pair(f);
  assert.equal(reviewed.round.round, band.round);
  assert.equal(reviewed.outcome, band.outcome, reviewed.summary);
  if (band.demoted) {
    assert.equal(reviewed.members.flatMap(member => member.demotedFindings).length, band.demoted, 'demoted findings stay visible');
    // The demoted reviewer keeps its original FAIL; a low-only FAIL is already PASS (B1).
    assert.ok(reviewed.members.filter(member => member.demotedFindings.length).every(member => member.result.outcome === 'FAIL'), 'original reviewer outcomes are retained');
    assert.ok(reviewed.members.every(member => !member.qualification), 'a demoted concurrent peer FAIL is not newer blocking evidence');
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

test('an unrated finding from an earlier contract keeps blocking as recorded in every band', () => {
  const legacy = { id: 'legacy', blocking: true }; // retained before B1: no severity
  for (const round of [1, 4, 5, 7]) assert.equal(scheduledBlocking(legacy, { round }), true, `round ${round}`);
  assert.equal(scheduledBlocking({ ...legacy, blocking: false }, { round: 4 }), false);
});

// Pre-review findings on PR C1 (round policy hardening).
test('rounds 4-5 never demote a FAIL that rests on an independent failure', async t => {
  for (const [label, change] of [
    ['an evidence dimension FAIL', verdict => { verdict.dimensions.find(row => row.name === 'evidence').outcome = 'FAIL'; }],
    ['a criterion FAIL no demoted finding names', verdict => { verdict.criteria[0].outcome = 'FAIL'; verdict.findings[0].criterion = 'gate:review'; }],
    // Round 1 (C1): a failed code or requirements responsibility is not excused either.
    ['a code dimension FAIL', () => {}],
    ['a requirements dimension FAIL', verdict => { verdict.dimensions.find(row => row.name === 'requirements').outcome = 'FAIL'; }],
    ['a criterion FAIL named by the demoted finding', verdict => { verdict.criteria[0].outcome = 'FAIL'; }],
  ]) {
    const f = await lightRun(t);
    await seedRounds(f, 3);
    await revise(f, { 'app.js': 'export const answer = 42; // fix\n' }, 'fix');
    reviewers(f, { findings: { codex: [{ path: 'app/other.js', evidence: '[medium] The other export is unused.' }] }, patch: { codex: change } });
    await f.request('review.execute', {}, 'independent-failure');
    const reviewed = await pair(f);
    assert.equal(reviewed.outcome, 'FAIL', `${label}: ${reviewed.summary}`);
  }
});

test('a medium regression stays blocking in later rounds until it is resolved', async t => {
  const f = await lightRun(t);
  await seedRounds(f, 3);
  await revise(f, { 'app.js': 'export const answer = 42; // fix\n' }, 'r4');
  reviewers(f, { findings: { codex: [{ path: 'app/app.js', evidence: '[medium] The fix broke the export contract.' }] } });
  await f.request('review.execute', {}, 'round-4');
  assert.equal((await pair(f)).outcome, 'FAIL');
  // Round 5 changes an unrelated file; the reviewer keeps the regression present.
  await revise(f, { 'other.js': 'export const other = 2;\n' }, 'r5');
  reviewers(f, { patch: { codex: (verdict, request) => {
    const prior = (request.input.dispositionsRequired ?? []).find(row => row.id.endsWith('codex-finding-0'));
    assert.ok(prior, 'the regression is a required disposition');
    verdict.outcome = 'FAIL'; verdict.dimensions.find(row => row.name === 'code').outcome = 'FAIL';
    verdict.dispositions = [{ id: prior.id, status: 'present', evidence: 'The export contract is still broken.' }];
  } } });
  await f.request('review.execute', {}, 'round-5');
  const reviewed = await pair(f);
  assert.equal(reviewed.round.round, 5);
  assert.equal(reviewed.outcome, 'FAIL', reviewed.summary);
});

test('returning to an earlier revision is a new round; the counter never moves backwards', () => {
  const state = { reviewScopes: {}, reviewScopeHistory: [] };
  for (const revision of ['A', 'B', 'B', 'C', 'D', 'E', 'F', 'C']) countRound(state, 'slice', revision, {});
  assert.equal(state.reviewScopes.slice.round, 7);
  assert.equal(roundOf(state, 'slice', 'C'), 7, 'the latest review of C is round 7, not its earlier round 3');
  assert.equal(currentRevision(state, 'slice', 'C'), true);
  assert.equal(currentRevision(state, 'slice', 'F'), false);
  assert.match(roundHandBack(state, 'slice', roundOf(state, 'slice', 'C'), false), /reached round 7/);
});

test('a split ends the scope, so each part starts at round 1', () => {
  const state = { reviewScopes: {}, reviewScopeHistory: [] };
  for (const revision of ['A', 'B', 'C', 'D', 'E', 'F']) countRound(state, 'slice', revision, {});
  recordRoundDecision(state, { reviewScope: 'slice', choice: 'split' }, 'event-split');
  assert.equal(state.reviewScopes.slice, undefined);
  assert.equal(state.reviewScopeHistory.at(-1).closed.reason, 'split');
  countRound(state, 'slice', 'G', {});
  assert.equal(state.reviewScopes.slice.round, 1);
});

test('a regression re-reported under the same ID keeps its original round', async t => {
  const f = await lightRun(t);
  await seedRounds(f, 3);
  await revise(f, { 'app.js': 'export const answer = 42; // fix\n' }, 'r4');
  const regression = [{ path: 'app/app.js', evidence: '[medium] The fix broke the export contract.' }];
  reviewers(f, { findings: { codex: regression } });
  await f.request('review.execute', {}, 'round-4');
  // Round 5 changes an unrelated file; the reviewer reports the same finding again.
  await revise(f, { 'other.js': 'export const other = 2;\n' }, 'r5');
  reviewers(f, { findings: { codex: regression } });
  await f.request('review.execute', {}, 'round-5');
  const reviewed = await pair(f);
  assert.equal(reviewed.round.round, 5);
  assert.equal(reviewed.outcome, 'FAIL', reviewed.summary);
});

test('an individual selection-tagged review cannot bypass the round 6 hand-back', async t => {
  const f = await lightRun(t);
  await seedRounds(f, 6);
  await revise(f, { 'app.js': 'export const answer = 42; // round 7\n' }, 'r7');
  const launches = reviewers(f);
  const { state } = await f.core.state();
  const reviewer = state.reviewerSelection.selection.reviewers[0];
  await assert.rejects(f.request('gate.execute', { gates: ['review'], configuration: { provider: reviewer.provider, model: reviewer.model,
    reasoningEffort: reviewer.reasoningEffort, reviewerSelection: state.reviewerSelection.event } }, 'individual-round-7'), /reached round 6/);
  assert.equal(launches(), 0);
});

test('successive individual selection-tagged review pairs advance the counter until round 6 hands back', async t => {
  const f = await lightRun(t);
  await seedRounds(f, 4);
  const individualPair = async label => {
    const { state } = await f.core.state();
    for (const reviewer of state.reviewerSelection.selection.reviewers) await f.request('gate.execute', { gates: ['review'], configuration: { provider: reviewer.provider,
      model: reviewer.model, reasoningEffort: reviewer.reasoningEffort, reviewerSelection: state.reviewerSelection.event } }, `${label}-${reviewer.provider}`);
  };
  reviewers(f);
  for (const [round, label] of [[5, 'r5'], [6, 'r6']]) {
    await revise(f, { 'app.js': `export const answer = 42; // ${label}\n` }, label);
    await individualPair(label);
    assert.equal((await f.request('status')).rounds.scopes[0].round, round, `individual reviews of ${label} count round ${round}`);
  }
  assert.equal((await pair(f)).outcome, 'UNAVAILABLE', 'round 6 hands back');
  await revise(f, { 'app.js': 'export const answer = 42; // r7\n' }, 'r7');
  await assert.rejects(individualPair('r7'), /reached round 6/);
});

test('a planning review that fails at the provider still uses its round', async t => {
  const f = await fixture(t, { rigor: 'light', authorize: false });
  await delegate(f);
  f.core.runtime.evaluator = { async describe() { return { provider: 'codex', model: 'fixture', reasoningEffort: 'high' }; },
    async runStage() { throw Object.assign(new Error('codex timed out'), { code: 'AGENT_PROVIDER_TIMEOUT' }); } };
  await assert.rejects(f.request('planning.review', { artifact: 'brief', configuration: reviewConfig }, 'brief-timeout'), /timed out/);
  assert.deepEqual((await f.request('status')).rounds.scopes.map(row => [row.scope, row.round]), [['planning:brief', 1]]);
});

test('a result retained from an earlier review contract keeps its qualification (AC11)', () => {
  assert.equal(retainedContractQualifies({ reviewContract: 'sha256:old' }, 'sha256:new'), true, 'an unversioned earlier result');
  assert.equal(retainedContractQualifies({ reviewContract: 'sha256:old', reviewContractVersion: 'gatereeve-review/earlier' }, 'sha256:new'), true);
  assert.equal(retainedContractQualifies({ reviewContract: 'sha256:same', reviewContractVersion: REVIEW_CONTRACT_VERSION }, 'sha256:same'), true);
  assert.equal(retainedContractQualifies({ reviewContract: 'sha256:old', reviewContractVersion: REVIEW_CONTRACT_VERSION }, 'sha256:new'), false, 'same version, changed rules');
});
