import './helpers/private-scratch.js';
import { selection, pairExistingEvaluator } from './helpers/paired-review-fixture.js';
import assert from 'node:assert/strict';
import { isolatedTests } from './helpers/isolated-tests.js';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CurrentCore } from '../../plugin-src/shared/resources/protocol/current/core.js';
import { GATES } from '../../plugin-src/shared/resources/protocol/current/contracts.js';
import { git } from '../../plugin-src/shared/resources/protocol/current/evidence.js';
import { verificationProvenance } from '../../plugin-src/shared/resources/protocol/current/execution.js';
import { waitForHostedChecks } from '../../plugin-src/shared/resources/protocol/current/actions.js';
import { sha256Digest } from '../../plugin-src/shared/resources/protocol/agent-workflow.js';

const test = isolatedTests(import.meta.url);
const human = { kind: 'human-confirmed', instruction: 'Light for this one; the brief looks right.', context: 'test user conversation' };
const BRIEF = '# Brief\n\n## Goal\nExport the constant answer.\n\n## Scope\napp/app.js only.\n\n## Findings log\n- none yet\n';
const SPEC = '# Spec\n\n## Acceptance Criteria\n\n- **AC1.** Export the constant answer with value 42.\n\n## Rubric\n\n| # | Criterion | Pass | Fail | Evidence |\n|---|---|---|---|---|\n| R1 | AC1 | 42 | other | test |\n\n## Changes\n';
const reviewConfig = { provider: 'codex', model: 'fixture' };
const required = at => GATES.filter(item => item.at === at && !item.supplemental && !item.optional).map(item => item.id).sort();

async function writeFullDocuments(home) {
  await writeFile(join(home, 'interview.md'), '# Interview\nSettled decisions.\n');
  await writeFile(join(home, 'design.md'), '# Design\n\n**Status:** approved\n');
  await writeFile(join(home, 'spec.md'), SPEC);
  await writeFile(join(home, 'plan.md'), '# Plan\n## P1 - Implement R1\n');
  await writeFile(join(home, 'issues.md'), '# Issues\n## I-1 - Implement\n**Status:** in-review\n**Plan steps:** P1\n**Rubric criteria:** R1\n');
  await writeFile(join(home, 'tracker.md'), '# Tracker\n## Rubric Status\n| R1 | AC1 | NOT YET | pending |\n## Review Log\n');
  await writeFile(join(home, 'scratchpad.md'), '# No pending decisions\n');
  await writeFile(join(home, 'decisions.md'), '# Decisions\nNo changes.\n');
}
async function fixture(t, { rigor = 'light' } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gatereeve-light-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'app'), home = join(root, 'docs/issues/feature');
  await mkdir(repo, { recursive: true }); await mkdir(home, { recursive: true });
  await mkdir(join(root, '.pattern-review')); await writeFile(join(root, '.pattern-review/rules.yaml'), '[]\n');
  await git(repo, ['init', '-b', 'topic']);
  await git(repo, ['config', 'user.email', 'fixture@example.test']);
  await git(repo, ['config', 'user.name', 'Fixture']);
  await git(repo, ['config', 'commit.gpgsign', 'false']);
  await writeFile(join(repo, 'app.js'), 'export const answer = 42;\n');
  await git(repo, ['add', 'app.js']); await git(repo, ['commit', '-m', 'fixture']);
  const head = (await git(repo, ['rev-parse', 'HEAD'])).trim();
  if (rigor === 'light') await writeFile(join(home, 'brief.md'), BRIEF);
  else await writeFullDocuments(home);
  const context = { featureId: 'feature', featureHome: home, workspaceRoot: root, repositories: [{ alias: 'app', path: repo, featureBaseSha: head }] };
  const core = await CurrentCore.at(context);
  const request = (operation, input = {}, operationId) => core.execute({ operation, input, operationId });
  await request('run.start', { runId: 'run-one', implementers: ['implementer-one'],
    ...(rigor === 'light' ? { rigor: { value: 'light', authority: human, reason: 'Small slice' } } : {}) }, 'start-one');
  return { root, repo, home, head, context, core, request };
}
async function authorizeBrief(f, operationId = 'authorize-brief') {
  const { subject } = await f.core.commitments();
  return f.request('human.decide', { kind: 'authorize-implementation', subject, authority: human, reason: 'Confirmed brief', consequences: 'May implement' }, operationId);
}
async function authorizeFull(f, suffix = '') {
  const design = await f.core.store.capture('design.md');
  await f.request('human.decide', { kind: 'approve-design', subject: design.hash, authority: human, reason: 'Approved design', consequences: 'Proceed to spec' }, `design${suffix}`);
  await f.request('spec.validate', {}, `spec${suffix}`);
  const { subject } = await f.core.commitments();
  await f.request('human.decide', { kind: 'authorize-implementation', subject, authority: human, reason: 'Approved scope', consequences: 'May implement' }, `plan${suffix}`);
}
const prepare = (f, criteria = ['brief'], scope = 'FEATURE', operationId = 'candidate-one') =>
  f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.head, head: f.head }], scope, criteria }, operationId);
