// Delegated autonomy (spec AC5, AC6 delegated parts; R7, R8 delegated paths):
// the protection precondition, the delegated-evaluator authority kind, delegated
// SLICE delivery, hand-back triggers, and tripwires under delegation.
import assert from 'node:assert/strict';
import { isolatedTests } from './helpers/isolated-tests.js';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DELEGATED_AUTHORITY } from '../../plugin-src/shared/resources/protocol/current/contracts.js';
import { briefScope } from '../../plugin-src/shared/resources/protocol/current/delegation.js';
import { currentSnapshot } from '../../plugin-src/shared/resources/protocol/current/adapter.js';
import { fixture, human, BRIEF, reviewConfig, authorizeBrief, branchWith, candidate, openPr, evaluator, gates, acceptanceMissing, delegate, assertDial, writeFullDocuments } from './helpers/lightweight-fixture.js';

const test = isolatedTests(import.meta.url);
const status = f => f.request('status');
const snapshot = f => currentSnapshot(f.context, {}, { gh: f.core.runtime.gh, entryPoints: { adapter: null, cli: null } });
const review = (f, artifact, operationId = `review-${artifact}`) => f.request('planning.review', { artifact, configuration: reviewConfig }, operationId);
const delegatedAuthority = (delegation, evaluation) => ({ kind: DELEGATED_AUTHORITY, delegation, evaluation });
const delegated = (f, kind, subject, delegation, evaluation, operationId = `delegated-${kind}`) => f.request('human.decide', { kind, subject,
  authority: delegatedAuthority(delegation, evaluation), reason: `Delegated ${kind} after independent PASS`, consequences: 'Proceeds without a live human approval' }, operationId);

test('delegation needs a human instruction naming the run and an observed protected release branch', async t => {
  const f = await fixture(t, { protection: { main: false } });
  await assert.rejects(f.request('run.set-dial', { dial: 'autonomy', value: 'delegated', actor: 'agent', reason: 'go', runId: 'run-one' }, 'agent'), /Only a human can delegate/);
  await assert.rejects(delegate(f, 'unprotected'), /Delegation is rejected: the release branch is not observed as protected on GitHub \(fixture\/project main\)/);
  f.gh.protection.main = undefined;
  await assert.rejects(delegate(f, 'missing'), /not observed as protected.*release branch not found/);
  f.gh.protection.main = 'error';
  await assert.rejects(delegate(f, 'unobservable'), /protection could not be observed for fixture\/project main/);
  assert.equal((await status(f)).dials.autonomy.value, 'supervised');
  f.gh.protection.main = true;
  const recorded = await delegate(f);
  assertDial(recorded.event.payload, { dial: 'autonomy', value: 'delegated', previous: 'supervised', source: 'explicit', actor: 'human', runId: 'run-one' });
  assert.equal(recorded.event.payload.authority.instruction, 'Finish run-one yourself and give me a PR.');
  assert.deepEqual(recorded.event.payload.protection.map(item => ({ ...item, observedAt: undefined })),
    [{ repository: 'app', ownerRepo: 'fixture/project', branch: 'main', source: 'GET repos/fixture/project/branches/main', protected: true, observedAt: undefined }]);
  assert.ok(f.gh.apiCalls.every(call => call === 'api --method GET repos/fixture/project/branches/main'));
  const current = await status(f);
  assert.equal(current.delegation.active, true); assert.equal(current.delegation.event, recorded.event.hash);
  assert.deepEqual(current.delegation.handBackTriggers, ['amend', 'agent', 'external-blocker', 'protection-lost']);
  assert.match(current.delegation.scope[0].delegatedMerges, /SLICE PRs into feature-int/);
  assert.deepEqual((await snapshot(f)).dials, { rigor: 'light', autonomy: 'delegated' });
});

