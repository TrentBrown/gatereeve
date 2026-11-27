import './helpers/private-scratch.js';
// Class-level fix records (issue #144; spec AC1-AC5, rubric R1-R5): claim
// dispositions, the sweep record contract, records carried to later rounds of
// the open scope, and a missed site of a swept class as a regression.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { boundaryReviews } from '../../plugin-src/shared/resources/protocol/current/boundary-review.js';
import { checkClaims, scopeSweepRecords, sweptClassRegression, uniqueRecords, SWEEP_FORMAT, SWEEP_GUIDE, MAX_SITES } from '../../plugin-src/shared/resources/protocol/current/sweep-records.js';
import { fixture } from './helpers/lightweight-fixture.js';
import { selection } from './helpers/paired-review-fixture.js';
import { revise, seedRounds, reviewers } from './helpers/round-fixture.js';
import { fixed, disputed, sweep } from './helpers/sweep-fixture.js';

const refused = (claims, pattern) => assert.throws(() => checkClaims(claims), pattern);
const withSweep = (change, extra = {}) => ({ ...fixed('F1'), ...extra, sweep: change(sweep()) });
const without = (object, key) => { const copy = { ...object }; delete copy[key]; return copy; };

test('R1: a claim needs a fixed or disputed disposition; fixed needs a sweep and disputed must not carry one', () => {
  refused([{ findingId: 'F1', claim: 'Fixed.' }], /claims\[0\]\.disposition must be fixed or disputed$/);
  refused([disputed('F0'), { ...disputed('F1'), disposition: 'resolved' }], /claims\[1\]\.disposition must be fixed or disputed$/);
  refused([without(fixed('F1'), 'sweep')], /claims\[0\]\.sweep is required for a fixed claim$/);
  refused([{ ...disputed('F1'), sweep: sweep() }], /claims\[0\]\.sweep is not allowed on a disputed claim$/);
  refused([{ ...disputed('F1'), note: 'x' }], /claims\[0\]\.note is not allowed; a claim has exactly findingId, claim, disposition, sweep$/);
  refused([{ ...disputed('F1'), claim: '' }], /claims\[0\]\.claim must be nonempty text/);
  refused(Array.from({ length: 129 }, (_, index) => disputed(`F${index}`)), /at most 128/);
  assert.doesNotThrow(() => checkClaims([disputed('F1')]));
});

test('R2: every sweep field is required and bounded, refused by its path; one site with its search is accepted', () => {
  for (const key of ['class', 'search', 'sites', 'fix', 'test', 'dependents']) refused([withSweep(record => without(record, key))], new RegExp(`claims\\[0\\]\\.sweep\\.${key} is required$`));
  for (const key of ['class', 'search', 'fix', 'test', 'dependents']) {
    for (const value of ['', '   ', 42, null, ['text'], 'x'.repeat(4097)]) refused([withSweep(record => ({ ...record, [key]: value }))],
      new RegExp(`claims\\[0\\]\\.sweep\\.${key} must be nonempty text of at most 4096 characters$`));
    assert.doesNotThrow(() => checkClaims([withSweep(record => ({ ...record, [key]: 'x'.repeat(4096) }))]));
  }
  for (const sites of [[], 'app/app.js:1', { path: 'app/app.js', line: 1 }, Array.from({ length: MAX_SITES + 1 }, (_, line) => ({ path: 'app/app.js', line: line + 1 }))])
    refused([withSweep(record => ({ ...record, sites }))], /claims\[0\]\.sweep\.sites must list 1 to 256 sites$/);
  const site = (value, index = 1) => withSweep(record => ({ ...record, sites: [{ path: 'app/app.js', line: 1 }, value].slice(0, index + 1) }));
  refused([site('app/app.js')], /claims\[0\]\.sweep\.sites\[1\] must be an object$/);
  refused([site({ path: 'app/app.js', line: 1, column: 2 })], /claims\[0\]\.sweep\.sites\[1\]\.column is not allowed; a site has exactly path, line$/);
  for (const path of [undefined, '', 7, 'p'.repeat(1025)]) refused([site({ path, line: 1 })], /claims\[0\]\.sweep\.sites\[1\]\.path must be nonempty text of at most 1024 characters$/);
  for (const line of [undefined, 0, -1, 1.5, '3']) refused([site({ path: 'app/app.js', line })], /claims\[0\]\.sweep\.sites\[1\]\.line must be a positive integer$/);
  refused([withSweep(record => ({ ...record, owner: 'x' }))], /claims\[0\]\.sweep\.owner is not allowed; a sweep record has exactly class, search, sites, fix, test, dependents$/);
  refused([withSweep(() => 'swept')], /claims\[0\]\.sweep must be an object$/);
  assert.doesNotThrow(() => checkClaims([fixed('F1')]), 'one site plus its search is a valid sweep');
  assert.doesNotThrow(() => checkClaims([withSweep(record => ({ ...record, sites: Array.from({ length: MAX_SITES }, (_, line) => ({ path: 'app/app.js', line: line + 1 })) }))]));
});

