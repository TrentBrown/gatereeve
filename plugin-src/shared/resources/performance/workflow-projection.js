import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { sourceGit } from '../protocol/current/git-source.js';
import { hostname } from 'node:os';
import { MetricsStore } from './store.js';
import { reportingDatabase, observation, DIAL_FIELDS, LINK_BASES, reportingDial, replayField } from './fleet.js';
import { DEFAULT_DIALS, GATES } from '../protocol/current/contracts.js';
import { captureWarning } from './observe.js';
import { severityOf, band } from '../protocol/current/round-policy.js';
import { followUpRecords, raisedBlocking } from '../protocol/current/follow-ups.js';
import { outcomeStatus, OUTCOME_STATUSES } from '../protocol/current/boundary-review.js';
import { UNAVAILABLE_REASONS } from '../protocol/current/execution.js';

// Projection version 2 adds the convergence fields (issue #149). A workflow
// last projected by an earlier version is replayed from its first event, but
// its earlier rows are not converted: a replayed row keeps every stored field
// and gains only the convergence fields (a new version of the same ID), rows
// without convergence fields are left untouched, and only new convergence
// rows (per-reviewer rows) are added.
// Version 3 adds follow-up status (issue #148): `followUp` on the finding rows
// of a follow-up-tracking run (STARTED.followUps) and one `follow-up` row per
// record, re-emitted whenever a record's status changes.
export const PROJECTION_VERSION = 3;

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
    // A decision applied under a standing grant keeps the grant's original
    // authority kind; its basis distinguishes it from a per-decision human act.
    case 'DECIDED': return defined({ authorityKind: text(value.authority?.kind),
      gates: (value.kind === 'waive' || value.actions?.includes('waive')) && Array.isArray(value.gates) && value.gates.length ? [...value.gates].filter(gate => GATES.some(known => known.id === gate)).sort() : undefined,
      authorityBasis: text(value.authority?.basis) ?? (value.standingGrant ? 'standing-grant' : undefined),
      actions: Array.isArray(value.actions) && value.actions.length ? value.actions : undefined,
      count: value.kind === 'stay-light' && Array.isArray(value.hits) ? value.hits.length : undefined });
    case 'DIAL_SET': return defined({ dial: text(value.dial), dialValue: text(reportingDial(value.dial, value.value)), dialPrevious: text(reportingDial(value.dial, value.previous)), dialSource: text(value.source),
      actor: text(value.actor), trigger: text(value.trigger), authorityKind: text(value.authority?.kind) });
    case 'TRIPWIRES_EVALUATED': { const hits = Array.isArray(value.hits) ? value.hits : [];
      return defined({ stage: text(value.stage), count: hits.length, outcome: hits.length ? 'HIT' : 'CLEAR',
        categories: hits.length ? [...new Set(hits.map(hit => hit.category).filter(text))].sort() : undefined }); }
    case 'PLANNING_REVIEWED': return defined({ kind: 'artifact', check: `planning-review:${value.artifact}`, outcome: text(value.outcome),
      model: text(value.evaluator?.model), provider: text(value.evaluator?.provider), links: value.result?.hash ? [value.result.hash] : undefined });
    case 'MERGE_BLOCKED': return defined({ blocker: text(value.blocker), outcome: 'BLOCKED' });
    case 'ROUND_COUNTED': return defined({ reviewScope: text(value.roundPolicy?.scope), round: Number.isSafeInteger(value.after) ? value.after + 1 : undefined });
    default: return {};
  }
}

