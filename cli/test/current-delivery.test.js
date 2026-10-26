// Synthetic evaluator transport tests; these are not independent product reviews.
import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { currentFixture } from './helpers/current-fixture.js';
import { fixtureEvaluator } from './helpers/established-current-run.js';
import { git } from '../../plugin-src/shared/resources/protocol/current/evidence.js';
import { sha256Digest } from '../../plugin-src/shared/resources/protocol/agent-workflow.js';
import { reviewSchema, validateFormatRepair } from '../../plugin-src/shared/resources/protocol/current/execution.js';

async function ready(t) {
  const f = await currentFixture(t);
  f.request = (operation, input = {}, operationId) => f.core.execute({ operation, input, operationId });
  for (const name of ['scratchpad.md', 'decisions.md', 'tracker.md']) await writeFile(join(f.home, name), '# No material scope changes\n');
  await mkdir(join(f.root, '.pattern-review')); await writeFile(join(f.root, '.pattern-review/rules.yaml'), '[]\n');
  const authority = { kind: 'human-confirmed', instruction: 'Fixture only', context: 'Isolated regression' };
  await f.request('run.start', { runId: 'delivery-test', implementers: ['test-implementer'] });
  const design = await f.core.store.capture('design.md');
  await f.request('human.decide', { kind: 'approve-design', subject: design.hash, authority, reason: 'Fixture', consequences: 'Plan' });
  await f.request('spec.validate');
  await f.request('human.decide', { kind: 'authorize-implementation', subject: (await f.core.commitments()).subject, authority, reason: 'Fixture', consequences: 'Implement' });
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: head, head }], scope: 'SLICE', criteria: ['R1'] });
  await f.request('candidate.ready');
  return f;
}
const reviewConfig = { provider: 'codex', model: 'fixture' };
async function verify(f, code = 'process.exit(0)', operationId) {
  const result = await f.request('gate.execute', { gates: ['verification'], configuration: { checks: [{ repository: 'app', command: process.execPath, args: ['-e', code], purpose: 'Test required behavior' }], externalRuntimeInputs: { app: [] } } }, operationId);
  return result.results ?? result.event.payload.results;
}
function evaluator(f, transform) {
  const count = fixtureEvaluator(f);
  const original = f.core.runtime.evaluator.runStage;
  f.core.runtime.evaluator.runStage = async request => {
    const result = await original(request); transform?.(result.output, request);
    result.receipt.digests.output = sha256Digest(result.output);
    return result;
  };
  return count;
}

test('schema constrains criterion IDs and contract repair cannot erase findings', () => {
  const variants = reviewSchema(['code', 'spec'], ['R1']).properties.verdicts.items.anyOf;
  assert.deepEqual(variants[0].properties.findings.items.properties.criterion.enum, ['R1', 'gate:code']);
  const original = { gate: 'code', outcome: 'FAIL', findings: [{ id: 'f', classId: 'bug', criterion: 'code', path: 'app/app.js', evidence: 'bad branch', blocking: true }] };
  const fixed = structuredClone(original); fixed.findings[0].criterion = 'gate:code';
  assert.doesNotThrow(() => validateFormatRepair(original, fixed));
  assert.throws(() => validateFormatRepair(original, { ...fixed, outcome: 'PASS' }));
  assert.throws(() => validateFormatRepair(original, { ...fixed, findings: [] }));
});

test('invalid reviewer criterion remains visible and independent targeted repair preserves the defect', async t => {
  const f = await ready(t);
  evaluator(f, (output, request) => {
    if (request.input.repair) output.verdicts = [{ ...request.input.repair.original,
      findings: request.input.repair.original.findings.map(item => ({ ...item, criterion: 'gate:code' })) }];
    else Object.assign(output.verdicts[0], { outcome: 'FAIL', findings: [{ id: 'defect', classId: 'bug', criterion: 'code', path: 'app/app.js', evidence: 'A supported fixture defect', blocking: true }] });
  });
  const first = await f.request('gate.execute', { gates: ['code'], configuration: reviewConfig });
  const ref = first.event.payload.results[0], invalid = await f.core.store.json(ref);
  assert.equal(invalid.outcome, 'UNAVAILABLE'); assert.equal(invalid.unvalidatedFindings[0].id, 'defect');
  const repaired = await f.request('gate.execute', { gates: ['code'], configuration: reviewConfig, repair: ref });
  const report = await f.core.store.json(repaired.event.payload.results[0]);
  assert.equal(report.outcome, 'FAIL', report.summary); assert.equal(report.findings[0].id, 'defect');
  assert.equal((await f.core.store.json(ref)).unvalidatedFindings[0].criterion, 'code');
});

