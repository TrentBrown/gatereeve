import './helpers/private-scratch.js';
// CI after review convergence (spec AC9, rubric R9; interview D25-D27): local
// rounds on an unpushed head, one push, a runner-role CI check with no model
// call, refusal of different trees and unassessed local evidence, the CI
// failure delta path and the premature-push warning.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { git } from '../../plugin-src/shared/resources/protocol/current/evidence.js';
import { boundaryReviews } from '../../plugin-src/shared/resources/protocol/current/boundary-review.js';
import { preToolUse, PREMATURE_PUSH } from '../../plugin-src/shared/resources/protocol/current/pre-tool-use.js';
import { fixture, candidate } from './helpers/lightweight-fixture.js';
import { selection } from './helpers/paired-review-fixture.js';
import { revise, reviewers, focusedCheck, localVerification } from './helpers/round-fixture.js';

const job = (name, conclusion = 'success') => ({ id: name.length, name, status: 'completed', conclusion, started_at: '2026-11-24T00:00:00Z', completed_at: '2026-11-24T00:01:00Z', html_url: `https://github.com/fixture/project/actions/runs/7/job/${name}` });
const tree = async (f, sha) => (await git(f.repo, ['rev-parse', `${sha}^{tree}`])).trim();
const ciVerification = (f, operationId, checks = [], run = 7) => f.request('gate.execute', { gates: ['verification'], configuration: {
  validation: { kind: 'ci', runs: [{ alias: 'app', repository: 'fixture/project', run, attempt: 1, requiredChecks: ['test'] }] }, checks } }, operationId);
function hostedCi(f, { head, treeId, jobs = [job('test')] }) {
  f.core.runtime.fetchValidationRun = async () => ({ head_sha: head, status: 'completed', head_commit: { id: head, tree_id: treeId }, jobs });
}
const pair = async f => { const { state } = await f.core.state(); return boundaryReviews(f.core, state, await f.core.store.json(state.candidate)); };
const acceptance = f => f.request('milestone.check', { name: 'acceptance' });
const verificationMissing = check => check.missing.filter(item => item.startsWith('verification'));

// Converged paired reviews on a local commit that was never pushed.
async function converged(t, checks = [focusedCheck('Unit tests', { ciCheck: 'test' })], files = {}) {
  const f = await fixture(t, { rigor: 'light' });
  const head = await revise(f, { 'app.js': 'export const answer = 42;\n', ...files }, 'r1', checks);
  assert.doesNotMatch(await git(f.repo, ['ls-remote', 'origin']), new RegExp(head), 'the candidate head is local only');
  await f.request('review.select', selection(), 'select');
  const launches = reviewers(f);
  const round = await f.request('review.execute', {}, 'round-1');
  assert.ok(round.event.payload.outcomes.every(row => row.status === 'completed'), JSON.stringify(round.event.payload.outcomes));
  assert.equal((await pair(f)).outcome, 'PASS');
  return { f, head, launches, reviews: round.event.payload.outcomes.flatMap(row => row.results) };
}

test('a same-tree ci Verification covering the consumed receipts qualifies the converged reviews without a model call', async t => {
  const { f, head, launches, reviews } = await converged(t);
  await git(f.repo, ['push', 'origin', 'HEAD:refs/heads/topic']); // The one push after convergence.
  hostedCi(f, { head, treeId: await tree(f, head) });
  const ci = await ciVerification(f, 'verify-ci');
  assert.equal((await f.core.store.json(ci.event.payload.results[0])).outcome, 'PASS');
  const check = await acceptance(f);
  const verification = check.outcomes.find(row => row.id === 'verification');
  assert.equal(verification.ciQualification.outcome, 'PASS', verification.ciQualification.reason);
  assert.deepEqual(verification.ciQualification.covered.map(row => row.by), ['ci-required-check']);
  assert.deepEqual(verificationMissing(check), []);
  assert.equal(check.outcomes.find(row => row.id === 'review').satisfied, true, 'recording CI does not invalidate the converged reviews');
  const before = launches();
  const again = await f.request('review.execute', {}, 'after-ci');
  assert.equal(launches(), before, 'no paired re-review is launched');
  assert.deepEqual(again.event.payload.outcomes.flatMap(row => row.results).map(ref => ref.hash), reviews.map(ref => ref.hash), 'the converged reviews are reused');
  assert.equal((await f.request('status')).rounds.scopes[0].round, 1, 'reuse on the same revision is not a new round');
});

