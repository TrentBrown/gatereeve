import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, readdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CurrentStore } from '../../plugin-src/shared/resources/protocol/current/store.js';
import { CurrentCore } from '../../plugin-src/shared/resources/protocol/current/core.js';
import { identity } from '../../plugin-src/shared/resources/protocol/current/contracts.js';
import { git } from '../../plugin-src/shared/resources/protocol/current/evidence.js';

const human = { kind: 'human-confirmed', instruction: 'Approve the named scope.', context: 'test user conversation' };
async function fixture(t, { nested = true } = {}) {
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
  await writeFile(join(home, 'events.jsonl'), 'old journal preserved verbatim\n');
  const context = { featureId: 'feature', featureHome: home, workspaceRoot: root, repositories: [{ alias: 'app', path: repo, featureBaseSha: head }] };
  const core = await CurrentCore.at(context);
  const request = (operation, input = {}, operationId) => core.execute({ operation, input, operationId });
  await request('run.start', { runId: 'run-one', implementers: ['implementer-one'] }, 'start-one');
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
  await f.request('run.resume-current', { runId: 'run-one', implementers: ['implementer-one'] }, 'resume-one')
    .then(() => assert.fail('different startup request cannot reuse run'))
    .catch(error => assert.match(error.message, /Concurrent/));
  await f.request('run.start', { runId: 'run-one', implementers: ['implementer-one'] }, 'start-one');
  assert.equal((await f.request('status')).runId, 'run-one');
  assert.equal((await f.core.store.events('run-one')).length, 1);
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
  await assert.rejects(f.request('status'), /integrity/);
});

