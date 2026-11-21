import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, human, evaluator, openPr } from './helpers/lightweight-fixture.js';
import { prepared, pairedAdapters } from './helpers/paired-review-fixture.js';
import { boundaryReviews } from '../../plugin-src/shared/resources/protocol/current/boundary-review.js';
import { sha256Digest } from '../../plugin-src/shared/resources/protocol/agent-workflow.js';
import { eligibleResidualRisk } from '../../plugin-src/shared/resources/protocol/current/autonomous.js';
import { git } from '../../plugin-src/shared/resources/protocol/current/evidence.js';
import { readCurrent } from '../../plugin-src/shared/resources/protocol/current/adapter.js';

const mandate = { goal: 'Export the constant answer.', constraints: ['Keep the public export named answer.'] };
const rebuttal = { goalEvidence: 'The retained source exports the constant and the actual verification reads it.',
  constraints: [{ index: 0, evidence: 'The export remains named answer; no rename occurred.' }] };
const grant = f => f.request('run.set-dial', { dial: 'autonomy', value: 'autonomous', actor: 'human', runId: 'run-one',
  authority: { ...human, instruction: 'Finish run-one autonomously within this goal and constraints.' }, reason: 'Explicit unattended mandate', mandate }, 'autonomous');
function planning(f, outcome = 'PASS', mandateOutcome = 'PASS') {
  evaluator(f, { planning: outcome });
  const run = f.core.runtime.evaluator.runStage;
  f.core.runtime.evaluator.runStage = async request => {
    const result = await run(request);
    result.output.mandateAssessment = { outcome: mandateOutcome, evidence: 'Independent fixture assessment of fixed goal and constraints.' };
    result.receipt.digests.output = sha256Digest(result.output);
    return result;
  };
}
test('autonomous authority requires an explicit named-run human grant, mandate and release protection', async t => {
  const f = await fixture(t);
  await assert.rejects(f.request('run.set-dial', { dial: 'autonomy', value: 'autonomous', actor: 'agent', reason: 'I choose it', mandate }), /Only a human/);
  await assert.rejects(f.request('run.set-dial', { dial: 'autonomy', value: 'autonomous', actor: 'human', authority: human, reason: 'Grant', runId: 'other', mandate }), /name this run/);
  await assert.rejects(f.request('run.set-dial', { dial: 'autonomy', value: 'autonomous', actor: 'human', authority: human, reason: 'Grant', runId: 'run-one' }), /mandate/);
  f.gh.protection.main = false;
  await assert.rejects(grant(f), /not observed as protected/);
  f.gh.protection.main = true;
  const result = await grant(f);
  assert.deepEqual(result.event.payload.mandate, mandate);
  assert.equal(result.state.dials.autonomy.value, 'autonomous');
});
test('an in-mandate independently reviewed amendment renews authority without a human handback', async t => {
  const f = await fixture(t, { rigor: 'full' });
  const prior = (await f.core.commitments()).subject;
  const granting = await grant(f);
  await writeFile(join(f.home, 'design.md'), (await readFile(join(f.home, 'design.md'), 'utf8')) + '\nUse a simpler approach within the same goal.\n');
  await writeFile(join(f.home, 'spec.md'), (await readFile(join(f.home, 'spec.md'), 'utf8')) + '\nImplementation approach simplified.\n');
  planning(f);
  const reviewed = await f.request('planning.review', { artifact: 'spec', configuration: { provider: 'codex', model: 'fixture' } }, 'amend-review');
  const current = await f.core.commitments();
  const amended = await f.request('human.decide', { kind: 'amend', subject: current.subject, previousSubject: prior,
    actions: ['authorize-implementation'], reason: 'Simpler in-mandate approach', consequences: 'Refresh planning and evidence',
    authority: { kind: 'autonomous-evaluator', delegation: granting.event.hash, evaluation: reviewed.event.hash } }, 'amend');
  assert.equal(amended.state.dials.autonomy.value, 'autonomous');
  assert.equal(amended.state.phase, 'IMPLEMENTING');
  assert.equal(amended.state.handBack, null);
  assert.equal(amended.event.payload.authority.kind, 'autonomous-evaluator');
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, true);
  await f.request('run.set-dial', { dial: 'autonomy', value: 'supervised', actor: 'agent', reason: 'Return control' }, 'revoke');
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, false);
});
test('a mandate failure cannot be hidden behind overall planning PASS', async t => {
  const f = await fixture(t, { rigor: 'full' });
  await grant(f);
  planning(f, 'PASS', 'FAIL');
  await assert.rejects(f.request('planning.review', { artifact: 'spec', configuration: { provider: 'codex', model: 'fixture' } }, 'bad-review'), /contradict mandate/);
});
test('autonomous adjudication accepts eligible dissent, retains FAIL and records diminishing returns', async t => {
  const f = await prepared(t);
  await grant(f);
  await f.request('candidate.ready', {}, 'ready');
  pairedAdapters(f, { blocking: ['claude-code'] });
  await f.request('review.execute', {}, 'reviews');
  const { state } = await f.core.state();
  const pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  const evidence = pair.members.map(member => member.ref);
  const adjudicated = await f.request('review.adjudicate', { candidate: state.candidate.hash, pair: pair.identity,
    reason: 'The remaining objection is an in-scope judgment call.', stopReason: 'Repeated inspection adds no new evidence.', evidence,
    dispositions: [{ findingId: pair.members[1].result.findings[0].id, outcome: 'accepted-risk', reason: 'Bounded residual impact', evidence: 'Both independent reviewers assessed the mandate and verification.', residualRisk: 'The objection remains documented for the final human review.' }] }, 'adjudicate');
  assert.match(adjudicated.event.payload.stopReason, /no new evidence/);
  const check = await f.request('milestone.check', { name: 'acceptance' });
  const review = check.outcomes.find(row => row.id === 'review');
  assert.equal(review.outcome, 'FAIL');
  assert.equal(review.satisfied, true);
  assert.ok(review.adjudication);
  assert.equal(check.allowed, true);
  openPr(f, 'topic', f.integration, f.base);
  const publication = await f.request('review.publish', { repository: 'app', number: 12 }, 'publish-adjudicated');
  assert.equal(publication.outcome, 'FAIL');
  assert.ok(publication.handoff?.path.endsWith('pr-explainer.html'));
  await f.request('run.set-dial', { dial: 'autonomy', value: 'supervised', actor: 'agent', reason: 'Return judgment' }, 'supervised');
  assert.equal((await f.request('milestone.check', { name: 'acceptance' })).outcomes.find(row => row.id === 'review').satisfied, false);
});
test('residual-risk authority cannot substitute for mandatory evidence or mandate compliance', () => {
  const good = { outcome: 'PASS', coverage: { complete: true, limitations: [] }, findings: [],
    mandateAssessment: { outcome: 'PASS', evidence: 'Within the mandate' },
    criteria: [{ id: 'brief', outcome: 'PASS', evidence: 'Checked' }],
    dimensions: ['code', 'requirements', 'evidence', 'scope', 'findings'].map(name => ({ name, outcome: 'PASS', evidence: 'Checked' })) };
  assert.deepEqual(eligibleResidualRisk({ members: [{ result: good }, { result: good }] }), []);
  for (const mutate of [
    row => { row.outcome = 'UNAVAILABLE'; },
    row => { row.coverage.complete = false; },
    row => { row.coverage.limitations = ['Unreviewed interaction']; },
    row => { row.mandateAssessment.outcome = 'FAIL'; },
    row => { row.mandateAssessment.outcome = 'UNAVAILABLE'; },
    row => { row.dimensions.find(item => item.name === 'evidence').outcome = 'FAIL'; },
    ...['code', 'requirements', 'findings'].map(name => row => { row.dimensions.find(item => item.name === name).outcome = 'UNAVAILABLE'; }),
    row => { row.criteria[0].outcome = 'UNAVAILABLE'; },
    row => { row.coverageDecisions = [{ outcome: 'FAIL' }]; },
    row => { row.outcome = 'FAIL'; },
  ]) {
    const result = structuredClone(good); mutate(result);
    assert.throws(() => eligibleResidualRisk({ members: [{ result: good }, { result }] }));
  }
});
test('autonomous delivery stops at a published ready final PR without authorizing its release merge', async t => {
  const f = await prepared(t, 'light', 'FEATURE');
  await git(f.repo, ['switch', '-c', f.integration, f.base]);
  await grant(f);
  await f.request('candidate.ready', {}, 'ready');
  pairedAdapters(f);
  await f.request('review.execute', {}, 'reviews');
  openPr(f, f.integration, f.release, f.base);
  await f.request('review.publish', { repository: 'app', number: 12 }, 'publish');
  const result = await f.request('delivery.resume', { merge: { repository: 'app', number: 12, method: 'merge' } }, 'resume');
  assert.equal(result.status, 'ready-for-human', JSON.stringify(result));
  assert.equal(result.nextAction, 'human.authorize-merge');
  const { state } = await f.core.state();
  assert.equal(state.phase, 'ACCEPTING');
  assert.equal(state.decisions.some(decision => decision.kind === 'authorize-merge' || decision.actions?.includes('authorize-merge')), false);
  assert.equal(Object.keys(state.integrations).length, 0);
});
test('autonomous judgment rebuts a completed negative planning opinion without rewriting its FAIL', async t => {
  const f = await fixture(t, { rigor: 'full' });
  const previousSubject = (await f.core.commitments()).subject;
  const granted = await grant(f);
  await writeFile(join(f.home, 'design.md'), (await readFile(join(f.home, 'design.md'), 'utf8')) + '\nSimplify the approach, retaining the answer export.\n');
  await writeFile(join(f.home, 'spec.md'), (await readFile(join(f.home, 'spec.md'), 'utf8')) + '\nApproach clarification within the same mandate.\n');
  planning(f, 'FAIL', 'FAIL');
  const review = await f.request('planning.review', { artifact: 'spec', configuration: { provider: 'codex', model: 'fixture' } }, 'negative-planning');
  const commitments = await f.core.commitments();
  const judgment = { reason: 'The scope objection is unsupported by the retained documents.', mandateRebuttal: rebuttal,
    evidence: [commitments.docs['design.md'], commitments.docs['spec.md']],
    dispositions: [{ findingId: 'P1', outcome: 'unsupported', reason: 'Only the implementation approach changed.', evidence: 'The same goal and export name remain in the current documents.', residualRisk: 'Original reviewer dissent remains visible.' }] };
  const amended = await f.request('human.decide', { kind: 'amend', subject: commitments.subject, previousSubject, actions: ['authorize-implementation'],
    reason: 'In-mandate amendment after independent negative assessment and explicit rebuttal', consequences: 'Refresh affected implementation evidence',
    authority: { kind: 'autonomous-evaluator', delegation: granted.event.hash, evaluation: review.event.hash, judgment } }, 'judged-amendment');
  assert.equal(amended.event.payload.authority.basis, 'autonomous-judgment');
  assert.equal(amended.event.payload.authority.evaluation.outcome, 'FAIL');
  assert.equal(amended.state.planningReviews.at(-1).outcome, 'FAIL');
  assert.equal(amended.state.dials.autonomy.value, 'autonomous');
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, true);
  const retained = await readCurrent(f.context, 'result', review.event.payload.result.hash, { gh: f.core.runtime.gh });
  assert.equal(retained.data.result.kind, 'planning-review');
  assert.equal(retained.data.result.outcome, 'FAIL');
  assert.equal(retained.data.output.mandateAssessment.outcome, 'FAIL');
});
for (const objection of ['mandate', 'scope', 'evidence']) test(`unsupported ${objection} claims need counterevidence and cannot be accepted as known violations`, async t => {
  const f = await prepared(t); await grant(f); await f.request('candidate.ready', {}, 'ready');
  pairedAdapters(f, objection === 'mandate' ? { mandateFailure: ['claude-code'] } : { blocking: ['claude-code'] });
  if (objection !== 'mandate') {
    const adapter = f.core.runtime.evaluators['claude-code'], run = adapter.runStage.bind(adapter);
    adapter.runStage = async request => {
      const result = await run(request);
      for (const verdict of result.output.verdicts) verdict.dimensions.find(row => row.name === objection).outcome = 'FAIL';
      result.receipt.digests.output = sha256Digest(result.output);
      return result;
    };
  }
  await f.request('review.execute', {}, 'opinions');
  const { state } = await f.core.state();
  const pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  const input = { candidate: state.candidate.hash, pair: pair.identity, reason: 'Resolve the unsupported scope interpretation.',
    evidence: pair.members.map(member => member.ref), mandateRebuttal: rebuttal,
    dispositions: [{ findingId: pair.members[1].result.findings[0].id, outcome: 'accepted-risk', reason: 'The export did not change.', evidence: 'Actual source and execution show answer.', residualRisk: 'The reviewer disagrees.' }] };
  await assert.rejects(f.request('review.adjudicate', input, 'cannot-accept-violation'), /known violation/);
  input.dispositions[0].outcome = 'unsupported';
  await f.request('review.adjudicate', input, 'supported-rebuttal');
  const checked = await f.request('milestone.check', { name: 'acceptance' });
  assert.equal(checked.allowed, true);
  assert.equal(checked.outcomes.find(row => row.id === 'review').outcome, 'FAIL');
});
test('a rebuttal cannot excuse a failed actual mandatory verification check', async t => {
  const f = await prepared(t); await grant(f); await f.request('candidate.ready', {}, 'ready');
  pairedAdapters(f, { blocking: ['claude-code'] }); await f.request('review.execute', {}, 'opinions');
  const { state } = await f.core.state();
  const pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  await f.request('gate.execute', { gates: ['verification'], configuration: {
    validation: { kind: 'alternative', reason: 'Additional required assertion', scope: 'Required constant value' },
    checks: [{ repository: 'app', command: process.execPath, args: ['--input-type=module', '-e', "import { answer } from './app.js'; if(answer !== 42) throw new Error('required value mismatch')"], purpose: 'Required constant assertion' }],
  } }, 'failed-mandatory');
  await assert.rejects(f.request('review.adjudicate', { candidate: state.candidate.hash, pair: pair.identity, reason: 'Do not override this failure.',
    mandateRebuttal: rebuttal, evidence: pair.members.map(member => member.ref),
    dispositions: [{ findingId: pair.members[1].result.findings[0].id, outcome: 'unsupported', reason: 'Reviewer interpretation is disputed.', evidence: 'A rebuttal is not a test PASS.', residualRisk: 'The actual mandatory test failed.' }] }, 'forbidden'), /failed or missing mandatory/);
});
for (const missing of ['code', 'requirements', 'findings', 'criterion']) test(`an incomplete ${missing} conclusion cannot become autonomous acceptance`, async t => {
  const f = await prepared(t); await grant(f); await f.request('candidate.ready', {}, 'ready');
  pairedAdapters(f, { blocking: ['claude-code'] });
  const adapter = f.core.runtime.evaluators['claude-code'], run = adapter.runStage.bind(adapter);
  adapter.runStage = async request => {
    const result = await run(request);
    for (const verdict of result.output.verdicts) {
      if (missing === 'criterion') verdict.criteria[0].outcome = 'UNAVAILABLE';
      else verdict.dimensions.find(row => row.name === missing).outcome = 'UNAVAILABLE';
    }
    result.receipt.digests.output = sha256Digest(result.output); return result;
  };
  await f.request('review.execute', {}, 'incomplete');
  const { state } = await f.core.state(), pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  assert.equal(pair.members[1].result.outcome, 'FAIL', 'The original negative assessment stays retained');
  await assert.rejects(f.request('review.adjudicate', { candidate: state.candidate.hash, pair: pair.identity, reason: 'Do not accept incomplete conclusions.', evidence: pair.members.map(member => member.ref),
    dispositions: [{ findingId: pair.members[1].result.findings[0].id, outcome: 'accepted-risk', reason: 'Incomplete is not residual risk.', evidence: 'Missing conclusion.', residualRisk: 'Unknown.' }] }, 'forbidden'), /complete responsibility and criterion/);
});
for (const path of ['app/app.js', 'planning/plan.md', 'requirements/spec.md', 'requirements/brief.md']) test(`a later FAIL cannot erase an open ${path} finding`, async t => {
  const f = await prepared(t, path === 'planning/plan.md' || path === 'requirements/spec.md' ? 'full' : 'light');
  await grant(f); await f.request('candidate.ready', {}, 'ready');
  pairedAdapters(f, { blocking: ['claude-code'] });
  const initialAdapter = f.core.runtime.evaluators['claude-code'], initialRun = initialAdapter.runStage.bind(initialAdapter);
  initialAdapter.runStage = async request => {
    const result = await initialRun(request);
    for (const verdict of result.output.verdicts) verdict.findings[0].path = path;
    result.receipt.digests.output = sha256Digest(result.output); return result;
  };
  await f.request('review.execute', {}, 'initial');
  let state = (await f.core.state()).state;
  const first = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  const originalId = first.members[1].result.findings[0].id;
  const adapter = f.core.runtime.evaluators['claude-code'], run = adapter.runStage.bind(adapter);
  adapter.runStage = async request => {
    const result = await run(request);
    for (const verdict of result.output.verdicts) verdict.findings[0].id = 'new-issue';
    result.receipt.digests.output = sha256Digest(result.output); return result;
  };
  await f.request('gate.execute', { gates: ['review'], configuration: { provider: 'claude-code', model: 'fixture', reviewerSelection: state.reviewerSelection.event, reviewRevision: 2 } }, 'later-fail');
  state = (await f.core.state()).state;
  const pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  assert.ok(pair.members[1].unreconciledFindings.includes(originalId));
  await assert.rejects(f.request('review.adjudicate', { candidate: state.candidate.hash, pair: pair.identity, reason: 'Cannot silently drop the original finding.', evidence: pair.members.map(member => member.ref),
    dispositions: [{ findingId: pair.members[1].result.findings[0].id, outcome: 'accepted-risk', reason: 'Only the new issue was addressed.', evidence: 'Original issue has no disposition.', residualRisk: 'Unreconciled original issue.' }] }, 'forbidden'), /Unreconciled historical/);
  const latestId = pair.members[1].result.findings[0].id;
  pairedAdapters(f);
  const finalAdapter = f.core.runtime.evaluators['claude-code'], finalRun = finalAdapter.runStage.bind(finalAdapter);
  finalAdapter.runStage = async request => {
    const result = await finalRun(request);
    for (const verdict of result.output.verdicts) verdict.dispositions = [{ id: latestId, status: 'resolved', evidence: 'Only the newest issue was inspected.' }];
    result.receipt.digests.output = sha256Digest(result.output); return result;
  };
  const attempted = await f.request('gate.execute', { gates: ['review'], configuration: { provider: 'claude-code', model: 'fixture', reviewerSelection: state.reviewerSelection.event, reviewRevision: 3 } }, 'cannot-clear-latest-only');
  const verdict = await f.core.store.json(attempted.event.payload.results[0]);
  assert.equal(verdict.outcome, 'UNAVAILABLE', 'A PASS clearing only F2 must be rejected while F1 stays open');
  assert.match(verdict.summary, /unresolved|disposition|blocking/i);
});
test('follow-up peers may both retain one original finding without duplicate-disposition deadlock', async t => {
  const f = await prepared(t); await grant(f); await f.request('candidate.ready', {}, 'ready');
  pairedAdapters(f, { blocking: ['claude-code'] }); await f.request('review.execute', {}, 'initial');
  let state = (await f.core.state()).state;
  const original = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  const findingId = original.members[1].result.findings[0].id;
  pairedAdapters(f, { present: [findingId] }); await f.request('review.execute', {}, 'follow-up');
  state = (await f.core.state()).state;
  const pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  assert.ok(pair.members.every(member => member.materialFindings[0].id === findingId));
  const adjudicated = await f.request('review.adjudicate', { candidate: state.candidate.hash, pair: pair.identity,
    reason: 'One original issue remains after both independent follow-up assessments.', evidence: pair.members.map(member => member.ref),
    dispositions: [{ findingId, outcome: 'accepted-risk', reason: 'Bounded in-mandate trade-off.', evidence: 'Both current reviewers retain the same original issue.', residualRisk: 'Both objections remain visible.' }] }, 'one-disposition');
  assert.equal(adjudicated.event.payload.dispositions.length, 1);
  assert.equal(adjudicated.event.payload.originalOutcomes.length, 2);
  assert.ok(adjudicated.event.payload.originalOutcomes.every(row => row.outcome === 'FAIL'));
});