test('delegation at run start records protection; without it no run is created', async t => {
  const choice = { value: 'delegated', authority: { ...human, instruction: 'Delegate run-one.' }, reason: 'Issue fix' };
  const f = await fixture(t, { rigor: 'full', autonomy: choice, authorize: false });
  const dial = (await status(f)).dials.autonomy;
  assertDial(dial, { value: 'delegated', source: 'explicit', actor: 'human', runId: 'run-one' });
  assert.equal(dial.protection[0].protected, true);
  await assert.rejects(fixture(t, { rigor: 'full', autonomy: choice, authorize: false, protection: { main: false } }), /Delegation is rejected/);
  // integration == release: delegation is possible but grants no delegated merges.
  const same = await fixture(t, { integration: 'main', release: 'main', authorize: false });
  await delegate(same);
  assert.match((await status(same)).delegation.scope[0].delegatedMerges, /^none/);
});

test('delegated planning decisions need a qualifying independent PASS and are reported as delegated-evaluator', async t => {
  const f = await fixture(t, { rigor: 'full', authorize: false });
  const design = await f.core.store.capture('design.md');
  const fake = `sha256:${'1'.repeat(64)}`;
  // Not delegated: the delegated authority kind is refused.
  evaluator(f);
  const designPass = await review(f, 'design', 'design-review-supervised');
  await assert.rejects(delegated(f, 'approve-design', design.hash, fake, designPass.event.hash, 'not-delegated'), /requires delegated autonomy; this run is supervised/);
  const delegation = (await delegate(f)).event.hash;
  await assert.rejects(delegated(f, 'approve-design', design.hash, fake, designPass.event.hash, 'stale-delegation'), /cite the current delegation event/);
  await assert.rejects(delegated(f, 'approve-design', design.hash, delegation, fake, 'no-review'), /needs an independent design review/);
  // A later FAIL of the same design supersedes the earlier PASS.
  evaluator(f, { planning: 'FAIL' });
  const designFail = await review(f, 'design', 'design-review-fail');
  assert.equal(designFail.event.payload.outcome, 'FAIL');
  await assert.rejects(delegated(f, 'approve-design', design.hash, delegation, designFail.event.hash, 'cites-fail'), /is FAIL, not PASS/);
  await assert.rejects(delegated(f, 'approve-design', design.hash, delegation, designPass.event.hash, 'superseded'), /later design review of the same identity supersedes/);
  // A reviewer that is an implementing context does not qualify.
  evaluator(f, { contextId: 'implementer-one' });
  await assert.rejects(review(f, 'design', 'implementer-review'), /inherited an implementing context/);
  // Only planning decisions can be delegated this way.
  await assert.rejects(f.request('human.decide', { kind: 'amend', subject: design.hash, previousSubject: design.hash, authority: delegatedAuthority(delegation, designPass.event.hash), reason: 'x', consequences: 'y' }, 'amend'),
    /Delegated authority covers only approve-design and authorize-implementation/);
  const runs = evaluator(f);
  const approved = await review(f, 'design', 'design-review-pass');
  assert.equal(runs[0].stage.id, 'planning-review'); assert.equal(runs[0].input.artifact, 'design');
  assert.deepEqual(runs[0].input.documents.map(item => item.path), ['requirements/design.md', 'requirements/interview.md']);
  const designDecision = await delegated(f, 'approve-design', design.hash, delegation, approved.event.hash);
  const authority = designDecision.event.payload.authority;
  assert.equal(authority.kind, 'delegated-evaluator'); assert.equal(authority.basis, 'planning-review');
  assert.equal(authority.delegation.event, delegation); assert.equal(authority.delegation.authority.instruction, 'Finish run-one yourself and give me a PR.');
  assert.equal(authority.evaluation.event, approved.event.hash); assert.equal(authority.evaluation.evaluator.contextId, 'reviewer-fresh');
  await f.request('spec.validate', {}, 'spec');
  const { subject } = await f.core.commitments();
  // A design review is not a spec review.
  await assert.rejects(delegated(f, 'authorize-implementation', subject, delegation, approved.event.hash, 'wrong-artifact'), /needs an independent spec review/);
  await assert.rejects(review(f, 'brief', 'brief-on-full'), /brief review applies to a light run/);
  const specPass = await review(f, 'spec');
  assert.deepEqual(runs.at(-1).input.documents.map(item => item.path), ['requirements/design.md', 'requirements/spec.md', 'requirements/plan.md', 'requirements/issues.md']);
  await delegated(f, 'authorize-implementation', subject, delegation, specPass.event.hash);
  const current = await status(f);
  assert.equal(current.phase, 'IMPLEMENTING');
  assert.deepEqual(current.delegation.decisions.map(item => [item.kind, item.basis]), [['approve-design', 'planning-review'], ['authorize-implementation', 'planning-review']]);
  assert.ok(current.decisions.every(item => item.authority.kind === 'delegated-evaluator'));
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, true);
  // After a hand-back the delegated implementation authority no longer counts;
  // the human re-authorizes the unchanged commitments in place.
  await f.request('run.set-dial', { dial: 'autonomy', value: 'supervised', actor: 'agent', reason: 'Unsure' }, 'hand-back');
  const voided = await f.request('milestone.check', { name: 'implementation' });
  assert.equal(voided.allowed, false); assert.deepEqual(voided.missing, ['current implementation authorization']);
  await f.request('human.decide', { kind: 'authorize-implementation', subject, authority: { ...human, instruction: 'Carry on with run-one.' }, reason: 'Human resumes', consequences: 'May implement' }, 'human-reauthorize');
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, true);
});

