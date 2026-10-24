import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executePluginRequest } from '../../../plugin-src/shared/resources/protocol/plugin-adapter.js';
import { git } from '../../../plugin-src/shared/resources/protocol/current/evidence.js';
import { CurrentCore } from '../../../plugin-src/shared/resources/protocol/current/core.js';
import { resolveWorkflowContext } from '../../../plugin-src/shared/resources/protocol/context.js';

export async function currentFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-current-surface-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'app'); const home = join(root, 'docs/issues/feature');
  await mkdir(repo, { recursive: true }); await mkdir(home, { recursive: true });
  await git(repo, ['init', '-b', 'topic']);
  await git(repo, ['config', 'user.name', 'Fixture']); await git(repo, ['config', 'user.email', 'fixture@example.test']);
  await git(repo, ['config', 'commit.gpgsign', 'false']);
  await writeFile(join(repo, 'app.js'), 'export const answer = 42;\n');
  await git(repo, ['add', 'app.js']); await git(repo, ['commit', '-m', 'fixture']);
  await writeFile(join(root, '.agentic-workflow.json'), JSON.stringify({ schemaVersion: 1, featureId: 'feature', repositories: { app: { path: 'app', integrationBranch: 'main' } } }));
  for (const [name, body] of Object.entries({ 'interview.md': '# Interview\nSettled scope.\n', 'design.md': '# Design\nApproved fixture.\n', 'spec.md': '# Spec\n\n## Acceptance Criteria\n- **AC1.** Export answer 42.\n\n## Rubric\n| # | Criterion | Pass | Fail | Evidence |\n|---|---|---|---|---|\n| R1 | AC1 | 42 | other | test |\n\n## Changes\n', 'plan.md': '# Plan\n', 'issues.md': '# Issues\n', 'events.jsonl': 'historical bytes\n' })) await writeFile(join(home, name), body);
  const request = (operation, input = {}, operationId) => executePluginRequest({ operation, input, operationId, cwd: repo });
  const context = await resolveWorkflowContext({ cwd: repo });
  const core = await CurrentCore.at(context);
  return { root: context.workspaceRoot, repo: context.repositories[0].path, home: context.featureHome, request, core, context };
}
