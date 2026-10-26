import assert from 'node:assert/strict';
import { isolatedTests } from './helpers/isolated-tests.js';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, readdir, realpath, chmod, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CurrentStore } from '../../plugin-src/shared/resources/protocol/current/store.js';
import { CurrentCore } from '../../plugin-src/shared/resources/protocol/current/core.js';
import { identity } from '../../plugin-src/shared/resources/protocol/current/contracts.js';
import { git, contentIdentity } from '../../plugin-src/shared/resources/protocol/current/evidence.js';

const test = isolatedTests(import.meta.url);
const human = { kind: 'human-confirmed', instruction: 'Approve the named scope.', context: 'test user conversation' };
async function fixture(t, { nested = true, optionalGates = [] } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gatereeve-current-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = nested ? join(root, 'app') : root;
  const home = join(root, 'docs/issues/feature');
  await mkdir(repo, { recursive: true }); await mkdir(home, { recursive: true });
  if (nested) { await mkdir(join(root, '.pattern-review')); await writeFile(join(root, '.pattern-review/rules.yaml'), '[]\n'); }
  await git(repo, ['init', '-b', 'topic']);
  await git(repo, ['config', 'user.email', 'fixture@example.test']);
  await git(repo, ['config', 'user.name', 'Fixture']);
  await git(repo, ['config', 'commit.gpgsign', 'false']);
  await writeFile(join(repo, 'app.js'), 'export const answer = 42;\n');
  await git(repo, ['add', 'app.js']); await git(repo, ['commit', '-m', 'fixture']);
  const head = (await git(repo, ['rev-parse', 'HEAD'])).trim();
  await writeFile(join(home, 'interview.md'), '# Interview\nSettled decisions.\n');
  await writeFile(join(home, 'design.md'), '# Design\n\n**Status:** approved\n');
  await writeFile(join(home, 'spec.md'), '# Spec\n\n## Acceptance Criteria\n\n- **AC1.** Export the constant answer with value 42.\n\n## Rubric\n\n| # | Criterion | Pass | Fail | Evidence |\n|---|---|---|---|---|\n| R1 | AC1 | 42 | other | test |\n\n## Changes\n');
  await writeFile(join(home, 'plan.md'), '# Plan\n## P1 - Implement R1\n');
  await writeFile(join(home, 'issues.md'), '# Issues\n## I-1 - Implement\n**Status:** in-review\n**Plan steps:** P1\n**Rubric criteria:** R1\n');
  await writeFile(join(home, 'tracker.md'), '# Tracker\n## Rubric Status\n| R1 | AC1 | NOT YET | pending |\n## Review Log\n');
  await writeFile(join(home, 'decisions.md'), '# Decisions\nNo changes.\n');
  await writeFile(join(home, 'events.jsonl'), 'old journal preserved verbatim\n');
  const context = { featureId: 'feature', featureHome: home, workspaceRoot: root, repositories: [{ alias: 'app', path: repo, featureBaseSha: head }] };
  const core = await CurrentCore.at(context);
  const request = (operation, input = {}, operationId) => core.execute({ operation, input, operationId });
  await request('run.start', { runId: 'run-one', implementers: ['implementer-one'], optionalGates }, 'start-one');
  return { root, repo, home, head, context, core, request };
}
async function authorize(f) {
  const design = await f.core.store.capture('design.md');
  await f.request('human.decide', { kind: 'approve-design', subject: design.hash, authority: human, reason: 'Approved design', consequences: 'Proceed to spec' }, 'design-one');
  await f.request('spec.validate', {}, 'spec-one');
  const commitments = await f.core.commitments();
  await f.request('human.decide', { kind: 'authorize-implementation', subject: commitments.subject, authority: human, reason: 'Approved scope', consequences: 'May implement' }, 'plan-one');
}
async function candidate(f) {
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.context.repositories[0].featureBaseSha, head: f.head }], scope: 'FEATURE', criteria: ['R1'] }, 'candidate-one');
}

test('current run preserves old record and blocks implementation until actual decisions and spec check', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, false);
  await assert.rejects(candidate(f), /implementation authority/);
  await authorize(f);
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, true);
  assert.equal(await readFile(join(f.home, 'events.jsonl'), 'utf8'), 'old journal preserved verbatim\n');
  await writeFile(join(f.home, 'spec.md'), (await readFile(join(f.home, 'spec.md'), 'utf8'))+'changed\n');
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, false);
});

test('readiness is a declaration with no reviewer execution and no repeated-round limit', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  for (let i = 0; i < 7; i++) await f.request('candidate.ready', {}, `ready-${i}`);
  const status = await f.request('status');
  assert.equal(status.ready, true); assert.deepEqual(status.results, []);
  const acceptance = await f.request('milestone.check', { name: 'acceptance' });
  assert.equal(acceptance.allowed, false); assert.match(acceptance.missing.join(','), /verification/);
  await assert.rejects(f.request('milestone.pass', { name: 'acceptance' }), /blocked/);
});

for (const nested of [true, false]) test(`local requirement snapshots work with ${nested ? 'parent' : 'repository-local'} untracked records`, async t => {
  const f = await fixture(t, { nested }); await authorize(f); await candidate(f);
  const status = await f.request('status');
  const value = await f.core.store.json(status.candidate);
  assert.deepEqual(value.repositories[0].files.map(file => file.path), ['app.js']);
  assert.equal((await f.core.store.get(value.requirements['spec.md'])).toString(), await readFile(join(f.home, 'spec.md'), 'utf8'));
  await writeFile(join(f.repo, 'app.js'), 'changed source\n');
  await assert.rejects(f.request('candidate.ready'), /dirty/);
});

test('repeat operations return original passage; conflicting reuse and concurrent writers cannot overwrite', async t => {
  const f = await fixture(t); await authorize(f);
  const design = await f.core.store.capture('design.md');
  const repeated = await f.request('human.decide', { kind: 'approve-design', subject: design.hash, authority: human, reason: 'Approved design', consequences: 'Proceed to spec' }, 'design-one');
  assert.equal(repeated.event.sequence, 2);
  await assert.rejects(f.request('human.decide', { kind: 'approve-design', subject: design.hash, authority: human, reason: 'Different', consequences: 'Proceed' }, 'design-one'), /reused/);
  const { state } = await f.core.state();
  const results = await Promise.allSettled(['a', 'b'].map(id => f.core.store.append(state.runId, state.eventCount, 'PAUSED', {}, { id, hash: identity(id) })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await f.core.store.events(state.runId)).length, state.eventCount+1);
});

test('interrupted startup reconciles durable run before activating it', async t => {
  const f = await fixture(t);
  await rm(join(f.home, '.gatereeve-current/active.json'));
  await assert.rejects(f.request('status'), /Missing activation copy/);
  await f.request('run.resume-current', { runId: 'run-one', implementers: ['implementer-one'] }, 'resume-one');
  await f.request('run.start', { runId: 'run-one', implementers: ['implementer-one'], optionalGates: [] }, 'start-one');
  assert.equal((await f.request('status')).runId, 'run-one');
  assert.deepEqual((await f.core.store.events('run-one')).map(event => event.type), ['STARTED', 'TRANSITION_RECORDED']);
});

test('traversal, symlinks, corrupted retained bytes and source injection fail', async t => {
  const f = await fixture(t);
  await assert.rejects(f.core.store.capture('../outside'), /Unsafe/);
  await writeFile(join(f.root, 'outside'), 'external');
  await symlink(join(f.root, 'outside'), join(f.home, 'link'));
  await assert.rejects(f.core.store.capture('link'), /Symlink/);
  const ref = await f.core.store.capture('design.md');
  await writeFile(join(f.home, '.gatereeve-current/objects', ref.hash.slice(7)), 'altered');
  await assert.rejects(f.core.store.get(ref), /integrity/);
  await assert.rejects(f.core.store.capture('design.md'), /corrupt/);
});

test('quality exceptions retain facts and never authorize merge or waive integrity', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const subject = (await f.request('status')).candidate.hash;
  const waiver = { kind: 'waive', subject, authority: human, reason: 'Known limitation', consequences: 'Unverified runtime', gates: ['verification'] };
  await f.request('human.decide', waiver, 'waive-one');
  const check = await f.request('milestone.check', { name: 'acceptance' });
  const row = check.outcomes.find(item => item.id === 'verification');
  assert.equal(row.outcome, 'UNAVAILABLE'); assert.equal(row.satisfied, true); assert.ok(row.exception);
  assert.equal((await f.request('milestone.check', { name: 'merge' })).allowed, false);
  await assert.rejects(f.request('human.decide', { ...waiver, gates: ['packet'] }), /policy amendment/);
  await assert.rejects(f.request('gate.record', { outcome: 'PASS' }), /Unsupported/);
});

test('foreign active feature identity and damaged journal cannot be used', async t => {
  const f = await fixture(t);
  const other = await CurrentCore.at({ ...f.context, featureId: 'other' });
  await assert.rejects(other.execute({ operation: 'status' }), /feature identity/);
  const path = join(f.home, '.gatereeve-current/runs/run-one/events/00000001.json');
  const event = JSON.parse(await readFile(path, 'utf8')); event.payload.implementers = [];
  await writeFile(path, JSON.stringify(event));
  await assert.rejects(f.request('status'), /integrity|Conflicting retained journal copies/);
});

async function runVerification(f, fail = false, operationId = 'verify-one') {
  return f.request('gate.execute', { gates: ['verification'], configuration: {
    environment: { inherit: ['GATEREEVE_WAIVER_TEST_RISK', 'GATEREEVE_TRANSITIVE_RISK', 'GATEREEVE_TRANSPORT_DRIFT', 'GATEREEVE_ADMISSION_HOST_MODE'] },
    externalRuntimeInputs: { app: [] }, checks: [{ repository: 'app', command: process.execPath, args: ['-e', `process.exit(${fail ? 1 : 0})`], purpose: 'Fixture verification' }],
  } }, operationId);
}
function fakeEvaluator(f, { malformed = false, inherited = false, blocking = false, findingId = 'finding-1', outcome = blocking ? 'FAIL' : 'PASS', dispositions = [], historyAssessment = null, criterionRows = null, coverage = null } = {}) {
  let launches = 0;
  f.core.runtime.evaluator = {
    async describe() { return { provider: 'codex', model: 'fixture', reasoningEffort: 'high' }; },
    async runStage(request) {
      launches++;
      const output = { verdicts: request.input.gates.map(id => ({ gate: id, outcome,
        summary: 'Fixture assessment', criteria: criterionRows ?? request.input.criteria.map(id => ({ id, outcome, evidence: 'Fixture source and command receipt' })), coverage: coverage ?? { complete: true, paths: request.input.changedPaths ?? ['app/app.js'], interactions: ['app/app.js'], limitations: [] },
        findings: blocking ? [{ id: findingId, classId: 'class-1', criterion: 'R1', path: 'app/app.js', evidence: 'Current defect', blocking: true }] : [], dispositions, historyAssessment })) };
      if (malformed) output.verdicts.pop();
      const { sha256Digest } = await import('../../plugin-src/shared/resources/protocol/agent-workflow.js');
      return { schemaVersion: 1, protocolVersion: request.protocolVersion, stageId: request.stage.id, status: 'completed', output, receipt: { schemaVersion: 1, kind: 'gatereeve-agent-workflow-receipt', protocolVersion: request.protocolVersion, module: request.module, stage: request.stage.id, capabilityProfile: request.capabilityProfile, startedAt: '2026-10-23T00:00:00Z', completedAt: '2026-10-23T00:00:01Z', status: 'completed', runId: request.runId, attemptId: request.attemptId,
        isolation: { method: 'test-isolated', freshContext: true, inheritedTurns: inherited ? 1 : 0 },
        provider: { id: 'codex', adapterVersion: '1.0.0', reasoningEffort: 'high', model: 'fixture', contextId: 'reviewer-fresh' },
        digests: { input: sha256Digest(request.input), instructions: sha256Digest(request.instructions), output: sha256Digest(output), snapshot: request.snapshotDigest },
        policy: { repositoryAccess: 'read-only', networkAccess: 'deny', scratch: 'isolated' } } };
    },
  };
  return () => launches;
}

test('actual runner receipts preserve success/failure, reuse equivalent work, and reject consumed failure', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const ran = await runVerification(f);
  const result = await f.core.store.json(ran.event.payload.results[0]);
  assert.equal(result.outcome, 'PASS');
  const receipt = await f.core.store.json(result.receipt);
  assert.equal(receipt.role, 'runner'); assert.equal(receipt.evaluator, null);
  const reused = await runVerification(f, false, 'verify-again');
  assert.equal(reused.reused, true);
  const failed = await runVerification(f, true, 'verify-failed');
  assert.equal((await f.core.store.json(failed.event.payload.results[0])).outcome, 'FAIL');
  await assert.rejects(f.request('gate.execute', { gates: ['spec'], consumed: failed.event.payload.results,
    configuration: { provider: 'codex', model: 'fixture' } }), /not passing/);
});

for (const mode of ['bookkeeping', 'dependency', 'timeout', 'postflight-read-error']) test(`runner bookkeeping contract retains current proof and diagnostics: ${mode}`, async t => {
  const f = await fixture(t); await authorize(f);
  await writeFile(join(f.repo, '.git/info/exclude'), 'node_modules/\n');
  await mkdir(join(f.repo, 'node_modules/pkg'), { recursive: true });
  await writeFile(join(f.repo, 'node_modules/pkg/index.js'), 'one');
  const workspace = join(f.repo, 'node_modules/.pnpm-workspace-state-v1.json');
  await writeFile(workspace, JSON.stringify({ lastValidatedTimestamp: 1, settings: { production: true } }));
  const outside = join(f.root, 'outside.js'); await writeFile(outside, 'outside');
  await candidate(f);
  const cache = `node_modules/.vite/vitest/${'a'.repeat(40)}`;
  const body = mode === 'bookkeeping' ? `fs.mkdirSync('${cache}',{recursive:true});fs.writeFileSync('${cache}/results.json','{}');fs.mkdirSync('node_modules/.pnpm-task-run-state-v1',{recursive:true});fs.writeFileSync('node_modules/.pnpm-task-run-state-v1/latest.json','{}');fs.writeFileSync('node_modules/.pnpm-workspace-state-v1.json',JSON.stringify({lastValidatedTimestamp:2,settings:{production:true}}));`
    : mode === 'postflight-read-error' ? `fs.symlinkSync(${JSON.stringify(outside)},'node_modules/escape.js');`
      : `fs.writeFileSync('node_modules/pkg/index.js','two');${mode === 'timeout' ? 'setInterval(()=>{},1000);' : 'process.exitCode=7;'}`;
  const executed = await f.request('gate.execute', { gates: ['verification'], configuration: { externalRuntimeInputs: { app: [] },
    checks: [{ repository: 'app', command: process.execPath, args: ['-e', `const fs=require('fs');console.log('7d9b35e2-0ef3-4bf2-a5f9-874b19ef0480');${body}`],
      timeoutMs: mode === 'timeout' ? 1000 : 10000, purpose: 'Bookkeeping and postflight diagnostics regression' }] } });
  const reference = executed.event.payload.results[0], result = await f.core.store.json(reference);
  const runner = await f.core.store.json(result.runner);
  assert.match((await f.core.store.get(runner.receipts[0].stdout)).toString(), /7d9b35e2-0ef3-4bf2-a5f9-874b19ef0480/);
  await f.core.store.closure(reference);
  if (mode === 'bookkeeping') {
    assert.equal(result.outcome, 'PASS'); assert.equal(runner.environmentCheck, 'unchanged'); assert.deepEqual(runner.changedInputs, []);
    await writeFile(join(f.repo, cache, 'results.json'), '{"duration":99}');
    const { state } = await f.core.state(), selected = await f.core.store.json(state.candidate);
    assert.equal((await f.core.currentResult(reference, selected, state)).outcome, 'PASS');
    assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, true);
    await writeFile(join(f.repo, 'node_modules/pkg/index.js'), 'changed after verification');
    await assert.rejects(f.core.currentResult(reference, selected, state), /app:node_modules/);
  } else {
    assert.equal(result.outcome, 'UNAVAILABLE'); assert.match(result.summary, /app:node_modules/);
    if (mode === 'postflight-read-error') {
      assert.equal(runner.environmentCheck, 'unavailable'); assert.equal(runner.changedInputs, null);
      assert.equal(runner.receipts[0].outcome, 'PASS');
    } else {
      assert.equal(runner.environmentCheck, 'changed');
      assert.ok(runner.changedInputs.some(item => item.repository === 'app' && item.path === 'node_modules/pkg/index.js'));
      assert.equal(runner.receipts[0].termination.kind, mode === 'timeout' ? 'timeout' : 'exit');
      assert.match(result.summary, mode === 'timeout' ? /Timed out after 1000 ms/ : /exited with code 7/);
    }
  }
});

test('one fresh evaluator supplies two separate verdicts; missing verdicts and inherited contexts remain unavailable', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const verified = await runVerification(f);
  const count = fakeEvaluator(f);
  const input = { gates: ['code', 'spec'], consumed: verified.event.payload.results, configuration: { provider: 'codex', model: 'fixture' } };
  const assessed = await f.request('gate.execute', input, 'review-one');
  assert.equal(count(), 1); assert.equal(assessed.event.payload.results.length, 2);
  const results = await Promise.all(assessed.event.payload.results.map(ref => f.core.store.json(ref)));
  assert.deepEqual(results.map(item => item.gate), ['code', 'spec']);
  assert.ok(results.every(item => item.outcome === 'PASS'));
  const reused = await f.request('gate.execute', input, 'review-reused');
  assert.equal(reused.reused, true); assert.equal(count(), 1);
  // A changed declared assessment configuration deliberately requests fresh proof.
  input.configuration.reviewRevision = 2;
  fakeEvaluator(f, { malformed: true });
  const malformed = await f.request('gate.execute', input, 'review-malformed');
  assert.deepEqual((await Promise.all(malformed.event.payload.results.map(ref => f.core.store.json(ref)))).map(item => item.outcome), ['PASS', 'UNAVAILABLE']);
  fakeEvaluator(f, { inherited: true });
  const inherited = await f.request('gate.execute', input, 'review-inherited');
  assert.ok((await Promise.all(inherited.event.payload.results.map(ref => f.core.store.json(ref)))).every(item => item.outcome === 'UNAVAILABLE'));
});

test('delta assessment keeps prior provenance, covers changed paths and allows new supported defects', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const count = fakeEvaluator(f);
  const first = await f.request('gate.execute', { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } }, 'review-base');
  const prior = first.event.payload.results[0];
  await writeFile(join(f.repo, 'app.js'), 'export const answer = 43;\n');
  await git(f.repo, ['add', 'app.js']); await git(f.repo, ['commit', '-m', 'change']);
  const next = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head: next }], scope: 'FEATURE', criteria: ['R1'] }, 'next-candidate');
  const refreshed = await f.request('gate.execute', { gates: ['code'], prior, configuration: { provider: 'codex', model: 'fixture' } }, 'review-delta');
  const delta = await f.core.store.json(refreshed.event.payload.results[0]);
  assert.equal(delta.mode, 'delta'); assert.equal(delta.prior.hash, prior.hash); assert.equal(count(), 2);
  const state = (await f.core.state()).state;
  const current = await f.core.store.json(state.candidate);
  assert.equal((await f.core.currentResult(refreshed.event.payload.results[0], current, state)).outcome, 'PASS');
  await assert.rejects(f.core.currentResult(prior, current, state), /not applicable/);
  fakeEvaluator(f, { blocking: true });
  const findings = await f.request('gate.execute', { gates: ['code'], prior, configuration: { provider: 'codex', model: 'fixture' } }, 'review-new-defect');
  assert.equal((await f.core.store.json(findings.event.payload.results[0])).outcome, 'FAIL');
});

test('independent triage proof becomes stale when its supporting document changes', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  await writeFile(join(f.home, 'scratchpad.md'), '# Decisions\n\n[-] **Promote**\n');
  fakeEvaluator(f);
  const ran = await f.request('gate.execute', { gates: ['triage'], configuration: { provider: 'codex', model: 'fixture' } }, 'triage-one');
  const ref = ran.event.payload.results[0];
  const state = (await f.core.state()).state;
  const current = await f.core.store.json(state.candidate);
  assert.equal((await f.core.currentResult(ref, current, state)).outcome, 'PASS');
  await writeFile(join(f.home, 'scratchpad.md'), '# Decisions\n\n[ ] **Promote**\n');
  await assert.rejects(f.core.currentResult(ref, current, state), /changed/);
});

test('current adapter resolves canonical parent records and gives actionable old-record guidance', async t => {
  const f = await fixture(t);
  const { executeCurrentRequest } = await import('../../plugin-src/shared/resources/protocol/current/adapter.js');
  await writeFile(join(f.root, '.agentic-workflow.json'), JSON.stringify({ schemaVersion: 1, featureId: 'feature',
    repositories: { app: { path: 'app', integrationBranch: 'main' } } }));
  const status = await executeCurrentRequest({ operation: 'status', cwd: f.repo });
  assert.equal(status.ok, true); assert.equal(status.data.mode, 'governed'); assert.equal(status.data.current.runId, 'run-one');
  const wrong = await executeCurrentRequest({ operation: 'status', cwd: f.repo, featureHome: f.root });
  assert.equal(wrong.ok, false);
  await rm(join(f.home, '.gatereeve-current/active.json'));
  const damaged = await executeCurrentRequest({ operation: 'status', cwd: f.repo });
  assert.equal(damaged.ok, true); assert.equal(damaged.data.current, null);
  assert.match(damaged.data.blockers[0].message, /Missing activation copy/);
  await rm(join(f.home, '.gatereeve-current/active-witness.json'));
  const old = await executeCurrentRequest({ operation: 'status', cwd: f.repo });
  assert.equal(old.ok, true); assert.equal(old.data.mode, 'current-entry');
  assert.match(old.data.blockers[0].message, /not replayed/);
  assert.equal(await readFile(join(f.home, 'events.jsonl'), 'utf8'), 'old journal preserved verbatim\n');
});

test('real local fresh evaluator produces a bound code-review receipt', { skip: process.env.GATEREEVE_LIVE_EVALUATOR !== '1' }, async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const reviewed = await f.request('gate.execute', { gates: ['code'], configuration: {
    provider: process.env.GATEREEVE_AGENT_PROVIDER ?? 'codex', model: process.env.GATEREEVE_AGENT_MODEL, reasoningEffort: 'high', timeoutSeconds: 180,
  } }, 'live-review');
  const result = await f.core.store.json(reviewed.event.payload.results[0]);
  const receipt = await f.core.store.json(result.receipt);
  if (process.env.GATEREEVE_LIVE_RECEIPT) await writeFile(process.env.GATEREEVE_LIVE_RECEIPT, JSON.stringify({ result, receipt, providerReceipts: await Promise.all(result.artifacts.map(ref => f.core.store.json(ref))) }, null, 2));
  assert.ok(['PASS', 'FAIL'].includes(result.outcome), result.summary);
  assert.equal(receipt.evaluator.freshContext, true); assert.equal(receipt.evaluator.inheritedTurns, 0);
});


async function reviewAll(f, { accept = true } = {}) {
  await writeFile(join(f.home, 'scratchpad.md'), '# No pending decisions\n');
  await f.request('candidate.ready', {}, 'ready');
  const verification = await runVerification(f);
  fakeEvaluator(f);
  const refs = [...verification.event.payload.results];
  for (const gate of ['context', 'reconcile', 'triage', 'code', 'spec', 'judge', 'pattern', 'explanation']) {
    const result = await f.request('gate.execute', { gates: [gate], consumed: ['spec', 'judge'].includes(gate) ? verification.event.payload.results : [],
      configuration: ['reconcile', 'triage', 'code', 'spec', 'judge', 'pattern', 'explanation'].includes(gate) ? { provider: 'codex', model: 'fixture' } : {} }, `gate-${gate}`);
    refs.push(...result.event.payload.results);
  }
  await f.request('gate.execute', { gates: ['packet'], consumed: refs }, 'packet');
  assert.equal((await f.request('milestone.check', { name: 'acceptance' })).allowed, true);
  await f.request('milestone.pass', { name: 'acceptance' }, 'acceptance');
  const subject = (await f.request('status')).candidate.hash;
  if (accept) await f.request('human.decide', { kind: 'accept', subject, authority: human, reason: 'Reviewed exact candidate', consequences: 'Accepted for the next authorized action' }, 'accept');
  return refs;
}

