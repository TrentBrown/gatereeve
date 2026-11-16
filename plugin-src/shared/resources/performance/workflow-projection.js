import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { sourceGit } from '../protocol/current/git-source.js';
import { hostname } from 'node:os';
import { MetricsStore } from './store.js';
import { reportingDatabase, observation, DIAL_FIELDS, LINK_BASES } from './fleet.js';
import { DEFAULT_DIALS } from '../protocol/current/contracts.js';
import { captureWarning } from './observe.js';

const text = value => typeof value === 'string' && value ? value : undefined;
const defined = value => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null));
// Agent notes keep their bounded note fields. An escaped-defect origin link is
// projected only with its human basis; the authority text itself never leaves
// the journal (no conversation text in reporting).
function noted(common, value) {
  const note = defined({ kind: value.kind, strategy: text(value.strategy), reason: text(value.reason), outcome: text(value.outcome),
    findingId: text(value.findingId), fixId: text(value.fixId), limitation: text(value.limitation), links: Array.isArray(value.links) ? value.links : undefined });
  if (value.kind === 'escaped-defect') {
    const confirmed = LINK_BASES.includes(value.linkBasis) && value.authority?.kind === 'human-confirmed';
    if (confirmed) Object.assign(note, { linkBasis: value.linkBasis, authorityKind: 'human-confirmed' });
    else delete note.links;
  }
  return { ...common, ...note };
}
// Measurement fields for run events (spec AC8). Only enumerated values and
// counts are projected: no reasons, instructions, paths or matched text.
function measured(type, value) {
  switch (type) {
    case 'DECIDED': return defined({ authorityKind: text(value.authority?.kind), authorityBasis: text(value.authority?.basis),
      actions: Array.isArray(value.actions) && value.actions.length ? value.actions : undefined,
      count: value.kind === 'stay-light' && Array.isArray(value.hits) ? value.hits.length : undefined });
    case 'DIAL_SET': return defined({ dial: text(value.dial), dialValue: text(value.value), dialPrevious: text(value.previous), dialSource: text(value.source),
      actor: text(value.actor), trigger: text(value.trigger), authorityKind: text(value.authority?.kind) });
    case 'TRIPWIRES_EVALUATED': { const hits = Array.isArray(value.hits) ? value.hits : [];
      return defined({ stage: text(value.stage), count: hits.length, outcome: hits.length ? 'HIT' : 'CLEAR',
        categories: hits.length ? [...new Set(hits.map(hit => hit.category).filter(text))].sort() : undefined }); }
    case 'PLANNING_REVIEWED': return defined({ kind: 'artifact', check: `planning-review:${value.artifact}`, outcome: text(value.outcome),
      model: text(value.evaluator?.model), provider: text(value.evaluator?.provider), links: value.result?.hash ? [value.result.hash] : undefined });
    case 'MERGE_BLOCKED': return defined({ blocker: text(value.blocker), outcome: 'BLOCKED' });
    default: return {};
  }
}

