// Delivery targets, release merge authority, external blockers and review-summary
// publication (spec AC6, R8 non-delegated paths, R9). Only GitHub transport is
// simulated; Git remotes, integration proof and core decisions are real.
import assert from 'node:assert/strict';
import { isolatedTests } from './helpers/isolated-tests.js';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CurrentCore } from '../../plugin-src/shared/resources/protocol/current/core.js';
import { identity } from '../../plugin-src/shared/resources/protocol/current/contracts.js';
import { git } from '../../plugin-src/shared/resources/protocol/current/evidence.js';
import { captureStanding, qualifyingDecisions, deliveryTarget } from '../../plugin-src/shared/resources/protocol/current/authorization.js';
import { externalBlocker } from '../../plugin-src/shared/resources/protocol/current/actions.js';
import { SUMMARY_START, SUMMARY_END, renderSummary, withSummary, publishedSection } from '../../plugin-src/shared/resources/protocol/current/publication.js';
import { failureResult } from '../../plugin-src/shared/resources/protocol/result.js';
import { sha256Digest } from '../../plugin-src/shared/resources/protocol/agent-workflow.js';

const test = isolatedTests(import.meta.url);
const human = { kind: 'human-confirmed', instruction: 'Merge #12 into main.', context: 'test user conversation' };
const BRIEF = '# Brief\n\n## Goal\nExport the constant answer.\n\n## Scope\napp/app.js only.\n\n## Findings log\n- none yet\n';
const SPEC = '# Spec\n\n## Acceptance Criteria\n\n- **AC1.** Export the constant answer with value 42.\n\n## Rubric\n\n| # | Criterion | Pass | Fail | Evidence |\n|---|---|---|---|---|\n| R1 | AC1 | 42 | other | test |\n\n## Changes\n';
const reviewConfig = { provider: 'codex', model: 'fixture' };

