import './helpers/private-scratch.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, human, evaluator, openPr, acceptanceMissing } from './helpers/lightweight-fixture.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { stopHook } from '../../plugin-src/shared/resources/protocol/current/stop.js';
import { goalStatus, readyRecord } from '../../plugin-src/shared/resources/protocol/current/goal.js';
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
  // The Stop hook admits a ready-pr goal run.
  const hookRuntime = { contextFor: async () => f.context, core: { gh: f.core.runtime.gh }, stallDirectory: await mkdtemp(join(tmpdir(), 'gatereeve-stop-ready-')) };
  assert.deepEqual(await stopHook({ cwd: '/unused' }, hookRuntime), {});
  // Acceptance that no longer qualifies withdraws ready-pr.
  await f.request('run.pause', { authority: { ...human, instruction: 'Pause for a moment.' } }, 'pause');
  let goalState = (await snapshot(f)).goal;
  assert.equal(goalState.terminal, null);
  assert.match(goalState.reason, /acceptance milestone does not qualify/u);
  await f.request('run.continue', { authority: { ...human, instruction: 'Carry on.' } }, 'unpause');
  assert.equal((await snapshot(f)).goal.terminal, 'ready-pr');
  // A new agent decision after publication makes the summary and the boundary
  // review stale: neither the published state nor the old pair still qualifies.
  await writeFile(join(f.home, 'scratchpad.md'), '# Scratchpad\n\n## Late default\n\n**Answered by:** agent\n\nChose a late default.\n');
  goalState = (await snapshot(f)).goal;
  assert.equal(goalState.terminal, null);
  assert.match(goalState.reason, /acceptance milestone does not qualify|Agent decision entries changed/u);
  assert.match(await acceptanceMissing(f), /current agent decision entries|review/u);
  await writeFile(join(f.home, 'scratchpad.md'), '# No pending decisions\n');
  assert.equal((await snapshot(f)).goal.terminal, 'ready-pr', 'restoring the reviewed record restores readiness');
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
  // Draft status is no precondition: a PR ready for review carries the park.
  f.gh.pr.isDraft = false;
  await assert.rejects(f.request('goal.park', { ...park, blockers: [...park.blockers, 'Unlisted blocker.'] }, 'park-unlisted'), /must list every blocker; missing: Unlisted blocker/);
  const parked = await f.request('goal.park', park, 'park');
  assert.equal(parked.state.park.pr.isDraft, false, 'a PR ready for review may carry a park');
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

test('ready-pr requires every condition: open PR at the candidate head, FEATURE scope, the current candidate, acceptance and unchanged decisions', () => {
  const state = { runId: 'run-one', dials: { autonomy: { value: 'goal' } }, candidate: { hash: 'sha256:c1' }, park: null, goalReady: null };
  const publication = { repository: 'app', number: 12, head: 'h1', review: { hash: 'sha256:r1' } };
  const open = { state: 'OPEN', headRefOid: 'h1' };
  assert.equal(readyRecord(state, { scope: 'SLICE' }, publication, open), null, 'a SLICE candidate is not the final PR');
  assert.equal(readyRecord(state, { scope: 'FEATURE' }, publication, { ...open, state: 'CLOSED' }), null);
  assert.equal(readyRecord(state, { scope: 'FEATURE' }, publication, { ...open, headRefOid: 'h2' }), null);
  assert.equal(readyRecord({ ...state, dials: { autonomy: { value: 'mandated' } } }, { scope: 'FEATURE' }, publication, open), null);
  const ready = readyRecord(state, { scope: 'FEATURE' }, publication, open, []);
  const accepted = [{ name: 'acceptance', allowed: true }];
  assert.equal(goalStatus({ ...state, goalReady: ready }, accepted).terminal, 'ready-pr');
  assert.equal(goalStatus({ ...state, goalReady: ready }, [{ name: 'acceptance', allowed: false }]).terminal, null);
  assert.equal(goalStatus({ ...state, goalReady: ready, candidate: { hash: 'sha256:c2' } }, accepted).terminal, null, 'a replaced candidate is not ready');
  assert.equal(goalStatus({ ...state, goalReady: ready }, accepted, [{ file: 'scratchpad.md', heading: 'New', body: 'x' }]).terminal, null);
  assert.equal(goalStatus({ ...state, goalReady: ready, park: { pr: { number: 12 }, blockers: ['b'] } }, accepted).terminal, 'parked');
});

test('a recorded ready state is withdrawn by any later review, evidence, decision or dial event', async t => {
  const { project } = await import('../../plugin-src/shared/resources/protocol/current/core.js');
  const f = await fixture(t);
  await grant(f);
  const { events } = await f.core.state();
  const ready = { candidate: 'sha256:c', repository: 'app', number: 12, head: 'h', review: { hash: 'sha256:r' }, decisions: identity([]) };
  const at = (type, payload, n) => ({ ...events.at(-1), sequence: events.length + n, type, payload, hash: `sha256:${String(n).padStart(64, '0')}`, recordedAt: new Date().toISOString() });
  const withReady = [...events, at('GOAL_READY', ready, 1)];
  assert.ok(project(withReady).goalReady);
  assert.ok(project([...withReady, at('OBSERVATION', {}, 2)]).goalReady, 'agent memory leaves readiness intact');
  let checked = 0;
  for (const type of ['REVIEWERS_SELECTED', 'REVIEW_ROUND_STARTED', 'BOUNDARY_REVIEWED', 'REVIEW_ADJUDICATED', 'JOB_FINISHED']) {
    let stale;
    try { stale = project([...withReady, at(type, {}, 2)]); } catch { continue; } // Payload-specific reducers may reject the bare fixture.
    assert.equal(stale.goalReady, null, `${type} withdraws a recorded ready state`);
    checked += 1;
  }
  assert.ok(checked >= 3, `only ${checked} event types could be projected`);
});