function verify(f, { validation = { kind: 'alternative', reason: 'Repository has no hosted CI', scope: 'The brief goal' }, operationId = 'verify-one' } = {}) {
  return f.request('gate.execute', { gates: ['verification'], configuration: { validation,
    checks: [{ repository: 'app', command: process.execPath, args: ['-e', 'process.exit(0)'], purpose: 'Fixture verification' }] } }, operationId);
}
function evaluator(f, { outcome = 'PASS', findings = [], criteria = null, contextId = 'reviewer-fresh', inspect = null } = {}) {
  let launches = 0;
  f.core.runtime.evaluator = {
    async describe() { return { provider: 'codex', model: 'fixture', reasoningEffort: 'high' }; },
    async runStage(request) {
      launches++;
      if (inspect) await inspect(request);
      const output = { verdicts: request.input.gates.map(id => ({ gate: id, outcome,
        ...(id === 'review' ? { dimensions: ['code', 'requirements', 'evidence', 'scope', 'findings'].map(name => ({ name, outcome, evidence: 'Fixture source and receipts' })) } : {}),
        summary: 'Fixture assessment', criteria: criteria ?? request.input.criteria.map(row => ({ id: row, outcome, evidence: 'Brief goal met by app/app.js' })),
        coverage: { complete: true, paths: ['app/app.js'], interactions: ['app/app.js'], limitations: [] }, findings, dispositions: [], historyAssessment: null })) };
      return { schemaVersion: 1, protocolVersion: request.protocolVersion, stageId: request.stage.id, status: 'completed', output, receipt: { schemaVersion: 1, kind: 'gatereeve-agent-workflow-receipt',
        protocolVersion: request.protocolVersion, module: request.module, stage: request.stage.id, capabilityProfile: request.capabilityProfile, startedAt: '2026-11-16T00:00:00Z', completedAt: '2026-11-16T00:00:01Z',
        status: 'completed', runId: request.runId, attemptId: request.attemptId, isolation: { method: 'test-isolated', freshContext: true, inheritedTurns: 0 },
        provider: { id: 'codex', adapterVersion: '1.0.0', reasoningEffort: 'high', model: 'fixture', contextId },
        digests: { input: sha256Digest(request.input), instructions: sha256Digest(request.instructions), output: sha256Digest(output), snapshot: request.snapshotDigest },
        policy: { repositoryAccess: 'read-only', networkAccess: 'deny', scratch: 'isolated' } } };
    },
  };
  return () => launches;
}
async function review(f, operationId = 'review-one', { revision = null, ...options } = {}) {
  const count = evaluator(f, options);
  const ran = await f.request('gate.execute', { gates: ['review'], configuration: { ...reviewConfig, ...(revision ? { reviewRevision: revision } : {}) } }, operationId);
  return { ref: ran.event.payload.results[0], result: await f.core.store.json(ran.event.payload.results[0]), count };
}
async function gatesToAcceptance(f) {
  await f.request('candidate.ready', {}, 'ready');
  const refs = [...(await verify(f)).event.payload.results];
  evaluator(f); pairExistingEvaluator(f); await f.request('review.select', selection(), 'select');
  refs.push(...(await f.request('review.execute', {}, 'review-pair')).event.payload.outcomes.flatMap(row => row.results));
  refs.push(...(await f.request('gate.execute', { gates: ['context'] }, 'gate-context')).event.payload.results);
  await f.request('gate.execute', { gates: ['packet'], consumed: refs }, 'gate-packet');
  return refs;
}

