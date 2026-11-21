import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, human, evaluator, openPr } from './helpers/lightweight-fixture.js';
import { prepared, pairedAdapters } from './helpers/paired-review-fixture.js';
import { sha256Digest } from '../../plugin-src/shared/resources/protocol/agent-workflow.js';
import { identity } from '../../plugin-src/shared/resources/protocol/current/contracts.js';
import { git } from '../../plugin-src/shared/resources/protocol/current/evidence.js';
import { currentSnapshot } from '../../plugin-src/shared/resources/protocol/current/adapter.js';

const mandate = { goal: 'Export the constant answer.', constraints: ['Keep the public export named answer.'] };
const grantAs = (f, value, id = value) => f.request('run.set-dial', { dial: 'autonomy', value, actor: 'human', runId: 'run-one',
  authority: { ...human, instruction: `Run run-one at ${value} within this goal and constraints.` }, reason: 'Explicit unattended mandate', mandate }, id);
const grant = f => grantAs(f, 'goal');
const snapshot = f => currentSnapshot(f.context, {}, { entryPoints: { adapter: 'adapter.js', cli: null } });
function planning(f) {
  evaluator(f, { planning: 'PASS' });
  const run = f.core.runtime.evaluator.runStage;
  f.core.runtime.evaluator.runStage = async request => {
    const result = await run(request);
    result.output.mandateAssessment = { outcome: 'PASS', evidence: 'Independent fixture assessment of fixed goal and constraints.' };
    result.receipt.digests.output = sha256Digest(result.output);
    return result;
  };
}

test('goal autonomy requires the same named-run human grant, mandate and release protection as mandated', async t => {
  const f = await fixture(t);
  await assert.rejects(f.request('run.set-dial', { dial: 'autonomy', value: 'goal', actor: 'agent', reason: 'I choose it', mandate }), /Only a human/);
  await assert.rejects(f.request('run.set-dial', { dial: 'autonomy', value: 'goal', actor: 'human', authority: human, reason: 'Grant', runId: 'other', mandate }), /name this run/);
  await assert.rejects(f.request('run.set-dial', { dial: 'autonomy', value: 'goal', actor: 'human', authority: human, reason: 'Grant', runId: 'run-one' }), /mandate/);
  await assert.rejects(f.request('run.set-dial', { dial: 'autonomy', value: 'goal', actor: 'human', reason: 'Grant', runId: 'run-one', mandate }), /observed instruction/);
  f.gh.protection.main = false;
  await assert.rejects(grant(f), /not observed as protected/);
  f.gh.protection.main = true;
  const result = await grant(f);
  assert.equal(result.state.dials.autonomy.value, 'goal');
  assert.deepEqual(result.event.payload.mandate, mandate);
  const status = await snapshot(f);
  assert.equal(status.dials.autonomy, 'goal');
  assert.equal(status.goal.terminal, null);
  assert.match(status.goal.condition, /run run-one/);
  assert.equal(status.dialDefaults.autonomy, 'supervised');
});

test('goal autonomy can be chosen at run start with a mandate and is refused without one', async t => {
  await assert.rejects(fixture(t, { autonomy: { value: 'goal', authority: human } }), /mandate/);
  const f = await fixture(t, { autonomy: { value: 'goal', authority: human, mandate } });
  assert.equal((await f.core.state()).state.dials.autonomy.value, 'goal');
});

test('the retired autonomous name is accepted as an alias and retained autonomous events replay as mandated', async t => {
  const f = await fixture(t);
  const aliased = await grantAs(f, 'autonomous', 'alias');
  assert.equal(aliased.event.payload.value, 'mandated');
  assert.equal(aliased.state.dials.autonomy.value, 'mandated');
  assert.equal((await snapshot(f)).goal, null, 'a mandated run reports no goal object');
  const back = await f.request('run.set-dial', { dial: 'autonomy', value: 'supervised', actor: 'agent', reason: 'Return control' }, 'back');
  assert.ok(back.state.handBack, 'returning mandated authority is a hand-back');
  // A record written before the rename stores the old value verbatim.
  const { state } = await f.core.state();
  const legacy = { dial: 'autonomy', value: 'autonomous', previous: 'supervised', source: 'explicit', actor: 'human',
    authority: { ...human, instruction: 'Finish run-one autonomously.' }, reason: 'Legacy grant', runId: 'run-one', mandate, protection: state.dials.autonomy.protection ?? null };
  await f.core.store.append(state.runId, state.eventCount, 'DIAL_SET', legacy, { id: 'legacy-grant', hash: identity(legacy) });
  const replayed = (await f.core.state()).state;
  assert.equal(replayed.dials.autonomy.value, 'mandated');
  assert.deepEqual(replayed.dials.autonomy.mandate, mandate);
  const returned = await f.request('run.set-dial', { dial: 'autonomy', value: 'supervised', actor: 'agent', reason: 'Return control again' }, 'back-again');
  assert.equal(returned.event.payload.previous, 'mandated');
  assert.ok(returned.state.handBack, 'a retained autonomous grant still hands back as unattended authority');
});