test('brief scope covers everything except the findings section', () => {
  const brief = '# Brief\nPreamble.\n\n## Goal\nExport 42.\n\n## Scope\n### In scope\napp.js\n### Out of scope\nbilling\n\n## Approach\nSmall edit.\n\n## Findings log\n- none\n### Notes\n- nested\n\n## Risks\nNone.\n';
  const same = briefScope(Buffer.from(brief));
  for (const [label, changed] of [
    ['in-scope sub-heading', brief.replace('### In scope\napp.js', '### In scope\napp.js and billing.js')],
    ['out-of-scope removed', brief.replace('### Out of scope\nbilling\n', '')],
    ['other section', brief.replace('Small edit.', 'Rewrite the module.')],
    ['preamble', brief.replace('Preamble.', 'Preamble covering billing too.')],
    ['section after findings', brief.replace('## Risks\nNone.', '## Risks\nMigrates data.')],
    ['new heading', `${brief}\n## Extra scope\nbilling\n`],
  ]) assert.notEqual(briefScope(Buffer.from(changed)), same, label);
  for (const [label, changed] of [
    ['findings entry', brief.replace('- none', '- none\n- Found: also exported elsewhere')],
    ['nested findings heading', brief.replace('- nested', '- nested\n#### Deeper\n- more')],
    ['whitespace', brief.replace('Export 42.', 'Export   42.  ')],
  ]) assert.equal(briefScope(Buffer.from(changed)), same, label);
});

