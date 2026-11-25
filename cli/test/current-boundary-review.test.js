import './helpers/private-scratch.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { boundaryReviews, outcomeStatus } from '../../plugin-src/shared/resources/protocol/current/boundary-review.js';
import { sha256Digest } from '../../plugin-src/shared/resources/protocol/agent-workflow.js';

import { selection, prepared, pairedAdapters } from './helpers/paired-review-fixture.js';
import { branchWith, candidate, fixture } from './helpers/lightweight-fixture.js';

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
  assert.ok(result.event.payload.outcomes.every(row => row.status === 'refused' && /authority changed/.test(row.reason)), JSON.stringify(result.event.payload.outcomes));
  assert.deepEqual((await f.core.state()).state.reviewScopes, {}, 'A refused round counts no round');
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
for (const tagged of [true, false]) test(`serial individual assessments cannot seed initial history (${tagged ? 'tagged' : 'unmarked'})`, async t => {
  const f = await prepared(t); pairedAdapters(f);
  const selected = (await f.core.state()).state.reviewerSelection;
  for (const provider of ['codex', 'claude-code']) await f.request('gate.execute', { gates: ['review'],
    configuration: { provider, model: 'fixture', ...(tagged ? { reviewerSelection: selected.event } : {}) } }, `serial-${provider}`);
  const review = (await f.request('milestone.check', { name: 'acceptance' })).outcomes.find(row => row.id === 'review');
  assert.equal(review.satisfied, false);
  assert.match(review.reason, /coordinated independent initial|Missing current boundary review/);
  const launches = pairedAdapters(f);
  const histories = [];
  for (const adapter of Object.values(f.core.runtime.evaluators)) {
    const run = adapter.runStage.bind(adapter);
    adapter.runStage = async request => { histories.push(request.input.history); return run(request); };
  }
  await f.request('review.execute', {}, 'actual-initial-round');
  assert.equal(launches(), 2, 'Serial reports must not be reused as the independent initial pair');
  assert.deepEqual(histories.map(rows => rows.length), [0, 0], 'Serial seed opinions must not leak into the initial pair');
  assert.equal((await f.request('milestone.check', { name: 'acceptance' })).outcomes.find(row => row.id === 'review').satisfied, true);
});
test('an unavailable initial peer can recover without either new context seeing the earlier peer report', async t => {
  const f = await prepared(t); pairedAdapters(f, { unavailable: 'claude-code' });
  await f.request('review.execute', {}, 'partial-initial');
  pairedAdapters(f);
  const histories = [];
  for (const adapter of Object.values(f.core.runtime.evaluators)) {
    const run = adapter.runStage.bind(adapter);
    adapter.runStage = async request => { histories.push(request.input.history); return run(request); };
  }
  await f.request('review.execute', {}, 'recover-initial');
  const { state } = await f.core.state(), pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  assert.equal(pair.outcome, 'PASS');
  assert.deepEqual(histories.map(rows => rows.length), [0, 0]);
});
test('withholding initial peer output cannot erase a known blocking finding', async t => {
  const f = await prepared(t); pairedAdapters(f, { blocking: ['codex'] });
  const selected = (await f.core.state()).state.reviewerSelection;
  const first = await f.request('gate.execute', { gates: ['review'], configuration: { provider: 'codex', model: 'fixture', reviewerSelection: selected.event } }, 'seed');
  const findingId = (await f.core.store.json(first.event.payload.results[0])).findings[0].id;
  pairedAdapters(f);
  for (const adapter of Object.values(f.core.runtime.evaluators)) {
    const run = adapter.runStage.bind(adapter);
    adapter.runStage = async request => {
      const result = await run(request);
      for (const verdict of result.output.verdicts) verdict.dispositions = [{ id: findingId, status: 'unsupported', evidence: 'Guessed closure without access to the original claim.' }];
      result.receipt.digests.output = sha256Digest(result.output); return result;
    };
  }
  await f.request('review.execute', {}, 'guessed-initial');
  let state = (await f.core.state()).state;
  let pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  assert.ok(pair.members.every(member => member.result.outcome === 'UNAVAILABLE'), 'An invented closure of a hidden finding is invalid output');
  pairedAdapters(f);
  await f.request('review.execute', {}, 'blind-initial');
  state = (await f.core.state()).state;
  pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  assert.equal(pair.initialEstablished, true);
  assert.equal(pair.outcome, 'UNAVAILABLE', 'Independent PASS cannot silently close the withheld issue');
  assert.ok(pair.members.every(member => member.unreconciledFindings.includes(findingId)));
  for (const adapter of Object.values(f.core.runtime.evaluators)) {
    const run = adapter.runStage.bind(adapter);
    adapter.runStage = async request => {
      const result = await run(request);
      for (const verdict of result.output.verdicts) verdict.dispositions = [{ id: findingId, status: 'unsupported', evidence: 'Independent follow-up checked and rejected the earlier objection against actual source.' }];
      result.receipt.digests.output = sha256Digest(result.output); return result;
    };
  }
  await f.request('review.execute', {}, 'reconcile-after-initial');
  state = (await f.core.state()).state;
  pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  assert.equal(pair.outcome, 'PASS');
  assert.ok(pair.members.every(member => member.result.dispositions.some(row => row.id === findingId)));
});
test('an interrupted initial round retains its baseline and completed peer on retry', async t => {
  const f = await prepared(t), launches = pairedAdapters(f, { blocking: ['codex'] });
  const histories = [];
  for (const [provider, adapter] of Object.entries(f.core.runtime.evaluators)) {
    const run = adapter.runStage.bind(adapter);
    adapter.runStage = async request => { histories.push({ provider, history: request.input.history }); return run(request); };
  }
  const append = f.core.append.bind(f.core);
  f.core.append = async (...args) => {
    if (args[1] === 'JOB_STARTED' && (await f.core.store.json(args[2].input)).configuration.provider === 'claude-code') throw new Error('Interrupted before peer admission');
    if (args[1] === 'BOUNDARY_REVIEWED') throw new Error('Interrupted before round publication');
    return append(...args);
  };
  await assert.rejects(f.request('review.execute', {}, 'interrupted'), /round publication/);
  assert.equal(launches(), 1);
  f.core.append = append;
  await f.request('review.execute', {}, 'interrupted');
  assert.equal(launches(), 2, 'The original completed report must survive recovery without relaunch');
  assert.deepEqual(histories.map(row => row.history.length), [0, 0], 'The delayed initial peer must not inherit the first answer on retry');
  const { state } = await f.core.state();
  const pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  assert.deepEqual(pair.members.map(member => member.result.outcome), ['FAIL', 'PASS']);
  assert.equal(pair.initialEstablished, true);
});
test('unchanged successful perspectives are reused independently', async t => {
  const f = await prepared(t);
  const launches = pairedAdapters(f);
  await f.request('review.execute', {}, 'first');
  await f.request('review.execute', {}, 'second');
  assert.equal(launches(), 2);
});
test('lost initial-round context blocks acceptance and fresh independent proof can replace it', async t => {
  const f = await prepared(t), launches = pairedAdapters(f);
  await f.request('candidate.ready', {}, 'ready');
  await f.request('review.execute', {}, 'first');
  let state = (await f.core.state()).state;
  let pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  const inventory = await f.core.inventory(state, await f.core.store.json(state.candidate));
  assert.equal(inventory.find(row => row.gate === 'review').initialProof.length, 3);
  await rm(join(f.home, '.gatereeve-current/objects', pair.initialProof.baseline.hash.slice(7)));
  assert.equal((await f.request('milestone.check', { name: 'acceptance' })).allowed, false);
  await f.request('review.execute', {}, 'replace-lost-initial');
  state = (await f.core.state()).state;
  pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  assert.equal(launches(), 4, 'Lost initial proof requires two fresh contexts, not reuse of unqualified history');
  assert.equal(pair.outcome, 'PASS');
  const check = await f.request('milestone.check', { name: 'acceptance' });
  assert.equal(check.allowed, true, check.missing.join('; '));
});
for (const beforeInitial of [false, true]) test(`lost review output retains qualified finding context (${beforeInitial ? 'older source before initial pair' : 'follow-up after initial pair'})`, async t => {
  const f = await prepared(t); pairedAdapters(f);
  if (!beforeInitial) await f.request('review.execute', {}, 'initial');
  pairedAdapters(f, { blocking: ['codex'] });
  const selected = (await f.core.state()).state.reviewerSelection;
  const original = await f.request('gate.execute', { gates: ['review'], configuration: { provider: 'codex', model: 'fixture',
    ...(beforeInitial ? {} : { reviewerSelection: selected.event }), reviewRevision: 'original-failure' } }, 'original-failure');
  const failed = await f.core.store.json(original.event.payload.results[0]), findingId = failed.findings[0].id;
  const lost = failed.artifacts[1];
  await rm(join(f.home, '.gatereeve-current/objects', lost.hash.slice(7)));
  if (beforeInitial) {
    const head = await branchWith(f, 'recovered', 'export const answer = 41; // Current source\n');
    await candidate(f, 'SLICE', head, 'current-source');
    await f.request('gate.execute', { gates: ['verification'], configuration: {
      validation: { kind: 'alternative', reason: 'Actual current-source fixture check', scope: 'Constant export' },
      checks: [{ repository: 'app', command: process.execPath, args: ['--input-type=module', '-e', "import { answer } from './app.js'; if(answer !== 41) process.exit(1)"], purpose: 'Verify current export' }],
    } }, 'current-verification');
  }
  pairedAdapters(f, { present: [findingId] });
  await f.request('review.execute', {}, 'fresh-present');
  let state = (await f.core.state()).state;
  let pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  assert.equal(pair.initialEstablished, true);
  assert.equal(pair.outcome, 'FAIL', 'Fresh retained dissent must qualify without a missing-input crash');
  assert.ok(pair.members.every(member => member.materialFindings.some(row => row.id === findingId)));
  for (const member of pair.members) {
    const input = await f.core.store.json(member.result.input);
    const reports = await Promise.all(input.history.map(ref => f.core.store.json(ref)));
    const context = reports.find(row => row.kind === 'historical-context');
    assert.equal(context.originalResultHash, original.event.payload.results[0].hash);
    assert.equal(context.input, undefined, 'Recovery context must not require missing original execution proof');
    assert.equal(context.scope.provider, 'codex');
    assert.equal(context.scope.repositories[0].alias, 'app');
  }
  pairedAdapters(f);
  for (const adapter of Object.values(f.core.runtime.evaluators)) {
    const run = adapter.runStage.bind(adapter);
    adapter.runStage = async request => {
      const result = await run(request);
      for (const verdict of result.output.verdicts) verdict.dispositions = [{ id: findingId, status: 'resolved', evidence: 'Fresh current-source inspection resolves the retained finding.' }];
      result.receipt.digests.output = sha256Digest(result.output); return result;
    };
  }
  await f.request('review.execute', {}, 'fresh-resolution');
  state = (await f.core.state()).state;
  pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  assert.equal(pair.outcome, 'PASS');
  await assert.rejects(f.core.store.get(lost), /ENOENT/, 'Fresh proof must not reconstruct missing original output');
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
  const f = await prepared(t); const launches = pairedAdapters(f); await f.request('review.execute', {}, 'original');
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
  const targeted = await f.request('gate.execute', { gates: ['review'], prior: prior.members[0].ref,
    configuration: { provider: 'codex', model: 'fixture', reasoningEffort: 'high', reviewerSelection: before.reviewerSelection.event } }, 'targeted-delta');
  await f.request('review.execute', { prior: { 'claude-code': prior.members[1].ref } }, 'deltas');
  assert.equal(launches(), 4, 'The unchanged targeted perspective is reused while the peer supplies its own delta');
  const after = (await f.core.state()).state;
  const pair = await boundaryReviews(f.core, after, await f.core.store.json(after.candidate));
  assert.equal(pair.outcome, 'PASS');
  assert.equal(pair.members[0].ref.hash, targeted.event.payload.results[0].hash);
  assert.ok(pair.members.every(member => member.result.mode === 'delta'));
  assert.deepEqual(pair.members.map(member => member.result.prior.hash), prior.members.map(member => member.ref.hash));
});

