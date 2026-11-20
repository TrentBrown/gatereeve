// Shared fixture for tripwire and delegation tests (tb-lightweight-mode S5).
// Only GitHub transport and the evaluator are simulated; Git remotes, source
// pins, integration proof and core decisions are real.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { CurrentCore } from '../../../plugin-src/shared/resources/protocol/current/core.js';
import { git } from '../../../plugin-src/shared/resources/protocol/current/evidence.js';
import { sha256Digest } from '../../../plugin-src/shared/resources/protocol/agent-workflow.js';

export const human = { kind: 'human-confirmed', instruction: 'Confirmed.', context: 'test user conversation' };
export const BRIEF = '# Brief\n\n## Goal\nExport the constant answer.\n\n## Scope\napp.js only.\n\n## Findings log\n- none yet\n';
export const SPEC = '# Spec\n\n## Acceptance Criteria\n\n- **AC1.** Export the constant answer with value 42.\n\n## Rubric\n\n| # | Criterion | Pass | Fail | Evidence |\n|---|---|---|---|---|\n| R1 | AC1 | 42 | other | test |\n\n## Changes\n';
export const reviewConfig = { provider: 'codex', model: 'fixture' };
const FULL_DOCUMENTS = { 'interview.md': '# Interview\nSettled.\n', 'design.md': '# Design\n\n**Status:** approved\n', 'spec.md': SPEC,
  'plan.md': '# Plan\n## P1 - Implement R1\n', 'issues.md': '# Issues\n## I-1 - Implement\n**Status:** in-review\n**Plan steps:** P1\n**Rubric criteria:** R1\n',
  'tracker.md': '# Tracker\n## Rubric Status\n| R1 | AC1 | NOT YET | pending |\n## Review Log\n', 'scratchpad.md': '# No pending decisions\n', 'decisions.md': '# Decisions\nNo changes.\n' };
export async function writeFullDocuments(home) {
  for (const [name, body] of Object.entries(FULL_DOCUMENTS)) await writeFile(join(home, name), body);
}