async function lightRun(t) {
  const f = await fixture(t, { rigor: 'light', files: { 'other.js': 'export const other = 1;\n' } });
  await revise(f, { 'app.js': 'export const answer = 42;\n' }, 'r1');
  await f.request('review.select', selection(), 'select');
  return f;
}
const pair = async f => { const { state } = await f.core.state(); return boundaryReviews(f.core, state, await f.core.store.json(state.candidate)); };
const passRows = verdict => { verdict.dimensions.forEach(row => { row.outcome = 'PASS'; }); verdict.criteria.forEach(row => { row.outcome = 'PASS'; }); };
const failCode = verdict => { verdict.outcome = 'FAIL'; verdict.dimensions.find(row => row.name === 'code').outcome = 'FAIL'; };
// Capture every reviewer packet launched from now on.
function packets(f, seen = []) {
  for (const adapter of Object.values(f.core.runtime.evaluators)) {
    const run = adapter.runStage.bind(adapter);
    adapter.runStage = async (request, hooks) => { seen.push(request.input); return run(request, hooks); };
  }
  return seen;
}
const F0 = 'codex/codex-finding-0', F1 = 'codex/codex-finding-1';
const medium = (path, classId, extra = {}) => ({ path, classId, classStatement: `${classId} defect class`, evidence: `[medium] A ${classId} defect.`, ...extra });
const dispose = rows => (verdict, request) => {
  verdict.dispositions = rows.filter(([id]) => (request.input.dispositionsRequired ?? []).some(row => row.id === id))
    .map(([id, status]) => ({ id, status, evidence: `Reviewer says ${status}.` }));
  if (rows.some(([, status]) => status === 'present')) failCode(verdict);
};

// Round `round - 1` raises F0 (class swept-class) and F1 (also swept-class)
// on app/other.js; round `round` claims F0 fixed with a sweep, on a revision
// that changes app.js only.
async function claimedRound(t, round, { extra = [], codex = null, claude = null, claims } = {}) {
  const f = await lightRun(t);
  await seedRounds(f, round - 2);
  await revise(f, { 'app.js': `export const answer = 42; // r${round - 1}\n` }, `r${round - 1}`);
  reviewers(f, { findings: { codex: [medium('app/other.js', 'swept-class'), medium('app/other.js', 'swept-class', { evidence: '[medium] A second site.' })] } });
  await f.request('review.execute', {}, `round-${round - 1}`);
  await revise(f, { 'app.js': `export const answer = 42; // r${round}\n` }, `r${round}`);
  reviewers(f, { findings: { codex: extra }, patch: { codex: codex ?? dispose([[F0, 'resolved'], [F1, 'resolved']]), 'claude-code': claude ?? dispose([[F0, 'resolved'], [F1, 'resolved']]) } });
  const seen = packets(f);
  const done = await f.request('review.execute', { claims: claims ?? [fixed(F0, 'Fixed both sites.', { class: 'Unchecked export contract' })] }, `round-${round}`);
  return { f, seen, done };
}

