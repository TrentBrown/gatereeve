import './helpers/private-scratch.js';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isolatedTests } from './helpers/isolated-tests.js';
import { fixture, candidate, branchWith, human, BRIEF } from './helpers/lightweight-fixture.js';
import { decisionHas } from '../../plugin-src/shared/resources/protocol/current/contracts.js';
import { selection, pairedAdapters } from './helpers/paired-review-fixture.js';

const test = isolatedTests(import.meta.url, { shards: 2 });

const check = (id, purpose) => ({ repository: 'app', command: process.execPath, args: ['-e', `process.exit(0); // ${id}`], purpose });
const verify = (f, checks, operationId) => f.request('gate.execute', { gates: ['verification'], configuration: {
  validation: { kind: 'alternative', reason: 'Fixture has no hosted CI', scope: 'The approved criterion' }, checks } }, operationId);

// GitHub issue #145 item 1: after a docs-only push the repository's CI reuses an
// earlier full run and skips its browser/integration checks, one reviewer is
// UNAVAILABLE, and the human explicitly waives review and verification.
async function reusedCoverageWithUnavailableReviewer(t, rigor) {
  const f = await fixture(t, { rigor });
  await writeFile(join(f.home, 'scratchpad.md'), '# No pending decisions\n');
  const first = await branchWith(f, 'topic', 'export const answer = 42;\n');
  await candidate(f, 'SLICE', first, 'candidate-first');
  await f.request('candidate.ready', {}, 'ready-first');
  await verify(f, [check('unit', 'Unit tests'), check('browser', 'Browser tests')], 'verify-full');
  const second = await branchWith(f, 'topic', { 'app.js': 'export const answer = 42;\n', 'README.md': 'Docs only.\n' });
  await candidate(f, 'SLICE', second, 'candidate-second');
  await f.request('candidate.ready', {}, 'ready-second');
  const reused = await verify(f, [check('unit', 'Unit tests')], 'verify-reused');
  await f.request('review.select', selection(), 'select');
  pairedAdapters(f, { unavailable: 'claude-code' });
  await f.request('review.execute', { consumed: reused.event.payload.results }, 'review');
  await f.request('gate.execute', { gates: ['context'] }, 'context');
  await f.request('gate.execute', { gates: ['packet'] }, 'packet');
  return f;
}

for (const rigor of ['light', 'full']) test(`${rigor}: an explicit human waiver of review and verification gets past reused CI coverage with an UNAVAILABLE reviewer`, async t => {
  const f = await reusedCoverageWithUnavailableReviewer(t, rigor);
  const before = await f.request('milestone.check', { name: 'acceptance' });
  assert.equal(before.allowed, false);
  assert.match(before.missing.join('; '), /uncovered prior behavior/);
  const subject = (await f.core.state()).state.candidate.hash;
  const decision = await f.request('human.decide', { kind: 'waive', actions: ['accept'], gates: ['review', 'verification'], subject,
    authority: { ...human, instruction: 'Waive the review and verification gates for this PR and accept it.' },
    reason: 'Docs-only push; CI reused the earlier full run and one reviewer was unavailable', consequences: 'Browser checks did not run on this head; one review is missing' }, 'waive-accept');
  assert.ok(decision.event);
  const after = await f.request('milestone.check', { name: 'acceptance' });
  assert.equal(after.allowed, true, after.missing.join('; '));
  const review = after.outcomes.find(item => item.id === 'review');
  const verification = after.outcomes.find(item => item.id === 'verification');
  // The record stays honest: the waived facts are preserved, not rewritten.
  assert.equal(review.outcome, 'UNAVAILABLE');
  assert.ok(review.exception);
  assert.equal(verification.outcome, 'PASS');
  assert.ok(verification.exception);
  assert.equal(verification.waivedCoverage.length, 1);
  assert.match(verification.waivedCoverage[0], /uncovered prior behavior/);
  // The decision retains what the human waived, as observed when they decided.
  const recorded = (await f.core.state()).state.decisions.find(item => item.kind === 'waive');
  assert.equal(recorded.observed.review.outcome, 'UNAVAILABLE');
  assert.equal(recorded.observed.verification.outcome, 'PASS');
  assert.match(recorded.observed.verification.waivedCoverage[0], /uncovered prior behavior/);
  const passed = await f.request('milestone.pass', { name: 'acceptance' }, 'acceptance');
  const milestone = passed.event.payload.outcomes;
  assert.equal(milestone.find(item => item.id === 'review').outcome, 'UNAVAILABLE');
  assert.match(milestone.find(item => item.id === 'verification').waivedCoverage[0], /uncovered prior behavior/);
});

