import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const workflowPath = resolve(
  import.meta.dirname,
  '../../.github/workflows/coordinated-release-prepare.yml'
);

test('coordinated preparation is pre-publication, exact-source, and dual-architecture', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  assert.match(workflow, /^\s*workflow_dispatch:/m);
  assert.match(workflow, /^permissions:\n\s+contents: read$/m);
  assert.match(workflow, /commit: \$\{\{ steps\.source\.outputs\.commit \}\}/);
  assert.match(workflow, /ref: \$\{\{ needs\.resolve-source\.outputs\.commit \}\}/);
  assert.match(workflow, /architecture: arm64/);
  assert.match(workflow, /architecture: x64/);
  assert.match(workflow, /plugin release coordinate/);
  assert.match(workflow, /coordinated-desktop-evidence-\$\{\{ matrix\.architecture \}\}/);
  assert.doesNotMatch(workflow, /contents: write/);
  assert.doesNotMatch(workflow, /gh release create/);
  assert.doesNotMatch(workflow, /git push/);
  assert.doesNotMatch(workflow, /publish-marketplace\.sh/);
});