test('a light run reaches implementation with only brief.md and a human authorization', async t => {
  const f = await fixture(t);
  assert.deepEqual((await readdir(f.home)).filter(name => name.endsWith('.md')), ['brief.md']);
  const before = await f.request('milestone.check', { name: 'implementation' });
  assert.equal(before.allowed, false);
  assert.deepEqual(before.missing, ['current implementation authorization']);
  const commitments = await f.core.commitments();
  assert.deepEqual(Object.keys(commitments.docs), ['brief.md']);
  await assert.rejects(f.request('human.decide', { kind: 'authorize-implementation', subject: `sha256:${'0'.repeat(64)}`, authority: human, reason: 'x', consequences: 'y' }, 'wrong'), /current brief/);
  await authorizeBrief(f);
  const status = await f.request('status');
  assert.equal(status.phase, 'IMPLEMENTING');
  assert.equal(status.commitments.subject, commitments.subject);
  const decision = status.decisions.find(item => item.kind === 'authorize-implementation');
  assert.equal(decision.documents['brief.md'].hash, commitments.docs['brief.md'].hash);
  assert.equal(decision.authority.kind, 'human-confirmed');
  const check = await f.request('milestone.check', { name: 'implementation' });
  assert.equal(check.allowed, true, check.missing.join('; '));
  assert.equal((await f.request('milestone.pass', { name: 'implementation' }, 'implementation')).event.type, 'MILESTONE');
  // A light brief has nothing to amend; the brief is re-authorized instead.
  await assert.rejects(f.request('human.decide', { kind: 'amend', subject: commitments.subject, previousSubject: commitments.subject, authority: human, reason: 'x', consequences: 'y' }, 'amend'), /no design or specification to amend/);
});

test('a brief without goal, scope and findings log cannot be authorized', async t => {
  const f = await fixture(t);
  await writeFile(join(f.home, 'brief.md'), '# Brief\n\n## Goal\nExport the constant answer.\n');
  await assert.rejects(authorizeBrief(f), /needs a scope section/);
  assert.equal((await f.request('status')).phase, 'DESIGNING');
});

test('a changed brief invalidates implementation authority until it is re-authorized', async t => {
  const f = await fixture(t); await authorizeBrief(f); await prepare(f);
  // A scope change; findings-log growth alone keeps authority (current-waivers.test.js).
  const scoped = BRIEF.replace('app.js only.', 'app.js and the exported helper.');
  await writeFile(join(f.home, 'brief.md'), scoped);
  const check = await f.request('milestone.check', { name: 'implementation' });
  assert.equal(check.allowed, false);
  assert.match(check.missing.join('; '), /current implementation authorization/);
  await assert.rejects(prepare(f, ['brief'], 'FEATURE', 'stale-candidate'), /implementation authority/);
  await assert.rejects(f.request('gate.execute', { gates: ['context'] }, 'stale-gate'), /implementation authorization/);
  // Restoring the authorized bytes restores the binding; new bytes need a new decision.
  await writeFile(join(f.home, 'brief.md'), BRIEF);
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, true);
  await writeFile(join(f.home, 'brief.md'), scoped);
  await authorizeBrief(f, 'reauthorize');
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, true);
  const acceptance = await f.request('milestone.check', { name: 'acceptance' });
  assert.match(acceptance.missing.join('; '), /Canonical input changed: brief.md/);
});

