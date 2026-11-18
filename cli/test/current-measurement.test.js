// Measurement and rollout (spec AC8, R12): projected observations carry the
// run dials and decision authority; dial, delegation, tripwire, escalation,
// hand-back, planning-review and external-blocker events reach metrics;
// escaped-defect origin links need a human basis; reports never treat absent
// defect records as safety; copies match and existing runs are not converted.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { MetricsStore } from '../../plugin-src/shared/resources/performance/store.js';
import { metricsRequest, renderReevaluation } from '../../plugin-src/shared/resources/performance/service.js';
import { projectWorkflow } from '../../plugin-src/shared/resources/performance/workflow-projection.js';
import { escapedDefectStatement, DIAL_COMPARISON_CAVEAT, NOT_RECORDED, reportingDatabase } from '../../plugin-src/shared/resources/performance/fleet.js';
import { createSession } from '../../plugin-src/shared/resources/performance/mcp.js';
import { CurrentCore } from '../../plugin-src/shared/resources/protocol/current/core.js';
import { git } from '../../plugin-src/shared/resources/protocol/current/evidence.js';

// Operations under test project into a private default store, never the user's.
const defaultMetrics = await mkdtemp(join(tmpdir(), 'gatereeve-measurement-default-'));
process.env.GATEREEVE_METRICS_DIR = join(defaultMetrics, 'metrics');
process.on('exit', () => rmSync(defaultMetrics, { recursive: true, force: true }));

const repositoryRoot = resolve(import.meta.dirname, '../..');
const SECRET = 'PRIVATE-INSTRUCTION-TEXT';
const human = (instruction = SECRET) => ({ kind: 'human-confirmed', instruction, context: 'private conversation context' });
const H = n => `sha256:${String(n).padStart(64, '0')}`;