test('light delegation: a brief review substitutes for the human; a goal or scope change hands back', async t => {
  const f = await fixture(t, { authorize: false });
  const delegation = (await delegate(f)).event.hash;
  evaluator(f);
  await assert.rejects(review(f, 'design', 'design-on-light'), /design review applies to a full run/);
  const first = await review(f, 'brief');
  await delegated(f, 'authorize-implementation', (await f.core.commitments()).subject, delegation, first.event.hash);
  assert.equal((await status(f)).phase, 'IMPLEMENTING');
  // The findings log may grow, even with nested headings; a new brief review re-authorizes delegated.
  await writeFile(join(f.home, 'brief.md'), `${BRIEF}- Found: nothing surprising.\n### Details\n- the constant is also exported elsewhere\n`);
  const second = await review(f, 'brief', 'review-brief-2');
  await delegated(f, 'authorize-implementation', (await f.core.commitments()).subject, delegation, second.event.hash, 'reauthorize');
  // A changed scope, even only under a sub-heading, is a scope-changing amendment: hand back and stop.
  await writeFile(join(f.home, 'brief.md'), BRIEF.replace('app.js only.', 'app.js only.\n### Also in scope\nThe billing service.'));
  const third = await review(f, 'brief', 'review-brief-3');
  await assert.rejects(delegated(f, 'authorize-implementation', (await f.core.commitments()).subject, delegation, third.event.hash, 'scope-change'), /scope-changing amendment: delegation is handed back to supervised/);
  const current = await status(f);
  assert.equal(current.dials.autonomy.value, 'supervised');
  assertDial(current.dials.autonomy, { source: 'automatic', actor: 'gatereeve', trigger: 'amend', previous: 'delegated' });
  assert.ok((await snapshot(f)).blockers.some(item => item.type === 'hand-back'));
  // The human can still authorize; that observed decision clears the stop.
  await authorizeBrief(f, 'human-authorize');
  assert.ok(!(await snapshot(f)).blockers.some(item => item.type === 'hand-back'));
});

test('hand-back voids delegated implementation authority until a human authorizes', async t => {
  const f = await fixture(t, { authorize: false });
  const delegation = (await delegate(f)).event.hash;
  evaluator(f);
  await delegated(f, 'authorize-implementation', (await f.core.commitments()).subject, delegation, (await review(f, 'brief')).event.hash);
  const head = await branchWith(f, 'topic', 'export const answer = 42;\n');
  await candidate(f, 'SLICE', head);
  await f.request('run.set-dial', { dial: 'autonomy', value: 'supervised', actor: 'agent', reason: 'Unsure about scope' }, 'hand-back');
  assert.deepEqual((await f.request('milestone.check', { name: 'implementation' })).missing, ['current implementation authorization']);
  await assert.rejects(candidate(f, 'SLICE', head, 'after-hand-back'), /Current implementation authority is required/);
  await assert.rejects(f.request('candidate.ready', {}, 'ready'), /Current implementation authority is required/);
  await assert.rejects(f.request('gate.execute', { gates: ['context'] }, 'context'), /Current implementation authorization is required/);
  const blocker = (await snapshot(f)).blockers.find(item => item.type === 'hand-back');
  assert.match(blocker.message, /need a human authorize-implementation/);
  await authorizeBrief(f, 'human-authorize');
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, true);
  await candidate(f, 'SLICE', head, 'after-human');
});

async function delegatedSlice(t, options = {}) {
  const f = await fixture(t, options);
  await delegate(f);
  const head = await branchWith(f, 'topic', 'export const answer = 42;\n');
  await candidate(f, 'SLICE', head);
  openPr(f, 'topic', f.integration, head);
  await gates(f);
  await f.request('milestone.pass', { name: 'acceptance' }, 'acceptance');
  const action = await f.request('merge.prepare', { repository: 'app', number: 12 });
  return { f, head, action };
}

test('delegated delivery: a fully passing SLICE PR into the integration branch is accepted and protected-merged', async t => {
  const { f, head, action } = await delegatedSlice(t);
  assert.equal(action.deliveryTarget, 'integration');
  await assert.rejects(f.request('delegation.apply', {}, 'no-action'), /needs the prepared SLICE merge action/);
  await assert.rejects(f.request('delegation.apply', { action }, 'unpublished'), /does not carry the current independent review summary/);
  await f.request('review.publish', { repository: 'app', number: 12 }, 'publish');
  const applied = await f.request('delegation.apply', { action }, 'apply');
  const accept = applied.event.payload;
  assert.equal(accept.kind, 'accept'); assert.deepEqual(accept.actions, ['authorize-merge']);
  assert.equal(accept.authority.kind, 'delegated-evaluator'); assert.equal(accept.authority.basis, 'required-gates');
  assert.ok(accept.authority.gates.every(item => item.outcome === 'PASS'));
  assert.equal((await f.request('milestone.check', { name: 'merge' })).allowed, true);
  await f.request('merge.execute', { repository: 'app', number: 12 }, 'merge');
  const current = await status(f);
  assert.equal(current.integrations.app.branch, f.integration); assert.equal(current.integrations.app.integrationSha, head);
  assert.equal(current.dials.autonomy.value, 'delegated');
  assert.ok(f.gh.apiCalls.length >= 3, 'protection is re-observed at delegation, application and merge');
});

