import { AsyncLocalStorage } from 'node:async_hooks';
import { constants } from 'node:fs';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { lstat, mkdir, open, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { requireThat } from './contracts.js';
import { comparisonKey } from './runner-profile.js';
import { record } from '../../performance/observe.js';

// How runtime-input bytes are read, not what is bound. Fingerprint values are
// byte-for-byte identical with or without this cache, so retained manifests and
// RUNNER_FINGERPRINT_POLICY are unchanged.
//
// A file's content hash is reused only when its device, inode, size, mtime and
// ctime (nanoseconds) all match the observation that produced it, as Git's
// index does. Any write or metadata change advances ctime, which user space
// cannot set back. Files whose mtime or ctime falls within RACY_WINDOW_NS of
// the observation are never cached, so a write in the same clock tick as the
// read cannot be hidden.
export const FINGERPRINT_READ_POLICY = Object.freeze({
  id: 'stat-validated-content/1',
  key: 'device, inode, size, mtime_ns, ctime_ns',
  racyWindowSeconds: 2,
  scope: 'feature home; HMAC-sealed with the runner comparison key; released at completion',
  disable: 'GATEREEVE_FINGERPRINT_CACHE=off',
});
const RACY_WINDOW_NS = 2_000_000_000n;
const STREAM_THRESHOLD = 8 * 1024 * 1024;
const CHUNK = 1024 * 1024;
const MAX_ENTRIES = 500_000;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const STALE_MS = 14 * 24 * 3600 * 1000;
const FORMAT = 'gatereeve-fingerprint-cache/1';
const CONCURRENCY = 32;

export const cacheDisabled = () => process.env.GATEREEVE_FINGERPRINT_CACHE === 'off';
const cacheDirectory = context => join(context.featureHome ?? context.repositories[0].path, '.gatereeve-current', 'fingerprint-cache');
const CACHE_FILE = 'content-hashes.v1';

// Bounded I/O concurrency shared by every pass in the process. Only leaf
// filesystem operations take a slot, so recursion can never deadlock.
let active = 0, head = 0, waiting = [];
function slot(fn) {
  if (active < CONCURRENCY) return run(fn);
  return new Promise((resolve, reject) => waiting.push({ fn, resolve, reject }));
}
function run(fn) {
  active++;
  const done = () => { active--; drain(); };
  const result = fn();
  result.then(done, done);
  return result;
}
function drain() {
  // Index-based FIFO: a walk can queue ~10^5 operations, so shift() is quadratic.
  while (active < CONCURRENCY && head < waiting.length) {
    const { fn, resolve, reject } = waiting[head]; waiting[head++] = undefined;
    run(fn).then(resolve, reject);
  }
  if (head === waiting.length) { waiting = []; head = 0; }
}

const statKey = info => `${info.dev}:${info.ino}`;
const sameStat = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size
  && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;

async function hashFile(path, expected) {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    const hash = createHash('sha256');
    let bytes = 0;
    if (before.size <= BigInt(STREAM_THRESHOLD)) {
      const buffer = await handle.readFile();
      hash.update(buffer); bytes = buffer.length;
    } else {
      const buffer = Buffer.allocUnsafe(CHUNK);
      while (true) {
        const { bytesRead } = await handle.read(buffer, 0, CHUNK, null);
        if (!bytesRead) break;
        hash.update(buffer.subarray(0, bytesRead)); bytes += bytesRead;
      }
    }
    const after = await handle.stat({ bigint: true });
    return { hash: `sha256:${hash.digest('hex')}`, bytes, stable: sameStat(before, after) && sameStat(before, expected) };
  } finally { await handle.close(); }
}

