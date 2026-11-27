import { existsSync } from 'node:fs';
import { inspectDatabase } from '../protocol/current/workflow-database.js';
import { DatabaseSync } from 'node:sqlite';
import { lstat } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { report, workerAccounting } from './report.js';
import { validateRecord } from './store.js';
import { OUTCOME_STATUSES } from '../protocol/current/boundary-review.js';
import { UNAVAILABLE_REASONS } from '../protocol/current/execution.js';
import { convergence } from './convergence.js';

export const SNAPSHOT_FORMAT = 'gatereeve-metrics-snapshot/1';
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const stable = value => JSON.stringify(value, function(key, item) { return item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b])=>compare(a,b))) : item; });
const hash = value => createHash('sha256').update(stable(value)).digest('hex');
const check = (ok, message) => { if (!ok) throw new Error(message); };
const label = value => typeof value === 'string' && value.length <= 1024 && !/[\x00-\x1f]/u.test(value);
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const SCHEMA = `
CREATE TABLE IF NOT EXISTS reporting_observations(id TEXT NOT NULL, version TEXT NOT NULL, observed_at TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(id,version)) STRICT;
CREATE TABLE IF NOT EXISTS reporting_latest(id TEXT PRIMARY KEY, version TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS reporting_datasets(id TEXT PRIMARY KEY, body TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS reporting_members(dataset TEXT NOT NULL, id TEXT NOT NULL, version TEXT NOT NULL, PRIMARY KEY(dataset,id)) STRICT;
CREATE TABLE IF NOT EXISTS reporting_analyses(id TEXT PRIMARY KEY,dataset TEXT NOT NULL,body TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS reporting_local(id TEXT PRIMARY KEY) STRICT;
CREATE TABLE IF NOT EXISTS reporting_workflows(id TEXT PRIMARY KEY, home TEXT NOT NULL, body TEXT NOT NULL) STRICT;
`;
export async function reportingDatabase(store, create = true) {
  let db;
  try { db = await store.database(create); } catch (error) { if (!create && error.code === 'ENOENT') return null; throw error; }
  if (create) db.exec(SCHEMA);
  else if (!db.prepare("SELECT name FROM sqlite_master WHERE name='reporting_datasets'").get()) return null;
  return db;
}
// Explicit allowlist: snapshot export never includes raw command arguments,
// environment values, conversation text or command/provider logs.
// Run dial and decision-authority fields (spec AC8). `rigor`/`autonomy` are the
// run's dial values when the observation's event was recorded; decisions carry
// their authority kind (and a delegated decision its basis); dial changes carry
// which dial, the change, its source, actor and hand-back/escalation trigger.
// `dialSource` is distinct from `source`, the reporting source identity.
export const DIAL_FIELDS = Object.freeze({ rigor: Object.freeze(['full','light']), autonomy: Object.freeze(['supervised','delegated','mandated','goal']) });
// Retained runs recorded `mandated` as `autonomous` before the rename (spec A1).
export const reportingDial = (dial, value) => dial === 'autonomy' && value === 'autonomous' ? 'mandated' : value;
// Rows stored, exported or snapshotted before the rename keep `autonomous`;
// every read and import normalizes them so validation, grouping and
// hand-back counts treat them as `mandated`.
export function normalizedObservation(value) {
  if (!value || typeof value !== 'object') return value;
  const next = { ...value };
  if (next.autonomy === 'autonomous') next.autonomy = 'mandated';
  if (next.dial === 'autonomy') for (const key of ['dialValue', 'dialPrevious']) if (next[key] === 'autonomous') next[key] = 'mandated';
  return next;
}
// `rule`: a verdict normalization or rejection rule, counted per review result (issue #141).
// `attempt`, `durationMs`, `tokens`: which attempt of a review round a result
// came from, with its execution time and provider usage (issue #142).
// Convergence fields (issue #149): per finding, per reviewer result, per round.
export const CONVERGENCE_FIELDS = Object.freeze(['severity','classId','classStatement','criterion','reviewerBlocking','blocking','demoted','hasFailureScenario','followUp',
  'reviewScope','round','band','reviewerStatus','unavailableReason','providerFailure','gates']);