test('Claude gets one same-model correction and retains the original Codex result', async t => {
  const f = await prepared(t);
  pairedAdapters(f);
  const counts = { codex: 0, 'claude-code': 0 };
  for (const [provider, adapter] of Object.entries(f.core.runtime.evaluators)) {
    const run = adapter.runStage.bind(adapter);
    adapter.runStage = async request => {
      counts[provider]++;
      if (provider === 'claude-code' && counts[provider] === 1) {
        throw Object.assign(new Error('Malformed JSON'), { providerFailure: { category: 'malformed-output' } });
      }
      const result = await run(request);
      if (provider === 'codex') {
        const verdict = result.output.verdicts[0];
        verdict.findings = [{ id: 'new-advisory', classId: 'constant', classStatement: 'Fixture defect class', severity: 'high', failureScenario: 'Fixture input -> wrong observable output', criterion: request.input.criteria[0],
          path: 'app.js', evidence: 'Current source has an advisory observation.', blocking: false }];
        verdict.dispositions = [{ id: 'new-advisory', status: 'present', evidence: 'The observation is present in current source.' }];
        result.receipt.digests.output = sha256Digest(result.output);
      }
      return result;
    };
  }
  const done = await f.request('review.execute', {}, 'repair-pair');
  assert.deepEqual(counts, { codex: 1, 'claude-code': 2 });
  const reports = await Promise.all(done.event.payload.outcomes.map(row => f.core.store.json(row.results[0])));
  assert.deepEqual(reports.map(row => row.outcome), ['PASS', 'PASS']);
  assert.equal(reports[0].findings[0].id, 'codex/new-advisory');
  assert.equal(reports[0].findings[0].path, 'app/app.js');
  assert.equal(reports[0].dispositions[0].id, reports[0].findings[0].id);
  const { state } = await f.core.state();
  assert.equal((await boundaryReviews(f.core, state, await f.core.store.json(state.candidate))).outcome, 'PASS');
});