async function fixture(t, { rigor = 'full', integration = 'feature-int', release = 'main' } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gatereeve-targets-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'app'), home = join(root, 'docs/issues/feature');
  await mkdir(repo, { recursive: true }); await mkdir(home, { recursive: true });
  await mkdir(join(root, '.pattern-review')); await writeFile(join(root, '.pattern-review/rules.yaml'), '[]\n');
  await git(repo, ['init', '-b', 'topic']);
  await git(repo, ['config', 'user.email', 'fixture@example.test']);
  await git(repo, ['config', 'user.name', 'Fixture']);
  await git(repo, ['config', 'commit.gpgsign', 'false']);
  await writeFile(join(repo, 'app.js'), 'export const answer = 41;\n');
  await git(repo, ['add', 'app.js']); await git(repo, ['commit', '-m', 'fixture']);
  const base = (await git(repo, ['rev-parse', 'HEAD'])).trim();
  const bare = join(root, 'host.git');
  await git(root, ['init', '--bare', bare]);
  await git(repo, ['remote', 'add', 'origin', 'https://github.com/fixture/project.git']);
  await git(repo, ['config', `url.${bare}.insteadOf`, 'https://github.com/fixture/project.git']);
  for (const branch of new Set([integration, release])) await git(repo, ['push', 'origin', `HEAD:refs/heads/${branch}`]);
  if (rigor === 'light') await writeFile(join(home, 'brief.md'), BRIEF);
  else for (const [name, body] of Object.entries({ 'interview.md': '# Interview\nSettled.\n', 'design.md': '# Design\n\n**Status:** approved\n', 'spec.md': SPEC,
    'plan.md': '# Plan\n## P1 - Implement R1\n', 'issues.md': '# Issues\n## I-1 - Implement\n**Status:** in-review\n**Plan steps:** P1\n**Rubric criteria:** R1\n',
    'tracker.md': '# Tracker\n## Rubric Status\n| R1 | AC1 | NOT YET | pending |\n## Review Log\n', 'scratchpad.md': '# No pending decisions\n', 'decisions.md': '# Decisions\nNo changes.\n' })) await writeFile(join(home, name), body);
  const context = { featureId: 'feature', featureHome: home, workspaceRoot: root,
    repositories: [{ alias: 'app', path: repo, remote: 'origin', featureBaseSha: base, integrationBranch: integration, releaseBranch: release }] };
  const core = await CurrentCore.at(context);
  const request = (operation, input = {}, operationId) => core.execute({ operation, input, operationId });
  await request('run.start', { runId: 'run-one', implementers: ['implementer-one'],
    ...(rigor === 'light' ? { rigor: { value: 'light', authority: { ...human, instruction: 'Light for this one.' }, reason: 'Small change' } } : {}) }, 'start');
  if (rigor === 'light') {
    await request('human.decide', { kind: 'authorize-implementation', subject: (await core.commitments()).subject, authority: { ...human, instruction: 'The brief looks right.' }, reason: 'Confirmed brief', consequences: 'May implement' }, 'authorize');
  } else {
    const design = await core.store.capture('design.md');
    await request('human.decide', { kind: 'approve-design', subject: design.hash, authority: { ...human, instruction: 'Design approved.' }, reason: 'Approved', consequences: 'Spec' }, 'design');
    await request('spec.validate', {}, 'spec');
    await request('human.decide', { kind: 'authorize-implementation', subject: (await core.commitments()).subject, authority: { ...human, instruction: 'Implement it.' }, reason: 'Approved scope', consequences: 'May implement' }, 'authorize');
  }
  const f = { root, repo, home, base, context, core, request, rigor, integration, release, criteria: rigor === 'light' ? ['brief'] : ['R1'] };
  f.gh = github(f);
  return f;
}
// Commit a change on a branch and publish it to the fixture remote.
async function branchWith(f, branch, content) {
  await git(f.repo, ['checkout', '-B', branch]);
  await writeFile(join(f.repo, 'app.js'), content);
  await git(f.repo, ['add', 'app.js']); await git(f.repo, ['commit', '-m', `change on ${branch}`]);
  await git(f.repo, ['push', '--force', 'origin', `HEAD:refs/heads/${branch}`]);
  return (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
}
async function candidate(f, scope, head, operationId = `candidate-${scope}`) {
  const target = (await git(f.repo, ['ls-remote', 'origin', `refs/heads/${f.release}`])).split(/\s/u)[0];
  const integrationTip = (await git(f.repo, ['ls-remote', 'origin', `refs/heads/${f.integration}`])).split(/\s/u)[0];
  return f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.base, head, target: scope === 'FEATURE' ? target : integrationTip }], scope, criteria: f.criteria }, operationId);
}
// Stateful GitHub CLI double. Merge pushes the reviewed head to the base branch.
function github(f) {
  const host = { pr: null, calls: [], merge: null };
  f.core.runtime.gh = async (root, args) => {
    const command = args[1], pr = host.pr;
    if (command === 'view') return JSON.stringify({ ...pr, url: 'https://github.com/fixture/project/pull/12',
      mergeCommit: pr.state === 'MERGED' ? { oid: pr.headRefOid } : null });
    host.calls.push(command);
    if (command === 'edit') pr.body = args[args.indexOf('--body') + 1];
    if (command === 'ready') pr.isDraft = args.includes('--undo');
    if (command === 'merge') {
      if (host.merge) return host.merge(root, args);
      await git(root, ['push', 'origin', `HEAD:refs/heads/${pr.baseRefName}`]); pr.state = 'MERGED';
    }
    return '';
  };
  return host;
}
function openPr(f, headBranch, baseBranch, head, body = 'Change description.') {
  f.gh.pr = { number: 12, state: 'OPEN', isDraft: true, headRefName: headBranch, baseRefName: baseBranch, headRefOid: head,
    baseRefOid: f.base, body, mergeStateStatus: 'CLEAN', reviewDecision: '' };
}
function evaluator(f, { summary = 'Fixture assessment: the change exports 42.' } = {}) {
  f.core.runtime.evaluator = {
    async describe() { return { provider: 'codex', model: 'fixture', reasoningEffort: 'high' }; },
    async runStage(request) {
      const output = { verdicts: request.input.gates.map(id => ({ gate: id, outcome: 'PASS', summary,
        ...(id === 'review' ? { dimensions: ['code', 'requirements', 'evidence', 'scope', 'findings'].map(name => ({ name, outcome: 'PASS', evidence: 'Fixture source and receipts' })) } : {}),
        criteria: request.input.criteria.map(row => ({ id: row, outcome: 'PASS', evidence: 'app/app.js exports 42' })),
        coverage: { complete: true, paths: ['app/app.js'], interactions: ['app/app.js'], limitations: [] }, findings: [], dispositions: [], historyAssessment: null })) };
      return { schemaVersion: 1, protocolVersion: request.protocolVersion, stageId: request.stage.id, status: 'completed', output, receipt: { schemaVersion: 1, kind: 'gatereeve-agent-workflow-receipt',
        protocolVersion: request.protocolVersion, module: request.module, stage: request.stage.id, capabilityProfile: request.capabilityProfile, startedAt: '2026-11-16T00:00:00Z', completedAt: '2026-11-16T00:00:01Z',
        status: 'completed', runId: request.runId, attemptId: request.attemptId, isolation: { method: 'test-isolated', freshContext: true, inheritedTurns: 0 },
        provider: { id: 'codex', adapterVersion: '1.0.0', reasoningEffort: 'high', model: 'fixture', contextId: 'reviewer-fresh' },
        digests: { input: sha256Digest(request.input), instructions: sha256Digest(request.instructions), output: sha256Digest(output), snapshot: request.snapshotDigest },
        policy: { repositoryAccess: 'read-only', networkAccess: 'deny', scratch: 'isolated' } } };
    },
  };
}
async function accepted(f) {
  await f.request('candidate.ready', {}, 'ready');
  const refs = [...(await f.request('gate.execute', { gates: ['verification'], configuration: { validation: { kind: 'alternative', reason: 'Fixture has no hosted CI', scope: 'The approved criterion' },
    checks: [{ repository: 'app', command: process.execPath, args: ['-e', 'process.exit(0)'], purpose: 'Fixture verification' }] } }, 'verify')).event.payload.results];
  evaluator(f);
  refs.push(...(await f.request('gate.execute', { gates: ['review'], configuration: reviewConfig }, 'review')).event.payload.results);
  refs.push(...(await f.request('gate.execute', { gates: ['context'] }, 'context')).event.payload.results);
  await f.request('gate.execute', { gates: ['packet'], consumed: refs }, 'packet');
  const check = await f.request('milestone.check', { name: 'acceptance' });
  assert.equal(check.allowed, true, check.missing.join('; '));
  await f.request('milestone.pass', { name: 'acceptance' }, 'acceptance');
  return (await f.request('status')).candidate.hash;
}
// A FEATURE candidate from the integration branch, accepted and ready for a release PR.
async function finalPr(f) {
  const head = await branchWith(f, f.integration, 'export const answer = 42;\n');
  await candidate(f, 'FEATURE', head);
  openPr(f, f.integration, f.release, head);
  return { head, subject: await accepted(f) };
}
const authorizeMerge = (f, subject, action, operationId = 'authorize-merge') => f.request('human.decide', { kind: 'accept', subject, actions: ['authorize-merge'], action,
  authority: human, reason: 'Per-PR release instruction', consequences: 'Merge the reviewed final PR into the release branch' }, operationId);

