import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundaryReviews } from '../../plugin-src/shared/resources/protocol/current/boundary-review.js';

import { selection, prepared, pairedAdapters } from './helpers/paired-review-fixture.js';
import { branchWith, candidate } from './helpers/lightweight-fixture.js';

for (const rigor of ['light', 'full']) test(`two complete ${rigor} boundary reviews run concurrently and retain both receipts`, async t => {
  const f = await prepared(t, rigor);
  const launches = pairedAdapters(f, { overlap: true });
  const done = await f.request('review.execute', {}, 'pair');
  assert.ok(done.event.payload.outcomes.every(row => row.status === 'completed'), JSON.stringify(done.event.payload.outcomes));
  assert.equal(launches(), 2);
  const { state } = await f.core.state();
  const pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  assert.equal(pair.outcome, 'PASS', JSON.stringify(pair.members.map(member => ({ provider: member.reviewer.provider, outcome: member.result.outcome, reason: member.result.summary }))));
  assert.equal(pair.members.length, 2);
  assert.notEqual(pair.members[0].receipt.evaluator.contextId, pair.members[1].receipt.evaluator.contextId);
  const review = (await f.request('milestone.check', { name: 'acceptance' })).outcomes.find(row => row.id === 'review');
  assert.equal(review.satisfied, true);
  assert.equal(review.reviews.length, 2);
});
test('a fast initial reviewer cannot enter the delayed peer preparation history', async t => {
  const f = await prepared(t); pairedAdapters(f);
  const histories = [];
  for (const adapter of Object.values(f.core.runtime.evaluators)) {
    const run = adapter.runStage.bind(adapter);
    adapter.runStage = async request => { histories.push(request.input.history ?? []); return run(request); };
  }
  let release, preparations = 0;
  const finished = new Promise(resolve => { release = resolve; });
  const append = f.core.append.bind(f.core);
  f.core.append = async (...args) => {
    const result = await append(...args);
    if (args[1] === 'JOB_FINISHED') release();
    return result;
  };
  const read = f.core.state.bind(f.core);
  f.core.state = async (...args) => {
    // Reproduce a scheduling delay at the former per-review history read.
    // A common baseline bypasses this read; live checks remain undelayed.
    const caller = new Error().stack.split('\n')[2];
    if (caller.includes('at executeGatesPrepared ') && ++preparations === 2) await finished;
    return read(...args);
  };
  const result = await f.request('review.execute', {}, 'independent-history');
  assert.ok(result.event.payload.outcomes.every(row => row.status === 'completed'));
  assert.equal(histories.length, 2);
  assert.ok(histories.every(history => history.length === 0), 'Initial peers must receive the same pre-round history');
});
test('a dial change during preparation prevents both reviewers launching under stale authority', async t => {
  const f = await prepared(t), launches = pairedAdapters(f);
  const append = f.core.append.bind(f.core);
  let changed;
  f.core.append = async (...args) => {
    if (args[1] === 'JOB_STARTED') {
      changed ??= f.request('run.set-dial', { dial: 'rigor', value: 'full', actor: 'agent', reason: 'Escalate before review admission' }, 'raise');
      await changed;
    }
    return append(...args);
  };
  const result = await f.request('review.execute', {}, 'revoked-round');
  assert.equal(launches(), 0);
  assert.ok(result.event.payload.outcomes.every(row => row.status === 'unavailable' && /authority changed/.test(row.reason)), JSON.stringify(result.event.payload.outcomes));
});
test('an unavailable peer preserves the completed reviewer and cannot count as approval', async t => {
  const f = await prepared(t);
  pairedAdapters(f, { unavailable: 'claude-code' });
  const done = await f.request('review.execute', {}, 'unavailable');
  assert.equal(done.event.payload.outcomes[0].status, 'completed', JSON.stringify(done.event.payload.outcomes));
  const { state } = await f.core.state();
  const pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  assert.equal(pair.members[0].result.outcome, 'PASS');
  assert.equal(pair.members[1].result.outcome, 'UNAVAILABLE');
  assert.equal(pair.outcome, 'UNAVAILABLE');
  assert.equal((await f.request('milestone.check', { name: 'acceptance' })).outcomes.find(row => row.id === 'review').satisfied, false);
});
test('a single historical assessment never satisfies the paired boundary obligation', async t => {
  const f = await prepared(t);
  pairedAdapters(f);
  const selected = (await f.core.state()).state.reviewerSelection;
  await f.request('gate.execute', { gates: ['review'], configuration: { provider: 'codex', model: 'fixture', reviewerSelection: selected.event } }, 'single');
  const review = (await f.request('milestone.check', { name: 'acceptance' })).outcomes.find(row => row.id === 'review');
  assert.equal(review.satisfied, false);
  assert.match(review.reason, /anthropic/);
});
test('unchanged successful perspectives are reused independently', async t => {
  const f = await prepared(t);
  const launches = pairedAdapters(f);
  await f.request('review.execute', {}, 'first');
  await f.request('review.execute', {}, 'second');
  assert.equal(launches(), 2);
});
test('local finding IDs retain distinct reviewer provenance', async t => {
  const f = await prepared(t);
  pairedAdapters(f, { blocking: ['codex', 'claude-code'] });
  await f.request('review.execute', {}, 'findings');
  const { state } = await f.core.state();
  const pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  assert.equal(pair.outcome, 'FAIL');
  assert.deepEqual(pair.members.map(member => member.result.findings[0].id), ['codex/same-local-id', 'claude-code/same-local-id']);
  assert.ok(pair.members.every(member => member.result.findingProvenance[0].originalId === 'same-local-id'));
});
test('opposed reviews remain visible without making peer approval override the failure', async t => {
  const f = await prepared(t);
  pairedAdapters(f, { blocking: ['claude-code'] });
  await f.request('review.execute', {}, 'disagreement');
  const { state } = await f.core.state();
  const pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  assert.deepEqual(pair.members.map(member => member.result.outcome), ['PASS', 'FAIL']);
  assert.equal(pair.outcome, 'FAIL');
});
test('each provider supplies its own delta after source changes and cannot borrow the peer prior', async t => {
  const f = await prepared(t); pairedAdapters(f); await f.request('review.execute', {}, 'original');
  const before = (await f.core.state()).state;
  const prior = await boundaryReviews(f.core, before, await f.core.store.json(before.candidate));
  const head = await branchWith(f, 'changed', { 'app.js': 'export const answer = 42;\n' });
  await candidate(f, 'SLICE', head, 'changed-candidate');
  await f.request('gate.execute', { gates: ['verification'], configuration: {
    validation: { kind: 'alternative', reason: 'Offline changed-source assertion', scope: 'Constant export' },
    checks: [{ repository: 'app', command: process.execPath, args: ['--input-type=module', '-e', "import { answer } from './app.js'; if(answer !== 42) process.exit(1)"], purpose: 'Verify changed source' }],
  } }, 'changed-verification');
  await assert.rejects(f.request('gate.execute', { gates: ['review'], prior: prior.members[1].ref,
    configuration: { provider: 'codex', model: 'fixture', reviewerSelection: before.reviewerSelection.event } }, 'wrong-prior'), /own provider perspective/);
  await f.request('review.execute', { prior: Object.fromEntries(prior.members.map(member => [member.reviewer.provider, member.ref])) }, 'deltas');
  const after = (await f.core.state()).state;
  const pair = await boundaryReviews(f.core, after, await f.core.store.json(after.candidate));
  assert.equal(pair.outcome, 'PASS');
  assert.ok(pair.members.every(member => member.result.mode === 'delta'));
  assert.deepEqual(pair.members.map(member => member.result.prior.hash), prior.members.map(member => member.ref.hash));
});