// Attempt kind, duration and tokens of one evaluator execution receipt. A
// receipt from before attempts were recorded reads as unknown.
function attemptMeasures(receipt) {
  const started = Date.parse(receipt.startedAt), completed = Date.parse(receipt.completedAt);
  return defined({ attempt: text(receipt.attempt), durationMs: Number.isFinite(started) && Number.isFinite(completed) && completed >= started ? completed - started : undefined,
    tokens: receipt.metrics?.tokens ?? undefined });
}
// Convergence fields (issue #149): enumerated values, counts, flags and short
// labels only. Failure scenarios, evidence and paths never leave the journal;
// a class statement is kept only as one short line (design D7).
const statement = value => typeof value === 'string' && value.length <= 200 && !/[\x00-\x1f\x7f-\x9f\u2028\u2029]/u.test(value) && value.trim() ? value : undefined;
const roundFields = policy => policy && text(policy.scope) ? defined({ reviewScope: policy.scope, round: Number.isSafeInteger(policy.round) ? policy.round : undefined,
  band: Number.isSafeInteger(policy.round) ? band(policy.round) : undefined }) : {};
// Whether a finding blocked when it was raised: the round schedule with the
// result's recorded round, regression paths and sweep records (a missed site
// of a swept class, issue #144); with no recorded round, the reviewer's flag
// where low never blocks (round-policy.js).
function findingFields(finding, policy, sweepRecords) {
  const blocking = raisedBlocking(finding, policy, sweepRecords), reviewerBlocking = Boolean(finding.blocking);
  return defined({ severity: severityOf(finding), classId: text(finding.classId), classStatement: statement(finding.classStatement), criterion: text(finding.criterion),
    reviewerBlocking, blocking, demoted: reviewerBlocking && !blocking, hasFailureScenario: Boolean(text(finding.failureScenario)?.trim()) });
}
// The #140 reviewer status of one retained result (boundary-review.js).
// Values outside the current vocabularies (retained from earlier builds) are
// omitted rather than failing the workflow's whole projection.
const known = (values, value) => values.includes(value) ? value : undefined;
const resultStatus = result => outcomeStatus({ status: 'fulfilled', value: {} }, result);
function reviewerFields(result) {
  return defined({ reviewerStatus: resultStatus(result),
    unavailableReason: result.outcome === 'UNAVAILABLE' ? known(UNAVAILABLE_REASONS, result.unavailableReason) : undefined,
    providerFailure: result.outcome === 'UNAVAILABLE' ? text(result.providerFailure?.category) : undefined });
}
async function readResult(core, ref) {
  const result = await core.store.json(ref);
  if (!result || typeof result !== 'object') throw new Error('Unreadable result');
  let input = {}, receipt = {};
  try { input = await core.store.json(result.input) ?? {}; } catch { /* lost input: no round fields */ }
  try { receipt = await core.store.json(result.receipt) ?? {}; } catch { /* lost receipt: no evaluator identity */ }
  return { result, input, receipt };
}

