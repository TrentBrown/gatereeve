import { constants } from 'node:fs';
import { open, mkdir, lstat, readdir, readFile, writeFile, rename, unlink, rmdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes, createHmac, randomUUID } from 'node:crypto';

export const DEFAULTS = Object.freeze({ enabled: true, diagnosticDetails: false, detailDays: 90, summaryDays: 365, maxBytes: 100 * 1024 * 1024 });
const MARKER = 'gatereeve-performance/1\n';
const ID = /^[a-f0-9]{64}$/;
const DAY = 86400000;
const MAX_RECORD = 8192;
export const CATEGORIES = ['operation', 'verification', 'unit', 'browser', 'integration', 'build', 'setup', 'review', 'delivery', 'reuse', 'poll', 'manual'];
const OPERATIONS=['approve-design','authorize-implementation','accept','authorize-merge','milestone:implementation','milestone:acceptance','milestone:merge','milestone:completion','candidate.prepare','candidate.ready','gate.execute','milestone.check','milestone.pass','human.decide','spec.validate','merge.prepare','merge.execute','integration.observe','run.start','run.resume-current','run.pause','run.continue','status','snapshot','next','read','coverage.status','source-view','provider-execution','release-observation'];
export const OUTCOMES = ['PASS', 'FAIL', 'UNAVAILABLE', 'RUNNING', 'CANCELLED', 'REUSED', 'REJECTED', 'SKIPPED'];
export const REASONS = ['initial', 'source-change', 'configuration-change', 'remediation', 'retry', 'integration-change', 'investigation', 'unknown', 'inputs-changed', 'consumed-proof-changed', 'proof-unavailable', 'latest-not-pass', 'no-prior-proof', 'equivalent'];
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } };
export const rootPath = () => resolve(process.env.GATEREEVE_METRICS_DIR || join(homedir(), '.local/share/gatereeve/performance'));
function check(condition, message) { if (!condition) throw new Error(message); }
async function safeFile(path, max = MAX_RECORD) {
  const h = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const s = await h.stat(); check(s.isFile() && s.nlink === 1 && s.size <= max, 'Unsafe metrics file'); return await h.readFile('utf8'); } finally { await h.close(); }
}
async function directory(path, create) {
  if (create) await mkdir(path, { recursive: true, mode: 0o700 });
  const s = await lstat(path); check(s.isDirectory() && !s.isSymbolicLink(), 'Unsafe metrics directory');
}
async function atomic(root, name, value) {
  const temporary = join(root, `.write-${randomUUID()}`);
  try { await writeFile(temporary, value, { flag: 'wx', mode: 0o600 }); await rename(temporary, join(root, name)); }
  finally { await unlink(temporary).catch(() => {}); }
}
export function settings(value) {
  check(value && typeof value === 'object' && !Array.isArray(value), 'Invalid metrics settings');
  check(Object.keys(value).every(k => k in DEFAULTS), 'Unknown metrics setting');
  for(const key of ['enabled','diagnosticDetails']) if(key in value)check(typeof value[key]==='boolean', `${key} must be boolean`);
  for (const key of ['detailDays', 'summaryDays', 'maxBytes']) if (key in value) check(Number.isSafeInteger(value[key]) && value[key] >= (key === 'maxBytes' ? 65536 : 1) && value[key] <= (key === 'maxBytes' ? 1024 ** 3 : 3650), `Invalid ${key}`);
  return value;
}
export class MetricsStore {
  constructor(root = rootPath()) { this.root = resolve(root); }
  async admit(create = false) {
    // Refuse symlink components, including an override's ancestors. Resolve the
    // platform's /var alias in callers rather than following unknown store links.
    const parts = []; let p = this.root;
    while (p !== dirname(p)) { parts.unshift(p); p = dirname(p); }
    for (const path of parts) {
      try { await directory(path, false); }
      catch (e) { if (e.code !== 'ENOENT' || !create) throw e; await directory(path, true); }
    }
    try { check(await safeFile(join(this.root, 'owner')) === MARKER, 'Not an owned metrics store'); }
    catch (e) {
      if (!create || e.code !== 'ENOENT') throw e;
      check((await readdir(this.root)).length === 0, 'Refusing to adopt a nonempty directory');
      await writeFile(join(this.root, 'owner'), MARKER, { flag: 'wx', mode: 0o600 });
    }
  }
  async config(admitted = false) {
    try { if(!admitted)await this.admit(); return { ...DEFAULTS, ...settings(JSON.parse(await safeFile(join(this.root, 'config.json')))) }; }
    catch (e) { if (e.code === 'ENOENT') return { ...DEFAULTS }; throw e; }
  }
  async lock(fn) {
    await this.admit(true);
    const path = join(this.root, 'lock');
    try { await mkdir(path, { mode: 0o700 }); }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // Never guess whether a freshly created or malformed lock is stale.
      const pid = Number(await safeFile(join(path, 'pid')).catch(() => '0'));
      if (!Number.isSafeInteger(pid) || pid < 1 || alive(pid)) throw new Error('Metrics store busy; capture may be incomplete');
      await directory(path, false); await unlink(join(path, 'pid')); await rmdir(path); await mkdir(path, { mode: 0o700 });
    }
    try { await writeFile(join(path, 'pid'), String(process.pid), { flag: 'wx', mode: 0o600 }); return await fn(); }
    finally { await unlink(join(path, 'pid')).catch(() => {}); await rmdir(path).catch(() => {}); }
  }
  async key() {
    try { return await safeFile(join(this.root, 'key')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; const key = randomBytes(32).toString('hex'); await writeFile(join(this.root, 'key'), key, { flag: 'wx', mode: 0o600 }); return key; }
  }
  async identity(value) {
    await this.admit(); const key = await safeFile(join(this.root, 'key'));
    return createHmac('sha256', key).update(String(value)).digest('hex');
  }
  async inventory(admitted = false) {
    if(!admitted)await this.admit();
    const entries = await readdir(this.root, { withFileTypes: true });
    check(entries.length <= 20000, 'Metrics inventory exceeds safety bound');
    let bytes = 0; const records = []; let incomplete = 0;
    for (const entry of entries) {
      const path = join(this.root, entry.name);
      const stat = await lstat(path);
      check(!stat.isSymbolicLink(), 'Unsafe metrics entry');
      if (entry.name === 'lock' && stat.isDirectory()) { bytes += 8192; continue; }
      check(stat.isFile() && stat.nlink === 1, 'Unexpected metrics entry'); const allocated=Math.max(stat.size,(stat.blocks??0)*512); bytes += allocated;
      if (/^[a-f0-9]{64}\.json$/.test(entry.name)) {
        try { const record = JSON.parse(await safeFile(path)); validateRecord(record); records.push({ name: entry.name, bytes: allocated, record }); }
        catch { incomplete++; }
      }
    }
    return { bytes, records, incomplete };
  }
  async setConfig(patch) {
    settings(patch);
    return this.lock(async () => {
      const value = { ...await this.config(true), ...patch };
      const inventory = await this.inventory(true);
      check(value.maxBytes >= inventory.bytes + MAX_RECORD, 'New cap must accommodate existing data; clean eligible metrics first');
      await atomic(this.root, 'config.json', JSON.stringify(value)); return value;
    });
  }
  async cleanup({ apply = false, now = Date.now(), needed = 0 } = {}) {
    if (apply) return this.lock(() => this.prune(now, needed, true));
    try { return await this.prune(now, needed, false); }
    catch (e) { if (e.code === 'ENOENT') return { bytes: 0, candidates: [], protected: 0 }; throw e; }
  }
  async prune(now, needed, apply) {
    const config = await this.config(apply); const inventory = await this.inventory(apply);
    let bytes = inventory.bytes; let protectedCount = 0; const candidates = [];
    for (const entry of inventory.records.sort((a,b) => a.record.startedAt - b.record.startedAt)) {
      const r = entry.record;
      if (r.outcome === 'RUNNING' && r.pid && alive(r.pid)) { protectedCount++; continue; }
      const expired = now - r.startedAt > (r.summary ? config.summaryDays : config.detailDays) * DAY;
      const pressure = bytes + needed + MAX_RECORD > config.maxBytes || inventory.records.length - candidates.length >= 19000;
      if (!expired && !pressure) continue;
      // Compact expired detail, preserving totals but explicitly losing drilldown.
      if (expired && !pressure && !r.summary && now - r.startedAt <= config.summaryDays * DAY) {
        const compact = { ...r, summary: true, commandId: null, inputId: null, evidenceId: null };
        const content = JSON.stringify(compact); candidates.push({ id:r.id, action:'summarize' });
        if (apply) await atomic(this.root, entry.name, content);
        bytes += Math.ceil(Buffer.byteLength(content)/4096)*4096 - entry.bytes;
      } else {
        candidates.push({ id:r.id, action:'remove' }); bytes -= entry.bytes;
        if (apply) await unlink(join(this.root, entry.name));
      }
    }
    return { bytes, candidates, protected: protectedCount, incomplete: inventory.incomplete };
  }
  async put(raw) {
    return this.lock(async () => {
      const config=await this.config(true);
      if (!config.enabled || process.env.GATEREEVE_METRICS === 'off') return null;
      const key = await this.key(); const hash = v => v == null ? null : createHmac('sha256', key).update(String(v)).digest('hex');
      const r = normalize(raw, hash);
      try { const old=JSON.parse(await safeFile(join(this.root, `${r.id}.json`))); validateRecord(old); r.featureIds=[...new Set([...old.featureIds,...r.featureIds])].slice(0,32); } catch(e) { if(e.code!=='ENOENT')throw e; }
      if(r.category==='poll') { try { const old=JSON.parse(await safeFile(join(this.root, `${r.id}.json`))); validateRecord(old); r.durationMs=(old.durationMs??0)+(r.durationMs??0); r.count=(old.count??1)+1; r.startedAt=Math.min(old.startedAt,r.startedAt); } catch(e) { if(e.code!=='ENOENT')throw e; } }
      const content = JSON.stringify(r); check(Buffer.byteLength(content) <= MAX_RECORD, 'Metrics record too large');
      const { bytes } = await this.prune(Date.now(), Buffer.byteLength(content), true);
      if (bytes + Buffer.byteLength(content) + MAX_RECORD > config.maxBytes) throw new Error('Metrics capacity exhausted; capture incomplete');
      await atomic(this.root, `${r.id}.json`, content); return r;
    });
  }
  async read() { try { return await this.inventory(); } catch (e) { if (e.code === 'ENOENT') return { bytes:0, records:[], incomplete:0 }; throw e; } }
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
export function validateRecord(r) {
  check(Object.keys(r).every(k=>['schemaVersion','sourceId','environmentId','workflowId','attemptId','scope','id','parentId','projectId','featureId','featureIds','commandId','inputId','evidenceId','category','label','outcome','reason','startedAt','durationMs','clock','location','provenance','worker','pid','count','summary','tokens','cost','workMs'].includes(k)), 'Unexpected metrics field');
  check(Array.isArray(r.featureIds)&&r.featureIds.length<=32&&r.featureIds.every(v=>ID.test(v)), 'Invalid feature attribution');
  for(const key of ['sourceId','environmentId','workflowId','attemptId','parentId','featureId','commandId','inputId','evidenceId','clock'])check(r[key]===null||ID.test(r[key]), 'Invalid private identity');
  check(OPERATIONS.includes(r.label)||CATEGORIES.includes(r.label),'Invalid label');
  check(REASONS.includes(r.reason) && ['local','ci','remote','release'].includes(r.location) && ['observed','declared','assessed','estimated','unknown'].includes(r.provenance), 'Invalid metrics metadata');
  check(['full','focused','unknown'].includes(r.scope),'Invalid declared scope');
  check(r.count===null||Number.isSafeInteger(r.count)&&r.count>=0, 'Invalid count');
  check(typeof r.worker==='boolean' && typeof r.summary==='boolean','Invalid flags');
  check(r.workMs===null||Number.isFinite(r.workMs)&&r.workMs>=0,'Invalid work duration');
  check(r.cost===null||Number.isFinite(r.cost)&&r.cost>=0,'Invalid cost');
  if(r.tokens!==null)check(r.tokens && Object.keys(r.tokens).every(k=>['input','output','cachedInput','cacheCreation'].includes(k) && (r.tokens[k]===null||Number.isFinite(r.tokens[k])&&r.tokens[k]>=0)), 'Invalid usage');
  check(r.schemaVersion === 1 && ID.test(r.id) && ID.test(r.projectId), 'Invalid metrics record identity');
  check(Number.isFinite(r.startedAt) && r.startedAt >= 0 && (r.durationMs === null || Number.isFinite(r.durationMs) && r.durationMs >= 0), 'Invalid metrics timing');
  check(CATEGORIES.includes(r.category) && OUTCOMES.includes(r.outcome), 'Invalid metrics category');
  check(r.pid === null || Number.isInteger(r.pid) && r.pid > 0, 'Invalid producer PID');
  return r;
}