test('replacement coverage is qualified in the existing review and cannot be self-declared', async t => {
  const f = await ready(t), prior = await verify(f, 'process.exit(1)'), replacement = await verify(f, 'process.exit(0)');
  const { state } = await f.core.state(), candidate = await f.core.store.json(state.candidate);
  await assert.rejects(f.core.verificationCoverage(candidate, state, new Map()), /uncovered prior behavior/);
  evaluator(f, (output, request) => { for (const verdict of output.verdicts) verdict.coverageDecisions = request.input.coverageClaims.map(claim => ({ id: claim.id, outcome: 'PASS', evidence: 'Fixture replacement covers original failing behavior' })); });
  const assessed = await f.request('gate.execute', { gates: ['spec'], configuration: reviewConfig, consumed: replacement,
    coverageClaims: [{ id: 'replacement', supersedes: prior, replacements: replacement, criteria: ['R1'], reason: 'Original assertion is covered by the revised suite' }] });
  const report = await f.core.store.json(assessed.event.payload.results[0]); assert.equal(report.outcome, 'PASS', report.summary);
  const current = (await f.core.state()).state;
  await f.core.verificationCoverage(candidate, current, new Map());
  assert.equal((await f.core.store.json(prior[0])).outcome, 'FAIL');
});

test('planning judgments batch with code/spec and administrative gates need no separate launches', async t => {
  const f = await ready(t); await verify(f);
  const count = evaluator(f);
  const batch = await f.request('gate.execute', { gates: ['code', 'spec', 'reconcile', 'triage'], configuration: reviewConfig });
  for (const ref of batch.event.payload.results) { const report = await f.core.store.json(ref); assert.equal(report.outcome, 'PASS', report.summary); }
  assert.equal(count(), 1);
  for (const gate of ['judge', 'pattern', 'explanation']) await f.request('gate.execute', { gates: [gate], configuration: reviewConfig });
  const check = await f.request('milestone.check', { name: 'acceptance' });
  assert.equal(check.allowed, true, check.missing.join('; '));
  for (const gate of ['context', 'packet']) assert.equal(check.outcomes.find(item => item.id === gate).administrative.outcome, 'PASS');
  const passed = await f.request('milestone.pass', { name: 'acceptance' });
  assert.ok(passed.event.payload.outcomes.some(item => item.administrative));
});


test('failed command diagnostics bound retained excerpts and redact private inherited values', async () => {
  const { runnerDiagnostics } = await import('../../plugin-src/shared/resources/protocol/current/diagnostics.js');
  const result = runnerDiagnostics({ outcome: 'FAIL', stdout: 'secret-value'.repeat(10000), stderr: '/private/home error' },
    { environment: { inherit: ['API_TOKEN'] } }, { API_TOKEN: 'secret-value', HOME: '/private/home' });
  assert.equal(result.diagnostic.truncated, true);
  assert.ok(Buffer.byteLength(result.diagnostic.excerpt) <= 65536);
  assert.ok(!JSON.stringify(result).includes('secret-value'));
  assert.ok(!JSON.stringify(result).includes('/private/home'));
});