async function metricsStore(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gatereeve-measurement-')));
  const store = new MetricsStore(join(root, 'metrics'), { privateConnection: true });
  t.after(async () => { store.close(); await rm(root, { recursive: true, force: true }); });
  return store;
}
// A recorded journal with the exact payload shapes the current core appends.
function journal() {
  let n = 0;
  const event = (type, payload) => { n++; return { sequence: n, hash: `event-${n}`, recordedAt: new Date(Date.parse('2026-11-16T00:00:00Z') + n * 1000).toISOString(), type, payload }; };
  const delegation = { event: 'event-5', at: '2026-11-16T00:00:05.000Z', authority: human() };
  return [
    event('STARTED', { featureId: 'feature', implementers: ['implementer'], optionalGates: [], dials: {
      rigor: { value: 'light', source: 'explicit', actor: 'human', authority: human(), reason: 'Small change' },
      autonomy: { value: 'supervised', source: 'built-in', actor: null } } }),
    event('DECIDED', { kind: 'authorize-implementation', subject: H(1), authority: human(), reason: 'Confirmed brief', consequences: 'May implement' }),
    event('TRIPWIRES_EVALUATED', { candidate: { hash: H(2) }, stage: 'candidate.prepare', policy: 'fixture', subject: H(3), configurations: [], skipped: [],
      hits: [{ category: 'secrets', rule: 'dotenv', source: 'built-in', kind: 'path', repository: 'app', path: 'config/.env.production' }] }),
    event('DECIDED', { kind: 'stay-light', subject: H(3), hits: ['secrets|dotenv|app|config/.env.production'], authority: human(), reason: 'Fixture values', consequences: 'Stays light' }),
    event('DIAL_SET', { dial: 'autonomy', value: 'delegated', previous: 'supervised', source: 'explicit', actor: 'human', authority: human(), reason: 'Delegate this run',
      runId: 'run', protection: [{ repository: 'app', branch: 'main', protected: true }] }),
    event('PLANNING_REVIEWED', { artifact: 'brief', subject: H(4), documents: {}, outcome: 'PASS', result: { hash: H(5) }, evaluator: { provider: 'codex', model: 'reviewer-model', contextId: 'fresh' } }),
    event('DECIDED', { kind: 'authorize-implementation', subject: H(4), reason: 'Brief review PASS', consequences: 'May implement',
      authority: { kind: 'delegated-evaluator', basis: 'planning-review', delegation, evaluation: { event: 'event-6', artifact: 'brief', outcome: 'PASS', result: { hash: H(5) }, evaluator: {} } } }),
    event('TRIPWIRES_EVALUATED', { candidate: { hash: H(2) }, stage: 'milestone.pass acceptance', policy: 'fixture', subject: H(6), configurations: [], skipped: [],
      hits: [{ category: 'migrations-schema', rule: 'sql-file', repository: 'app', path: 'db/001.sql' }, { category: 'data-deletion', rule: 'delete-from', repository: 'app', path: 'db/001.sql', line: 3 }] }),
    event('DIAL_SET', { dial: 'rigor', value: 'full', previous: 'light', source: 'automatic', actor: 'gatereeve', trigger: 'tripwire', reason: 'Tripwire escalation under delegated autonomy', tripwires: H(6) }),
    event('JOB_FINISHED', { jobId: 'job', results: [{ hash: H(7) }] }),
    event('DECIDED', { kind: 'accept', subject: H(2), reason: 'Delegated SLICE acceptance', consequences: 'Merge PR #12', delegation: 'event-5', actions: ['authorize-merge'], action: { number: 12 },
      authority: { kind: 'delegated-evaluator', basis: 'required-gates', delegation, gates: [] } }),
    event('MERGE_BLOCKED', { candidate: { hash: H(2) }, repository: 'app', number: 12, blocker: 'required-review', message: 'At least 1 approving review is required' }),
    event('DIAL_SET', { dial: 'autonomy', value: 'supervised', previous: 'delegated', source: 'automatic', actor: 'gatereeve', trigger: 'external-blocker', reason: 'PR #12 is blocked', number: 12, repository: 'app' }),
    event('OBSERVATION', { kind: 'escaped-defect', fixId: 'owner/repo#31', reason: 'Export returned 41', links: ['owner/repo#12'], linkBasis: 'agent-proposed', authority: human() }),
    // Recorded by an earlier build without a link basis: the link is not projected.
    event('OBSERVATION', { kind: 'escaped-defect', fixId: 'owner/repo#32', links: ['owner/repo#9'] }),
    event('MILESTONE', { name: 'acceptance' }),
  ];
}
// [rigor, autonomy] in force when each event above was recorded.
const EXPECTED_DIALS = [null, ...Array(4).fill(['light', 'supervised']), ...Array(4).fill(['light', 'delegated']), ...Array(4).fill(['full', 'delegated']), ...Array(4).fill(['full', 'supervised'])];
function syntheticCore(events, home = '/runs/feature') {
  const objects = new Map([
    [H(7), { gate: 'review', outcome: 'PASS', mode: 'full', input: { hash: H(8) }, receipt: { hash: H(9) }, findings: [{ id: 'finding-1' }], dispositions: [] }],
    [H(8), {}], [H(9), { evaluator: { model: 'gate-model', provider: 'codex' } }],
  ]);
  const core = { context: { workspaceRoot: '/project/gatereeve', featureId: 'feature', repositories: [] }, store: { home, json: async ref => objects.get(ref.hash) },
    visible: events.length, state: async () => ({ state: { runId: 'run' }, events: events.slice(0, core.visible) }) };
  return core;
}
async function report(store) {
  const { dataset } = await metricsRequest('capture', {}, store);
  const value = await metricsRequest('reevaluate', { dataset }, store);
  // Event order (the snapshot itself is ordered by identity).
  value.observations.sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return value;
}
const byEvent = (rows, n) => rows.filter(row => row.reference === `event-${n}` && row.kind !== 'artifact');