test('delegation never authorizes a release merge or an incompletely passing slice', async t => {
  // FEATURE PR into the release branch.
  const f = await fixture(t);
  await delegate(f);
  const final = await branchWith(f, f.integration, 'export const answer = 42;\n');
  await candidate(f, 'FEATURE', final);
  openPr(f, f.integration, f.release, final);
  await gates(f);
  await f.request('milestone.pass', { name: 'acceptance' }, 'acceptance');
  const release = await f.request('merge.prepare', { repository: 'app', number: 12 });
  assert.equal(release.deliveryTarget, 'release');
  await f.request('review.publish', { repository: 'app', number: 12 }, 'publish');
  await assert.rejects(f.request('delegation.apply', { action: release }, 'release'), /only SLICE candidates; the FEATURE PR into the release branch needs a per-PR human authorize-merge/);
  await assert.rejects(f.request('merge.execute', { repository: 'app', number: 12 }, 'merge'), /blocked/);
  const resumed = await f.request('delivery.resume', { merge: { repository: 'app', number: 12 } }, 'resume');
  assert.equal(resumed.status, 'needs-attention');
  assert.deepEqual(f.gh.calls, ['edit']);

  // integration == release: a SLICE PR targets release, so no delegated merge exists.
  const same = await fixture(t, { integration: 'main', release: 'main' });
  await delegate(same);
  const head = await branchWith(same, 'topic', 'export const answer = 42;\n');
  await candidate(same, 'SLICE', head);
  openPr(same, 'topic', 'main', head);
  await gates(same);
  const action = await same.request('merge.prepare', { repository: 'app', number: 12 });
  assert.equal(action.deliveryTarget, 'release');
  await same.request('review.publish', { repository: 'app', number: 12 }, 'publish');
  await assert.rejects(same.request('delegation.apply', { action }, 'same'), /never authorizes a merge into the release branch/);

  // A slice without every required gate PASS.
  const partial = await fixture(t);
  await delegate(partial);
  const slice = await branchWith(partial, 'topic', 'export const answer = 42;\n');
  await candidate(partial, 'SLICE', slice);
  openPr(partial, 'topic', partial.integration, slice);
  await partial.request('candidate.ready', {}, 'ready');
  const prepared = await partial.request('merge.prepare', { repository: 'app', number: 12 });
  await assert.rejects(partial.request('delegation.apply', { action: prepared }, 'partial'), /every required gate/);
});

test('hand-back: an explicit agent hand-back stops delegated actions and voids delegated acceptance', async t => {
  const { f, action } = await delegatedSlice(t);
  await f.request('review.publish', { repository: 'app', number: 12 }, 'publish');
  await f.request('delegation.apply', { action }, 'apply');
  await assert.rejects(f.request('run.set-dial', { dial: 'autonomy', value: 'supervised', actor: 'agent' }, 'no-reason'), /reason/);
  const back = await f.request('run.set-dial', { dial: 'autonomy', value: 'supervised', actor: 'agent', reason: 'Unsure whether the change is in scope' }, 'hand-back');
  assertDial(back.event.payload, { value: 'supervised', previous: 'delegated', actor: 'agent', trigger: 'agent', source: 'explicit' });
  const merge = await f.request('milestone.check', { name: 'merge' });
  assert.ok(merge.missing.includes('explicit merge authorization') && merge.missing.includes('current human acceptance'));
  await assert.rejects(f.request('merge.execute', { repository: 'app', number: 12 }, 'merge'), /blocked/);
  await assert.rejects(f.request('delegation.apply', { action }, 'apply-again'), /requires delegated autonomy/);
  const shown = await snapshot(f);
  assert.equal(shown.dials.autonomy, 'supervised');
  assert.equal(shown.delegation.lastHandBack.trigger, 'agent');
  assert.ok(shown.blockers.some(item => item.type === 'hand-back' && /only a human can delegate again/.test(item.message)));
  assert.deepEqual(f.gh.calls, ['edit']);
});

