import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createUpdateCacheStore, emptyUpdateCache } from '../main/update-cache.js';

test('update cache is separate, private user data and malformed input resets safely', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-update-cache-'));
  const store = createUpdateCacheStore(root);
  assert.deepEqual(await store.load(), emptyUpdateCache());
  const value = {
    schemaVersion: 1,
    checkedAt: '2026-08-28T00:00:00.000Z',
    result: { status: 'current' },
    lastNotifiedVersion: null,
  };
  await store.save(value);
  assert.deepEqual(JSON.parse(await readFile(store.path, 'utf8')), value);
});