async function runVerification(f, fail = false, operationId = 'verify-one') {
  return f.request('gate.execute', { gates: ['verification'], configuration: {
    checks: [{ repository: 'app', command: process.execPath, args: ['-e', `process.exit(${fail ? 1 : 0})`], purpose: 'Fixture verification' }],
  } }, operationId);
}
function fakeEvaluator(f, { malformed = false, inherited = false, blocking = false, dispositions = [], historyAssessment = null } = {}) {
  let launches = 0;
  f.core.runtime.evaluator = {
    async describe() { return { provider: 'codex', model: 'fixture' }; },
    async runStage(request) {
      launches++;
      const output = { verdicts: request.input.gates.map(id => ({ gate: id, outcome: blocking ? 'FAIL' : 'PASS',
        summary: 'Fixture assessment', criteria: request.input.criteria.map(id => ({ id, outcome: blocking ? 'FAIL' : 'PASS', evidence: 'Fixture source and command receipt' })), coverage: { complete: true, paths: request.input.changedPaths ?? ['app/app.js'], interactions: ['app/app.js'], limitations: [] },
        findings: blocking ? [{ id: 'finding-1', classId: 'class-1', criterion: 'R1', path: 'app/app.js', evidence: 'Current defect', blocking: true }] : [], dispositions, historyAssessment })) };
      if (malformed) output.verdicts.pop();
      const { sha256Digest } = await import('../../plugin-src/shared/resources/protocol/agent-workflow.js');
      return { output, receipt: { status: 'completed', runId: request.runId, attemptId: request.attemptId,
        isolation: { freshContext: true, inheritedTurns: inherited ? 1 : 0 },
        provider: { id: 'codex', model: 'fixture', contextId: 'reviewer-fresh' },
        digests: { input: sha256Digest(request.input), instructions: sha256Digest(request.instructions), output: sha256Digest(output), snapshot: request.snapshotDigest },
        policy: { repositoryAccess: 'read-only', networkAccess: 'deny' } } };
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

test('deterministic triage proof becomes stale when its supporting document changes', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  await writeFile(join(f.home, 'scratchpad.md'), '# Decisions\n\n[-] **Promote**\n');
  const ran = await f.request('gate.execute', { gates: ['triage'] }, 'triage-one');
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


async function reviewAll(f) {
  await writeFile(join(f.home, 'scratchpad.md'), '# No pending decisions\n');
  await f.request('candidate.ready', {}, 'ready');
  const verification = await runVerification(f);
  fakeEvaluator(f);
  const refs = [...verification.event.payload.results];
  for (const gate of ['context', 'reconcile', 'triage', 'code', 'spec', 'judge', 'pattern', 'explanation']) {
    const result = await f.request('gate.execute', { gates: [gate], consumed: ['spec', 'judge'].includes(gate) ? verification.event.payload.results : [],
      configuration: ['code', 'spec', 'judge', 'pattern', 'explanation'].includes(gate) ? { provider: 'codex', model: 'fixture' } : {} }, `gate-${gate}`);
    refs.push(...result.event.payload.results);
  }
  await f.request('gate.execute', { gates: ['packet'], consumed: refs }, 'packet');
  assert.equal((await f.request('milestone.check', { name: 'acceptance' })).allowed, true);
  await f.request('milestone.pass', { name: 'acceptance' }, 'acceptance');
  const subject = (await f.request('status')).candidate.hash;
  await f.request('human.decide', { kind: 'accept', subject, authority: human, reason: 'Reviewed exact candidate', consequences: 'Accepted for the next authorized action' }, 'accept');
  return refs;
}

test('all gates, actual external integration and completion work without evidence commits', async t => {
  const f = await fixture(t);
  const bare = join(f.root, 'remote.git');
  await git(f.root, ['init', '--bare', bare]);
  await git(f.repo, ['remote', 'add', 'origin', bare]);
  await git(f.repo, ['push', 'origin', 'HEAD:refs/heads/main']);
  Object.assign(f.context.repositories[0], { integrationBranch: 'main', remote: 'origin' });
  await authorize(f); await candidate(f); await reviewAll(f);
  assert.equal((await f.request('milestone.check', { name: 'merge' })).allowed, false);
  await f.request('integration.observe', { repository: 'app' }, 'observe');
  await f.request('gate.execute', { gates: ['finalization'], configuration: { checks: [{ repository: 'app', command: process.execPath, args: ['-e', 'process.exit(0)'], purpose: 'Fixture post-integration verification' }] } }, 'finalize');
  // Provider transport is fixture-injected; the retained conductor observer has
  // separate origin/chain/ancestry tests against its real validation mechanics.
  f.core.runtime.observeRelease = async request => ({ observedInputFingerprint: request.input.inputFingerprint,
    outcome: 'PASS', evidence: { featureMergeInputSha: request.input.evidence.mergeInputSha,
      retainedDiscovery: { latest: { stage: 'COMPLETE' } } } });
  await f.request('gate.execute', { gates: ['release'] }, 'release');
  const retained = await f.request('gate.execute', { gates: ['retention'] }, 'retain');
  const retainedProof = await f.core.store.json(retained.event.payload.results[0]);
  assert.deepEqual(retainedProof.completion.map(item => item.gate).sort(), ['finalization', 'release']);
  for (const entry of retainedProof.completion) assert.equal((await f.core.store.json(entry.reference)).gate, entry.gate);
  const check = await f.request('milestone.check', { name: 'completion' });
  assert.equal(check.allowed, true, check.missing.join('; '));
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
  const result = await f.request('gate.execute', { gates: ['verification'], configuration: { checks: [{ repository: 'app', command: process.execPath, args: ['-e', "require('fs').writeFileSync('app.js', 'changed')"], purpose: 'Mutation regression' }] } }, 'mutating-runner');
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

for (const drift of [false, true, 'target-after-checks', 'advanced-target']) test(`protected merge ${drift === 'advanced-target' ? 'merges a reviewed cumulative feature onto its separately assessed advanced target' : drift ? `recloses a drifted PR (${drift}) without merging` : 'revalidates the exact action and observes integration'}`, async t => {
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
  Object.assign(f.context.repositories[0], { integrationBranch: 'main', releaseBranch: 'main', remote: 'origin', keepPullRequestsClosed: true });
  let state = 'CLOSED';
  const writes = [];
  f.core.runtime.gh = async (root, args) => {
    const action = args[1];
    if (action === 'view') return JSON.stringify({ number: 12, url: 'https://github.com/fixture/project/pull/12', state,
      headRefName: 'topic', baseRefName: drift === 'target-after-checks' && writes.includes('checks') ? 'production' : 'main', headRefOid: drift === true && state === 'OPEN' ? '0'.repeat(40) : head,
      baseRefOid: target, isDraft: true, mergeCommit: state === 'MERGED' ? { oid: head } : null });
    writes.push(action);
    if (action === 'reopen') state = 'OPEN';
    if (action === 'close') state = 'CLOSED';
    if (action === 'merge') {
      assert.equal(args[args.indexOf('--match-head-commit') + 1], head);
      await git(root, ['push', 'origin', 'HEAD:refs/heads/main']); state = 'MERGED';
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
  if (drift && drift !== 'advanced-target') {
    await assert.rejects(f.request('merge.execute', { repository: 'app', number: 12 }, 'merge'), /identity changed/);
    assert.equal(state, 'CLOSED'); assert.deepEqual(writes, drift === true ? ['reopen', 'close'] : ['reopen', 'ready', 'checks', 'close']);
  } else {
    await f.request('merge.execute', { repository: 'app', number: 12 }, 'merge');
    assert.equal(state, 'MERGED'); assert.deepEqual(writes, ['reopen', 'ready', 'checks', 'merge']);
    assert.equal((await f.request('status')).integrations.app.integrationSha, head);
  }
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
    else await writeFile(pointer, JSON.stringify({ contract: 'unsupported/v0', runId: 'run-one' }));
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

test('host environment invalidates runner proof while isolated source review remains applicable', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f); fakeEvaluator(f);
  const ran = await runVerification(f);
  const review = await f.request('gate.execute', { gates: ['code'], configuration: { provider: 'codex', model: 'fixture' } }, 'host-review');
  const key = 'GATEREEVE_TEST_HOST_MODE', previous = process.env[key];
  t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  process.env[key] = 'Electron-host';
  const state = (await f.core.state()).state, selected = await f.core.store.json(state.candidate);
  await assert.rejects(f.core.currentResult(ran.event.payload.results[0], selected, state), /environment changed/);
  assert.equal((await f.core.currentResult(review.event.payload.results[0], selected, state)).outcome, 'PASS');
  const declared = await f.request('gate.execute', { gates: ['verification'], configuration: { environmentKeys: [key], checks: [{ repository: 'app', command: process.execPath, args: ['-e', 'process.exit(0)'], purpose: 'Declared environment' }] } }, 'declared-env');
  process.env[key] = 'changed';
  await assert.rejects(f.core.currentResult(declared.event.payload.results[0], selected, (await f.core.state()).state), /environment changed/);
});

test('a narrower passing check cannot hide earlier failed verification and packets refresh their inventory', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const packet = await f.request('gate.execute', { gates: ['packet'] }, 'empty-packet');
  await runVerification(f, true, 'broad-failure');
  const narrow = await runVerification(f, false, 'narrow-success');
  const state = (await f.core.state()).state, selected = await f.core.store.json(state.candidate);
  await assert.rejects(f.core.currentResult(narrow.event.payload.results[0], selected, state), /uncovered previously declared checks/);
  await assert.rejects(f.core.currentResult(packet.event.payload.results[0], selected, state), /inventory changed/);
  const refresh = await f.request('gate.execute', { gates: ['packet'] }, 'packet-refresh');
  assert.notEqual(refresh.reused, true);
  assert.equal((await f.core.store.json(refresh.event.payload.results[0])).inventory.find(item => item.gate === 'verification').outcome, 'FAIL');
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
  assert.equal(link.entryKind, 'symlink'); assert.equal((await f.core.store.get(link)).toString(), '../secret');
  const gitlink = selected.repositories[0].files.find(item => item.path === 'submodule');
  assert.equal(gitlink.entryKind, 'gitlink'); assert.match((await f.core.store.get(gitlink)).toString(), /Contents are not/);
});

test('reconciliation rejects unknown rubric mappings even when documents are readable', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  await writeFile(join(f.home, 'tracker.md'), '# Tracker\n## Rubric Status\n| R999 | AC1 | NOT YET | pending |\n## Review Log\n');
  const checked = await f.request('gate.execute', { gates: ['reconcile'] }, 'bad-tracker');
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
  const input = { gates: ['verification'], configuration: { checks: [{ repository: 'app', command: process.execPath, args: ['-e', 'console.log(Date.now())'], purpose: 'Actual nonconstant runtime observation' }] } };
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
  const template = await f.core.store.json(seed.event.payload.results[0]);
  for (let i = 0; i < 33; i++) {
    const id = `finding-${i}`;
    for (const report of [
      { ...template, outcome: 'FAIL', findings: [{ id, classId: id, criterion: 'R1', path: 'app/app.js', evidence: 'Prior defect', blocking: true }], dispositions: [] },
      { ...template, findings: [], dispositions: [{ id, status: 'resolved', evidence: 'Independent closure' }] },
    ]) {
      const ref = await f.core.store.putJson(report);
      await f.core.append((await f.core.state()).state, 'RESULT', ref, { id: `seed-${i}-${report.outcome}`, hash: identity(ref) });
    }
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
  assert.equal((await validateLocalRecord(f.home, f.root)).mode, 'documents-only');
  assert.deepEqual(await readFile(join(f.home, 'events.jsonl')), before);
  await assert.rejects(validateLocalRecord(f.repo, f.root), /canonical feature home/);
});

test('retained workflow history stays outside source at every endpoint and supports untracked continuation', async t => {
  const f = await fixture(t, { nested: false });
  const records = {
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
  const data = { 'helper.js': 'export const answer = 42;', 'config.json': '{"command":"run"}', 'unknown.json': '{}', 'invalid.json': '{', 'app.yaml': 'enabled: true' };
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

test('runner reuse binds the entire actual inherited environment without retaining plaintext values', async t => {
  const f = await fixture(t); await authorize(f); await candidate(f);
  const key = 'GATEREEVE_TEST_REUSE_MODE'; const original = process.env[key];
  t.after(() => { if (original === undefined) delete process.env[key]; else process.env[key] = original; });
  process.env[key] = 'pass-private-fixture-value';
  const input = { gates: ['verification'], configuration: { checks: [{ repository: 'app', command: process.execPath,
    args: ['-e', `process.exit(process.env.${key}.startsWith('pass') ? 0 : 1)`], purpose: 'Inherited environment affects outcome' }] } };
  const first = await f.request('gate.execute', input, 'environment-pass');
  const reference = first.event.payload.results[0];
  const result = await f.core.store.json(reference);
  const manifest = await f.core.store.json(result.input);
  assert.equal(result.outcome, 'PASS'); assert.ok(!JSON.stringify(manifest).includes('pass-private-fixture-value'));
  process.env[key] = 'fail-private-fixture-value';
  const { state } = await f.core.state(); const current = await f.core.store.json(state.candidate);
  await assert.rejects(f.core.currentResult(reference, current, state), /environment changed/);
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
  assert.equal(proof.passed, false); assert.ok(proof.stdout.length + proof.stderr.length > 0);
  await f.core.store.closure(failure);
  await writeFile(join(f.home, 'spec.md'), goodSpec); await f.request('spec.validate', {}, 'fixed-spec');
  const current = await f.core.commitments();
  await f.request('human.decide', { kind: 'authorize-implementation', subject: current.subject, authority: human, reason: 'Approved', consequences: 'Implement' }, 'implementation');
  await candidate(f);
  await writeFile(join(f.home, 'issues.md'), '# Broken issues\n');
  const check = await f.request('gate.execute', { gates: ['reconcile'] }, 'failed-reconciliation');
  const result = await f.core.store.json(check.event.payload.results[0]);
  assert.equal(result.outcome, 'FAIL');
  const artifacts = await Promise.all(result.artifacts.map(ref => f.core.store.get(ref)));
  assert.ok(artifacts.some(bytes => { try { return JSON.parse(bytes.toString()).passed === false; } catch { return false; } }));
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