test('delivery pairing: SLICE targets integration; only FEATURE integration -> release targets release', async t => {
  const f = await fixture(t);
  const slice = await branchWith(f, 'topic', 'export const answer = 42;\n');
  await candidate(f, 'SLICE', slice, 'slice');
  openPr(f, 'topic', f.integration, slice);
  const action = await f.request('merge.prepare', { repository: 'app', number: 12 });
  assert.equal(action.deliveryTarget, 'integration'); assert.equal(action.baseBranch, f.integration);
  openPr(f, 'topic', f.release, slice);
  await assert.rejects(f.request('merge.prepare', { repository: 'app', number: 12 }), /SLICE PR must target the integration branch feature-int/);
  openPr(f, 'topic', 'unconfigured', slice);
  await assert.rejects(f.request('merge.prepare', { repository: 'app', number: 12 }), /SLICE PR must target the integration branch/);
  // A FEATURE candidate from a slice branch is not the final PR, whatever its base.
  await candidate(f, 'FEATURE', slice, 'feature-from-slice');
  for (const target of [f.integration, f.release]) {
    openPr(f, 'topic', target, slice);
    await assert.rejects(f.request('merge.prepare', { repository: 'app', number: 12 }), /only the FEATURE PR from the integration branch feature-int to the release branch main/);
  }
  // The final PR's head is the integration branch itself.
  const final = await branchWith(f, f.integration, 'export const answer = 42; // final\n');
  await candidate(f, 'FEATURE', final, 'feature-final');
  openPr(f, f.integration, f.release, final);
  const release = await f.request('merge.prepare', { repository: 'app', number: 12 });
  assert.equal(release.deliveryTarget, 'release'); assert.equal(release.headBranch, f.integration); assert.equal(release.head, final);
  // The integration branch cannot deliver a SLICE into release, nor release into integration.
  await candidate(f, 'SLICE', final, 'slice-from-integration');
  await assert.rejects(f.request('merge.prepare', { repository: 'app', number: 12 }), /SLICE PR must target the integration branch/);
  assert.throws(() => deliveryTarget(f.context.repositories[0], 'SLICE', f.release, f.integration), /SLICE PR must target/);
  assert.throws(() => deliveryTarget(f.context.repositories[0], 'FEATURE', f.release, f.integration), /only the FEATURE PR/);
  assert.deepEqual(f.gh.calls, []);
});

