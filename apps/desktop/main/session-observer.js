// @ts-check

import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve } from 'node:path';

import {
  requireSessionDetail,
  requireSessionId,
  requireSessionInventory,
} from '../shared/contracts.js';

const MAX_SESSION_BYTES = 10 * 1024 * 1024;

function isWithin(root, target) {
  const child = relative(root, target);
  return child === '' || (!child.startsWith('..') && !isAbsolute(child));
}

function sessionId(kind, name) {
  return `session:${kind}:${Buffer.from(name).toString('base64url')}`;
}

async function optionalDirectory(path, accepts = () => true) {
  try {
    const metadata = await lstat(path);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) return [];
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && accepts(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function candidate(root, path, kind, label, id) {
  try {
    if ((await lstat(path)).isSymbolicLink()) return null;
    const canonical = await realpath(path);
    if (!isWithin(root, canonical)) return null;
    const metadata = await stat(canonical);
    if (!metadata.isFile() || metadata.size > MAX_SESSION_BYTES) return null;
    return {
      public: {
        id,
        kind,
        label,
        path: relative(root, canonical),
        size: metadata.size,
        modifiedAt: metadata.mtime.toISOString(),
      },
      absolutePath: canonical,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function discover(worktreePath) {
  const root = await realpath(worktreePath);
  const candidates = [];
  candidates.push(await candidate(
    root,
    resolve(root, 'CHECKPOINT.md'),
    'latest-checkpoint',
    'Latest checkpoint',
    sessionId('latest-checkpoint', 'CHECKPOINT.md'),
  ));
  for (const name of await optionalDirectory(
    resolve(root, '.checkpoints'),
    (entry) => entry.endsWith('.md'),
  )) {
    candidates.push(await candidate(
      root,
      resolve(root, '.checkpoints', name),
      'checkpoint',
      basename(name),
      sessionId('checkpoint', name),
    ));
  }
  for (const name of await optionalDirectory(resolve(root, '.handoffs'))) {
    candidates.push(await candidate(
      root,
      resolve(root, '.handoffs', name),
      'handoff',
      basename(name),
      sessionId('handoff', name),
    ));
  }
  return candidates.filter(Boolean);
}

export async function listSessionContext(worktreePath) {
  const items = (await discover(worktreePath)).map((item) => item.public);
  return requireSessionInventory({ schemaVersion: 1, items });
}

export async function readSessionContext(worktreePath, rawId) {
  const id = requireSessionId(rawId);
  const item = (await discover(worktreePath)).find((candidate) => candidate.public.id === id);
  if (!item) throw new Error('The requested Session item is not available.');
  return requireSessionDetail({
    schemaVersion: 1,
    id,
    item: item.public,
    content: await readFile(item.absolutePath, 'utf8'),
  });
}