test('all gates, actual external integration and completion work without evidence commits', async t => {
  const f = await fixture(t);
  const bare = join(f.root, 'remote.git');
  await git(f.root, ['init', '--bare', bare]);
  await git(f.repo, ['remote', 'add', 'origin', bare]);
  await git(f.repo, ['push', 'origin', 'HEAD:refs/heads/main']);
  Object.assign(f.context.repositories[0], { integrationBranch: 'main', remote: 'origin' });
  const initialDesign = await f.core.store.capture('design.md');
  await f.request('human.decide', { kind: 'approve-design', subject: initialDesign.hash, authority: human, reason: 'Approved design', consequences: 'Proceed to spec' }, 'design-one');
  const validSpec = await readFile(join(f.home, 'spec.md'));
  await writeFile(join(f.home, 'spec.md'), '# Failed input retained for completion\n');
  await assert.rejects(f.request('spec.validate', {}, 'failed-before-retention'), /validation failed/);
  await writeFile(join(f.home, 'spec.md'), validSpec);
  await authorize(f);
  await candidate(f); await reviewAll(f);
  assert.equal((await f.request('milestone.check', { name: 'merge' })).allowed, false);
  await f.request('integration.observe', { repository: 'app' }, 'observe');
  await f.request('gate.execute', { gates: ['finalization'], configuration: { externalRuntimeInputs: { app: [] }, checks: [{ repository: 'app', command: process.execPath, args: ['-e', 'process.exit(0)'], purpose: 'Fixture post-integration verification' }] } }, 'finalize');
  // Provider transport is fixture-injected; the retained conductor observer has
  // separate origin/chain/ancestry tests against its real validation mechanics.
  f.core.runtime.observeRelease = async request => ({ observedInputFingerprint: request.input.inputFingerprint,
    outcome: 'PASS', evidence: { featureMergeInputSha: request.input.evidence.mergeInputSha,
      sharedReceipt: { artifactId: 1, digest: 'sha256:fixture', stateSha256: 'fixture' }, retainedDiscovery: { latest: { stage: 'COMPLETE' } } } });
  await f.request('gate.execute', { gates: ['release'] }, 'release');
  const retained = await f.request('gate.execute', { gates: ['retention'] }, 'retain');
  const retainedProof = await f.core.store.json(retained.event.payload.results[0]);
  assert.deepEqual(retainedProof.completion.map(item => item.gate).sort(), ['finalization', 'release']);
  for (const entry of retainedProof.completion) assert.equal((await f.core.store.json(entry.reference)).gate, entry.gate);
  const check = await f.request('milestone.check', { name: 'completion' });
  assert.equal(check.allowed, true, check.missing.join('; '));
  const failure = (await f.core.state()).state.validationFailures[0];
  const failedRefs = [failure.proof, failure.documents['spec.md']];
  for (const ref of failedRefs) for (const corrupt of [false, true]) {
    const path = join(f.home, '.gatereeve-current/objects', ref.hash.slice(7));
    const bytes = await f.core.store.get(ref);
    if (corrupt) await writeFile(path, 'corrupt failed-validation evidence'); else await rm(path);
    const blocked = await f.request('milestone.check', { name: 'completion' });
    assert.equal(blocked.allowed, false, 'Existing retention PASS cannot survive lost failed validation bytes');
    assert.equal(blocked.outcomes.find(item => item.id === 'retention').satisfied, false);
    await assert.rejects(f.request('milestone.pass', { name: 'completion' }), /blocked/);
    assert.equal((await f.core.store.json(retained.event.payload.results[0])).outcome, 'PASS', 'Historical verdict stays unchanged');
    await writeFile(path, bytes);
    assert.equal((await f.request('milestone.check', { name: 'completion' })).allowed, true, 'Restoration recovers the original bound proof');
  }
  // Later failed validations must also become part of the required closure.
  const priorCommitments = await f.core.commitments();
  await writeFile(join(f.home, 'spec.md'), '# Later failed input after retention\n');
  const nextCommitments = await f.core.commitments();
  await assert.rejects(f.request('human.decide', { kind: 'amend', actions: ['authorize-implementation'],
    subject: nextCommitments.subject, previousSubject: priorCommitments.subject, authority: human,
    reason: 'Proposed new scope', consequences: 'Requires valid specification' }, 'failed-after-retention'), /validation failed/);
  await writeFile(join(f.home, 'spec.md'), validSpec);
  await f.request('spec.validate', {}, 'corrected-after-retention');
  const later = (await f.core.state()).state.validationFailures.at(-1);
  const laterPath = join(f.home, '.gatereeve-current/objects', later.proof.hash.slice(7));
  const laterBytes = await f.core.store.get(later.proof); await rm(laterPath);
  assert.equal((await f.request('milestone.check', { name: 'completion' })).outcomes.find(item => item.id === 'retention').satisfied, false);
  await writeFile(laterPath, laterBytes);
  // The boundary refreshes administrative retention automatically.
  assert.equal((await f.request('milestone.check', { name: 'completion' })).outcomes.find(item => item.id === 'retention').satisfied, true);
  await f.request('gate.execute', { gates: ['retention'] }, 'retain-later-validation');
  assert.equal((await f.request('milestone.check', { name: 'completion' })).allowed, true);
  await f.request('milestone.pass', { name: 'completion' }, 'complete');
  assert.equal((await f.request('status')).phase, 'COMPLETE');
  await assert.rejects(f.request('milestone.pass', { name: 'acceptance' }), /blocked|phase/);
  const result = await f.core.store.json((await f.core.state()).state.results[0]);
  const runner = await f.core.store.json(result.artifacts[0]);
  await rm(join(f.home, '.gatereeve-current/objects', runner.receipts[0].stdout.hash.slice(7)));
  assert.equal((await f.request('milestone.check', { name: 'completion' })).allowed, false);
});

test('amendment can authorize implementation once while retaining old and new requirements', async t => {
  const f = await fixture(t); await authorize(f);
  const prior = await f.core.commitments();
  await writeFile(join(f.home, 'design.md'), '# Design amended with approved scope\n');
  const next = await f.core.commitments();
  const input = { kind: 'amend', actions: ['authorize-implementation'], subject: next.subject, previousSubject: prior.subject,
    authority: { ...human, instruction: 'Approve these amended requirements and proceed with implementation.' }, reason: 'Changed requirement', consequences: 'Refresh affected proof' };
  const result = await f.request('human.decide', input, 'amend');
  assert.equal(result.state.phase, 'IMPLEMENTING');
  assert.equal(result.event.payload.previousDocuments['design.md'].hash, prior.docs['design.md'].hash);
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, true);
  assert.equal((await f.request('human.decide', input, 'amend')).event.hash, result.event.hash);
});

test('resume uses observed approvals, preserves old files and reconciles repeated entry', async t => {
  const f = await fixture(t);
  await rm(join(f.home, '.gatereeve-current'), { recursive: true });
  const commitments = await f.core.commitments();
  const base = { authority: human, reason: 'Observed earlier approval', consequences: 'Proceed within approved scope' };
  const input = { runId: 'resumed', implementers: ['implementer-one'], planning: {
    design: { ...base, subject: commitments.docs['design.md'].hash },
    implementation: { ...base, subject: commitments.subject },
  } };
  assert.equal((await f.request('run.resume-current', input, 'resume')).phase, 'IMPLEMENTING');
  const count = (await f.core.state()).events.length;
  await f.request('run.resume-current', input, 'resume');
  assert.equal((await f.core.state()).events.length, count);
  assert.equal(await readFile(join(f.home, 'events.jsonl'), 'utf8'), 'old journal preserved verbatim\n');
});

test('policy amendment is explicit and cannot waive integrity or authority', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const subject = (await f.request('status')).candidate.hash;
  const input = { kind: 'policy-amend', subject, gates: ['triage'], actions: ['waive'], authority: human, reason: 'Scoped triage policy exception', consequences: 'Pending decision triage remains visible' };
  await f.request('human.decide', input, 'policy');
  assert.equal((await f.request('milestone.check', { name: 'acceptance' })).outcomes.find(item => item.id === 'triage').satisfied, true);
  await assert.rejects(f.request('human.decide', { ...input, gates: ['context'] }, 'bad-policy'), /cannot waive/);
  assert.equal((await f.request('milestone.check', { name: 'merge' })).allowed, false);
});

test('runner source mutation remains unavailable and never produces reusable passing proof', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const result = await f.request('gate.execute', { gates: ['verification'], configuration: { externalRuntimeInputs: { app: [] }, checks: [{ repository: 'app', command: process.execPath, args: ['-e', "require('fs').writeFileSync('app.js', 'changed')"], purpose: 'Mutation regression' }] } }, 'mutating-runner');
  assert.equal((await f.core.store.json(result.event.payload.results[0])).outcome, 'UNAVAILABLE');
  assert.equal((await f.request('milestone.check', { name: 'acceptance' })).allowed, false);
});


test('simultaneous identical requests claim one execution and reconcile its result', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const count = fakeEvaluator(f);
  const input = { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } };
  const attempts = await Promise.allSettled([f.request('gate.execute', input, 'same-job'), f.request('gate.execute', input, 'same-job')]);
  assert.equal(count(), 1);
  assert.ok(attempts.some(item => item.status === 'fulfilled'));
  const reconciled = await f.request('gate.execute', input, 'same-job');
  assert.equal(reconciled.event.type, 'JOB_FINISHED');
  assert.equal(count(), 1);
});

test('pattern rules are retained and policy changes invalidate earlier assessment', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f);
  const result = await f.request('gate.execute', { gates: ['pattern'], configuration: { provider: 'codex', model: 'fixture' } }, 'pattern');
  const state = (await f.core.state()).state;
  const current = await f.core.store.json(state.candidate);
  assert.equal((await f.core.currentResult(result.event.payload.results[0], current, state)).outcome, 'PASS');
  await writeFile(join(f.root, '.pattern-review/rules.yaml'), '[  ]\n');
  await assert.rejects(f.core.currentResult(result.event.payload.results[0], current, state), /Pattern policy/);
});

const fallbackScenarios = {
  'fallback-pass': 'integrates after watching all reported CI when no required checks exist',
  'fallback-fail-closed': 'recloses a PR after fallback CI fails',
  'fallback-fail-draft': 'restores an open draft after fallback CI fails',
  'fallback-drift': 'rejects target identity drift after fallback CI passes',
  'fallback-empty': 'integrates only after unfiltered confirmation of no CI',
  'fallback-empty-drift': 'rejects target identity drift after confirmation of no CI',
};
for (const drift of [false, true, 'target-after-checks', 'advanced-target', 'candidate-before-write', 'candidate-after-write', 'lost-merge-response', 'concurrent-resume', ...Object.keys(fallbackScenarios)]) test(`protected merge ${({ 'lost-merge-response': 'recovers a lost merge response without repeating the merge', 'concurrent-resume': 'keeps concurrent resumptions from repeating external writes' })[drift] ?? fallbackScenarios[drift] ?? (drift === 'candidate-after-write' ? 'does not attribute an observed merge to a replacement candidate' : drift === 'advanced-target' ? 'merges a reviewed cumulative feature onto its separately assessed advanced target' : drift ? `recloses a drifted PR (${drift}) without merging` : 'revalidates the exact action and observes integration')}`, async t => {
  const f = await fixture(t);
  const bare = join(f.root, 'host.git');
  await git(f.root, ['init', '--bare', bare]);
  await git(f.repo, ['remote', 'add', 'origin', 'https://github.com/fixture/project.git']);
  await git(f.repo, ['config', `url.${bare}.insteadOf`, 'https://github.com/fixture/project.git']);
  await git(f.repo, ['push', 'origin', 'HEAD:refs/heads/main']);
  const base = f.head;
  let target = base;
  if (drift === 'advanced-target') {
    await writeFile(join(f.repo, 'target.js'), 'export const integrated = true;');
    await git(f.repo, ['add', 'target.js']); await git(f.repo, ['commit', '-m', 'previous slice integrated']);
    target = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
    await git(f.repo, ['push', 'origin', 'HEAD:refs/heads/main']);
  }
  await writeFile(join(f.repo, 'app.js'), 'export const answer = 42; // reviewed change\n');
  await git(f.repo, ['add', 'app.js']); await git(f.repo, ['commit', '-m', 'candidate']);
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await git(f.repo, ['push', 'origin', 'HEAD:refs/heads/topic']);
  const keepClosed = drift !== 'fallback-fail-draft';
  Object.assign(f.context.repositories[0], { integrationBranch: 'main', releaseBranch: 'main', remote: 'origin', keepPullRequestsClosed: keepClosed });
  let state = keepClosed ? 'CLOSED' : 'OPEN';
  let isDraft = true;
  const checkCalls = [];
  const ciFailure = Object.assign(new Error('Reported CI failed'), { code: 1, stdout: 'unit tests\tfail\n', stderr: '' });
  const writes = [];
  f.core.runtime.gh = async (root, args) => {
    const action = args[1];
    if (action === 'view' && drift === 'candidate-before-write' && writes.includes('checks') && !writes.includes('replaced')) {
      writes.push('replaced');
      await f.request('candidate.prepare', { repositories: [{ alias: 'app', base, head, target }], scope: 'SLICE', criteria: ['R1'] }, 'replacement-before-merge');
    }
    if (action === 'view') return JSON.stringify({ number: 12, url: 'https://github.com/fixture/project/pull/12', state,
      headRefName: 'topic', baseRefName: ['target-after-checks', 'fallback-drift', 'fallback-empty-drift'].includes(drift) && writes.includes('checks') ? 'production' : 'main', headRefOid: drift === true && state === 'OPEN' ? '0'.repeat(40) : head,
      baseRefOid: target, isDraft, mergeCommit: state === 'MERGED' ? { oid: head } : null });
    writes.push(action);
    if (action === 'reopen') state = 'OPEN';
    if (action === 'close') state = 'CLOSED';
    if (action === 'ready') isDraft = args.includes('--undo');
    if (action === 'checks' && fallbackScenarios[drift]) {
      checkCalls.push(args);
      if (drift === 'fallback-empty' || drift === 'fallback-empty-drift') throw Object.assign(new Error('No checks'), {
        code: 1, stdout: '', stderr: "no checks reported on the 'topic' branch\n",
      });
      if (args.includes('--required')) throw Object.assign(new Error('No required checks'), {
        code: 1, stdout: '', stderr: "no required checks reported on the 'topic' branch\n",
      });
      if (drift === 'fallback-fail-closed' || drift === 'fallback-fail-draft') throw ciFailure;
    }
    if (action === 'checks' && drift === 'concurrent-resume') {
      const contender = await f.request('merge.execute', { repository: 'app', number: 12 }, 'concurrent-merge');
      assert.equal(contender.status, 'running');
    }
    if (action === 'merge') {
      assert.equal(args[args.indexOf('--match-head-commit') + 1], head);
      await git(root, ['push', 'origin', 'HEAD:refs/heads/main']); state = 'MERGED';
      if (drift === 'lost-merge-response') throw new Error('Lost merge response after provider effect');
      if (drift === 'candidate-after-write') await f.request('candidate.prepare', { repositories: [{ alias: 'app', base, head, target }], scope: 'SLICE', criteria: ['R1'] }, 'replacement-after-merge');
    }
    return '';
  };
  await authorize(f);
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base, head, target }], scope: 'FEATURE', criteria: ['R1'] }, 'pinned');
  await assert.rejects(f.request('merge.execute', { repository: 'app', number: 12 }, 'unauthorized'), /blocked/);
  assert.deepEqual(writes, []);
  await reviewAll(f);
  const action = await f.request('merge.prepare', { repository: 'app', number: 12 });
  const subject = (await f.request('status')).candidate.hash;
  await f.request('human.decide', { kind: 'authorize-merge', subject, action, authority: { ...human, instruction: 'Merge this exact reviewed PR to main.' }, reason: 'Exact action approved', consequences: 'Integrate reviewed change' }, 'merge-authority');
  if (drift === 'fallback-fail-closed' || drift === 'fallback-fail-draft') {
    await assert.rejects(f.request('merge.execute', { repository: 'app', number: 12 }, 'merge'), error => error === ciFailure);
    assert.equal(state, keepClosed ? 'CLOSED' : 'OPEN');
    if (!keepClosed) assert.equal(isDraft, true);
    assert.deepEqual(writes, keepClosed ? ['reopen', 'ready', 'checks', 'checks', 'close'] : ['ready', 'checks', 'checks', 'ready']);
    assert.deepEqual((await f.request('status')).integrations, {});
  } else if (['candidate-before-write', 'candidate-after-write'].includes(drift)) {
    await assert.rejects(f.request('merge.execute', { repository: 'app', number: 12 }, 'merge'), /state or authority changed/);
    assert.equal(writes.includes('merge'), drift === 'candidate-after-write');
    assert.equal(state, drift === 'candidate-after-write' ? 'MERGED' : 'CLOSED');
    assert.deepEqual((await f.request('status')).integrations, {});
  } else if (drift && !['advanced-target', 'fallback-pass', 'fallback-empty', 'lost-merge-response', 'concurrent-resume'].includes(drift)) {
    await assert.rejects(f.request('merge.execute', { repository: 'app', number: 12 }, 'merge'), /identity changed/);
    assert.equal(state, 'CLOSED'); assert.deepEqual(writes, drift === true ? ['reopen', 'close'] : fallbackScenarios[drift] ? ['reopen', 'ready', 'checks', 'checks', 'close'] : ['reopen', 'ready', 'checks', 'close']);
  } else {
    if (drift === 'lost-merge-response') {
      await assert.rejects(f.request('merge.execute', { repository: 'app', number: 12 }, 'merge'), /Lost merge response/);
      assert.deepEqual((await f.request('status')).integrations, {});
    }
    await f.request('merge.execute', { repository: 'app', number: 12 }, 'merge');
    assert.equal(state, 'MERGED'); assert.deepEqual(writes, fallbackScenarios[drift] ? ['reopen', 'ready', 'checks', 'checks', 'merge'] : ['reopen', 'ready', 'checks', 'merge']);
    assert.equal((await f.request('status')).integrations.app.integrationSha, head);
  }
  if (fallbackScenarios[drift]) assert.deepEqual(checkCalls, [
    ['pr', 'checks', '12', '--repo', 'fixture/project', '--required', '--watch', '--fail-fast'],
    ['pr', 'checks', '12', '--repo', 'fixture/project', '--watch', '--fail-fast'],
  ]);
});

test('development branch direction is rejected and cannot be waived', async () => {
  const { mergeDirection } = await import('../../plugin-src/shared/resources/protocol/current/actions.js');
  assert.throws(() => mergeDirection('development', 'main'), /Forbidden/);
  assert.throws(() => mergeDirection('development-test', 'topic'), /Forbidden/);
  assert.doesNotThrow(() => mergeDirection('topic', 'development'));
});

test('status remains read-only and task-breakdown edits preserve implementation authority', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const objects = join(f.home, '.gatereeve-current/objects');
  const before = (await readdir(objects)).sort();
  await writeFile(join(f.home, 'plan.md'), 'unapproved edit');
  const state = await f.request('status');
  assert.equal(state.milestones.find(item => item.name === 'implementation').allowed, true);
  assert.deepEqual((await readdir(objects)).sort(), before);
});

for (const dependencyDirectory of ['node_modules', 'cli/node_modules', 'services/python/.venv']) test(`changed ${dependencyDirectory} bytes invalidate runner and consumed assessment proof`, async t => {
  const f = await fixture(t); await authorize(f);
  await writeFile(join(f.repo, '.git/info/exclude'), 'node_modules/\n.venv/\n');
  await mkdir(join(f.repo, dependencyDirectory), { recursive: true });
  await writeFile(join(f.repo, dependencyDirectory, 'dependency.js'), 'one');
  await candidate(f);
  const proof = await runVerification(f);
  fakeEvaluator(f);
  const review = await f.request('gate.execute', { gates: ['spec'], consumed: proof.event.payload.results, configuration: { provider: 'codex', model: 'fixture' } }, 'spec-review');
  await writeFile(join(f.repo, dependencyDirectory, 'dependency.js'), 'two');
  const { state } = await f.core.state(); const current = await f.core.store.json(state.candidate);
  await assert.rejects(f.core.currentResult(proof.event.payload.results[0], current, state), /environment changed/);
  await assert.rejects(f.core.currentResult(review.event.payload.results[0], current, state), /environment changed/);
  assert.notEqual((await runVerification(f, false, 'after-dependency-change')).reused, true);
});

test('one instruction can waive failed quality proof and accept without rewriting its verdict', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); await reviewAll(f);
  const failed = await runVerification(f, true, 'later-failed-verification');
  const subject = (await f.core.state()).state.candidate.hash;
  // Changed verification also invalidates its consuming assessments.
  await f.request('gate.execute', { gates: ['packet'] }, 'honest-failure-packet');
  const input = { kind: 'waive', actions: ['accept'], gates: ['verification', 'spec', 'judge'], subject,
    authority: { ...human, instruction: 'Accept this candidate despite the failed verification and unavailable dependent reviews.' }, reason: 'Explicit scoped exception', consequences: 'The named checks have not passed' };
  const decision = await f.request('human.decide', input, 'waive-and-accept');
  assert.ok(decision.event);
  assert.equal((await f.request('human.decide', input, 'waive-and-accept')).event.hash, decision.event.hash);
  const check = await f.request('milestone.check', { name: 'acceptance' });
  assert.equal(check.allowed, true, check.missing.join('; '));
  assert.equal(check.outcomes.find(item => item.id === 'verification').outcome, 'FAIL');
  assert.equal((await f.core.store.json(failed.event.payload.results[0])).outcome, 'FAIL');
  assert.equal((await f.request('milestone.check', { name: 'merge' })).allowed, false);
});

test('two repositories share exact parent requirements and either source invalidates the combined review', async t => {
  const f = await fixture(t); const other = join(f.root, 'service'); await mkdir(other);
  await git(other, ['init', '-b', 'topic']); await git(other, ['config', 'user.email', 'fixture@example.test']); await git(other, ['config', 'user.name', 'Fixture']); await git(other, ['config', 'commit.gpgsign', 'false']);
  await writeFile(join(other, 'service.js'), 'export const service = 1;');
  await git(other, ['add', 'service.js']); await git(other, ['commit', '-m', 'service']);
  const head = (await git(other, ['rev-parse', 'HEAD'])).trim();
  f.context.repositories.push({ alias: 'service', path: other, featureBaseSha: head });
  await authorize(f);
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head: f.head }, { alias: 'service', base: head, head }], scope: 'FEATURE', criteria: ['R1'] }, 'multi-candidate');
  fakeEvaluator(f);
  const review = await f.request('gate.execute', { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } }, 'multi-review');
  const pin = await f.core.store.json((await f.core.state()).state.candidate);
  assert.deepEqual(pin.repositories.map(item => item.alias), ['app', 'service']);
  assert.equal((await f.core.store.get(pin.requirements['spec.md'])).toString(), await readFile(join(f.home, 'spec.md'), 'utf8'));
  await writeFile(join(other, 'service.js'), 'export const service = 2;');
  await assert.rejects(f.request('candidate.ready'), /dirty/);
  await git(other, ['add', 'service.js']); await git(other, ['commit', '-m', 'change']);
  const changed = (await git(other, ['rev-parse', 'HEAD'])).trim();
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head: f.head }, { alias: 'service', base: head, head: changed }], scope: 'FEATURE', criteria: ['R1'] }, 'multi-changed');
  const state = (await f.core.state()).state;
  await assert.rejects(f.core.currentResult(review.event.payload.results[0], await f.core.store.json(state.candidate), state), /not applicable/);
  const deltaInput = { gates: ['code'], prior: review.event.payload.results[0], configuration: { provider: 'codex', model: 'fixture' } };
  const delta = await f.request('gate.execute', deltaInput, 'multi-delta');
  const verdict = await f.core.store.json(delta.event.payload.results[0]);
  assert.equal(verdict.outcome, 'PASS'); assert.deepEqual(verdict.coverage.paths, ['service/service.js']);
  const runStage = f.core.runtime.evaluator.runStage;
  f.core.runtime.evaluator.runStage = async request => {
    const output = await runStage(request);
    output.output.verdicts[0].coverage.paths = ['app/app.js'];
    const { sha256Digest } = await import('../../plugin-src/shared/resources/protocol/agent-workflow.js');
    output.receipt.digests.output = sha256Digest(output.output);
    return output;
  };
  const incomplete = await f.request('gate.execute', { ...deltaInput, configuration: { ...deltaInput.configuration, reviewRevision: 2 } }, 'multi-incomplete');
  assert.equal((await f.core.store.json(incomplete.event.payload.results[0])).outcome, 'UNAVAILABLE');
});

test('same source bytes at a new commit reuse the original qualified review', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); const launches = fakeEvaluator(f);
  const input = { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } };
  const first = await f.request('gate.execute', input, 'same-bytes-first');
  await git(f.repo, ['commit', '--allow-empty', '-m', 'bookkeeping-only source identity']);
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head }], scope: 'FEATURE', criteria: ['R1'] }, 'same-bytes-candidate');
  const second = await f.request('gate.execute', input, 'same-bytes-again');
  assert.equal(second.reused, true); assert.equal(launches(), 1);
  assert.deepEqual(second.results, first.event.payload.results);
});

for (const tracking of ['tracked', 'ignored']) test(`parent Git ${tracking} records complete local review without evidence commits`, async t => {
  const f = await fixture(t);
  await git(f.root, ['init', '-b', 'records']); await git(f.root, ['config', 'user.name', 'Fixture']); await git(f.root, ['config', 'user.email', 'fixture@example.test']); await git(f.root, ['config', 'commit.gpgsign', 'false']);
  if (tracking === 'tracked') {
    await git(f.root, ['add', 'docs']); await git(f.root, ['commit', '-m', 'shared requirements']);
  } else await writeFile(join(f.root, '.git/info/exclude'), 'docs/\n');
  await authorize(f); await candidate(f); await reviewAll(f);
  assert.equal((await f.request('milestone.check', { name: 'acceptance' })).allowed, true);
  assert.equal((await git(f.repo, ['rev-parse', 'HEAD'])).trim(), f.head);
});

