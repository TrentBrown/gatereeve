import { mkdir, writeFile, open, link, rm, lstat, readdir, chmod } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { hostname, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { identity, requireThat } from './contracts.js';
import { localPath, readSafe } from './store.js';
import { ObjectReader } from './git-source.js';

function expected(store, id) { return join(tmpdir(), `gatereeve-review-${identity(store.home).slice(7, 23)}-${id}`); }
function inactive(view) {
  if (view.host !== hostname() || !Number.isSafeInteger(view.pid) || view.pid < 1) return false;
  try { process.kill(view.pid, 0); return false; } catch (error) { return error.code === 'ESRCH'; }
}
export async function viewStatus(store) {
  return (await store.openViews()).map(view => ({ id: view.id, status: inactive(view) ? 'cleanup-pending' : 'active-or-unknown' }));
}
export async function cleanupViews(store, state = null) {
  for (const view of await store.openViews()) {
    if (!inactive(view) || view.root !== expected(store, view.id)) continue;
    // A dead controller does not prove its evaluator subprocess has stopped.
    if (view.jobId && (view.runId !== state?.runId || !state.jobs[view.jobId]?.finished)) continue;
    let exists = true;
    try { await lstat(view.root); } catch (error) { if (error.code !== 'ENOENT') continue; exists = false; }
    if (!exists) { await store.finishView(view.id); continue; }
    try {
      const info = await lstat(view.root);
      requireThat(info.isDirectory() && !info.isSymbolicLink(), 'Unsafe interrupted review view');
      requireThat((await readSafe(view.root, '.gatereeve-view-owner')).toString() === identity({ home: store.home, id: view.id }), 'Review view ownership is unavailable');
      await removeView(view.root); await store.finishView(view.id);
    } catch { /* Ambiguous ownership is preserved and remains visible. */ }
  }
}
async function removeView(root) {
  // Only called for a private owned view. Do not follow symlinks while restoring directory permissions.
  async function writable(path) {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) return;
    await chmod(path, 0o700);
    for (const name of await readdir(path)) await writable(join(path, name));
  }
  try { await writable(root); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await rm(root, { recursive: true, force: true });
}
export async function newView(store, { runId = null, jobId = null, linkFile = link, writeMarker = writeFile } = {}) {
  const id = randomUUID(); const root = expected(store, id);
  await store.saveView(id, { root, pid: process.pid, host: hostname(), runId, jobId });
  let created = false;
  const readers = new Map(); const backing = new Map(); const paths = new Set();
  const backingRoot = join(root, '.source-blobs');
  try {
    await mkdir(root, { mode: 0o700 }); created = true;
    await writeMarker(join(root, '.gatereeve-view-owner'), identity({ home: store.home, id }), { flag: 'wx', mode: 0o400 });
    await mkdir(backingRoot, { mode: 0o700 });
  } catch (error) {
    if (created) await removeView(root);
    await store.finishView(id);
    throw error;
  }
  return {
    root,
    async source(prefix, repository, files, format) {
      const directory = join(root, localPath(prefix)); await mkdir(directory, { recursive: true, mode: 0o700 });
      for (const file of files) {
        const destination = join(directory, localPath(file.path));
        requireThat(!paths.has(destination), 'Duplicate review view source path'); paths.add(destination);
        await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
        if (file.entryKind === 'gitlink') {
          await writeFile(destination, JSON.stringify({ kind: 'gitlink', commit: file.oid, coverage: 'Contents are not in this repository snapshot; assess the separately selected repository or report a coverage limitation.' }), { flag: 'wx', mode: 0o400 });
          continue;
        }
        const key = `${format}-${file.oid}`;
        if (!backing.has(key)) {
          const path = join(backingRoot, key); const handle = await open(path, 'wx', 0o600);
          try {
            const readerKey = repository.path;
            if (!readers.has(readerKey)) readers.set(readerKey, new ObjectReader(repository));
            await readers.get(readerKey).read(file.oid, async bytes => {
              let offset = 0;
              while (offset < bytes.length) { const result = await handle.write(bytes, offset); requireThat(result.bytesWritten > 0, 'Failed writing source view'); offset += result.bytesWritten; }
            });
          } finally { await handle.close(); }
          await chmod(path, 0o400); backing.set(key, path);
        }
        try { await linkFile(backing.get(key), destination); }
        catch (error) {
          if (!['EXDEV', 'EPERM', 'ENOTSUP', 'EMLINK', 'EOPNOTSUPP'].includes(error.code)) throw error;
          await pipeline(createReadStream(backing.get(key)), createWriteStream(destination, { flags: 'wx', mode: 0o400 }));
        }
      }
      // Check the full inventory: directories and files cannot alias or disappear silently.
      const actual = [];
      async function inventory(path, local = '') {
        for (const name of await readdir(path)) {
          const entry = join(path, name); const info = await lstat(entry);
          requireThat(!info.isSymbolicLink(), 'Unexpected symlink in review view');
          if (info.isDirectory()) await inventory(entry, `${local}${name}/`);
          else { requireThat(info.isFile() && !(info.mode & 0o222) && !(info.mode & 0o111), 'Unsafe review file mode'); actual.push(`${local}${name}`); }
        }
      }
      await inventory(directory);
      requireThat(identity(actual.sort()) === identity(files.map(file => file.path).sort()), 'Review view inventory differs from pinned source');
    },
    async seal() {
      for (const reader of readers.values()) await reader.close(); readers.clear();
      await rm(backingRoot, { recursive: true, force: true });
      async function seal(path) {
        for (const name of await readdir(path)) { const child = join(path, name); if ((await lstat(child)).isDirectory()) await seal(child); }
        await chmod(path, 0o500);
      }
      await seal(root);
    },
    async close() {
      for (const reader of readers.values()) await reader.abort(); readers.clear();
      await removeView(root); await store.finishView(id);
    },
  };
}
