import './helpers/private-scratch.js';
// Spec AC13 (D33): workflow robustness. Synthetic evaluator transport tests;
// these are not independent product reviews.
import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { currentFixture } from './helpers/current-fixture.js';
import { fixtureEvaluator } from './helpers/established-current-run.js';
import { git } from '../../plugin-src/shared/resources/protocol/current/evidence.js';
import { sha256Digest } from '../../plugin-src/shared/resources/protocol/agent-workflow.js';
import { processIdentity } from '../../plugin-src/shared/resources/storage/scratch.js';

async function authorized(t, { decisions = true } = {}) {
  const f = await currentFixture(t);
  f.request = (operation, input = {}, operationId) => f.core.execute({ operation, input, operationId });
  for (const name of ['scratchpad.md', 'decisions.md', 'tracker.md']) await writeFile(join(f.home, name), '# No material scope changes\n');
  await mkdir(join(f.root, '.pattern-review')); await writeFile(join(f.root, '.pattern-review/rules.yaml'), '[]\n');
  const authority = { kind: 'human-confirmed', instruction: 'Fixture only', context: 'Isolated regression' };
  await f.request('run.start', { runId: 'robustness-test', implementers: ['test-implementer'] });
  const design = await f.core.store.capture('design.md');
  await f.request('human.decide', { kind: 'approve-design', subject: design.hash, authority, reason: 'Fixture', consequences: 'Plan' });
  await f.request('spec.validate');
  await f.request('human.decide', { kind: 'authorize-implementation', subject: (await f.core.commitments()).subject, authority, reason: 'Fixture', consequences: 'Implement' });
  if (!decisions) await rm(join(f.home, 'decisions.md'));
  f.head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  f.prepare = () => f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head: f.head }], scope: 'SLICE', criteria: ['R1'] });
  return f;
}
async function ready(t) {
  const f = await authorized(t);
  await f.prepare(); await f.request('candidate.ready');
  return f;
}
const reviewConfig = { provider: 'codex', model: 'fixture' };
const check = (code, extra = {}) => ({ repository: 'app', command: process.execPath, args: ['-e', code], purpose: 'Test required behavior', ...extra });
async function verify(f, checks, operationId) {
  const result = await f.request('gate.execute', { gates: ['verification'], configuration: { validation: { kind: 'alternative', reason: 'Offline fixture', scope: 'Approved fixture criterion' }, checks, externalRuntimeInputs: { app: [] } } }, operationId);
  return result.results ?? result.event.payload.results;
}
function evaluator(f, transform) {
  fixtureEvaluator(f);
  const original = f.core.runtime.evaluator.runStage;
  f.core.runtime.evaluator.runStage = async request => {
    const result = await original(request); transform?.(result.output, request);
    result.receipt.digests.output = sha256Digest(result.output);
    return result;
  };
}

test('candidate.prepare fails naming a missing decisions log', async t => {
  const f = await authorized(t, { decisions: false });
  await assert.rejects(f.prepare(), /Missing lifecycle document decisions\.md/u);
  await writeFile(join(f.home, 'decisions.md'), '# Decisions\nNo changes.\n');
  await f.prepare();
});