test('an explicit pause stops passage and its recorded continuation restores permitted repair', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  await f.request('run.pause', { authority: human }, 'pause');
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, false);
  await assert.rejects(f.request('gate.execute', { gates: ['context'] }), /authorized phase/);
  await f.request('run.continue', { authority: human }, 'continue');
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, true);
});

test('spec execution automatically binds current Verification without hand-authored transport', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f);
  const proof = await runVerification(f);
  const review = await f.request('gate.execute', { gates: ['spec'], configuration: { provider: 'codex', model: 'fixture' } }, 'auto-spec');
  const report = await f.core.store.json(review.event.payload.results[0]);
  assert.equal(report.outcome, 'PASS');
  assert.deepEqual((await f.core.store.json(report.input)).consumed, proof.event.payload.results);
  await runVerification(f, true, 'auto-spec-failure');
  await assert.rejects(f.request('gate.execute', { gates: ['spec'], configuration: { provider: 'codex', model: 'fixture' } }, 'auto-spec-blocked'), /not passing/);
});

test('current resume preserves unsupported and damaged runs and starts with no inherited authority', async t => {
  for (const damaged of [false, true]) {
    const f = await fixture(t); await authorize(f);
    const pointer = join(f.home, '.gatereeve-current/active.json');
    const oldEvent = join(f.home, '.gatereeve-current/runs/run-one/events/00000001.json');
    if (damaged) await writeFile(oldEvent, 'damaged original bytes');
    else { await rm(join(f.home, '.gatereeve-current/active-witness.json')); await writeFile(pointer, JSON.stringify({ contract: 'unsupported/v0', runId: 'run-one' })); }
    const prior = await readFile(pointer), event = await readFile(oldEvent);
    await f.request('run.resume-current', { runId: 'replacement', implementers: ['implementer-one'] }, 'resume-replacement');
    assert.deepEqual(await readFile(pointer), prior); assert.deepEqual(await readFile(oldEvent), event);
    const resumed = await f.request('status');
    assert.equal(resumed.runId, 'replacement'); assert.equal(resumed.phase, 'DESIGNING');
    assert.equal((await f.core.check('implementation')).allowed, false);
    await f.request('run.resume-current', { runId: 'replacement', implementers: ['implementer-one'] }, 'resume-again');
    assert.equal((await f.request('status')).runId, 'replacement');
  }
});

test('incidental host environment preserves proof while declared additions invalidate runner evidence', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f);
  const ran = await runVerification(f);
  const review = await f.request('gate.execute', { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } }, 'host-review');
  const key = 'GATEREEVE_TEST_HOST_MODE', previous = process.env[key];
  t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  process.env[key] = 'Electron-host';
  const state = (await f.core.state()).state, selected = await f.core.store.json(state.candidate);
  assert.equal((await f.core.currentResult(ran.event.payload.results[0], selected, state)).outcome, 'PASS');
  assert.equal((await f.core.currentResult(review.event.payload.results[0], selected, state)).outcome, 'PASS');
  // Observer-only variables do not change the isolated document-validator environment.
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, true);
  await f.request('spec.validate', {}, 'refresh-host-spec');
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, true);
  const declared = await f.request('gate.execute', { gates: ['verification'], configuration: { environment: { inherit: [key] }, externalRuntimeInputs: { app: [] }, checks: [{ repository: 'app', command: process.execPath, args: ['-e', 'process.exit(0)'], purpose: 'Declared environment' }] } }, 'declared-env');
  process.env[key] = 'changed';
  await assert.rejects(f.core.currentResult(declared.event.payload.results[0], selected, (await f.core.state()).state), /environment changed/);
});

test('a narrower passing check cannot hide earlier failed verification and packets refresh their inventory', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const packet = await f.request('gate.execute', { gates: ['packet'] }, 'empty-packet');
  await runVerification(f, true, 'broad-failure');
  const narrow = await runVerification(f, false, 'narrow-success');
  const state = (await f.core.state()).state, selected = await f.core.store.json(state.candidate);
  assert.equal((await f.core.currentResult(narrow.event.payload.results[0], selected, state)).outcome, 'PASS');
  await assert.rejects(f.core.verificationCoverage(selected, state, new Map()), /uncovered prior behavior/);
  await assert.rejects(f.core.currentResult(packet.event.payload.results[0], selected, state), /inventory changed/);
  const refresh = await f.request('gate.execute', { gates: ['packet'] }, 'packet-refresh');
  assert.notEqual(refresh.reused, true);
  assert.equal((await f.core.store.json(refresh.event.payload.results[0])).inventory.find(item => item.gate === 'verification').outcome, 'PASS');
  assert.match((await f.core.check('acceptance')).missing.join(' '), /uncovered prior behavior/, 'a passing latest command is distinct from complete coverage');
});

test('review PASS needs dispositions for supplied open findings and claimed fixes', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  fakeEvaluator(f, { blocking: true });
  const failed = await f.request('gate.execute', { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } }, 'find-defect');
  fakeEvaluator(f);
  const input = { gates: ['code'], claims: [{ findingId: 'finding-1', claim: 'Fixed it' }], configuration: { provider: 'codex', model: 'fixture' } };
  const missing = await f.request('gate.execute', input, 'no-disposition');
  assert.equal((await f.core.store.json(missing.event.payload.results[0])).outcome, 'UNAVAILABLE');
  fakeEvaluator(f, { dispositions: [{ id: 'finding-1', status: 'resolved', evidence: 'Verified the corrected path and related callers.' }] });
  const resolved = await f.request('gate.execute', input, 'resolved-disposition');
  assert.equal((await f.core.store.json(resolved.event.payload.results[0])).outcome, 'PASS');
});

test('Git symlinks and gitlinks are retained as typed metadata without following external targets', async t => {
  const f = await fixture(t); await authorize(f);
  await writeFile(join(f.root, 'secret'), 'must not be captured');
  await symlink('../secret', join(f.repo, 'link'));
  await git(f.repo, ['add', 'link']);
  await git(f.repo, ['update-index', '--add', '--cacheinfo', `160000,${f.head},submodule`]);
  await mkdir(join(f.repo, 'submodule'));
  await git(f.repo, ['commit', '-m', 'typed entries']);
  f.head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await candidate(f);
  const selected = await f.core.store.json((await f.core.state()).state.candidate);
  const link = selected.repositories[0].files.find(item => item.path === 'link');
  assert.equal(link.entryKind, 'symlink'); assert.equal((await git(f.repo, ['cat-file', 'blob', link.oid])).toString(), '../secret');
  const gitlink = selected.repositories[0].files.find(item => item.path === 'submodule');
  assert.equal(gitlink.entryKind, 'gitlink'); assert.equal(gitlink.oid.length, 40); assert.equal(gitlink.hash, undefined);
});

test('reconciliation rejects unknown rubric mappings even when documents are readable', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  await writeFile(join(f.home, 'tracker.md'), '# Tracker\n## Rubric Status\n| R999 | AC1 | NOT YET | pending |\n## Review Log\n');
  fakeEvaluator(f);
  const checked = await f.request('gate.execute', { gates: ['reconcile'], configuration: { provider: 'codex', model: 'fixture' } }, 'bad-tracker');
  assert.equal((await f.core.store.json(checked.event.payload.results[0])).outcome, 'UNAVAILABLE');
});

test('narrowed repository scope rejects broader prior history before launching an evaluator', async t => {
  const f = await fixture(t); const other = join(f.root, 'service'); await mkdir(other);
  await git(other, ['init', '-b', 'topic']); await git(other, ['config', 'user.email', 'fixture@example.test']); await git(other, ['config', 'user.name', 'Fixture']); await git(other, ['config', 'commit.gpgsign', 'false']);
  await writeFile(join(other, 'private-service.js'), 'private service source'); await git(other, ['add', '.']); await git(other, ['commit', '-m', 'service']);
  const head = (await git(other, ['rev-parse', 'HEAD'])).trim(); f.context.repositories.push({ alias: 'service', path: other, featureBaseSha: head });
  await authorize(f);
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head: f.head }, { alias: 'service', base: head, head }], scope: 'FEATURE', criteria: ['R1'] }, 'broad-selection');
  const count = fakeEvaluator(f);
  const prior = await f.request('gate.execute', { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } }, 'broad-review');
  await candidate(f);
  await assert.rejects(f.request('gate.execute', { gates: ['code'], history: prior.event.payload.results, configuration: { provider: 'codex', model: 'fixture' } }, 'narrow-review'), /unselected repositories/);
  await assert.rejects(f.request('gate.execute', { gates: ['code'], prior: prior.event.payload.results[0], configuration: { provider: 'codex', model: 'fixture' } }, 'narrow-delta'), /unselected repositories/);
  assert.equal(count(), 1);
});

test('changed closed findings need an independent relevance decision and affected dispositions', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const input = { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } };
  fakeEvaluator(f, { blocking: true }); await f.request('gate.execute', input, 'old-defect');
  fakeEvaluator(f, { dispositions: [{ id: 'finding-1', status: 'resolved', evidence: 'Independent closure evidence' }] });
  const resolved = await f.request('gate.execute', input, 'old-resolution');
  assert.equal((await f.core.store.json(resolved.event.payload.results[0])).outcome, 'PASS');
  await writeFile(join(f.repo, 'app.js'), 'export const answer = 43;\n'); await git(f.repo, ['add', 'app.js']); await git(f.repo, ['commit', '-m', 'later edit']);
  const next = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head: next }], scope: 'FEATURE', criteria: ['R1'] }, 'later-source');
  fakeEvaluator(f);
  const omitted = await f.request('gate.execute', input, 'omitted-closure');
  assert.equal((await f.core.store.json(omitted.event.payload.results[0])).outcome, 'UNAVAILABLE');
  fakeEvaluator(f, { historyAssessment: { affected: ['finding-1'], carryForwardReason: '' } });
  const noDisposition = await f.request('gate.execute', input, 'affected-no-proof');
  assert.equal((await f.core.store.json(noDisposition.event.payload.results[0])).outcome, 'UNAVAILABLE');
  fakeEvaluator(f, { historyAssessment: { affected: [], carryForwardReason: 'Inspected changed source and interactions; the former defect remains absent for these reasons.' } });
  const carried = await f.request('gate.execute', input, 'qualified-carry');
  assert.equal((await f.core.store.json(carried.event.payload.results[0])).outcome, 'PASS');
});

test('fresh proof recovers historical artifact loss without fabricating lost bytes', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const input = { gates: ['verification'], configuration: { externalRuntimeInputs: { app: [] }, checks: [{ repository: 'app', command: process.execPath, args: ['-e', 'console.log(Date.now())'], purpose: 'Actual nonconstant runtime observation' }] } };
  const first = await f.request('gate.execute', input, 'first-observation');
  const old = await f.core.store.json(first.event.payload.results[0]);
  const receipt = await f.core.store.json(old.artifacts[0]);
  const lost = receipt.receipts[0].stdout;
  await rm(join(f.home, '.gatereeve-current/objects', lost.hash.slice(7)));
  const refreshed = await f.request('gate.execute', input, 'fresh-observation');
  assert.notEqual(refreshed.reused, true);
  const state = (await f.core.state()).state;
  assert.equal((await f.core.currentResult(refreshed.event.payload.results[0], await f.core.store.json(state.candidate), state)).outcome, 'PASS');
  await assert.rejects(f.core.store.get(lost), /ENOENT/);
  await reviewAll(f);
  assert.equal((await f.core.check('acceptance')).allowed, true);
  assert.ok((await f.request('status')).historyGaps.some(item => item.resultHash === first.event.payload.results[0].hash));
  // Even a lost historical root does not prevent a fresh execution.
  await rm(join(f.home, '.gatereeve-current/objects', first.event.payload.results[0].hash.slice(7)));
  const another = await f.request('gate.execute', input, 'after-root-loss');
  assert.equal((await f.core.store.json((another.event?.payload.results ?? another.results)[0])).outcome, 'PASS');
});

test('provider failure diagnostics do not enter visible gate summaries', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f);
  const { runAgentProcess } = await import('../../plugin-src/shared/resources/protocol/local-agent-adapters.js');
  f.core.runtime.evaluator.runStage = () => runAgentProcess(process.execPath, ['-e', 'process.stderr.write("PRIVATE_PROVIDER_CONTEXT_SENTINEL");process.exit(1)'], { cwd: f.repo, input: '', timeoutSeconds: 5 });
  const checked = await f.request('gate.execute', { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } }, 'private-diagnostic');
  const result = await f.core.store.json(checked.event.payload.results[0]);
  assert.equal(result.outcome, 'UNAVAILABLE'); assert.doesNotMatch(result.summary, /PRIVATE_PROVIDER_CONTEXT/);
  for (const artifact of result.artifacts) assert.doesNotMatch((await f.core.store.get(artifact)).toString(), /PRIVATE_PROVIDER_CONTEXT/);
});

test('fresh assessment uses available historical findings as context when original output was lost', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f, { blocking: true });
  const input = { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } };
  const first = await f.request('gate.execute', input, 'lost-review-original');
  const old = await f.core.store.json(first.event.payload.results[0]);
  const lost = old.artifacts[1];
  await rm(join(f.home, '.gatereeve-current/objects', lost.hash.slice(7)));
  fakeEvaluator(f, { dispositions: [{ id: 'finding-1', status: 'resolved', evidence: 'Fresh inspection of current source proves correction; missing old output is not assumed passing.' }] });
  const fresh = await f.request('gate.execute', input, 'lost-review-refresh');
  const state = (await f.core.state()).state;
  assert.equal((await f.core.currentResult(fresh.event.payload.results[0], await f.core.store.json(state.candidate), state)).outcome, 'PASS');
  await assert.rejects(f.core.store.get(lost), /ENOENT/);
  const proof = await f.core.store.json(fresh.event.payload.results[0]);
  const inputs = await f.core.store.json(proof.input);
  const context = await f.core.store.json(inputs.history[0]);
  assert.equal(context.kind, 'historical-context'); assert.equal(context.evidenceUnavailable, true);
});


for (const loss of ['root', 'output']) test(`a missing newer failure ${loss} cannot resurrect an older PASS, but fresh proof recovers`, async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f);
  const input = { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } };
  const passed = await f.request('gate.execute', input, 'older-pass');
  fakeEvaluator(f, { blocking: true });
  // A different review configuration deliberately requests fresh discovery.
  const failed = await f.request('gate.execute', { ...input, configuration: { ...input.configuration, reasoningEffort: 'high' } }, 'newer-failure');
  const failedRef = failed.event.payload.results[0];
  assert.equal((await f.core.store.json(failedRef)).outcome, 'FAIL');
  const lost = loss === 'root' ? failedRef : (await f.core.store.json(failedRef)).artifacts[1];
  await rm(join(f.home, '.gatereeve-current/objects', lost.hash.slice(7)));
  const state = (await f.core.state()).state, source = await f.core.store.json(state.candidate);
  await assert.rejects(f.core.currentResult(passed.event.payload.results[0], source, state), /loss requires fresh proof/);
  const blocked = await f.core.check('acceptance');
  assert.equal(blocked.outcomes.find(item => item.id === 'code').satisfied, false);
  fakeEvaluator(f, { dispositions: [{ id: 'finding-1', status: 'resolved', evidence: 'Fresh independent source inspection confirms correction.' }] });
  const fresh = await f.request('gate.execute', input, 'fresh-after-loss');
  assert.notEqual(fresh.reused, true);
  assert.equal((await f.core.currentResult(fresh.event.payload.results[0], source, (await f.core.state()).state)).outcome, 'PASS');
});

test('resolved history above 64 records does not halt fresh review', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f);
  const input = { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } };
  const seed = await f.request('gate.execute', input, 'history-seed');
  for (let i = 0; i < 33; i++) {
    const id = `finding-${i}`;
    fakeEvaluator(f, { blocking: true, findingId: id });
    await f.request('gate.execute', { ...input, configuration: { ...input.configuration, round: i } }, `failure-${i}`);
    fakeEvaluator(f, { dispositions: [{ id, status: 'resolved', evidence: 'Independent closure' }] });
    await f.request('gate.execute', input, `closure-${i}`);
  }
  await writeFile(join(f.repo, 'app.js'), 'export const answer = 43;\n');
  await git(f.repo, ['add', 'app.js']); await git(f.repo, ['commit', '-m', 'later source']);
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head }], scope: 'FEATURE', criteria: ['R1'] }, 'history-source');
  fakeEvaluator(f, { historyAssessment: { affected: [], carryForwardReason: 'Checked all prior closures against source changes and interactions; no prior defect is reintroduced.' } });
  const reviewed = await f.request('gate.execute', input, 'large-history-review');
  const result = await f.core.store.json(reviewed.event.payload.results[0]);
  assert.equal(result.outcome, 'PASS');
  const packet = await f.core.store.json(result.input);
  assert.equal(packet.history.length, 66); assert.equal(packet.reconsiderClosures.length, 33);
});


test('malformed successful provider text never reaches gate summaries or artifacts', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f);
  const { parseClaudeStructuredOutput } = await import('../../plugin-src/shared/resources/protocol/local-agent-adapters.js');
  f.core.runtime.evaluator.runStage = async () => parseClaudeStructuredOutput('PRIVATE_PROVIDER_CONTEXT_SENTINEL');
  const checked = await f.request('gate.execute', { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } }, 'malformed-private');
  const result = await f.core.store.json(checked.event.payload.results[0]);
  assert.equal(result.outcome, 'UNAVAILABLE'); assert.doesNotMatch(result.summary, /PRIVATE_PROVIDER_CONTEXT/);
  for (const artifact of result.artifacts) assert.doesNotMatch((await f.core.store.get(artifact)).toString(), /PRIVATE_PROVIDER_CONTEXT/);
});

test('implementation rejects lost retained human decision documents', async t => {
  const f = await fixture(t); await authorize(f);
  const interview = await f.core.store.capture('interview.md');
  assert.equal((await f.core.check('implementation')).allowed, true);
  await rm(join(f.home, '.gatereeve-current/objects', interview.hash.slice(7)));
  const check = await f.core.check('implementation');
  assert.equal(check.allowed, false);
  assert.match(check.missing.join(';'), /Retained decision closure/);
});

test('completion cannot combine a superseded candidate with newly authorized commitments', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const prior = await f.core.commitments();
  const originalCandidate = (await f.core.state()).state.candidate;
  await writeFile(join(f.home, 'design.md'), '# Design amended with approved scope\n');
  const next = await f.core.commitments();
  await f.request('human.decide', { kind: 'amend', actions: ['authorize-implementation'], subject: next.subject, previousSubject: prior.subject,
    authority: human, reason: 'Changed requirement', consequences: 'Refresh affected proof' }, 'amend-after-candidate');
  assert.equal((await f.core.check('implementation')).allowed, true);
  const check = await f.core.check('completion');
  assert.equal(check.allowed, false);
  assert.match(check.missing.join(';'), /Candidate commitments differ/);
  assert.deepEqual((await f.core.state()).state.candidate, originalCandidate, 'historical candidate is retained, not rewritten');
});

test('existing canonical home cannot escape through an ancestor symlink on status or read', async t => {
  const f = await fixture(t);
  const { rename } = await import('node:fs/promises');
  const { executeCurrentRequest } = await import('../../plugin-src/shared/resources/protocol/current/adapter.js');
  await writeFile(join(f.root, '.agentic-workflow.json'), JSON.stringify({ schemaVersion: 1, featureId: 'feature', repositories: { app: { path: 'app', integrationBranch: 'main' } } }));
  await rename(join(f.root, 'docs'), join(f.root, 'redirected'));
  await symlink(join(f.root, 'redirected'), join(f.root, 'docs'));
  await assert.rejects(CurrentCore.at(f.context), /Unsafe feature home ancestor/);
  for (const operation of ['status', 'read']) {
    const result = await executeCurrentRequest({ operation, cwd: f.repo, kind: 'artifact', id: 'design.md' });
    assert.equal(result.ok, false);
    assert.match(result.error.message, /Unsafe feature home ancestor/);
  }
});

test('FEATURE scope enforces its configured original base and invalidates changed range policy', async t => {
  const f = await fixture(t); await authorize(f);
  await writeFile(join(f.repo, 'app.js'), 'export const answer = 43;\n');
  await git(f.repo, ['add', 'app.js']); await git(f.repo, ['commit', '-m', 'later slice']);
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  const input = { repositories: [{ alias: 'app', base: head, head }], scope: 'FEATURE', criteria: ['R1'] };
  await assert.rejects(f.request('candidate.prepare', input), /configured original featureBaseSha/);
  input.repositories[0].base = f.head;
  await f.request('candidate.prepare', input, 'full-feature-range');
  assert.ok((await f.request('candidate.ready', {}, 'full-feature-ready')).event);
  f.context.repositories[0].featureBaseSha = head;
  await assert.rejects(f.request('candidate.ready', {}, 'changed-range'), /policy changed/);
  delete f.context.repositories[0].featureBaseSha;
  await assert.rejects(f.request('candidate.prepare', input), /configured original featureBaseSha/);
});

test('base-only delta changes require path coverage and export both prior source endpoints', async t => {
  const f = await fixture(t); await authorize(f);
  await writeFile(join(f.repo, 'app.js'), 'export const answer = 43;\n');
  await git(f.repo, ['add', 'app.js']); await git(f.repo, ['commit', '-m', 'second base']);
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: head, head }], scope: 'SLICE', criteria: ['R1'] }, 'slice-first');
  fakeEvaluator(f);
  const first = await f.request('gate.execute', { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } }, 'first-slice-review');
  const prior = first.event.payload.results[0];
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head }], scope: 'SLICE', criteria: ['R1'] }, 'expanded-slice');
  const original = f.core.runtime.evaluator.runStage;
  let examined = false;
  f.core.runtime.evaluator.runStage = async request => {
    assert.deepEqual(request.input.changedPaths, ['app/app.js']);
    const root = request.repositoryPath;
    const priorDirectory = join(root, 'prior', prior.hash.slice(7));
    assert.match(await readFile(join(priorDirectory, 'base/app/app.js'), 'utf8'), /43/);
    assert.match(await readFile(join(priorDirectory, 'repositories/app/app.js'), 'utf8'), /43/);
    examined = true;
    return original(request);
  };
  const result = await f.request('gate.execute', { gates: ['code'], prior, configuration: { provider: 'codex', model: 'fixture' } }, 'expanded-review');
  assert.equal(examined, true);
  assert.equal((await f.core.store.json(result.event.payload.results[0])).outcome, 'PASS');
});

test('ordinary CLI status exposes original failed outcomes and accepted consequences', async t => {
  const f = await fixture(t);
  f.context.repositories[0].integrationBranch = 'main';
  await writeFile(join(f.root, '.agentic-workflow.json'), JSON.stringify({ schemaVersion: 1, featureId: 'feature', repositories: { app: { path: 'app', integrationBranch: 'main', featureBaseSha: f.head } } }));
  await authorize(f); await candidate(f); await reviewAll(f);
  await runVerification(f, true, 'later-failure-for-cli');
  const subject = (await f.core.state()).state.candidate.hash;
  await f.request('human.decide', { kind: 'waive', gates: ['verification'], subject, authority: human, reason: 'Explicit test exception', consequences: 'Known failed verification remains' }, 'cli-exception');
  const { currentCommands } = await import('../src/commands/current.js');
  const lines = [];
  const log = console.log;
  try {
    console.log = line => lines.push(line);
    await currentCommands().find(command => command.name() === 'status').parseAsync(['node', 'gatereeve', '--cwd', f.repo]);
  } finally { console.log = log; }
  assert.match(lines.join('\n'), /verification: FAIL; accepted exception: Explicit test exception; consequences: Known failed verification remains/);
});

test('executable files under bookkeeping-looking directories stay in source and cleanliness checks', async t => {
  const f = await fixture(t, { nested: false }); await authorize(f);
  await mkdir(join(f.repo, 'docs/issues/unrelated'), { recursive: true });
  await writeFile(join(f.repo, 'docs/issues/unrelated/helper.js'), 'export const answer = 42;');
  await writeFile(join(f.home, 'helper.js'), 'export const other = 42;');
  await git(f.repo, ['add', 'docs/issues/unrelated/helper.js', 'docs/issues/feature/helper.js']);
  await git(f.repo, ['commit', '-m', 'reachable source in docs']);
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head }], scope: 'FEATURE', criteria: ['R1'] }, 'source-in-docs');
  const pinned = await f.core.store.json((await f.core.state()).state.candidate);
  assert.ok(pinned.repositories[0].files.some(file => file.path === 'docs/issues/unrelated/helper.js'));
  assert.ok(pinned.repositories[0].files.some(file => file.path === 'docs/issues/feature/helper.js'));
  await writeFile(join(f.repo, 'docs/issues/unrelated/helper.js'), 'export const answer = 0;');
  await assert.rejects(f.request('candidate.ready'), /dirty/);
});