test('without a verification waiver the uncovered coverage still blocks, and the refusal names it', async t => {
  const f = await reusedCoverageWithUnavailableReviewer(t, 'light');
  const subject = (await f.core.state()).state.candidate.hash;
  await assert.rejects(f.request('human.decide', { kind: 'waive', actions: ['accept'], gates: ['review'], subject,
    authority: { ...human, instruction: 'Waive the review gate for this PR and accept it.' }, reason: 'One reviewer unavailable', consequences: 'One review is missing' }, 'waive-review-only'),
    /Required review proof is missing: .*uncovered prior behavior/);
  const check = await f.request('milestone.check', { name: 'acceptance' });
  assert.equal(check.allowed, false);
  assert.match(check.missing.join('; '), /uncovered prior behavior/);
  assert.equal(check.outcomes.find(item => item.id === 'verification').waivedCoverage, undefined);
});

// GitHub issue #145 item 2: the findings log of a supervised light brief grows
// without a new authorize-implementation; any other brief change still needs one.
test('light: a findings-log append keeps implementation authority; a scope edit does not', async t => {
  const f = await fixture(t, { rigor: 'light' });
  const authorized = (await f.core.commitments()).subject;
  const head = await branchWith(f, 'topic', 'export const answer = 42;\n');
  await writeFile(join(f.home, 'brief.md'), BRIEF.replace('- none yet\n', '- none yet\n- Reviewer noted the constant is unexported; fixed in app.js.\n'));
  assert.equal((await f.core.commitments()).subject, authorized);
  const implementation = await f.request('milestone.check', { name: 'implementation' });
  assert.equal(implementation.allowed, true, implementation.missing.join('; '));
  await candidate(f, 'SLICE', head, 'candidate-after-log');
  const pinned = await f.core.store.json((await f.core.state()).state.candidate);
  assert.match((await f.core.store.get(pinned.requirements['brief.md'])).toString(), /Reviewer noted/, 'the candidate pins the brief as logged');
  assert.equal((await f.core.state()).state.decisions.filter(item => decisionHas(item, 'authorize-implementation')).length, 1);
  // A nested sub-heading inside the findings log is still the log.
  await writeFile(join(f.home, 'brief.md'), `${await readFile(join(f.home, 'brief.md'), 'utf8')}\n### Round 2\n- Nothing new.\n`);
  assert.equal((await f.core.commitments()).subject, authorized);
  // Outside the findings log: goal or scope changes need a new authorization.
  await writeFile(join(f.home, 'brief.md'), (await readFile(join(f.home, 'brief.md'), 'utf8')).replace('app.js only.', 'app.js and the CLI.'));
  const changed = (await f.core.commitments()).subject;
  assert.notEqual(changed, authorized);
  const blocked = await f.request('milestone.check', { name: 'implementation' });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.missing.join('; '), /current implementation authorization/);
  await assert.rejects(candidate(f, 'SLICE', head, 'candidate-after-scope'), /implementation authority/);
  // Restoring the scope restores the authorized subject; the log stays grown.
  await writeFile(join(f.home, 'brief.md'), (await readFile(join(f.home, 'brief.md'), 'utf8')).replace('app.js and the CLI.', 'app.js only.'));
  assert.equal((await f.core.commitments()).subject, authorized);
});
