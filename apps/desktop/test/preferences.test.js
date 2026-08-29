import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  activateProjectReference,
  addProjectReference,
  createPreferenceStore,
  defaultPreferences,
  normalizePreferences,
  removeProjectReference,
  reorderProjectReferences,
  selectAgents,
} from '../main/preferences.js';

test('preferences persist only saved project references and ordinary application settings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-preferences-'));
  const store = createPreferenceStore(root);
  let value = addProjectReference(defaultPreferences(), '/tmp/feature-one');
  value = selectAgents(value, ['claude', 'codex']);
  value = { ...value, window: { x: 4, y: 8, width: 900, height: 640 } };
  await store.save(value);
  assert.deepEqual(await store.load(), value);
  const persisted = JSON.parse(await readFile(store.path, 'utf8'));
  assert.deepEqual(Object.keys(persisted).sort(), [
    'lastProjectPath', 'notificationsEnabled', 'projectPaths', 'schemaVersion',
    'selectedAgents', 'window',
  ]);
  assert.equal(JSON.stringify(persisted).includes('snapshot'), false);
  assert.equal(JSON.stringify(persisted).includes('github'), false);
  assert.equal(JSON.stringify(persisted).includes('governance'), false);
});

test('schema v1 recent worktrees migrate in place to ordered project references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-preferences-'));
  const store = createPreferenceStore(root);
  await writeFile(store.path, JSON.stringify({
    schemaVersion: 1,
    recentWorktrees: ['/tmp/recent', '/tmp/older', '/tmp/recent', 'relative'],
    lastWorktree: '/tmp/older',
    window: null,
    notificationsEnabled: true,
    selectedAgents: ['codex'],
  }));
  assert.deepEqual(await store.load(), {
    schemaVersion: 2,
    projectPaths: ['/tmp/recent', '/tmp/older'],
    lastProjectPath: '/tmp/older',
    window: null,
    notificationsEnabled: true,
    selectedAgents: ['codex'],
  });
});

test('project references append, activate, reorder, and remove without touching paths', () => {
  let value = addProjectReference(defaultPreferences(), '/tmp/one');
  value = addProjectReference(value, '/tmp/two');
  value = addProjectReference(value, '/tmp/one');
  assert.deepEqual(value.projectPaths, ['/tmp/one', '/tmp/two']);
  assert.equal(value.lastProjectPath, '/tmp/one');

  value = reorderProjectReferences(value, ['/tmp/two', '/tmp/one']);
  assert.deepEqual(value.projectPaths, ['/tmp/two', '/tmp/one']);
  value = activateProjectReference(value, '/tmp/two');
  assert.equal(value.lastProjectPath, '/tmp/two');
  value = removeProjectReference(value, '/tmp/two');
  assert.deepEqual(value.projectPaths, ['/tmp/one']);
  assert.equal(value.lastProjectPath, '/tmp/one');

  assert.throws(() => activateProjectReference(value, '/tmp/missing'), /not saved/);
  assert.throws(() => reorderProjectReferences(value, ['/tmp/one', '/tmp/extra']), /exactly once/);
  assert.throws(() => removeProjectReference(value, '/tmp/missing'), /not saved/);
});

test('preferences discard invalid fields and require the last path to be saved', () => {
  assert.deepEqual(normalizePreferences({
    schemaVersion: 2,
    projectPaths: ['relative', '/tmp/valid', '/tmp/valid'],
    lastProjectPath: '/tmp/not-saved',
    window: { x: 0, y: 0, width: 10, height: 10 },
    snapshot: { forbidden: true },
  }), {
    schemaVersion: 2,
    projectPaths: ['/tmp/valid'],
    lastProjectPath: null,
    window: null,
    notificationsEnabled: false,
    selectedAgents: [],
  });
});

test('agent selection is explicit, canonical, and rejects unsupported agents', () => {
  assert.deepEqual(selectAgents(defaultPreferences(), ['claude', 'codex']).selectedAgents, [
    'codex', 'claude',
  ]);
  assert.throws(() => selectAgents(defaultPreferences(), ['cursor']), /invalid/);
});

test('concurrent preference saves are serialized in call order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-preferences-'));
  const store = createPreferenceStore(root);
  const first = addProjectReference(defaultPreferences(), '/tmp/first');
  const second = addProjectReference(first, '/tmp/second');
  await Promise.all([store.save(first), store.save(second)]);
  assert.deepEqual(await store.load(), second);
});
