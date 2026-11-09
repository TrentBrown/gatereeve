import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { sourceGit } from '../protocol/current/git-source.js';
import { hostname } from 'node:os';
import { MetricsStore } from './store.js';
import { reportingDatabase, observation } from './fleet.js';
import { captureWarning } from './observe.js';

// Derived, replaceable reporting memory. Failure never changes workflow authority.
export async function projectWorkflow(core, store = new MetricsStore()) {
  if (process.env.GATEREEVE_METRICS === 'off') return;
  try {
    if (!(await store.config()).enabled) return;
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
    for (const event of events.slice(old.sequence)) {
      const common = { ...base, id: `${source}:${event.hash}`, observedAt: event.recordedAt, kind: 'event', check: event.type, reference: event.hash };
      const value = event.payload;
      if (event.type === 'OBSERVATION') observations.push(observation({ ...common, ...value }));
      else if (event.type === 'JOB_FINISHED') {
        for (const ref of value.results) {
          const result = await core.store.json(ref), input = await core.store.json(result.input), receipt = await core.store.json(result.receipt);
          const row = { ...common, id: `${source}:${ref.hash}`, kind: 'artifact', check: result.gate, outcome: result.outcome, model: receipt.evaluator?.model ?? null,
            provider: receipt.evaluator?.provider ?? null, strategy: result.mode, reference: ref.hash, links: [result.receipt.hash] };
          observations.push(observation(row));
          for (const finding of result.findings ?? []) observations.push(observation({ ...row, id: `${row.id}:finding:${finding.id}`, kind: 'finding', findingId: finding.id }));
          for (const disposition of result.dispositions ?? []) observations.push(observation({ ...row, id: `${row.id}:disposition:${disposition.id}`, kind: 'disposition', findingId: disposition.id, outcome: disposition.status }));
        }
      } else observations.push(observation({ ...common, kind: event.type === 'DECIDED' ? 'decision' : event.type === 'MILESTONE' ? 'milestone' : 'event', check: value.kind ?? value.name ?? event.type }));
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