test('every projected observation carries the run dials; decisions carry their authority kind (incremental)', async t => {
  const store = await metricsStore(t), events = journal(), core = syntheticCore(events);
  core.visible = 7; await projectWorkflow(core, store);
  core.visible = events.length; await projectWorkflow(core, store); await projectWorkflow(core, store);
  const value = await report(store), rows = value.observations;
  assert.equal(await store.captureIncomplete(), false);
  assert.ok(rows.length > events.length);
  for (const row of rows) assert.ok(row.rigor && row.autonomy, `${row.id} carries rigor and autonomy`);
  for (let n = 1; n <= events.length; n++) for (const row of byEvent(rows, n)) assert.deepEqual([row.rigor, row.autonomy], EXPECTED_DIALS[n], `event ${n} ${row.check}`);
  // The reviewed gate result (and its finding) carry the dials of their job.
  const artifacts = rows.filter(row => row.reference === H(7));
  assert.deepEqual(artifacts.map(row => [row.kind, row.rigor, row.autonomy]).sort(), [['artifact', 'full', 'delegated'], ['finding', 'full', 'delegated']]);
  // Decisions: authority kind always; a delegated decision also its basis.
  const decisions = rows.filter(row => row.kind === 'decision');
  assert.deepEqual(decisions.map(row => [row.check, row.authorityKind, row.authorityBasis ?? null]), [
    ['authorize-implementation', 'human-confirmed', null], ['stay-light', 'human-confirmed', null],
    ['authorize-implementation', 'delegated-evaluator', 'planning-review'], ['accept', 'delegated-evaluator', 'required-gates']]);
  assert.deepEqual(byEvent(rows, 11)[0].actions, ['authorize-merge']);
  assert.equal(byEvent(rows, 4)[0].count, 1, 'stay-light covers one hit');
  // Start dials with provenance; dial changes with source, actor and trigger.
  const initial = rows.filter(row => row.check === 'DIAL_INITIAL').map(row => [row.dial, row.dialValue, row.dialSource, row.actor ?? null, row.authorityKind ?? null]).sort();
  assert.deepEqual(initial, [['autonomy', 'supervised', 'built-in', null, null], ['rigor', 'light', 'explicit', 'human', 'human-confirmed']]);
  const change = n => { const row = byEvent(rows, n)[0]; return [row.check, row.dial, row.dialPrevious, row.dialValue, row.dialSource, row.actor, row.trigger ?? null, row.authorityKind ?? null]; };
  assert.deepEqual(change(5), ['DIAL_SET', 'autonomy', 'supervised', 'delegated', 'explicit', 'human', null, 'human-confirmed']);
  assert.deepEqual(change(9), ['DIAL_SET', 'rigor', 'light', 'full', 'automatic', 'gatereeve', 'tripwire', null]);
  assert.deepEqual(change(13), ['DIAL_SET', 'autonomy', 'delegated', 'supervised', 'automatic', 'gatereeve', 'external-blocker', null]);
  // Tripwires: stage, hit count and categories only.
  assert.deepEqual([3, 8].map(n => { const row = byEvent(rows, n)[0]; return [row.stage, row.outcome, row.count, row.categories]; }),
    [['candidate.prepare', 'HIT', 1, ['secrets']], ['milestone.pass acceptance', 'HIT', 2, ['data-deletion', 'migrations-schema']]]);
  const review = rows.find(row => row.check === 'planning-review:brief');
  assert.deepEqual([review.kind, review.outcome, review.model, review.provider, review.links], ['artifact', 'PASS', 'reviewer-model', 'codex', [H(5)]]);
  assert.deepEqual([byEvent(rows, 12)[0].blocker, byEvent(rows, 12)[0].outcome], ['required-review', 'BLOCKED']);
  // Escaped defects: a link is projected only with its human basis.
  const [confirmed, legacy] = [byEvent(rows, 14)[0], byEvent(rows, 15)[0]];
  assert.deepEqual([confirmed.kind, confirmed.fixId, confirmed.links, confirmed.linkBasis, confirmed.authorityKind], ['escaped-defect', 'owner/repo#31', ['owner/repo#12'], 'agent-proposed', 'human-confirmed']);
  assert.deepEqual([legacy.kind, legacy.fixId, legacy.links ?? null, legacy.linkBasis ?? null], ['escaped-defect', 'owner/repo#32', null, null]);
  // No instruction text, conversation context, reasons, paths or messages reach reporting.
  const serialized = JSON.stringify(rows);
  for (const hidden of [SECRET, 'private conversation context', 'config/.env.production', 'db/001.sql', 'approving review', 'Delegate this run', 'Tripwire escalation']) assert.ok(!serialized.includes(hidden), hidden);
  // Report summary and dial groups.
  const m = value.measurement;
  assert.deepEqual(m.runs, { started: 1, byRigor: { light: 1 }, byAutonomy: { supervised: 1 } });
  assert.equal(m.dialChanges, 3); assert.equal(m.delegations, 1);
  assert.deepEqual(m.escalations, { total: 1, byTrigger: { tripwire: 1 } });
  assert.deepEqual(m.handBacks, { total: 1, byTrigger: { 'external-blocker': 1 } });
  assert.deepEqual(m.decisions, { total: 4, byAuthority: { 'delegated-evaluator': 2, 'human-confirmed': 2 }, standingApplications: 0 });
  assert.equal(m.humanTouches, 4, 'two human decisions, the human delegation and the human start choice');
  assert.deepEqual(m.tripwires, { evaluations: 2, withHits: 2, hits: 3, stayLight: 1 });
  assert.equal(m.planningReviews, 1); assert.equal(m.externalBlockers, 1);
  assert.deepEqual(m.escapedDefects.byBasis, { 'agent-proposed': 1 });
  assert.equal(m.escapedDefects.records, 2); assert.equal(m.escapedDefects.confirmedOriginLinks, 1);
  assert.deepEqual(value.rigors.map(row => row.name).sort(), ['full', 'light']);
  assert.deepEqual(value.autonomies.map(row => row.name).sort(), ['delegated', 'supervised']);
  assert.deepEqual(value.authorities.map(row => [row.name, row.observations]), [['delegated-evaluator', 2], ['human-confirmed', 2]]);
});