test('quality exception survives bookkeeping-equivalent commits but not changed source', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const oldCandidate = (await f.core.state()).state.candidate;
  await f.request('human.decide', { kind: 'waive', gates: ['verification'], subject: oldCandidate.hash, authority: human, reason: 'Scoped quality exception', consequences: 'Missing verification' }, 'waiver-before-bookkeeping');
  await git(f.repo, ['commit', '--allow-empty', '-m', 'bookkeeping']);
  let head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head }], scope: 'FEATURE', criteria: ['R1'] }, 'equivalent-candidate');
  let outcome = (await f.core.check('acceptance')).outcomes.find(item => item.id === 'verification');
  assert.equal(outcome.exception.subject, oldCandidate.hash);
  assert.equal(outcome.satisfied, true);
  assert.equal(outcome.outcome, 'UNAVAILABLE');
  await writeFile(join(f.repo, 'app.js'), 'export const answer = 43;');
  await git(f.repo, ['add', 'app.js']); await git(f.repo, ['commit', '-m', 'source change']);
  head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head }], scope: 'FEATURE', criteria: ['R1'] }, 'changed-candidate');
  outcome = (await f.core.check('acceptance')).outcomes.find(item => item.id === 'verification');
  assert.equal(outcome.exception, null);
  assert.equal(outcome.satisfied, false);
});

test('CI validates a retained current journal and accepts optional untracked evidence without replay', async t => {
  const f = await fixture(t);
  const { validateLocalRecord } = await import('../../ci/validate-local-record.mjs');
  const before = await readFile(join(f.home, 'events.jsonl'));
  assert.equal((await validateLocalRecord(f.home, f.root)).mode, 'current-journal');
  await rm(join(f.home, '.gatereeve-current/active.json'));
  await assert.rejects(validateLocalRecord(f.home, f.root), /Missing activation copy/);
  await rm(join(f.home, '.gatereeve-current/active-witness.json'));
  assert.equal((await validateLocalRecord(f.home, f.root)).mode, 'documents-only');
  assert.deepEqual(await readFile(join(f.home, 'events.jsonl')), before);
  await assert.rejects(validateLocalRecord(f.repo, f.root), /canonical feature home/);
});

test('retained workflow history stays outside source at every endpoint and supports untracked continuation', async t => {
  const f = await fixture(t, { nested: false });
  const records = {
    'docs/issues/other/pr-12/explain-diff.html': '<html>Old implementation rationale and review explanation</html>',
    'docs/issues/feature/pr-12/attempts/old/explain-diff.html': '<html>Older attempted explanation</html>',
    'docs/issues/feature/pr-12/attempts/old/code-review.md': '# FAIL\nPrior finding and verdict',
    'docs/issues/feature/advisory/old/discovery.json': JSON.stringify({ schemaVersion: 1, kind: 'slice-advisory-review', outcome: 'FAIL' }),
    'docs/issues/other/events.jsonl': 'raw previous events',
    'docs/issues/other/workflow-model.lock.json': '{}',
    'docs/issues/other/verification/provider.json': JSON.stringify({ schemaVersion: 1, kind: 'feature-verification', payload: { verdict: 'FAIL' } }),
  };
  for (const [path, bytes] of Object.entries(records)) {
    const { dirname } = await import('node:path');
    await mkdir(dirname(join(f.repo, path)), { recursive: true }); await writeFile(join(f.repo, path), bytes);
  }
  // Preserved, untracked reports must not require a source commit.
  await authorize(f); await candidate(f);
  const before = await f.core.store.json((await f.core.state()).state.candidate);
  await git(f.repo, ['add', ...Object.keys(records)]); await git(f.repo, ['commit', '-m', 'retain historical records']);
  const withHistory = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head: withHistory }], scope: 'FEATURE', criteria: ['R1'] }, 'history-only');
  const after = await f.core.store.json((await f.core.state()).state.candidate);
  const { contentIdentity } = await import('../../plugin-src/shared/resources/protocol/current/evidence.js');
  assert.equal(contentIdentity(before), contentIdentity(after));
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: withHistory, head: withHistory, target: withHistory }], scope: 'SLICE', criteria: ['R1'] }, 'all-endpoints');
  fakeEvaluator(f);
  const original = f.core.runtime.evaluator.runStage;
  f.core.runtime.evaluator.runStage = async request => {
    for (const prefix of ['repositories', 'base', 'target']) {
      const files = await readdir(join(request.repositoryPath, prefix, 'app'), { recursive: true });
      assert.deepEqual(files, ['app.js']);
    }
    return original(request);
  };
  await f.request('gate.execute', { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } }, 'history-blind-review');
  await writeFile(join(f.home, 'pr-12/attempts/old/code-review.md'), '# New historical note');
  assert.ok((await f.request('candidate.ready', {}, 'history-edit')).event);
});

test('configuration and executable files remain source inside report directories', async t => {
  const f = await fixture(t, { nested: false }); await authorize(f);
  const dir = join(f.home, 'verification'); await mkdir(dir);
  const data = { 'app.html': '<script>window.answer = 42;</script>', 'helper.js': 'export const answer = 42;', 'config.json': '{"command":"run"}', 'unknown.json': '{}', 'invalid.json': '{', 'app.yaml': 'enabled: true' };
  for (const [name, bytes] of Object.entries(data)) await writeFile(join(dir, name), bytes);
  await assert.rejects(candidate(f), /dirty/);
  await git(f.repo, ['add', 'docs/issues/feature/verification']); await git(f.repo, ['commit', '-m', 'configuration in record-looking directory']);
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head }], scope: 'FEATURE', criteria: ['R1'] }, 'configuration-candidate');
  const pin = (await f.core.store.json((await f.core.state()).state.candidate)).repositories[0];
  for (const name of Object.keys(data)) assert.ok(pin.files.some(file => file.path.endsWith('/'+name)));
  await writeFile(join(dir, 'config.json'), '{"command":"changed"}');
  await assert.rejects(f.request('candidate.ready'), /dirty/);
});

test('target-only changes invalidate proof and appear in delta review with prior target bytes', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f);
  const first = await f.request('gate.execute', { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } }, 'before-target-movement');
  const prior = first.event.payload.results[0];
  await writeFile(join(f.repo, 'app.js'), 'export const answer = 43;\n');
  await git(f.repo, ['add', 'app.js']); await git(f.repo, ['commit', '-m', 'target movement']);
  const target = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await git(f.repo, ['checkout', '--detach', f.head]);
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head: f.head, target }], scope: 'FEATURE', criteria: ['R1'] }, 'target-refresh');
  assert.equal((await f.core.check('acceptance')).outcomes.find(item => item.id === 'code').satisfied, false);
  const original = f.core.runtime.evaluator.runStage;
  f.core.runtime.evaluator.runStage = async request => {
    assert.deepEqual(request.input.changedPaths, ['app/app.js']);
    assert.match(await readFile(join(request.repositoryPath, 'target/app/app.js'), 'utf8'), /43/);
    assert.match(await readFile(join(request.repositoryPath, 'prior', prior.hash.slice(7), 'target/app/app.js'), 'utf8'), /42/);
    return original(request);
  };
  const review = await f.request('gate.execute', { gates: ['code'], prior, configuration: { provider: 'codex', model: 'fixture' } }, 'target-delta');
  assert.equal((await f.core.store.json(review.event.payload.results[0])).outcome, 'PASS');
});

test('runner reuse binds declared inherited additions without retaining plaintext values', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const key = 'GATEREEVE_TEST_REUSE_MODE'; const original = process.env[key];
  t.after(() => { if (original === undefined) delete process.env[key]; else process.env[key] = original; });
  process.env[key] = 'pass-private-fixture-value';
  await f.request('spec.validate', {}, 'refresh-before-environment-pass');
  const input = { gates: ['verification'], configuration: { environment: { inherit: [key] }, externalRuntimeInputs: { app: [] }, checks: [{ repository: 'app', command: process.execPath,
    args: ['-e', `process.exit(process.env.${key}.startsWith('pass') ? 0 : 1)`], purpose: 'Inherited environment affects outcome' }] } };
  const first = await f.request('gate.execute', input, 'environment-pass');
  const reference = first.event.payload.results[0];
  const result = await f.core.store.json(reference);
  const manifest = await f.core.store.json(result.input);
  assert.equal(result.outcome, 'PASS'); assert.ok(!JSON.stringify(manifest).includes('pass-private-fixture-value'));
  process.env[key] = 'fail-private-fixture-value';
  const { state } = await f.core.state(); const current = await f.core.store.json(state.candidate);
  await assert.rejects(f.core.currentResult(reference, current, state), /environment changed/);
  await f.request('spec.validate', {}, 'refresh-before-environment-fail');
  const second = await f.request('gate.execute', input, 'environment-fail');
  assert.notEqual(second.reused, true);
  assert.equal((await f.core.store.json(second.event.payload.results[0])).outcome, 'FAIL');
});

test('failed specification and reconciliation checks retain exact diagnostics without passage', async t => {
  const f = await fixture(t);
  const design = await f.core.store.capture('design.md');
  await f.request('human.decide', { kind: 'approve-design', subject: design.hash, authority: human, reason: 'Approved', consequences: 'Validate spec' }, 'design');
  const goodSpec = await readFile(join(f.home, 'spec.md'));
  await writeFile(join(f.home, 'spec.md'), '# Invalid spec\n');
  await assert.rejects(f.request('spec.validate', {}, 'bad-spec'), /validation failed/);
  let state = (await f.core.state()).state;
  assert.equal(state.specValidation, null); assert.equal(state.validationFailures.length, 1);
  const failure = state.validationFailures[0];
  assert.equal(failure.outcome, 'FAIL');
  const proof = await f.core.store.json(failure.proof);
  assert.equal(proof.passed, false); assert.ok(proof.diagnostic.length > 0);
  await f.core.store.closure(failure);
  await writeFile(join(f.home, 'spec.md'), goodSpec); await f.request('spec.validate', {}, 'fixed-spec');
  const current = await f.core.commitments();
  await f.request('human.decide', { kind: 'authorize-implementation', subject: current.subject, authority: human, reason: 'Approved', consequences: 'Implement' }, 'implementation');
  await candidate(f);
  await writeFile(join(f.home, 'issues.md'), '# Broken issues\n');
  fakeEvaluator(f, { blocking: true });
  const check = await f.request('gate.execute', { gates: ['reconcile'], configuration: { provider: 'codex', model: 'fixture' } }, 'failed-reconciliation');
  const result = await f.core.store.json(check.event.payload.results[0]);
  assert.equal(result.outcome, 'FAIL');
  const artifacts = await Promise.all(result.artifacts.map(ref => f.core.store.get(ref)));
  assert.equal(result.findings[0].blocking, true);
  assert.ok(artifacts.length > 0, 'retain independent response and supporting packet');
  await f.core.store.closure(check.event.payload.results[0]);
});

test('combined amendment records a pending instruction before interruption and reconciles retry once', async t => {
  const f = await fixture(t); await authorize(f);
  const previousSubject = (await f.core.commitments()).subject;
  await writeFile(join(f.home, 'spec.md'), (await readFile(join(f.home, 'spec.md'), 'utf8'))+'\nClarified requirement.\n');
  const subject = (await f.core.commitments()).subject;
  const input = { kind: 'amend', actions: ['authorize-implementation'], previousSubject, subject, authority: human,
    reason: 'Approve amendment and continue', consequences: 'Refresh affected proof' };
  const realProof = f.core.specProof;
  f.core.specProof = async () => { throw new Error('simulated interruption before validation'); };
  await assert.rejects(f.request('human.decide', input, 'amend-interrupted'), /simulated interruption/);
  let state = (await f.core.state()).state;
  assert.equal(state.pendingDecisions.length, 1);
  assert.equal(state.pendingDecisions[0].decision.previousSubject, previousSubject);
  assert.equal(state.pendingDecisions[0].decision.authority.instruction, human.instruction);
  assert.equal((await f.core.check('implementation')).allowed, false);
  f.core.specProof = realProof;
  const done = await f.request('human.decide', input, 'amend-interrupted');
  state = (await f.core.state()).state;
  assert.equal(state.pendingDecisions.length, 0);
  assert.equal((await f.core.check('implementation')).allowed, true);
  assert.equal((await f.request('human.decide', input, 'amend-interrupted')).event.hash, done.event.hash);
});

test('waiver with acceptance retains pending human instruction before failed continuation', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const subject = (await f.core.state()).state.candidate.hash;
  const input = { kind: 'waive', actions: ['accept'], gates: ['verification'], subject, authority: human,
    reason: 'Accept despite named verification exception', consequences: 'Known verification gap' };
  await assert.rejects(f.request('human.decide', input, 'waive-pending'), /Required review proof/);
  let state = (await f.core.state()).state;
  assert.equal(state.pendingDecisions.length, 1);
  assert.ok(!state.decisions.some(item => item.kind === 'waive'));
  await reviewAll(f);
  const result = await f.request('human.decide', input, 'waive-pending');
  state = (await f.core.state()).state;
  assert.equal(state.pendingDecisions.length, 0);
  assert.equal(result.event.payload.authority.instruction, human.instruction);
});


test('review views expose regular Git modes at every current and prior endpoint', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f);
  const first = await f.request('gate.execute', { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } }, 'mode-baseline');
  const prior = first.event.payload.results[0];
  await chmod(join(f.repo, 'app.js'), 0o755); await git(f.repo, ['add', 'app.js']); await git(f.repo, ['commit', '-m', 'executable mode only']);
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head, target: head }], scope: 'FEATURE', criteria: ['R1'] }, 'mode-candidate');
  const original = f.core.runtime.evaluator.runStage;
  f.core.runtime.evaluator.runStage = async request => {
    assert.deepEqual(request.input.changedPaths, ['app/app.js']);
    const metadata = JSON.parse(await readFile(join(request.repositoryPath, 'metadata/app.json'), 'utf8'));
    assert.equal(metadata.base.entries[0].mode, '100644');
    assert.equal(metadata.head.entries[0].mode, '100755');
    assert.equal(metadata.target.entries[0].mode, '100755');
    const previous = JSON.parse(await readFile(join(request.repositoryPath, 'prior', prior.hash.slice(7), 'metadata/app.json'), 'utf8'));
    for (const endpoint of ['base', 'head', 'target']) assert.equal(previous[endpoint].entries[0].mode, '100644');
    assert.equal((await stat(join(request.repositoryPath, 'repositories/app/app.js'))).mode & 0o777, 0o400);
    return original(request);
  };
  const reviewed = await f.request('gate.execute', { gates: ['code'], prior, configuration: { provider: 'codex', model: 'fixture' } }, 'mode-delta');
  assert.equal((await f.core.store.json(reviewed.event.payload.results[0])).outcome, 'PASS');
});

for (const exitCode of [0, 7]) test(`later runner preflight failure retains completed check output with exit ${exitCode}`, async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const executed = await f.request('gate.execute', { gates: ['verification'], configuration: { externalRuntimeInputs: { app: [] }, checks: [
    { repository: 'app', command: process.execPath, args: ['-e', `console.log('retained-output'); console.error('retained-error'); process.exit(${exitCode})`], purpose: 'Check before later preflight failure' },
    { repository: 'unselected', command: process.execPath, args: [], purpose: 'Invalid later repository' },
  ] } }, 'partial-run');
  const result = await f.core.store.json(executed.event.payload.results[0]);
  assert.equal(result.outcome, 'UNAVAILABLE');
  const artifacts = await Promise.all(result.artifacts.map(ref => f.core.store.get(ref)));
  const aggregate = artifacts.map(bytes => { try { return JSON.parse(bytes); } catch { return null; } }).find(value => value?.receipts);
  assert.equal(aggregate.receipts.length, 1);
  assert.equal(aggregate.receipts[0].exitCode, exitCode);
  assert.equal(aggregate.receipts[0].outcome, exitCode ? 'FAIL' : 'PASS');
  assert.match((await f.core.store.get(aggregate.receipts[0].stdout)).toString(), /retained-output/);
  assert.match((await f.core.store.get(aggregate.receipts[0].stderr)).toString(), /retained-error/);
  await f.core.store.closure(executed.event.payload.results[0]);
});

for (const changed of [false, true]) test(`reopened blocking findings remain required in automatic history with changed source ${changed}`, async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const input = { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } };
  fakeEvaluator(f, { blocking: true }); const original = await f.request('gate.execute', input, 'initial-defect');
  fakeEvaluator(f, { dispositions: [{ id: 'finding-1', status: 'resolved', evidence: 'Independent original closure' }] });
  await f.request('gate.execute', input, 'closed-defect');
  fakeEvaluator(f, { outcome: 'FAIL', dispositions: [{ id: 'finding-1', status: 'present', evidence: 'Fresh inspection finds original defect present again' }] });
  const reopened = await f.request('gate.execute', { ...input, configuration: { ...input.configuration, reviewRevision: 2 }, history: original.event.payload.results }, 'reopened-defect');
  input.configuration.reviewRevision = 3;
  assert.equal((await f.core.store.json(reopened.event.payload.results[0])).outcome, 'FAIL');
  if (changed) {
    await writeFile(join(f.repo, 'app.js'), 'export const answer = 43;\n'); await git(f.repo, ['add', 'app.js']); await git(f.repo, ['commit', '-m', 'change after reopening']);
    const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
    await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head }], scope: 'FEATURE', criteria: ['R1'] }, 'reopened-source');
  }
  for (const status of [null, 'unaffected', 'present']) {
    fakeEvaluator(f, { dispositions: status ? [{ id: 'finding-1', status, evidence: 'Unsupported attempt to pass an open finding' }] : [] });
    const reviewed = await f.request('gate.execute', input, `missing-closure-${status}`);
    const result = await f.core.store.json(reviewed.event.payload.results[0]);
    assert.equal(result.outcome, 'UNAVAILABLE');
    const packet = await f.core.store.json(result.input);
    assert.ok(packet.history.some(ref => ref.hash === reopened.event.payload.results[0].hash));
  }
  fakeEvaluator(f, { dispositions: [{ id: 'finding-1', status: 'resolved', evidence: 'Fresh independent inspection confirms correction after reopening' }] });
  const corrected = await f.request('gate.execute', input, 'reclosed-defect');
  assert.equal((await f.core.store.json(corrected.event.payload.results[0])).outcome, 'PASS');
});


for (const malformed of [undefined, '--version', [4]]) test(`corrected runner configuration recovers after invalid arguments ${JSON.stringify(malformed)}`, async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const check = { repository: 'app', command: process.execPath, purpose: 'Run Node version' };
  if (malformed !== undefined) check.args = malformed;
  const failed = await f.request('gate.execute', { gates: ['verification'], configuration: { externalRuntimeInputs: { app: [] }, checks: [check] } }, 'malformed-check');
  assert.equal((await f.core.store.json(failed.event.payload.results[0])).outcome, 'UNAVAILABLE');
  const corrected = await f.request('gate.execute', { gates: ['verification'], configuration: { externalRuntimeInputs: { app: [] }, checks: [{ ...check, args: ['--version'] }] } }, 'corrected-check');
  assert.equal((await f.core.store.json(corrected.event.payload.results[0])).outcome, 'PASS');
  const acceptance = await f.request('milestone.check', { name: 'acceptance' });
  assert.equal(acceptance.outcomes.find(item => item.id === 'verification').satisfied, true);
});

for (const changed of [false, true]) test(`delta prior cannot reorder an older closure after a reopened blocking finding with changed source ${changed}`, async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const input = { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } };
  fakeEvaluator(f, { blocking: true }); const initial = await f.request('gate.execute', input, 'delta-initial-finding');
  fakeEvaluator(f, { dispositions: [{ id: 'finding-1', status: 'resolved', evidence: 'Original independent closure' }] });
  const closure = await f.request('gate.execute', input, 'delta-old-closure');
  fakeEvaluator(f, { outcome: 'FAIL', dispositions: [{ id: 'finding-1', status: 'present', evidence: 'Later inspection reopens the finding' }] });
  const reopened = await f.request('gate.execute', { ...input, configuration: { ...input.configuration, reviewRevision: 2 }, history: initial.event.payload.results }, 'delta-reopened');
  assert.equal((await f.core.store.json(reopened.event.payload.results[0])).outcome, 'FAIL');
  if (changed) {
  await writeFile(join(f.repo, 'app.js'), 'export const answer = 43;\n'); await git(f.repo, ['add', 'app.js']); await git(f.repo, ['commit', '-m', 'delta after reopened finding']);
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head }], scope: 'FEATURE', criteria: ['R1'] }, 'delta-reopened-candidate');
  }
  const delta = { ...input, prior: closure.event.payload.results[0] };
  for (const status of [null, 'unaffected', 'present']) {
    fakeEvaluator(f, { dispositions: status ? [{ id: 'finding-1', status, evidence: 'No supported new closure' }] : [] });
    const reviewed = await f.request('gate.execute', delta, `delta-unsupported-${status}`);
    const result = await f.core.store.json(reviewed.event.payload.results[0]);
    assert.equal(result.outcome, 'UNAVAILABLE');
    assert.equal((await f.request('milestone.check', { name: 'acceptance' })).outcomes.find(item => item.id === 'code').satisfied, false);
  }
  fakeEvaluator(f, { dispositions: [{ id: 'finding-1', status: 'resolved', evidence: 'Current delta and interactions independently verified corrected' }] });
  const fixed = await f.request('gate.execute', delta, 'delta-supported-closure');
  assert.equal((await f.core.store.json(fixed.event.payload.results[0])).outcome, 'PASS');
});


test('milestone passage rejects candidate replacement during an otherwise passing check', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); await reviewAll(f);
  const check = f.core.check.bind(f.core);
  f.core.check = async (...args) => {
    const result = await check(...args);
    if (args[0] === 'acceptance') {
      assert.equal(result.allowed, true);
      await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head: f.head }], scope: 'SLICE', criteria: ['R1'] }, 'concurrent-candidate');
    }
    return result;
  };
  await assert.rejects(f.request('milestone.pass', { name: 'acceptance' }, 'raced-passage'), /state changed/);
  const state = (await f.core.state()).state;
  assert.equal(state.phase, 'IMPLEMENTING'); assert.equal(state.ready, false);
});

for (const claims of [[], [{ findingId: 'finding-1', claim: 'Corrected the retained defect' }]]) test(`qualified closure reuses equivalent review with claims ${claims.length}`, async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const input = { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } };
  fakeEvaluator(f, { blocking: true }); await f.request('gate.execute', input, 'reuse-open-finding');
  const count = fakeEvaluator(f, { dispositions: [{ id: 'finding-1', status: 'resolved', evidence: 'Verified current correction' }] });
  const closed = await f.request('gate.execute', { ...input, claims }, 'reuse-close-finding');
  assert.equal((await f.core.store.json(closed.event.payload.results[0])).outcome, 'PASS');
  const repeated = await f.request('gate.execute', { ...input, claims }, 'reuse-closed-finding');
  assert.equal(repeated.reused, true); assert.equal(count(), 1);
  fakeEvaluator(f, { blocking: true });
  await f.request('gate.execute', { ...input, configuration: { ...input.configuration, reviewRevision: 2 } }, 'newer-failure');
  const newCount = fakeEvaluator(f);
  const retry = await f.request('gate.execute', { ...input, claims }, 'no-old-pass-resurrection');
  assert.notEqual(retry.reused, true); assert.equal(newCount(), 1);
  assert.equal((await f.core.store.json(retry.event.payload.results[0])).outcome, 'UNAVAILABLE');
});

test('repository order and grouped gate order preserve equivalent review identity', async t => {
  const f = await fixture(t); const other = join(f.root, 'service'); await mkdir(other);
  await git(other, ['init', '-b', 'topic']); await git(other, ['config', 'user.email', 'fixture@example.test']); await git(other, ['config', 'user.name', 'Fixture']); await git(other, ['config', 'commit.gpgsign', 'false']);
  await writeFile(join(other, 'service.js'), 'export const service = true;'); await git(other, ['add', '.']); await git(other, ['commit', '-m', 'service']);
  const head = (await git(other, ['rev-parse', 'HEAD'])).trim(); f.context.repositories.push({ alias: 'service', path: other, featureBaseSha: head });
  await authorize(f);
  const repositories = [{ alias: 'app', base: f.head, head: f.head }, { alias: 'service', base: head, head }];
  await f.request('candidate.prepare', { repositories, scope: 'FEATURE', criteria: ['R1'] }, 'ordered-candidate');
  const verified = await runVerification(f); const count = fakeEvaluator(f);
  const input = { gates: ['code', 'spec'], consumed: verified.event.payload.results, configuration: { provider: 'codex', model: 'fixture' } };
  const initial = await f.request('gate.execute', input, 'ordered-review');
  const before = (await f.core.state()).state.candidate;
  await f.request('candidate.prepare', { repositories: [...repositories].reverse(), scope: 'FEATURE', criteria: ['R1'] }, 'reversed-candidate');
  const after = (await f.core.state()).state.candidate;
  // Each preparation owns distinct retention refs; review equivalence is content-based.
  assert.notEqual(after.hash, before.hash);
  assert.equal(contentIdentity(await f.core.store.json(after)), contentIdentity(await f.core.store.json(before)));
  const reversed = await f.request('gate.execute', { ...input, gates: ['spec', 'code'] }, 'reversed-review');
  assert.equal(reversed.reused, true); assert.equal(count(), 1);
  assert.deepEqual(reversed.results.map(ref => ref.hash), [...initial.event.payload.results].reverse().map(ref => ref.hash));
});


