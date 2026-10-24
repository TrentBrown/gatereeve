import { constants } from 'node:fs';
import { lstat, open, mkdir, readdir, link, unlink, realpath } from 'node:fs/promises';
import { join, resolve, relative, sep, dirname, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CONTRACT, HASH, canonical, digest, identity, identifier, requireThat } from './contracts.js';

const MAX_BYTES = 64 * 1024 * 1024;
const AREA = '.gatereeve-current';

export function localPath(path) {
  requireThat(typeof path === 'string' && path.length > 0 && !isAbsolute(path)
    && !path.includes('\\') && !path.includes('\0')
    && path.split('/').every(part => part && part !== '.' && part !== '..'), 'Unsafe local evidence path');
  return path;
}
async function components(root, path, create = false) {
  const parts = localPath(path).split('/');
  let current = root;
  for (const [i, part] of parts.entries()) {
    current = join(current, part);
    if (create && i < parts.length - 1) {
      await mkdir(current).catch(error => { if (error.code !== 'EEXIST') throw error; });
    }
    const info = await lstat(current);
    requireThat(!info.isSymbolicLink(), 'Symlink in canonical evidence path');
    requireThat(i === parts.length - 1 ? info.isFile() : info.isDirectory(), 'Evidence path has unsupported type');
  }
  const actual = await realpath(current);
  const inside = relative(root, actual);
  requireThat(inside && inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside), 'Evidence escaped canonical root');
  return current;
}
export async function readSafe(root, path) {
  const absolute = await components(root, path);
  const before = await lstat(absolute);
  const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    requireThat(info.isFile() && info.size <= MAX_BYTES, 'Evidence file is unsupported or too large');
    requireThat(info.dev === before.dev && info.ino === before.ino, 'Evidence path changed during capture');
    const bytes = await handle.readFile();
    const after = await handle.stat();
    requireThat(info.size === bytes.length && info.size === after.size && info.mtimeMs === after.mtimeMs
      && info.ctimeMs === after.ctimeMs, 'Evidence changed during capture');
    const checked = await components(root, path);
    const current = await lstat(checked);
    requireThat(current.dev === info.dev && current.ino === info.ino, 'Evidence path replaced during capture');
    return bytes;
  } finally { await handle.close(); }
}
async function directories(root, path) {
  let current = root;
  for (const part of localPath(path).split('/')) {
    current = join(current, part);
    await mkdir(current).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const info = await lstat(current);
    requireThat(info.isDirectory() && !info.isSymbolicLink(), 'Unsafe storage directory');
  }
}
async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}