test('a light candidate uses the single brief criterion and captures only the brief', async t => {
  const f = await fixture(t); await authorizeBrief(f);
  for (const criteria of [['R1'], ['brief', 'R1'], ['goal']]) await assert.rejects(prepare(f, criteria, 'SLICE', `bad-${criteria.join('-')}`), /exactly \["brief"\]/);
  await prepare(f, ['brief'], 'SLICE', 'slice');
  let candidate = await f.core.store.json((await f.request('status')).candidate);
  assert.deepEqual(candidate.criteria, ['brief']); assert.equal(candidate.scope, 'SLICE');
  assert.deepEqual(Object.keys(candidate.requirements), ['brief.md']);
  assert.equal((await f.core.store.get(candidate.requirements['brief.md'])).toString(), BRIEF);
  await prepare(f, ['brief'], 'FEATURE', 'feature');
  candidate = await f.core.store.json((await f.request('status')).candidate);
  assert.equal(candidate.scope, 'FEATURE');
});

test('light acceptance requires exactly the full required gate set', async t => {
  const light = await fixture(t), full = await fixture(t, { rigor: 'full' });
  await authorizeBrief(light); await prepare(light);
  await authorizeFull(full); await prepare(full, ['R1']);
  const requiredOutcomes = async f => (await f.request('milestone.check', { name: 'acceptance' })).outcomes.filter(item => item.required).map(item => item.id).sort();
  assert.deepEqual(await requiredOutcomes(light), required('acceptance'));
  assert.deepEqual(await requiredOutcomes(light), await requiredOutcomes(full));
  assert.deepEqual(required('acceptance'), ['context', 'packet', 'review', 'verification']);
  const completion = async f => (await f.request('milestone.check', { name: 'completion' })).outcomes.filter(item => item.required).map(item => item.id).sort();
  assert.deepEqual(await completion(light), await completion(full));
  assert.ok((await completion(light)).includes('retention'));
  const blocked = await light.request('milestone.check', { name: 'acceptance' });
  for (const gate of ['review', 'verification']) assert.match(blocked.missing.join('; '), new RegExp(`${gate}:`));
  await gatesToAcceptance(light);
  const allowed = await light.request('milestone.check', { name: 'acceptance' });
  assert.equal(allowed.allowed, true, allowed.missing.join('; '));
  assert.equal((await light.request('milestone.pass', { name: 'acceptance' }, 'acceptance')).event.type, 'MILESTONE');
  const subject = (await light.request('status')).candidate.hash;
  await light.request('human.decide', { kind: 'accept', subject, authority: human, reason: 'Reviewed exact candidate', consequences: 'Accepted' }, 'accept');
  assert.equal((await light.request('status')).phase, 'ACCEPTING');
});

test('light review assesses the brief through an independent fresh evaluator', async t => {
  const f = await fixture(t); await authorizeBrief(f); await prepare(f); await verify(f);
  let seen = null;
  const { result, count } = await review(f, 'review-one', { inspect: async request => {
    seen = { input: request.input, instructions: request.instructions,
      requirements: (await readdir(join(request.repositoryPath, 'requirements'))).sort(),
      brief: await readFile(join(request.repositoryPath, 'requirements/brief.md'), 'utf8') };
  } });
  assert.equal(count(), 1);
  assert.equal(result.outcome, 'PASS', result.summary);
  assert.deepEqual(seen.requirements, ['brief.md']); assert.equal(seen.brief, BRIEF);
  assert.deepEqual(seen.input.criteria, ['brief']);
  assert.equal(seen.input.planning.basis, 'brief'); assert.equal(seen.input.planning.brief, 'requirements/brief.md');
  assert.match(seen.instructions, /light-rigor run/); assert.match(seen.instructions, /goal within its stated scope/);
  assert.deepEqual(result.criteria.map(row => row.id), ['brief']);
  const receipt = await f.core.store.json(result.receipt);
  assert.equal(receipt.evaluator.freshContext, true); assert.equal(receipt.evaluator.inheritedTurns, 0);
  assert.equal(receipt.evaluator.contextId, 'reviewer-fresh');
  // Same evaluator qualification as full: an implementing context never qualifies.
  const inherited = await review(f, 'review-implementer', { contextId: 'implementer-one', revision: 2 });
  assert.equal(inherited.result.outcome, 'UNAVAILABLE');
  assert.match(inherited.result.summary, /implementing context/);
});

