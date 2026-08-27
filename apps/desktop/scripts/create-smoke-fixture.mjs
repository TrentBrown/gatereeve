import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { initializeFeature } from '../../../plugin-src/shared/resources/protocol/feature.js';

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
await initializeFeature({
  featureHome,
  featureId,
  actor: { kind: 'agent', label: 'Desktop runtime smoke' },
  eventId: 'evt-desktop-runtime-smoke-init',
  recordedAt: '2026-08-27T00:00:00.000Z',
});
process.stdout.write(`${worktree}\n`);