// Hard-link publication is exclusive, unlike rename over an existing target.
// The temporary file is never proof. A crash leaves it harmlessly unreferenced.
async function publish(root, path, bytes) {
  localPath(path);
  await directories(root, dirname(path));
  const parent = join(root, dirname(path));
  const temp = join(parent, `.pending-${randomUUID()}`);
  const handle = await open(temp, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally { await handle.close(); }
  try {
    await link(temp, join(root, path));
    await syncDirectory(parent);
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  } finally { await unlink(temp); }
}

export class CurrentStore {
  constructor(home) { this.home = home; }
  static async at(home) {
    const absolute = resolve(home);
    const info = await lstat(absolute);
    requireThat(info.isDirectory() && !info.isSymbolicLink(), 'Feature home must be a real directory');
    return new CurrentStore(await realpath(absolute));
  }
  async put(bytes) {
    const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    requireThat(data.length <= MAX_BYTES, 'Evidence exceeds the supported size limit');
    const hash = digest(data);
    const path = `${AREA}/objects/${hash.slice(7)}`;
    const created = await publish(this.home, path, data);
    if (!created) requireThat(digest(await readSafe(this.home, path)) === hash, 'Existing retained evidence is corrupt');
    return { hash, bytes: data.length };
  }
  async get(ref) {
    requireThat(ref && HASH.test(ref.hash) && Number.isSafeInteger(ref.bytes) && ref.bytes >= 0, 'Invalid evidence reference');
    const bytes = await readSafe(this.home, `${AREA}/objects/${ref.hash.slice(7)}`);
    requireThat(bytes.length === ref.bytes && digest(bytes) === ref.hash, 'Retained evidence integrity failure');
    return bytes;
  }
  async putJson(value) { return { ...await this.put(canonical(value)), format: 'json' }; }
  async closure(value, seen = new Set()) {
    if (!value || typeof value !== 'object') return;
    if (HASH.test(value.hash) && Number.isSafeInteger(value.bytes)) {
      // Only typed generated JSON is traversed. Source and command output stay data.
      const bytes = await this.get(value);
      if (seen.has(value.hash)) return;
      seen.add(value.hash);
      if (value.format === 'json') await this.closure(JSON.parse(bytes.toString('utf8')), seen);
      return;
    }
    for (const child of Object.values(value)) await this.closure(child, seen);
  }
  async json(ref) { return JSON.parse((await this.get(ref)).toString('utf8')); }
  async fingerprint(path) {
    const bytes = await readSafe(this.home, localPath(path));
    return { path, hash: digest(bytes), bytes: bytes.length };
  }
  async capture(path) { return { path: localPath(path), ...await this.put(await readSafe(this.home, path)) }; }
  async currentBytes(ref) {
    const bytes = await readSafe(this.home, ref.path);
    requireThat(digest(bytes) === ref.hash && bytes.length === ref.bytes, `Canonical input changed: ${ref.path}`);
    await this.get(ref);
    return bytes;
  }
  async activationHead() {
    let bytes;
    try { bytes = await readSafe(this.home, `${AREA}/active.json`); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    const seen = new Set();
    while (true) {
      const hash = digest(bytes);
      requireThat(!seen.has(hash), 'Cyclic active reference'); seen.add(hash);
      let next;
      try { next = await readSafe(this.home, `${AREA}/activations/${hash.slice(7)}.json`); }
      catch (error) { if (error.code === 'ENOENT') return { bytes, hash }; throw error; }
      const value = JSON.parse(next.toString());
      requireThat(value.contract === CONTRACT && value.previous.hash === hash, 'Invalid activation successor');
      await this.get(value.previous);
      identifier(value.runId, 'replacement run');
      bytes = next;
    }
  }
  async active() {
    const head = await this.activationHead();
    if (!head) return null;
    const value = JSON.parse(head.bytes.toString('utf8'));
    requireThat(value.contract === CONTRACT, 'Unsupported current record; resume-current establishes a fresh run while preserving history');
    identifier(value.runId, 'active run');
    return { contract: value.contract, runId: value.runId };
  }
  async supersedeActive(runId, previous) {
    identifier(runId, 'replacement run');
    const events = await this.events(runId);
    requireThat(events[0]?.type === 'STARTED', 'Replacement run is not durable');
    const head = await this.activationHead();
    if (head.hash !== previous.hash) {
      requireThat((await this.active()).runId === runId, 'Concurrent activation selected another run');
      return;
    }
    const retained = await this.put(head.bytes);
    const value = { contract: CONTRACT, runId, previous: retained };
    const path = `${AREA}/activations/${head.hash.slice(7)}.json`;
    if (!await publish(this.home, path, Buffer.from(canonical(value)))) {
      requireThat((await this.active()).runId === runId, 'Concurrent activation selected another run');
    }
  }
  async activate(runId) {
    identifier(runId, 'run');
    const events = await this.events(runId);
    requireThat(events.length > 0 && events[0].type === 'STARTED', 'Cannot activate an incomplete run');
    const value = { contract: CONTRACT, runId };
    if (!await publish(this.home, `${AREA}/active.json`, Buffer.from(canonical(value)))) {
      requireThat((await this.active()).runId === runId, 'Another current run is already active');
    }
    return value;
  }
  async claimJob(jobId) {
    identifier(jobId, 'job');
    return publish(this.home, `${AREA}/claims/${jobId}.json`, Buffer.from(canonical({ jobId })));
  }
  async saveJob(jobId, value) {
    identifier(jobId, 'job');
    const path = `${AREA}/jobs/${jobId}.json`;
    if (!await publish(this.home, path, Buffer.from(canonical(value)))) {
      requireThat(identity(await this.job(jobId)) === identity(value), 'Conflicting retained job result');
    }
  }
  async job(jobId) {
    identifier(jobId, 'job');
    try { return JSON.parse((await readSafe(this.home, `${AREA}/jobs/${jobId}.json`)).toString()); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async events(runId) {
    identifier(runId, 'run');
    const dir = `${AREA}/runs/${runId}/events`;
    let names;
    try {
      const info = await lstat(join(this.home, dir));
      requireThat(info.isDirectory() && !info.isSymbolicLink(), 'Unsafe event directory');
      names = (await readdir(join(this.home, dir))).filter(name => /^\d{8}\.json$/u.test(name)).sort();
    } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const result = [];
    for (const name of names) {
      const record = JSON.parse((await readSafe(this.home, `${dir}/${name}`)).toString('utf8'));
      const { hash, ...event } = record;
      requireThat(event.contract === CONTRACT && event.runId === runId && event.sequence === result.length + 1
        && name === `${String(event.sequence).padStart(8, '0')}.json`
        && event.previous === (result.at(-1)?.hash ?? null) && hash === identity(event), 'Current journal integrity failure');
      result.push(record);
    }
    return result;
  }
  async append(runId, expected, type, payload, operation) {
    identifier(operation.id, 'operation');
    requireThat(HASH.test(operation.hash), 'Operation must bind its request');
    const events = await this.events(runId);
    const existing = events.find(item => item.operation.id === operation.id);
    if (existing) {
      requireThat(existing.operation.hash === operation.hash, 'Operation identity reused for different input');
      return existing;
    }
    requireThat(events.length === expected, 'Concurrent update; inspect current state and retry the same operation');
    const event = { contract: CONTRACT, runId, sequence: expected + 1,
      previous: events.at(-1)?.hash ?? null, type, payload, operation, recordedAt: new Date().toISOString() };
    const record = { ...event, hash: identity(event) };
    const path = `${AREA}/runs/${runId}/events/${String(event.sequence).padStart(8, '0')}.json`;
    if (!await publish(this.home, path, Buffer.from(canonical(record)))) {
      const winner = (await this.events(runId)).find(item => item.operation.id === operation.id);
      requireThat(winner?.operation.hash === operation.hash, 'Concurrent update; inspect current state and retry the same operation');
      return winner;
    }
    return record;
  }
}
