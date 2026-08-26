import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { listSessionContext, readSessionContext } from '../main/session-observer.js';

test('Session observer exposes only named checkpoint and handoff files beneath the worktree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-session-'));
  const outside = await mkdtemp(join(tmpdir(), 'gatereeve-session-outside-'));
  await mkdir(join(root, '.checkpoints'));
  await mkdir(join(root, '.handoffs'));
  await writeFile(join(root, 'CHECKPOINT.md'), '# Latest\n');
  await writeFile(join(root, '.checkpoints', 'CHECKPOINT-1.md'), '# Archive\n');
  await writeFile(join(root, '.handoffs', 'handoff.md'), '# Handoff\n');
  await writeFile(join(outside, 'secret.md'), 'secret\n');
  await symlink(join(outside, 'secret.md'), join(root, '.handoffs', 'outside.md'));

  const inventory = await listSessionContext(root);
  assert.equal(inventory.schemaVersion, 1);
  assert.deepEqual(inventory.items.map((item) => item.kind), [
    'latest-checkpoint', 'checkpoint', 'handoff',
  ]);
  assert.equal(inventory.items.some((item) => item.label === 'outside.md'), false);
  assert.equal(inventory.items.every((item) => !item.path.startsWith('..')), true);

  const handoff = inventory.items.find((item) => item.kind === 'handoff');
  const detail = await readSessionContext(root, handoff.id);
  assert.equal(detail.content, '# Handoff\n');
  assert.equal(detail.item.path, '.handoffs/handoff.md');
  await assert.rejects(readSessionContext(root, 'session:handoff:dW5rbm93bg'), /not available/);
  await assert.rejects(readSessionContext(root, '../secret.md'), /invalid/);
});

test('Session observer refuses allow-listed directories that are themselves symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-session-root-'));
  const outside = await mkdtemp(join(tmpdir(), 'gatereeve-session-dir-'));
  await writeFile(join(outside, 'CHECKPOINT-outside.md'), '# Outside\n');
  await symlink(outside, join(root, '.checkpoints'));
  assert.deepEqual((await listSessionContext(root)).items, []);
});