test('integration == release: any scope targets release and no standing authority exists', async t => {
  const f = await fixture(t, { integration: 'main', release: 'main' });
  const head = await branchWith(f, 'topic', 'export const answer = 42;\n');
  await candidate(f, 'SLICE', head);
  openPr(f, 'topic', 'main', head);
  assert.equal((await f.request('merge.prepare', { repository: 'app', number: 12 })).deliveryTarget, 'release');
  for (const actions of [['accept'], ['accept', 'authorize-merge']]) {
    await assert.rejects(f.request('human.decide', { kind: 'authorize-standing', subject: (await f.core.commitments()).subject,
      scope: { actions, candidateScopes: ['SLICE'], repositories: [{ alias: 'app', headPrefix: 'topic', baseBranch: 'main', ...(actions.length > 1 ? { methods: ['merge'] } : {}) }], expiresAt: null },
      authority: { ...human, instruction: 'Merge the slices overnight.' }, reason: 'Unattended', consequences: 'Slices merge' }, `standing-${actions.length}`), /same branch \(main\); no standing acceptance or merge authority exists/);
  }
});

test('standing grants: new release grants are refused; existing ones are reported and never authorize', async t => {
  const f = await fixture(t);
  const scope = baseBranch => ({ actions: ['accept', 'authorize-merge'], candidateScopes: ['SLICE', 'FEATURE'],
    repositories: [{ alias: 'app', headPrefix: 'topic', baseBranch, methods: ['merge'] }], expiresAt: null });
  const { subject } = await f.core.commitments();
  const grant = baseBranch => ({ kind: 'authorize-standing', subject, scope: scope(baseBranch),
    authority: { ...human, instruction: 'Merge the slices overnight.' }, reason: 'Unattended slices', consequences: 'Slices merge into integration' });
  await assert.rejects(f.request('human.decide', grant(f.release), 'release-grant'), /names the release branch main; release merges need a per-PR human authorize-merge/);
  const slice = await f.request('human.decide', grant(f.integration), 'integration-grant');
  assert.equal(slice.event.payload.scope.repositories[0].baseBranch, f.integration);
  // A grant recorded before this rule names the release branch. Its record is retained.
  const { state } = await f.core.state();
  const legacy = await captureStanding(f.core, state, grant(f.integration));
  legacy.scope.repositories[0].baseBranch = f.release;
  const recorded = await f.core.append(state, 'DECIDED', { ...legacy, requestId: 'legacy-grant' }, { id: 'legacy-grant', hash: identity(legacy) });
  const final = await finalPr(f);
  const action = await f.request('merge.prepare', { repository: 'app', number: 12 });
  assert.equal(action.deliveryTarget, 'release');
  const status = await f.request('status');
  const reported = status.standingAuthorizations.find(item => item.grant === recorded.event.hash);
  assert.equal(reported.allowed, false); assert.equal(reported.namesReleaseBranch, true);
  assert.match(reported.reason, /names the release branch main/);
  assert.equal(status.standingAuthorizations.find(item => item.grant === slice.event.hash).namesReleaseBranch, false);
  await assert.rejects(f.request('authorization.apply', { grant: recorded.event.hash, action }, 'apply-legacy'), /names the release branch/);
  // Even a forged application of it qualifies for neither acceptance nor merge.
  const current = (await f.core.state()).state;
  await f.core.append(current, 'DECIDED', { kind: 'accept', subject: final.subject, authority: legacy.authority, reason: legacy.reason, consequences: legacy.consequences,
    standingGrant: recorded.event.hash, actions: ['authorize-merge'], action, requestId: 'forged-application' }, { id: 'forged-application', hash: identity(action) });
  const forged = (await f.core.state()).state;
  const selected = await f.core.store.json(forged.candidate);
  assert.deepEqual(await qualifyingDecisions(f.core, forged, 'authorize-merge', final.subject, selected), []);
  assert.deepEqual(await qualifyingDecisions(f.core, forged, 'accept', final.subject, selected), []);
  const merge = await f.request('milestone.check', { name: 'merge' });
  assert.ok(merge.missing.includes('explicit merge authorization')); assert.ok(merge.missing.includes('current human acceptance'));
  await assert.rejects(f.request('merge.execute', { repository: 'app', number: 12 }, 'forged-merge'), /blocked/);
  assert.deepEqual(f.gh.calls, []);
});

