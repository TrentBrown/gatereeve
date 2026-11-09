import { DatabaseSync } from 'node:sqlite';
import { lstat, mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { CONTRACT, canonical, requireThat } from './contracts.js';

export const DATABASE_NAME = 'workflow.sqlite';
const VERSION = 1;
const SCHEMA = `
CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE events(run_id TEXT NOT NULL, sequence INTEGER NOT NULL, operation_id TEXT NOT NULL, body TEXT NOT NULL,
 PRIMARY KEY(run_id,sequence), UNIQUE(run_id,operation_id)) STRICT;
CREATE TABLE jobs(id TEXT PRIMARY KEY, claimed INTEGER NOT NULL DEFAULT 0, body TEXT) STRICT;
CREATE TABLE views(id TEXT PRIMARY KEY, body TEXT NOT NULL, closed INTEGER NOT NULL DEFAULT 0) STRICT;
CREATE TABLE history(id TEXT PRIMARY KEY, run_id TEXT NOT NULL, kind TEXT NOT NULL, recorded_at TEXT NOT NULL,
 source TEXT NOT NULL, body TEXT NOT NULL) STRICT;
CREATE INDEX history_run_kind ON history(run_id,kind,recorded_at);
PRAGMA user_version = 1;`;

// Each operation owns a short connection/transaction. No connection is retained
// across model or test execution, and inspection never creates an absent store.
export async function database(home, write, fn) {
  const directory = join(home, '.gatereeve-current'), path = join(directory, DATABASE_NAME);
  if (write) await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    const dir = await lstat(directory);
    requireThat(dir.isDirectory() && !dir.isSymbolicLink(), 'Unsafe workflow database directory');
    const info = await lstat(path);
    requireThat(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, 'Unsafe workflow database file');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!write) return null;
    try { const file = await open(path, 'wx', 0o600); await file.close(); }
    catch (cause) { if (cause.code !== 'EEXIST') throw cause; }
    const info = await lstat(path);
    requireThat(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, 'Unsafe workflow database file');
  }
  for (const suffix of ['-wal', '-shm']) {
    try { const info = await lstat(path + suffix); requireThat(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, 'Unsafe workflow database sidecar'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const db = new DatabaseSync(path, { readOnly: !write, enableForeignKeyConstraints: true });
  try {
    db.exec('PRAGMA busy_timeout = 2000');
    if (write) {
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('PRAGMA synchronous = FULL');
      db.exec('BEGIN IMMEDIATE');
    }
    try {
      let version = db.prepare('PRAGMA user_version').get().user_version;
      if (version === 0 && write) {
        requireThat(!db.prepare("SELECT name FROM sqlite_master WHERE type='table'").get(), 'Unrecognized workflow database');
        db.exec(SCHEMA);
        db.prepare('INSERT INTO metadata VALUES (?,?)').run('contract', CONTRACT);
        version = VERSION;
      }
      requireThat(version === VERSION, 'Unsupported workflow database schema; no automatic migration');
      requireThat(db.prepare('SELECT value FROM metadata WHERE key=?').get('contract')?.value === CONTRACT, 'Unsupported workflow database contract; preserve it and explicitly start a new workflow');
      const value = fn(db);
      requireThat(!value || typeof value.then !== 'function', 'Workflow transactions must not await external work');
      if (write) db.exec('COMMIT');
      return value;
    } catch (error) { if (write) db.exec('ROLLBACK'); throw error; }
  } finally { db.close(); }
}

export function historyRow(db, { id, runId, kind, recordedAt, source, body }) {
  db.prepare('INSERT INTO history VALUES (?,?,?,?,?,?)').run(id, runId, kind, recordedAt, source, canonical(body));
}
export function projectEvent(db, event) {
  const { runId, hash, type, payload, recordedAt } = event;
  const kind = ({ STARTED: 'workflow', DECIDED: 'decision', DECISION_PENDING: 'pending-decision',
    JOB_STARTED: 'execution-start', JOB_OUTCOME_READY: 'execution-outcome', JOB_FINISHED: 'execution-finish',
    CANDIDATE: 'candidate', OBSERVATION: 'observation', MILESTONE: 'milestone', INTEGRATED: 'integration' })[type] ?? 'workflow-event';
  historyRow(db, { id: hash, runId, kind, recordedAt, source: 'protocol', body: { type, ...payload } });
  if (type === 'STARTED') for (const [index, contextId] of (payload.implementers ?? []).entries()) {
    historyRow(db, { id: `${hash}:participant:${index}`, runId, kind: 'participant', recordedAt, source: 'protocol', body: { contextId, role: 'implementer' } });
  }
}
export async function inspectDatabase(home) {
  const path = join(home, '.gatereeve-current', DATABASE_NAME);
  try {
    const value = await database(home, false, db => ({ schemaVersion: VERSION, contract: CONTRACT,
      integrity: db.prepare('PRAGMA quick_check').get().quick_check,
      active: JSON.parse(db.prepare("SELECT value FROM metadata WHERE key='active'").get()?.value ?? 'null'),
      events: db.prepare('SELECT COUNT(*) AS count FROM events').get().count,
      history: db.prepare('SELECT kind, COUNT(*) AS count FROM history GROUP BY kind ORDER BY kind').all().map(row=>({...row})),
      openJobs: db.prepare('SELECT COUNT(*) AS count FROM jobs WHERE claimed=1 AND body IS NULL').get().count }));
    return value ? { path, exists: true, bytes: (await lstat(path)).size, ...value }
      : { path, exists: false, state: 'missing', recovery: 'Start or explicitly resume a fresh workflow; missing history grants no authority.' };
  } catch (error) { return { path, exists: true, state: 'unavailable', reason: error.message }; }
}