for (const race of ['after-pending', 'after-validation']) test(`decision passage cannot adopt state changes ${race}`, async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const current = await f.core.commitments();
  await writeFile(join(f.home, 'spec.md'), (await readFile(join(f.home, 'spec.md'), 'utf8'))+'\nApproved clarification.\n');
  const next = await f.core.commitments(); const original = f.core.specProof.bind(f.core);
  f.core.specProof = async (...args) => {
    const proof = await original(...args);
    if (race === 'after-validation') await f.request('run.pause', { authority: human }, 'pause-during-instruction');
    return proof;
  };
  const append = f.core.store.append.bind(f.core.store);
  f.core.store.append = async (...args) => {
    const event = await append(...args);
    if (race === 'after-pending' && args[2] === 'DECISION_PENDING') await f.request('run.pause', { authority: human }, 'pause-before-pending-projection');
    return event;
  };
  await assert.rejects(f.request('human.decide', { kind: 'amend', actions: ['authorize-implementation'],
    previousSubject: current.subject, subject: next.subject, authority: human, reason: 'Approve clarification', consequences: 'Refresh proof' }, 'raced-instruction'), /concurrent|changed|sequence/i);
  const state = (await f.core.state()).state;
  assert.equal(state.paused, true); assert.equal(state.pendingDecisions.length, 1);
  assert.ok(!state.decisions.some(item => item.subject === next.subject));
});

// These requests cross the same public gate boundary as normal orchestration.
test('unrecorded copied PASS cannot supply verification or delta ancestry', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); const launches = fakeEvaluator(f);
  const unavailable = await f.request('gate.execute', { gates: ['verification'], configuration: { externalRuntimeInputs: { app: [] }, checks: [] } }, 'empty-runner');
  const raw = await f.core.store.json(unavailable.event.payload.results[0]);
  const invented = await f.core.store.putJson({ ...raw, outcome: 'PASS', summary: 'Invented', runner: null });
  await assert.rejects(f.request('gate.execute', { gates: ['spec'], consumed: [invented], configuration: { provider: 'codex', model: 'fixture' } }, 'forged-consumed'), /not recorded/);
  const actual = await f.request('gate.execute', { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } }, 'actual-code');
  const code = await f.core.store.json(actual.event.payload.results[0]);
  const inventedPrior = await f.core.store.putJson({ ...code, summary: 'Invented prior' });
  await assert.rejects(f.request('gate.execute', { gates: ['code'], prior: inventedPrior, configuration: { provider: 'codex', model: 'fixture' } }, 'forged-delta'), /not recorded/);
  assert.equal(launches(), 1);
  const state = (await f.core.state()).state; const source = await f.core.store.json(state.candidate);
  const receipt = await f.core.store.json(code.receipt);
  const job = await f.core.store.job(receipt.jobId);
  assert.ok(job.results.some(ref => ref.hash === actual.event.payload.results[0].hash));
  assert.equal((await f.core.currentResult(actual.event.payload.results[0], source, state)).outcome, 'PASS');
});

for (const mode of ['100755', '120000']) test(`reserved history with Git mode ${mode} fails capture without leaking or hiding source`, async t => {
  const f = await fixture(t, { nested: false }); await authorize(f);
  await mkdir(join(f.repo, 'docs/issues/other'), { recursive: true });
  const path = join(f.repo, 'docs/issues/other/events.jsonl');
  if (mode === '120000') await symlink('../../../app.js', path);
  else { await writeFile(path, 'RAW IMPLEMENTATION HISTORY\n'); await chmod(path, 0o755); }
  await git(f.repo, ['add', 'docs/issues/other/events.jsonl']); await git(f.repo, ['commit', '-m', 'unsafe history mode']);
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await assert.rejects(f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head }], scope: 'FEATURE', criteria: ['R1'] }, 'unsafe-mode'), /Lifecycle records must be regular non-executable/);
  assert.equal((await f.core.state()).state.candidate, null);
});

test('finding-scoped exceptions cannot absorb other findings and runner exceptions expire on changed risk', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f, { blocking: true });
  const configuration = { provider: 'codex', model: 'fixture' };
  await f.request('gate.execute', { gates: ['code'], configuration }, 'finding-one');
  const subject = (await f.core.state()).state.candidate.hash;
  const input = { kind: 'waive', subject, gates: ['code'], findings: ['wrong-finding'], authority: human, reason: 'Only the named finding', consequences: 'Other defects remain required' };
  await assert.rejects(f.request('human.decide', input, 'unknown-finding'), /current blocking findings/);
  await f.request('human.decide', { ...input, findings: ['finding-1'] }, 'named-finding');
  assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'code').satisfied, true);
  fakeEvaluator(f, { blocking: true });
  const adapter = f.core.runtime.evaluator, run = adapter.runStage;
  adapter.runStage = async request => {
    const result = await run(request);
    result.output.verdicts[0].findings.push({ ...result.output.verdicts[0].findings[0], id: 'finding-2' });
    const { sha256Digest } = await import('../../plugin-src/shared/resources/protocol/agent-workflow.js');
    result.receipt.digests.output = sha256Digest(result.output); return result;
  };
  await f.request('gate.execute', { gates: ['code'], configuration }, 'additional-finding');
  assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'code').satisfied, false);
  await runVerification(f, true, 'failed-runner');
  await f.request('human.decide', { kind: 'waive', subject, gates: ['verification'], authority: human, reason: 'Known command failure', consequences: 'This command on these runtime assumptions' }, 'runner-exception');
  assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'verification').satisfied, true);
  const key = 'GATEREEVE_WAIVER_TEST_RISK', prior = process.env[key];
  try {
    process.env[key] = 'different';
    assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'verification').satisfied, false);
  } finally { if (prior === undefined) delete process.env[key]; else process.env[key] = prior; }
  await f.request('gate.execute', { gates: ['verification'], configuration: { externalRuntimeInputs: { app: [] }, checks: [{ repository: 'app', command: process.execPath, args: ['-e', 'process.exit(2)'], purpose: 'Different risk' }] } }, 'changed-runner');
  assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'verification').satisfied, false);
});

test('lost failed-spec evidence stays visible after correction and blocks retention until restored', async t => {
  const f = await fixture(t);
  const design = await f.core.store.capture('design.md');
  await f.request('human.decide', { kind: 'approve-design', subject: design.hash, authority: human, reason: 'Approve', consequences: 'Validate' }, 'approved');
  const spec = await readFile(join(f.home, 'spec.md')); await writeFile(join(f.home, 'spec.md'), '# Invalid\n');
  await assert.rejects(f.request('spec.validate', {}, 'bad-spec'), /validation failed/);
  const failure = (await f.core.state()).state.validationFailures[0]; const bytes = await f.core.store.get(failure.proof);
  await rm(join(f.home, '.gatereeve-current/objects', failure.proof.hash.slice(7)));
  await writeFile(join(f.home, 'spec.md'), spec); await f.request('spec.validate', {}, 'good-spec');
  const commitments = await f.core.commitments(); await f.request('human.decide', { kind: 'authorize-implementation', subject: commitments.subject, authority: human, reason: 'Implement', consequences: 'Current scope' }, 'implement');
  await candidate(f);
  assert.ok((await f.request('status')).historyGaps.some(x => x.gate === 'spec-validation' && x.resultHash === failure.proof.hash));
  const missing = await f.request('gate.execute', { gates: ['retention'] }, 'retention-missing');
  assert.equal((await f.core.store.json(missing.event.payload.results[0])).outcome, 'UNAVAILABLE');
  await f.core.store.put(bytes);
  assert.ok(!(await f.request('status')).historyGaps.some(x => x.gate === 'spec-validation'));
  const restored = await f.request('gate.execute', { gates: ['retention'] }, 'retention-restored');
  assert.equal((await f.core.store.json(restored.event.payload.results[0])).outcome, 'PASS');
});

test('independent-gate exception binds consumed runner risk transitively', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); await runVerification(f);
  fakeEvaluator(f, { blocking: true });
  await f.request('gate.execute', { gates: ['spec'], configuration: { provider: 'codex', model: 'fixture' } }, 'failed-spec-review');
  const subject = (await f.core.state()).state.candidate.hash;
  await f.request('human.decide', { kind: 'waive', subject, gates: ['spec'], authority: human, reason: 'Known spec issue', consequences: 'This candidate and bound verification' }, 'spec-exception');
  assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'spec').satisfied, true);
  const key = 'GATEREEVE_TRANSITIVE_RISK', prior = process.env[key];
  try {
    process.env[key] = 'changed';
    const result = (await f.core.check('acceptance')).outcomes.find(x => x.id === 'spec');
    assert.equal(result.outcome, 'UNAVAILABLE'); assert.equal(result.satisfied, false); assert.equal(result.exception, null);
  } finally { if (prior === undefined) delete process.env[key]; else process.env[key] = prior; }
  await assert.rejects(f.request('human.decide', { kind: 'waive', subject, gates: ['spec'], scope: 'unsupported narrowing', authority: human, reason: 'Named risk', consequences: 'Known' }), /Scope is only supported on a standing grant/);
});

test('exception risk detects expired consumed proof and changed pattern or triage inputs', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const realNow = Date.now, deadline = realNow() + 60000;
  await f.request('gate.execute', { gates: ['verification'], configuration: { validUntil: new Date(deadline).toISOString(), externalRuntimeInputs: { app: [] }, checks: [{ repository: 'app', command: process.execPath, args: ['--version'], purpose: 'Timed observation' }] } }, 'timed-check');
  fakeEvaluator(f, { blocking: true });
  await f.request('gate.execute', { gates: ['spec'], configuration: { provider: 'codex', model: 'fixture' } }, 'timed-spec');
  const subject = (await f.core.state()).state.candidate.hash;
  const waive = (gates, extra = {}) => f.request('human.decide', { kind: 'waive', gates, subject, authority: human, reason: 'Specific known risk', consequences: 'Current assumptions only', ...extra });
  await waive(['spec']);
  assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'spec').satisfied, true);
  try { Date.now = () => deadline + 1; assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'spec').satisfied, false); }
  finally { Date.now = realNow; }
  fakeEvaluator(f, { blocking: true });
  await f.request('gate.execute', { gates: ['pattern'], configuration: { provider: 'codex', model: 'fixture' } }, 'pattern-risk');
  await waive(['pattern']);
  assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'pattern').satisfied, true);
  await writeFile(join(f.root, '.pattern-review/rules.yaml'), '[]\n# Changed policy bytes\n');
  assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'pattern').satisfied, false);
  await writeFile(join(f.home, 'scratchpad.md'), '# Decisions\n[ ] **Promote**\n');
  fakeEvaluator(f);
  await f.request('gate.execute', { gates: ['triage'], configuration: { provider: 'codex', model: 'fixture' } }, 'triage-risk');
  await waive(['triage'], { kind: 'policy-amend', actions: ['waive'] });
  assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'triage').satisfied, true);
  await writeFile(join(f.home, 'scratchpad.md'), '# Decisions\n[ ] **Promote**\nAnother material decision\n');
  assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'triage').satisfied, false);
});

test('explicit missing-pattern exception expires when policy appears and cannot waive unsafe policy', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  await rm(join(f.root, '.pattern-review'), { recursive: true });
  const subject = (await f.core.state()).state.candidate.hash;
  const decision = { kind: 'waive', subject, gates: ['pattern'], authority: human, reason: 'No applicable pattern policy exists', consequences: 'Accept the unavailable assessment for this absence only' };
  await f.request('human.decide', decision, 'missing-pattern');
  assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'pattern').satisfied, true);
  await mkdir(join(f.root, '.pattern-review')); await writeFile(join(f.root, '.pattern-review/rules.yaml'), '[]\n');
  assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'pattern').satisfied, false);
  await rm(join(f.root, '.pattern-review/rules.yaml'));
  await writeFile(join(f.root, 'outside-rules.yaml'), '[]\n');
  await symlink('../outside-rules.yaml', join(f.root, '.pattern-review/rules.yaml'));
  await assert.rejects(f.request('human.decide', decision, 'unsafe-pattern'));
});


for (const drift of ['environment', 'expiry']) test(`stale newer finding cannot resurrect older PASS through ${drift}`, async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); await reviewAll(f);
  const state = (await f.core.state()).state;
  const original = (await f.core.inventory(state, await f.core.store.json(state.candidate))).find(x => x.gate === 'code').reference;
  const realNow = Date.now, deadline = realNow() + 60000;
  const configuration = { environment: { inherit: ['GATEREEVE_SUPERSESSION_RISK'] }, validUntil: new Date(deadline).toISOString(), externalRuntimeInputs: { app: [] }, checks: [{ repository: 'app', command: process.execPath, args: ['-e', 'process.exit(0)'], purpose: 'Bound observation' }] };
  const verification = await f.request('gate.execute', { gates: ['verification'], configuration }, 'newer-verification');
  fakeEvaluator(f, { blocking: true });
  await f.request('gate.execute', { gates: ['code'], consumed: verification.event.payload.results, configuration: { provider: 'codex', model: 'fixture' } }, 'newer-code-failure');
  const key = 'GATEREEVE_SUPERSESSION_RISK', previous = process.env[key];
  try {
    if (drift === 'environment') { process.env[key] = 'changed'; await f.request('spec.validate', {}, 'refresh-drifted-validator'); }
    else Date.now = () => deadline + 1;
    await runVerification(f, false, 'refreshed-verification'); fakeEvaluator(f);
    for (const gate of ['spec', 'judge']) await f.request('gate.execute', { gates: [gate], configuration: { provider: 'codex', model: 'fixture' } }, `refresh-${gate}`);
    await assert.rejects(f.request('gate.execute', { gates: ['explanation'], consumed: [original], configuration: { provider: 'codex', model: 'fixture' } }, 'consume-old-pass'), /Newer blocking review/);
    await f.request('gate.execute', { gates: ['packet'] }, 'rebuild-packet');
    const checked = await f.core.check('acceptance');
    assert.equal(checked.outcomes.find(x => x.id === 'code').satisfied, false);
    assert.equal(checked.allowed, false);
    await assert.rejects(f.request('milestone.pass', { name: 'acceptance' }, 'invalid-acceptance'));
    const current = (await f.core.state()).state;
    assert.equal((await f.core.inventory(current, await f.core.store.json(current.candidate))).find(x => x.gate === 'code').outcome, 'UNAVAILABLE');
    fakeEvaluator(f, { dispositions: [{ id: 'finding-1', status: 'resolved', evidence: 'Current source and interactions independently reassessed' }] });
    const delta = await f.request('gate.execute', { gates: ['code'], prior: original, configuration: { provider: 'codex', model: 'fixture' } }, 'historical-support-delta');
    assert.equal((await f.core.store.json(delta.event.payload.results[0])).outcome, 'PASS');
    assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'code').satisfied, true);
  } finally { Date.now = realNow; if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
});

test('retained provider output round-trips through public receipt validation', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f);
  const completed = await f.request('gate.execute', { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } }, 'retained-provider');
  const result = await f.core.store.json(completed.event.payload.results[0]); assert.equal(result.outcome, 'PASS');
  const receipt = await f.core.store.json(result.artifacts[0]), output = await f.core.store.json(result.artifacts[1]);
  const { validateAgentWorkflowStageResult, sha256Digest } = await import('../../plugin-src/shared/resources/protocol/agent-workflow.js');
  validateAgentWorkflowStageResult({ schemaVersion: 1, protocolVersion: receipt.protocolVersion, stageId: receipt.stage, status: 'completed', output, receipt });
  assert.equal(sha256Digest({ z: { b: 2, a: 1 }, a: [3, 2] }), sha256Digest({ a: [3, 2], z: { a: 1, b: 2 } }));
  assert.notEqual(sha256Digest({ a: [3, 2] }), sha256Digest({ a: [2, 3] }));
});

test('generic provider unavailability does not erase otherwise qualifying review proof', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f);
  const input = { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } };
  await f.request('gate.execute', input, 'qualified-review');
  const verification = await runVerification(f);
  fakeEvaluator(f, { malformed: true });
  const unavailable = await f.request('gate.execute', { ...input, consumed: verification.event.payload.results, configuration: { ...input.configuration, reviewRevision: 2 } }, 'provider-unavailable');
  assert.equal((await f.core.store.json(unavailable.event.payload.results[0])).outcome, 'UNAVAILABLE');
  const key = 'GATEREEVE_TRANSPORT_DRIFT', previous = process.env[key];
  try { process.env[key] = 'changed'; assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'code').satisfied, true); }
  finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
});

test('later finding outside selected criteria does not supersede applicable review', async t => {
  const f = await fixture(t);
  const path = join(f.home, 'spec.md'); await writeFile(path, (await readFile(path, 'utf8')).replace('## Changes', '| R2 | AC1 | same constant | other | test |\n\n## Changes'));
  await authorize(f);
  const first = { repositories: [{ alias: 'app', base: f.head, head: f.head }], scope: 'SLICE', criteria: ['R1'] };
  await f.request('candidate.prepare', first, 'first-r1'); fakeEvaluator(f);
  const input = { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } };
  await f.request('gate.execute', input, 'selected-r1');
  const prepare = criteria => f.request('candidate.prepare', { ...first, criteria });
  await prepare(['R1', 'R2']); fakeEvaluator(f, { blocking: true });
  const run = f.core.runtime.evaluator.runStage;
  f.core.runtime.evaluator.runStage = async request => {
    const value = await run(request); value.output.verdicts[0].findings[0].criterion = 'R2'; value.output.verdicts[0].criteria[0].outcome = 'PASS';
    const { sha256Digest } = await import('../../plugin-src/shared/resources/protocol/agent-workflow.js'); value.receipt.digests.output = sha256Digest(value.output); return value;
  };
  const failed = await f.request('gate.execute', input, 'outside-r1'); assert.equal((await f.core.store.json(failed.event.payload.results[0])).outcome, 'FAIL');
  await prepare(['R1']);
  assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'code').satisfied, true);
});

test('historical delta ancestry cannot grant current authority to superseded consumed proof', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f);
  const configuration = { provider: 'codex', model: 'fixture' };
  const pattern = await f.request('gate.execute', { gates: ['pattern'], configuration }, 'old-pattern');
  const code = await f.request('gate.execute', { gates: ['code'], configuration, consumed: pattern.event.payload.results }, 'old-code');
  fakeEvaluator(f, { blocking: true });
  const failed = await f.request('gate.execute', { gates: ['pattern'], configuration: { ...configuration, reviewRevision: 2 } }, 'new-pattern-failure');
  assert.equal((await f.core.store.json(failed.event.payload.results[0])).outcome, 'FAIL');
  fakeEvaluator(f);
  await assert.rejects(f.request('gate.execute', { gates: ['code'], configuration, prior: code.event.payload.results[0] }, 'invalid-ancestry'), /Newer blocking review/);
});

for (const assessment of ['unavailable-finding', 'failed-criterion']) test(`current admission preserves substantive ${assessment} after expiry`, async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f);
  const gate = assessment === 'failed-criterion' ? 'spec' : 'code';
  if (gate === 'spec') await runVerification(f);
  const configuration = { provider: 'codex', model: 'fixture' };
  await f.request('gate.execute', { gates: [gate], configuration }, 'older-proof');
  const now = Date.now, deadline = now() + 60000;
  fakeEvaluator(f, assessment === 'unavailable-finding' ? { outcome: 'UNAVAILABLE', blocking: true } : { outcome: 'FAIL' });
  const failed = await f.request('gate.execute', { gates: [gate], configuration: { ...configuration, validUntil: new Date(deadline).toISOString() } }, 'newer-assessment');
  assert.equal((await f.core.store.json(failed.event.payload.results[0])).outcome, assessment === 'unavailable-finding' ? 'UNAVAILABLE' : 'FAIL');
  try { Date.now = () => deadline + 1; assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === gate).satisfied, false); }
  finally { Date.now = now; }
});

test('terminal journal loss cannot erase pause or a failed review and exact retry restores the retained event', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); await reviewAll(f);
  const pause = await f.request('run.pause', { authority: human }, 'explicit-stop');
  const pathFor = event => join(f.home, `.gatereeve-current/runs/run-one/events/${String(event.sequence).padStart(8, '0')}.json`);
  const pausePath = pathFor(pause.event), pauseBytes = await readFile(pausePath); await rm(pausePath);
  await assert.rejects(f.request('status'), /Missing journal copy/);
  await assert.rejects(readFile(pausePath), { code: 'ENOENT' });
  await assert.rejects(f.request('milestone.pass', { name: 'acceptance' }, 'paused-passage'));
  assert.deepEqual(await readFile(pausePath), pauseBytes); assert.equal((await f.core.state()).state.paused, true);
  await f.request('run.continue', { authority: human }, 'explicit-continue'); fakeEvaluator(f, { blocking: true });
  const failure = await f.request('gate.execute', { gates: ['code'], configuration: { provider: 'codex', model: 'fixture', reviewRevision: 2 } }, 'new-failure');
  const failurePath = pathFor(failure.event), failureBytes = await readFile(failurePath); await rm(failurePath);
  await assert.rejects(f.core.check('acceptance'), /Missing journal copy/);
  await assert.rejects(f.request('milestone.pass', { name: 'acceptance' }, 'failure-passage'));
  assert.deepEqual(await readFile(failurePath), failureBytes);
  assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'code').outcome, 'FAIL');
  const mirror = failurePath.replace('/events/', '/event-witnesses/'); await rm(mirror);
  await assert.rejects(f.request('status'), /Missing journal copy/);
  await f.request('candidate.ready', {}, 'restore-witness'); assert.deepEqual(await readFile(mirror), failureBytes);
  await writeFile(mirror, '{}');
  await assert.rejects(f.request('candidate.ready', {}, 'reject-conflict'), /Conflicting retained journal copies/);
  assert.equal(await readFile(mirror, 'utf8'), '{}');
});

test('activation root and successor loss cannot roll back the current run', async t => {
  const f = await fixture(t);
  for (const name of ['active.json', 'active-witness.json']) {
    const path = join(f.home, '.gatereeve-current', name), bytes = await readFile(path); await rm(path);
    await assert.rejects(f.request('status'), /Missing activation copy/);
    await f.request('run.pause', { authority: human }); assert.deepEqual(await readFile(path), bytes);
  }
  const initial = join(f.home, '.gatereeve-current/runs/run-one/events/00000001.json'); await writeFile(initial, 'damaged record retained');
  await f.request('run.resume-current', { runId: 'replacement', implementers: ['implementer-one'] }, 'new-current-run');
  for (const dir of ['activations', 'activation-witnesses']) {
    const parent = join(f.home, '.gatereeve-current', dir), path = join(parent, (await readdir(parent))[0]);
    const bytes = await readFile(path); await rm(path);
    await assert.rejects(f.request('status'), /Missing activation copy/);
    await f.request('run.pause', { authority: human }); assert.deepEqual(await readFile(path), bytes);
    assert.equal((await f.core.state()).state.runId, 'replacement');
  }
  assert.equal(await readFile(initial, 'utf8'), 'damaged record retained');
});

test('saved completed failure reconciles before changed-source preflight and remains in fresh reviewer history', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f);
  const input = { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } };
  await f.request('gate.execute', input, 'earlier-pass'); fakeEvaluator(f, { blocking: true });
  const append = f.core.append.bind(f.core); f.core.append = async (...args) => { if (args[1] === 'JOB_FINISHED') throw new Error('interrupt after saved outcome'); return append(...args); };
  await assert.rejects(f.request('gate.execute', { ...input, configuration: { ...input.configuration, reviewRevision: 2 } }, 'saved-failure'), /interrupt/);
  f.core.append = append;
  assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'code').satisfied, false);
  await writeFile(join(f.repo, 'app.js'), 'export const answer = 43;\n'); await git(f.repo, ['add', 'app.js']); await git(f.repo, ['commit', '-m', 'changed candidate']);
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head }], scope: 'FEATURE', criteria: ['R1'] }, 'changed-candidate');
  const original = (await f.core.state()).events.find(x => x.operation.id === 'saved-failure');
  assert.equal((await f.core.store.json(original.payload.results[0])).outcome, 'FAIL');
  fakeEvaluator(f); const unsupported = await f.request('gate.execute', input, 'without-resolution');
  assert.equal((await f.core.store.json(unsupported.event.payload.results[0])).outcome, 'UNAVAILABLE');
  fakeEvaluator(f, { dispositions: [{ id: 'finding-1', status: 'resolved', evidence: 'Current source independently assessed' }] });
  const fresh = await f.request('gate.execute', input, 'resolved-current'); assert.equal((await f.core.store.json(fresh.event.payload.results[0])).outcome, 'PASS');
  assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'code').satisfied, true);
});