test('a declared check replacement is covered once the consuming review accepts it, and refused when it rejects it', async t => {
  const f = await ready(t);
  const original = check('process.exit(1)');
  await verify(f, [original]);
  const { state } = await f.core.state(), candidate = await f.core.store.json(state.candidate);
  await assert.rejects(f.core.verificationCoverage(candidate, state, new Map()), /uncovered prior behavior/u);
  const [self] = await verify(f, [check('process.exit(0)', { replaces: [{ command: process.execPath, args: ['-e', 'process.exit(0)'], reason: 'self' }] })]);
  const refused = await f.core.store.json(self);
  assert.notEqual(refused.outcome, 'PASS'); assert.match(JSON.stringify(refused), /cannot replace itself/u);
  const replacement = await verify(f, [check('process.exit(0)', { replaces: [{ command: original.command, args: original.args, reason: 'The revised suite asserts the same behavior' }] })]);
  let decision = 'FAIL', claims = [];
  evaluator(f, (output, request) => {
    claims = request.input.coverageClaims;
    for (const verdict of output.verdicts) {
      verdict.coverageDecisions = claims.map(claim => ({ id: claim.id, outcome: decision, evidence: 'Fixture assessment of the replacement' }));
      if (decision === 'FAIL') verdict.outcome = 'FAIL';
    }
  });
  // Rejected by the consuming review: still uncovered.
  await f.request('gate.execute', { gates: ['spec'], configuration: reviewConfig, consumed: replacement });
  assert.equal(claims.length, 1); assert.equal(claims[0].kind, 'check-replacement');
  assert.deepEqual(claims[0].replaces, { repository: 'app', command: original.command, args: original.args });
  await assert.rejects(f.core.verificationCoverage(candidate, (await f.core.state()).state, new Map()), /uncovered prior behavior/u);
  // Accepted in the same kind of review (no extra claim input needed): covered.
  decision = 'PASS';
  const assessed = await f.request('gate.execute', { gates: ['spec'], configuration: reviewConfig, consumed: replacement });
  assert.equal((await f.core.store.json(assessed.event.payload.results[0])).outcome, 'PASS');
  await f.core.verificationCoverage(candidate, (await f.core.state()).state, new Map());
});


test('job.abandon accepts a gone runner job, refuses a live or delivery job, and older proof qualifies again', async t => {
  const f = await ready(t);
  const [proof] = await verify(f, [check('process.exit(0)')]);
  const qualify = async () => f.core.currentResult(proof, await f.core.store.json((await f.core.state()).state.candidate), (await f.core.state()).state, new Set(), new Map(), false);
  assert.equal((await qualify()).outcome, 'PASS');
  const live = 'a'.repeat(64), { state: before } = await f.core.state();
  await f.core.append(before, 'JOB_STARTED', { jobId: live, input: before.candidate, gates: ['verification'], owner: { processId: process.pid, processStartedAt: await processIdentity(process.pid) } }, { id: `start_${live}`, hash: `sha256:${'b'.repeat(64)}` });
  await assert.rejects(qualify(), /Pending execution/u);
  await assert.rejects(f.request('job.abandon', { jobId: live, reason: 'Fixture' }), /still running/u);
  await assert.rejects(f.request('job.abandon', { jobId: live }), /needs a reason/u);
  const { state } = await f.core.state();
  await f.core.append(state, 'JOB_ABANDONED', { jobId: live, reason: 'Fixture cleanup of the live stand-in' }, { id: 'fixture_abandon_live', hash: `sha256:${'c'.repeat(64)}` });
  const gone = 'e'.repeat(64);
  await f.core.append((await f.core.state()).state, 'JOB_STARTED', { jobId: gone, input: state.candidate, gates: ['verification'], owner: { processId: process.pid, processStartedAt: 'a process that has exited' } }, { id: `start_${gone}`, hash: `sha256:${'d'.repeat(64)}` });
  await assert.rejects(qualify(), /Pending execution/u);
  const abandoned = await f.request('job.abandon', { jobId: gone, reason: 'The verification process was stopped by a time limit' });
  assert.equal(abandoned.event.type, 'JOB_ABANDONED');
  assert.equal((await qualify()).outcome, 'PASS');
  await assert.rejects(f.request('job.abandon', { jobId: gone, reason: 'Again' }), /already abandoned/u);
  const delivery = 'f'.repeat(64);
  await f.core.append((await f.core.state()).state, 'JOB_STARTED', { jobId: delivery, input: state.candidate, gates: ['finalization'], owner: { processId: process.pid, processStartedAt: 'gone' } }, { id: `start_${delivery}`, hash: `sha256:${'9'.repeat(64)}` });
  await assert.rejects(f.request('job.abandon', { jobId: delivery, reason: 'Fixture' }), /Delivery jobs cannot be abandoned/u);
  const legacy = '1'.repeat(64);
  await f.core.append((await f.core.state()).state, 'JOB_STARTED', { jobId: legacy, input: state.candidate, gates: ['verification'] }, { id: `start_${legacy}`, hash: `sha256:${'8'.repeat(64)}` });
  await assert.rejects(f.request('job.abandon', { jobId: legacy, reason: 'Fixture' }), /cannot be verified gone/u);
});