test('a goal run renews authority through an in-mandate amendment without a human handback', async t => {
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
  assert.equal(amended.state.dials.autonomy.value, 'goal');
  assert.equal(amended.state.handBack, null);
  assert.equal(amended.event.payload.authority.kind, 'autonomous-evaluator');
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, true);
});

test('goal delivery reports ready-pr at a published final PR and never authorizes its release merge', async t => {
  const f = await prepared(t, 'light', 'FEATURE');
  await git(f.repo, ['switch', '-c', f.integration, f.base]);
  await grant(f);
  await f.request('candidate.ready', {}, 'ready');
  pairedAdapters(f);
  await f.request('review.execute', {}, 'reviews');
  openPr(f, f.integration, f.release, f.base);
  assert.equal((await snapshot(f)).goal.terminal, null, 'an unpublished summary is not a ready final PR');
  await f.request('review.publish', { repository: 'app', number: 12 }, 'publish');
  assert.equal(f.gh.pr.isDraft, true, 'the final PR stays an open draft until its merge is authorized');
  const status = await snapshot(f);
  assert.equal(status.goal.terminal, 'ready-pr', JSON.stringify(status.goal));
  assert.equal(status.goal.ready.number, 12);
  const result = await f.request('delivery.resume', { merge: { repository: 'app', number: 12, method: 'merge' } }, 'resume');
  assert.equal(result.status, 'ready-for-human', JSON.stringify(result));
  assert.equal(result.nextAction, 'human.authorize-merge');
  const { state } = await f.core.state();
  assert.equal(state.decisions.some(decision => decision.kind === 'authorize-merge' || decision.actions?.includes('authorize-merge')), false);
  assert.equal(Object.keys(state.integrations).length, 0);
  // A park recorded at a ready PR takes precedence over ready-pr.
  f.gh.pr.body += '\nNeeds a product decision on naming.';
  await f.request('goal.park', { pr: { repository: 'app', number: 12 }, blockers: ['Needs a product decision on naming.'], evidence: ['Two valid names.'] }, 'park-ready');
  assert.equal((await snapshot(f)).goal.terminal, 'parked');
});

test('a goal run parks behind an open PR with blockers and only a human continue resumes it', async t => {
  const f = await fixture(t);
  openPr(f, 'topic', f.release, f.base, 'Blocked.\n- The second review provider is unavailable.\n');
  const park = { pr: { repository: 'app', number: 12 }, blockers: ['The second review provider is unavailable.'], evidence: ['Provider discovery found one provider.'] };
  await assert.rejects(f.request('goal.park', park, 'park-supervised'), /only to a goal run/);
  await grant(f);
  const { pr: _omitted, ...withoutPr } = park;
  await assert.rejects(f.request('goal.park', withoutPr, 'park-no-pr'), /PR/);
  await assert.rejects(f.request('goal.park', { ...park, blockers: [] }, 'park-no-blockers'), /non-empty/);
  await assert.rejects(f.request('goal.park', { ...park, evidence: [] }, 'park-no-evidence'), /non-empty/);
  f.gh.pr.state = 'CLOSED';
  await assert.rejects(f.request('goal.park', park, 'park-closed'), /must be open/);
  f.gh.pr.state = 'MERGED';
  await assert.rejects(f.request('goal.park', park, 'park-merged'), /must be open/);
  f.gh.pr.state = 'OPEN';
  f.gh.pr.isDraft = false;
  await assert.rejects(f.request('goal.park', park, 'park-ready'), /must be a draft/);
  f.gh.pr.isDraft = true;
  await assert.rejects(f.request('goal.park', { ...park, blockers: [...park.blockers, 'Unlisted blocker.'] }, 'park-unlisted'), /must list every blocker; missing: Unlisted blocker/);
  const parked = await f.request('goal.park', park, 'park');
  assert.equal(parked.state.park.pr.isDraft, true, 'a draft PR may carry a park');
  let status = await snapshot(f);
  assert.equal(status.goal.terminal, 'parked');
  assert.match(status.goal.reason, /second review provider/);
  assert.ok(status.blockers.some(item => item.type === 'goal-park'));
  await assert.rejects(f.request('goal.park', park, 'park-again'), /already parked/);
  await assert.rejects(f.request('run.continue', {}, 'agent-continue'), /Human authority/);
  const resumed = await f.request('run.continue', { authority: { ...human, instruction: 'Use the other provider and carry on.' } }, 'continue');
  assert.equal(resumed.state.park, null);
  assert.equal(resumed.state.dials.autonomy.value, 'goal');
  status = await snapshot(f);
  assert.equal(status.goal.terminal, null);
});

test('leaving goal autonomy clears a park and removes the goal object', async t => {
  const f = await fixture(t);
  openPr(f, 'topic', f.release, f.base, 'Needs production credentials.');
  await grant(f);
  await f.request('goal.park', { pr: { repository: 'app', number: 12 }, blockers: ['Needs production credentials.'], evidence: ['Deploy step requires a secret.'] }, 'park');
  const back = await f.request('run.set-dial', { dial: 'autonomy', value: 'supervised', actor: 'agent', reason: 'Return control' }, 'back');
  assert.equal(back.state.park, null);
  assert.equal((await snapshot(f)).goal, null);
});