test('unknown interrupted execution blocks older proof but a fresh complete review recovers', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f);
  const input = { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } };
  await f.request('gate.execute', input, 'prior-pass');
  const append = f.core.append.bind(f.core); f.core.append = async (...args) => { if (args[1] === 'JOB_OUTCOME_READY') throw new Error('unknown outcome interruption'); return append(...args); };
  await assert.rejects(f.request('gate.execute', { ...input, configuration: { ...input.configuration, reviewRevision: 2 } }, 'unknown-job'), /interruption/);
  f.core.append = append;
  assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'code').satisfied, false);
  const fresh = await f.request('gate.execute', input, 'fresh-after-unknown'); assert.equal((await f.core.store.json(fresh.event.payload.results[0])).outcome, 'PASS');
  assert.equal((await f.core.check('acceptance')).outcomes.find(x => x.id === 'code').satisfied, true);
});

test('public resume restores terminal pause and activation loss without selecting a new run', async t => {
  const f = await fixture(t);
  const { executeCurrentRequest } = await import('../../plugin-src/shared/resources/protocol/current/adapter.js');
  await writeFile(join(f.root, '.agentic-workflow.json'), JSON.stringify({ schemaVersion: 1, featureId: 'feature', repositories: { app: { path: 'app', integrationBranch: 'main' } } }));
  await f.request('run.pause', { authority: human }, 'pause-for-resume');
  const events = await f.core.store.events('run-one');
  const terminal = join(f.home, '.gatereeve-current/runs/run-one/events', `${String(events.length).padStart(8, '0')}.json`);
  const exact = await readFile(terminal);
  await rm(terminal); await rm(join(f.home, '.gatereeve-current/active.json'));
  const response = await executeCurrentRequest({ operation: 'run.resume-current', cwd: f.repo, operationId: 'resume-public', input: { implementers: ['implementer-one'] } });
  assert.equal(response.ok, true, JSON.stringify(response));
  const { state } = await f.core.state();
  assert.equal(state.runId, 'run-one'); assert.equal(state.paused, true);
  assert.deepEqual(await readFile(terminal), exact);
  const restored = await f.core.store.events('run-one');
  assert.deepEqual(restored.slice(0, events.length), events);
  assert.equal(restored.length, events.length + 1);
  assert.equal(restored.at(-1).type, 'TRANSITION_RECORDED');
});

const raceReviewInput = revision => ({ gates: ['code'], configuration: { provider: 'codex', model: 'fixture', revision } });
test('late READY invalidates checked milestone and restores exact failed outcome',async t=>{
 const f = await fixture(t); await authorize(f); await candidate(f);
 await reviewAll(f); fakeEvaluator(f,{blocking:true});
 let signal,release;const arrived=new Promise(r=>signal=r),hold=new Promise(r=>release=r);
 const evaluate=f.core.runtime.evaluator.runStage;let originalCalls=0;
 f.core.runtime.evaluator.runStage=async request=>{originalCalls++;const response=await evaluate(request);signal();await hold;return response};
 const save=f.core.store.saveJob.bind(f.core.store);let saved;
 f.core.store.saveJob=async(id,value)=>{if(value.operation.id==='pending-failure'){saved={id,value};throw new Error('crash after READY')}return save(id,value)};
 const running=f.request('gate.execute',raceReviewInput(2),'pending-failure').catch(e=>e.message);await arrived;
 fakeEvaluator(f);await f.request('gate.execute',raceReviewInput(3),'fresh-review');await f.request('gate.execute',{gates:['packet']},'refresh-packet');
 const check=f.core.check.bind(f.core);let injected=false;
 f.core.check=async(...args)=>{const checked=await check(...args);if(args[0]==='acceptance'&&!injected){assert.equal(checked.allowed,true);injected=true;release();assert.match(await running,/crash after READY/)}return checked};
 await assert.rejects(f.request('milestone.pass',{name:'acceptance'},'race-passage'),/state changed|Concurrent update/i);
 f.core.check=check;f.core.store.saveJob=save;
 assert.equal((await f.core.state()).events.some(e=>e.operation.id==='race-passage'),false);
 assert.equal(await f.core.store.job(saved.id),null);
 await f.request('candidate.ready',{},'reconcile-ready');
 const {state}=await f.core.state();assert.equal(state.jobs[saved.id].finished,true);
 assert.equal((await f.core.store.json(saved.value.results[0])).outcome,'FAIL');
 assert.equal((await f.core.check('acceptance')).outcomes.find(x=>x.id==='code').satisfied,false);
 assert.equal(originalCalls,1);
});
test('review started before newer failure cannot confer current authority',async t=>{
 const f = await fixture(t); await authorize(f); await candidate(f);
 fakeEvaluator(f);let signal,release;const arrived=new Promise(r=>signal=r),hold=new Promise(r=>release=r);
 const evaluate=f.core.runtime.evaluator.runStage;f.core.runtime.evaluator.runStage=async request=>{const response=await evaluate(request);signal();await hold;return response};
 const running=f.request('gate.execute',raceReviewInput(1),'started-earlier');await arrived;
 fakeEvaluator(f,{blocking:true});const failed=await f.request('gate.execute',raceReviewInput(2),'new-failure');assert.equal((await f.core.store.json(failed.event.payload.results[0])).outcome,'FAIL');
 release();const later=await running;assert.equal((await f.core.store.json(later.event.payload.results[0])).outcome,'PASS');
 assert.equal((await f.core.check('acceptance')).outcomes.find(x=>x.id==='code').satisfied,false);
 fakeEvaluator(f,{dispositions:[{id:'finding-1',status:'resolved',evidence:'Fresh assessment after finding publication'}]});
 const repaired=await f.request('gate.execute',raceReviewInput(3),'started-after-failure');assert.equal((await f.core.store.json(repaired.event.payload.results[0])).outcome,'PASS');
 assert.equal((await f.core.check('acceptance')).outcomes.find(x=>x.id==='code').satisfied,true);
});
test('READY crash restores exact cache once without rerunning evaluator',async t=>{
 const f = await fixture(t); await authorize(f); await candidate(f);
 const evaluator=fakeEvaluator(f,{blocking:true});const save=f.core.store.saveJob.bind(f.core.store);let saved;
 f.core.store.saveJob=async(id,value)=>{saved={id,value};throw new Error('cache publication crash')};
 await assert.rejects(f.request('gate.execute',raceReviewInput(1),'crashed-ready'),/cache publication crash/);f.core.store.saveJob=save;
 let {state}=await f.core.state();assert.ok(state.jobs[saved.id].ready);assert.equal(state.jobs[saved.id].finished,false);assert.equal(await f.core.store.job(saved.id),null);
 await f.request('status');assert.equal(await f.core.store.job(saved.id),null);
 await f.request('candidate.ready',{},'repair-cache');assert.deepEqual(await f.core.store.job(saved.id),saved.value);
 const retried=await f.request('gate.execute',raceReviewInput(1),'crashed-ready');assert.deepEqual(retried.event.payload.results,saved.value.results);
 assert.equal((await f.core.store.json(saved.value.results[0])).outcome,'FAIL');
});
test('READY/cache conflict remains intact and blocks reconciliation',async t=>{
 const f = await fixture(t); await authorize(f); await candidate(f);
 fakeEvaluator(f,{blocking:true});const save=f.core.store.saveJob.bind(f.core.store);let saved;
 f.core.store.saveJob=async(id,value)=>{saved={id,value};await save(id,value);throw new Error('after cache crash')};
 await assert.rejects(f.request('gate.execute',raceReviewInput(1),'conflict-ready'),/after cache crash/);f.core.store.saveJob=save;
 const path=join(f.home,'.gatereeve-current/jobs',saved.id+'.json');const corrupt=JSON.stringify({...saved.value,results:[]});await writeFile(path,corrupt);
 await assert.rejects(f.request('candidate.ready',{},'reject-conflict'),/conflicts with its durable outcome/);assert.equal(await readFile(path,'utf8'),corrupt);
 assert.equal((await f.core.state()).state.jobs[saved.id].finished,false);
});
test('READY retries journal contention without rerunning provider or erasing pause',async t=>{
 const f = await fixture(t); await authorize(f); await candidate(f);
 fakeEvaluator(f,{blocking:true});const evaluate=f.core.runtime.evaluator.runStage;let calls=0;f.core.runtime.evaluator.runStage=async request=>{calls++;return evaluate(request)};
 const append=f.core.append.bind(f.core);let injected=false;
 f.core.append=async(state,type,payload,operation)=>{if(type==='JOB_OUTCOME_READY'&&!injected){injected=true;await append(state,'PAUSED',{authority:human},{id:'concurrent-pause',hash:identity('concurrent-pause')})}return append(state,type,payload,operation)};
 const result=await f.request('gate.execute',raceReviewInput(1),'contended-ready');assert.equal((await f.core.store.json(result.event.payload.results[0])).outcome,'FAIL');
 assert.equal(calls,1);assert.equal((await f.core.state()).state.paused,true);
});

test('fresh PASS after failed-receipt loss must recover current authority',async t=>{
 const f = await fixture(t); await authorize(f); await candidate(f);
 fakeEvaluator(f,{blocking:true});const failed=await f.request('gate.execute',raceReviewInput(1),'prior-failure');
 const report=await f.core.store.json(failed.event.payload.results[0]);
 const {rm}=await import('node:fs/promises');await rm(join(f.home,'.gatereeve-current/objects',report.receipt.hash.slice(7)));
 fakeEvaluator(f,{dispositions:[{id:'finding-1',status:'resolved',evidence:'Fresh full reassessment with historical evidence loss disclosed'}]});
 const fresh=await f.request('gate.execute',raceReviewInput(2),'fresh-after-loss');
 assert.equal((await f.core.store.json(fresh.event.payload.results[0])).outcome,'PASS');
 const outcome=(await f.core.check('acceptance')).outcomes.find(x=>x.id==='code');
 assert.equal(outcome.satisfied,true);
});

test('late old-run outcome must not contaminate replacement run',async t=>{
 const f = await fixture(t); await authorize(f); await candidate(f);
 fakeEvaluator(f,{blocking:true});let signal,release;const arrived=new Promise(r=>signal=r),hold=new Promise(r=>release=r);
 const evaluate=f.core.runtime.evaluator.runStage;f.core.runtime.evaluator.runStage=async request=>{const response=await evaluate(request);signal();await hold;return response};
 const running=f.request('gate.execute',raceReviewInput(1),'old-running').catch(e=>({error:e.message}));await arrived;
 await writeFile(join(f.home,'.gatereeve-current/runs/run-one/events/00000001.json'),'damaged old journal');
 await f.request('run.resume-current',{runId:'replacement',implementers:['implementer-one']},'replacement-start');
 release();const result=await running;assert.match(result.error, /Active run changed/);
 const {state}=await f.core.state();assert.equal(state.runId, 'replacement'); assert.deepEqual(state.results, []);
 await f.request('run.pause',{authority:human},'pause-replacement');
 assert.equal(Object.keys(state.jobs).length,0);
});

test('run replacement after READY cannot receive old JOB_FINISHED',async t=>{
 const f = await fixture(t); await authorize(f); await candidate(f);
 fakeEvaluator(f,{blocking:true});const save=f.core.store.saveJob.bind(f.core.store);let jobId;
 f.core.store.saveJob=async(id,value)=>{if(value.operation.id==='switch-after-ready'){
  jobId=id;await writeFile(join(f.home,'.gatereeve-current/runs/run-one/events/00000001.json'),'damaged old journal');
  await f.request('run.resume-current',{runId:'replacement',implementers:['implementer-one']},'replacement-after-ready');
 }return save(id,value)};
 await assert.rejects(f.request('gate.execute',raceReviewInput(1),'switch-after-ready'),/Active run changed/);
 const {state}=await f.core.state();assert.equal(state.runId,'replacement');assert.deepEqual(state.jobs,{});assert.deepEqual(state.results,[]);
 assert.equal((await f.core.store.job(jobId)).runId,'run-one');
 await f.request('run.pause',{authority:human},'pause-replacement');
});

test('unrelated later finding does not reopen prior closures', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f);
  const input = { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } };
  const seed = await f.request('gate.execute', input, 'history-seed');
  for (let i = 0; i < 3; i++) {
    const id = `finding-${i}`;
    fakeEvaluator(f, { blocking: true, findingId: id });
    await f.request('gate.execute', { ...input, configuration: { ...input.configuration, round: i } }, `failure-${i}`);
    fakeEvaluator(f, { dispositions: [{ id, status: 'resolved', evidence: 'Independent closure' }] });
    const closed = await f.request('gate.execute', input, `closure-${i}`);
    const report = await f.core.store.json(closed.event.payload.results[0]);
    assert.equal(report.outcome, 'PASS', report.summary);
  }
  await writeFile(join(f.repo, 'app.js'), 'export const answer = 43;\n');
  await git(f.repo, ['add', 'app.js']); await git(f.repo, ['commit', '-m', 'later source']);
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head }], scope: 'FEATURE', criteria: ['R1'] }, 'history-source');
  fakeEvaluator(f, { historyAssessment: { affected: [], carryForwardReason: 'Checked all prior closures against source changes and interactions; no prior defect is reintroduced.' } });
  const reviewed = await f.request('gate.execute', input, 'large-history-review');
  const result = await f.core.store.json(reviewed.event.payload.results[0]);
  assert.equal(result.outcome, 'PASS');
  const packet = await f.core.store.json(result.input);
  assert.equal(packet.history.length, 6); assert.equal(packet.reconsiderClosures.length, 3);
});

test('evaluator qualification blocks low efforts and mismatched receipt profiles across review roles', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); await runVerification(f);
  for (const gates of [['code', 'spec'], ['judge'], ['explanation']]) {
    const launched = fakeEvaluator(f);
    const result = await f.request('gate.execute', { gates, configuration: { provider: 'codex', model: 'fixture', reasoningEffort: 'low' } }, `low-${gates[0]}`);
    assert.equal(launched(), 0);
    for (const ref of result.event.payload.results) assert.equal((await f.core.store.json(ref)).outcome, 'UNAVAILABLE');
  }
  fakeEvaluator(f);
  const original = f.core.runtime.evaluator.runStage;
  f.core.runtime.evaluator.runStage = async request => {
    const result = await original(request);
    result.receipt.capabilityProfile = { id: 'high-capability-v1', minimumReasoning: 'medium' };
    return result;
  };
  const mismatch = await f.request('gate.execute', { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } }, 'wrong-profile');
  assert.equal((await f.core.store.json(mismatch.event.payload.results[0])).outcome, 'UNAVAILABLE');
  fakeEvaluator(f);
  const good = await f.request('gate.execute', { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } }, 'qualified');
  const ref = good.event.payload.results[0];
  const state = (await f.core.state()).state;
  const source = await f.core.store.json(state.candidate);
  assert.equal((await f.core.currentResult(ref, source, state)).outcome, 'PASS');
  // Simulate an unqualified retained receipt through the internal read seam; reuse
  // must reject even though launch admission already qualified the real receipt.
  const read = f.core.recordedResult.bind(f.core);
  f.core.recordedResult = async (...args) => {
    const record = structuredClone(await read(...args)); record.receipt.evaluator.reasoningEffort = 'low'; return record;
  };
  await assert.rejects(f.core.currentResult(ref, source, state), /capability profile/);
});

test('current planning proof rejects changed parser bindings without changing implementation authority', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const state = (await f.core.state()).state, read = f.core.store.json.bind(f.core.store);
  f.core.store.json = async ref => {
    const value = await read(ref);
    return ref.hash === state.specValidation.proof.hash ? { ...value, binding: { ...value.binding, policy: 'obsolete' } } : value;
  };
  assert.equal((await f.core.check('implementation')).allowed, false);
  f.core.store.json = read;
  await f.request('spec.validate', {}, 'refresh-parser');
  assert.equal((await f.core.check('implementation')).allowed, true);
  assert.equal((await f.core.state()).state.phase, state.phase);
});

for (const mode of ['replacement', 'same-run', 'pause']) for (const transport of ['core', 'public']) test(`late failed spec validation preserves newer authority in ${mode} through ${transport}`, async t => {
  const f = await fixture(t); await authorize(f);
  await writeFile(join(f.root, '.agentic-workflow.json'), JSON.stringify({ schemaVersion: 1, featureId: 'feature', repositories: { app: { path: 'app', integrationBranch: 'main' } } }));
  const { executeCurrentRequest } = await import('../../plugin-src/shared/resources/protocol/current/adapter.js');
  const originalSpec = await readFile(join(f.home, 'spec.md'), 'utf8');
  const invalid = await f.core.store.capture('spec.md');
  const originalGet = CurrentStore.prototype.get;
  let announce, unblock;
  const started = new Promise(resolve => { announce = resolve; });
  const released = new Promise(resolve => { unblock = resolve; });
  let held = false;
  CurrentStore.prototype.get = async function(ref) {
    if (ref.hash === invalid.hash && !held) { held = true; announce(); await released; return Buffer.from('# Invalid delayed specification'); }
    return originalGet.call(this, ref);
  };
  const running = transport === 'core'
    ? f.request('spec.validate', {}, 'slow-old-validation').catch(error => ({ error: error.message, artifacts: error.artifacts ?? [] }))
    : executeCurrentRequest({ cwd: f.repo, operation: 'spec.validate', operationId: 'slow-old-validation' }, f.core.runtime).then(response => {
      assert.equal(response.ok, false); assert.equal(response.error.code, 'CONTRACT_INVALID');
      assert.equal(response.error.details.runId, 'run-one');
      assert.equal(response.error.details.operationId, 'slow-old-validation');
      assert.ok(!JSON.stringify(response).includes('ORIGINAL-VALIDATOR-FAILED'));
      return { error: response.error.message, artifacts: response.error.details.retainedArtifacts };
    });
  try {
    await started;
    await writeFile(join(f.home, 'spec.md'), originalSpec);
    if (mode === 'replacement') {
      for (const area of ['events', 'event-witnesses']) await writeFile(join(f.home, '.gatereeve-current/runs/run-one', area, '00000001.json'), '{}');
      await f.request('run.resume-current', { runId: 'replacement', implementers: ['implementer-one'] }, 'replacement-start');
      await authorize(f);
    } else if (mode === 'pause') await f.request('run.pause', { authority: human }, 'pause-during-validation');
    else await f.request('spec.validate', {}, 'newer-successful-validation');
    const before = (await f.core.state()).state;
    assert.equal((await f.core.check('implementation')).allowed, mode !== 'pause');
    unblock();
    const completion = await running, { state } = await f.core.state();
    if (mode === 'pause') {
      assert.equal(state.paused, true); assert.equal(state.specValidation, null);
      assert.equal(state.validationFailures.length, 1); assert.equal(state.eventCount, before.eventCount + 1);
      await f.request('run.continue', { authority: human }, 'continue-after-validation');
      assert.equal((await f.core.check('implementation')).allowed, false);
      await f.request('spec.validate', {}, 'refresh-after-failure');
      assert.equal((await f.core.check('implementation')).allowed, true);
    } else {
      assert.equal(state.specValidation.proof.hash, before.specValidation.proof.hash);
      assert.equal(state.validationFailures.length, 0); assert.equal(state.eventCount, before.eventCount);
      assert.equal((await f.core.check('implementation')).allowed, true);
      assert.match(completion.error, /original validation state changed/);
    }
    assert.equal(completion.artifacts.length, 1);
    const retained = await f.core.store.json(completion.artifacts[0]);
    assert.equal(retained.runId, 'run-one');
    assert.match(retained.diagnostic, /Specification needs/);
  } finally { unblock(); await running; CurrentStore.prototype.get = originalGet; }
});


test('source admission rejects configured subdirectories and accepts linked worktree roots', async t => {
  const f = await fixture(t); await authorize(f);
  const nested = join(f.repo, 'subdir'); await mkdir(nested); await writeFile(join(nested, 'selected.js'), 'export const selected = true;\n');
  await git(f.repo, ['add', '.']); await git(f.repo, ['commit', '-m', 'nested source']); f.head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await writeFile(join(f.root, '.agentic-workflow.json'), JSON.stringify({ schemaVersion: 1, featureId: 'feature', repositories: { app: { path: 'app/subdir', integrationBranch: 'main', featureBaseSha: f.context.repositories[0].featureBaseSha } } }));
  const { executeCurrentRequest } = await import('../../plugin-src/shared/resources/protocol/current/adapter.js');
  const publicResult = await executeCurrentRequest({ cwd: f.root, operation: 'candidate.prepare', input: { repositories: [{ alias: 'app', base: f.context.repositories[0].featureBaseSha, head: f.head }], scope: 'FEATURE', criteria: ['R1'] } });
  assert.equal(publicResult.ok, false); assert.match(publicResult.error.message, /Git working-tree root/);
  f.context.repositories[0].path = nested;
  await assert.rejects(candidate(f), /Git working-tree root/);
  assert.equal((await f.core.state()).state.candidate, null);
  const linked = join(f.root, 'linked'); await git(f.repo, ['worktree', 'add', '-b', 'linked', linked, f.head]);
  f.context.repositories[0].path = linked;
  await candidate(f);
  const pin = await f.core.store.json((await f.core.state()).state.candidate);
  assert.deepEqual(pin.repositories[0].files.map(file => file.path), ['app.js', 'subdir/selected.js']);
  const { checkCandidate, contentIdentity } = await import('../../plugin-src/shared/resources/protocol/current/evidence.js');
  const malformed = structuredClone(pin); malformed.repositories[0].identity.path = join(linked, 'subdir');
  f.context.repositories[0].path = join(linked, 'subdir');
  await assert.rejects(checkCandidate(f.core.store, f.context, await f.core.store.putJson(malformed), { live: false }), /Git working-tree root/);
  f.context.repositories[0].path = linked;
  await writeFile(join(linked, 'app.js'), 'export const answer = 43;\n'); await git(linked, ['add', '.']); await git(linked, ['commit', '-m', 'enclosing source']);
  const head = (await git(linked, ['rev-parse', 'HEAD'])).trim();
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.context.repositories[0].featureBaseSha, head }], scope: 'FEATURE', criteria: ['R1'] }, 'new-root-source');
  const next = await f.core.store.json((await f.core.state()).state.candidate);
  assert.notEqual(contentIdentity(pin), contentIdentity(next));
  const { changedPaths } = await import('../../plugin-src/shared/resources/protocol/current/execution.js');
  assert.deepEqual(changedPaths(pin, next), ['app/app.js']);
});

for (const shape of ['current-field', 'renamed-field', 'invalid-current-field']) for (const copies of ['primary', 'witness', 'matching', 'conflicting']) test(`public resume preserves unsupported ${copies} activation records with ${shape}`, async t => {
  const f = await fixture(t); await authorize(f);
  await writeFile(join(f.root, '.agentic-workflow.json'), JSON.stringify({ schemaVersion: 1, featureId: 'feature', repositories: { app: { path: 'app', integrationBranch: 'main', featureBaseSha: f.head } } }));
  const primary = join(f.home, '.gatereeve-current/active.json'), witness = join(f.home, '.gatereeve-current/active-witness.json');
  const bytes = JSON.stringify({ contract: 'unsupported/v0', ...(shape === 'current-field' ? { runId: 'run-one' } : shape === 'renamed-field' ? { activeRun: 'legacy-run' } : { runId: { legacy: 'different schema' } }) });
  await writeFile(primary, bytes); await writeFile(witness, copies === 'conflicting' ? bytes+' ' : bytes);
  if (copies === 'primary') await rm(witness);
  if (copies === 'witness') await rm(primary);
  await assert.rejects(f.core.store.active(), /Unsupported|Conflicting/);
  const { executeCurrentRequest } = await import('../../plugin-src/shared/resources/protocol/current/adapter.js');
  const input = { operation: 'run.resume-current', cwd: f.root, operationId: 'unsupported-resume', input: { runId: 'replacement', implementers: ['implementer-one'] } };
  const resumed = await executeCurrentRequest(input);
  if (copies === 'conflicting') { assert.equal(resumed.ok, false); assert.match(resumed.error.message, /Conflicting/); }
  else {
    assert.equal(resumed.ok, true, JSON.stringify(resumed));
    assert.equal((await f.request('status')).runId, 'replacement');
    assert.equal((await f.request('status')).phase, 'DESIGNING');
    assert.equal((await f.core.check('implementation')).allowed, false);
    assert.equal((await executeCurrentRequest(input)).ok, true);
  }
  if (copies !== 'witness') assert.equal(await readFile(primary, 'utf8'), bytes);
  if (copies !== 'primary') assert.equal(await readFile(witness, 'utf8'), copies === 'conflicting' ? bytes+' ' : bytes);
});

