import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { CurrentCore } from '../../../plugin-src/shared/resources/protocol/current/core.js';
import { resolveWorkflowContext } from '../../../plugin-src/shared/resources/protocol/context.js';
import { establishCurrentRun } from '../../../cli/test/helpers/established-current-run.js';
import { discoverCompatiblePythonExecutable } from '../main/executable-discovery.js';
import { git } from '../../../plugin-src/shared/resources/protocol/current/evidence.js';

const worktreePath = process.argv[2];
if (typeof worktreePath !== 'string' || !isAbsolute(worktreePath)) {
  throw new Error('Usage: node create-smoke-fixture.mjs <absolute-worktree-path>');
}

const worktree = resolve(worktreePath);
const featureId = 'desktop-runtime-smoke';
const featureHome = resolve(worktree, 'docs', 'issues', featureId);
await mkdir(worktree, { recursive: true });
await writeFile(
  resolve(worktree, '.agentic-workflow.json'),
  `${JSON.stringify({
    schemaVersion: 1,
    featureId,
    repositories: {
      product: {
        path: '.',
        remote: 'origin',
        integrationBranch: 'main',
      },
    },
  }, null, 2)}\n`
);
await git(worktree, ['init', '-b', 'smoke-topic']);
await git(worktree, ['config', 'user.name', 'Disposable smoke fixture']);
await git(worktree, ['config', 'user.email', 'fixture@example.test']);
await git(worktree, ['config', 'commit.gpgsign', 'false']);
await writeFile(resolve(worktree, 'app.js'), 'export const answer = 42;\n');
await mkdir(resolve(worktree, '.pattern-review'), { recursive: true });
await writeFile(resolve(worktree, '.pattern-review/rules.yaml'), '[]\n');
await git(worktree, ['add', 'app.js', '.pattern-review/rules.yaml']);
await git(worktree, ['commit', '-m', 'Disposable smoke fixture']);
await mkdir(featureHome, { recursive: true });
await writeFile(resolve(featureHome, 'interview.md'), '# Runtime smoke interview\nNo product scope.\n');
await writeFile(resolve(featureHome, 'design.md'), '# Runtime smoke design\nObserve the current desktop contract.\n');
await writeFile(resolve(featureHome, 'spec.md'), '# Spec\n\n## Acceptance Criteria\n- **AC1.** Export answer 42.\n\n## Rubric\n| # | Criterion | Pass | Fail | Evidence |\n|---|---|---|---|---|\n| R1 | AC1 | 42 | other | test |\n\n## Changes\n');
const pythonExecutable = await discoverCompatiblePythonExecutable();
if (!pythonExecutable) throw new Error('Smoke fixture needs compatible Python');
const context = await resolveWorkflowContext({ cwd: worktree });
const core = await CurrentCore.at(context, { pythonGuardOptions: { pythonExecutable } });
await establishCurrentRun(core);
process.stdout.write(`${worktree}\n`);
