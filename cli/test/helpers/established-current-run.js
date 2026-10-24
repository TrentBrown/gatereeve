// Synthetic integration fixture only. These evaluator responses test receipt
// transport, never constitute independent review of GateReeve or a real project.
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { git } from '../../../plugin-src/shared/resources/protocol/current/evidence.js';

export async function establishCurrentRun(core, { refresh = false } = {}) {
  const request = (operation, input = {}, operationId) => core.execute({ operation, input, operationId });
  const home = core.store.home;
  const context = core.context;
  const authority = { kind: 'human-confirmed', instruction: 'Synthetic test authorization only', context: 'Disposable desktop test fixture' };
  if (!refresh) {
    await mkdir(join(context.workspaceRoot, '.pattern-review'), { recursive: true });
    await writeFile(join(context.workspaceRoot, '.pattern-review/rules.yaml'), '[]\n');
    await writeFile(join(home, 'plan.md'), '# Plan\n## P1 - Implement R1\n');
    await writeFile(join(home, 'issues.md'), '# Issues\n## I-1 - Implement\n**Status:** in-review\n**Plan steps:** P1\n**Rubric criteria:** R1\n');
    await writeFile(join(home, 'tracker.md'), '# Tracker\n## Rubric Status\n| R1 | AC1 | NOT YET | pending |\n## Review Log\n');
    await request('run.start', { runId: 'desktop-established', implementers: ['fixture-implementer'] }, 'start');
    const design = await core.store.capture('design.md');
    await request('human.decide', { kind: 'approve-design', subject: design.hash, authority, reason: 'Fixture', consequences: 'Validate fixture' }, 'design');
  }
  await request('spec.validate', {}, `spec-${refresh}`);
  if (!refresh) {
    const commitments = await core.commitments();
    await request('human.decide', { kind: 'authorize-implementation', subject: commitments.subject, authority, reason: 'Fixture', consequences: 'Observe fixture' }, 'implementation');
    const repositories = await Promise.all(context.repositories.map(async repo => {
      const head = (await git(repo.path, ['rev-parse', 'HEAD'])).trim();
      return { alias: repo.alias, base: head, head };
    }));
    await request('candidate.prepare', { repositories, scope: 'SLICE', criteria: ['R1'] }, 'candidate');
  }
  const reconcile = await request('gate.execute', { gates: ['reconcile'] }, `reconcile-${refresh}`);
  fixtureEvaluator({ core });
  const pattern = await request('gate.execute', { gates: ['pattern'], configuration: { provider: 'codex', model: 'fixture' } }, `pattern-${refresh}`);
  for (const ref of [...(reconcile.results ?? reconcile.event.payload.results), ...(pattern.results ?? pattern.event.payload.results)]) {
    if ((await core.store.json(ref)).outcome !== 'PASS') throw new Error('Synthetic fixture execution failed');
  }
}

export function fixtureEvaluator(f, { malformed = false, inherited = false, blocking = false, findingId = 'finding-1', outcome = blocking ? 'FAIL' : 'PASS', dispositions = [], historyAssessment = null, criterionRows = null, coverage = null } = {}) {
  let launches = 0;
  f.core.runtime.evaluator = {
    async describe() { return { provider: 'codex', model: 'fixture', reasoningEffort: 'high' }; },
    async runStage(request) {
      launches++;
      const output = { verdicts: request.input.gates.map(id => ({ gate: id, outcome,
        summary: 'Fixture assessment', criteria: criterionRows ?? request.input.criteria.map(id => ({ id, outcome, evidence: 'Fixture source and command receipt' })), coverage: coverage ?? { complete: true, paths: request.input.changedPaths ?? ['app/app.js'], interactions: ['app/app.js'], limitations: [] },
        findings: blocking ? [{ id: findingId, classId: 'class-1', criterion: 'R1', path: 'app/app.js', evidence: 'Current defect', blocking: true }] : [], dispositions, historyAssessment })) };
      if (malformed) output.verdicts.pop();
      const { sha256Digest } = await import('../../../plugin-src/shared/resources/protocol/agent-workflow.js');
      return { schemaVersion: 1, protocolVersion: request.protocolVersion, stageId: request.stage.id, status: 'completed', output, receipt: { schemaVersion: 1, kind: 'gatereeve-agent-workflow-receipt', protocolVersion: request.protocolVersion, module: request.module, stage: request.stage.id, capabilityProfile: request.capabilityProfile, startedAt: '2026-10-23T00:00:00Z', completedAt: '2026-10-23T00:00:01Z', status: 'completed', runId: request.runId, attemptId: request.attemptId,
        isolation: { method: 'test-isolated', freshContext: true, inheritedTurns: inherited ? 1 : 0 },
        provider: { id: 'codex', adapterVersion: '1.0.0', reasoningEffort: 'high', model: 'fixture', contextId: 'reviewer-fresh' },
        digests: { input: sha256Digest(request.input), instructions: sha256Digest(request.instructions), output: sha256Digest(output), snapshot: request.snapshotDigest },
        policy: { repositoryAccess: 'read-only', networkAccess: 'deny', scratch: 'isolated' } } };
    },
  };
  return () => launches;
}
