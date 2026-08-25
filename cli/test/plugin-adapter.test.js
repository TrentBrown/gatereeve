import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { executePluginRequest } from '../../plugin-src/shared/resources/protocol/plugin-adapter.js';

const execFileAsync = promisify(execFile);
const adapterPath = resolve(
  import.meta.dirname,
  '../../plugin-src/shared/resources/protocol/plugin-adapter.js'
);

async function git(repository, ...args) {
  const result = await execFileAsync('git', ['-C', repository, ...args]);
  return result.stdout.trim();
}

async function createRepository() {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve plugin adapter '));
  await git(root, 'init', '-b', 'adapter-feature');
  await git(root, 'config', 'user.name', 'Plugin Adapter');
  await git(root, 'config', 'user.email', 'adapter@example.test');
  await git(root, 'config', 'commit.gpgsign', 'false');
  await writeFile(resolve(root, 'README.md'), '# fixture\n');
  await git(root, 'add', 'README.md');
  await git(root, 'commit', '-m', 'base');
  return root;
}

test('plugin adapter initializes and governs a feature without a PATH CLI', async () => {
  const repository = await createRepository();
  const initialized = await executePluginRequest({
    operation: 'feature.init',
    cwd: repository,
    actor: { kind: 'agent', label: 'plugin skill' },
    eventId: 'evt-init',
    recordedAt: '2026-08-25T00:00:00Z',
  });
  assert.equal(initialized.ok, true);
  assert.equal(initialized.data.featureState, 'DESIGNING');

  const status = await executePluginRequest({ operation: 'status', cwd: repository });
  assert.equal(status.ok, true);
  assert.equal(status.data.mode, 'governed');
  assert.equal(status.data.projection.feature.state, 'DESIGNING');

  const approved = await executePluginRequest({
    operation: 'feature.transition',
    cwd: repository,
    transitionId: 'approve-design',
    input: {
      actor: { kind: 'human-confirmed', label: 'user in conversation' },
      eventId: 'evt-design',
    },
  });
  assert.equal(approved.ok, true);
  assert.equal(approved.data.projection.feature.state, 'SPECIFYING');
  assert.match(
    await readFile(resolve(repository, 'docs/issues/adapter-feature/events.jsonl'), 'utf8'),
    /DESIGN_APPROVED/
  );
});

test('plugin adapter process emits the same stable JSON envelope', async () => {
  const repository = await createRepository();
  await executePluginRequest({
    operation: 'feature.init',
    cwd: repository,
    actor: { kind: 'agent', label: 'plugin skill' },
    eventId: 'evt-init',
  });
  const stdout = execFileSync(process.execPath, [adapterPath], {
    cwd: repository,
    input: `${JSON.stringify({ operation: 'status', cwd: repository })}\n`,
    encoding: 'utf8',
  });
  const envelope = JSON.parse(stdout);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.command, 'status');
  assert.equal(envelope.data.projection.featureId, 'adapter-feature');
});

test('model graph remains available when no repository context exists', async () => {
  const result = await executePluginRequest({ operation: 'graph.model' });
  assert.equal(result.ok, true);
  assert.equal(result.data.graph.kind, 'model');
});
