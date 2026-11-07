import { constants } from 'node:fs';
import { open, mkdir, lstat, readdir, writeFile, unlink, link } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes, createHmac, randomUUID } from 'node:crypto';

export const DEFAULTS = Object.freeze({ enabled: true, diagnosticDetails: false, detailDays: 90, summaryDays: 365, maxBytes: 100 * 1024 * 1024 });
const MARKER = 'gatereeve-performance/1\n';
const PENDING_OWNER = /^\.owner-[0-9a-f-]{36}$/u;
const ID = /^[a-f0-9]{64}$/;
const DAY = 86400000;
const MAX_RECORD = 8192;
export const CATEGORIES = ['operation', 'verification', 'unit', 'browser', 'integration', 'build', 'setup', 'review', 'delivery', 'reuse', 'poll', 'manual'];
const OPERATIONS=['approve-design','authorize-implementation','accept','authorize-merge','waive','amend','policy-amend','authorize-standing','revoke-standing','milestone:implementation','milestone:acceptance','milestone:merge','milestone:completion','candidate.prepare','candidate.ready','gate.execute','milestone.check','milestone.pass','human.decide','spec.validate','merge.prepare','merge.execute','integration.observe','run.start','run.resume-current','run.pause','run.continue','status','snapshot','next','read','coverage.status','source-view','provider-execution','release-observation','environment-fingerprint','environment-hash','environment-hash-bytes','review-prompt','review-history'];
export const OUTCOMES = ['PASS', 'FAIL', 'UNAVAILABLE', 'RUNNING', 'CANCELLED', 'REUSED', 'REJECTED', 'SKIPPED'];
export const REASONS = ['initial', 'source-change', 'configuration-change', 'remediation', 'retry', 'integration-change', 'investigation', 'unknown', 'inputs-changed', 'consumed-proof-changed', 'proof-unavailable', 'latest-not-pass', 'no-prior-proof', 'equivalent'];
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } };
export const rootPath = () => resolve(process.env.GATEREEVE_METRICS_DIR || join(homedir(), '.local/share/gatereeve/performance'));
function check(condition, message) { if (!condition) throw new Error(message); }
async function safeFile(path, max = MAX_RECORD) {
  const h = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const s = await h.stat(); check(s.isFile() && s.nlink === 1 && s.size <= max, 'Unsafe metrics file'); return await h.readFile('utf8'); } finally { await h.close(); }
}
// owner and key are published with link() (never replacing a winner's file),
// then the temporary name is removed, so a concurrent reader can briefly see two
// links (or one, by the time it looks again). Wait that out; a lasting extra
// link is still refused.
async function publishedFile(path) {
  for (let attempt = 0; ; attempt++) {
    try { return await safeFile(path); }
    catch (error) {
      const links = await lstat(path).then(s => s.nlink, () => 0);
      if (error.message !== 'Unsafe metrics file' || links < 1 || links > 2 || attempt >= 50) throw error;
      await new Promise(r => setTimeout(r, 10));
    }
  }
}
async function directory(path, create) {
  if (create) await mkdir(path, { recursive: true, mode: 0o700 });
  const s = await lstat(path); check(s.isDirectory() && !s.isSymbolicLink(), 'Unsafe metrics directory');
}
export function settings(value) {
  check(value && typeof value === 'object' && !Array.isArray(value), 'Invalid metrics settings');
  check(Object.keys(value).every(k => k in DEFAULTS), 'Unknown metrics setting');
  for(const key of ['enabled','diagnosticDetails']) if(key in value)check(typeof value[key]==='boolean', `${key} must be boolean`);
  for (const key of ['detailDays', 'summaryDays', 'maxBytes']) if (key in value) check(Number.isSafeInteger(value[key]) && value[key] >= (key === 'maxBytes' ? 65536 : 1) && value[key] <= (key === 'maxBytes' ? 1024 ** 3 : 3650), `Invalid ${key}`);
  return value;
}