test('light review rejects rubric criteria and accepts brief findings', async t => {
  const f = await fixture(t); await authorizeBrief(f); await prepare(f); await verify(f);
  const scored = await review(f, 'rubric-row', { criteria: [{ id: 'R1', outcome: 'PASS', evidence: 'Rubric row' }] });
  assert.equal(scored.result.outcome, 'UNAVAILABLE'); assert.match(scored.result.summary, /every selected criterion/);
  const rubricFinding = await review(f, 'rubric-finding', { outcome: 'FAIL', findings: [{ id: 'f-1', classId: 'scope', classStatement: 'Fixture defect class', severity: 'high', failureScenario: 'Fixture input -> wrong observable output', criterion: 'R1', path: 'app/app.js', evidence: 'Out of scope', blocking: true }] });
  assert.equal(rubricFinding.result.outcome, 'UNAVAILABLE'); assert.match(rubricFinding.result.summary, /approved criterion/);
  const specPath = await review(f, 'spec-path', { outcome: 'FAIL', findings: [{ id: 'f-2', classId: 'scope', classStatement: 'Fixture defect class', severity: 'high', failureScenario: 'Fixture input -> wrong observable output', criterion: 'brief', path: 'requirements/spec.md', evidence: 'No spec', blocking: true }] });
  assert.equal(specPath.result.outcome, 'UNAVAILABLE'); assert.match(specPath.result.summary, /source in scope/);
  const briefFinding = await review(f, 'brief-finding', { outcome: 'FAIL', findings: [{ id: 'f-3', classId: 'scope', classStatement: 'Fixture defect class', severity: 'high', failureScenario: 'Fixture input -> wrong observable output', criterion: 'brief', path: 'requirements/brief.md', evidence: 'Goal is ambiguous', blocking: true }] });
  assert.equal(briefFinding.result.outcome, 'FAIL', briefFinding.result.summary);
  const codeFinding = await review(f, 'code-finding', { outcome: 'FAIL', findings: [{ id: 'f-4', classId: 'bug', classStatement: 'Fixture defect class', severity: 'high', failureScenario: 'Fixture input -> wrong observable output', criterion: 'gate:review', path: 'app/app.js', evidence: 'Defect', blocking: true }] });
  assert.equal(codeFinding.result.outcome, 'FAIL', codeFinding.result.summary);
});

test('spec, judge, reconcile and triage are refused in a light run; code remains available', async t => {
  const f = await fixture(t); await authorizeBrief(f); await prepare(f); await verify(f);
  const launches = evaluator(f);
  for (const gate of ['spec', 'judge', 'reconcile', 'triage']) {
    await assert.rejects(f.request('gate.execute', { gates: [gate], configuration: reviewConfig }, `refused-${gate}`), /need a specification rubric or planning record; a light run/);
  }
  await assert.rejects(f.request('gate.execute', { gates: ['review', 'spec'], configuration: reviewConfig }, 'refused-pair'), /light run/);
  assert.equal(launches(), 0);
  const code = await f.request('gate.execute', { gates: ['code'], configuration: reviewConfig }, 'code');
  assert.equal((await f.core.store.json(code.event.payload.results[0])).outcome, 'PASS');
});