test('hand-back: an amendment under delegation returns the run to supervised', async t => {
  const f = await fixture(t, { rigor: 'full' });
  const delegation = (await delegate(f)).event.hash;
  const previous = (await f.core.commitments()).subject;
  await writeFile(join(f.home, 'design.md'), '# Design\n\n**Status:** approved\n\nAlso export 43.\n');
  const recorded = await f.request('human.decide', { kind: 'amend', subject: (await f.core.commitments()).subject, previousSubject: previous,
    authority: { ...human, instruction: 'Amend run-one to export 43 too.' }, reason: 'Scope change', consequences: 'Re-validate' }, 'amend');
  assert.equal(recorded.event.payload.kind, 'amend');
  const current = await status(f);
  assertDial(current.dials.autonomy, { value: 'supervised', previous: 'delegated', trigger: 'amend', source: 'automatic' });
  assert.equal(current.delegation.active, false);
  const handBack = current.dialHistory.find(item => item.trigger === 'amend');
  assert.ok(handBack && current.decisions.at(-1).kind === 'amend');
  // Delegated planning is refused from here on.
  evaluator(f);
  const designPass = await review(f, 'design');
  await assert.rejects(delegated(f, 'approve-design', designPass.event.payload.subject, delegation, designPass.event.hash), /requires delegated autonomy/);
});

test('hand-back: an external merge blocker returns the run to supervised', async t => {
  const { f, action } = await delegatedSlice(t);
  await f.request('review.publish', { repository: 'app', number: 12 }, 'publish');
  await f.request('delegation.apply', { action }, 'apply');
  f.gh.merge = async () => {
    Object.assign(f.gh.pr, { mergeStateStatus: 'BLOCKED', reviewDecision: 'REVIEW_REQUIRED' });
    throw Object.assign(new Error('Command failed: gh pr merge'), { code: 1, stdout: '', stderr: 'At least 1 approving review is required by reviewers with write access.' });
  };
  let blocked;
  await assert.rejects(f.request('merge.execute', { repository: 'app', number: 12 }, 'blocked'), error => { blocked = error; return true; });
  assert.equal(blocked.code, 'EXTERNAL_BLOCKER'); assert.equal(blocked.details.handedBack, true);
  assert.match(blocked.message, /Delegation is handed back to supervised: stop for the human/);
  const current = await status(f);
  assertDial(current.dials.autonomy, { value: 'supervised', trigger: 'external-blocker', source: 'automatic', actor: 'gatereeve' });
  assert.equal(current.externalBlocker.blocker, 'required-review');
  // The delegated acceptance no longer authorizes even after the host rule clears.
  f.gh.merge = null; Object.assign(f.gh.pr, { mergeStateStatus: 'CLEAN', reviewDecision: 'APPROVED' });
  await assert.rejects(f.request('merge.execute', { repository: 'app', number: 12 }, 'retry'), /blocked/);
});