class ContentHashCache {
  constructor(directory, key, entries = new Map()) {
    this.directory = directory; this.key = key; this.entries = entries;
    this.inflight = new Map(); this.dirty = false; this.writing = Promise.resolve();
  }
  lookup(info) {
    const entry = this.entries.get(statKey(info));
    if (!entry || entry[0] !== String(info.size) || entry[1] !== String(info.mtimeNs) || entry[2] !== String(info.ctimeNs)) return null;
    // Refresh last use at most daily so entries in use survive stale pruning.
    const now = Date.now();
    if (now - entry[4] > 24 * 3600 * 1000) { entry[4] = now; this.dirty = true; }
    return entry[3];
  }
  store(info, hash, observedNs) {
    if (info.mtimeNs + RACY_WINDOW_NS > observedNs || info.ctimeNs + RACY_WINDOW_NS > observedNs) return false;
    this.entries.set(statKey(info), [String(info.size), String(info.mtimeNs), String(info.ctimeNs), hash, Date.now()]);
    this.dirty = true;
    return true;
  }
  mac(bytes) { return createHmac('sha256', this.key).update(FORMAT).update(bytes).digest(); }
  async flush() {
    if (!this.key || !this.dirty) return;
    this.dirty = false;
    this.writing = this.writing.then(async () => {
      const now = Date.now();
      const kept = [...this.entries].filter(([, entry]) => now - entry[4] <= STALE_MS)
        .sort((a, b) => b[1][4] - a[1][4]).slice(0, MAX_ENTRIES);
      const payload = gzipSync(Buffer.from(JSON.stringify({ format: FORMAT, entries: kept })));
      const temporary = join(this.directory, `${randomUUID()}.pending`);
      try {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        const info = await lstat(this.directory);
        requireThat(info.isDirectory() && !info.isSymbolicLink(), 'Unsafe fingerprint cache');
        await writeFile(temporary, Buffer.concat([this.mac(payload), payload]), { flag: 'wx', mode: 0o600 });
        await rename(temporary, join(this.directory, CACHE_FILE));
      } catch { /* The cache only saves work; losing it never changes a fingerprint. */ }
      finally { await rm(temporary, { force: true }).catch(() => {}); }
    });
    await this.writing;
  }
}