test('autonomous projection preserves its mode and judgment basis without exporting mandate text', async t => {
  const store = await metricsStore(t), events = journal();
  events[4].payload.value = 'autonomous';
  events[4].payload.mandate = { goal: SECRET, constraints: [SECRET] };
  for (const n of [6, 10]) {
    events[n].payload.authority.kind = 'autonomous-evaluator';
    events[n].payload.authority.basis = 'autonomous-judgment';
    events[n].payload.authority.judgment = { reason: SECRET, mandateRebuttal: { goalEvidence: SECRET } };
  }
  events[12].payload.previous = 'autonomous';
  await projectWorkflow(syntheticCore(events), store);
  const value = await report(store);
  assert.equal(await store.captureIncomplete(), false);
  const decision = byEvent(value.observations, 7)[0];
  assert.deepEqual([decision.autonomy, decision.authorityKind, decision.authorityBasis], ['autonomous', 'autonomous-evaluator', 'autonomous-judgment']);
  assert.equal(value.measurement.handBacks.total, 1);
  assert.ok(value.autonomies.some(row => row.name === 'autonomous'));
  assert.ok(!JSON.stringify(value.observations).includes(SECRET));
});

test('decisions applied under a standing grant are measured apart from per-decision human acts', async t => {
  const store = await metricsStore(t);
  const at = n => new Date(Date.parse('2026-11-16T00:00:00Z') + n * 1000).toISOString();
  const events = [
    { sequence: 1, hash: 'standing-1', recordedAt: at(1), type: 'STARTED', payload: { featureId: 'feature', implementers: ['implementer'], optionalGates: [] } },
    { sequence: 2, hash: 'standing-2', recordedAt: at(2), type: 'DECIDED', payload: { kind: 'accept', subject: H(1), authority: human(), reason: 'Per-PR human acceptance', consequences: 'Merge PR #3' } },
    // An application of a standing grant records the grant's original authority plus the grant marker.
    { sequence: 3, hash: 'standing-3', recordedAt: at(3), type: 'DECIDED', payload: { kind: 'accept', subject: H(2), authority: human(), standingGrant: 'grant-event',
      actions: ['authorize-merge'], reason: 'Standing application', consequences: 'Merge PR #4' } },
  ];
  await projectWorkflow(syntheticCore(events), store);
  const value = await report(store);
  const decisions = value.observations.filter(row => row.kind === 'decision');
  assert.deepEqual(decisions.map(row => [row.reference, row.authorityKind, row.authorityBasis ?? null]),
    [['standing-2', 'human-confirmed', null], ['standing-3', 'human-confirmed', 'standing-grant']]);
  assert.deepEqual(value.measurement.decisions, { total: 2, byAuthority: { 'human-confirmed': 2 }, standingApplications: 1 });
  assert.equal(value.measurement.humanTouches, 1, 'only the per-decision human acceptance is a human touch');
  assert.ok(!JSON.stringify(value.observations).includes('grant-event'), 'the grant reference itself is not projected');
});