test('generated outputs require preparation provenance and preserve build/check identity', async t => {
  const f = await ready(t);
  await mkdir(join(f.repo, 'node_modules'), { recursive: true });
  const check = { repository: 'app', command: process.execPath, args: ['-e', "const fs=require('fs');if(fs.readFileSync('build/value','utf8')!=='42')process.exit(1)"], purpose: 'Read generated output', generatedInputs: [{ path: 'build', fromCheck: 0 }] };
  const build = { repository: 'app', command: process.execPath, args: ['-e', "const fs=require('fs');fs.mkdirSync('build',{recursive:true});fs.writeFileSync('build/value','42')"], purpose: 'Prepare reviewed source', produces: ['build'] };
  // Generated output is intentionally ignored application build output.
  await writeFile(join(f.repo, '.git/info/exclude'), 'build/\n');
  const ran = await f.request('gate.execute', { gates: ['verification'], configuration: { externalRuntimeInputs: { app: [] }, checks: [build, check] } });
  const ref = ran.event.payload.results[0], report = await f.core.store.json(ref);
  assert.equal(report.outcome, 'PASS', report.summary);
  const receipts = (await f.core.store.json(report.runner)).receipts;
  assert.equal(receipts[1].generatedInputs[0].hash, receipts[0].outputs[0].hash);
  await writeFile(join(f.repo, 'build/value'), 'stale');
  const stale = await f.request('gate.execute', { gates: ['verification'], configuration: { externalRuntimeInputs: { app: [] },
    checks: [{ ...check, generatedInputs: [{ path: 'build', fromResult: ref }] }] } });
  const rejected = await f.core.store.json(stale.event.payload.results[0]);
  assert.equal(rejected.outcome, 'UNAVAILABLE'); assert.match(rejected.summary, /provenance|output changed/);
  assert.equal((await f.core.store.json(rejected.runner)).receipts.length, 0);
});

test('derived coverage cannot assert proof, and resume returns pending work without launching it', async t => {
  const f = await ready(t);
  const before = (await f.core.state()).state.eventCount;
  const coverage = await f.request('coverage.status');
  assert.equal(coverage.criteria[0].outcome, 'NOT YET');
  assert.equal((await f.core.state()).state.eventCount, before);
  await assert.rejects(f.request('coverage.status', { outcome: 'PASS' }), /no asserted outcomes/);
  const result = await f.request('delivery.resume');
  assert.equal(result.status, 'needs-attention'); assert.ok(result.missing.some(item => item.includes('verification')));
  await f.request('run.pause', { authority: { kind: 'human-confirmed', instruction: 'Pause fixture', context: 'Regression' } });
  assert.match((await f.request('delivery.resume')).reason, /paused/);
});

test('native evaluator repairs a retained synthetic malformed response without erasing its finding', { skip: process.env.GATEREEVE_LIVE_EVALUATOR !== '1' }, async t => {
  const f = await ready(t), model = process.env.GATEREEVE_AGENT_MODEL;
  assert.ok(model, 'Choose an explicit native model');
  evaluator(f, output => Object.assign(output.verdicts[0], { outcome: 'FAIL', findings: [{ id: 'retained-fixture-finding', classId: 'fixture',
    criterion: 'code', path: 'app/app.js', evidence: 'Synthetic response-contract exercise: preserve this original observation verbatim.', blocking: true }] }));
  const simulated = f.core.runtime.evaluator;
  f.core.runtime.evaluator = {
    describe: async () => ({ ...(await simulated.describe()), model }),
    runStage: async request => { const result = await simulated.runStage(request); result.receipt.provider.model = model; return result; },
  };
  const configuration = { provider: 'codex', model, reasoningEffort: 'high', timeoutSeconds: 240 };
  const first = await f.request('gate.execute', { gates: ['code'], configuration });
  const original = first.event.payload.results[0];
  assert.equal((await f.core.store.json(original)).outcome, 'UNAVAILABLE');
  delete f.core.runtime.evaluator;
  const corrected = await f.request('gate.execute', { gates: ['code'], configuration, repair: original });
  const ref = corrected.event.payload.results[0], report = await f.core.store.json(ref);
  if (process.env.GATEREEVE_LIVE_RECEIPT) await writeFile(process.env.GATEREEVE_LIVE_RECEIPT, JSON.stringify({
    exercise: 'Synthetic malformed original; actual fresh native evaluator correction. Not a product review.',
    original: await f.core.store.json(original), corrected: report, receipt: await f.core.store.json(report.receipt),
    artifacts: await Promise.all(report.artifacts.map(item => f.core.store.json(item))),
  }, null, 2));
  assert.equal(report.outcome, 'FAIL', report.summary);
  assert.equal(report.findings[0].id, 'retained-fixture-finding');
  assert.equal(report.findings[0].criterion, 'gate:code');
  assert.notEqual((await f.core.store.json(report.receipt)).evaluator.contextId, 'test-implementer');
});