test('Claude can supply an omitted blocking flag and qualify the same pinned source in its retry', async t => {
  const f = await prepared(t, 'full');
  const launches = pairedAdapters(f);
  const adapter = f.core.runtime.evaluators['claude-code'];
  const run = adapter.runStage.bind(adapter);
  const advisory = { id: 'omitted-severity', classId: 'constant', classStatement: 'Fixture defect class', severity: 'high', failureScenario: 'Fixture input -> wrong observable output', criterion: 'R1',
    path: 'app.js', evidence: 'The constant could use a comment.' };
  adapter.runStage = async request => {
    const result = await run(request);
    const verdict = result.output.verdicts[0];
    verdict.findings = request.input.repair
      ? [{ ...advisory, path: 'app/app.js', blocking: false }]
      : [advisory];
    result.receipt.digests.output = sha256Digest(result.output);
    return result;
  };
  const done = await f.request('review.execute', {}, 'repair-severity');
  assert.equal(launches(), 3);
  const reports = await Promise.all(done.event.payload.outcomes.map(row => f.core.store.json(row.results[0])));
  assert.deepEqual(reports.map(report => report.outcome), ['PASS', 'PASS']);
  assert.equal(reports[1].findings[0].blocking, false);
  assert.equal(reports[1].findings[0].path, 'app/app.js');
  assert.equal(reports[1].findings[0].evidence, advisory.evidence);
  const { state } = await f.core.state();
  const pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  assert.equal(pair.outcome, 'PASS');
});

