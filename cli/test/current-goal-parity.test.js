import './helpers/private-scratch.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, human, branchWith, candidate, openPr, gates } from './helpers/lightweight-fixture.js';
import { prepared, pairedAdapters } from './helpers/paired-review-fixture.js';
import { boundaryReviews } from '../../plugin-src/shared/resources/protocol/current/boundary-review.js';

// Goal autonomy carries exactly mandated authority (spec AC1, R2): each path
// mandated autonomy qualifies for is exercised here for a goal run.
const mandate = { goal: 'Export the constant answer.', constraints: ['Keep the public export named answer.'] };
const grant = (f, id = 'goal') => f.request('run.set-dial', { dial: 'autonomy', value: 'goal', actor: 'human', runId: 'run-one',
  authority: { ...human, instruction: 'Run run-one in goal mode within this goal and constraints.' }, reason: 'Unattended mandate', mandate }, id);

test('a goal run may adjudicate eligible residual risk without human clearance', async t => {
  const f = await prepared(t);
  await grant(f);
  await f.request('candidate.ready', {}, 'ready');
  pairedAdapters(f, { blocking: ['claude-code'] });
  await f.request('review.execute', {}, 'reviews');
  const { state } = await f.core.state();
  const pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  const adjudicated = await f.request('review.adjudicate', { candidate: state.candidate.hash, pair: pair.identity,
    reason: 'The remaining objection is an in-scope judgment call.', evidence: pair.members.map(member => member.ref),
    dispositions: [{ findingId: pair.members[1].result.findings[0].id, outcome: 'accepted-risk', reason: 'Bounded residual impact',
      evidence: 'Both independent reviewers assessed the mandate and verification.', residualRisk: 'Documented for the final human review.' }] }, 'adjudicate');
  assert.ok(adjudicated.event);
  const review = (await f.request('milestone.check', { name: 'acceptance' })).outcomes.find(row => row.id === 'review');
  assert.equal(review.outcome, 'FAIL', 'the original reviewer outcome is preserved');
  assert.equal(review.satisfied, true);
});

test('a goal run accepts and protected-merges a fully passing SLICE PR into the integration branch', async t => {
  const f = await fixture(t);
  await grant(f);
  const head = await branchWith(f, 'topic', 'export const answer = 42;\n');
  await candidate(f, 'SLICE', head);
  openPr(f, 'topic', f.integration, head);
  await gates(f);
  await f.request('milestone.pass', { name: 'acceptance' }, 'acceptance');
  const action = await f.request('merge.prepare', { repository: 'app', number: 12 });
  assert.equal(action.deliveryTarget, 'integration');
  await f.request('review.publish', { repository: 'app', number: 12 }, 'publish');
  const applied = await f.request('delegation.apply', { action }, 'apply');
  assert.equal(applied.event.payload.authority.kind, 'autonomous-evaluator');
  await f.request('merge.execute', { repository: 'app', number: 12 }, 'merge');
  const current = await f.request('status');
  assert.equal(current.integrations.app.integrationSha, head);
  assert.equal(current.dials.autonomy.value, 'goal');
});

test('a tripwire hit in a goal light run escalates it to full rigor automatically', async t => {
  const f = await fixture(t);
  await grant(f);
  const head = await branchWith(f, 'topic', { 'app.js': 'export const answer = 42;\n', '.env': 'TOKEN=1\n' });
  const result = await candidate(f, 'SLICE', head);
  assert.equal(result.tripwires.escalated, true);
  const current = await f.request('status');
  assert.equal(current.dials.rigor.value, 'full');
  assert.equal(current.dials.rigor.trigger, 'tripwire');
  assert.equal(current.dials.autonomy.value, 'goal');
});