for (const rigor of ['full', 'light']) test(`per-PR human authorize-merge lets the agent merge the FEATURE PR into release (${rigor})`, async t => {
  const f = await fixture(t, { rigor });
  const { head, subject } = await finalPr(f);
  const action = await f.request('merge.prepare', { repository: 'app', number: 12 });
  assert.equal(action.deliveryTarget, 'release');
  assert.deepEqual([action.headBranch, action.baseBranch, action.head], [f.integration, f.release, head]);
  // R9: authorization needs the current review summary on the PR first.
  await assert.rejects(authorizeMerge(f, subject, action, 'too-early'), /does not carry the current independent review summary for head/);
  const published = await f.request('review.publish', { repository: 'app', number: 12 }, 'publish');
  assert.equal(published.changed, true); assert.equal(published.head, head); assert.equal(published.outcome, 'PASS');
  assert.match(f.gh.pr.body, /^Change description\.\n\n<!-- gatereeve:review-summary:start -->/u);
  assert.match(f.gh.pr.body, new RegExp(`Reviewed head:\\*\\* \`app\` \`${head}\``, 'u'));
  assert.match(f.gh.pr.body, rigor === 'light' ? /light rigor, brief basis/ : /full rigor, rubric basis/);
  await authorizeMerge(f, subject, action);
  await f.request('merge.execute', { repository: 'app', number: 12 }, 'merge');
  assert.deepEqual(f.gh.calls, ['edit', 'ready', 'checks', 'merge']);
  const status = await f.request('status');
  assert.equal(status.integrations.app.branch, f.release); assert.equal(status.integrations.app.integrationSha, head);
  assert.equal(status.dials.rigor.value, rigor);
});

