import { constants } from 'node:fs';
import { lstat, open, mkdir, readdir, link, unlink, realpath } from 'node:fs/promises';
import { join, resolve, relative, sep, dirname, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { database, projectEvent, historyRow, inspectDatabase } from './workflow-database.js';
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
  static async at(home, workspaceRoot) {
    const absolute = resolve(home);
    if (workspaceRoot) {
      const root = resolve(workspaceRoot);
      const local = relative(root, absolute);
      requireThat(local && local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local), 'Feature home escaped workspace');
      let current = root;
      for (const part of local.split(sep)) {
        current = join(current, part);
        const info = await lstat(current);
        requireThat(info.isDirectory() && !info.isSymbolicLink(), 'Unsafe feature home ancestor');
      }
    }
    const info = await lstat(absolute);
    requireThat(info.isDirectory() && !info.isSymbolicLink(), 'Feature home must be a real directory');
    return new CurrentStore(await realpath(absolute));
  }
  async saveView(id, value) {
    identifier(id, 'view');
    return database(this.home, true, db => {
      requireThat(!db.prepare('SELECT id FROM views WHERE id=?').get(id), 'Review session already exists');
      db.prepare('INSERT INTO views(id,body) VALUES (?,?)').run(id, canonical(value));
    });
  }
  async finishView(id) { identifier(id, 'view'); await database(this.home, true, db => db.prepare('UPDATE views SET closed=1 WHERE id=?').run(id)); }
  async openViews() {
    return await database(this.home, false, db => db.prepare('SELECT id,body FROM views WHERE closed=0').all().map(row => ({ id: row.id, ...JSON.parse(row.body) }))) ?? [];
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
  async putJson(value) {
    const json = canonical(value);
    requireThat(Buffer.byteLength(json) <= MAX_BYTES, 'JSON metadata exceeds the 64 MiB retained-object size limit');
    return { ...await this.put(json), format: 'json' };
  }
  async closure(value, seen = new Set()) {
    if (!value || typeof value !== 'object') return;
    if (HASH.test(value.hash) && Number.isSafeInteger(value.bytes)) {
      // Only typed generated JSON is traversed. Source and command output stay data.
      const key = `${value.hash}:${value.bytes}:${value.format ?? 'bytes'}`;
      if (seen.has(key)) return;
      const bytes = await this.get(value);
      if (value.format === 'json') await this.closure(JSON.parse(bytes.toString('utf8')), seen);
      seen.add(key);
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
  // Read old activation pointers only to preserve provenance on explicit resume.
  // No old events are interpreted, repaired or copied into new authority.
  async legacyActivation() {
    const read = async path => { try { return await readSafe(this.home, path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
    let pair = [`${AREA}/active.json`, `${AREA}/active-witness.json`];
    const seen = new Set();
    let head = null;
    while (true) {
      const [a, b] = await Promise.all(pair.map(read));
      requireThat(!a || !b || a.equals(b), 'Conflicting retained journal copies; restore verified exact bytes');
      const bytes = a ?? b;
      if (!bytes) return head;
      const hash = digest(bytes);
      requireThat(!seen.has(hash), 'Cyclic active reference'); seen.add(hash);
      head = { bytes, hash };
      pair = [`${AREA}/activations/${hash.slice(7)}.json`, `${AREA}/activation-witnesses/${hash.slice(7)}.json`];
    }
  }
  async activationHead() {
    const value = await database(this.home, false, db => db.prepare("SELECT value FROM metadata WHERE key='active'").get()?.value ?? null);
    return value ? { bytes: Buffer.from(value), hash: digest(Buffer.from(value)) } : this.legacyActivation();
  }
  async active() {
    const value = await database(this.home, false, db => db.prepare("SELECT value FROM metadata WHERE key='active'").get()?.value ?? null);
    if (!value) {
      requireThat(!await this.legacyActivation(), 'Unsupported current record; resume-current establishes a fresh run while preserving history');
      return null;
    }
    const active = JSON.parse(value);
    requireThat(active.contract === CONTRACT, 'Unsupported current record; explicit resumption required');
    identifier(active.runId, 'active run');
    return active;
  }
  async supersedeActive(runId, previous) {
    const head = await this.activationHead();
    requireThat(head?.hash === previous.hash || (await this.active())?.runId === runId, 'Concurrent activation selected another run');
    const retained = await this.put(previous.bytes);
    return this.activate(runId, retained, previous.hash);
  }
  async activate(runId, previous = null, expectedActive = null) {
    identifier(runId, 'run');
    return database(this.home, true, db => {
      const first = db.prepare('SELECT body FROM events WHERE run_id=? AND sequence=1').get(runId);
      requireThat(first && JSON.parse(first.body).type === 'STARTED', 'Cannot activate an incomplete run');
      const existing = db.prepare("SELECT value FROM metadata WHERE key='active'").get();
      requireThat(!existing || JSON.parse(existing.value).runId === runId || (expectedActive && digest(Buffer.from(existing.value)) === expectedActive), 'Another current run is already active');
      const value = { contract: CONTRACT, runId, ...(previous ? { previous } : {}) };
      db.prepare("INSERT INTO metadata(key,value) VALUES ('active',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(canonical(value));
      return value;
    });
  }
  async claimJob(jobId) {
    identifier(jobId, 'job');
    return database(this.home, true, db => db.prepare('INSERT OR IGNORE INTO jobs(id,claimed) VALUES (?,1)').run(jobId).changes === 1);
  }
  async saveJob(jobId, value) {
    identifier(jobId, 'job');
    // Read retained artifacts before beginning the transaction.
    const results = await Promise.all((value.results ?? []).map(async ref => ({ ref, result: await this.json(ref) })));
    return database(this.home, true, db => {
      const old = db.prepare('SELECT body FROM jobs WHERE id=?').get(jobId)?.body;
      requireThat(!old || old === canonical(value), 'Conflicting retained job result');
      if (old) return;
      db.prepare('INSERT INTO jobs(id,claimed,body) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(jobId, canonical(value));
      const recordedAt = new Date().toISOString();
      for (const { ref, result } of results) {
        historyRow(db, { id: `${jobId}:${ref.hash}`, runId: value.runId, kind: 'assessment', recordedAt, source: 'execution', body: { reference: ref, ...result } });
        for (const [index, finding] of (result.findings ?? []).entries()) historyRow(db, { id: `${jobId}:${ref.hash}:finding:${index}`, runId: value.runId, kind: 'finding', recordedAt, source: 'reviewer', body: { ...finding, assessment: ref } });
        for (const [index, disposition] of (result.dispositions ?? []).entries()) historyRow(db, { id: `${jobId}:${ref.hash}:disposition:${index}`, runId: value.runId, kind: 'disposition', recordedAt, source: 'reviewer', body: { ...disposition, assessment: ref } });
      }
    });
  }
  async job(jobId) {
    identifier(jobId, 'job');
    return database(this.home, false, db => JSON.parse(db.prepare('SELECT body FROM jobs WHERE id=?').get(jobId)?.body ?? 'null'));
  }
  async events(runId) {
    identifier(runId, 'run');
    return await database(this.home, false, db => {
      let previous = null;
      return db.prepare('SELECT body FROM events WHERE run_id=? ORDER BY sequence').all(runId).map((row, index) => {
        const event = JSON.parse(row.body), { hash, ...body } = event;
        requireThat(event.contract === CONTRACT && event.runId === runId && event.sequence === index + 1
          && event.previous === previous && identity(body) === hash, 'Workflow event integrity failure');
        previous = hash; return event;
      });
    }) ?? [];
  }
  async append(runId, expected, type, payload, operation) {
    identifier(runId, 'run'); identifier(operation.id, 'operation');
    requireThat(HASH.test(operation.hash), 'Operation must bind its request');
    return database(this.home, true, db => {
      const found = db.prepare('SELECT body FROM events WHERE run_id=? AND operation_id=?').get(runId, operation.id);
      if (found) { const event = JSON.parse(found.body); requireThat(event.operation.hash === operation.hash, 'Operation identity reused for different input'); return event; }
      const previous = db.prepare('SELECT sequence,body FROM events WHERE run_id=? ORDER BY sequence DESC LIMIT 1').get(runId);
      requireThat((previous?.sequence ?? 0) === expected, 'Concurrent update; inspect current state and retry the same operation');
      const event = { contract: CONTRACT, runId, sequence: expected + 1, previous: previous ? JSON.parse(previous.body).hash : null,
        type, payload, operation, recordedAt: new Date().toISOString() };
      const record = { ...event, hash: identity(event) };
      db.prepare('INSERT INTO events VALUES (?,?,?,?)').run(runId, record.sequence, operation.id, canonical(record));
      projectEvent(db, record);
      return record;
    });
  }
  async history({ runId, kind, limit = 100, offset = 0 } = {}) {
    requireThat(Number.isInteger(limit) && limit >= 0 && limit <= 1000 && Number.isInteger(offset) && offset >= 0, 'Invalid history bounds');
    return await database(this.home, false, db => db.prepare('SELECT * FROM history WHERE (? IS NULL OR run_id=?) AND (? IS NULL OR kind=?) ORDER BY recorded_at,id LIMIT ? OFFSET ?')
      .all(runId ?? null, runId ?? null, kind ?? null, kind ?? null, limit, offset).map(row => ({ ...row, body: JSON.parse(row.body) }))) ?? [];
  }
  async inspect() { return inspectDatabase(this.home); }
}