for (const kind of ['criterion-only', 'coverage-only', 'cross-gate']) test(`default reviewer context and proof admission preserve ${kind} failures`, async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); await runVerification(f); fakeEvaluator(f);
  const configuration = { provider: 'codex', model: 'fixture' };
  const first = await f.request('gate.execute', { gates: ['code'], configuration }, 'first-pass'); const old = first.event.payload.results[0];
  const id = kind === 'criterion-only' ? 'spec' : kind === 'cross-gate' ? 'judge' : 'code';
  fakeEvaluator(f, { outcome: 'FAIL', blocking: kind === 'cross-gate', ...(kind === 'coverage-only' ? { criterionRows: [], coverage: { complete: false, paths: [], interactions: [], limitations: ['Required integration coverage remains missing'] } } : {}) });
  const failed = await f.request('gate.execute', { gates: [id], configuration: { ...configuration, validUntil: new Date(Date.now()+60000).toISOString() } }, 'negative');
  const negative = failed.event.payload.results[0]; assert.equal((await f.core.store.json(negative)).outcome, 'FAIL');
  if (kind === 'criterion-only') {
    f.core.runtime.evaluator.runStage = async () => { throw new Error('Fixture provider unavailable'); };
    const unavailable = await f.request('gate.execute', { gates: [id], configuration }, 'transport-after-failure');
    assert.equal((await f.core.store.json(unavailable.event.payload.results[0])).outcome, 'UNAVAILABLE');
  }
  const state = (await f.core.state()).state;
  await assert.rejects(f.core.currentResult(old, await f.core.store.json(state.candidate), state), /blocking review/);
  await assert.rejects(f.request('gate.execute', { gates: ['explanation'], configuration, consumed: [old] }, 'consume-old'), /blocking review/);
  const launches = fakeEvaluator(f);
  const fresh = await f.request('gate.execute', { gates: ['code'], configuration }, 'fresh');
  assert.equal(launches(), 1); assert.ok(fresh.event);
  const report = await f.core.store.json(fresh.event.payload.results[0]); assert.equal(report.outcome, 'PASS');
  const packet = await f.core.store.json(report.input); assert.ok(packet.history.some(ref => ref.hash === negative.hash));
  const again = await f.request('gate.execute', { gates: ['code'], configuration }, 'equivalent');
  assert.equal(again.reused, true); assert.equal(launches(), 1);
});

test('cross-gate same finding IDs retain separate closure authority', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); await runVerification(f);
  const configuration = { provider: 'codex', model: 'fixture' };
  fakeEvaluator(f, { blocking: true }); await f.request('gate.execute', { gates: ['code'] , configuration }, 'code-fail');
  await f.request('gate.execute', { gates: ['judge'], configuration }, 'judge-fail');
  fakeEvaluator(f, { dispositions: [{ id: 'finding-1', status: 'resolved', evidence: 'Code assessment established its own closure.' }] });
  const code = await f.request('gate.execute', { gates: ['code'], configuration }, 'code-fixed'); assert.equal((await f.core.store.json(code.event.payload.results[0])).outcome, 'PASS');
  fakeEvaluator(f); const judge = await f.request('gate.execute', { gates: ['judge'], configuration }, 'judge-not-closed');
  assert.equal((await f.core.store.json(judge.event.payload.results[0])).outcome, 'UNAVAILABLE');
});


test('transport unavailability alone preserves applicable independent proof', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f);
  const configuration = { provider: 'codex', model: 'fixture' };
  const first = await f.request('gate.execute', { gates: ['code'], configuration }, 'transport-seed');
  f.core.runtime.evaluator.runStage = async () => { throw new Error('Fixture provider unavailable'); };
  const unavailable = await f.request('gate.execute', { gates: ['code'], configuration: { ...configuration, validUntil: new Date(Date.now()+60000).toISOString() } }, 'transport-only');
  assert.equal((await f.core.store.json(unavailable.event.payload.results[0])).outcome, 'UNAVAILABLE');
  const state = (await f.core.state()).state;
  assert.equal((await f.core.currentResult(first.event.payload.results[0], await f.core.store.json(state.candidate), state)).outcome, 'PASS');
});


test('review context keeps an R1 failure after an unrelated R2 assessment', async t => {
  const f = await fixture(t);
  await writeFile(join(f.home, 'spec.md'), (await readFile(join(f.home, 'spec.md'), 'utf8')).replace('## Changes', '| R2 | AC1 | source inspected | source omitted | source |\n\n## Changes'));
  await authorize(f);
  const prepare = (criteria, id) => f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head: f.head }], scope: 'SLICE', criteria }, id);
  const configuration = { provider: 'codex', model: 'fixture' };
  await prepare(['R1'], 'r1'); await runVerification(f); fakeEvaluator(f, { outcome: 'FAIL' });
  const failure = await f.request('gate.execute', { gates: ['spec'], configuration }, 'r1-failure');
  await prepare(['R2'], 'r2'); await runVerification(f, false, 'r2-verify'); fakeEvaluator(f);
  const other = await f.request('gate.execute', { gates: ['spec'], configuration }, 'r2-pass');
  await prepare(['R1'], 'r1-return'); fakeEvaluator(f);
  const review = await f.request('gate.execute', { gates: ['code'], configuration }, 'r1-fresh');
  const packet = await f.core.store.json((await f.core.store.json(review.event.payload.results[0])).input);
  assert.ok(packet.history.some(ref => ref.hash === failure.event.payload.results[0].hash));
  assert.ok(!packet.history.some(ref => ref.hash === other.event.payload.results[0].hash));
});


test('root session history is absent from current, base, target and prior grouped reviewer views', async t => {
  const f = await fixture(t); await authorize(f);
  const history = ['CHECKPOINT.md', '.checkpoints/CHECKPOINT-2026-10-23T1200.md', '.handoffs/HANDOFF-reviewer-2026-10-23T1200.md'];
  await mkdir(join(f.repo, '.checkpoints')); await mkdir(join(f.repo, '.handoffs'));
  for (const path of history) await writeFile(join(f.repo, path), 'RAW IMPLEMENTATION CONVERSATION');
  // Untracked known session records neither block ordinary work nor enter source.
  await candidate(f);
  await git(f.repo, ['add', '-f', ...history]); await git(f.repo, ['commit', '-m', 'retained session context']);
  const retained = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  const prepare = (head, id) => f.request('candidate.prepare', { repositories: [{ alias: 'app', base: retained, head, target: retained }], scope: 'SLICE', criteria: ['R1'] }, id);
  await prepare(retained, 'session-source'); await runVerification(f); fakeEvaluator(f);
  const original = f.core.runtime.evaluator.runStage;
  f.core.runtime.evaluator.runStage = async request => {
    const paths = await readdir(request.repositoryPath, { recursive: true });
    assert.ok(!paths.some(path => /CHECKPOINT|HANDOFF/u.test(path)), paths.join('\n'));
    assert.ok(paths.includes('repositories/app/app.js'));
    return original(request);
  };
  const first = await f.request('gate.execute', { gates: ['code', 'spec'], configuration: { provider: 'codex', model: 'fixture' } }, 'grouped-no-session-history');
  const prior = first.event.payload.results[0];
  for (const path of history) await rm(join(f.repo, path));
  await writeFile(join(f.repo, 'app.js'), 'export const answer = 42; // changed interaction\n');
  await git(f.repo, ['add', '-A']); await git(f.repo, ['commit', '-m', 'remove session records and revise source']);
  await prepare((await git(f.repo, ['rev-parse', 'HEAD'])).trim(), 'removed-session-source');
  const result = await f.request('gate.execute', { gates: ['code'], prior, configuration: { provider: 'codex', model: 'fixture' } }, 'prior-without-session-history');
  assert.equal((await f.core.store.json(result.event.payload.results[0])).outcome, 'PASS');
  // Directory names alone must not hide configuration/application source.
  await writeFile(join(f.repo, '.handoffs/config.json'), '{"enabled":true}');
  await git(f.repo, ['add', '-f', '.handoffs/config.json']);
  await assert.rejects(f.request('candidate.ready'), /dirty/);
});

for (const mode of ['100755', '120000', '160000']) test(`root session history with Git mode ${mode} cannot hide application source`, async t => {
  const f = await fixture(t); await authorize(f);
  if (mode === '160000') { await mkdir(join(f.repo, 'CHECKPOINT.md')); await git(f.repo, ['update-index', '--add', '--cacheinfo', `160000,${f.head},CHECKPOINT.md`]); }
  else {
    if (mode === '120000') await symlink('app.js', join(f.repo, 'CHECKPOINT.md'));
    else { await writeFile(join(f.repo, 'CHECKPOINT.md'), 'executable source'); await chmod(join(f.repo, 'CHECKPOINT.md'), 0o755); }
    await git(f.repo, ['add', '-f', 'CHECKPOINT.md']);
  }
  await git(f.repo, ['commit', '-m', 'unsafe session record']);
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await assert.rejects(f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head }], scope: 'FEATURE', criteria: ['R1'] }), /Lifecycle records/);
});


test('retained session-contaminated proof becomes context only and never exports prior source', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f);
  const configuration = { provider: 'codex', model: 'fixture' };
  const first = await f.request('gate.execute', { gates: ['code'], configuration }, 'clean-seed');
  const report = await f.core.store.json(first.event.payload.results[0]);
  const input = await f.core.store.json(report.input), original = await f.core.store.json(input.candidate);
  const unsafe = structuredClone(original);
  const secret = await f.core.store.put('RAW IMPLEMENTATION CONVERSATION');
  unsafe.repositories[0].baseFiles.push({ path: 'CHECKPOINT.md', mode: '100644', ...secret });
  const oldCandidate = await f.core.store.putJson(unsafe);
  // Retain a structurally complete historical service record to represent source
  // captured before session-path isolation. It is fixture history, never current proof.
  const oldInput = await f.core.store.putJson({ ...input, candidate: oldCandidate });
  const jobId = 'prior-isolation-policy', operation = { id: jobId, hash: identity({ jobId }) };
  const receipt = await f.core.store.putJson({ ...await f.core.store.json(report.receipt), jobId, input: oldInput.hash });
  const oldResult = await f.core.store.putJson({ ...report, input: oldInput, receipt });
  let state = (await f.core.state()).state;
  await f.core.append(state, 'JOB_STARTED', { jobId, input: oldInput, gates: ['code'], role: 'independent', operation }, { id: 'start-old-policy', hash: identity({ jobId }) });
  await f.core.store.saveJob(jobId, { runId: state.runId, operation, results: [oldResult] });
  state = (await f.core.state()).state;
  await f.core.append(state, 'JOB_FINISHED', { jobId, results: [oldResult] }, operation);
  state = (await f.core.state()).state;
  const { checkCandidate } = await import('../../plugin-src/shared/resources/protocol/current/evidence.js');
  await assert.rejects(checkCandidate(f.core.store, f.context, oldCandidate, { live: false }), /reserved workflow history/);
  assert.ok((await f.core.historyGaps(state)).some(gap => gap.resultHash === oldResult.hash));
  await assert.rejects(f.request('gate.execute', { gates: ['code'], prior: oldResult, configuration }, 'unsafe-prior'), /reserved workflow history/);
  const originalRun = f.core.runtime.evaluator.runStage;
  f.core.runtime.evaluator.runStage = async request => {
    const paths = await readdir(request.repositoryPath, { recursive: true });
    assert.ok(!paths.some(path => /CHECKPOINT/u.test(path)));
    for (const path of paths.filter(path => path.startsWith('evidence/'))) {
      const bytes = await readFile(join(request.repositoryPath, path), 'utf8');
      assert.ok(!bytes.includes('RAW IMPLEMENTATION CONVERSATION'));
    }
    return originalRun(request);
  };
  const fresh = await f.request('gate.execute', { gates: ['code'], configuration }, 'fresh-isolated-review');
  const result = await f.core.store.json(fresh.event.payload.results[0]); assert.equal(result.outcome, 'PASS');
  const packet = await f.core.store.json(result.input);
  assert.ok(packet.historyGaps.some(gap => gap.resultHash === oldResult.hash));
  assert.ok((await Promise.all(packet.history.map(ref => f.core.store.json(ref)))).some(item => item.originalResultHash === oldResult.hash && item.evidenceUnavailable));
  assert.equal((await f.core.currentResult(fresh.event.payload.results[0], original, (await f.core.state()).state)).outcome, 'PASS');
  assert.equal((await f.core.store.get(secret)).toString(), 'RAW IMPLEMENTATION CONVERSATION');
});

for (const current of [false, true]) test(`activation successor schema validation applies only to current contract ${current}`, async t => {
  const f = await fixture(t); await authorize(f);
  const previous = await f.core.store.activationHead();
  const bytes = JSON.stringify({ contract: current ? 'gatereeve/current/5' : 'unsupported/v9', runId: 'unknown-shape', ancestor: 'opaque' });
  for (const dir of ['activations', 'activation-witnesses']) {
    await mkdir(join(f.home, '.gatereeve-current', dir), { recursive: true });
    await writeFile(join(f.home, '.gatereeve-current', dir, previous.hash.slice(7)+'.json'), bytes);
  }
  if (current) await assert.rejects(f.request('run.resume-current', { runId: 'replacement', implementers: ['implementer-one'] }, 'successor-resume'), /Invalid activation successor/);
  else {
    await f.request('run.resume-current', { runId: 'replacement', implementers: ['implementer-one'] }, 'successor-resume');
    assert.equal((await f.request('status')).phase, 'DESIGNING');
    assert.equal(await readFile(join(f.home, '.gatereeve-current/activations', previous.hash.slice(7)+'.json'), 'utf8'), bytes);
    assert.equal((await f.core.check('implementation')).allowed, false);
  }
});


for (const path of ['checkpoint.md', '.CHECKPOINTS/checkpoint-2026-10-23.md', '.HANDOFFS/handoff-reviewer-2026-10-23.MD']) test(`session record case alias stays isolated: ${path}`, async t => {
  const f = await fixture(t); await authorize(f);
  const { dirname } = await import('node:path');
  await mkdir(dirname(join(f.repo, path)), { recursive: true });
  await writeFile(join(f.repo, path), 'SESSION CONTEXT FROM CASE ALIAS');
  await git(f.repo, ['add', '-f', path]); await git(f.repo, ['commit', '-m', 'tracked case alias']);
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: head, head, target: head }], scope: 'SLICE', criteria: ['R1'] }, 'case-alias');
  fakeEvaluator(f); const original = f.core.runtime.evaluator.runStage;
  f.core.runtime.evaluator.runStage = async request => {
    for (const prefix of ['repositories', 'base', 'target']) assert.deepEqual(await readdir(join(request.repositoryPath, prefix, 'app'), { recursive: true }), ['app.js']);
    return original(request);
  };
  const completed = await f.request('gate.execute', { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } }, 'case-alias-review');
  assert.equal((await f.core.store.json(completed.event.payload.results[0])).outcome, 'PASS');
});


// Real subprocess regressions for external runner input and exception scope.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
const actualExit=async(command,args,cwd)=>{try{await execute(command,args,{cwd});return 0;}catch(e){return e.code;}};
async function externalRunnerFixture(t,kind,fail=false){
 const f=await fixture(t);await authorize(f);await candidate(f);
 const outside=join(f.root,'external-tools');await mkdir(outside);
 let command=process.execPath,args=[],mutation;
 const script=join(outside,'check.cjs');
 if(kind==='argument'){
  await writeFile(script,`process.exit(${fail?1:0});\n`);args=[script];
  mutation=()=>writeFile(script,'process.exit(7);\n');
 }else if(kind==='library'){
  command=join(outside,'launcher');await writeFile(command,`#!${process.execPath}\nrequire('./lib.cjs');\n`);await chmod(command,0o755);
  const lib=join(outside,'lib.cjs');await writeFile(lib,'process.exit(0);\n');mutation=()=>writeFile(lib,'process.exit(7);\n');
 }else{
  const interpreter=join(outside,'interpreter');await symlink(process.execPath,interpreter);
  command=join(outside,'launcher');await writeFile(command,`#!${interpreter}\nprocess.exit(0);\n`);await chmod(command,0o755);
  mutation=async()=>{await rm(interpreter);await symlink('/bin/sh',interpreter);};
 }
 const configuration={externalRuntimeInputs:{app:[outside]},checks:[{repository:'app',command,args,purpose:`External ${kind} actual probe`}]};
 const ran=await f.request('gate.execute',{gates:['verification'],configuration},'external-run');
 return {...f,command,args,configuration,mutation,ran};
}
for(const kind of ['argument','library','shebang'])test(`actual ${kind} change invalidates retained PASS and reruns the check`,async t=>{
 const f=await externalRunnerFixture(t,kind),ref=f.ran.event.payload.results[0];
 assert.equal((await f.core.store.json(ref)).outcome,'PASS');
 await f.mutation();const actual=await actualExit(f.command,f.args,f.repo);assert.notEqual(actual,0);
 const state=(await f.core.state()).state,candidate=await f.core.store.json(state.candidate);
 await assert.rejects(f.core.currentResult(ref,candidate,state), /environment changed/);
 const reused=await f.request('gate.execute',{gates:['verification'],configuration:f.configuration},'external-repeat');assert.notEqual(reused.reused,true);assert.equal((await f.core.store.json(reused.event.payload.results[0])).outcome,'FAIL');
});
test('actual failed runner exception expires after changed external script',async t=>{
 const f=await externalRunnerFixture(t,'argument',true);let state=(await f.core.state()).state;const candidate=await f.core.store.json(state.candidate);
 assert.equal((await f.core.store.json(f.ran.event.payload.results[0])).outcome,'FAIL');
 await f.request('human.decide',{kind:'waive',subject:state.candidate.hash,gates:['verification'],authority:human,reason:'Known failed external command',consequences:'Accept only this external script behavior'},'waive-external');
 state=(await f.core.state()).state;const risk=await f.core.waiverRisk(state,candidate,'verification');
 await f.mutation();assert.equal(await actualExit(f.command,f.args,f.repo),7);
 assert.notEqual(await f.core.waiverRisk(state,candidate,'verification'),risk);
 const row=(await f.core.check('acceptance')).outcomes.find(x=>x.id==='verification');assert.equal(row.satisfied,false);assert.equal(row.exception,null);
});
test('actual acceptance passage rejects old PASS after external script turns failing',async t=>{
 const f=await externalRunnerFixture(t,'argument');await writeFile(join(f.home,'scratchpad.md'),'# No pending decisions\n');await f.request('candidate.ready',{},'ready');fakeEvaluator(f);
 const verification=f.ran.event.payload.results,refs=[...verification];
 for(const gate of ['context','reconcile','triage','code','spec','judge','pattern','explanation']){
  const result=await f.request('gate.execute',{gates:[gate],consumed:['spec','judge'].includes(gate)?verification:[],configuration:['reconcile','triage','code','spec','judge','pattern','explanation'].includes(gate)?{provider:'codex',model:'fixture'}:{}},`g-${gate}`);refs.push(...result.event.payload.results);
 }
 await f.request('gate.execute',{gates:['packet'],consumed:refs},'packet');
 const initial=await f.core.check('acceptance');assert.equal(initial.allowed,true,JSON.stringify(initial));await f.mutation();assert.equal(await actualExit(f.command,f.args,f.repo),7);
 assert.equal((await f.core.check('acceptance')).allowed,false);
 await assert.rejects(f.request('milestone.pass',{name:'acceptance'},'pass-after-external-drift'),/blocked/);
 assert.equal((await f.core.state()).state.phase,'IMPLEMENTING');
});
test('waiver risk observation cannot recreate released diagnostic indexes', async t => {
 const f=await externalRunnerFixture(t,'argument',true);
 const state=(await f.core.state()).state,candidate=await f.core.store.json(state.candidate);
 const {releaseComparisonIndexes}=await import('../../plugin-src/shared/resources/protocol/current/environment.js');
 const cache=join(f.home,'.gatereeve-current/diagnostic-indexes');
 assert.ok((await readdir(cache)).length,'execution retained its baseline');
 const before=await f.core.waiverRisk(state,candidate,'verification');
 await releaseComparisonIndexes(f.context);
 assert.equal(await f.core.waiverRisk(state,candidate,'verification'),before);
 assert.deepEqual(await readdir(cache),[],'waiver observation is read-only');
});
test('consumed verification external drift also invalidates a spec waiver',async t=>{
 const f=await externalRunnerFixture(t,'argument');fakeEvaluator(f,{outcome:'FAIL'});
 await f.request('gate.execute',{gates:['spec'],consumed:f.ran.event.payload.results,configuration:{provider:'codex',model:'fixture'}},'failed-spec');
 let state=(await f.core.state()).state;const candidate=await f.core.store.json(state.candidate);
 await f.request('human.decide',{kind:'waive',subject:state.candidate.hash,gates:['spec'],authority:human,reason:'Known spec result with retained verification',consequences:'This verification runtime scope'},'waive-spec');
 state=(await f.core.state()).state;const risk=await f.core.waiverRisk(state,candidate,'spec');
 await f.mutation();assert.equal(await actualExit(f.command,f.args,f.repo),7);
 assert.notEqual(await f.core.waiverRisk(state,candidate,'spec'),risk);
 const row=(await f.core.check('acceptance')).outcomes.find(x=>x.id==='spec');assert.equal(row.satisfied,false);assert.equal(row.exception,null);
});