test('a hosting-rule merge refusal is an external blocker, not a gate failure', async t => {
  const f = await fixture(t, { rigor: 'light' });
  const { subject } = await finalPr(f);
  const action = await f.request('merge.prepare', { repository: 'app', number: 12 });
  await f.request('review.publish', { repository: 'app', number: 12 }, 'publish');
  await authorizeMerge(f, subject, action);
  f.gh.merge = async () => {
    Object.assign(f.gh.pr, { mergeStateStatus: 'BLOCKED', reviewDecision: 'REVIEW_REQUIRED' });
    throw Object.assign(new Error('Command failed: gh pr merge'), { code: 1, stdout: '',
      stderr: 'X Pull request #12 is not mergeable: the base branch policy prohibits the merge.\n' });
  };
  let blocked;
  await assert.rejects(f.request('merge.execute', { repository: 'app', number: 12 }, 'blocked'), error => { blocked = error; return true; });
  assert.equal(blocked.code, 'EXTERNAL_BLOCKER');
  assert.match(blocked.message, /external blocker, not a gate failure/);
  assert.equal(blocked.details.blocker, 'required-review'); assert.equal(blocked.details.gateFailure, false); assert.equal(blocked.details.recorded, true);
  assert.equal(failureResult('merge.execute', blocked).error.code, 'EXTERNAL_BLOCKER');
  assert.equal(f.gh.pr.isDraft, true); // the draft this invocation promoted is restored
  let status = await f.request('status');
  assert.equal(status.externalBlocker.blocker, 'required-review'); assert.equal(status.externalBlocker.baseBranch, f.release);
  assert.equal(status.externalBlockers.length, 1);
  assert.deepEqual(status.integrations, {});
  // Proof and authority are untouched: the merge milestone has no gate failure.
  const merge = await f.request('milestone.check', { name: 'merge' });
  assert.equal(merge.allowed, true, merge.missing.join('; '));
  assert.ok(merge.outcomes.every(item => !item.required || item.outcome === 'PASS'));
  const resumed = await f.request('delivery.resume', { merge: { repository: 'app', number: 12 } }, 'resume');
  assert.equal(resumed.status, 'external-blocker'); assert.equal(resumed.blocker.blocker, 'required-review');
  assert.equal((await f.request('status')).externalBlockers.length, 2);
  // Once the host rule is satisfied, the same authorization merges and clears the blocker.
  f.gh.merge = null; Object.assign(f.gh.pr, { mergeStateStatus: 'CLEAN', reviewDecision: 'APPROVED' });
  await f.request('merge.execute', { repository: 'app', number: 12 }, 'after-approval');
  status = await f.request('status');
  assert.equal(status.externalBlocker, null); assert.equal(status.integrations.app.branch, f.release);
});

test('only an unmerged, hosting-rule refusal is classified as an external blocker', async () => {
  const action = { number: 12, ownerRepo: 'fixture/project', head: 'a'.repeat(40) };
  const view = fields => async () => JSON.stringify({ number: 12, state: 'OPEN', headRefOid: action.head, mergeStateStatus: 'CLEAN', reviewDecision: 'APPROVED', ...fields });
  const failure = stderr => Object.assign(new Error('Command failed'), { stderr });
  assert.equal((await externalBlocker(view({ mergeStateStatus: 'BLOCKED' }), '/r', action, failure('')))?.blocker, 'branch-policy');
  // A pending review decision classifies only when the host reports the PR
  // BLOCKED or the refusal names the review rule (S3 N2).
  assert.equal((await externalBlocker(view({ reviewDecision: 'CHANGES_REQUESTED', mergeStateStatus: 'BLOCKED' }), '/r', action, failure('')))?.blocker, 'required-review');
  assert.equal((await externalBlocker(view({ reviewDecision: 'REVIEW_REQUIRED', mergeStateStatus: 'BLOCKED' }), '/r', action, failure('')))?.blocker, 'required-review');
  assert.equal((await externalBlocker(view({}), '/r', action, failure('GraphQL: At least 1 approving review is required by reviewers with write access.')))?.blocker, 'required-review');
  assert.equal((await externalBlocker(view({}), '/r', action, failure('Repository rule violations found')))?.blocker, 'branch-policy');
  for (const [name, run, error] of [
    ['transport failure', view({}), failure('HTTP 502: Bad Gateway')],
    ['merged despite lost response', view({ state: 'MERGED', mergeStateStatus: 'BLOCKED' }), failure('the base branch policy prohibits the merge')],
    ['changed head', view({ headRefOid: 'b'.repeat(40), mergeStateStatus: 'BLOCKED' }), failure('')],
    ['unreadable PR', async () => { throw new Error('HTTP 401'); }, failure('the base branch policy prohibits the merge')],
    // A conflict (or any other failure) on a PR that also awaits review keeps its original error.
    ['conflict while review is required', view({ mergeStateStatus: 'DIRTY', reviewDecision: 'REVIEW_REQUIRED' }), failure('X Pull request #12 is not mergeable: the merge commit cannot be cleanly created.')],
    ['conflict while changes are requested', view({ mergeStateStatus: 'DIRTY', reviewDecision: 'CHANGES_REQUESTED' }), failure('GraphQL: Pull Request is not mergeable (mergePullRequest)')],
    ['unknown failure while review is required', view({ mergeStateStatus: 'UNKNOWN', reviewDecision: 'REVIEW_REQUIRED' }), failure('')],
    ['clean PR awaiting review', view({ reviewDecision: 'CHANGES_REQUESTED' }), failure('')],
  ]) assert.equal(await externalBlocker(run, '/r', action, error), null, name);
});