test('a contract-7 run without dial events reads full/supervised; earlier reporting rows are not converted', async t => {
  const store = await metricsStore(t);
  const events = [
    { sequence: 1, hash: 'plain-1', recordedAt: '2026-11-10T00:00:00Z', type: 'STARTED', payload: { featureId: 'feature', implementers: ['implementer'], optionalGates: [] } },
    { sequence: 2, hash: 'plain-2', recordedAt: '2026-11-10T00:00:01Z', type: 'OBSERVATION', payload: { kind: 'strategy', strategy: 'focused checks', reason: 'Small change' } },
    { sequence: 3, hash: 'plain-3', recordedAt: '2026-11-10T00:00:02Z', type: 'DECIDED', payload: { kind: 'approve-design', subject: H(1), authority: human(), reason: 'Approved', consequences: 'Spec' } },
  ];
  const core = syntheticCore(events, '/runs/plain');
  // Simulate a projection made before dial measurement: one row without dial fields.
  await store.admit(true); await store.key();
  const db = await reportingDatabase(store);
  const source = await store.identity(`source:${(await import('node:os')).hostname()}`), workflow = await store.identity('/runs/plain:run');
  const earlier = { id: `${source}:plain-1`, source, observedAt: events[0].recordedAt, kind: 'event', project: 'gatereeve', projectKey: `${source}:x`, workflow, issue: 'feature', platform: 'host', check: 'STARTED', reference: 'plain-1' };
  const body = JSON.stringify(Object.fromEntries(Object.entries(earlier).sort(([a], [b]) => (a < b ? -1 : 1)))), version = createHash('sha256').update(body).digest('hex');
  db.prepare('INSERT INTO reporting_observations VALUES (?,?,?,?)').run(earlier.id, version, earlier.observedAt, body);
  db.prepare('INSERT INTO reporting_latest VALUES (?,?)').run(earlier.id, version);
  db.prepare('INSERT INTO reporting_local VALUES (?)').run(earlier.id);
  db.prepare('INSERT INTO reporting_workflows VALUES (?,?,?)').run(workflow, '/runs/plain', JSON.stringify({ sequence: 1, issue: 'feature', project: 'gatereeve' }));
  await projectWorkflow(core, store);
  assert.equal(db.prepare('SELECT body FROM reporting_observations WHERE id=?').get(earlier.id).body, body, 'the earlier row is untouched');
  const value = await report(store);
  const projected = value.observations.filter(row => row.id !== earlier.id);
  assert.deepEqual(projected.map(row => [row.kind, row.check, row.rigor, row.autonomy]), [['strategy', 'OBSERVATION', 'full', 'supervised'], ['decision', 'approve-design', 'full', 'supervised']]);
  assert.equal(projected.find(row => row.kind === 'decision').authorityKind, 'human-confirmed');
  assert.equal(value.observations.some(row => row.check === 'DIAL_INITIAL'), false, 'no start dials were recorded, none are invented');
  // The earlier row is grouped as not recorded, never as full/supervised.
  assert.deepEqual(value.rigors.map(row => [row.name, row.observations]).sort(), [['Not recorded', 1], ['full', 2]]);
  assert.equal(NOT_RECORDED, 'Not recorded');
  // A run whose STARTED has no dials reads as the defaults from its first event.
  const fresh = await metricsStore(t);
  await projectWorkflow(syntheticCore(events, '/runs/fresh'), fresh);
  const started = (await report(fresh)).observations.find(row => row.check === 'STARTED');
  assert.deepEqual([started.rigor, started.autonomy], ['full', 'supervised']);
});

test('report wording never presents absent escaped-defect records as safety evidence', async t => {
  assert.match(escapedDefectStatement(0, 0), /^No escaped defects recorded\. The absence of escaped-defect records is not evidence that no defects escaped, or that light or delegated runs are safe\.$/u);
  assert.match(escapedDefectStatement(1, 0), /^1 escaped defect recorded, 0 with a human-stated or human-confirmed origin link\. .*neither a defect rate nor evidence of safety\.$/u);
  assert.match(escapedDefectStatement(3, 2), /^3 escaped defects recorded, 2 with/u);
  assert.match(DIAL_COMPARISON_CAVEAT, /not randomized/u); assert.match(DIAL_COMPARISON_CAVEAT, /not evidence that light or delegated work is safe/u);
  const store = await metricsStore(t), events = journal().filter(event => event.type !== 'OBSERVATION');
  await projectWorkflow(syntheticCore(events), store);
  const value = await report(store);
  assert.equal(value.measurement.escapedDefects.records, 0);
  assert.equal(value.measurement.escapedDefects.statement, escapedDefectStatement(0, 0));
  assert.match(value.interpretation, /absence of escaped-defect records is not evidence of safety/u);
  const html = renderReevaluation(value, 'html');
  assert.ok(html.includes('No escaped defects recorded.'));
  assert.ok(html.includes('not evidence that no defects escaped'));
  assert.ok(html.includes('not randomized'));
  assert.doesNotMatch(html, /No escaped defects(?! recorded)/u);
  assert.doesNotMatch(html, /\b0 (?:linked )?escaped defects\b/u);
  assert.doesNotMatch(html, /\bno defects\b(?! escaped)/iu);
  for (const heading of ['Escaped defects', 'Rigor, autonomy and decision authority', '<h2>Rigor</h2>', '<h2>Autonomy</h2>', '<h2>Decision authority</h2>']) assert.ok(html.includes(heading), heading);
  // With recorded defects the count is qualified, never a rate.
  const withDefects = await metricsStore(t);
  await projectWorkflow(syntheticCore(journal()), withDefects);
  const recorded = renderReevaluation(await report(withDefects), 'html');
  assert.ok(recorded.includes('2 escaped defects recorded, 1 with a human-stated or human-confirmed origin link'));
  assert.ok(recorded.includes('neither a defect rate nor evidence of safety'));
});