// Derived, replaceable reporting memory. Failure never changes workflow authority.
export async function projectWorkflow(core, store = new MetricsStore()) {
  if (process.env.GATEREEVE_METRICS === 'off') return;
  try {
    if (!(await store.config()).enabled) return;
    // No current run (for example an earlier-contract run awaiting explicit
    // resumption) has nothing to project; its records are never read or converted.
    if (typeof core.store.active === 'function' && !(await core.store.active())) return;
    await store.admit(true); await store.key();
    const { state, events } = await core.state();
    const source = await store.identity(`source:${hostname()}`), workflow = await store.identity(`${core.store.home}:${state.runId}`);
    const db = await reportingDatabase(store);
    const previous = db.prepare('SELECT body FROM reporting_workflows WHERE id=?').get(workflow);
    const old = previous ? JSON.parse(previous.body) : { sequence: 0 };
    const project = basename(core.context.workspaceRoot), platform = hostname();
    const projectId = await store.identity(core.context.workspaceRoot);
    const repository = core.context.repositories?.[0];
    const branch = old.branch ?? (repository ? await sourceGit(repository, ['symbolic-ref', '--quiet', '--short', 'HEAD']).then(value=>value.trim()).catch(()=>null) : null);
    const base = { source, project, projectKey: `${source}:${projectId}`, workflow, issue: core.context.featureId, branch, platform };
    const observations = [];
    // Dial values are replayed from the whole journal (projection is incremental),
    // so every observation carries the run's rigor and autonomy when its event
    // was recorded. A run whose STARTED has no dials reads as the defaults.
    const dials = { ...DEFAULT_DIALS };
    for (const [index, event] of events.entries()) {
      const value = event.payload ?? {};
      if (event.type === 'STARTED') for (const dial of Object.keys(DIAL_FIELDS)) dials[dial] = value.dials?.[dial]?.value ?? DEFAULT_DIALS[dial];
      if (event.type === 'DIAL_SET' && Object.hasOwn(DIAL_FIELDS, value.dial)) dials[value.dial] = value.value;
      if (index < old.sequence) continue;
      const common = { ...base, id: `${source}:${event.hash}`, observedAt: event.recordedAt, kind: 'event', check: event.type, reference: event.hash,
        ...Object.fromEntries(Object.keys(DIAL_FIELDS).map(dial => [dial, DIAL_FIELDS[dial].includes(dials[dial]) ? dials[dial] : null])) };
      if (event.type === 'OBSERVATION') observations.push(observation(noted(common, value)));
      else if (event.type === 'STARTED') {
        observations.push(observation({ ...common, check: event.type }));
        // Each start dial with its provenance (explicit choice or built-in default).
        for (const dial of Object.keys(DIAL_FIELDS)) if (value.dials?.[dial]) observations.push(observation({ ...common, id: `${common.id}:dial:${dial}`, check: 'DIAL_INITIAL',
          ...defined({ dial, dialValue: text(value.dials[dial].value), dialSource: text(value.dials[dial].source), actor: text(value.dials[dial].actor), authorityKind: text(value.dials[dial].authority?.kind) }) }));
      }
      else if (event.type === 'JOB_FINISHED') {
        for (const ref of value.results) {
          const result = await core.store.json(ref), input = await core.store.json(result.input), receipt = await core.store.json(result.receipt);
          const row = { ...common, id: `${source}:${ref.hash}`, kind: 'artifact', check: result.gate, outcome: result.outcome, model: receipt.evaluator?.model ?? null,
            provider: receipt.evaluator?.provider ?? null, strategy: result.mode, reference: ref.hash, links: [result.receipt.hash] };
          observations.push(observation(row));
          for (const finding of result.findings ?? []) observations.push(observation({ ...row, id: `${row.id}:finding:${finding.id}`, kind: 'finding', findingId: finding.id }));
          for (const disposition of result.dispositions ?? []) observations.push(observation({ ...row, id: `${row.id}:disposition:${disposition.id}`, kind: 'disposition', findingId: disposition.id, outcome: disposition.status }));
        }
      } else observations.push(observation({ ...common, kind: event.type === 'DECIDED' ? 'decision' : event.type === 'MILESTONE' ? 'milestone' : 'event', check: value.kind ?? value.name ?? event.type, ...measured(event.type, value) }));
    }
    const body = { ...base, home: core.store.home, sequence: events.length, projectId, featureId: await store.identity(core.context.featureId) };
    store.transaction(db, () => {
      const current = db.prepare('SELECT body FROM reporting_workflows WHERE id=?').get(workflow);
      if (current && JSON.parse(current.body).sequence >= events.length) return;
      for (const row of observations) {
        const serialized = JSON.stringify(row), version = createHash('sha256').update(serialized).digest('hex');
        db.prepare('INSERT OR IGNORE INTO reporting_observations VALUES (?,?,?,?)').run(row.id,version,row.observedAt,serialized);
        db.prepare('INSERT INTO reporting_latest VALUES (?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version').run(row.id,version);
        db.prepare('INSERT OR IGNORE INTO reporting_local VALUES (?)').run(row.id);
      }
      db.prepare('INSERT INTO reporting_workflows VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET home=excluded.home,body=excluded.body').run(workflow,core.store.home,JSON.stringify(body));
      if(store.usedBytes(db)>store.configFrom(db).maxBytes)throw new Error('Reporting projection exceeds metrics capacity');
    });
  } catch { await store.markIncomplete(); captureWarning(); }
}
