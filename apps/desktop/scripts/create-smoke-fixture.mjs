import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { executePluginRequest } from '../../../plugin-src/shared/resources/protocol/plugin-adapter.js';
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
await mkdir(featureHome, { recursive: true });
await writeFile(resolve(featureHome, 'interview.md'), '# Runtime smoke interview\nNo product scope.\n');
await writeFile(resolve(featureHome, 'design.md'), '# Runtime smoke design\nObserve the current desktop contract.\n');
const initialized = await executePluginRequest({ operation: 'run.start', cwd: worktree,
  operationId: 'desktop-runtime-smoke', input: { implementers: ['desktop-smoke-context'] } });
if (!initialized.ok) throw new Error(initialized.error.message);
process.stdout.write(`${worktree}\n`);