export async function fixture(t, { rigor = 'light', integration = 'feature-int', release = 'main', protection = { [release]: true },
  autonomy = undefined, authorize = true, files = {} } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gatereeve-s5-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'app'), home = join(root, 'docs/issues/feature');
  await mkdir(repo, { recursive: true }); await mkdir(home, { recursive: true });
  await mkdir(join(root, '.pattern-review')); await writeFile(join(root, '.pattern-review/rules.yaml'), '[]\n');
  await git(repo, ['init', '-b', 'topic']);
  await git(repo, ['config', 'user.email', 'fixture@example.test']);
  await git(repo, ['config', 'user.name', 'Fixture']);
  await git(repo, ['config', 'commit.gpgsign', 'false']);
  await writeFile(join(repo, 'app.js'), 'export const answer = 41;\n');
  for (const [path, body] of Object.entries(files)) { await mkdir(dirname(join(repo, path)), { recursive: true }); await writeFile(join(repo, path), body); }
  await git(repo, ['add', '-A']); await git(repo, ['commit', '-m', 'fixture']);
  const base = (await git(repo, ['rev-parse', 'HEAD'])).trim();
  const bare = join(root, 'host.git');
  await git(root, ['init', '--bare', bare]);
  await git(repo, ['remote', 'add', 'origin', 'https://github.com/fixture/project.git']);
  await git(repo, ['config', `url.${bare}.insteadOf`, 'https://github.com/fixture/project.git']);
  for (const branch of new Set([integration, release])) await git(repo, ['push', 'origin', `HEAD:refs/heads/${branch}`]);
  if (rigor === 'light') await writeFile(join(home, 'brief.md'), BRIEF);
  else await writeFullDocuments(home);
  const context = { featureId: 'feature', featureHome: home, workspaceRoot: root,
    repositories: [{ alias: 'app', path: repo, remote: 'origin', featureBaseSha: base, integrationBranch: integration, releaseBranch: release }] };
  const core = await CurrentCore.at(context);
  const request = (operation, input = {}, operationId) => core.execute({ operation, input, operationId });
  const f = { root, repo, home, base, context, core, request, rigor, integration, release, criteria: rigor === 'light' ? ['brief'] : ['R1'] };
  f.gh = github(f, protection);
  await request('run.start', { runId: 'run-one', implementers: ['implementer-one'],
    ...(rigor === 'light' ? { rigor: { value: 'light', authority: { ...human, instruction: 'Light for this one.' }, reason: 'Small change' } } : {}),
    ...(autonomy ? { autonomy } : {}) }, 'start');
  if (authorize && rigor === 'light') await authorizeBrief(f);
  else if (authorize) await authorizeFull(f);
  return f;
}
export async function authorizeBrief(f, operationId = 'authorize') {
  return f.request('human.decide', { kind: 'authorize-implementation', subject: (await f.core.commitments()).subject,
    authority: { ...human, instruction: 'The brief looks right.' }, reason: 'Confirmed brief', consequences: 'May implement' }, operationId);
}
export async function authorizeFull(f) {
  const design = await f.core.store.capture('design.md');
  await f.request('human.decide', { kind: 'approve-design', subject: design.hash, authority: { ...human, instruction: 'Design approved.' }, reason: 'Approved', consequences: 'Spec' }, 'design');
  await f.request('spec.validate', {}, 'spec');
  await f.request('human.decide', { kind: 'authorize-implementation', subject: (await f.core.commitments()).subject, authority: { ...human, instruction: 'Implement it.' }, reason: 'Approved scope', consequences: 'May implement' }, 'authorize');
}
// Commit changes on a branch and publish it to the fixture remote.
export async function branchWith(f, branch, changes) {
  await git(f.repo, ['checkout', '-B', branch]);
  for (const [path, body] of Object.entries(typeof changes === 'string' ? { 'app.js': changes } : changes)) {
    if (body === null) { await git(f.repo, ['rm', '-q', path]); continue; }
    await mkdir(dirname(join(f.repo, path)), { recursive: true }); await writeFile(join(f.repo, path), body);
  }
  await git(f.repo, ['add', '-A']); await git(f.repo, ['commit', '-m', `change on ${branch}`]);
  await git(f.repo, ['push', '--force', 'origin', `HEAD:refs/heads/${branch}`]);
  return (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
}
export async function candidate(f, scope, head, operationId = `candidate-${scope}`) {
  const tip = async branch => (await git(f.repo, ['ls-remote', 'origin', `refs/heads/${branch}`])).split(/\s/u)[0];
  return f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.base, head, target: await tip(scope === 'FEATURE' ? f.release : f.integration) }], scope, criteria: f.criteria }, operationId);
}
// Stateful GitHub CLI double: PR operations plus the non-admin branches API.
export function github(f, protection) {
  const host = { pr: null, calls: [], merge: null, protection: { ...protection }, apiCalls: [] };
  f.core.runtime.gh = async (root, args) => {
    if (args[0] === 'api') {
      host.apiCalls.push(args.join(' '));
      const branch = /branches\/(.+)$/u.exec(args.at(-1))[1];
      const value = host.protection[branch];
      if (value === 'error') throw Object.assign(new Error('Command failed: gh api'), { stderr: 'HTTP 502: Bad Gateway' });
      if (value === undefined) throw Object.assign(new Error('Command failed: gh api'), { stderr: 'gh: Branch not found (HTTP 404)' });
      return JSON.stringify({ name: branch, protected: value, commit: { sha: 'x' } });
    }
    const command = args[1], pr = host.pr;
    if (command === 'view') return JSON.stringify({ ...pr, url: 'https://github.com/fixture/project/pull/12',
      mergeCommit: pr.state === 'MERGED' ? { oid: pr.headRefOid } : null });
    host.calls.push(command);
    if (command === 'edit') pr.body = args[args.indexOf('--body') + 1];
    if (command === 'ready') pr.isDraft = args.includes('--undo');
    if (command === 'merge') {
      if (host.merge) return host.merge(root, args);
      await git(root, ['push', 'origin', `HEAD:refs/heads/${pr.baseRefName}`]); pr.state = 'MERGED';
    }
    return '';
  };
  return host;
}
export function openPr(f, headBranch, baseBranch, head, body = 'Change description.') {
  f.gh.pr = { number: 12, state: 'OPEN', isDraft: true, headRefName: headBranch, baseRefName: baseBranch, headRefOid: head,
    baseRefOid: f.base, body, mergeStateStatus: 'CLEAN', reviewDecision: '' };
}
// Evaluator double: gate reviews and planning reviews, with a fresh context.
export function evaluator(f, { outcome = 'PASS', planning = 'PASS', contextId = 'reviewer-fresh', findings = [] } = {}) {
  f.core.runtime.evaluators = undefined;
  const runs = [];
  f.core.runtime.evaluator = {
    async describe() { return { provider: 'codex', model: 'fixture', reasoningEffort: 'high' }; },
    async runStage(request) {
      runs.push(request);
      const output = request.stage.id === 'planning-review'
        ? { outcome: planning, summary: `Fixture ${request.input.artifact} review`, findings: planning === 'FAIL'
          ? [{ id: 'P1', document: request.input.documents[0].path, evidence: 'Fixture blocking finding', blocking: true }] : findings }
        : { verdicts: request.input.gates.map(id => ({ gate: id, outcome, summary: 'Fixture assessment: the change exports 42.',
          ...(id === 'review' ? { dimensions: ['code', 'requirements', 'evidence', 'scope', 'findings'].map(name => ({ name, outcome, evidence: 'Fixture source and receipts' })) } : {}),
          criteria: request.input.criteria.map(row => ({ id: row, outcome, evidence: 'app/app.js exports 42' })),
          coverage: { complete: true, paths: ['app/app.js'], interactions: ['app/app.js'], limitations: [] }, findings: [], dispositions: [], historyAssessment: null })) };
      return { schemaVersion: 1, protocolVersion: request.protocolVersion, stageId: request.stage.id, status: 'completed', output, receipt: { schemaVersion: 1, kind: 'gatereeve-agent-workflow-receipt',
        protocolVersion: request.protocolVersion, module: request.module, stage: request.stage.id, capabilityProfile: request.capabilityProfile, startedAt: '2026-11-16T00:00:00Z', completedAt: '2026-11-16T00:00:01Z',
        status: 'completed', runId: request.runId, attemptId: request.attemptId, isolation: { method: 'test-isolated', freshContext: true, inheritedTurns: 0 },
        provider: { id: 'codex', adapterVersion: '1.0.0', reasoningEffort: 'high', model: 'fixture', contextId },
        digests: { input: sha256Digest(request.input), instructions: sha256Digest(request.instructions), output: sha256Digest(output), snapshot: request.snapshotDigest },
        policy: { repositoryAccess: 'read-only', networkAccess: 'deny', scratch: 'isolated' } } };
    },
  };
  return runs;
}
// Readiness plus every required acceptance gate, all PASS.
export async function gates(f, suffix = '') {
  await f.request('candidate.ready', {}, `ready${suffix}`);
  const refs = [...(await f.request('gate.execute', { gates: ['verification'], configuration: { validation: { kind: 'alternative', reason: 'Fixture has no hosted CI', scope: 'The approved criterion' },
    checks: [{ repository: 'app', command: process.execPath, args: ['-e', 'process.exit(0)'], purpose: 'Fixture verification' }] } }, `verify${suffix}`)).event.payload.results];
  const { selection, pairedAdapters, passingReviewRefs } = await import('./paired-review-fixture.js');
  if (!(await f.core.state()).state.reviewerSelection) await f.request('review.select', selection(), `select${suffix}`);
  pairedAdapters(f);
  refs.push(...await passingReviewRefs(f, `review${suffix}`));
  refs.push(...(await f.request('gate.execute', { gates: ['context'] }, `context${suffix}`)).event.payload.results);
  await f.request('gate.execute', { gates: ['packet'], consumed: refs }, `packet${suffix}`);
  return refs;
}
export async function acceptanceMissing(f) {
  const check = await f.request('milestone.check', { name: 'acceptance' });
  return check.missing.join('; ');
}
export const delegate = (f, operationId = 'delegate', extra = {}) => f.request('run.set-dial', { dial: 'autonomy', value: 'delegated', actor: 'human', runId: 'run-one',
  authority: { ...human, instruction: 'Finish run-one yourself and give me a PR.' }, reason: 'Unattended slice work', ...extra }, operationId);
export function assertDial(change, expected) {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(change[key], value, key);
}
