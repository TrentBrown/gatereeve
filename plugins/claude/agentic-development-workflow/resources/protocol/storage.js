import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

import { ProtocolError } from './errors.js';

export async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function validateNarrowTarget(target) {
  const normalized = resolve(target);
  const name = basename(normalized);
  if (!name || name === '.' || name === '..' || dirname(normalized) === normalized) {
    throw new ProtocolError('UNSAFE_STORAGE_TARGET', `Unsafe storage target: ${target}`);
  }
  return normalized;
}

export async function atomicCreateDirectory(target, writer) {
  const normalized = validateNarrowTarget(target);
  const parent = dirname(normalized);
  const temporary = resolve(parent, `.${basename(normalized)}.gatereeve-${randomUUID()}`);
  await mkdir(parent, { recursive: true });
  if (await pathExists(normalized)) {
    throw new ProtocolError('FEATURE_EXISTS', `Feature record already exists: ${normalized}`);
  }

  await mkdir(temporary, { recursive: false });
  try {
    await writer(temporary);
    await rename(temporary, normalized);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return normalized;
}

export async function atomicReplaceFile(target, content) {
  const normalized = validateNarrowTarget(target);
  const temporary = resolve(
    dirname(normalized),
    `.${basename(normalized)}.gatereeve-${randomUUID()}.tmp`
  );
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, normalized);
  } catch (error) {
    if (handle) await handle.close();
    await rm(temporary, { force: true });
    throw error;
  }
}