// Storage: one SQLite database per owned store (node:sqlite, Node >= 22.13).
// Rows are kept in insertion order (rowid), so evicting the oldest records
// frees whole pages and the measured size falls as retention removes data.
// Writes are short IMMEDIATE transactions; WAL lets readers proceed during a
// write and a concurrent writer in another process waits up to busyTimeoutMs
// rather than dropping its observation. Queries select by indexed project,
// feature and start time instead of reading every record. Records are the
// same normalized JSON documents as before, so reports are unchanged.
const DATABASE = 'metrics.sqlite';
const SCHEMA_VERSION = 1;
const RECONCILE_WRITES = 1000, RECONCILE_MS = 3600000;
// At the byte cap, evict down to this fraction so reconciliation stays rare.
const PRESSURE_TARGET = 0.9;
const LEGACY_RECORD = /^[a-f0-9]{64}\.json$/;
let sqlite;
// Node 22 prints a one-time ExperimentalWarning when node:sqlite loads. Only
// that notice is dropped; every other warning still reaches the process.
async function loadSqlite() {
  sqlite ??= (async () => {
    const original = process.emitWarning;
    process.emitWarning = function (warning, ...rest) {
      const text = typeof warning === 'string' ? warning : warning?.message;
      const type = typeof rest[0] === 'string' ? rest[0] : rest[0]?.type ?? warning?.name;
      if (type === 'ExperimentalWarning' && /^SQLite is an experimental feature/u.test(text ?? '')) return;
      return original.call(this, warning, ...rest);
    };
    try { return await import('node:sqlite'); } finally { process.emitWarning = original; }
  })();
  return sqlite;
}
const SCHEMA = `
CREATE TABLE IF NOT EXISTS records (
  seq INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  started_at REAL NOT NULL,
  duration_ms REAL,
  outcome TEXT NOT NULL,
  pid INTEGER,
  summary INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS records_project_time ON records(project_id, started_at);
CREATE INDEX IF NOT EXISTS records_time ON records(started_at);
CREATE TABLE IF NOT EXISTS record_features (
  feature_id TEXT NOT NULL,
  record_seq INTEGER NOT NULL REFERENCES records(seq) ON DELETE CASCADE,
  PRIMARY KEY (feature_id, record_seq)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS record_features_record ON record_features(record_seq);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
`;
const busy = error => /database is locked|SQLITE_BUSY/iu.test(error?.message ?? '');
// One connection per store directory per process: observe() constructs a
// store per span, and each must not open (and leak) its own database handle.
const connections = new Map();