test('R1: gate.execute and review.execute refuse an invalid claim before any reviewer starts and record no result', async t => {
  const f = await lightRun(t);
  const launches = reviewers(f);
  const { state } = await f.core.state();
  const reviewer = state.reviewerSelection.selection.reviewers[0];
  const configuration = { provider: reviewer.provider, model: reviewer.model, reasoningEffort: reviewer.reasoningEffort, reviewerSelection: state.reviewerSelection.event };
  const results = state.results.length;
  // Every invalid-claim case is refused through both commands (R1).
  const cases = [
    ['missing-disposition', { findingId: F0, claim: 'Fixed.' }, /claims\[0\]\.disposition must be fixed or disputed/],
    ['unknown-disposition', { ...disputed(F0), disposition: 'resolved' }, /claims\[0\]\.disposition must be fixed or disputed/],
    ['fixed-no-sweep', without(fixed(F0), 'sweep'), /claims\[0\]\.sweep is required for a fixed claim/],
    ['disputed-sweep', { ...disputed(F0), sweep: sweep() }, /claims\[0\]\.sweep is not allowed on a disputed claim/],
    ['unknown-key', { ...disputed(F0), note: 'x' }, /claims\[0\]\.note is not allowed; a claim has exactly findingId, claim, disposition, sweep/],
    ['no-search', withSweep(record => without(record, 'search')), /claims\[0\]\.sweep\.search is required/],
  ];
  for (const [name, claim, message] of cases) {
    await assert.rejects(f.request('review.execute', { claims: [claim] }, `paired-${name}`), message, `review.execute ${name}`);
    await assert.rejects(f.request('gate.execute', { gates: ['review'], claims: [claim], configuration }, `individual-${name}`), message, `gate.execute ${name}`);
  }
  assert.equal(launches(), 0, 'no reviewer launched');
  assert.equal((await f.core.state()).state.results.length, results, 'no result recorded');
  // A valid disputed claim naming no retained finding is dropped (#141) and the reviewers run.
  await f.request('review.execute', { claims: [disputed('codex/stale-id')] }, 'paired-disputed');
  assert.ok(launches() > 0);
});

test('R3: a round carries its fixed claims as sweep records, and later rounds and individual reviews of the open scope still receive them', async t => {
  const { f, seen } = await claimedRound(t, 4);
  assert.equal(seen.length, 2);
  const expected = { findingId: F0, classId: 'swept-class', round: 4, ...sweep({ class: 'Unchecked export contract' }) };
  for (const packet of seen) {
    assert.equal(packet.sweepRecords.format, SWEEP_FORMAT);
    assert.equal(packet.sweepRecords.guide, SWEEP_GUIDE);
    assert.deepEqual(packet.sweepRecords.records, [expected]);
    assert.equal(packet.roundPolicy.round, 4);
    assert.match(packet.roundPolicy.revision, /^sha256:[0-9a-f]{64}$/);
    assert.equal(packet.roundPolicy.epoch, 0);
  }
  // Round 5 without new claims: both peers' inputs held the record, carried once.
  await revise(f, { 'other.js': 'export const other = 2;\n' }, 'r5');
  seen.length = 0;
  reviewers(f, { patch: { codex: dispose([[F1, 'resolved']]), 'claude-code': dispose([[F1, 'resolved']]) } });
  packets(f, seen);
  await f.request('review.execute', {}, 'round-5');
  for (const packet of seen) assert.deepEqual(packet.sweepRecords.records, [expected]);
  // An individual selection-tagged review of round 6 receives them too, plus
  // its own re-claim of the same finding as a second record.
  await revise(f, { 'other.js': 'export const other = 3;\n' }, 'r6');
  seen.length = 0;
  reviewers(f); packets(f, seen);
  const { state } = await f.core.state();
  const reviewer = state.reviewerSelection.selection.reviewers[0];
  const again = fixed(F0, 'Fixed a third site.', { sites: [{ path: 'app/other.js', line: 1 }] });
  await f.request('gate.execute', { gates: ['review'], claims: [again], configuration: { provider: reviewer.provider, model: reviewer.model,
    reasoningEffort: reviewer.reasoningEffort, reviewerSelection: state.reviewerSelection.event } }, 'individual-r6');
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].sweepRecords.records, [expected, { findingId: F0, classId: 'swept-class', round: 6, ...again.sweep }]);
  // A closed scope (integration, split or amendment removes its entry) carries nothing.
  const current = (await f.core.state()).state;
  assert.equal((await scopeSweepRecords(f.core, current, 'slice')).length, 2);
  assert.deepEqual(await scopeSweepRecords(f.core, { ...current, reviewScopes: {} }, 'slice'), []);
  // A later scope of the same name that counts the same revisions (after a
  // split or an amendment reset) is a new epoch: the old records do not match.
  const reopened = { ...current, reviewScopeHistory: [...current.reviewScopeHistory, { ...current.reviewScopes.slice, closed: { reason: 'split', event: 'split' } }] };
  assert.deepEqual(await scopeSweepRecords(f.core, reopened, 'slice'), []);
});