test('external input mutation during execution retains diagnostics but never current PASS', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const tools = join(f.root, 'external'); await mkdir(tools);
  const marker = join(tools, 'input'); await writeFile(marker, 'before');
  const ran = await f.request('gate.execute', { gates: ['verification'], configuration: {
    externalRuntimeInputs: { app: [tools] }, checks: [{ repository: 'app', command: process.execPath,
      args: ['-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'after'); console.log('executed');`], purpose: 'Postflight external drift' }],
  } }, 'external-mutating-check');
  const report = await f.core.store.json(ran.event.payload.results[0]);
  assert.equal(report.outcome, 'UNAVAILABLE');
  assert.match(report.summary, /environment changed during checks/);
  const receipt = await f.core.store.json(report.runner);
  assert.equal(receipt.receipts.length, 1);
  assert.match((await f.core.store.get(receipt.receipts[0].stdout)).toString(), /executed/);
});

test('loader environment preload drift invalidates actual runner proof', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const tools = join(f.root, 'loader'); await mkdir(tools); await writeFile(join(tools, 'package.json'), '{}');
  const preload = join(tools, 'preload.cjs'); await writeFile(preload, 'process.exit(0)');
  const previous = process.env.NODE_OPTIONS;
  t.after(() => { if (previous === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = previous; });
  process.env.NODE_OPTIONS = `--require ${preload}`;
  const check = id => f.request('gate.execute', { gates: ['verification'], configuration: { environment: { inherit: ['NODE_OPTIONS'] }, externalRuntimeInputs: { app: [] }, checks: [{ repository: 'app', command: process.execPath, args: ['-e', 'process.exit(0)'], purpose: 'Declared loader inputs' }] } }, id);
  const ran = await check('initial-preload');
  assert.equal((await f.core.store.json(ran.event.payload.results[0])).outcome, 'PASS');
  await writeFile(preload, 'process.exit(7)');
  const state = (await f.core.state()).state, selected = await f.core.store.json(state.candidate);
  await assert.rejects(f.core.currentResult(ran.event.payload.results[0], selected, state), /environment changed/);
  const fresh = await check('changed-preload');
  assert.notEqual(fresh.reused, true);
  assert.equal((await f.core.store.json(fresh.event.payload.results[0])).outcome, 'FAIL');
});

test('directory checks exclude only their trusted current evidence store', async t => {
  const f = await fixture(t, { nested: false }); await authorize(f); await candidate(f);
  const configuration = { externalRuntimeInputs: { app: [] }, checks: [{ repository: 'app', command: process.execPath,
    args: ['-e', 'process.exit(0)', '.'], purpose: 'Directory-scoped runner' }] };
  const ran = await f.request('gate.execute', { gates: ['verification'], configuration }, 'directory-check');
  assert.equal((await f.core.store.json(ran.event.payload.results[0])).outcome, 'PASS');
  const state = (await f.core.state()).state, selected = await f.core.store.json(state.candidate);
  assert.equal((await f.core.currentResult(ran.event.payload.results[0], selected, state)).outcome, 'PASS');
  const unrelated = join(f.repo, '.gatereeve-current'); await mkdir(unrelated); await writeFile(join(unrelated, 'input'), 'relevant external directory');
  await assert.rejects(f.core.currentResult(ran.event.payload.results[0], selected, state), /Execution environment changed/);
});

async function standingGrant(f, { merge = false, expiresAt = null, candidateScopes = ['SLICE', 'FEATURE'] } = {}) {
  const scope = { actions: merge ? ['accept', 'authorize-merge'] : ['accept'], candidateScopes,
    repositories: [{ alias: 'app', headPrefix: 'topic', baseBranch: 'main', ...(merge ? { methods: ['merge'] } : {}) }], expiresAt };
  const value = { kind: 'authorize-standing', subject: (await f.core.commitments()).subject, scope,
    authority: { ...human, instruction: merge ? 'Finish this approved feature including merging its slice and final PRs to main.' : 'Accept this approved feature when all gates pass; do not merge.' },
    reason: 'Unattended approved scope', consequences: merge ? 'Integrate all approved slices including the final PR; no deployment' : 'Acceptance only; no merge or deployment' };
  return f.request('human.decide', value, 'standing-grant');
}
async function standingRepository(f) {
  const bare = join(f.root, 'host.git');
  await git(f.root, ['init', '--bare', bare]);
  await git(f.repo, ['remote', 'add', 'origin', 'https://github.com/fixture/project.git']);
  await git(f.repo, ['config', `url.${bare}.insteadOf`, 'https://github.com/fixture/project.git']);
  await git(f.repo, ['push', 'origin', 'HEAD:refs/heads/main']);
  Object.assign(f.context.repositories[0], { integrationBranch: 'main', remote: 'origin' });
}

test('standing authority is explicit, run-scoped, visible, revocable and never substitutes for proof', async t => {
  const f = await fixture(t); await standingRepository(f); await authorize(f);
  const grant = await standingGrant(f);
  const event = grant.event.hash;
  await candidate(f);
  await assert.rejects(f.request('authorization.apply', { grant: event }), /current PASS/);
  await f.request('human.decide', { kind: 'waive', subject: (await f.core.state()).state.candidate.hash,
    authority: human, reason: 'Known fixture omission', consequences: 'Unverified', gates: ['verification'] });
  await assert.rejects(f.request('authorization.apply', { grant: event }), /current PASS/);
  let status = await f.request('status');
  assert.equal(status.standingAuthorizations[0].allowed, true);
  assert.equal(status.standingAuthorizations[0].scope.expiresAt, null);
  await f.request('run.pause', { authority: human });
  assert.match((await f.request('status')).standingAuthorizations[0].reason, /paused/);
  await f.request('run.continue', { authority: human });
  assert.equal((await f.request('status')).standingAuthorizations[0].allowed, true);
  await f.request('human.decide', { kind: 'revoke-standing', subject: event, authority: human, reason: 'Stop unattended operation', consequences: 'New authority required' }, 'revoke');
  status = await f.request('status');
  assert.match(status.standingAuthorizations[0].reason, /revoked/);
  await assert.rejects(f.request('authorization.apply', { grant: event }), /revoked/);
});

for (const mismatch of ['scope', 'branch', 'target', 'repository', 'missing-root', 'missing-source']) test(`standing status reports current candidate mismatch: ${mismatch}`, async t => {
  const f = await fixture(t); await standingRepository(f); await authorize(f);
  await standingGrant(f, { candidateScopes: mismatch === 'scope' ? ['SLICE'] : ['SLICE', 'FEATURE'] });
  assert.equal((await f.request('status')).standingAuthorizations[0].allowed, true); // no candidate yet
  if (mismatch === 'repository') {
    f.context.repositories.push({ ...f.context.repositories[0], alias: 'other' });
    await f.request('candidate.prepare', { repositories: [{ alias: 'other', base: f.head, head: f.head }], scope: 'SLICE', criteria: ['R1'] });
  } else await candidate(f);
  if (mismatch === 'branch') await git(f.repo, ['checkout', '-b', 'unrelated']);
  if (mismatch === 'target') {
    await writeFile(join(f.repo, 'target.js'), 'export const moved = true;\n');
    await git(f.repo, ['add', 'target.js']); await git(f.repo, ['commit', '-m', 'advance target']);
    await git(f.repo, ['push', 'origin', 'HEAD:refs/heads/main']);
  }
  if (mismatch.startsWith('missing-')) {
    const { state } = await f.core.state();
    const selected = await f.core.store.json(state.candidate);
    if (mismatch === 'missing-root') await rm(join(f.home, '.gatereeve-current/objects', state.candidate.hash.slice(7)));
    else { const oid = selected.repositories[0].files[0].oid; await rm(join(f.repo, '.git/objects', oid.slice(0, 2), oid.slice(2))); }
  }
  const status = (await f.request('status')).standingAuthorizations[0];
  assert.equal(status.allowed, false);
  const reasons = { scope: /outside standing scope/, branch: /branch/, target: /target/, repository: /repository/, 'missing-root': /candidate evidence/, 'missing-source': /candidate evidence/ };
  assert.match(status.reason, reasons[mismatch]);
});

test('standing scope rejects implicit deployment, unknown fields, missing expiry and changed commitments/remotes/branches', async t => {
  const f = await fixture(t); await standingRepository(f); await authorize(f);
  const grant = await standingGrant(f); await candidate(f);
  const { standingScope, standingValidity } = await import('../../plugin-src/shared/resources/protocol/current/authorization.js');
  const scope = grant.event.payload.scope;
  for (const invalid of [{ ...scope, actions: ['accept', 'deploy'] }, { ...scope, actions: ['authorize-merge'] },
    { ...scope, expiresAt: undefined }, { ...scope, candidateScopes: ['ALL'] }, { ...scope, unrestricted: true },
    { ...scope, repositories: [{ ...scope.repositories[0], headPrefix: '*' }] }]) assert.throws(() => standingScope(invalid));
  const check = async () => {
    const { state } = await f.core.state();
    return standingValidity(f.core, state, state.decisions.find(item => item.event === grant.event.hash), await f.core.store.json(state.candidate));
  };
  assert.equal((await check()).allowed, true);
  await git(f.repo, ['checkout', '-b', 'topic-unattended-slice']);
  assert.equal((await check()).allowed, true);
  await git(f.repo, ['checkout', '-b', 'topicother']);
  assert.match((await check()).reason, /branch/);
  await git(f.repo, ['checkout', 'topic']);
  await git(f.repo, ['remote', 'set-url', 'origin', 'https://github.com/other/project.git']);
  assert.match((await check()).reason, /remote identity/);
  await git(f.repo, ['remote', 'set-url', 'origin', 'https://github.com/fixture/project.git']);
  f.context.repositories[0].keepPullRequestsClosed = true;
  assert.match((await check()).reason, /configuration/);
  f.context.repositories[0].keepPullRequestsClosed = false;
  const spec = await readFile(join(f.home, 'spec.md'), 'utf8');
  await writeFile(join(f.home, 'spec.md'), spec+'\nAmended requirement.\n');
  assert.match((await check()).reason, /commitments/);
  await f.request('human.decide', { kind: 'amend', subject: (await f.core.commitments()).subject,
    previousSubject: grant.event.payload.subject, actions: ['authorize-implementation'], authority: human, reason: 'Amend', consequences: 'New scope' });
  await writeFile(join(f.home, 'spec.md'), spec);
  assert.match((await check()).reason, /implementation authorization/);
});

for (const mode of ['slice', 'final', 'acceptance-only', 'revoke-during-checks', 'expire-during-checks', 'revoke-during-final-qualification', 'expire-during-final-qualification', 'revoke-during-input-guard']) test(`standing authority protected merge: ${mode}`, async t => {
  const f = await fixture(t); await standingRepository(f);
  const base = f.head;
  await writeFile(join(f.repo, 'app.js'), 'export const answer = 42; // standing candidate\n');
  await git(f.repo, ['add', 'app.js']); await git(f.repo, ['commit', '-m', 'standing candidate']);
  f.head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await git(f.repo, ['push', 'origin', 'HEAD:refs/heads/topic']);
  await authorize(f);
  const expiresAt = mode.startsWith('expire-') ? new Date(Date.now()+600000).toISOString() : null;
  const grant = await standingGrant(f, { merge: mode !== 'acceptance-only', expiresAt });
  const scope = mode === 'slice' ? 'SLICE' : 'FEATURE';
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base, head: f.head, target: base }], scope, criteria: ['R1'] });
  let remoteState = 'OPEN'; let isDraft = true; const writes = []; let finalRead = false; let revoked = false;
  f.core.runtime.git = async (root, args) => {
    const result = await git(root, args);
    if (mode === 'revoke-during-final-qualification' && finalRead && args[0] === 'ls-remote' && !revoked) {
      revoked = true;
      await f.request('human.decide', { kind: 'revoke-standing', subject: grant.event.hash,
        authority: human, reason: 'Stop during final qualification', consequences: 'Wait' });
    }
    if (mode === 'expire-during-final-qualification' && finalRead && args[0] === 'ls-remote') {
      const original = Date.now; Date.now = () => Date.parse(expiresAt)+1; t.after(() => { Date.now = original; });
    }
    return result;
  };
  const finalGuard = f.core.assertLiveInputs.bind(f.core);
  f.core.assertLiveInputs = async (...args) => {
    await finalGuard(...args);
    if (mode === 'revoke-during-input-guard' && finalRead && args[1] === 'merge' && !revoked) {
      revoked = true;
      await f.request('human.decide', { kind: 'revoke-standing', subject: grant.event.hash,
        authority: human, reason: 'Stop during final input guard', consequences: 'Wait' });
    }
  };
  // Actual local git remote and integration verification; only GitHub transport is simulated.
  f.core.runtime.gh = async (root, args) => {
    const command = args[1];
    if (command === 'view' && writes.includes('checks')) finalRead = true;
    if (command === 'view') return JSON.stringify({ number: 12, url: 'https://github.com/fixture/project/pull/12', state: remoteState,
      headRefName: 'topic', baseRefName: 'main', headRefOid: f.head, baseRefOid: base, isDraft,
      mergeCommit: remoteState === 'MERGED' ? { oid: f.head } : null });
    writes.push(command);
    if (command === 'ready') isDraft = args.includes('--undo');
    if (command === 'checks' && mode === 'revoke-during-checks') await f.request('human.decide', { kind: 'revoke-standing', subject: grant.event.hash,
      authority: human, reason: 'Stop before merge', consequences: 'Wait' });
    if (command === 'checks' && mode === 'expire-during-checks') {
      const original = Date.now; Date.now = () => Date.parse(expiresAt)+1; t.after(() => { Date.now = original; });
    }
    if (command === 'merge') { await git(root, ['push', 'origin', 'HEAD:refs/heads/main']); remoteState = 'MERGED'; }
    return '';
  };
  await reviewAll(f, { accept: false });
  const action = await f.request('merge.prepare', { repository: 'app', number: 12 });
  assert.equal(action.keepClosed, false); // absent config preserves default open drafts
  const acceptance = await f.request('authorization.apply', { grant: grant.event.hash }, 'apply-acceptance');
  assert.equal(acceptance.event.payload.standingGrant, grant.event.hash);
  const repeat = await f.request('authorization.apply', { grant: grant.event.hash }, 'apply-acceptance');
  assert.equal(repeat.event.hash, acceptance.event.hash);
  assert.equal((await f.request('milestone.check', { name: 'merge' })).allowed, false);
  if (mode === 'acceptance-only') {
    await assert.rejects(f.request('authorization.apply', { grant: grant.event.hash, action }), /outside standing scope/);
    await assert.rejects(f.request('merge.execute', { repository: 'app', number: 12 }), /blocked/);
    assert.deepEqual(writes, []); return;
  }
  await assert.rejects(f.request('authorization.apply', { grant: grant.event.hash, action: { ...action, method: 'squash' } }), /outside standing scope/);
  await f.request('authorization.apply', { grant: grant.event.hash, action }, 'apply-merge');
  assert.equal((await f.request('milestone.check', { name: 'merge' })).allowed, true);
  if (mode.includes('during-')) {
    await assert.rejects(f.request('merge.execute', { repository: 'app', number: 12 }), /state or authority changed|Gate proof changed|expired/);
    assert.equal(writes.includes('merge'), false);
    assert.equal(isDraft, true);
    assert.equal((await f.request('merge.prepare', { repository: 'app', number: 12 })).keepClosed, false);
    return;
  }
  await f.request('merge.execute', { repository: 'app', number: 12 });
  assert.deepEqual(writes, ['ready', 'checks', 'merge']);
  assert.equal(remoteState, 'MERGED');
  assert.equal((await f.core.state()).state.integrations.app.integrationSha, f.head);
  const completion = await f.request('milestone.check', { name: 'completion' });
  assert.equal(completion.allowed, false); // no finalization/release proof
  assert.equal(completion.missing.includes('current human acceptance'), false); // target advanced through verified integration
  assert.equal((await f.request('status')).standingAuthorizations[0].allowed, true); // retained integration keeps this candidate in scope
});

test('standing acceptance rejects a different assessed target and subsequent target drift', async t => {
  const f = await fixture(t); await standingRepository(f); await authorize(f);
  const grant = await standingGrant(f); const base = f.head;
  await writeFile(join(f.repo, 'target.js'), 'export const interaction = true;\n');
  await git(f.repo, ['add', 'target.js']); await git(f.repo, ['commit', '-m', 'different target']);
  const target = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base, head: target, target }], scope: 'FEATURE', criteria: ['R1'] });
  await reviewAll(f, { accept: false });
  await assert.rejects(f.request('authorization.apply', { grant: grant.event.hash }), /Assessed target differs/);
  await git(f.repo, ['push', 'origin', 'HEAD:refs/heads/main']);
  await f.request('authorization.apply', { grant: grant.event.hash }, 'in-scope-target');
  assert.equal((await f.request('milestone.check', { name: 'merge' })).missing.includes('current human acceptance'), false);
  // The same source and proof no longer authorize the moved target's interactions.
  await git(f.repo, ['push', '--force', 'origin', `${base}:refs/heads/main`]);
  assert.equal((await f.request('milestone.check', { name: 'merge' })).missing.includes('current human acceptance'), true);
  await assert.rejects(f.request('authorization.apply', { grant: grant.event.hash }), /Assessed target differs/);
});

test('standing status uses the host-discovered Git when GUI PATH cannot resolve git', async t => {
  const f = await fixture(t); await standingRepository(f); await authorize(f); await standingGrant(f);
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const executable = (await promisify(execFile)('/usr/bin/which', ['git'])).stdout.trim();
  f.core.runtime.gitExecutable = executable;
  const before = process.env.PATH;
  try {
    process.env.PATH = join(f.root, 'no-executables');
    const status = await f.request('status');
    assert.equal(status.standingAuthorizations[0].allowed, true, status.standingAuthorizations[0].reason);
  } finally { process.env.PATH = before; }
});

test('integration observation uses discovered Python and Git with an empty GUI PATH', async t => {
  const f = await fixture(t); await standingRepository(f); await authorize(f); await candidate(f);
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const which = async name => (await promisify(execFile)('/usr/bin/which', [name])).stdout.trim();
  f.core.runtime.gitExecutable = await which('git');
  f.core.runtime.pythonGuardOptions = { pythonExecutable: await which('python3') };
  const before = process.env.PATH;
  try {
    process.env.PATH = join(f.root, 'no-executables');
    const observed = await f.request('integration.observe', { repository: 'app' });
    assert.equal(observed.state.integrations.app.integrationSha, f.head);
  } finally { process.env.PATH = before; }
});

test('amendment rollback cannot revive direct planning or candidate authority', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); await reviewAll(f);
  const original = (await f.core.state()).state;
  const design = await readFile(join(f.home, 'design.md'));
  const prior = (await f.core.commitments()).subject;
  await writeFile(join(f.home, 'design.md'), Buffer.concat([design, Buffer.from('\nApproved change B.\n')]));
  const next = (await f.core.commitments()).subject;
  await f.request('human.decide', { kind: 'amend', subject: next, previousSubject: prior, authority: human,
    reason: 'Approve B only', consequences: 'No implementation continuation' }, 'amend-B');
  await writeFile(join(f.home, 'design.md'), design);
  await assert.rejects(f.request('spec.validate', {}, 'restore-A'), /Current design approval/);
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, false);
  await assert.rejects(f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head: f.head }], scope: 'FEATURE', criteria: ['R1'] }), /implementation authority/);
  const amended = (await f.core.state()).state;
  const { qualifyingDecisions } = await import('../../plugin-src/shared/resources/protocol/current/authorization.js');
  const oldCandidate = await f.core.store.json(original.candidate);
  assert.deepEqual(await qualifyingDecisions(f.core, amended, 'accept', original.candidate.hash, oldCandidate), []);
  // An explicit rollback is a new commitment decision, not historical revival.
  await f.request('human.decide', { kind: 'amend', actions: ['authorize-implementation'], subject: prior,
    previousSubject: next, authority: human, reason: 'Explicitly restore A', consequences: 'Renew candidate authority' }, 'explicit-A');
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, true);
  assert.match((await f.request('milestone.check', { name: 'acceptance' })).missing.join('; '), /superseded/);
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head: f.head }], scope: 'FEATURE', criteria: ['R1'] }, 'new-A');
  const restored = (await f.core.state()).state;
  assert.notEqual(restored.candidate.hash, original.candidate.hash);
  assert.ok((await f.request('milestone.check', { name: 'merge' })).missing.includes('current human acceptance'));
});

test('superseded direct merge decisions and exceptions do not revive with equivalent content', async () => {
  const { qualifyingDecisions } = await import('../../plugin-src/shared/resources/protocol/current/authorization.js');
  const { waiverFor } = await import('../../plugin-src/shared/resources/protocol/current/contracts.js');
  const subject = identity('candidate'), applicability = identity('same bytes'), risk = identity('same risk');
  const state = { decisions: [
    { kind: 'authorize-implementation', event: 'approval-A' },
    { kind: 'accept', subject, actions: ['authorize-merge'], event: 'direct' },
    { kind: 'waive', subject, applicability, gates: ['verification'], risks: { verification: risk } },
    { kind: 'amend', event: 'B' },
    { kind: 'amend', actions: ['authorize-implementation'], event: 'explicit-A' },
  ] };
  assert.deepEqual(await qualifyingDecisions({}, state, 'authorize-merge', subject, {}), []);
  assert.equal(waiverFor(state, 'verification', subject, applicability, risk), null);
  state.decisions.push({ kind: 'accept', subject, actions: ['authorize-merge'], event: 'fresh-direct' });
  assert.equal((await qualifyingDecisions({}, state, 'authorize-merge', subject, {}))[0].event, 'fresh-direct');
});

test('explanation requires an explicit policy amendment instead of an ordinary waiver', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const subject = (await f.core.state()).state.candidate.hash;
  const input = { kind: 'waive', subject, gates: ['explanation'], authority: human, reason: 'Named exception', consequences: 'Explanation remains unavailable' };
  await assert.rejects(f.request('human.decide', input), /policy amendment/);
  await f.request('human.decide', { ...input, kind: 'policy-amend', actions: ['waive'] }, 'explicit-explanation-policy');
  const outcome = (await f.request('milestone.check', { name: 'acceptance' })).outcomes.find(row => row.id === 'explanation');
  assert.equal(outcome.outcome, 'UNAVAILABLE'); assert.equal(outcome.satisfied, true);
  await assert.rejects(f.request('human.decide', { ...input, kind: 'policy-amend', actions: ['waive'], gates: ['context'] }), /cannot waive/);
});

test('Whiteboard waiver requires retained non-behavioral basis or explicit policy amendment', async t => {
  const f = await fixture(t, { optionalGates: ['whiteboard'] }); await authorize(f); await candidate(f);
  const subject = (await f.core.state()).state.candidate.hash;
  const input = { kind: 'waive', subject, gates: ['whiteboard'], authority: human, reason: 'Non-behavioral change only', consequences: 'Whiteboard not performed' };
  await assert.rejects(f.request('human.decide', input), /waiver basis/);
  const evidence = await f.core.store.put(Buffer.from('Human classifies this exact candidate as non-behavioral; source unchanged.'));
  await assert.rejects(f.request('human.decide', { ...input, waiverBasis: { classification: 'BEHAVIORAL', evidence } }), /non-behavioral/);
  await f.request('human.decide', { ...input, waiverBasis: { classification: 'NON_BEHAVIORAL', evidence } }, 'whiteboard-basis');
  let outcome = (await f.request('milestone.check', { name: 'acceptance' })).outcomes.find(row => row.id === 'whiteboard');
  assert.equal(outcome.outcome, 'UNAVAILABLE'); assert.equal(outcome.satisfied, true);
  await rm(join(f.home, '.gatereeve-current/objects', evidence.hash.slice(7)));
  const missingBasis = await f.request('milestone.check', { name: 'acceptance' });
  assert.equal(missingBasis.allowed, false);
  assert.equal(missingBasis.outcomes.find(row => row.id === 'whiteboard').satisfied, false);
});

test('behavioral Whiteboard exception requires a named policy amendment', async t => {
  const f = await fixture(t, { optionalGates: ['whiteboard'] }); await authorize(f);
  await writeFile(join(f.repo, 'app.js'), 'export const answer = 43;\n'); await git(f.repo, ['add', 'app.js']); await git(f.repo, ['commit', '-m', 'behavioral']); f.head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await candidate(f); const subject = (await f.core.state()).state.candidate.hash;
  const input = { kind: 'waive', subject, gates: ['whiteboard'], authority: human, reason: 'Explicit behavioral exception', consequences: 'Required Whiteboard unavailable' };
  await assert.rejects(f.request('human.decide', input), /waiver basis/);
  await f.request('human.decide', { ...input, kind: 'policy-amend', actions: ['waive'] }, 'whiteboard-policy');
  const outcome = (await f.request('milestone.check', { name: 'acceptance' })).outcomes.find(row => row.id === 'whiteboard');
  assert.equal(outcome.satisfied, true); assert.equal(outcome.exception.kind, 'policy-amend');
});

test('milestone admission rejects unjournaled drift during qualification and before passage', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); await reviewAll(f);
  const qualify = f.core.currentResult.bind(f.core), check = f.core.check.bind(f.core);
  let during = null, after = null;
  f.core.currentResult = async (...args) => {
    const result = await qualify(...args);
    if (result.gate === 'explanation' && during) { const change = during; during = null; await change(); }
    return result;
  };
  f.core.check = async (...args) => {
    const result = await check(...args);
    if (after) { const change = after; after = null; await change(); }
    return result;
  };
  for (const timing of ['during', 'after']) for (const kind of ['source', 'head', 'design', 'spec', 'environment', 'retained-proof', 'retained-job']) {
    const state = (await f.core.state()).state, ref = state.results[0];
    const result = await f.core.store.json(ref), receipt = await f.core.store.json(result.receipt);
    const file = kind === 'retained-proof' ? join(f.home, '.gatereeve-current/objects', ref.hash.slice(7))
      : kind === 'retained-job' ? join(f.home, '.gatereeve-current/jobs', `${receipt.jobId}.json`)
      : ['design', 'spec'].includes(kind) ? join(f.home, `${kind}.md`) : join(f.repo, 'app.js');
    const bytes = await readFile(file), previous = process.env.GATEREEVE_ADMISSION_HOST_MODE;
    const change = async () => {
      if (kind === 'environment') process.env.GATEREEVE_ADMISSION_HOST_MODE = 'changed-after-proof';
      else if (kind.startsWith('retained-')) await rm(file);
      else {
        await writeFile(file, Buffer.concat([bytes, Buffer.from('\n// changed during admission\n')]));
        if (kind === 'head') { await git(f.repo, ['add', 'app.js']); await git(f.repo, ['commit', '-m', 'racing source']); }
      }
    };
    if (timing === 'during') during = change; else after = change;
    try {
      await assert.rejects(f.request('milestone.pass', { name: 'acceptance' }, `late-${timing}-${kind}`));
      assert.equal(during ?? after, null, `${timing} ${kind} mutation ran`);
      assert.equal((await f.core.state()).state.eventCount, state.eventCount, `${timing} ${kind} cannot record passage`);
    } finally {
      if (kind === 'head') await git(f.repo, ['reset', '--hard', f.head]); else await writeFile(file, bytes);
      if (previous === undefined) delete process.env.GATEREEVE_ADMISSION_HOST_MODE; else process.env.GATEREEVE_ADMISSION_HOST_MODE = previous;
      during = null; after = null;
    }
  }
  assert.equal((await f.request('milestone.pass', { name: 'acceptance' }, 'restored-admission')).event.type, 'MILESTONE');
});

test('standing grants bind effective fetch and push URLs even with unchanged raw URL and target commit', async t => {
  const f = await fixture(t); await standingRepository(f); await authorize(f);
  const grant = await standingGrant(f); await candidate(f); await reviewAll(f, { accept: false });
  const original = join(f.root, 'host.git'), redirected = join(f.root, 'other.git');
  await git(f.root, ['clone', '--bare', original, redirected]);
  const raw = (await git(f.repo, ['config', '--get', 'remote.origin.url'])).trim();
  const edits = [
    { key: `url.${redirected}.insteadOf`, value: raw, remove: `url.${original}.insteadOf` },
    { key: 'remote.origin.pushurl', value: redirected },
    { key: `url.${redirected}.pushInsteadOf`, value: raw },
  ];
  for (const [index, edit] of edits.entries()) {
    if (edit.remove) await git(f.repo, ['config', '--unset-all', edit.remove]);
    await git(f.repo, ['config', edit.key, edit.value]);
    try {
      assert.equal((await git(f.repo, ['config', '--get', 'remote.origin.url'])).trim(), raw);
      assert.equal((await git(f.repo, ['ls-remote', 'origin', 'refs/heads/main'])).split(/\s/u)[0], f.head);
      const status = await f.request('status');
      assert.equal(status.standingAuthorizations[0].allowed, false);
      assert.match(status.standingAuthorizations[0].reason, /remote identity changed/);
      await assert.rejects(f.request('authorization.apply', { grant: grant.event.hash }, `redirect-${index}`), /remote identity changed/);
    } finally {
      await git(f.repo, ['config', '--unset-all', edit.key]);
      if (edit.remove) await git(f.repo, ['config', edit.remove, raw]);
    }
  }
  assert.equal((await f.request('authorization.apply', { grant: grant.event.hash }, 'restored-remote')).event.type, 'DECIDED');
});