test('a hand-back that cannot be recorded after an external blocker fails closed', async t => {
  const { f, action } = await delegatedSlice(t);
  await f.request('review.publish', { repository: 'app', number: 12 }, 'publish');
  await f.request('delegation.apply', { action }, 'apply');
  f.gh.merge = async () => {
    Object.assign(f.gh.pr, { mergeStateStatus: 'BLOCKED', reviewDecision: 'REVIEW_REQUIRED' });
    throw Object.assign(new Error('Command failed: gh pr merge'), { code: 1, stdout: '', stderr: 'At least 1 approving review is required.' });
  };
  // The journal refuses the hand-back DIAL_SET; everything else is recorded.
  const append = f.core.append.bind(f.core);
  f.core.append = async (state, type, ...rest) => { if (type === 'DIAL_SET') throw new Error('disk full'); return append(state, type, ...rest); };
  let blocked;
  await assert.rejects(f.request('merge.execute', { repository: 'app', number: 12 }, 'blocked'), error => { blocked = error; return true; });
  f.core.append = append;
  assert.equal(blocked.code, 'EXTERNAL_BLOCKER');
  assert.equal(blocked.details.recorded, true); assert.equal(blocked.details.handedBack, false); assert.equal(blocked.details.handBackFailed, true);
  assert.match(blocked.message, /hand-back could not be recorded; the recorded blocker still voids delegated authority/);
  const current = await status(f);
  assert.equal(current.dials.autonomy.value, 'delegated');
  assert.equal(current.delegationBlocked, current.dials.autonomy.event);
  assert.ok((await snapshot(f)).blockers.some(item => item.type === 'hand-back' && /hand-back could not be recorded/.test(item.message)));
  // Delegated authority cannot be used again under this delegation.
  f.gh.merge = null; Object.assign(f.gh.pr, { mergeStateStatus: 'CLEAN', reviewDecision: 'APPROVED' });
  const merge = await f.request('milestone.check', { name: 'merge' });
  assert.ok(merge.missing.includes('explicit merge authorization'));
  await assert.rejects(f.request('merge.execute', { repository: 'app', number: 12 }, 'retry'), /blocked/);
  await assert.rejects(f.request('delegation.apply', { action }, 'apply-again'), /external merge blocker was recorded under this delegation/);
  assert.equal(current.integrations.app, undefined);
});

test('hand-back: release-branch protection lost before a delegated action', async t => {
  // Lost before the merge write.
  const { f, action } = await delegatedSlice(t);
  await f.request('review.publish', { repository: 'app', number: 12 }, 'publish');
  await f.request('delegation.apply', { action }, 'apply');
  f.gh.protection.main = false;
  await assert.rejects(f.request('merge.execute', { repository: 'app', number: 12 }, 'merge'), /protection was lost \(fixture\/project main\); delegation is handed back to supervised/);
  const current = await status(f);
  assertDial(current.dials.autonomy, { value: 'supervised', trigger: 'protection-lost', source: 'automatic' });
  assert.equal(current.dials.autonomy.observations[0].protected, false);
  assert.deepEqual(f.gh.calls, ['edit']);
  assert.deepEqual(current.integrations, {});

  // Lost before a delegated acceptance, and an unobservable state only refuses.
  const second = await delegatedSlice(t);
  await second.f.request('review.publish', { repository: 'app', number: 12 }, 'publish');
  second.f.gh.protection.main = 'error';
  await assert.rejects(second.f.request('delegation.apply', { action: second.action }, 'unobservable'), /could not be observed/);
  assert.equal((await status(second.f)).dials.autonomy.value, 'delegated');
  second.f.gh.protection.main = undefined;
  await assert.rejects(second.f.request('delegation.apply', { action: second.action }, 'lost'), /protection was lost/);
  assert.equal((await status(second.f)).dials.autonomy.trigger, 'protection-lost');

  // Lost before a delegated planning decision.
  const third = await fixture(t, { authorize: false });
  const delegation = (await delegate(third)).event.hash;
  evaluator(third);
  const brief = await review(third, 'brief');
  third.gh.protection.main = false;
  await assert.rejects(delegated(third, 'authorize-implementation', (await third.core.commitments()).subject, delegation, brief.event.hash), /protection was lost/);
  assert.equal((await status(third)).dials.autonomy.value, 'supervised');
  assert.equal((await status(third)).phase, 'DESIGNING');
});