test('raising rigor requires full commitments before implementation and acceptance', async t => {
  const f = await fixture(t); await authorizeBrief(f); await prepare(f); await gatesToAcceptance(f);
  assert.equal((await f.request('milestone.check', { name: 'acceptance' })).allowed, true);
  await f.request('run.set-dial', { dial: 'rigor', value: 'full', actor: 'agent', reason: 'Touches a migration' }, 'raise');
  let status = await f.request('status');
  assert.equal(status.dials.rigor.value, 'full'); assert.equal(status.phase, 'DESIGNING'); assert.equal(status.ready, false);
  const implementation = await f.request('milestone.check', { name: 'implementation' });
  assert.equal(implementation.allowed, false);
  const acceptance = await f.request('milestone.check', { name: 'acceptance' });
  assert.equal(acceptance.allowed, false);
  await assert.rejects(f.request('milestone.pass', { name: 'acceptance' }, 'raised-acceptance'), /blocked/);
  await assert.rejects(f.request('gate.execute', { gates: ['context'] }, 'raised-gate'), /authorized phase|implementation authorization/);
  // Full documents are backfilled; the brief-bound authority does not carry over.
  await writeFullDocuments(f.home);
  let check = await f.request('milestone.check', { name: 'implementation' });
  assert.match(check.missing.join('; '), /current implementation authorization/);
  assert.match(check.missing.join('; '), /current specification validation/);
  const { subject } = await f.core.commitments();
  await assert.rejects(f.request('human.decide', { kind: 'authorize-implementation', subject, authority: human, reason: 'x', consequences: 'y' }, 'too-early'), /Validate specification/);
  await authorizeFull(f, '-full');
  check = await f.request('milestone.check', { name: 'implementation' });
  assert.equal(check.allowed, true, check.missing.join('; '));
  // The light candidate and its evidence no longer qualify.
  assert.match((await f.request('milestone.check', { name: 'acceptance' })).missing.join('; '), /Candidate commitments differ/);
  await assert.rejects(prepare(f, ['brief'], 'FEATURE', 'brief-after-raise'), /not in approved spec/);
  await prepare(f, ['R1'], 'FEATURE', 'full-candidate');
  status = await f.request('status');
  const candidate = await f.core.store.json(status.candidate);
  assert.deepEqual(Object.keys(candidate.requirements).sort(), ['design.md', 'spec.md']);
  const blocked = await f.request('milestone.check', { name: 'acceptance' });
  for (const gate of ['review', 'verification']) assert.match(blocked.missing.join('; '), new RegExp(`${gate}:`));
  // Rubric gates become available again at full rigor.
  await verify(f, { operationId: 'verify-full' });
  evaluator(f);
  const spec = await f.request('gate.execute', { gates: ['spec'], configuration: reviewConfig }, 'spec-gate-full');
  assert.equal((await f.core.store.json(spec.event.payload.results[0])).outcome, 'PASS');
});

test('verification records agent-run provenance with receipts and no CI checks', async t => {
  const f = await fixture(t); await authorizeBrief(f); await prepare(f);
  const ran = await verify(f);
  const result = await f.core.store.json(ran.event.payload.results[0]);
  assert.equal(result.outcome, 'PASS');
  const { provenance } = result;
  assert.equal(provenance.agentRun.length, 1);
  assert.deepEqual({ repository: provenance.agentRun[0].repository, command: provenance.agentRun[0].command, outcome: provenance.agentRun[0].outcome },
    { repository: 'app', command: process.execPath, outcome: 'PASS' });
  const runner = await f.core.store.json(result.runner);
  assert.equal(provenance.agentRun[0].receipt.stdout.hash, runner.receipts[0].stdout.hash);
  assert.deepEqual(runner.provenance, provenance);
  assert.deepEqual(provenance.hostedCi, []);
  assert.match(provenance.summary, /agent-run: 1 command with receipts \(1 passed\)/);
  assert.match(provenance.summary, /no CI checks/); assert.doesNotMatch(provenance.summary, /hosted CI on exact head/);
  assert.match(result.summary, /no CI checks/);
  await f.request('candidate.ready', {}, 'ready');
  const outcome = (await f.request('milestone.check', { name: 'acceptance' })).outcomes.find(item => item.id === 'verification');
  assert.deepEqual(outcome.provenance, provenance);
  assert.match(outcome.reason, /no CI checks/);
});

