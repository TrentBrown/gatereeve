import assert from 'node:assert/strict';
import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { publishAgentWorkflowArtifacts } from '../../plugin-src/shared/resources/protocol/index.js';

function moduleDefinition() {
  return {
    run: {
      kind: 'agent-workflow',
      artifacts: [
        { path: 'root.json', mediaType: 'application/json', required: true },
        { path: 'report.html', mediaType: 'text/html', required: true },
      ],
    },
  };
}

test('GateReeve publishes only declared complete artifact sets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-artifacts-'));
  const result = await publishAgentWorkflowArtifacts({
    artifactRoot: root,
    module: moduleDefinition(),
    files: { 'root.json': { status: 'PASS' }, 'report.html': '<html></html>' },
    randomId: () => 'fixed',
  });
  assert.deepEqual(result.map((item) => item.path), ['root.json', 'report.html']);
  assert.equal(JSON.parse(await readFile(join(root, 'root.json'), 'utf8')).status, 'PASS');
});

test('GateReeve rejects missing, undeclared, and symlink-target artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-artifacts-'));
  await assert.rejects(publishAgentWorkflowArtifacts({
    artifactRoot: root,
    module: moduleDefinition(),
    files: { 'root.json': {} },
  }), /Required agent workflow artifact is missing/);
  await assert.rejects(publishAgentWorkflowArtifacts({
    artifactRoot: root,
    module: moduleDefinition(),
    files: { 'root.json': {}, 'report.html': '', 'extra.txt': 'no' },
  }), /undeclared artifact/);

  const outside = join(root, '..', 'outside-artifact');
  await writeFile(outside, 'outside');
  await symlink(outside, join(root, 'root.json'));
  await assert.rejects(publishAgentWorkflowArtifacts({
    artifactRoot: root,
    module: moduleDefinition(),
    files: { 'root.json': {}, 'report.html': '' },
  }), /target is unsafe/);
});