test('tripwires under delegation escalate to full automatically and reject stay-light', async t => {
  // A hit at candidate preparation escalates at once.
  const f = await fixture(t);
  await delegate(f);
  const head = await branchWith(f, 'topic', { 'app.js': 'export const answer = 42;\n', '.env': 'TOKEN=1\n' });
  const prepared = await candidate(f, 'SLICE', head);
  assert.equal(prepared.tripwires.escalated, true);
  let current = await status(f);
  assertDial(current.dials.rigor, { value: 'full', previous: 'light', source: 'automatic', actor: 'gatereeve', trigger: 'tripwire', tripwires: prepared.tripwires.subject });
  assert.match(current.dials.rigor.reason, /secrets/);
  assert.equal(current.dials.autonomy.value, 'delegated');
  assert.equal(current.phase, 'DESIGNING');
  await assert.rejects(f.request('human.decide', { kind: 'stay-light', subject: prepared.tripwires.subject, authority: human, reason: 'x', consequences: 'y' }, 'stay'), /already full rigor/);

  // Delegated after a supervised hit: stay-light is rejected for anyone, and
  // the acceptance attempt escalates instead of passing.
  const g = await fixture(t);
  const hit = await branchWith(g, 'topic', { 'app.js': 'export const answer = 42;\n', 'db/schema.sql': 'CREATE TABLE t (id int);\n' });
  const before = await candidate(g, 'SLICE', hit);
  await gates(g);
  await delegate(g);
  assert.match(await acceptanceMissing(g), /under delegated autonomy a hit escalates the run to full rigor/);
  await assert.rejects(g.request('human.decide', { kind: 'stay-light', subject: before.tripwires.subject, authority: human, reason: 'x', consequences: 'y' }, 'stay'), /Under delegated autonomy a tripwire hit escalates the run to full; a stay-light decision is rejected/);
  await assert.rejects(g.request('milestone.pass', { name: 'acceptance' }, 'acceptance'), /blocked/);
  current = await status(g);
  assertDial(current.dials.rigor, { value: 'full', trigger: 'tripwire', source: 'automatic' });
  // The hit set is unchanged since preparation, so no duplicate record is added.
  assert.equal(current.tripwires.stage, 'candidate.prepare');
  assert.equal(current.tripwireHistory.length, 1);
});

test('after a tripwire escalation, design and spec reviews must check the delegated brief', async t => {
  const f = await fixture(t);
  const delegation = (await delegate(f)).event.hash;
  const head = await branchWith(f, 'topic', { 'app.js': 'export const answer = 42;\n', 'src/auth/token.js': 'export const ttl = 5;\n' });
  assert.equal((await candidate(f, 'SLICE', head)).tripwires.escalated, true);
  await writeFullDocuments(f.home);
  const runs = evaluator(f);
  const design = await review(f, 'design');
  const packet = runs.at(-1).input;
  assert.deepEqual(packet.documents.map(item => item.path), ['requirements/design.md', 'requirements/interview.md', 'requirements/brief.md']);
  assert.match(packet.rule, /raised from light rigor/);
  assert.equal(design.event.payload.documents['brief.md'].hash, (await f.core.store.capture('brief.md')).hash);
  await delegated(f, 'approve-design', design.event.payload.subject, delegation, design.event.hash);
  await f.request('spec.validate', {}, 'spec');
  const spec = await review(f, 'spec');
  assert.ok(runs.at(-1).input.documents.some(item => item.path === 'requirements/brief.md'));
  assert.match(runs.at(-1).input.rule, /goes beyond that brief is blocking/);
  await delegated(f, 'authorize-implementation', (await f.core.commitments()).subject, delegation, spec.event.hash);
  assert.equal((await status(f)).phase, 'IMPLEMENTING');
});