test('R3: without a retained fixed claim the packet has no sweepRecords; a dropped claim contributes no record', async t => {
  const f = await lightRun(t);
  reviewers(f);
  const seen = packets(f);
  await f.request('review.execute', { claims: [fixed('codex/stale-id')] }, 'stale-fixed');
  assert.equal(seen.length, 2);
  for (const packet of seen) { assert.equal(packet.sweepRecords, undefined); assert.deepEqual(packet.claims, []); assert.ok(packet.roundPolicy.revision); }
});

test('R3: duplicates are records with equal content', () => {
  const record = { findingId: F0, classId: 'c', round: 4, ...sweep() };
  assert.deepEqual(uniqueRecords([record, { ...record }, { ...record, round: 5 }]), [record, { ...record, round: 5 }]);
});

for (const round of [4, 5]) {
  test(`R4: round ${round}: a new medium finding of a swept class is a regression and blocks`, async t => {
    const { f } = await claimedRound(t, round, { extra: [medium('app/other.js', 'swept-class', { id: 'missed-site', evidence: '[medium] A missed site.' })], codex: (verdict, request) => { dispose([[F0, 'resolved'], [F1, 'resolved']])(verdict, request); passRows(verdict); } });
    const reviewed = await pair(f);
    assert.equal(reviewed.round.round, round);
    assert.equal(reviewed.outcome, 'FAIL', reviewed.summary);
  });
  test(`R4: round ${round}: a medium finding of another class is demoted`, async t => {
    const { f } = await claimedRound(t, round, { extra: [medium('app/other.js', 'other-class', { id: 'other-defect' })], codex: (verdict, request) => { dispose([[F0, 'resolved'], [F1, 'resolved']])(verdict, request); passRows(verdict); } });
    const reviewed = await pair(f);
    assert.equal(reviewed.outcome, 'PASS', reviewed.summary);
    assert.equal(reviewed.members.flatMap(member => member.demotedFindings).length, 1);
  });
  test(`R4: round ${round}: an earlier finding of the swept class still present blocks`, async t => {
    const { f } = await claimedRound(t, round, { codex: (verdict, request) => { dispose([[F0, 'resolved'], [F1, 'present']])(verdict, request); passRows(verdict); } });
    assert.equal((await pair(f)).outcome, 'FAIL');
  });
  test(`R4: round ${round}: the claimed finding still present is not a class regression of its own sweep`, async t => {
    // Only F0 is claimed; F1, the other site of the class, is resolved.
    const { f } = await claimedRound(t, round, { codex: (verdict, request) => { dispose([[F0, 'present'], [F1, 'resolved']])(verdict, request); passRows(verdict); } });
    const reviewed = await pair(f);
    assert.equal(reviewed.outcome, 'PASS', reviewed.summary);
  });
}

test('R4: the predicate: same class, another ID, a counted round no later than the one qualified', () => {
  const records = [{ findingId: F0, classId: 'c', round: 4 }, { findingId: 'x', classId: 'late', round: 6 }, { findingId: 'y', classId: 'unrounded', round: null }];
  assert.equal(sweptClassRegression(records, { id: 'G', classId: 'c' }, 4), true);
  assert.equal(sweptClassRegression(records, { id: F0, classId: 'c' }, 4), false);
  assert.equal(sweptClassRegression(records, { id: 'G', classId: 'other' }, 4), false);
  assert.equal(sweptClassRegression(records, { id: 'G', classId: 'late' }, 5), false);
  assert.equal(sweptClassRegression(records, { id: 'G', classId: 'unrounded' }, 5), false);
  assert.equal(sweptClassRegression(records, { id: 'G' }, 5), false);
});

test('R5: the reviewer instructions point to the guide, which states the verification and regression rules', async () => {
  const source = await readFile(new URL('../../plugin-src/shared/resources/protocol/current/execution.js', import.meta.url), 'utf8');
  assert.match(source, /When packet\.sweepRecords is present, follow packet\.sweepRecords\.guide\./);
  assert.match(source, /medium regressions of the previous fix \(findings on packet\.roundPolicy\.regressionPaths, missed sites of a class in packet\.sweepRecords, or earlier regressions still present\) block/);
  assert.match(SWEEP_GUIDE, /Verify each one against the candidate: run or reason through the search, check every listed site and look for sites it missed, and check that the fix, the test and the dependents are as stated/);
  assert.match(SWEEP_GUIDE, /Report a missed site of a swept class as a finding with that record's classId/);
  assert.match(SWEEP_GUIDE, /is a regression of the previous fix: in rounds 4-5 a medium or high one blocks/);
});