// PR B1 (spec AC5): either provider gets exactly one automatic format-repair
// turn; a repair that still fails is UNAVAILABLE with a reason code.
for (const provider of ['codex', 'claude-code']) test(`${provider} gets exactly one automatic repair turn and a failed repair stays UNAVAILABLE`, async t => {
  const f = await prepared(t, 'full');
  const launches = pairedAdapters(f);
  const adapter = f.core.runtime.evaluators[provider];
  const run = adapter.runStage.bind(adapter);
  const inputs = [];
  adapter.runStage = async request => {
    inputs.push(request.input);
    const result = await run(request);
    // Both the first answer and its repair omit the failure scenario.
    result.output.verdicts[0].findings = [{ id: 'advisory', classId: 'constant', classStatement: 'Constant naming', severity: 'low',
      criterion: 'R1', path: 'app/app.js', evidence: 'The constant could use a comment.', blocking: false }];
    result.receipt.digests.output = sha256Digest(result.output);
    return result;
  };
  const done = await f.request('review.execute', {}, `repair-fails-${provider}`);
  assert.equal(launches(), 3, 'One reviewer once, the other once plus one repair turn');
  assert.equal(inputs.length, 2);
  assert.ok(Array.isArray(inputs[0].dispositionsRequired), 'Reviewer input names the required dispositions');
  assert.equal(inputs[0].repair, null);
  assert.equal(inputs[1].repair.original.findings[0].id, 'advisory', 'The repair turn receives its original verdict');
  assert.match(inputs[1].repair.diagnostic, /failureScenario/);
  const row = done.event.payload.outcomes.find(item => item.provider === provider);
  const report = await f.core.store.json(row.results[0]);
  assert.equal(report.outcome, 'UNAVAILABLE');
  assert.equal(report.unavailableReason, 'contract');
});

test('a repaired verdict that rewords dependent text qualifies the pair', async t => {
  const f = await prepared(t, 'full');
  const launches = pairedAdapters(f);
  const adapter = f.core.runtime.evaluators.codex;
  const run = adapter.runStage.bind(adapter);
  adapter.runStage = async request => {
    const result = await run(request);
    const verdict = result.output.verdicts[0];
    verdict.findings = [{ id: 'advisory', classId: 'constant', classStatement: 'Constant naming', severity: 'low',
      criterion: 'R1', path: 'app/app.js', evidence: 'The constant could use a comment.', blocking: false,
      ...(request.input.repair ? { failureScenario: 'A reader misreads 41 -> wrong mental model, no runtime effect' } : {}) }];
    if (request.input.repair) verdict.summary = `${verdict.summary} (repaired: failure scenario supplied)`;
    result.receipt.digests.output = sha256Digest(result.output);
    return result;
  };
  const done = await f.request('review.execute', {}, 'repair-rewords');
  assert.equal(launches(), 3);
  const reports = await Promise.all(done.event.payload.outcomes.map(item => f.core.store.json(item.results[0])));
  assert.deepEqual(reports.map(report => report.outcome), ['PASS', 'PASS']);
  assert.equal(reports[0].findings[0].severity, 'low');
  const { state } = await f.core.state();
  assert.equal((await boundaryReviews(f.core, state, await f.core.store.json(state.candidate))).outcome, 'PASS');
});

