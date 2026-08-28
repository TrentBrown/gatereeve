// @ts-check

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const UPDATE_CACHE_SCHEMA_VERSION = 1;

export function emptyUpdateCache() {
  return {
    schemaVersion: UPDATE_CACHE_SCHEMA_VERSION,
    checkedAt: null,
    result: null,
    lastNotifiedVersion: null,
  };
}

export function normalizeUpdateCache(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || value.schemaVersion !== UPDATE_CACHE_SCHEMA_VERSION
    || !Object.hasOwn(value, 'checkedAt')
    || !Object.hasOwn(value, 'result')
    || !Object.hasOwn(value, 'lastNotifiedVersion')
  ) return emptyUpdateCache();
  return {
    schemaVersion: UPDATE_CACHE_SCHEMA_VERSION,
    checkedAt: typeof value.checkedAt === 'string' && Number.isFinite(Date.parse(value.checkedAt))
      ? value.checkedAt
      : null,
    result: value.result === null || typeof value.result === 'object' ? value.result : null,
    lastNotifiedVersion: typeof value.lastNotifiedVersion === 'string'
      ? value.lastNotifiedVersion
      : null,
  };
}

export function createUpdateCacheStore(userDataPath) {
  const path = join(userDataPath, 'update-cache.json');
  let writeQueue = Promise.resolve();
  return Object.freeze({
    path,
    async load() {
      try {
        return normalizeUpdateCache(JSON.parse(await readFile(path, 'utf8')));
      } catch (error) {
        if (error?.code === 'ENOENT' || error instanceof SyntaxError) return emptyUpdateCache();
        throw error;
      }
    },
    save(value) {
      const cache = normalizeUpdateCache(value);
      const write = writeQueue.then(async () => {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.${randomUUID()}.tmp`;
        await writeFile(temporary, `${JSON.stringify(cache, null, 2)}\n`, { mode: 0o600 });
        await rename(temporary, path);
        return cache;
      });
      writeQueue = write.catch(() => {});
      return write;
    },
  });
}