test('a consumed receipt is covered by a same-tree receipt in the final Verification; an uncovered one fails by name', async t => {
  const { f, head } = await converged(t, [focusedCheck('Lint changed area')]);
  hostedCi(f, { head, treeId: await tree(f, head) });
  await ciVerification(f, 'verify-ci-bare');
  let check = await acceptance(f);
  assert.match(verificationMissing(check).join('\n'), /consumed local receipt app: Lint changed area \(.*\) from Verification sha256:[a-f0-9]{64} is not covered/);
  await ciVerification(f, 'verify-ci-with-receipt', [focusedCheck('Lint changed area')]);
  check = await acceptance(f);
  const verification = check.outcomes.find(row => row.id === 'verification');
  assert.deepEqual(verificationMissing(check), [], check.missing.join('; '));
  assert.deepEqual(verification.ciQualification.covered.map(row => row.by), ['same-tree-receipt']);
});

test('a ci Verification for a different tree is rejected naming both trees; another commit with the same tree is not the exact head', async t => {
  const { f, head } = await converged(t);
  const candidateTree = await tree(f, head);
  hostedCi(f, { head: 'b'.repeat(40), treeId: 'c'.repeat(40) });
  const other = await f.core.store.json((await ciVerification(f, 'verify-other-tree')).event.payload.results[0]);
  assert.notEqual(other.outcome, 'PASS');
  assert.match(other.summary, new RegExp(`tree ${'c'.repeat(40)} \\(head ${'b'.repeat(40)}\\), which differs from the reviewed candidate tree ${candidateTree} \\(head ${head}\\)`));
  hostedCi(f, { head: 'd'.repeat(40), treeId: candidateTree });
  const sameTree = await f.core.store.json((await ciVerification(f, 'verify-same-tree-other-head', [], 8)).event.payload.results[0]);
  assert.notEqual(sameTree.outcome, 'PASS');
  assert.match(sameTree.summary, /not the exact candidate head .*acceptance needs CI on the exact candidate head/);
  assert.ok(verificationMissing(await acceptance(f)).length, 'a rejected CI Verification never qualifies acceptance');
});

test('acceptance is refused on local evidence the converged reviews did not assess', async t => {
  const { f } = await converged(t);
  await localVerification(f, 'verify-unassessed', [focusedCheck('A different local suite')]);
  assert.match(verificationMissing(await acceptance(f)).join('\n'), /local evidence the converged reviews did not assess/);
  await localVerification(f, 'verify-rerun', [focusedCheck('Unit tests', { ciCheck: 'test' })]);
  assert.deepEqual(verificationMissing(await acceptance(f)), [], 'the same checks rerun on the same tree are the assessed evidence');
});

test('a review consuming a Verification with no receipt on the candidate tree is not qualifying', async t => {
  const f = await fixture(t, { rigor: 'light' });
  await revise(f, { 'app.js': 'export const answer = 42;\n' }, 'r1');
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  hostedCi(f, { head, treeId: await tree(f, head) });
  const ci = (await ciVerification(f, 'verify-ci-only')).event.payload.results;
  await f.request('review.select', selection(), 'select');
  reviewers(f);
  await f.request('review.execute', { consumed: ci }, 'ci-only-round');
  const reviewed = await pair(f);
  assert.equal(reviewed.outcome, 'UNAVAILABLE');
  assert.ok(reviewed.members.every(member => member.result.outcome === 'PASS' && /no runner receipt on the candidate tree/.test(member.qualification)));
});

test('after a hosted CI failure one paired delta round on the fix and a passing CI run qualify acceptance', async t => {
  const { f, head, reviews } = await converged(t);
  hostedCi(f, { head, treeId: await tree(f, head), jobs: [job('test', 'failure')] });
  const failed = await f.core.store.json((await ciVerification(f, 'verify-ci-failed')).event.payload.results[0]);
  assert.notEqual(failed.outcome, 'PASS');
  assert.ok((await acceptance(f)).missing.some(item => item.startsWith('verification')));
  const fixed = await revise(f, { 'app.js': 'export const answer = 42; // fixed after CI\n' }, 'ci-fix', [focusedCheck('Unit tests', { ciCheck: 'test' })]);
  reviewers(f);
  const prior = {};
  for (const ref of reviews) prior[(await f.core.store.json((await f.core.store.json(ref)).input)).configuration.provider] = ref;
  const delta = await f.request('review.execute', { prior }, 'delta-round');
  const results = await Promise.all(delta.event.payload.outcomes.flatMap(row => row.results).map(ref => f.core.store.json(ref)));
  assert.deepEqual(results.map(result => [result.mode, result.outcome]), [['delta', 'PASS'], ['delta', 'PASS']]);
  assert.equal((await f.request('status')).rounds.scopes[0].round, 2, 'the delta review of the fix counts as one round');
  hostedCi(f, { head: fixed, treeId: await tree(f, fixed) });
  await ciVerification(f, 'verify-ci-passed', [], 9);
  const check = await acceptance(f);
  const verification = check.outcomes.find(row => row.id === 'verification');
  assert.equal(verification.ciQualification.outcome, 'PASS', verification.ciQualification.reason);
  assert.deepEqual(verificationMissing(check), []);
  assert.equal(check.outcomes.find(row => row.id === 'review').satisfied, true);
});