test('review publication writes and replaces one section idempotently and refuses without a current review', async t => {
  const f = await fixture(t);
  const head = await branchWith(f, 'topic', 'export const answer = 42;\n');
  await candidate(f, 'SLICE', head);
  openPr(f, 'topic', f.integration, head, 'Intro text.');
  await assert.rejects(f.request('review.publish', { repository: 'app', number: 12 }, 'no-review'), /No current independent review result for this candidate head/);
  assert.deepEqual(f.gh.calls, []);
  await accepted(f);
  const first = await f.request('review.publish', { repository: 'app', number: 12 }, 'publish-1');
  assert.equal(first.changed, true);
  const body = f.gh.pr.body;
  assert.equal(body, `Intro text.\n\n${first.section}\n`);
  assert.equal(publishedSection(body), first.section);
  assert.equal(body.split(SUMMARY_START).length, 2); assert.equal(body.split(SUMMARY_END).length, 2);
  const again = await f.request('review.publish', { repository: 'app', number: 12 }, 'publish-2');
  assert.equal(again.changed, false); assert.deepEqual(f.gh.calls, ['edit']);
  // A stale or hand-edited section is replaced in place; surrounding text is kept (CRLF tolerated).
  f.gh.pr.body = `Intro text.\r\n\r\n${SUMMARY_START}\r\nstale summary\r\n${SUMMARY_END}\r\n\r\nOutro text.`;
  await f.request('review.publish', { repository: 'app', number: 12 }, 'publish-3');
  assert.equal(f.gh.pr.body, `Intro text.\n\n${first.section}\n\nOutro text.`);
  f.gh.pr.body = `${SUMMARY_START}\n${SUMMARY_START}\n${SUMMARY_END}`;
  await assert.rejects(f.request('review.publish', { repository: 'app', number: 12 }, 'damaged'), /repeated or unbalanced/);
  f.gh.pr.body = 'Intro text.'; f.gh.pr.headRefOid = f.base;
  await assert.rejects(f.request('review.publish', { repository: 'app', number: 12 }, 'other-head'), /differs from the reviewed candidate head/);
  f.gh.pr.headRefOid = head;
  // Merge authorization is refused without, or with a stale copy of, the current summary.
  const action = await f.request('merge.prepare', { repository: 'app', number: 12 });
  const subject = (await f.request('status')).candidate.hash;
  await assert.rejects(authorizeMerge(f, subject, action, 'no-summary'), /does not carry the current independent review summary/);
  f.gh.pr.body = withSummary('Intro text.', first.section.replace('Outcome:** PASS', 'Outcome:** FAIL'));
  await assert.rejects(authorizeMerge(f, subject, action, 'stale-summary'), /does not carry the current independent review summary/);
  await f.request('review.publish', { repository: 'app', number: 12 }, 'publish-4');
  await authorizeMerge(f, subject, action, 'with-summary');
  assert.equal((await f.request('milestone.check', { name: 'merge' })).allowed, true);
});