// Issue #140: report reviewer unavailability honestly.
const verify = (f, operationId, expected = 41) => f.request('gate.execute', { gates: ['verification'], configuration: {
  validation: { kind: 'alternative', reason: 'Offline fixture', scope: 'Constant export' },
  checks: [{ repository: 'app', command: process.execPath, args: ['--input-type=module', '-e', `import { answer } from './app.js'; if(answer !== ${expected}) process.exit(1)`], purpose: 'Verify fixture export' }],
} }, operationId);
async function unverified(t, rigor = 'full') {
  const f = await fixture(t, { rigor });
  await candidate(f, 'SLICE', f.base);
  await f.request('review.select', selection(), 'select');
  return f;
}
const eventCount = async f => (await f.core.state()).events.length;
const rounds = async f => (await f.core.state()).state.reviewScopes;
const verificationRequired = error => error.code === 'VERIFICATION_REQUIRED'
  && /candidate\.prepare -> gate\.execute \["verification"\] -> review\.execute/.test(error.message);
// The results of the latest job each provider ran, from the journal.
async function jobResults(f, provider) {
  const { events } = await f.core.state();
  const started = events.filter(event => event.type === 'JOB_STARTED');
  let latest = null;
  for (const event of started) if ((await f.core.store.json(event.payload.input)).configuration.provider === provider) latest = event.payload.jobId;
  return events.findLast(event => event.type === 'JOB_OUTCOME_READY' && event.payload.jobId === latest)?.payload.results;
}
const transientError = () => Object.assign(new Error('Evaluator unavailable: transient-service-failure; check the provider configuration before retrying.'),
  { code: 'AGENT_PROVIDER_TRANSIENT', providerFailure: { category: 'transient-service-failure' } });

test('review.execute without verification refuses before the round and the same operation succeeds after verification', async t => {
  const f = await unverified(t), launches = pairedAdapters(f);
  const before = await eventCount(f);
  await assert.rejects(f.request('review.execute', {}, 'no-verification'), verificationRequired);
  assert.equal(launches(), 0, 'No reviewer starts');
  assert.equal(await eventCount(f), before, 'The refusal appends no event');
  assert.deepEqual(await rounds(f), {}, 'No round is counted');
  await verify(f, 'late-verification');
  const done = await f.request('review.execute', {}, 'no-verification');
  assert.deepEqual(done.event.payload.outcomes.map(row => row.status), ['completed', 'completed']);
  assert.equal(launches(), 2);
  assert.equal((await rounds(f)).slice.round, 1);
});
for (const outcome of ['FAIL', 'UNAVAILABLE']) test(`review.execute refuses when the latest verification is ${outcome}`, async t => {
  const f = await unverified(t), launches = pairedAdapters(f);
  if (outcome === 'FAIL') await verify(f, 'failing-verification', 42);
  else {
    // A runner that cannot start leaves an UNAVAILABLE verification result.
    await f.request('gate.execute', { gates: ['verification'], configuration: { validation: { kind: 'alternative', reason: 'Offline fixture', scope: 'Constant export' },
      checks: [{ repository: 'app', command: '/nonexistent/runner', args: [], purpose: 'Cannot start' }] } }, 'unavailable-verification');
  }
  const { state } = await f.core.state();
  const latest = await f.core.store.json(state.results.at(-1));
  assert.equal(latest.outcome === 'PASS', false, latest.summary);
  const before = await eventCount(f);
  await assert.rejects(f.request('review.execute', {}, 'after-bad-verification'), error => verificationRequired(error) && new RegExp(latest.outcome).test(error.message));
  assert.equal(launches(), 0);
  assert.equal(await eventCount(f), before);
  assert.deepEqual(await rounds(f), {});
});
test('an individual review without verification refuses with the same code and counts no round', async t => {
  const f = await unverified(t), launches = pairedAdapters(f);
  const selected = (await f.core.state()).state.reviewerSelection;
  const before = await eventCount(f);
  await assert.rejects(f.request('gate.execute', { gates: ['review'], configuration: { provider: 'codex', model: 'fixture', reviewerSelection: selected.event } }, 'single-unverified'), verificationRequired);
  assert.equal(launches(), 0);
  assert.equal(await eventCount(f), before);
  assert.deepEqual(await rounds(f), {});
});

