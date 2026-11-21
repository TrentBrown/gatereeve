import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { boundaryReviews } from '../../plugin-src/shared/resources/protocol/current/boundary-review.js';
import { sha256Digest } from '../../plugin-src/shared/resources/protocol/agent-workflow.js';

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
        verdict.findings = [{ id: 'new-advisory', classId: 'constant', criterion: request.input.criteria[0],
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

test('Claude can supply an omitted severity and qualify the same pinned source in its retry', async t => {
  const f = await prepared(t, 'full');
  const launches = pairedAdapters(f);
  const adapter = f.core.runtime.evaluators['claude-code'];
  const run = adapter.runStage.bind(adapter);
  const advisory = { id: 'omitted-severity', classId: 'constant', criterion: 'R1',
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

test('semantic verdict failures get one fresh assessment with retained verification and diagnostics', async t => {
  const f = await prepared(t);
  pairedAdapters(f);
  await f.request('review.execute', {}, 'establish-independence');
  pairedAdapters(f, { blocking: ['codex'] });
  const { reviewerSelection } = (await f.core.state()).state;
  const seeded = await f.request('gate.execute', { gates: ['review'], configuration: {
    provider: 'codex', model: 'fixture', reviewerSelection: reviewerSelection.event, reviewRevision: 'record-blocker',
  } }, 'record-blocker');
  const prior = await f.core.store.json(seeded.event.payload.results[0]);
  assert.equal(prior.outcome, 'FAIL', prior.summary);
  const blocker = prior.findings[0].id;
  pairedAdapters(f);
  const calls = { codex: [], 'claude-code': [] };
  for (const [provider, adapter] of Object.entries(f.core.runtime.evaluators)) {
    const run = adapter.runStage.bind(adapter);
    adapter.runStage = async request => {
      calls[provider].push(request.input);
      const result = await run(request);
      const verdict = result.output.verdicts[0];
      verdict.dispositions = [{ id: blocker, status: 'present', evidence: 'The original issue remains.' }];
      if (provider === 'codex') {
        verdict.dispositions.push({ id: 'same-local-id', status: 'present', evidence: 'An unqualified ID is not disclosed.' });
        if (!request.input.reassessment) verdict.findings = [{ id: 'new-observation', classId: 'constant', criterion: request.input.criteria[0],
          path: 'app/app.js', evidence: 'The fixture exports a constant.', blocking: false }];
      } else if (request.input.reassessment) {
        verdict.outcome = 'FAIL';
        verdict.dimensions.find(row => row.name === 'code').outcome = 'FAIL';
      }
      result.receipt.digests.output = sha256Digest(result.output);
      result.receipt.provider.contextId += `-${calls[provider].length}`;
      return result;
    };
  }
  const done = await f.request('review.execute', {}, 'reassess');
  for (const [provider, attempts] of Object.entries(calls)) {
    assert.equal(attempts.length, 2);
    const [first, retry] = attempts;
    assert.equal(retry.repair, null);
    assert.deepEqual(retry.source, first.source);
    assert.deepEqual(retry.consumedReferences, first.consumedReferences);
    const retained = await f.core.store.json(retry.reassessment.reference);
    assert.equal(retained.outcome, 'UNAVAILABLE');
    assert.equal(retained.unvalidatedVerdict.outcome, 'PASS');
    assert.deepEqual(retry.reassessment.observations, retained.unvalidatedFindings);
  }
  const codex = calls.codex[1].reassessment;
  assert.equal(codex.code, 'unknown-disposition');
  assert.deepEqual(codex.findingIds, ['same-local-id']);
  assert.ok(codex.permittedIds.includes(blocker));
  const claude = calls['claude-code'][1].reassessment;
  assert.equal(claude.code, 'blocking-disposition');
  assert.deepEqual(claude.findingIds, [blocker]);
  const reports = await Promise.all(done.event.payload.outcomes.map(row => f.core.store.json(row.results[0])));
  assert.deepEqual(reports.map(row => row.outcome), ['UNAVAILABLE', 'FAIL']);
  assert.equal(reports[0].verdictFailure.kind, 'assessment');
  const { state } = await f.core.state();
  const pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  assert.match(pair.summary, /openai: UNAVAILABLE: Review contract failure/);
  assert.match(pair.summary, /anthropic: FAIL/);
});