// Follow-up status (issue #148, spec AC9 and amendment 1): the current status
// of each record on its finding rows (every retained report of that finding
// ID) and on one follow-up row. Only rows whose stored content differs are
// emitted (a decision, a fix, a reopening), keeping the stored observation
// time otherwise. A record that stopped being a follow-up (its latest report
// blocked) is withdrawn: its row loses `followUp` and records outcome
// WITHDRAWN, and its finding rows lose `followUp`.
async function followUpRows(core, events, { base, source, workflow, latestBody, storedIds, pending }) {
  const { records } = await followUpRecords(core, events);
  const status = new Map(records.filter(record => record.origin.kind === 'review').map(record => [record.origin.findingId, record.status]));
  const observedAt = events.at(-1).recordedAt, rows = [];
  // `next(existing)` returns the row's intended body; emitted only on a change.
  const update = (id, next) => {
    const existing = latestBody.get(id);
    const before = existing ? observation(JSON.parse(existing.body)) : null;
    const after = next(before);
    if (!after) return;
    const kept = observation(before ? { ...after, observedAt: before.observedAt } : after);
    if (before && JSON.stringify(kept) === JSON.stringify(before)) return;
    rows.push(observation({ ...after, observedAt }));
  };
  const withoutFollowUp = row => { const { followUp, ...rest } = row; return rest; };
  for (const event of events) if (event.type === 'JOB_FINISHED') for (const ref of event.payload.results ?? []) {
    let result;
    try { result = await core.store.json(ref); } catch { continue; }
    if (result?.gate !== 'review') continue;
    for (const finding of result.findings ?? []) {
      const id = `${source}:${ref.hash}:finding:${finding.id}`;
      // A row projected in this pass gets the field before it is written.
      if (pending.has(id)) { if (status.has(finding.id)) pending.get(id).followUp = status.get(finding.id); continue; }
      update(id, before => before && (status.has(finding.id) ? { ...before, followUp: status.get(finding.id) } : before.followUp !== undefined ? withoutFollowUp(before) : null));
    }
  }
  const prefix = `${source}:${workflow}:follow-up:`, current = new Set();
  for (const record of records) {
    const id = `${prefix}${record.id}`;
    current.add(id);
    update(id, before => ({ ...(before ? withoutFollowUp(before) : {}), ...base, id, observedAt, kind: 'follow-up', check: 'follow-up', followUp: record.status,
      severity: record.finding.severity === 'critical' ? 'high' : record.finding.severity, reason: record.reason, outcome: undefined,
      ...defined({ findingId: record.finding.findingId, reference: record.origin.result, reviewScope: text(record.origin.reviewScope),
        round: Number.isSafeInteger(record.origin.round) ? record.origin.round : undefined, classId: text(record.finding.classId) }) }));
  }
  for (const id of storedIds(prefix)) if (!current.has(id)) update(id, before => before && before.outcome !== 'WITHDRAWN' ? { ...withoutFollowUp(before), outcome: 'WITHDRAWN' } : null);
  return rows;
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
    const stored = previous ? JSON.parse(previous.body) : null;
    // An earlier projection version is replayed from the first event (D8).
    const old = stored?.projection === PROJECTION_VERSION ? stored : { ...(stored ?? {}), sequence: 0 };
    const project = basename(core.context.workspaceRoot), platform = hostname();
    const projectId = await store.identity(core.context.workspaceRoot);
    const repository = core.context.repositories?.[0];
    const branch = old.branch ?? (repository ? await sourceGit(repository, ['symbolic-ref', '--quiet', '--short', 'HEAD']).then(value=>value.trim()).catch(()=>null) : null);
    const base = { source, project, projectKey: `${source}:${projectId}`, workflow, issue: core.context.featureId, branch, platform };
    const observations = [];
    const replayed = stored && stored.projection !== PROJECTION_VERSION ? stored.sequence ?? 0 : 0;
    let firstNew = null;
    // Dial values are replayed from the whole journal (projection is incremental),
    // so every observation carries the run's rigor and autonomy when its event
    // was recorded. A run whose STARTED has no dials reads as the defaults.
    const dials = { ...DEFAULT_DIALS };
    // Counted rounds by scope and revision, replayed like the dials: a paired
    // round's event names only its scope and revision (round-policy.js).
    const counted = new Map();
    for (const [index, event] of events.entries()) {
      const value = event.payload ?? {};
      if (event.type === 'STARTED') for (const dial of Object.keys(DIAL_FIELDS)) dials[dial] = reportingDial(dial, value.dials?.[dial]?.value ?? DEFAULT_DIALS[dial]);
      if (event.type === 'DIAL_SET' && Object.hasOwn(DIAL_FIELDS, value.dial)) dials[value.dial] = reportingDial(value.dial, value.value);
      if (event.type === 'ROUND_COUNTED' && text(value.roundPolicy?.scope) && Number.isSafeInteger(value.after)) counted.set(`${value.roundPolicy.scope}\u0000${value.roundPolicy.revision}`, value.after + 1);
      if (index < old.sequence) continue;
      if (index >= replayed && firstNew === null) firstNew = observations.length;
      const common = { ...base, id: `${source}:${event.hash}`, observedAt: event.recordedAt, kind: 'event', check: event.type, reference: event.hash,
        ...Object.fromEntries(Object.keys(DIAL_FIELDS).map(dial => [dial, DIAL_FIELDS[dial].includes(dials[dial]) ? dials[dial] : null])) };
      if (event.type === 'OBSERVATION') observations.push(observation(noted(common, value)));
      else if (event.type === 'STARTED') {
        observations.push(observation({ ...common, check: event.type, ...(value.followUps === 1 ? { followUpTracking: true } : {}) }));
        // Each start dial with its provenance (explicit choice or built-in default).
        for (const dial of Object.keys(DIAL_FIELDS)) if (value.dials?.[dial]) observations.push(observation({ ...common, id: `${common.id}:dial:${dial}`, check: 'DIAL_INITIAL',
          ...defined({ dial, dialValue: text(reportingDial(dial, value.dials[dial].value)), dialSource: text(value.dials[dial].source), actor: text(value.dials[dial].actor), authorityKind: text(value.dials[dial].authority?.kind) }) }));
      }
      else if (event.type === 'JOB_FINISHED') {
        for (const ref of value.results) {
          const { result, input, receipt } = await readResult(core, ref);
          const row = { ...common, id: `${source}:${ref.hash}`, kind: 'artifact', check: result.gate, outcome: result.outcome, model: receipt.evaluator?.model ?? null,
            provider: receipt.evaluator?.provider ?? null, strategy: result.mode, reference: ref.hash, links: [result.receipt.hash] };
          const rounds = roundFields(input.roundPolicy);
          // Each evaluator attempt's execution time and provider usage, so a
          // repair turn or transient retry is attributed (issue #142). Only
          // the result row carries them; finding and disposition rows do not.
          const evaluated = receipt.evaluator ? attemptMeasures(receipt) : {};
          observations.push(observation({ ...row, ...evaluated, ...rounds, ...(result.gate === 'review' ? reviewerFields(result) : {}) }));
          for (const finding of result.findings ?? []) observations.push(observation({ ...row, ...rounds, id: `${row.id}:finding:${finding.id}`, kind: 'finding', findingId: finding.id,
            ...findingFields(finding, input.roundPolicy, input.sweepRecords) }));
          for (const disposition of result.dispositions ?? []) observations.push(observation({ ...row, id: `${row.id}:disposition:${disposition.id}`, kind: 'disposition', findingId: disposition.id, outcome: disposition.status }));
          // Per-rule verdict normalization and rejection counts (issue #141).
          // Only the rule identifier and count are projected, never the text.
          const rules = new Map();
          for (const item of Array.isArray(result.normalized) ? result.normalized : []) if (text(item?.rule)) rules.set(item.rule, (rules.get(item.rule) ?? 0) + 1);
          for (const [rule, count] of rules) observations.push(observation({ ...row, id: `${row.id}:normalization:${rule}`, kind: 'event', check: 'verdict-normalization', rule, count }));
          if (text(result.rejectionRule)) observations.push(observation({ ...row, id: `${row.id}:rejection:${result.rejectionRule}`, kind: 'event', check: 'verdict-rejection', rule: result.rejectionRule, count: 1 }));
        }
      } else if (event.type === 'BOUNDARY_REVIEWED') {
        // One pair row per paired round and one row per reviewer with its
        // final attempt's status, so retries in one round count once (D5, D6).
        const members = [], reads = [];
        for (const [slot, outcome] of (Array.isArray(value.outcomes) ? value.outcomes : []).entries()) {
          let read = null;
          if (outcome?.results?.[0]) try { read = await readResult(core, outcome.results[0]); } catch { /* unreadable: status only */ }
          reads.push(read);
        }
        // The round the reviewers were given, else the counted round of this revision.
        const given = reads.map(read => read?.input.roundPolicy?.round).find(Number.isSafeInteger);
        const rounds = roundFields({ scope: value.roundPolicy?.scope, round: given ?? counted.get(`${value.roundPolicy?.scope}\u0000${value.roundPolicy?.revision}`) });
        for (const [slot, outcome] of (Array.isArray(value.outcomes) ? value.outcomes : []).entries()) {
          const read = reads[slot];
          // The recorded final status wins: a reused retained result is
          // `refused` (no reviewer launched) although the result completed.
          const status = known(OUTCOME_STATUSES, outcome?.status) ?? (read ? resultStatus(read.result) : undefined);
          members.push({ status, outcome: read?.result.outcome ?? 'UNAVAILABLE' });
          observations.push(observation({ ...common, ...rounds, id: `${common.id}:reviewer:${slot}`, kind: 'artifact', check: 'boundary-reviewer',
            provider: text(outcome?.provider) ?? read?.receipt.evaluator?.provider ?? null, model: read?.receipt.evaluator?.model ?? null,
            outcome: read?.result.outcome ?? 'UNAVAILABLE', reference: read ? outcome.results[0].hash : event.hash,
            ...(read ? reviewerFields(read.result) : {}), ...defined({ reviewerStatus: status }) }));
        }
        const completed = members.filter(row => row.status === 'completed');
        const outcome = members.length && completed.length === members.length && completed.every(row => row.outcome === 'PASS') ? 'PASS'
          : completed.some(row => row.outcome === 'FAIL') ? 'FAIL' : 'UNAVAILABLE';
        observations.push(observation({ ...common, ...rounds, kind: 'event', check: event.type, outcome, count: members.length }));
      } else if (event.type === 'REVIEW_ADJUDICATED') {
        let rounds = {};
        if (value.reviews?.[0]) try { rounds = roundFields((await readResult(core, value.reviews[0])).input.roundPolicy); } catch { /* unreadable: no round */ }
        observations.push(observation({ ...common, ...rounds, kind: 'event', check: event.type, outcome: 'ADJUDICATED' }));
      } else observations.push(observation({ ...common, kind: event.type === 'DECIDED' ? 'decision' : event.type === 'MILESTONE' ? 'milestone' : 'event', check: event.type === 'DECISION_PENDING' && value.asked ? `asked:${value.decision.kind}` : value.kind ?? value.name ?? event.type, ...measured(event.type, value) }));
    }
    const latestBody = db.prepare('SELECT o.body FROM reporting_latest l JOIN reporting_observations o ON o.id=l.id AND o.version=l.version WHERE l.id=?');
    const kept = observations.slice(0, firstNew ?? observations.length).flatMap(row => {
      const added = Object.fromEntries(Object.entries(row).filter(([key]) => replayField(row, key)));
      if (!Object.keys(added).length) return [];
      const existing = latestBody.get(row.id);
      if (!existing) return [row];
      const merged = observation({ ...JSON.parse(existing.body), ...added });
      return JSON.stringify(merged) === JSON.stringify(observation(JSON.parse(existing.body))) ? [] : [merged];
    });
    observations.splice(0, firstNew ?? observations.length, ...kept);
    const storedIds = prefix => db.prepare('SELECT id FROM reporting_latest WHERE id LIKE ? ESCAPE ?').all(`${prefix.replace(/[\\%_]/gu, '\\$&')}%`, '\\').map(row => row.id);
    if (events[0]?.payload?.followUps === 1) observations.push(...await followUpRows(core, events, { base, source, workflow, latestBody, storedIds,
      pending: new Map(observations.filter(row => row.kind === 'finding').map(row => [row.id, row])) }));
    const body = { ...base, home: core.store.home, sequence: events.length, projection: PROJECTION_VERSION, projectId, featureId: await store.identity(core.context.featureId) };
    store.transaction(db, () => {
      const current = db.prepare('SELECT body FROM reporting_workflows WHERE id=?').get(workflow);
      if (current && JSON.parse(current.body).projection === PROJECTION_VERSION && JSON.parse(current.body).sequence >= events.length) return;
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