test('pushing a PR branch before the reviews converge is warned about, never denied', async t => {
  const f = await fixture(t, { rigor: 'light' });
  await revise(f, { 'app.js': 'export const answer = 42;\n' }, 'r1');
  const runtime = { contextFor: async () => f.context, env: { PATH: '' } };
  const push = command => preToolUse({ cwd: f.repo, tool_input: { command } }, runtime);
  const early = await push('git push -u origin topic');
  assert.equal(early.systemMessage, PREMATURE_PUSH);
  assert.equal(early.hookSpecificOutput.additionalContext, PREMATURE_PUSH);
  assert.equal(early.hookSpecificOutput.permissionDecision, undefined, 'the push is not denied');
  await f.request('review.select', selection(), 'select');
  reviewers(f);
  await f.request('review.execute', {}, 'round-1');
  assert.deepEqual(await push('git push -u origin topic'), {}, 'no warning once the scope has converged');
});

test('a repository with hosted CI is never accepted on local evidence alone', async t => {
  const workflow = { '.github/workflows/ci.yml': 'on: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps: [{ run: npm test }]\n' };
  const { f, head } = await converged(t, [focusedCheck('Unit tests', { ciCheck: 'test' })], workflow);
  // The converged reviews assessed this local Verification, yet hosted CI exists.
  assert.match(verificationMissing(await acceptance(f)).join('\n'), /acceptance needs a passing ci Verification on the exact candidate head; local evidence alone never satisfies acceptance/);
  hostedCi(f, { head, treeId: await tree(f, head) });
  await ciVerification(f, 'verify-ci-hosted');
  assert.deepEqual(verificationMissing(await acceptance(f)), []);
});

test('a failed CI job outside the declared required checks fails the qualification', async t => {
  const { f, head } = await converged(t);
  hostedCi(f, { head, treeId: await tree(f, head), jobs: [job('test'), job('lint', 'failure')] });
  await ciVerification(f, 'verify-ci-red-lint');
  assert.match(verificationMissing(await acceptance(f)).join('\n'), /CI job app: lint \(completed\/failure\) did not succeed/);
});

test('CI for another commit with the same tree never qualifies the candidate', async t => {
  const { f, head } = await converged(t);
  hostedCi(f, { head, treeId: await tree(f, head) });
  await ciVerification(f, 'verify-ci-a');
  // An empty amend keeps the tree but makes a different commit.
  await git(f.repo, ['commit', '--amend', '-q', '--no-edit', '--date=2026-11-25T00:00:00Z']);
  const amended = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  assert.notEqual(amended, head);
  await candidate(f, 'SLICE', amended, 'candidate-amended');
  const missing = verificationMissing(await acceptance(f)).join('\n');
  assert.match(missing, new RegExp(`CI ran on ${head}, not the (exact )?candidate head ${amended}`));
});

test('CI qualification fails when the converged reviews assessed no planned CI scope', async t => {
  const f = await fixture(t, { rigor: 'light' });
  const head = await revise(f, { 'app.js': 'export const answer = 42;\n' }, 'r1', []);
  await f.request('gate.execute', { gates: ['verification'], configuration: {
    validation: { kind: 'alternative', reason: 'Local round evidence', scope: 'Focused suites' }, checks: [focusedCheck('Unit tests', { ciCheck: 'test' })] } }, 'verify-unplanned');
  await f.request('review.select', selection(), 'select');
  reviewers(f);
  await f.request('review.execute', {}, 'round-1');
  hostedCi(f, { head, treeId: await tree(f, head) });
  await ciVerification(f, 'verify-ci-unplanned');
  assert.match(verificationMissing(await acceptance(f)).join('\n'), /assessed no planned CI scope/);
});

test('a CI plan bound in a retained Verification input counts when its runner omits it', async t => {
  const { f, head } = await converged(t);
  // Runners recorded by an earlier version do not repeat validation.ciRequiredChecks.
  const read = f.core.store.json.bind(f.core.store);
  f.core.store.json = async ref => { const value = await read(ref);
    if (value?.validation?.kind === 'alternative' && value.validation.ciRequiredChecks) { const { ciRequiredChecks, ...validation } = value.validation; return { ...value, validation }; }
    return value; };
  hostedCi(f, { head, treeId: await tree(f, head) });
  await ciVerification(f, 'verify-ci-retained-plan');
  assert.deepEqual(verificationMissing(await acceptance(f)), []);
});