test('a packet-assembly precondition refuses both reviewers without counting a round', async t => {
  const f = await prepared(t, 'full'), launches = pairedAdapters(f);
  // Planning lint fails while each reviewer's packet is assembled.
  await writeFile(join(f.home, 'tracker.md'), '# Tracker\n## Rubric Status\n| R9 | Unknown | NOT YET | pending |\n## Review Log\n');
  const done = await f.request('review.execute', {}, 'packet-refused');
  assert.equal(launches(), 0);
  for (const row of done.event.payload.outcomes) {
    assert.equal(row.status, 'refused', JSON.stringify(row));
    assert.match(row.reason, /unknown criterion R9/);
    assert.equal(row.results.length, 1, 'The refusal result stays retained');
    assert.equal((await f.core.store.json(row.results[0])).reviewerLaunched, false);
  }
  assert.deepEqual(await rounds(f), {}, 'No reviewer ran, so no round is counted');
});
test('each status class is reported with its reason, and a round with a reviewer that ran counts', async t => {
  const f = await prepared(t, 'full');
  pairedAdapters(f);
  const adapters = f.core.runtime.evaluators;
  const run = { codex: adapters.codex.runStage.bind(adapters.codex), 'claude-code': adapters['claude-code'].runStage.bind(adapters['claude-code']) };
  const cases = [
    ['provider-failed', () => { throw Object.assign(new Error('Evaluator unavailable: authentication; check the provider configuration before retrying.'), { code: 'AGENT_PROVIDER_CONFIGURATION', providerFailure: { category: 'authentication' } }); }],
    ['could-not-assess', async request => {
      const result = await run.codex(request);
      for (const verdict of result.output.verdicts) { verdict.outcome = 'UNAVAILABLE'; verdict.summary = 'R1 needs post-merge evidence that is not in the packet.'; }
      result.receipt.digests.output = sha256Digest(result.output); return result;
    }],
    ['verdict-rejected', () => { throw Object.assign(new Error('Codex structured output returned malformed JSON; request a fresh structured response.'), { providerFailure: { category: 'malformed-output' } }); }],
  ];
  for (const [status, stage] of cases) {
    adapters.codex.runStage = stage;
    const done = await f.request('review.execute', {}, `status-${status}`);
    const [codex, claude] = done.event.payload.outcomes;
    assert.equal(codex.status, status, JSON.stringify(codex));
    assert.ok(codex.reason, 'A non-completed row carries a reason');
    assert.equal(codex.results.length, 1);
    assert.deepEqual(codex.results, await jobResults(f, 'codex'), 'The row keeps the exact results of its latest launched job');
    assert.equal(claude.status, 'completed');
    assert.equal(claude.reason, undefined);
    assert.ok(done.event.payload.outcomes.every(row => ['completed', 'refused', 'provider-failed', 'verdict-rejected', 'could-not-assess'].includes(row.status)));
  }
  assert.equal((await rounds(f)).slice.round, 1, 'Rounds in which a reviewer ran and failed count; one revision is one round');
});
test('an execution that launched no reviewer is refused and one that failed after launch is a provider failure', () => {
  assert.equal(outcomeStatus({ status: 'fulfilled', value: { status: 'UNAVAILABLE', reason: 'Prior execution outcome is uncertain.' } }, null), 'refused');
  assert.equal(outcomeStatus({ status: 'rejected', reason: Object.assign(new Error('x'), { beforeAdmission: true, reviewerLaunched: false }) }), 'refused');
  assert.equal(outcomeStatus({ status: 'rejected', reason: Object.assign(new Error('x'), { reviewerLaunched: false }) }), 'refused');
  assert.equal(outcomeStatus({ status: 'rejected', reason: Object.assign(new Error('Active run changed'), { reviewerLaunched: true }) }), 'provider-failed');
  assert.equal(outcomeStatus({ status: 'fulfilled', value: {} }, { outcome: 'UNAVAILABLE', unavailableReason: 'other', reviewerLaunched: true }), 'provider-failed');
  assert.equal(outcomeStatus({ status: 'fulfilled', value: {} }, { outcome: 'UNAVAILABLE', unavailableReason: 'timeout' }), 'provider-failed');
  assert.equal(outcomeStatus({ status: 'fulfilled', value: {} }, { outcome: 'FAIL' }), 'completed');
});