async function runFixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gatereeve-measurement-run-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'app'), home = join(root, 'docs/issues/feature');
  await mkdir(repo, { recursive: true }); await mkdir(home, { recursive: true });
  await git(repo, ['init', '-b', 'topic']);
  await git(repo, ['config', 'user.email', 'fixture@example.test']); await git(repo, ['config', 'user.name', 'Fixture']);
  await git(repo, ['config', 'commit.gpgsign', 'false']);
  await writeFile(join(repo, 'app.js'), 'export const answer = 42;\n');
  await git(repo, ['add', 'app.js']); await git(repo, ['commit', '-m', 'fixture']);
  const context = { featureId: 'feature', featureHome: home, workspaceRoot: root, repositories: [{ alias: 'app', path: repo }] };
  const core = await CurrentCore.at(context);
  const request = (operation, input = {}, operationId) => core.execute({ operation, input, operationId });
  return { root, repo, home, context, core, request };
}

test('escaped-defect origin links: human-stated or confirmed only; unconfirmed proposals are refused and never stored', async t => {
  const f = await runFixture(t);
  await f.request('run.start', { runId: 'run-one', implementers: ['implementer'], rigor: { value: 'light', authority: human('Light for this one.'), reason: 'Small change' } }, 'start');
  const link = { kind: 'escaped-defect', fixId: 'owner/repo#31', reason: 'Export returned 41', links: ['owner/repo#12'] };
  for (const [label, input, pattern] of [
    ['unconfirmed proposal', { ...link, linkBasis: 'agent-proposed' }, /only after the human confirms them.*Unconfirmed proposals are not stored/u],
    ['no basis', link, /needs linkBasis human-stated .* or agent-proposed/u],
    ['unknown basis', { ...link, linkBasis: 'inferred', authority: human() }, /Unknown escaped-defect link basis/u],
    ['human-stated without the statement', { ...link, linkBasis: 'human-stated' }, /needs the observed human statement/u],
    ['agent authority', { ...link, linkBasis: 'agent-proposed', authority: { kind: 'agent', instruction: 'I think so', context: 'blame' } }, /observed human instruction/u],
    ['no fix', { kind: 'escaped-defect', links: ['owner/repo#12'], linkBasis: 'human-stated', authority: human() }, /names the fix \(fixId\)/u],
    ['basis without links', { kind: 'escaped-defect', fixId: 'owner/repo#31', linkBasis: 'human-stated', authority: human() }, /belong only to an escaped-defect note that links/u],
    ['basis on another kind', { kind: 'friction', reason: 'slow', linkBasis: 'human-stated', authority: human() }, /belong only to an escaped-defect note that links/u],
    ['empty link', { ...link, links: [''], linkBasis: 'human-stated', authority: human() }, /Invalid observation links/u],
  ]) await assert.rejects(f.request('workflow.observe', input, `bad-${label.replace(/\W+/gu, '-')}`), pattern, label);
  await f.request('workflow.observe', { ...link, linkBasis: 'human-stated', authority: human('This fixes a bug from #12.') }, 'stated');
  await f.request('workflow.observe', { ...link, fixId: 'owner/repo#33', links: ['run:run-zero', 'owner/repo#14'], linkBasis: 'agent-proposed', authority: human('Yes, #14 introduced it.') }, 'confirmed');
  await f.request('workflow.observe', { kind: 'escaped-defect', fixId: 'owner/repo#34', reason: 'Origin unknown' }, 'unlinked');
  const { events } = await f.core.state();
  const notes = events.filter(event => event.type === 'OBSERVATION').map(event => event.payload);
  assert.equal(notes.length, 3, 'refused notes left no record');
  assert.deepEqual(notes.map(note => [note.linkBasis ?? null, note.authority?.kind ?? null]), [['human-stated', 'human-confirmed'], ['agent-proposed', 'human-confirmed'], [null, null]]);
  const store = await metricsStore(t);
  await projectWorkflow(f.core, store);
  const value = await report(store);
  const defects = value.observations.filter(row => row.kind === 'escaped-defect');
  assert.deepEqual(defects.map(row => [row.fixId, row.linkBasis ?? null, row.links ?? null, row.rigor, row.autonomy]), [
    ['owner/repo#31', 'human-stated', ['owner/repo#12'], 'light', 'supervised'],
    ['owner/repo#33', 'agent-proposed', ['run:run-zero', 'owner/repo#14'], 'light', 'supervised'],
    ['owner/repo#34', null, null, 'light', 'supervised']]);
  assert.ok(!JSON.stringify(value.observations).includes('introduced it'), 'the confirmation text stays in the journal');
  assert.deepEqual(value.measurement.escapedDefects.byBasis, { 'agent-proposed': 1, 'human-stated': 1 });
  // A real agent escalation projects with explicit provenance.
  await f.request('run.set-dial', { dial: 'rigor', value: 'full', actor: 'agent', reason: 'Touches the schema' }, 'raise');
  await projectWorkflow(f.core, store);
  const raised = (await report(store)).observations.find(row => row.check === 'DIAL_SET');
  assert.deepEqual([raised.dial, raised.dialPrevious, raised.dialValue, raised.dialSource, raised.actor, raised.rigor], ['rigor', 'light', 'full', 'explicit', 'agent', 'full']);
});