const MEASUREMENT = ['rigor','autonomy','authorityKind','authorityBasis','dial','dialValue','dialPrevious','dialSource','actor','trigger','blocker','linkBasis','stage','count','categories','actions','rule','attempt','durationMs','tokens',...CONVERGENCE_FIELDS];
export const REVIEW_ATTEMPTS = Object.freeze(['initial', 'transient-retry', 'repair']);
const TOKEN_FIELDS = ['input', 'output', 'cachedInput', 'cacheCreation'];
const LISTS = ['links','categories','actions','gates'];
const FLAGS = ['reviewerBlocking','blocking','demoted','hasFailureScenario'];
export const SEVERITIES = Object.freeze(['high','medium','low','unrated']);
export const BANDS = Object.freeze(['legacy','all-non-low','high-and-medium-regressions','hand-back']);
// Set by follow-up records (issue #148); accepted here so the measures count it.
export const FOLLOW_UP_STATUSES = Object.freeze(['undecided','accepted-risk','new-work','fixed']);
const ENUMS = { severity: () => SEVERITIES, band: () => BANDS, followUp: () => FOLLOW_UP_STATUSES, reviewerStatus: () => OUTCOME_STATUSES, unavailableReason: () => UNAVAILABLE_REASONS };
export const LINK_BASES = Object.freeze(['human-stated','agent-proposed']);
export function observation(input) {
  const value = normalizedObservation(input);
  const allowed = ['id','source','observedAt','kind','project','projectKey','workflow','issue','branch','platform','check','model','provider','strategy','reason','outcome','findingId','fixId','links','reference','metrics','limitation','validator','contract',...MEASUREMENT];
  check(value && typeof value === 'object' && Object.keys(value).every(key => allowed.includes(key)), 'Unsupported reporting observation field');
  check(label(value.id) && value.id && label(value.source) && value.source && time(value.observedAt), 'Observation needs stable identity, source and observation time');
  check(['execution','finding','disposition','decision','milestone','strategy','friction','escaped-defect','artifact','event'].includes(value.kind), 'Unsupported observation kind');
  for (const key of allowed.filter(key => !['metrics','observedAt','count','round','durationMs','tokens',...FLAGS,...LISTS].includes(key))) if (value[key] != null) check(label(value[key]), `Invalid reporting ${key}`);
  for (const key of FLAGS) if (value[key] != null) check(typeof value[key] === 'boolean', `Invalid reporting ${key}`);
  for (const [key, values] of Object.entries(ENUMS)) if (value[key] != null) check(values().includes(value[key]), `Invalid reporting ${key}`);
  if (value.round != null) check(Number.isSafeInteger(value.round) && value.round >= 0, 'Invalid reporting round');
  if (value.classStatement != null) check(value.classStatement.length <= 200, 'Invalid reporting classStatement');
  if (value.attempt != null) check(REVIEW_ATTEMPTS.includes(value.attempt), 'Invalid reporting attempt');
  if (value.durationMs != null) check(Number.isFinite(value.durationMs) && value.durationMs >= 0, 'Invalid reporting duration');
  // Unknown usage stays null, never zero.
  if (value.tokens != null) check(typeof value.tokens === 'object' && !Array.isArray(value.tokens) && Object.keys(value.tokens).every(key => TOKEN_FIELDS.includes(key))
    && Object.values(value.tokens).every(item => item === null || (Number.isFinite(item) && item >= 0)), 'Invalid reporting tokens');
  for (const key of LISTS) if (value[key] != null) check(Array.isArray(value[key]) && value[key].length <= 32 && value[key].every(label), key === 'links' ? 'Invalid artifact references' : `Invalid reporting ${key}`);
  for (const dial of Object.keys(DIAL_FIELDS)) if (value[dial] != null) check(DIAL_FIELDS[dial].includes(value[dial]), `Invalid reporting ${dial}`);
  if (value.count != null) check(Number.isSafeInteger(value.count) && value.count >= 0, 'Invalid reporting count');
  // Only a human-stated or human-confirmed escaped-defect origin link has a
  // basis; reports count confirmed origins by it (older snapshots have none).
  if (value.linkBasis != null) check(value.kind === 'escaped-defect' && LINK_BASES.includes(value.linkBasis), 'Invalid escaped-defect link basis');
  if (value.metrics != null) validateRecord(value.metrics, { lenient: true });
  return JSON.parse(stable(value));
}
function source(value) {
  check(value && Object.keys(value).every(key => ['id','platform','capturedAt','since','until','status','limitations','collectorVersion'].includes(key)), 'Unsupported snapshot source field');
  check(label(value.id) && value.id && label(value.platform) && time(value.capturedAt), 'Invalid snapshot source');
  check(['available','partial','missing'].includes(value.status), 'Invalid source coverage');
  for (const key of ['since','until']) check(value[key] == null || time(value[key]), 'Invalid capture window');
  check(!value.since || !value.until || Date.parse(value.since) <= Date.parse(value.until), 'Reversed source capture window');
  check(Array.isArray(value.limitations) && value.limitations.every(label), 'Sources must disclose coverage limitations');
  return JSON.parse(stable(value));
}
export async function importSnapshot(input, store, { skipConflicts = false } = {}) {
  check(input?.format === SNAPSHOT_FORMAT, 'Unsupported snapshot format; use the explicit legacy import adapter');
  check(Array.isArray(input.sources) && Array.isArray(input.records) && input.records.length <= 100000, 'Invalid snapshot contents');
  check(Buffer.byteLength(JSON.stringify(input)) <= 64 * 1024 * 1024, 'Snapshot exceeds 64 MiB');
  const sources = input.sources.map(source), records = input.records.map(observation);
  const sourceIds = new Set(sources.map(item => item.id));
  check(sourceIds.size === sources.length, 'Duplicate source identity');
  check(new Set(records.map(item => item.id)).size === records.length, 'Duplicate observation identity');
  check(records.every(row => sourceIds.has(row.source)), 'Observation has unknown source');
  const canonical = { format: SNAPSHOT_FORMAT, sources: [...sources].sort((a,b) => compare(a.id,b.id)), records: [...records].sort((a,b) => compare(a.id,b.id)) };
  const id = hash(canonical), db = await reportingDatabase(store);
  return store.transaction(db, () => {
    if (db.prepare('SELECT id FROM reporting_datasets WHERE id=?').get(id)) return { dataset: id, records: records.length, reused: true };
    const conflicts = [];
    for (const row of records) {
      const version = hash(row);
      const historical = db.prepare('SELECT body,observed_at FROM reporting_observations WHERE id=?').all(row.id);
      // A stored pre-rename body equals its normalized form (spec A1).
      const storedBody = body => JSON.stringify(JSON.parse(stable(normalizedObservation(JSON.parse(body)))));
      // Explicit imports refuse a conflict. Local capture (spec AC2) keeps the
      // stored value, skips the conflicting row and reports it, so one bad row
      // (for example a test fixture's reused identity) cannot block capture.
      const conflict = reason => { if (!skipConflicts) check(false, reason); conflicts.push({ id: row.id, reason }); return true; };
      if (historical.some(old => Date.parse(old.observed_at) === Date.parse(row.observedAt) && storedBody(old.body) !== JSON.stringify(row))
        && conflict('Conflicting values for the same observation time')) continue;
      const latest = db.prepare('SELECT o.body,o.observed_at FROM reporting_observations o JOIN reporting_latest l ON o.id=l.id AND o.version=l.version WHERE o.id=?').get(row.id);
      if (latest && storedBody(latest.body) !== JSON.stringify(row)) {
        const old = JSON.parse(latest.body);
        if (!(old.source === row.source && old.kind === row.kind && (old.metrics && row.metrics ? old.metrics.projectId === row.metrics.projectId && old.metrics.featureId === row.metrics.featureId : old.workflow === row.workflow))
          && conflict('Conflicting observation identity')) continue;
        if (old.observedAt === row.observedAt && conflict('Conflicting values for the same observation time')) continue;
        if (old.metrics && row.metrics && !(old.metrics.id === row.metrics.id && old.metrics.startedAt === row.metrics.startedAt) && conflict('Conflicting execution identity')) continue;
      }
      db.prepare('INSERT OR IGNORE INTO reporting_observations VALUES (?,?,?,?)').run(row.id,version,row.observedAt,JSON.stringify(row));
      if (!latest || Date.parse(latest.observed_at) < Date.parse(row.observedAt)) db.prepare('INSERT INTO reporting_latest VALUES (?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version').run(row.id,version);
      db.prepare('INSERT INTO reporting_members VALUES (?,?,?)').run(id,row.id,version);
    }
    db.prepare('INSERT INTO reporting_datasets VALUES (?,?)').run(id,JSON.stringify({ format: SNAPSHOT_FORMAT, sources: canonical.sources, capturedAt: new Date().toISOString() }));
    check(store.usedBytes(db) <= store.configFrom(db).maxBytes, 'Reporting capacity exhausted; preview/apply eligible metrics cleanup or explicitly increase the configured limit');
    return { dataset: id, records: records.length - conflicts.length, reused: false, ...(skipConflicts ? { skipped: conflicts } : {}) };
  });
}
export async function exportSnapshot({ dataset } = {}, store) {
  const db = await reportingDatabase(store, false);
  check(db && label(dataset), 'Select a known report dataset');
  const found = db.prepare('SELECT body FROM reporting_datasets WHERE id=?').get(dataset);
  check(found, 'Unknown report dataset');
  const records = db.prepare('SELECT o.body FROM reporting_members m JOIN reporting_observations o ON o.id=m.id AND o.version=m.version WHERE m.dataset=? ORDER BY o.id').all(dataset).map(row => normalizedObservation(JSON.parse(row.body)));
  return { format: SNAPSHOT_FORMAT, sources: JSON.parse(found.body).sources, records };
}
// Observation rows for a report: a fixed dataset's members, or this store's
// own latest projected rows (as capture would snapshot them).
export async function reportingObservations(store, dataset) {
  if (dataset != null) return (await exportSnapshot({ dataset }, store)).records;
  const db = await reportingDatabase(store, false);
  return db ? db.prepare('SELECT o.body FROM reporting_local x JOIN reporting_latest l ON l.id=x.id JOIN reporting_observations o ON o.id=l.id AND o.version=l.version').all().map(row => normalizedObservation(JSON.parse(row.body))) : [];
}
export async function listDatasets(store) {
  const db = await reportingDatabase(store, false);
  return { datasets: db ? db.prepare('SELECT id,body,(SELECT COUNT(*) FROM reporting_members m WHERE m.dataset=d.id) AS records FROM reporting_datasets d ORDER BY rowid DESC').all().map(({ id,body,records }) => ({ id, records, ...JSON.parse(body) })) : [] };
}
export async function captureSnapshot(input = {}, store) {
  check(Object.keys(input).every(key => ['platform','missingSources'].includes(key)), 'Unknown capture option');
  const platform = input.platform ?? hostname(); check(label(platform) && platform, 'Invalid platform label');
  const inventory = await store.read({}), now = new Date().toISOString();
  await store.admit(true); await store.key();
  const sourceId = await store.identity(`source:${hostname()}`);
  const records = inventory.records.map(({record}) => observation({ id: `${sourceId}:${record.id}`, source: sourceId, observedAt: now, kind: 'execution',
    projectKey: `${sourceId}:${record.projectId}`, project: record.display?.project ?? `Unknown project (${record.projectId.slice(0,8)})`, ...(record.display ?? {}), workflow: record.workflowId ?? (record.featureId ? `Unknown run (${record.featureId.slice(0,8)})` : null), platform, check: record.display?.check ?? record.label, outcome: record.outcome, metrics: record }));
  const db = await reportingDatabase(store, false);
  if (db) for (const row of db.prepare('SELECT body FROM reporting_workflows').all()) {
    const workflow = JSON.parse(row.body);
    for (const item of records) if (item.metrics?.projectId === workflow.projectId) {
      item.project = workflow.project;
      if (item.metrics.featureIds.includes(workflow.featureId)) { item.issue = workflow.issue; if (item.metrics.workflowId === workflow.workflow) { item.workflow = workflow.workflow; item.branch ??= workflow.branch; } }
    }

  }
  if (db) records.push(...db.prepare('SELECT o.body FROM reporting_local x JOIN reporting_latest l ON l.id=x.id JOIN reporting_observations o ON o.id=l.id AND o.version=l.version').all().map(row=>normalizedObservation(JSON.parse(row.body))));
  const sources = [{ id: sourceId, platform, capturedAt: now, since: records.length ? new Date(records.reduce((at,row)=>Math.min(at,row.metrics?.startedAt ?? Date.parse(row.observedAt)),Date.parse(now))).toISOString() : null,
    until: now, status: inventory.captureIncomplete ? 'partial' : 'available', collectorVersion: 'reporting/1',
    limitations: ['Uninstrumented work and total execution denominator are unknown.', ...(inventory.captureIncomplete ? ['Collector reported incomplete capture.'] : [])] }];
  for (const row of records) if (!sources.some(item => item.id === row.source)) sources.push({ ...sources[0], id: row.source, platform: row.platform ?? platform });
  for (const missing of input.missingSources ?? []) { check(label(missing) && missing, 'Invalid missing source'); sources.push({ id: `missing:${missing}`, platform: missing, capturedAt: now, since: null, until: null, status: 'missing', limitations: ['No snapshot available at capture.'] }); }
  return importSnapshot({ format: SNAPSHOT_FORMAT, sources, records }, store, { skipConflicts: true });
}
export async function importLegacySnapshot({ records, platform, sourceId, capturedAt, labels = {} }, store) {
  check(label(sourceId) && label(platform) && time(capturedAt) && Array.isArray(records), 'Legacy import needs explicit source, platform and capture time');
  const rows = records.map(metrics => { validateRecord(metrics, { lenient: true }); return observation({ id: `${sourceId}:${metrics.id}`, source: sourceId, observedAt: capturedAt, kind: 'execution',
    projectKey: `${sourceId}:${metrics.projectId}`, ...(metrics.display ?? {}), project: labels[metrics.projectId] ?? metrics.display?.project ?? `Unknown project (${metrics.projectId.slice(0,8)})`, workflow: metrics.workflowId ?? (metrics.featureId ? `Unknown run (${metrics.featureId.slice(0,8)})` : null), platform, check: metrics.label, outcome: metrics.outcome, metrics }); });
  return importSnapshot({ format: SNAPSHOT_FORMAT, sources: [{ id: sourceId, platform, capturedAt, since: null, until: capturedAt, status: 'partial', collectorVersion: 'legacy-performance/1', limitations: ['Historical rc.23/rc.24 export; coverage window and execution denominator may be incomplete. Labels are supplied mappings, not inferred identities.'] }], records: rows }, store);
}
const projectKey = row => row.projectKey ?? (row.metrics?.projectId ? `${row.source}:${row.metrics.projectId}` : `${row.source}:${row.project ?? 'Unknown'}`);
// Observations projected before dial measurement (and execution timings, which
// are not run events) have no dial fields. They are grouped as not recorded,
// never as full/supervised.
export const NOT_RECORDED = 'Not recorded';
// Reports never present the absence of escaped-defect records as evidence of
// safety (spec AC8), and dial comparisons say why they are not causal.
export function escapedDefectStatement(records, confirmed) {
  if (!records) return 'No escaped defects recorded. The absence of escaped-defect records is not evidence that no defects escaped, or that light or delegated runs are safe.';
  return `${records} escaped defect${records === 1 ? '' : 's'} recorded, ${confirmed} with a human-stated or human-confirmed origin link. Only recorded defects are counted; unrecorded defects are unknown, so this is neither a defect rate nor evidence of safety.`;
}
export const DIAL_COMPARISON_CAVEAT = 'Rigor and autonomy groups are compared from recorded observations only: runs are not randomized, escaped-defect capture depends on human attribution and is incomplete, and observations recorded before dial measurement are grouped as not recorded. Differences between groups are not evidence that light or delegated work is safe.';
const tally = (rows, key) => { const counts = {}; for (const row of rows) { const value = row[key] ?? NOT_RECORDED; counts[value] = (counts[value] ?? 0) + 1; } return Object.fromEntries(Object.entries(counts).sort(([a],[b]) => compare(a,b))); };
// Counts derived from projected run events: dial settings and changes,
// escalations, hand-backs, delegated and human decisions, tripwires, external
// blockers and escaped defects. Nothing here is inferred from missing rows.
export function measurement(rows) {
  const dials = rows.filter(row => row.check === 'DIAL_SET'), initial = rows.filter(row => row.check === 'DIAL_INITIAL');
  const escalations = dials.filter(row => row.dial === 'rigor' && row.dialPrevious === 'light' && row.dialValue === 'full');
  const handBacks = dials.filter(row => row.dial === 'autonomy' && ['delegated','mandated','goal'].includes(row.dialPrevious) && row.dialValue === 'supervised');
  const decisions = rows.filter(row => row.kind === 'decision');
  const tripwires = rows.filter(row => row.check === 'TRIPWIRES_EVALUATED');
  const defects = rows.filter(row => row.kind === 'escaped-defect');
  const confirmed = defects.filter(row => LINK_BASES.includes(row.linkBasis) && row.links?.length);
  return {
    runs: { started: rows.filter(row => row.check === 'STARTED').length, byRigor: tally(rows.filter(row => row.check === 'STARTED'), 'rigor'), byAutonomy: tally(rows.filter(row => row.check === 'STARTED'), 'autonomy') },
    dialChanges: dials.length,
    escalations: { total: escalations.length, byTrigger: tally(escalations, 'trigger') },
    handBacks: { total: handBacks.length, byTrigger: tally(handBacks, 'trigger') },
    explicitStarts: tally(initial.filter(row => row.dialSource === 'explicit'), 'dialValue'),
    delegations: [...initial, ...dials].filter(row => row.dial === 'autonomy' && row.dialValue === 'delegated').length,
    decisions: { total: decisions.length, byAuthority: tally(decisions, 'authorityKind'), standingApplications: decisions.filter(row => row.authorityBasis === 'standing-grant').length },
    humanWait: humanWait(decisions, rows),
    humanTouches: decisions.filter(row => row.authorityKind === 'human-confirmed' && row.authorityBasis !== 'standing-grant').length + [...initial, ...dials].filter(row => row.actor === 'human').length,
    tripwires: { evaluations: tripwires.length, withHits: tripwires.filter(row => row.count > 0).length, hits: tripwires.reduce((sum, row) => sum + (row.count ?? 0), 0),
      stayLight: decisions.filter(row => row.check === 'stay-light').length },
    planningReviews: rows.filter(row => row.check?.startsWith('planning-review:')).length,
    externalBlockers: rows.filter(row => row.check === 'MERGE_BLOCKED').length,
    escapedDefects: { records: defects.length, confirmedOriginLinks: confirmed.length, byBasis: tally(confirmed, 'linkBasis'), statement: escapedDefectStatement(defects.length, confirmed.length) },
    caveat: DIAL_COMPARISON_CAVEAT,
    convergence: convergence(rows),
  };
}
// Spec AC2: the human's wait is from the recorded question (decision.ask) to
// the human-confirmed answer of the same kind in the same workflow. Decisions
// with no recorded question stay unmeasured rather than reading as zero.
export function humanWait(decisions, rows) {
  const asked = rows.filter(row => row.check?.startsWith('asked:'));
  const waits = [];
  let unmeasured = 0;
  for (const decision of decisions.filter(row => row.authorityKind === 'human-confirmed')) {
    const at = Date.parse(decision.observedAt);
    const earlier = decisions.filter(row => row !== decision && row.workflow === decision.workflow && row.check === decision.check && Date.parse(row.observedAt) < at)
      .reduce((latest, row) => Math.max(latest, Date.parse(row.observedAt)), -Infinity);
    const question = asked.filter(row => row.workflow === decision.workflow && row.check === `asked:${decision.check}`
      && Date.parse(row.observedAt) <= at && Date.parse(row.observedAt) > earlier)
      .reduce((first, row) => Math.min(first, Date.parse(row.observedAt)), Infinity);
    if (Number.isFinite(question)) waits.push(at - question); else unmeasured += 1;
  }
  const sorted = [...waits].sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
  return { measured: waits.length, unmeasured, totalMs: waits.reduce((sum, value) => sum + value, 0), medianMs: median };
}
function group(rows, key, work, missing = 'Unknown') {
  const groups = new Map();
  for (const row of rows) {
    const id = key === 'project' ? projectKey(row) : row[key] ?? missing;
    if (!groups.has(id)) groups.set(id, { id,
      name: key === 'project' ? row.project ?? 'Unknown' : key === 'workflow' && row.issue ? [row.issue,row.branch].filter(Boolean).join(' · ') : id,
      observations: 0, executions: 0, failures: 0, findings: 0, recordedWorkerMs: 0, hasWorker: false, ids: [] });
    const group = groups.get(id);
    group.observations++; group.executions += Number(row.kind === 'execution');
    group.failures += Number(row.outcome === 'FAIL'); group.findings += Number(row.kind === 'finding'); group.ids.push(row.id);
    if (row.metrics?.worker) {
      group.hasWorker = true;
      const amount = work.get(`${row.source}:${row.metrics.id}`);
      group.recordedWorkerMs = group.recordedWorkerMs == null || amount == null ? null : group.recordedWorkerMs + amount;
    }
  }
  return [...groups.values()].sort((a,b)=>compare(a.id,b.id)).map(({hasWorker,...row})=>({...row,recordedWorkerMs:hasWorker?row.recordedWorkerMs:null}));
}
export async function reevaluationReport(input, store) {
  check(input && Object.keys(input).every(key => ['dataset','project','workflow','platform','check','model'].includes(key)), 'Invalid reevaluation filter');
  const snapshot = await exportSnapshot(input, store);
  const rows = snapshot.records.filter(row => ['project','workflow','platform','check','model'].every(key => input[key] == null || (input[key] === row[key] || (key === 'project' && input[key] === projectKey(row)))));
  // Existing accounting computes nested exclusive work and union elapsed per
  // clock. Source-prefix all private IDs so imported independent stores cannot collide.
  const allMetrics = snapshot.records.filter(row => row.metrics).map(row => { const r = structuredClone(row.metrics); for (const key of ['id','parentId','clock','projectId','commandId']) if (r[key]) r[key] = `${row.source}:${r[key]}`; return r; });
  const selected = new Set(rows.filter(row=>row.metrics).map(row=>`${row.source}:${row.metrics.id}`));
  const metrics = allMetrics.filter(row=>selected.has(row.id));
  const work = new Map(workerAccounting(allMetrics).workers.map(row=>[row.id,row.workerMs]));
  const timings = await report({ limit: 1000 }, { read: async () => ({records:metrics.map(record => ({record})), accountingRecords:allMetrics, incomplete:0}), summary:async()=>({}) });
  return { format: 'gatereeve-reevaluation/1', dataset: input.dataset, filters: input, sources: snapshot.sources,
    totals: timings.totals, coverage: { ...timings.coverage, missingSources: snapshot.sources.filter(row => row.status === 'missing').map(row => row.platform),
      gaps: [...timings.coverage.gaps, ...snapshot.sources.flatMap(row => row.limitations), 'Snapshot freshness and source coverage are independent of observed work totals.'] },
    projects: group(rows,'project',work), workflows: group(rows,'workflow',work), checks: group(rows,'check',work), models: group(rows,'model',work), platforms: group(rows,'platform',work), validators: group(rows,'validator',work), strategies: group(rows,'strategy',work),
    rigors: group(rows.filter(row=>row.kind!=='execution'),'rigor',work,NOT_RECORDED), autonomies: group(rows.filter(row=>row.kind!=='execution'),'autonomy',work,NOT_RECORDED), authorities: group(rows.filter(row=>row.kind==='decision'),'authorityKind',work,NOT_RECORDED),
    outcomes: {findings:rows.filter(row=>row.kind==='finding').length,dispositions:rows.filter(row=>row.kind==='disposition').length,escapedDefects:rows.filter(row=>row.kind==='escaped-defect').length,friction:rows.filter(row=>row.kind==='friction').length},
    measurement: measurement(rows),
    repetitions: timings.repetitions, reuse: timings.reuse, detailListsTruncated: timings.detailListsTruncated, operationCost: timings.operationCost, observations: rows,
    interpretation: 'Recorded observations only. Repetition is not proof of waste; findings are not a measured escaped-defect rate, and the absence of escaped-defect records is not evidence of safety. No causal speedup is inferred.' };
}
const escape = value => String(value ?? 'Unknown').replace(/[&<>"']/gu, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function renderReevaluation(value, format = 'json') {
  if (format === 'json') return JSON.stringify(value,null,2);
  check(format === 'html', 'Reevaluation supports JSON or HTML');
  const table = (title, rows) => `<h2>${title}</h2><table><thead><tr><th>Name</th><th>Observations</th><th>Executions</th><th>Failures</th><th>Findings</th><th>Recorded worker time</th></tr></thead><tbody>${rows.map(row => `<tr><td><details><summary>${escape(row.name)}</summary><small>${escape(row.id)}</small><br>${row.ids.map(id => `<a href="#record-${hash(id)}">${escape(id)}</a>`).join('<br>')}</details></td><td>${row.observations}</td><td>${row.executions}</td><td>${row.failures}</td><td>${row.findings}</td><td>${row.recordedWorkerMs==null?'Unknown':Math.round(row.recordedWorkerMs/1000)+'s'}</td></tr>`).join('')}</tbody></table>`;
  const costs = value.operationCost.filter(row=>row.exclusiveMs!=null).slice(0,8), maxCost = Math.max(1,...costs.map(row=>row.exclusiveMs));
  const chart = `<h2>Observed operation time</h2><p>Exclusive recorded time; concurrent operations are not a critical path.</p>${costs.map(row=>`<div><span>${escape(row.label)} · ${Math.round(row.exclusiveMs/1000)}s</span><div role="img" aria-label="${escape(row.label)}: ${Math.round(row.exclusiveMs/1000)} seconds" style="width:${100*row.exclusiveMs/maxCost}%;height:12px;background:#307c69;margin:4px 0 12px"></div></div>`).join('')}`;
  const m = value.measurement, entries = counts => Object.entries(counts ?? {}).map(([name,n]) => `${escape(name)} ${n}`).join(', ') || 'none';
  const dials = m ? `<h2>Rigor, autonomy and decision authority</h2><p>${escape(m.caveat)}</p><ul><li>Runs started: ${m.runs.started} (rigor: ${entries(m.runs.byRigor)}; autonomy: ${entries(m.runs.byAutonomy)})</li><li>Dial changes: ${m.dialChanges} · delegations ${m.delegations} · escalations to full ${m.escalations.total} (${entries(m.escalations.byTrigger)}) · hand-backs ${m.handBacks.total} (${entries(m.handBacks.byTrigger)})</li><li>Decisions: ${m.decisions.total} (${entries(m.decisions.byAuthority)}; ${m.decisions.standingApplications} applied under a standing grant) · human touches ${m.humanTouches}</li><li>Tripwire evaluations: ${m.tripwires.evaluations} · with hits ${m.tripwires.withHits} · hits ${m.tripwires.hits} · stay-light decisions ${m.tripwires.stayLight}</li><li>Planning reviews: ${m.planningReviews} · external merge blockers ${m.externalBlockers}</li></ul>` : '';
  // Convergence measures (issue #149): each measure's reading, coverage and denominator.
  const c = m?.convergence, reading = met => met === true ? 'met' : met === false ? 'not met' : 'not measurable';
  const conv = c ? `<h2>Convergence measures</h2><p>${escape(c.caveat)}</p><ul><li>Rounds to PASS: ${reading(c.rounds.met)} · median ${c.rounds.medianRoundsToPass ?? 'none'} over ${c.rounds.denominator.scopes} scopes (passed ${c.rounds.denominator.passed}, open ${c.rounds.denominator.open}, waived ${c.rounds.denominator.waived}) · waives after a FAIL streak ${c.rounds.waivesAfterFailStreak.length} · coverage ${c.rounds.coverage}</li><li>Demoted findings: ${reading(c.demoted.met)} · ${c.demoted.denominator.demoted} demoted of ${c.demoted.denominator.findings} (${entries(c.demoted.recorded.bySeverity)}) · ${c.demoted.recorded.withSeverityAndScenario} with severity and failure scenario · ${escape(c.demoted.decided.statement ?? `decided: ${entries(c.demoted.decided.byFollowUp)}`)} · coverage ${c.demoted.coverage}</li><li>Escaped defects traced to demoted findings: ${c.escapedFromDemoted.traced} of ${c.escapedFromDemoted.denominator.confirmed} confirmed · ${escape(c.escapedFromDemoted.threshold)}</li><li>Second opinion: ${reading(c.secondOpinion.met)} · ${c.secondOpinion.providers.map(row => `${escape(row.provider)} ${row.unavailable}/${row.rounds} UNAVAILABLE, ${row.findings} findings`).join('; ') || 'no reviewer rounds'} · coverage ${c.secondOpinion.coverage}</li></ul>` : '';
  const repeats = `<details><summary>Repeated work and recorded reasons (${value.repetitions.length} groups)</summary>${value.repetitions.map(row=>`<p>${row.executions} executions · ${escape(row.classification)}<br>${row.reasons.map(escape).join(', ')}<br>${escape(row.conclusion)}</p>`).join('')}<p>${value.detailListsTruncated?'Detail lists are bounded; inspect observations for the full dataset.':''}</p></details>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>GateReeve workflow reevaluation</title><style>body{font:16px system-ui;max-width:1100px;margin:2rem auto;padding:1rem;color:#17322c;background:#f6f8f7}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:.6rem;border-bottom:1px solid #ccd8d3}pre{white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer}a{overflow-wrap:anywhere}details{margin:.5rem 0}.stats{font-size:1.2rem}</style><h1>Workflow reevaluation</h1><p>Fixed dataset ${escape(value.dataset)}</p><p class="stats">${value.totals.records} timed observations · ${value.totals.workerMs == null ? 'Unknown' : Math.round(value.totals.workerMs/1000)+'s'} recorded worker time · ${value.totals.observedElapsedMs == null ? 'Unknown across clocks' : Math.round(value.totals.observedElapsedMs/1000)+'s'} observed elapsed</p><p>${escape(value.interpretation)}</p><p>Unattributed recorded operation time: ${value.coverage.operationAttribution?.unattributedFraction==null?'Unknown':(100*value.coverage.operationAttribution.unattributedFraction).toFixed(1)+'%'}. This is not a percentage of all developer time.</p><p>${value.outcomes.findings} findings · ${value.outcomes.dispositions} dispositions · ${value.outcomes.friction} friction notes.</p><h2>Escaped defects</h2><p>${escape(value.measurement?.escapedDefects.statement ?? escapedDefectStatement(value.outcomes.escapedDefects, 0))}</p>${dials}${conv}${chart}${repeats}<h2>Sources and coverage</h2>${value.sources.map(row=>`<p><b>${escape(row.platform)}</b> · ${escape(row.status)} · captured ${escape(row.capturedAt)} · covered ${escape(row.since)} to ${escape(row.until)}<br>${row.limitations.map(escape).join(' ')}</p>`).join('')}<details><summary>Accounting limitations</summary><ul>${value.coverage.gaps.map(gap=>`<li>${escape(gap)}</li>`).join('')}</ul></details>${table('Projects',value.projects)}${table('Validator types',value.validators ?? [])}${table('Workflows',value.workflows)}${table('Checks and reviewers',value.checks)}${table('Models',value.models)}${table('Platforms',value.platforms)}${table('Strategies',value.strategies)}${table('Rigor',value.rigors ?? [])}${table('Autonomy',value.autonomies ?? [])}${table('Decision authority',value.authorities ?? [])}<h2>Evidence drill down</h2>${value.observations.map(row=>`<details id="record-${hash(row.id)}"><summary>${escape(row.project)} · ${escape(row.check ?? row.kind)} · ${escape(row.outcome ?? row.kind)}</summary><pre>${escape(JSON.stringify(row,null,2))}</pre></details>`).join('')}</html>`;
}

export async function combineSnapshots({ datasets }, store) {
  check(Array.isArray(datasets) && datasets.length > 0 && datasets.length <= 100, 'Select 1–100 datasets');
  const records = new Map(), sources = new Map();
  for (const dataset of datasets) {
    const snapshot = await exportSnapshot({dataset},store);
    for (const item of snapshot.sources) {
      const prior = sources.get(item.id);
      if (!prior) { sources.set(item.id,item); continue; }
      const newest = Date.parse(item.capturedAt) > Date.parse(prior.capturedAt) ? item : prior;
      const bound = (key, pick) => prior[key] && item[key] ? new Date(pick(Date.parse(prior[key]),Date.parse(item[key]))).toISOString() : null;
      sources.set(item.id, { ...newest, since: bound('since',Math.min), until: bound('until',Math.max),
        status: prior.status === item.status ? item.status : 'partial',
        collectorVersion: prior.collectorVersion === item.collectorVersion ? item.collectorVersion : 'mixed',
        limitations: [...new Set([...prior.limitations,...item.limitations])].sort(compare) });
    }
    for (const item of snapshot.records) {
      const prior = records.get(item.id);
      if (prior && prior.observedAt === item.observedAt) check(JSON.stringify(prior) === JSON.stringify(item), 'Conflicting overlapping snapshot observation');
      if (!prior || Date.parse(item.observedAt) > Date.parse(prior.observedAt)) records.set(item.id,item);
      check(records.size <= 100000, 'Combined snapshot exceeds 100000 observations');
    }
  }
  return importSnapshot({ format: SNAPSHOT_FORMAT, sources:[...sources.values()], records:[...records.values()] },store);
}
export async function knownDatabases(input, store) {
  check(Object.keys(input).every(key=>key==='workflow'), 'Database inspection accepts only a known workflow identity');
  const path = `${store.root}/metrics.sqlite`;
  let rows = [], metrics = {path,exists:false,purpose:'Shared reporting observations; no workflow authority'};
  try {
    await store.admit(false);
    const info = await lstat(path); check(info.isFile() && !info.isSymbolicLink() && info.nlink===1,'Unsafe metrics database');
    const db = new DatabaseSync(path,{readOnly:true});
    try {
      metrics = {...metrics,exists:true,bytes:info.size,schemaVersion:db.prepare('PRAGMA user_version').get().user_version,integrity:db.prepare('PRAGMA quick_check').get().quick_check};
      if(db.prepare("SELECT name FROM sqlite_master WHERE name='reporting_workflows'").get()) rows=db.prepare('SELECT id,home,body FROM reporting_workflows').all();
    } finally { db.close(); }
  } catch(error) { if(error.code!=='ENOENT')metrics={...metrics,state:'unavailable',reason:error.message}; }
  if (input.workflow) {
    const row = rows.find(row=>row.id === input.workflow); check(row, 'Unknown local workflow database');
    return inspectDatabase(row.home);
  }
  return { metrics, workflows: rows.map(row=>({id:row.id,home:row.home,issue:JSON.parse(row.body).issue,project:JSON.parse(row.body).project})),
    discovery:'Known local workflows only; no recursive filesystem scan. Imported reports never register workflow authority.',
    reset:'Workflow reset is not provided. If the database is lost, explicitly start a fresh run with observed approvals; documents remain intact.' };
}

export async function reportingCounts(store) {
  let db; try { db = await reportingDatabase(store, false); } catch { db = null; }
  if (!db) return { observations: 0, workflows: 0, datasets: 0 };
  const count = sql => db.prepare(sql).get().n;
  return { observations: count('SELECT COUNT(*) AS n FROM reporting_latest'), workflows: count('SELECT COUNT(*) AS n FROM reporting_workflows'), datasets: count('SELECT COUNT(*) AS n FROM reporting_datasets') };
}
// Spec AC2: rows from test-suite fixtures are removed on request. Preview by
// default. A workflow is test data only when (1) its database lived below a
// temporary directory in a directory with the exact shape the suites create
// (a fixture prefix the suites use plus the random suffix of Node mkdtemp or
// Python tempfile) and (2) that workflow folder no longer exists: suites
// delete their fixtures, a real workspace is still on disk.
export const temporaryRoots = () => [...new Set([tmpdir(), '/tmp', '/var/tmp', '/private/tmp', '/var/folders', '/private/var/folders'].map(path => resolve(path)))];
export const TEST_FIXTURE_DIRECTORY = /^(?:gatereeve-(?:current|current-surface|dials|light|s5|targets)-[A-Za-z0-9]{6}|gatereeve session start [a-z0-9_]{8})$/u;
export const temporaryHome = (home, roots = temporaryRoots()) => typeof home === 'string' && roots.some(root => home.startsWith(`${root}/`)
  && home.slice(root.length + 1).split('/').some(part => TEST_FIXTURE_DIRECTORY.test(part)));
const fixtureGone = home => !existsSync(home);
// D33 descoping (scratchpad [7]): the preview proposes candidates by fixture
// shape; deletion removes only the workflows the human names from it.
export async function purgeTestData({ apply = false, workflows: named, roots } = {}, store) {
  check(typeof apply === 'boolean', 'Purge accepts apply boolean and named workflows');
  check(!apply || (Array.isArray(named) && named.length > 0 && named.every(id => typeof id === 'string' && id)), 'Apply names the workflows to remove (IDs from the preview)');
  const db = await reportingDatabase(store, false);
  if (!db) { check(!apply, 'No reporting store: nothing to remove'); return { workflows: 0, observations: 0, projects: [], candidates: [], applied: false }; }
  const candidates = db.prepare('SELECT id,home,body FROM reporting_workflows').all().filter(row => temporaryHome(row.home, roots) && fixtureGone(row.home));
  let selected = candidates;
  if (apply) {
    const known = new Set(candidates.map(row => row.id));
    const unknown = named.filter(id => !known.has(id));
    check(!unknown.length, `Not a current purge candidate: ${unknown.slice(0, 5).join(', ')}; run the preview again`);
    const chosen = new Set(named); selected = candidates.filter(row => chosen.has(row.id));
  }
  const ids = new Set(selected.map(row => row.id));
  const keys = new Set(selected.map(row => JSON.parse(row.body).projectKey).filter(Boolean));
  // A project key shared with any workflow not selected keeps its observations.
  for (const row of db.prepare('SELECT id,body FROM reporting_workflows').all()) if (!ids.has(row.id)) keys.delete(JSON.parse(row.body).projectKey);
  const matched = new Map();
  for (const row of db.prepare('SELECT id,body FROM reporting_observations').all()) {
    if (matched.has(row.id)) continue;
    const body = JSON.parse(row.body);
    if (ids.has(body.workflow) || keys.has(body.projectKey)) matched.set(row.id, body.project ?? 'Unknown project');
  }
  const projects = {};
  for (const project of matched.values()) { const name = project.replace(/[-_ ][A-Za-z0-9_]{6,8}$/u, '-*'); projects[name] = (projects[name] ?? 0) + 1; }
  if (apply) store.transaction(db, () => {
    const list = JSON.stringify([...matched.keys()]), workflowList = JSON.stringify([...ids]);
    for (const table of ['reporting_observations', 'reporting_latest', 'reporting_local', 'reporting_members']) db.prepare(`DELETE FROM ${table} WHERE id IN (SELECT value FROM json_each(?))`).run(list);
    db.prepare('DELETE FROM reporting_workflows WHERE id IN (SELECT value FROM json_each(?))').run(workflowList);
  });
  return { workflows: ids.size, observations: matched.size, projects: Object.entries(projects).sort((a, b) => b[1] - a[1]).map(([project, count]) => ({ project, count })), applied: apply,
    candidates: apply ? [] : candidates.map(row => ({ id: row.id, home: row.home })),
    rule: 'Preview: workflows in a test-suite fixture directory shape under a temporary directory whose folder no longer exists. Apply removes only the named workflows and their observations.' };
}
export async function cleanupReporting({apply=false} = {},store) {
  const db=await reportingDatabase(store,false);if(!db)return {datasets:0,observations:0,applied:apply};
  const threshold=new Date(Date.now()-store.configFrom(db).summaryDays*86400000).toISOString();
  const ids=db.prepare('SELECT id,body FROM reporting_datasets').all().filter(row=>JSON.parse(row.body).capturedAt<threshold).map(row=>row.id);
  const expired=db.prepare('SELECT COUNT(*) AS n FROM reporting_local x JOIN reporting_latest l ON l.id=x.id JOIN reporting_observations o ON o.id=l.id AND o.version=l.version WHERE o.observed_at<?').get(threshold).n;
  if(apply)store.transaction(db,()=>{
    for(const id of ids){db.prepare('DELETE FROM reporting_members WHERE dataset=?').run(id);db.prepare('DELETE FROM reporting_analyses WHERE dataset=?').run(id);db.prepare('DELETE FROM reporting_datasets WHERE id=?').run(id);}
    db.prepare('DELETE FROM reporting_local WHERE id IN (SELECT l.id FROM reporting_latest l JOIN reporting_observations o ON o.id=l.id AND o.version=l.version WHERE o.observed_at<?)').run(threshold);
    db.exec('DELETE FROM reporting_observations WHERE NOT EXISTS (SELECT 1 FROM reporting_members m WHERE m.id=reporting_observations.id AND m.version=reporting_observations.version) AND NOT EXISTS (SELECT 1 FROM reporting_local x WHERE x.id=reporting_observations.id); DELETE FROM reporting_latest WHERE NOT EXISTS (SELECT 1 FROM reporting_observations o WHERE o.id=reporting_latest.id AND o.version=reporting_latest.version)');
  });
  return {datasets:ids.length,observations:expired,applied:apply,policy:'Shared metrics summary retention; authoritative workflow databases and artifacts are never touched.'};
}
