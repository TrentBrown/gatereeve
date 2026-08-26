import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createPreferenceStore,
  defaultPreferences,
  MAX_RECENT_WORKTREES,
  normalizePreferences,
  rememberWorktree,
} from '../main/preferences.js';

test('preferences persist only recents, last selection, and window geometry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-preferences-'));
  const store = createPreferenceStore(root);
  let value = rememberWorktree(defaultPreferences(), '/tmp/feature-one');
  value = { ...value, window: { x: 4, y: 8, width: 900, height: 640 } };
  await store.save(value);
  assert.deepEqual(await store.load(), value);
  const persisted = JSON.parse(await readFile(store.path, 'utf8'));
  assert.deepEqual(Object.keys(persisted).sort(), [
    'lastWorktree', 'recentWorktrees', 'schemaVersion', 'window',
  ]);
  assert.equal(JSON.stringify(persisted).includes('snapshot'), false);
  assert.equal(JSON.stringify(persisted).includes('github'), false);
  assert.equal(JSON.stringify(persisted).includes('governance'), false);
});

test('preferences discard invalid fields and cap deduplicated recents', () => {
  let value = defaultPreferences();
  for (let index = 0; index < MAX_RECENT_WORKTREES + 3; index += 1) {
    value = rememberWorktree(value, `/tmp/feature-${index}`);
  }
  assert.equal(value.recentWorktrees.length, MAX_RECENT_WORKTREES);
  assert.deepEqual(normalizePreferences({
    schemaVersion: 1,
    recentWorktrees: ['relative', '/tmp/valid', '/tmp/valid'],
    lastWorktree: 'relative',
    window: { x: 0, y: 0, width: 10, height: 10 },
    snapshot: { forbidden: true },
  }), {
    schemaVersion: 1,
    recentWorktrees: ['/tmp/valid'],
    lastWorktree: null,
    window: null,
  });
});

test('concurrent preference saves are serialized in call order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-preferences-'));
  const store = createPreferenceStore(root);
  const first = rememberWorktree(defaultPreferences(), '/tmp/first');
  const second = rememberWorktree(first, '/tmp/second');
  await Promise.all([store.save(first), store.save(second)]);
  assert.deepEqual(await store.load(), second);
});