test('publication presents the latest qualifying review, even when it is UNAVAILABLE, and authorization matches', async t => {
  const f = await fixture(t);
  const head = await branchWith(f, 'topic', 'export const answer = 42;\n');
  await candidate(f, 'SLICE', head);
  openPr(f, 'topic', f.integration, head, 'Intro text.');
  await f.request('candidate.ready', {}, 'ready');
  await f.request('gate.execute', { gates: ['verification'], configuration: { validation: { kind: 'alternative', reason: 'Fixture has no hosted CI', scope: 'The approved criterion' },
    checks: [{ repository: 'app', command: process.execPath, args: ['-e', 'process.exit(0)'], purpose: 'Fixture verification' }] } }, 'verify');
  evaluator(f);
  await f.request('gate.execute', { gates: ['review'], configuration: reviewConfig }, 'review-pass');
  const passed = await f.request('review.publish', { repository: 'app', number: 12 }, 'publish-pass');
  assert.equal(passed.outcome, 'PASS');
  // A newer review reaches no conclusion: it is what the gate now sees, so it is what the PR shows.
  f.core.runtime.evaluator.runStage = async () => { throw new Error('Evaluator output was malformed'); };
  // A different declared configuration (explicit effort) runs a fresh review instead of reusing the PASS.
  await f.request('gate.execute', { gates: ['review'], configuration: { ...reviewConfig, reasoningEffort: 'high' } }, 'review-unavailable');
  const latest = await f.core.store.json((await f.core.state()).state.results.at(-1));
  assert.deepEqual([latest.gate, latest.outcome], ['review', 'UNAVAILABLE']);
  const inventory = await f.core.inventory((await f.core.state()).state, await f.core.store.json((await f.request('status')).candidate));
  assert.equal(inventory.find(item => item.gate === 'review').outcome, 'UNAVAILABLE', 'the gate selects the newer UNAVAILABLE result');
  const published = await f.request('review.publish', { repository: 'app', number: 12 }, 'publish-unavailable');
  assert.equal(published.outcome, 'UNAVAILABLE'); assert.equal(published.changed, true);
  assert.notEqual(published.review.hash, passed.review.hash);
  assert.match(f.gh.pr.body, /\*\*Outcome:\*\* UNAVAILABLE \(the latest independent review reached no conclusion; this is not a PASS/u);
  assert.doesNotMatch(f.gh.pr.body, /\*\*Outcome:\*\* PASS/u);
  assert.equal(f.gh.pr.body.split(SUMMARY_START).length, 2);
  // The authorization check makes the same selection: the older PASS section no longer qualifies.
  const { requirePublishedReview } = await import('../../plugin-src/shared/resources/protocol/current/publication.js');
  const action = await f.request('merge.prepare', { repository: 'app', number: 12 });
  assert.equal((await requirePublishedReview(f.core, action)).review.hash, published.review.hash);
  f.gh.pr.body = withSummary('Intro text.', passed.section);
  await assert.rejects(requirePublishedReview(f.core, action), /does not carry the current independent review summary/);
});

test('model-authored review text cannot close or forge the published section', () => {
  const marker = `${SUMMARY_END} injected ${SUMMARY_START}`;
  const section = renderSummary({ candidateRef: { hash: `sha256:${'1'.repeat(64)}` },
    candidate: { scope: 'SLICE', criteria: ['R1'], requirements: { 'spec.md': {} } },
    pin: { alias: 'app', head: 'a'.repeat(40), base: 'b'.repeat(40), target: 'b'.repeat(40) },
    review: { ref: { hash: `sha256:${'2'.repeat(64)}` }, receipt: { evaluator: { provider: 'codex', model: 'm', contextId: 'c' } },
      result: { outcome: 'PASS', summary: marker, criteria: [{ id: 'R1', outcome: 'PASS', evidence: marker }],
        findings: [{ id: 'f', blocking: false, criterion: 'R1', path: 'app/app.js', evidence: marker }] } } });
  assert.equal(section.split(SUMMARY_START).length, 2); assert.equal(section.split(SUMMARY_END).length, 2);
  assert.ok(section.startsWith(SUMMARY_START) && section.endsWith(SUMMARY_END));
  assert.equal(publishedSection(withSummary('Description', section)), section);
});