test('verification records hosted CI on the exact head and never presents an empty CI run as passing', async t => {
  const f = await fixture(t); await authorizeBrief(f); await prepare(f);
  const calls = [];
  const job = (id, name, conclusion) => ({ id, name, status: 'completed', conclusion, started_at: '2026-11-16T00:00:00Z', completed_at: '2026-11-16T00:01:00Z', html_url: `https://github.com/fixture/app/actions/runs/7/job/${id}` });
  const jobs = [job(1, 'test', 'success'), job(2, 'deploy', 'skipped')];
  f.core.runtime.fetchValidationRun = async (repository, run, attempt) => { calls.push([repository, run, attempt]); return { head_sha: f.head, status: 'completed', jobs: run === 9 ? [] : jobs }; };
  const ci = run => ({ kind: 'ci', runs: [{ alias: 'app', repository: 'fixture/app', run, attempt: 1, requiredChecks: ['test'] }] });
  const observed = await f.core.store.json((await verify(f, { validation: ci(7), operationId: 'verify-ci' })).event.payload.results[0]);
  assert.equal(observed.outcome, 'PASS', observed.summary);
  assert.deepEqual(observed.provenance.hostedCi, [{ alias: 'app', repository: 'fixture/app', run: '7', attempt: '1', head: f.head,
    jobs: [{ name: 'test', status: 'completed', conclusion: 'success' }, { name: 'deploy', status: 'completed', conclusion: 'skipped' }] }]);
  assert.match(observed.provenance.summary, new RegExp(`hosted CI on exact head: fixture/app run 7 attempt 1 at ${f.head}, 2 jobs \\(1 success, 1 skipped\\)`));
  assert.equal(observed.provenance.agentRun.length, 1);
  const empty = await f.core.store.json((await verify(f, { validation: ci(9), operationId: 'verify-empty-ci' })).event.payload.results[0]);
  assert.equal(empty.outcome, 'UNAVAILABLE');
  assert.match(empty.summary, /reported no CI checks/);
  assert.deepEqual(empty.provenance.hostedCi, []);
  assert.match(empty.provenance.summary, /no CI checks/); assert.doesNotMatch(empty.provenance.summary, /hosted CI on exact head/);
  assert.deepEqual(calls.map(call => call[1]), [7, 9]);
  // Defensive: any CI record without jobs is described as no CI checks.
  const none = verificationProvenance([], { kind: 'ci', runs: [{ alias: 'app', repository: 'fixture/app', run: '9', attempt: '1', head: f.head, jobs: [] }] });
  assert.equal(none.none, true); assert.equal(none.summary, 'agent-run: none; no CI checks');
});

test('hosted merge checks report an absent check set as no CI checks', async t => {
  const action = { number: 12, ownerRepo: 'fixture/project', headBranch: 'topic', head: 'a'.repeat(40) };
  const empty = required => Object.assign(new Error('gh checks failed'), { code: 1, stdout: '', stderr: `no ${required ? 'required ' : ''}checks reported on the 'topic' branch\n` });
  const none = await waitForHostedChecks('/repository', action, async (root, args) => { throw empty(args.includes('--required')); });
  assert.equal(none.checks, 'none'); assert.equal(none.head, action.head);
  assert.match(none.summary, /^no CI checks/); assert.match(none.summary, /not passing CI/);
  const reported = await waitForHostedChecks('/repository', action, async (root, args) => { if (args.includes('--required')) throw empty(true); return 'ok'; });
  assert.equal(reported.checks, 'reported'); assert.doesNotMatch(reported.summary, /no CI checks/);
  assert.equal((await waitForHostedChecks('/repository', action, async () => 'ok')).checks, 'required');
  // A caller cannot assert a hosted check observation outside the protected merge.
  const f = await fixture(t); await authorizeBrief(f); await prepare(f);
  await assert.rejects(f.request('integration.observe', { repository: 'app', hostedChecks: { checks: 'required' } }, 'forged'), /only from the protected merge/);
});