export class MetricsStore {
  constructor(root = rootPath(), { busyTimeoutMs = 2000, privateConnection = false } = {}) {
    this.root = resolve(root); this.busyTimeoutMs = busyTimeoutMs; this.privateConnection = privateConnection; this.db = null; this.keyValue = null;
  }
  async admit(create = false) {
    // Refuse symlink components, including an override's ancestors. Resolve the
    // platform's /var alias in callers rather than following unknown store links.
    const parts = []; let p = this.root;
    while (p !== dirname(p)) { parts.unshift(p); p = dirname(p); }
    for (const path of parts) {
      try { await directory(path, false); }
      catch (e) { if (e.code !== 'ENOENT' || !create) throw e; await directory(path, true); }
    }
    try { check(await publishedFile(join(this.root, 'owner')) === MARKER, 'Not an owned metrics store'); }
    catch (e) {
      if (!create || e.code !== 'ENOENT') throw e;
      // Publish the marker atomically, as key() does: a concurrent first writer
      // must never read a created-but-unwritten owner file, and link() never
      // replaces a winner's file. Only other creators' pending markers may
      // precede adoption.
      const pending = join(this.root, `.owner-${randomUUID()}`);
      try {
        check((await readdir(this.root)).every(name => PENDING_OWNER.test(name)), 'Refusing to adopt a nonempty directory');
        await writeFile(pending, MARKER, { flag: 'wx', mode: 0o600 });
        await link(pending, join(this.root, 'owner'));
      } catch (error) {
        // A concurrent first writer may have adopted the directory meanwhile.
        if (await publishedFile(join(this.root, 'owner')).catch(() => null) === MARKER) return;
        throw error;
      } finally { await unlink(pending).catch(() => {}); }
    }
  }
  // Opens (and in an owned store, creates) the database. A store that was never
  // owned stays untouched: reads report it empty without creating anything.
  async database(create = false) {
    if (this.db) return this.db;
    if (this.privateConnection) { this.db = await this.connect(create); return this.db; }
    let opening = connections.get(this.root);
    if (!opening) {
      opening = this.connect(create);
      connections.set(this.root, opening);
      opening.catch(() => { if (connections.get(this.root) === opening) connections.delete(this.root); });
    }
    this.db = await opening;
    return this.db;
  }
  async connect(create) {
    await this.admit(create);
    const path = join(this.root, DATABASE);
    for (const name of [DATABASE, `${DATABASE}-wal`, `${DATABASE}-shm`]) {
      try { const info = await lstat(join(this.root, name)); check(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, 'Unsafe metrics database'); }
      catch (e) { if (e.code !== 'ENOENT') throw e; if (name === DATABASE) await writeFile(path, '', { flag: 'wx', mode: 0o600 }).catch(error => { if (error.code !== 'EEXIST') throw error; }); }
    }
    const { DatabaseSync } = await loadSqlite();
    const db = new DatabaseSync(path);
    try {
      db.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.floor(this.busyTimeoutMs))}`);
      if (db.prepare('PRAGMA user_version').get().user_version === 0) {
        // auto_vacuum must precede the first table so deleted pages can be returned.
        db.exec('PRAGMA auto_vacuum = INCREMENTAL');
        db.exec('PRAGMA journal_mode = WAL');
        this.transaction(db, () => { if (db.prepare('PRAGMA user_version').get().user_version === 0) { db.exec(SCHEMA); db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`); } });
      } else db.exec('PRAGMA journal_mode = WAL');
      check(db.prepare('PRAGMA user_version').get().user_version === SCHEMA_VERSION, 'Unsupported metrics database version');
      db.exec('PRAGMA foreign_keys = ON');
      // WAL + NORMAL never corrupts; a power loss can drop the last few
      // observations, which capture-health reporting already tolerates.
      db.exec('PRAGMA synchronous = NORMAL');
    } catch (error) { db.close(); throw busy(error) ? new Error('Metrics store busy; capture may be incomplete') : error; }
    await this.migrateLegacy(db);
    return db;
  }
  close() {
    if (this.db && this.privateConnection) this.db.close();
    else if (this.db) { connections.delete(this.root); this.db.close(); }
    this.db = null;
  }
  transaction(db, fn) {
    try { db.exec('BEGIN IMMEDIATE'); }
    catch (error) { if (busy(error)) throw new Error('Metrics store busy; capture may be incomplete'); throw error; }
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { try { db.exec('ROLLBACK'); } catch { /* Already rolled back by SQLite. */ } throw busy(error) ? new Error('Metrics store busy; capture may be incomplete') : error; }
  }
  // rc.23 kept one JSON file per record. Import any such files (including ones
  // an older writer adds later), keep the existing database copy on conflict,
  // then remove them. Identities are unchanged because the key file is reused.
  async migrateLegacy(db) {
    const entries = await readdir(this.root, { withFileTypes: true });
    const records = entries.filter(entry => entry.isFile() && LEGACY_RECORD.test(entry.name)).map(entry => entry.name);
    const hasConfig = entries.some(entry => entry.isFile() && entry.name === 'config.json');
    if (!records.length && !hasConfig && !entries.some(entry => entry.name === 'budget.json')) return;
    const parsed = [], consumed = [];
    for (const name of records) {
      try { const record = readable(JSON.parse(await safeFile(join(this.root, name)))); if (record) { parsed.push(record); consumed.push(name); } }
      catch { /* Unsafe or unreadable legacy files stay in place and are not imported. */ }
    }
    let config = null;
    if (hasConfig) try { config = settings(JSON.parse(await safeFile(join(this.root, 'config.json')))); } catch { config = null; }
    this.transaction(db, () => {
      for (const record of parsed) this.write(db, record, { replace: false });
      if (config && !db.prepare("SELECT 1 FROM meta WHERE key='config'").get()) db.prepare("INSERT INTO meta(key, value) VALUES ('config', ?)").run(JSON.stringify({ ...DEFAULTS, ...config }));
    });
    for (const name of [...consumed, ...(config || hasConfig ? ['config.json'] : []), 'budget.json']) await unlink(join(this.root, name)).catch(() => {});
  }
  async markIncomplete() {
    // Best effort, fixed-size health marker in a previously admitted owned store.
    // A file, so it records loss even when the database itself is unavailable.
    try { await this.admit(); await writeFile(join(this.root,'capture-incomplete'),'',{flag:'wx',mode:0o600}); } catch {}
  }
  async captureIncomplete() { try { await lstat(join(this.root, 'capture-incomplete')); return true; } catch { return false; } }
  configFrom(db) {
    const row = db.prepare("SELECT value FROM meta WHERE key='config'").get();
    return row ? { ...DEFAULTS, ...settings(JSON.parse(row.value)) } : { ...DEFAULTS };
  }
  async config() {
    try { return this.configFrom(await this.database(false)); }
    catch (e) { if (e.code === 'ENOENT') return { ...DEFAULTS }; throw e; }
  }
  // Holds the write lock while fn runs. Other writers wait, then fail as busy.
  async lock(fn) {
    const db = await this.database(true);
    try { db.exec('BEGIN IMMEDIATE'); } catch (error) { throw busy(error) ? new Error('Metrics store busy; capture may be incomplete') : error; }
    try { const result = await fn(); db.exec('COMMIT'); return result; }
    catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
  }
  async key() {
    if (this.keyValue) return this.keyValue;
    try { this.keyValue = await publishedFile(join(this.root, 'key')); }
    catch (e) {
      if (e.code !== 'ENOENT') throw e;
      // Publish complete bytes atomically; a concurrent creator's key wins.
      const key = randomBytes(32).toString('hex'), pending = join(this.root, `.key-${randomUUID()}`);
      try { await writeFile(pending, key, { flag: 'wx', mode: 0o600 }); await link(pending, join(this.root, 'key')); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      finally { await unlink(pending).catch(() => {}); }
      this.keyValue = await publishedFile(join(this.root, 'key'));
    }
    return this.keyValue;
  }
  async identity(value) {
    await this.admit(); const key = this.keyValue ?? await publishedFile(join(this.root, 'key'));
    return createHmac('sha256', key).update(String(value)).digest('hex');
  }
  usedBytes(db) {
    const { page_count: pages } = db.prepare('PRAGMA page_count').get(), { freelist_count: free } = db.prepare('PRAGMA freelist_count').get();
    return (pages - free) * db.prepare('PRAGMA page_size').get().page_size;
  }
  write(db, record, { replace = true } = {}) {
    if (!replace && db.prepare('SELECT 1 FROM records WHERE id=?').get(record.id)) return;
    db.prepare(`INSERT INTO records(id, project_id, started_at, duration_ms, outcome, pid, summary, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, started_at=excluded.started_at, duration_ms=excluded.duration_ms,
      outcome=excluded.outcome, pid=excluded.pid, summary=excluded.summary, body=excluded.body`)
      .run(record.id, record.projectId, record.startedAt, record.durationMs, record.outcome, record.pid, record.summary ? 1 : 0, JSON.stringify(record));
    const { seq } = db.prepare('SELECT seq FROM records WHERE id=?').get(record.id);
    db.prepare('DELETE FROM record_features WHERE record_seq=?').run(seq);
    const insert = db.prepare('INSERT OR IGNORE INTO record_features(feature_id, record_seq) VALUES (?, ?)');
    for (const feature of record.featureIds) insert.run(feature, seq);
  }
  // Inventory rows for retention decisions: small columns only, oldest first.
  rows(db) {
    return db.prepare('SELECT seq, id, started_at AS startedAt, outcome, pid, summary, length(body) AS bytes FROM records ORDER BY started_at, seq').all();
  }
  async setConfig(patch) {
    settings(patch);
    const db = await this.database(true);
    return this.transaction(db, () => {
      const value = { ...this.configFrom(db), ...patch };
      check(value.maxBytes >= this.usedBytes(db) + MAX_RECORD, 'New cap must accommodate existing data; clean eligible metrics first');
      db.prepare("INSERT INTO meta(key, value) VALUES ('config', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(value)); return value;
    });
  }
  async assertSafeRoot() {
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      const stat = await lstat(join(this.root, entry.name));
      check(!stat.isSymbolicLink(), 'Unsafe metrics entry');
    }
  }
  async cleanup({ apply = false, now = Date.now(), needed = 0 } = {}) {
    let db;
    try { db = await this.database(apply); }
    catch (e) { if (e.code === 'ENOENT') return { bytes: 0, candidates: [], protected: 0 }; throw e; }
    await this.assertSafeRoot();
    if (!apply) return this.prune(db, now, needed, false);
    const result = this.transaction(db, () => this.prune(db, now, needed, true));
    db.exec('PRAGMA incremental_vacuum'); result.bytes = this.usedBytes(db);
    return result;
  }
  // Same retention contract as before: expired detail is compacted to a summary,
  // expired summaries are removed, running producers are protected, and byte
  // pressure removes the oldest records until the store is at PRESSURE_TARGET
  // of its cap. Applied pressure is measured from freed pages, not estimated.
  prune(db, now, needed, apply) {
    const config = this.configFrom(db), rows = this.rows(db);
    let protectedCount = 0; const candidates = [], removed = new Set();
    const live = row => row.outcome === 'RUNNING' && row.pid && alive(row.pid);
    for (const row of rows) {
      if (live(row)) { protectedCount++; continue; }
      const expired = now - row.startedAt > (row.summary ? config.summaryDays : config.detailDays) * DAY;
      if (!expired) continue;
      if (!row.summary && now - row.startedAt <= config.summaryDays * DAY) {
        candidates.push({ id: row.id, action: 'summarize' });
        if (apply) {
          const record = JSON.parse(db.prepare('SELECT body FROM records WHERE seq=?').get(row.seq).body);
          this.write(db, { ...record, summary: true, commandId: null, inputId: null, evidenceId: null });
        }
      } else {
        candidates.push({ id: row.id, action: 'remove' }); removed.add(row.seq);
        if (apply) db.prepare('DELETE FROM records WHERE seq=?').run(row.seq);
      }
    }
    const target = Math.floor(config.maxBytes * PRESSURE_TARGET) - needed - MAX_RECORD;
    const overhead = 128; // Approximate page share per row, for previews only.
    let bytes = this.usedBytes(db) - (apply ? 0 : rows.filter(row => removed.has(row.seq)).reduce((sum, row) => sum + row.bytes + overhead, 0));
    if (bytes + needed + MAX_RECORD > config.maxBytes) {
      const victims = rows.filter(row => !removed.has(row.seq) && !live(row));
      const batch = Math.max(1, Math.ceil(victims.length / 50));
      for (let index = 0; index < victims.length && bytes > target; index += apply ? batch : 1) {
        for (const row of apply ? victims.slice(index, index + batch) : [victims[index]]) {
          const position = candidates.findIndex(item => item.id === row.id);
          if (position >= 0) candidates.splice(position, 1);
          candidates.push({ id: row.id, action: 'remove' });
          if (apply) db.prepare('DELETE FROM records WHERE seq=?').run(row.seq); else bytes -= row.bytes + overhead;
        }
        if (apply) bytes = this.usedBytes(db);
      }
    }
    if (apply) {
      db.prepare("INSERT INTO meta(key, value) VALUES ('reconciled', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({ at: now, writes: 0 }));
      bytes = this.usedBytes(db);
    }
    return { bytes: Math.max(0, bytes), candidates, protected: protectedCount, incomplete: 0 };
  }
  // Constant-cost bookkeeping per write; full retention passes run after
  // RECONCILE_WRITES writes, after RECONCILE_MS, or under byte pressure.
  maintain(db, now) {
    const config = this.configFrom(db);
    const row = db.prepare("SELECT value FROM meta WHERE key='reconciled'").get();
    const state = row ? JSON.parse(row.value) : { at: 0, writes: 0 };
    const pressure = this.usedBytes(db) + MAX_RECORD > config.maxBytes;
    if (pressure || state.writes + 1 >= RECONCILE_WRITES || now - state.at >= RECONCILE_MS) { this.prune(db, now, 0, true); return true; }
    db.prepare("INSERT INTO meta(key, value) VALUES ('reconciled', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({ ...state, writes: state.writes + 1 }));
    return false;
  }
  async put(raw) {
    const db = await this.database(true);
    const config = this.configFrom(db);
    if (!config.enabled || process.env.GATEREEVE_METRICS === 'off') return null;
    const key = await this.key(); const hash = v => v == null ? null : createHmac('sha256', key).update(String(v)).digest('hex');
    const r = normalize(raw, hash);
    const reconciled = this.transaction(db, () => {
      const previous = db.prepare('SELECT body FROM records WHERE id=?').get(r.id);
      const old = previous ? readable(JSON.parse(previous.body)) : null;
      if (old) r.featureIds = [...new Set([...old.featureIds, ...r.featureIds])].slice(0, 32);
      if (old && r.category === 'poll') { r.durationMs = (old.durationMs ?? 0) + (r.durationMs ?? 0); r.count = (old.count ?? 1) + 1; r.startedAt = Math.min(old.startedAt, r.startedAt); }
      check(Buffer.byteLength(JSON.stringify(r)) <= MAX_RECORD, 'Metrics record too large');
      this.write(db, r);
      const pruned = this.maintain(db, Date.now());
      check(this.usedBytes(db) <= config.maxBytes, 'Metrics capacity exhausted; capture incomplete');
      return pruned;
    });
    if (reconciled) db.exec('PRAGMA incremental_vacuum');
    return r;
  }
  // Records matching an optional indexed selection (private project/feature
  // identities and start-time bounds in ms). Unknown labels from newer writers
  // remain readable; structurally invalid rows count as incomplete.
  async read({ projectId = null, featureId = null, since = null, until = null } = {}) {
    let db;
    try { db = await this.database(false); }
    catch (e) { if (e.code === 'ENOENT') return { bytes: 0, records: [], incomplete: 0, captureIncomplete: false }; throw e; }
    const where = [], params = [];
    let from = 'records r';
    if (featureId) { from = 'record_features f JOIN records r ON r.seq = f.record_seq'; where.push('f.feature_id = ?'); params.push(featureId); }
    if (projectId) { where.push('r.project_id = ?'); params.push(projectId); }
    if (since !== null) { where.push('r.started_at >= ?'); params.push(since); }
    if (until !== null) { where.push('r.started_at <= ?'); params.push(until); }
    const rows = db.prepare(`SELECT r.body FROM ${from}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY r.started_at, r.seq`).all(...params);
    let incomplete = 0; const records = [];
    for (const row of rows) { let record = null; try { record = readable(JSON.parse(row.body)); } catch { /* counted below */ } if (record) records.push({ record, bytes: row.body.length }); else incomplete++; }
    return { bytes: this.usedBytes(db), records, incomplete, captureIncomplete: await this.captureIncomplete() };
  }
  // Store-wide counts without loading records.
  async summary() {
    let db;
    try { db = await this.database(false); }
    catch (e) { if (e.code === 'ENOENT') return { bytes: 0, records: 0, untimed: 0, captureIncomplete: false }; throw e; }
    const { records, untimed } = db.prepare('SELECT count(*) AS records, sum(duration_ms IS NULL) AS untimed FROM records').get();
    return { bytes: this.usedBytes(db), records, untimed: untimed ?? 0, captureIncomplete: await this.captureIncomplete() };
  }
}
function normalize(raw, hash) {
  const r = {
    schemaVersion: 1, id:hash(raw.id ?? randomUUID()), parentId:hash(raw.parentId),
    sourceId:hash(raw.source), environmentId:hash(raw.environment), workflowId:hash(raw.workflow), attemptId:hash(raw.attempt), scope:['full','focused'].includes(raw.scope)?raw.scope:'unknown',
    projectId:hash(raw.project ?? 'unknown'), featureId:hash(raw.feature), featureIds:raw.feature?[hash(raw.feature)]:[], commandId:hash(raw.command), inputId:hash(raw.input), evidenceId:hash(raw.evidence),
    label:OPERATIONS.includes(raw.label??raw.command)?(raw.label??raw.command):(CATEGORIES.includes(raw.category)?raw.category:'manual'),
    category:CATEGORIES.includes(raw.category) ? raw.category : 'manual',
    outcome:OUTCOMES.includes(raw.outcome) ? raw.outcome : 'UNAVAILABLE', reason:REASONS.includes(raw.reason) ? raw.reason : 'unknown',
    startedAt:raw.startedAt, durationMs:raw.durationMs ?? null,
    clock:hash(raw.clock ?? `local:${process.pid}`), location:['local','ci','remote','release'].includes(raw.location) ? raw.location : 'local',
    provenance:['observed','declared','assessed','estimated','unknown'].includes(raw.provenance) ? raw.provenance : 'observed',
    worker:raw.worker === true, pid:raw.pid ?? null, count:Number.isSafeInteger(raw.count) && raw.count >= 0 ? raw.count : null,
    tokens:raw.tokens && typeof raw.tokens==='object' ? Object.fromEntries(['input','output','cachedInput','cacheCreation'].map(k=>[k,Number.isFinite(raw.tokens[k])&&raw.tokens[k]>=0?raw.tokens[k]:null])) : null,
    cost:Number.isFinite(raw.cost)&&raw.cost>=0?raw.cost:null,
    workMs:Number.isFinite(raw.workMs)&&raw.workMs>=0?raw.workMs:null,
    summary:false,
  };
  validateRecord(r); return r;
}
// Vocabulary fields written by a newer collector stay readable by this one.
const TERM = /^[a-z0-9][a-z0-9:._-]{0,63}$/iu;
function readable(r) { try { return validateRecord(r, { lenient: true }); } catch { return null; } }
export function validateRecord(r, { lenient = false } = {}) {
  const known = (list, value) => list.includes(value) || (lenient && typeof value === 'string' && TERM.test(value));
  check(r && typeof r === 'object' && !Array.isArray(r), 'Invalid metrics record');
  check(Object.keys(r).every(k=>['schemaVersion','sourceId','environmentId','workflowId','attemptId','scope','id','parentId','projectId','featureId','featureIds','commandId','inputId','evidenceId','category','label','outcome','reason','startedAt','durationMs','clock','location','provenance','worker','pid','count','summary','tokens','cost','workMs'].includes(k)), 'Unexpected metrics field');
  check(Array.isArray(r.featureIds)&&r.featureIds.length<=32&&r.featureIds.every(v=>ID.test(v)), 'Invalid feature attribution');
  for(const key of ['sourceId','environmentId','workflowId','attemptId','parentId','featureId','commandId','inputId','evidenceId','clock'])check(r[key]===null||ID.test(r[key]), 'Invalid private identity');
  check(known(OPERATIONS, r.label)||known(CATEGORIES, r.label),'Invalid label');
  check(known(REASONS, r.reason) && ['local','ci','remote','release'].includes(r.location) && ['observed','declared','assessed','estimated','unknown'].includes(r.provenance), 'Invalid metrics metadata');
  check(['full','focused','unknown'].includes(r.scope),'Invalid declared scope');
  check(r.count===null||Number.isSafeInteger(r.count)&&r.count>=0, 'Invalid count');
  check(typeof r.worker==='boolean' && typeof r.summary==='boolean','Invalid flags');
  check(r.workMs===null||Number.isFinite(r.workMs)&&r.workMs>=0,'Invalid work duration');
  check(r.cost===null||Number.isFinite(r.cost)&&r.cost>=0,'Invalid cost');
  if(r.tokens!==null)check(r.tokens && Object.keys(r.tokens).every(k=>['input','output','cachedInput','cacheCreation'].includes(k) && (r.tokens[k]===null||Number.isFinite(r.tokens[k])&&r.tokens[k]>=0)), 'Invalid usage');
  check(r.schemaVersion === 1 && ID.test(r.id) && ID.test(r.projectId), 'Invalid metrics record identity');
  check(Number.isFinite(r.startedAt) && r.startedAt >= 0 && (r.durationMs === null || Number.isFinite(r.durationMs) && r.durationMs >= 0), 'Invalid metrics timing');
  check(known(CATEGORIES, r.category) && known(OUTCOMES, r.outcome), 'Invalid metrics category');
  check(r.pid === null || Number.isInteger(r.pid) && r.pid > 0, 'Invalid producer PID');
  return r;
}
