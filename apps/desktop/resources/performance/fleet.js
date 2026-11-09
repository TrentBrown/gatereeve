import { inspectDatabase } from '../protocol/current/workflow-database.js';
import { DatabaseSync } from 'node:sqlite';
import { lstat } from 'node:fs/promises';
import { hostname } from 'node:os';
import { createHash } from 'node:crypto';
import { report } from './report.js';
import { validateRecord } from './store.js';

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
export function observation(value) {
  const allowed = ['id','source','observedAt','kind','project','projectKey','workflow','issue','branch','platform','check','model','provider','strategy','reason','outcome','findingId','fixId','links','reference','metrics','limitation','validator','contract'];
  check(value && typeof value === 'object' && Object.keys(value).every(key => allowed.includes(key)), 'Unsupported reporting observation field');
  check(label(value.id) && value.id && label(value.source) && value.source && time(value.observedAt), 'Observation needs stable identity, source and observation time');
  check(['execution','finding','disposition','decision','milestone','strategy','friction','escaped-defect','artifact','event'].includes(value.kind), 'Unsupported observation kind');
  for (const key of allowed.filter(key => !['metrics','links','observedAt'].includes(key))) if (value[key] != null) check(label(value[key]), `Invalid reporting ${key}`);
  if (value.links != null) check(Array.isArray(value.links) && value.links.length <= 32 && value.links.every(label), 'Invalid artifact references');
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
export async function importSnapshot(input, store) {
  check(input?.format === SNAPSHOT_FORMAT, 'Unsupported snapshot format; use the explicit legacy import adapter');
  check(Array.isArray(input.sources) && Array.isArray(input.records) && input.records.length <= 100000, 'Invalid snapshot contents');
  check(Buffer.byteLength(JSON.stringify(input)) <= 64 * 1024 * 1024, 'Snapshot exceeds 64 MiB');
  const sources = input.sources.map(source), records = input.records.map(observation);
  check(new Set(sources.map(item => item.id)).size === sources.length, 'Duplicate source identity');
  check(new Set(records.map(item => item.id)).size === records.length, 'Duplicate observation identity');
  check(records.every(row => sources.some(item => item.id === row.source)), 'Observation has unknown source');
  const canonical = { format: SNAPSHOT_FORMAT, sources: [...sources].sort((a,b) => compare(a.id,b.id)), records: [...records].sort((a,b) => compare(a.id,b.id)) };
  const id = hash(canonical), db = await reportingDatabase(store);
  return store.transaction(db, () => {
    if (db.prepare('SELECT id FROM reporting_datasets WHERE id=?').get(id)) return { dataset: id, records: records.length, reused: true };
    for (const row of records) {
      const version = hash(row);
      const historical = db.prepare('SELECT body,observed_at FROM reporting_observations WHERE id=?').all(row.id);
      check(!historical.some(old => Date.parse(old.observed_at) === Date.parse(row.observedAt) && old.body !== JSON.stringify(row)), 'Conflicting values for the same observation time');
      const latest = db.prepare('SELECT o.body,o.observed_at FROM reporting_observations o JOIN reporting_latest l ON o.id=l.id AND o.version=l.version WHERE o.id=?').get(row.id);
      if (latest && latest.body !== JSON.stringify(row)) {
        const old = JSON.parse(latest.body);
        check(old.source === row.source && old.kind === row.kind && (old.metrics && row.metrics ? old.metrics.projectId === row.metrics.projectId && old.metrics.featureId === row.metrics.featureId : old.workflow === row.workflow), 'Conflicting observation identity');
        check(old.observedAt !== row.observedAt, 'Conflicting values for the same observation time');
        if (old.metrics && row.metrics) check(old.metrics.id === row.metrics.id && old.metrics.startedAt === row.metrics.startedAt, 'Conflicting execution identity');
      }
      db.prepare('INSERT OR IGNORE INTO reporting_observations VALUES (?,?,?,?)').run(row.id,version,row.observedAt,JSON.stringify(row));
      if (!latest || Date.parse(latest.observed_at) < Date.parse(row.observedAt)) db.prepare('INSERT INTO reporting_latest VALUES (?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version').run(row.id,version);
      db.prepare('INSERT INTO reporting_members VALUES (?,?,?)').run(id,row.id,version);
    }
    db.prepare('INSERT INTO reporting_datasets VALUES (?,?)').run(id,JSON.stringify({ format: SNAPSHOT_FORMAT, sources: canonical.sources, capturedAt: new Date().toISOString() }));
    check(store.usedBytes(db) <= store.configFrom(db).maxBytes, 'Reporting capacity exhausted; preview/apply eligible metrics cleanup or explicitly increase the configured limit');
    return { dataset: id, records: records.length, reused: false };
  });
}
export async function exportSnapshot({ dataset } = {}, store) {
  const db = await reportingDatabase(store, false);
  check(db && label(dataset), 'Select a known report dataset');
  const found = db.prepare('SELECT body FROM reporting_datasets WHERE id=?').get(dataset);
  check(found, 'Unknown report dataset');
  const records = db.prepare('SELECT o.body FROM reporting_members m JOIN reporting_observations o ON o.id=m.id AND o.version=m.version WHERE m.dataset=? ORDER BY o.id').all(dataset).map(row => JSON.parse(row.body));
  return { format: SNAPSHOT_FORMAT, sources: JSON.parse(found.body).sources, records };
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
  if (db) records.push(...db.prepare('SELECT o.body FROM reporting_local x JOIN reporting_latest l ON l.id=x.id JOIN reporting_observations o ON o.id=l.id AND o.version=l.version').all().map(row=>JSON.parse(row.body)));
  const sources = [{ id: sourceId, platform, capturedAt: now, since: records.length ? new Date(records.reduce((at,row)=>Math.min(at,row.metrics?.startedAt ?? Date.parse(row.observedAt)),Date.parse(now))).toISOString() : null,
    until: now, status: inventory.captureIncomplete ? 'partial' : 'available', collectorVersion: 'reporting/1',
    limitations: ['Uninstrumented work and total execution denominator are unknown.', ...(inventory.captureIncomplete ? ['Collector reported incomplete capture.'] : [])] }];
  for (const row of records) if (!sources.some(item => item.id === row.source)) sources.push({ ...sources[0], id: row.source, platform: row.platform ?? platform });
  for (const missing of input.missingSources ?? []) { check(label(missing) && missing, 'Invalid missing source'); sources.push({ id: `missing:${missing}`, platform: missing, capturedAt: now, since: null, until: null, status: 'missing', limitations: ['No snapshot available at capture.'] }); }
  return importSnapshot({ format: SNAPSHOT_FORMAT, sources, records }, store);
}
export async function importLegacySnapshot({ records, platform, sourceId, capturedAt, labels = {} }, store) {
  check(label(sourceId) && label(platform) && time(capturedAt) && Array.isArray(records), 'Legacy import needs explicit source, platform and capture time');
  const rows = records.map(metrics => { validateRecord(metrics, { lenient: true }); return observation({ id: `${sourceId}:${metrics.id}`, source: sourceId, observedAt: capturedAt, kind: 'execution',
    projectKey: `${sourceId}:${metrics.projectId}`, project: labels[metrics.projectId] ?? `Unknown project (${metrics.projectId.slice(0,8)})`, workflow: metrics.featureId, platform, check: metrics.label, outcome: metrics.outcome, metrics }); });
  return importSnapshot({ format: SNAPSHOT_FORMAT, sources: [{ id: sourceId, platform, capturedAt, since: null, until: capturedAt, status: 'partial', collectorVersion: 'legacy-performance/1', limitations: ['Historical rc.23/rc.24 export; coverage window and execution denominator may be incomplete. Labels are supplied mappings, not inferred identities.'] }], records: rows }, store);
}
const projectKey = row => row.projectKey ?? (row.metrics?.projectId ? `${row.source}:${row.metrics.projectId}` : `${row.source}:${row.project ?? 'Unknown'}`);
function group(rows, key) {
  const identity = row => key === 'project' ? projectKey(row) : row[key] ?? 'Unknown';
  return [...new Set(rows.map(identity))].sort().map(id => {
    const selected = rows.filter(row => identity(row) === id), timed = selected.filter(row => row.metrics?.worker);
    const name = key === 'project' ? selected[0].project ?? 'Unknown' : key === 'workflow' && selected[0].issue ? [selected[0].issue,selected[0].branch].filter(Boolean).join(' · ') : id;
    return { id, name, observations: selected.length, executions: selected.filter(row => row.kind === 'execution').length,
      failures: selected.filter(row => row.outcome === 'FAIL').length, findings: selected.filter(row => row.kind === 'finding').length,
      recordedWorkerMs: timed.length && timed.every(row => row.metrics.durationMs !== null) ? timed.reduce((sum,row) => sum + row.metrics.durationMs,0) : null,
      ids: selected.map(row => row.id) };
  });
}
export async function reevaluationReport(input, store) {
  check(input && Object.keys(input).every(key => ['dataset','project','workflow','platform','check','model'].includes(key)), 'Invalid reevaluation filter');
  const snapshot = await exportSnapshot(input, store);
  const rows = snapshot.records.filter(row => ['project','workflow','platform','check','model'].every(key => input[key] == null || (input[key] === row[key] || (key === 'project' && input[key] === projectKey(row)))));
  // Existing accounting computes nested exclusive work and union elapsed per
  // clock. Source-prefix all private IDs so imported independent stores cannot collide.
  const metrics = rows.filter(row => row.metrics).map(row => { const r = structuredClone(row.metrics); for (const key of ['id','parentId','clock','projectId','commandId']) if (r[key]) r[key] = `${row.source}:${r[key]}`; return r; });
  const timings = await report({ limit: 1000 }, { read: async () => ({records:metrics.map(record => ({record})), incomplete:0}), summary:async()=>({}) });
  return { format: 'gatereeve-reevaluation/1', dataset: input.dataset, filters: input, sources: snapshot.sources,
    totals: timings.totals, coverage: { ...timings.coverage, missingSources: snapshot.sources.filter(row => row.status === 'missing').map(row => row.platform),
      gaps: [...timings.coverage.gaps, ...snapshot.sources.flatMap(row => row.limitations), 'Snapshot freshness and source coverage are independent of observed work totals.'] },
    projects: group(rows,'project'), workflows: group(rows,'workflow'), checks: group(rows,'check'), models: group(rows,'model'), platforms: group(rows,'platform'), validators: group(rows,'validator'), strategies: group(rows,'strategy'),
    outcomes: {findings:rows.filter(row=>row.kind==='finding').length,dispositions:rows.filter(row=>row.kind==='disposition').length,escapedDefects:rows.filter(row=>row.kind==='escaped-defect').length,friction:rows.filter(row=>row.kind==='friction').length},
    repetitions: timings.repetitions, reuse: timings.reuse, detailListsTruncated: timings.detailListsTruncated, operationCost: timings.operationCost, observations: rows,
    interpretation: 'Recorded observations only. Repetition is not proof of waste; findings are not a measured escaped-defect rate. No causal speedup is inferred.' };
}
const escape = value => String(value ?? 'Unknown').replace(/[&<>"']/gu, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function renderReevaluation(value, format = 'json') {
  if (format === 'json') return JSON.stringify(value,null,2);
  check(format === 'html', 'Reevaluation supports JSON or HTML');
  const table = (title, rows) => `<h2>${title}</h2><table><thead><tr><th>Name</th><th>Observations</th><th>Executions</th><th>Failures</th><th>Findings</th><th>Recorded worker time</th></tr></thead><tbody>${rows.map(row => `<tr><td><details><summary>${escape(row.name)}</summary><small>${escape(row.id)}</small><br>${row.ids.map(id => `<a href="#record-${hash(id)}">${escape(id)}</a>`).join('<br>')}</details></td><td>${row.observations}</td><td>${row.executions}</td><td>${row.failures}</td><td>${row.findings}</td><td>${row.recordedWorkerMs==null?'Unknown':Math.round(row.recordedWorkerMs/1000)+'s'}</td></tr>`).join('')}</tbody></table>`;
  const costs = value.operationCost.filter(row=>row.exclusiveMs!=null).slice(0,8), maxCost = Math.max(1,...costs.map(row=>row.exclusiveMs));
  const chart = `<h2>Observed operation time</h2><p>Exclusive recorded time; concurrent operations are not a critical path.</p>${costs.map(row=>`<div><span>${escape(row.label)} · ${Math.round(row.exclusiveMs/1000)}s</span><div role="img" aria-label="${escape(row.label)}: ${Math.round(row.exclusiveMs/1000)} seconds" style="width:${100*row.exclusiveMs/maxCost}%;height:12px;background:#307c69;margin:4px 0 12px"></div></div>`).join('')}`;
  const repeats = `<details><summary>Repeated work and recorded reasons (${value.repetitions.length} groups)</summary>${value.repetitions.map(row=>`<p>${row.executions} executions · ${escape(row.classification)}<br>${row.reasons.map(escape).join(', ')}<br>${escape(row.conclusion)}</p>`).join('')}<p>${value.detailListsTruncated?'Detail lists are bounded; inspect observations for the full dataset.':''}</p></details>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>GateReeve workflow reevaluation</title><style>body{font:16px system-ui;max-width:1100px;margin:2rem auto;padding:1rem;color:#17322c;background:#f6f8f7}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:.6rem;border-bottom:1px solid #ccd8d3}pre{white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer}a{overflow-wrap:anywhere}details{margin:.5rem 0}.stats{font-size:1.2rem}</style><h1>Workflow reevaluation</h1><p>Fixed dataset ${escape(value.dataset)}</p><p class="stats">${value.totals.records} timed observations · ${value.totals.workerMs == null ? 'Unknown' : Math.round(value.totals.workerMs/1000)+'s'} recorded worker time · ${value.totals.observedElapsedMs == null ? 'Unknown across clocks' : Math.round(value.totals.observedElapsedMs/1000)+'s'} observed elapsed</p><p>${escape(value.interpretation)}</p><p>Unattributed recorded operation time: ${value.coverage.operationAttribution?.unattributedFraction==null?'Unknown':(100*value.coverage.operationAttribution.unattributedFraction).toFixed(1)+'%'}. This is not a percentage of all developer time.</p><p>${value.outcomes.findings} findings · ${value.outcomes.dispositions} dispositions · ${value.outcomes.escapedDefects} linked escaped defects · ${value.outcomes.friction} friction notes. Missing capture is not zero defects.</p>${chart}${repeats}<h2>Sources and coverage</h2>${value.sources.map(row=>`<p><b>${escape(row.platform)}</b> · ${escape(row.status)} · captured ${escape(row.capturedAt)} · covered ${escape(row.since)} to ${escape(row.until)}<br>${row.limitations.map(escape).join(' ')}</p>`).join('')}<details><summary>Accounting limitations</summary><ul>${value.coverage.gaps.map(gap=>`<li>${escape(gap)}</li>`).join('')}</ul></details>${table('Projects',value.projects)}${table('Validator types',value.validators ?? [])}${table('Workflows',value.workflows)}${table('Checks and reviewers',value.checks)}${table('Models',value.models)}${table('Platforms',value.platforms)}${table('Strategies',value.strategies)}<h2>Evidence drill down</h2>${value.observations.map(row=>`<details id="record-${hash(row.id)}"><summary>${escape(row.project)} · ${escape(row.check ?? row.kind)} · ${escape(row.outcome ?? row.kind)}</summary><pre>${escape(JSON.stringify(row,null,2))}</pre></details>`).join('')}</html>`;
}

export async function combineSnapshots({ datasets }, store) {
  check(Array.isArray(datasets) && datasets.length > 0 && datasets.length <= 100, 'Select 1–100 datasets');
  const records = new Map(), sources = new Map();
  for (const dataset of datasets) {
    const snapshot = await exportSnapshot({dataset},store);
    for (const item of snapshot.sources) if (!sources.has(item.id) || Date.parse(item.capturedAt) > Date.parse(sources.get(item.id).capturedAt)) sources.set(item.id,item);
    for (const item of snapshot.records) {
      const prior = records.get(item.id);
      if (prior && prior.observedAt === item.observedAt) check(JSON.stringify(prior) === JSON.stringify(item), 'Conflicting overlapping snapshot observation');
      if (!prior || Date.parse(item.observedAt) > Date.parse(prior.observedAt)) records.set(item.id,item);
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