test('projection failure never changes workflow authority', async t => {
  const f = await runFixture(t);
  // The default metrics location is unusable: every projection fails.
  await writeFile(join(f.root, 'not-a-directory'), '');
  const previous = process.env.GATEREEVE_METRICS_DIR;
  process.env.GATEREEVE_METRICS_DIR = join(f.root, 'not-a-directory', 'metrics');
  t.after(() => { process.env.GATEREEVE_METRICS_DIR = previous; });
  await f.request('run.start', { runId: 'run-one', implementers: ['implementer'], rigor: { value: 'light', authority: human('Light for this one.'), reason: 'Small change' } }, 'start');
  await f.request('workflow.observe', { kind: 'strategy', strategy: 'focused', reason: 'small' }, 'note');
  await f.request('run.set-dial', { dial: 'rigor', value: 'full', actor: 'agent', reason: 'Raise' }, 'raise');
  const { state, events } = await f.core.state();
  assert.deepEqual(events.map(event => event.type), ['STARTED', 'OBSERVATION', 'DIAL_SET']);
  assert.equal(state.dials.rigor.value, 'full');
  // A store that throws mid-projection is contained the same way.
  const broken = { config: async () => { throw new Error('store unavailable'); }, markIncomplete: async () => {} };
  assert.equal(await projectWorkflow(f.core, broken), undefined);
  assert.deepEqual((await f.core.state()).events.map(event => event.hash), events.map(event => event.hash));
});

test('a contract-6 run is neither projected nor converted; its resumption projects at the defaults', async t => {
  const f = await runFixture(t);
  const { executeCurrentRequest } = await import('../../plugin-src/shared/resources/protocol/current/adapter.js');
  const { DatabaseSync } = await import('node:sqlite');
  await writeFile(join(f.root, '.agentic-workflow.json'), JSON.stringify({ schemaVersion: 1, featureId: 'feature', repositories: { app: { path: 'app', integrationBranch: 'main' } } }));
  const directory = join(f.home, '.gatereeve-current');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const legacyPath = join(directory, 'workflow.sqlite');
  const legacy = new DatabaseSync(legacyPath);
  legacy.exec(`CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    CREATE TABLE events(run_id TEXT NOT NULL, sequence INTEGER NOT NULL, operation_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(run_id,sequence), UNIQUE(run_id,operation_id)) STRICT;
    PRAGMA user_version = 1;`);
  legacy.prepare('INSERT INTO metadata VALUES (?,?)').run('contract', 'gatereeve/current/6');
  legacy.prepare('INSERT INTO metadata VALUES (?,?)').run('active', JSON.stringify({ contract: 'gatereeve/current/6', runId: 'old' }));
  legacy.prepare('INSERT INTO events VALUES (?,?,?,?)').run('old', 1, 'start', JSON.stringify({ contract: 'gatereeve/current/6', type: 'STARTED' }));
  legacy.close();
  const digest = async () => createHash('sha256').update(await readFile(legacyPath)).digest('hex');
  const before = await digest(), listing = async () => (await readdir(directory)).filter(name => name.startsWith('workflow.sqlite') && !name.includes('current-')).sort();
  const files = await listing();
  const store = await metricsStore(t);
  const core = await CurrentCore.at(f.context);
  await projectWorkflow(core, store);
  assert.equal(await store.captureIncomplete(), false, 'nothing to project is not a capture failure');
  assert.equal((await metricsRequest('databases', {}, store)).workflows.length, 0, 'the earlier-contract run is not projected');
  assert.equal(await digest(), before); assert.deepEqual(await listing(), files);
  const resumed = await executeCurrentRequest({ operation: 'run.resume-current', cwd: f.repo, operationId: 'resume', input: { implementers: ['implementer'] } });
  assert.equal(resumed.ok, true, JSON.stringify(resumed.error));
  await projectWorkflow(await CurrentCore.at(f.context), store);
  const rows = (await report(store)).observations;
  assert.ok(rows.length >= 3);
  for (const row of rows) assert.deepEqual([row.rigor, row.autonomy], ['full', 'supervised'], row.check);
  assert.deepEqual(rows.filter(row => row.check === 'DIAL_INITIAL').map(row => [row.dial, row.dialSource]).sort(), [['autonomy', 'built-in'], ['rigor', 'built-in']]);
  assert.equal(await digest(), before, 'the earlier-contract database is retained byte-for-byte');
  assert.deepEqual(await listing(), files);
});

