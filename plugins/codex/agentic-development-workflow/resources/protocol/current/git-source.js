import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { requireThat } from './contracts.js';
import { localPath } from './store.js';

const exec = promisify(execFile);
export const METADATA_LIMIT = 64 * 1024 * 1024;
export const CLASSIFICATION_LIMIT = 8 * 1024 * 1024;
export const CLASSIFIER = 'source-records/1';

function options(repository) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^GIT_(?:DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE|CONFIG.*|REPLACE_REF_BASE)$/u.test(key)) delete env[key];
  return { executable: repository.gitExecutable ?? 'git', args: ['--no-replace-objects', '--no-lazy-fetch', '-C', repository.path],
    env: { ...env, GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' } };
}
export async function sourceGit(repository, args) {
  const config = options(repository);
  const { stdout } = await exec(config.executable, [...config.args, ...args], { env: config.env, maxBuffer: METADATA_LIMIT, encoding: 'utf8' });
  return stdout;
}
export function objectId(value, format) {
  requireThat(['sha1', 'sha256'].includes(format) && new RegExp(`^[a-f0-9]{${format === 'sha1' ? 40 : 64}}$`, 'u').test(value), 'Invalid Git source object identity');
  return value;
}
function processFor(repository, args) {
  const config = options(repository);
  const child = spawn(config.executable, [...config.args, ...args], { env: config.env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { if (stderr.length < 8192) stderr += chunk.toString().slice(0, 8192 - stderr.length); });
  // Observe failures immediately, including EPIPE after an early Git exit.
  let pipeError;
  child.stdin.on('error', error => { pipeError = error; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`Git source reader failed (${code}): ${stderr || pipeError?.message || 'incomplete object stream'}`)));
  });
  done.catch(() => {});
  return { child, done };
}

// One outstanding request, bounded stdout chunks, no aggregate blob buffer.
export class ObjectReader {
  constructor(repository, { metadata = false, onRead } = {}) {
    Object.assign(this, processFor(repository, ['cat-file', metadata ? '--batch-check' : '--batch']));
    this.iterator = this.child.stdout[Symbol.asyncIterator](); this.chunk = Buffer.alloc(0); this.offset = 0;
    this.metadata = metadata; this.onRead = onRead;
  }
  async fill() {
    if (this.offset < this.chunk.length) return;
    const next = await this.iterator.next();
    if (next.done) { await this.done; throw new Error('Incomplete Git source object response'); }
    this.chunk = next.value; this.offset = 0;
  }
  async line() {
    const parts = []; let size = 0;
    for (;;) {
      await this.fill(); const end = this.chunk.indexOf(10, this.offset);
      const stop = end < 0 ? this.chunk.length : end;
      const part = this.chunk.subarray(this.offset, stop); parts.push(part); size += part.length;
      requireThat(size < 4096, 'Malformed Git source response header');
      this.offset = stop + (end < 0 ? 0 : 1);
      if (end >= 0) return Buffer.concat(parts).toString('utf8');
    }
  }
  async read(oid, sink = null) {
    requireThat(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(oid), 'Invalid requested source object');
    await new Promise((resolve, reject) => this.child.stdin.write(`${oid}\n`, error => error ? reject(new Error(`Git source request failed: ${error.message}`)) : resolve()));
    const header = await this.line();
    const [actual, type, sizeText] = header.split(' '); const size = Number(sizeText);
    requireThat(actual === oid && ['blob', 'tree', 'commit'].includes(type) && /^\d+$/u.test(sizeText ?? '') && Number.isSafeInteger(size), `Git source object unavailable or invalid: ${oid} (${header})`);
    if (this.metadata) return { oid, type, size };
    this.onRead?.({ oid, type, size });
    requireThat(type === 'blob', `Expected Git source blob: ${oid}`);
    const hash = createHash(oid.length === 40 ? 'sha1' : 'sha256').update(`blob ${size}\0`);
    let remaining = size;
    while (remaining) {
      await this.fill(); const count = Math.min(remaining, this.chunk.length - this.offset);
      const bytes = this.chunk.subarray(this.offset, this.offset + count);
      hash.update(bytes); if (sink) await sink(bytes);
      this.offset += count; remaining -= count;
    }
    await this.fill(); requireThat(this.chunk[this.offset++] === 10, 'Malformed Git source blob terminator');
    requireThat(hash.digest('hex') === oid, `Git source content integrity failure: ${oid}`);
    return { oid, type, size };
  }
  async close() {
    this.child.stdin.end();
    await this.done;
  }
  async abort() { this.child.kill(); await this.done.catch(() => {}); }
}
export async function withObjects(repository, options, work) {
  const reader = new ObjectReader(repository, options);
  try { const value = await work(reader); await reader.close(); return value; }
  catch (error) { await reader.abort(); throw error; }
}
export async function smallBlob(repository, oid, size, onRead) {
  requireThat(size <= CLASSIFICATION_LIMIT, `Ambiguous workflow JSON exceeds ${CLASSIFICATION_LIMIT} byte classification limit: ${oid} (${size} bytes)`);
  return withObjects(repository, { onRead }, async reader => {
    const chunks = []; let count = 0;
    await reader.read(oid, bytes => { count += bytes.length; requireThat(count <= CLASSIFICATION_LIMIT, 'Workflow JSON classification limit exceeded'); chunks.push(Buffer.from(bytes)); });
    return Buffer.concat(chunks);
  });
}
export async function treeEntries(repository, revision, format) {
  objectId(revision, format);
  requireThat((await sourceGit(repository, ['rev-parse', `${revision}^{commit}`])).trim() === revision, 'Pinned source is not a commit');
  const { child, done } = processFor(repository, ['ls-tree', '--full-tree', '-r', '-z', revision]);
  child.stdin.end();
  const entries = []; let pending = Buffer.alloc(0); let total = 0;
  const decode = new TextDecoder('utf-8', { fatal: true });
  try {
    for await (const chunk of child.stdout) {
      total += chunk.length; requireThat(total <= METADATA_LIMIT, 'Git tree metadata exceeds 64 MiB limit');
      const bytes = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      let start = 0; let end;
      while ((end = bytes.indexOf(0, start)) >= 0) {
        const line = decode.decode(bytes.subarray(start, end)); const tab = line.indexOf('\t');
        requireThat(tab > 0, 'Malformed Git source tree entry');
        const [mode, type, oid] = line.slice(0, tab).split(' '); const path = localPath(line.slice(tab + 1));
        requireThat(!path.split('/').some(part => part.toLowerCase() === '.git'), 'Reserved Git control path in source');
        objectId(oid, format);
        requireThat(type === 'blob' && ['100644', '100755', '120000'].includes(mode) || type === 'commit' && mode === '160000', 'Unsupported Git source entry');
        entries.push({ path, mode, oid, ...(mode === '120000' ? { entryKind: 'symlink' } : mode === '160000' ? { entryKind: 'gitlink' } : {}) });
        start = end + 1;
      }
      pending = Buffer.from(bytes.subarray(start)); requireThat(pending.length <= 1024 * 1024, 'Git source path exceeds supported metadata size');
    }
    await done; requireThat(!pending.length, 'Incomplete Git source tree metadata');
    return entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  } catch (error) { child.kill(); await done.catch(() => {}); throw error; }
}