const caches = new Map();
async function loadCache(context) {
  const directory = cacheDirectory(context);
  let key = null;
  try { key = createHmac('sha256', await comparisonKey(context)).update('gatereeve-fingerprint-cache').digest(); }
  catch { return new ContentHashCache(directory, null); }
  const cache = new ContentHashCache(directory, key);
  try {
    const path = join(directory, CACHE_FILE);
    const directoryInfo = await lstat(directory), info = await lstat(path);
    requireThat(directoryInfo.isDirectory() && !directoryInfo.isSymbolicLink() && info.isFile() && !info.isSymbolicLink()
      && info.size > 32 && info.size <= MAX_CACHE_BYTES, 'Unavailable fingerprint cache');
    const bytes = await readFile(path), payload = bytes.subarray(32);
    requireThat(timingSafeEqual(bytes.subarray(0, 32), cache.mac(payload)), 'Fingerprint cache seal mismatch');
    const data = JSON.parse(gunzipSync(payload, { maxOutputLength: 4 * MAX_CACHE_BYTES }));
    requireThat(data?.format === FORMAT && Array.isArray(data.entries), 'Unsupported fingerprint cache');
    for (const [id, entry] of data.entries) if (typeof id === 'string' && Array.isArray(entry) && entry.length === 5
      && /^sha256:[a-f0-9]{64}$/u.test(entry[3])) cache.entries.set(id, entry);
  } catch { /* Missing, unsealed or corrupt caches start empty and are replaced. */ }
  return cache;
}
async function cacheFor(context) {
  const directory = cacheDirectory(context);
  if (!caches.has(directory)) caches.set(directory, loadCache(context));
  return caches.get(directory);
}
export async function releaseFingerprintCache(context) {
  const directory = cacheDirectory(context);
  caches.delete(directory);
  let info;
  try { info = await lstat(directory); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  requireThat(info.isDirectory() && !info.isSymbolicLink(), 'Unsafe fingerprint cache');
  for (const name of await readdir(directory)) if (name === CACHE_FILE || /^[a-f0-9-]{36}\.pending$/u.test(name)) {
    const entry = await lstat(join(directory, name));
    requireThat(entry.isFile() && !entry.isSymbolicLink(), 'Unsafe fingerprint cache entry');
    await rm(join(directory, name));
  }
}

// One fingerprint observation. Filesystem facts are read once per path, in
// parallel, and consumed by the deterministic sequential walk in environment.js.
export class FingerprintPass {
  static async open(context) {
    return new FingerprintPass(cacheDisabled() ? null : await cacheFor(context));
  }
  constructor(cache) {
    this.cache = cache;
    this.startedAt = Date.now();
    this.observedNs = BigInt(this.startedAt) * 1_000_000n;
    this.manifests = new Map();
    this.stats = new Map(); this.lists = new Map(); this.reals = new Map(); this.contents = new Map();
    this.counts = { entries: 0, files: 0, hashed: 0, hashedBytes: 0, cacheHits: 0 };
  }
  // Every memoized promise is awaited by its creator (the walk or the
  // prefetch), so a failure is always observed where it occurs.
  memo(map, key, make) {
    let value = map.get(key);
    if (value === undefined) { value = make(); map.set(key, value); }
    return value;
  }
  stat(path) {
    return this.memo(this.stats, path, () => slot(() => lstat(path, { bigint: true })).then(info => { this.counts.entries++; return info; }));
  }
  list(path) { return this.memo(this.lists, path, () => slot(() => readdir(path)).then(names => names.sort())); }
  real(path) { return this.memo(this.reals, path, () => slot(() => realpath(path))); }
  // The SHA-256 digest of a regular file's bytes, as contracts.digest() would produce.
  content(path, info) {
    return this.memo(this.contents, path, async () => {
      this.counts.files++;
      const cached = this.cache?.lookup(info);
      if (cached) { this.counts.cacheHits++; return cached; }
      const id = `${statKey(info)}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
      // Concurrent passes and pnpm hard links share one read of the same inode.
      const shared = this.cache?.inflight.get(id);
      if (shared) { const result = await shared; if (result.stable) { this.counts.cacheHits++; return result.hash; } }
      const reading = slot(() => hashFile(path, info));
      if (this.cache) { this.cache.inflight.set(id, reading); reading.catch(() => {}).finally(() => this.cache.inflight.delete(id)); }
      const result = await reading;
      this.counts.hashed++; this.counts.hashedBytes += result.bytes;
      if (result.stable) this.cache?.store(info, result.hash, this.observedNs);
      return result.hash;
    });
  }
  // Start every stat, listing and hash under root without following links.
  // The walk that consumes these facts still decides what is bound.
  warm(path, skip) {
    const visit = async target => {
      if (skip(target)) return;
      const info = await this.stat(target);
      if (info.isDirectory()) await Promise.all((await this.list(target)).map(name => visit(join(target, name)).catch(() => {})));
      else if (info.isFile() && !skip(target, info)) await this.content(target, info);
    };
    return visit(path).catch(() => {});
  }
  async finish() { await this.cache?.flush(); }
}

// Observation epochs share one filesystem observation among the fingerprint
// requests of a single adapter operation. A request names the earliest epoch it
// may use: qualification accepts any epoch of the operation, while a live-input
// guard passes mark() on entry and so always observes after what it guards.
// Nothing is shared across operations except stat-validated content hashes.
const operationScope = new AsyncLocalStorage();
class ObservationEpochs {
  constructor() { this.sequence = 0; this.epochs = []; }
  mark() { return this.sequence + 1; }
  epoch(context, notBefore) {
    const directory = cacheDirectory(context);
    const found = this.epochs.findLast(item => item.directory === directory && item.sequence >= notBefore);
    if (found) return found.pass;
    const item = { directory, sequence: ++this.sequence, pass: FingerprintPass.open(context) };
    this.epochs.push(item);
    return item.pass;
  }
}
export const observationEpochs = () => operationScope.getStore() ?? null;
export function withObservationEpochs(fn) {
  if (operationScope.getStore()) return fn();
  const epochs = new ObservationEpochs();
  return operationScope.run(epochs, async () => {
    try { return await fn(); }
    finally { for (const item of epochs.epochs) { try { await reportPass(await item.pass); } catch { /* Metrics never block work. */ } } }
  });
}
// Content actually read for one observation, as child records of the enclosing
// operation span; nothing is recorded when every hash came from the cache.
// Elapsed time is on the environment-fingerprint spans.
export async function reportPass(pass) {
  const { hashed, hashedBytes } = pass.counts;
  if (!hashed) return;
  const base = { category: 'setup', startedAt: pass.startedAt, durationMs: 0, outcome: 'PASS', worker: false };
  await record({ ...base, label: 'environment-hash', count: hashed });
  await record({ ...base, label: 'environment-hash-bytes', count: hashedBytes });
}