for (const provider of ['codex', 'claude-code']) test(`${provider}: a transient provider failure is retried once in the same round`, async t => {
  const f = await prepared(t, 'full'), launches = pairedAdapters(f);
  const adapter = f.core.runtime.evaluators[provider], run = adapter.runStage.bind(adapter);
  const rounds_ = [];
  let calls = 0;
  adapter.runStage = async request => { rounds_.push(request.input.roundPolicy?.round); if (++calls === 1) throw transientError(); return run(request); };
  const done = await f.request('review.execute', {}, `transient-${provider}`);
  assert.equal(calls, 2, 'Exactly one automatic retry');
  assert.equal(launches(), 2, 'The peer once and the successful retry once reach the fixture verdict');
  const row = done.event.payload.outcomes.find(item => item.provider === provider);
  assert.equal(row.status, 'completed', JSON.stringify(row));
  const result = await f.core.store.json(row.results[0]);
  assert.equal(result.outcome, 'PASS', 'The row references the successful retry result');
  const { state, events } = await f.core.state();
  const jobs = events.filter(event => event.type === 'JOB_STARTED');
  const inputs = await Promise.all(jobs.map(event => f.core.store.json(event.payload.input)));
  const mine = inputs.filter(input => input.configuration.provider === provider);
  assert.equal(mine.length, 2);
  assert.equal(new Set(jobs.filter((_, index) => inputs[index].configuration.provider === provider).map(event => event.payload.jobId)).size, 2, 'The retry has its own operation identity');
  assert.ok(mine.every(input => input.reviewRound === mine[0].reviewRound), 'The retry shares the round baseline');
  assert.equal(state.reviewScopes.slice.round, 1, 'The retry is not a new round');
  const pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  assert.equal(pair.outcome, 'PASS');
});
test('a second transient failure is a provider failure and timeouts or non-transient failures are not retried', async t => {
  const f = await prepared(t, 'full');
  pairedAdapters(f);
  const adapter = f.core.runtime.evaluators.codex;
  for (const [label, error, expectedCalls, category] of [
    ['transient twice', transientError, 2, 'transient-service-failure'],
    ['timeout', () => Object.assign(new Error('codex timed out'), { code: 'AGENT_PROVIDER_TIMEOUT' }), 1, 'timeout'],
    ['authentication', () => Object.assign(new Error('Evaluator unavailable: authentication; check the provider configuration before retrying.'), { code: 'AGENT_PROVIDER_CONFIGURATION', providerFailure: { category: 'authentication' } }), 1, 'authentication'],
    ['unclassified', () => new Error('Provider process crashed'), 1, 'unclassified'],
  ]) {
    let calls = 0;
    adapter.runStage = async () => { calls++; throw error(); };
    const done = await f.request('review.execute', {}, `no-retry-${label.replace(/ /gu, '-')}`);
    assert.equal(calls, expectedCalls, label);
    const row = done.event.payload.outcomes[0];
    assert.equal(row.status, 'provider-failed', label);
    assert.ok(row.reason);
    assert.deepEqual((await f.core.store.json(row.results[0])).providerFailure, { category }, `${label} records its provider failure category`);
  }
});
test('a retried reviewer whose verdict is then rejected gets exactly one repair turn', async t => {
  const f = await prepared(t, 'full');
  pairedAdapters(f);
  const adapter = f.core.runtime.evaluators.codex, run = adapter.runStage.bind(adapter);
  const repairs = [];
  let calls = 0;
  adapter.runStage = async request => {
    if (++calls === 1) throw transientError();
    repairs.push(request.input.repair);
    const result = await run(request);
    // Every answer omits the failure scenario, so the repair fails too.
    result.output.verdicts[0].findings = [{ id: 'advisory', classId: 'constant', classStatement: 'Constant naming', severity: 'low',
      criterion: 'R1', path: 'app/app.js', evidence: 'The constant could use a comment.', blocking: false }];
    result.receipt.digests.output = sha256Digest(result.output);
    return result;
  };
  const done = await f.request('review.execute', {}, 'retry-then-repair');
  assert.equal(calls, 3, 'First attempt, one transient retry, one repair turn');
  assert.equal(repairs[0], null);
  assert.ok(repairs[1], 'The third call is the repair turn');
  const row = done.event.payload.outcomes[0];
  assert.equal(row.status, 'verdict-rejected');
  assert.match(row.reason, /failureScenario/);
  assert.equal((await rounds(f)).slice.round, 1);
});
test('a retry refused before launch keeps the row classified from the attempt that launched', async t => {
  const f = await prepared(t, 'full');
  pairedAdapters(f);
  const adapter = f.core.runtime.evaluators.codex;
  let calls = 0;
  adapter.runStage = async () => { calls++; throw transientError(); };
  const append = f.core.append.bind(f.core);
  const codexJobs = new Set();
  f.core.append = async (...args) => {
    if (args[1] === 'JOB_STARTED' && (await f.core.store.json(args[2].input)).configuration.provider === 'codex'
      && codexJobs.add(args[2].jobId).size === 2) throw new Error('Retry admission refused');
    return append(...args);
  };
  const done = await f.request('review.execute', {}, 'retry-refused');
  assert.equal(calls, 1, 'The refused retry launched no reviewer');
  const row = done.event.payload.outcomes[0];
  assert.equal(row.status, 'provider-failed', JSON.stringify(row));
  assert.match(row.reason, /transient-service-failure/);
  assert.equal((await rounds(f)).slice.round, 1, 'A launched attempt counts the round');
});
test('a claim naming a finding GateReeve no longer holds refuses both reviewers, names the claim and counts no round', async t => {
  const f = await prepared(t, 'full'), launches = pairedAdapters(f);
  await f.request('review.execute', {}, 'initial-pair');
  const after = (await rounds(f)).slice.round;
  const head = await branchWith(f, 'claimed', { 'app.js': 'export const answer = 41; // revised\n' });
  await candidate(f, 'SLICE', head, 'claimed-candidate');
  await verify(f, 'claimed-verification');
  const done = await f.request('review.execute', { claims: [{ findingId: 'codex/stale-id', claim: 'Fixed in this revision.' }] }, 'stale-claim');
  assert.equal(launches(), 2, 'Only the initial pair launched');
  for (const row of done.event.payload.outcomes) {
    assert.equal(row.status, 'refused', JSON.stringify(row));
    assert.match(row.reason, /^Disposition claim lacks a retained finding: claims\[0\] names codex\/stale-id/);
  }
  assert.equal((await rounds(f)).slice.round, after, 'The refused revision is not charged a round');
});
test('a repair turn whose provider fails ends provider-failed, and provider failures record their category', async t => {
  const f = await prepared(t, 'full');
  pairedAdapters(f);
  const adapter = f.core.runtime.evaluators.codex, run = adapter.runStage.bind(adapter);
  let calls = 0;
  adapter.runStage = async request => {
    calls++;
    if (calls === 1) throw transientError();
    if (calls === 3) throw Object.assign(new Error('codex timed out'), { code: 'AGENT_PROVIDER_TIMEOUT' });
    const result = await run(request);
    result.output.verdicts[0].findings = [{ id: 'advisory', classId: 'constant', classStatement: 'Constant naming', severity: 'low',
      criterion: 'R1', path: 'app/app.js', evidence: 'The constant could use a comment.', blocking: false }];
    result.receipt.digests.output = sha256Digest(result.output);
    return result;
  };
  const done = await f.request('review.execute', {}, 'repair-times-out');
  assert.equal(calls, 3);
  const row = done.event.payload.outcomes[0];
  assert.equal(row.status, 'provider-failed', JSON.stringify(row));
  assert.match(row.reason, /timed out/);
  const { state } = await f.core.state();
  const results = await Promise.all(state.results.map(ref => f.core.store.json(ref)));
  const transient = results.find(result => result.gate === 'review' && result.providerFailure);
  assert.deepEqual(transient.providerFailure, { category: 'transient-service-failure' });
});
test('explicit earlier passing proof cannot reach behind a later failing verification', async t => {
  const f = await unverified(t), launches = pairedAdapters(f);
  const passing = (await verify(f, 'passing-verification')).event.payload.results;
  await verify(f, 'later-failing-verification', 42);
  const before = await eventCount(f);
  await assert.rejects(f.request('review.execute', { consumed: passing }, 'explicit-stale-proof'), error => verificationRequired(error) && /latest current verification result is FAIL/.test(error.message));
  assert.equal(launches(), 0);
  assert.equal(await eventCount(f), before);
  assert.deepEqual(await rounds(f), {});
});
test('a failure before the provider launches (adapter checks) is refused and counts no round', async t => {
  const f = await prepared(t, 'full'), launches = pairedAdapters(f);
  for (const adapter of Object.values(f.core.runtime.evaluators)) adapter.describe = async () => { throw new Error('Adapter descriptor unavailable'); };
  const done = await f.request('review.execute', {}, 'describe-fails');
  assert.equal(launches(), 0);
  for (const row of done.event.payload.outcomes) {
    assert.equal(row.status, 'refused', JSON.stringify(row));
    assert.match(row.reason, /descriptor unavailable/);
    assert.equal((await f.core.store.json(row.results[0])).reviewerLaunched, false);
  }
  assert.deepEqual(await rounds(f), {});
  const selected = (await f.core.state()).state.reviewerSelection;
  await f.request('gate.execute', { gates: ['review'], configuration: { provider: 'codex', model: 'fixture', reasoningEffort: 'high', reviewerSelection: selected.event } }, 'individual-describe-fails');
  assert.deepEqual(await rounds(f), {}, 'An individual review that never launched counts no round');
});
test('a repair turn refused before launch keeps the rejected verdict and its result', async t => {
  const f = await prepared(t, 'full');
  pairedAdapters(f);
  const adapter = f.core.runtime.evaluators.codex, run = adapter.runStage.bind(adapter);
  let calls = 0;
  adapter.runStage = async request => {
    calls++;
    const result = await run(request);
    result.output.verdicts[0].findings = [{ id: 'advisory', classId: 'constant', classStatement: 'Constant naming', severity: 'low',
      criterion: 'R1', path: 'app/app.js', evidence: 'The constant could use a comment.', blocking: false }];
    result.receipt.digests.output = sha256Digest(result.output);
    return result;
  };
  const append = f.core.append.bind(f.core);
  const codexJobs = new Set();
  f.core.append = async (...args) => {
    if (args[1] === 'JOB_STARTED' && (await f.core.store.json(args[2].input)).configuration.provider === 'codex'
      && codexJobs.add(args[2].jobId).size === 2) throw new Error('Repair admission refused');
    return append(...args);
  };
  const done = await f.request('review.execute', {}, 'repair-refused');
  assert.equal(calls, 1, 'The refused repair launched no reviewer');
  const row = done.event.payload.outcomes[0];
  assert.equal(row.status, 'verdict-rejected', JSON.stringify(row));
  assert.match(row.reason, /failureScenario/);
  assert.deepEqual(row.results, await jobResults(f, 'codex'), 'The row keeps the launched attempt result');
  assert.equal((await rounds(f)).slice.round, 1);
});