test('new operations are measured under their own labels', async t => {
  const store = await metricsStore(t);
  for (const label of ['review.publish', 'planning.review', 'delegation.apply', 'run.set-dial', 'stay-light']) {
    const record = await store.put({ id: label, project: 'gatereeve', label, command: label, category: 'delivery', startedAt: Date.now(), durationMs: 1, outcome: 'PASS' });
    assert.equal(record.label, label);
  }
  assert.equal((await store.put({ id: 'unknown', project: 'gatereeve', label: 'made.up', category: 'delivery', startedAt: Date.now(), durationMs: 1, outcome: 'PASS' })).label, 'delivery');
});

test('CLI, desktop, MCP and plugin copies match and use contract gatereeve/current/8', async t => {
  const canonical = join(repositoryRoot, 'plugin-src/shared/resources');
  // Compare every copy this checkout ships. Partial images (the CI container copies
  // only apps/desktop/scripts) omit the desktop app; wherever the desktop package
  // is present its staged copy is required. cli/resources is generated, so it is
  // compared whenever a build produced it.
  const present = async path => { try { await readdir(path); return true; } catch { return false; } };
  const desktopApp = await readFile(join(repositoryRoot, 'apps/desktop/package.json')).then(() => true, () => false);
  const copies = [];
  if (desktopApp) copies.push(join(repositoryRoot, 'apps/desktop/resources'));
  else t.diagnostic('desktop app absent from this checkout; its staged copy is compared where it ships');
  if (await present(join(repositoryRoot, 'cli/resources'))) copies.push(join(repositoryRoot, 'cli/resources'));
  else t.diagnostic('cli/resources not generated in this checkout');
  const files = async root => (await readdir(root, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name).slice(root.length + 1)).sort();
  for (const directory of ['performance', 'protocol/current']) {
    const expected = await files(join(canonical, directory));
    for (const copy of copies) {
      assert.deepEqual(await files(join(copy, directory)), expected, `${copy}/${directory}`);
      for (const name of expected) assert.deepEqual(await readFile(join(copy, directory, name)), await readFile(join(canonical, directory, name)), `${copy}/${directory}/${name}`);
    }
  }
  for (const root of [canonical, ...copies]) {
    const { CONTRACT } = await import(join(root, 'protocol/current/contracts.js'));
    assert.equal(CONTRACT, 'gatereeve/current/8', root);
  }
  // MCP returns the shared service's report, measurement included.
  const store = await metricsStore(t);
  await projectWorkflow(syntheticCore(journal()), store);
  const { dataset } = await metricsRequest('capture', {}, store);
  const session = createSession({ store });
  await session({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'test' }, capabilities: {} } });
  await session({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const response = await session({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'metrics_reevaluate', arguments: { dataset } } });
  assert.equal(response.result.isError, false);
  assert.deepEqual(response.result.structuredContent, await metricsRequest('reevaluate', { dataset }, store));
  assert.equal(response.result.structuredContent.measurement.escalations.total, 1);
});
