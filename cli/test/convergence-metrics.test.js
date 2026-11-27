import './helpers/private-scratch.js';
// Convergence metrics (issue #149, spec R1-R12): per-finding and per-reviewer
// fields in the reporting projection, the four D6 measures from observation
// rows alone, not-recorded handling, and the CLI, reevaluation and MCP surfaces.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { MetricsStore } from '../../plugin-src/shared/resources/performance/store.js';
import { metricsRequest, renderReevaluation, renderConvergenceMarkdown } from '../../plugin-src/shared/resources/performance/service.js';
import { projectWorkflow, PROJECTION_VERSION } from '../../plugin-src/shared/resources/performance/workflow-projection.js';
import { observation, reportingDatabase, NOT_RECORDED } from '../../plugin-src/shared/resources/performance/fleet.js';
import { convergence, roundsMeasure, demotedMeasure, escapedMeasure, secondOpinionMeasure, reviewerTable, cohort } from '../../plugin-src/shared/resources/performance/convergence.js';
import { createSession } from '../../plugin-src/shared/resources/performance/mcp.js';

const defaultMetrics = await mkdtemp(join(tmpdir(), 'gatereeve-convergence-default-'));
process.env.GATEREEVE_METRICS_DIR = join(defaultMetrics, 'metrics');
process.on('exit', () => rmSync(defaultMetrics, { recursive: true, force: true }));

const repositoryRoot = resolve(import.meta.dirname, '../..');
const H = n => `sha256:${String(n).padStart(64, '0')}`;
const SCENARIO = 'SECRET-SCENARIO a concurrent writer loses the update';
const EVIDENCE = 'SECRET-EVIDENCE line 42 shows the race';
const human = { kind: 'human-confirmed', instruction: 'SECRET-INSTRUCTION yes, that finding', context: 'private context' };

async function metricsStore(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gatereeve-convergence-')));
  const store = new MetricsStore(join(root, 'metrics'), { privateConnection: true });
  t.after(async () => { store.close(); await rm(root, { recursive: true, force: true }); });
  return store;
}
const finding = (id, fields) => ({ id, classId: `class-${id}`, classStatement: `Class of ${id}`, criterion: 'R1', path: `app/${id}.js`,
  failureScenario: SCENARIO, evidence: EVIDENCE, blocking: true, ...fields });
const policy = (scope, round, regressionPaths = []) => ({ roundPolicy: { policy: 'round-policy/1', scope, round, band: 'ignored', regressionPaths } });
// Result objects with the shapes execution.js retains (issue #140/#141 fields).
function objects() {
  const result = (n, provider, model, fields, input) => [[H(n), { gate: 'review', mode: 'full', input: { hash: H(n + 1) }, receipt: { hash: H(n + 2) }, findings: [], dispositions: [], reviewerLaunched: true, ...fields }],
    [H(n + 1), input], [H(n + 2), { evaluator: { provider, model } }]];
  return new Map([
    // Round 1 of the slice scope: codex FAIL with a high finding; claude's verdict rejected.
    ...result(10, 'codex', 'gpt-x', { outcome: 'FAIL', findings: [finding('H1', { severity: 'high' })] }, policy('slice', 1)),
    ...result(20, 'claude-code', 'opus-x', { outcome: 'UNAVAILABLE', unavailableReason: 'contract', rejectionRule: 'schema-required', summary: 'review.findings[0].blocking is required' }, policy('slice', 1)),
    // Round 2: claude's first attempt failed at the provider, its retry completed; the pair PASSes.
    ...result(30, 'codex', 'gpt-x', { outcome: 'PASS' }, policy('slice', 2)),
    ...result(40, 'claude-code', 'opus-x', { outcome: 'UNAVAILABLE', unavailableReason: 'provider-error', providerFailure: { category: 'configuration-or-execution' } }, policy('slice', 2)),
    ...result(50, 'claude-code', 'opus-x', { outcome: 'PASS', findings: [finding('C1', { severity: 'low', blocking: false })], normalized: [{ rule: 'unknown-property' }, { rule: 'unknown-property' }] }, policy('slice', 2)),
    // Round 4 of the feature-final scope: the narrowed band.
    ...result(60, 'codex', 'gpt-x', { outcome: 'FAIL', findings: [
      finding('M1', { severity: 'medium' }),                                    // non-regression: demoted
      finding('M2', { severity: 'medium' }),                                    // regression: blocks
      finding('L1', { severity: 'low' }),                                       // low marked blocking: demoted
      finding('X1', { severity: 'high', classStatement: 'two\nlines' }),        // statement omitted
      finding('X2', { severity: 'high', classStatement: 'x'.repeat(201) }),     // statement omitted
      finding('X3', { severity: 'high', classStatement: 'line\u2028separator' }), // statement omitted
      { id: 'U1', blocking: true, path: 'app/u.js' },                           // earlier-contract shape: unrated
    ] }, policy('feature-final', 4, ['app/M2.js'])),
    ...result(70, 'claude-code', 'opus-x', { outcome: 'FAIL', findings: [finding('K1', { severity: 'high', classId: 'class-M1' })] }, policy('feature-final', 4, ['app/M2.js'])),
    // An individual review before the round policy recorded a round.
    ...result(80, 'codex', 'gpt-x', { outcome: 'PASS' }, {}),
    // A refused result (no reviewer launched).
    ...result(90, 'codex', 'gpt-x', { outcome: 'UNAVAILABLE', unavailableReason: 'missing-evidence', reviewerLaunched: false }, policy('slice', 1)),
    ...result(100, 'codex', 'gpt-x', { outcome: 'UNAVAILABLE', unavailableReason: 'missing-evidence' }, policy('slice', 1)),
  ]);
}
function journal() {
  let n = 0;
  const event = (type, payload) => { n++; return { sequence: n, hash: `event-${n}`, recordedAt: new Date(Date.parse('2026-11-27T00:00:00Z') + n * 1000).toISOString(), type, payload }; };
  // As boundary-review.js records it: the scope and revision, not the round.
  const pair = (scope, revision, outcomes) => event('BOUNDARY_REVIEWED', { candidate: { hash: H(1) }, selection: 'sel', round: 'r', roundPolicy: { policy: 'round-policy/1', scope, revision }, outcomes });
  return [
    event('STARTED', { featureId: 'feature', implementers: ['implementer'], optionalGates: [], dials: { rigor: { value: 'full', source: 'explicit', actor: 'human', authority: human }, autonomy: { value: 'goal', source: 'explicit', actor: 'human', authority: human } } }),
    event('ROUND_COUNTED', { roundPolicy: { policy: 'round-policy/1', scope: 'slice', revision: H(2) }, candidate: { hash: H(1) }, after: 0 }),
    event('JOB_FINISHED', { jobId: 'j1', results: [{ hash: H(10) }, { hash: H(20) }, { hash: H(90) }, { hash: H(100) }] }),
    pair('slice', H(2), [{ provider: 'codex', status: 'completed', results: [{ hash: H(10) }] }, { provider: 'claude-code', status: 'verdict-rejected', results: [{ hash: H(20) }] }]),
    event('ROUND_COUNTED', { roundPolicy: { policy: 'round-policy/1', scope: 'slice', revision: H(3) }, candidate: { hash: H(1) }, after: 1 }),
    event('JOB_FINISHED', { jobId: 'j2', results: [{ hash: H(30) }, { hash: H(40) }, { hash: H(50) }] }),
    pair('slice', H(3), [{ provider: 'codex', status: 'completed', results: [{ hash: H(30) }] }, { provider: 'claude-code', status: 'completed', results: [{ hash: H(50) }] }]),
    event('ROUND_COUNTED', { roundPolicy: { policy: 'round-policy/1', scope: 'feature-final', revision: H(4) }, candidate: { hash: H(1) }, after: 3 }),
    event('JOB_FINISHED', { jobId: 'j3', results: [{ hash: H(60) }, { hash: H(70) }, { hash: H(80) }] }),
    pair('feature-final', H(4), [{ provider: 'codex', status: 'completed', results: [{ hash: H(60) }] }, { provider: 'claude-code', status: 'completed', results: [{ hash: H(70) }] }]),
    event('DECIDED', { kind: 'waive', gates: ['review', 'verification'], subject: H(5), authority: human, reason: 'SECRET-REASON ship it', consequences: 'Accept risk' }),
    event('REVIEW_ADJUDICATED', { candidate: { hash: H(1) }, pair: 'p', reviews: [{ hash: H(60) }, { hash: H(70) }], selection: 'sel', grant: 'g', mandate: 'm', reason: 'SECRET-REASON adjudicated', dispositions: [], evidence: [] }),
    event('OBSERVATION', { kind: 'escaped-defect', fixId: 'owner/repo#9', links: [`finding:${H(60)}:M1`], linkBasis: 'human-stated', authority: human }),
  ];
}
function syntheticCore(events, home = '/runs/feature', store = objects()) {
  const core = { context: { workspaceRoot: '/project/gatereeve', featureId: 'feature', repositories: [] }, store: { home, json: async ref => store.get(ref.hash) },
    visible: events.length, state: async () => ({ state: { runId: 'run' }, events: events.slice(0, core.visible) }) };
  return core;
}
async function localRows(store) {
  const db = await reportingDatabase(store, false);
  return db.prepare('SELECT o.body FROM reporting_latest l JOIN reporting_observations o ON o.id=l.id AND o.version=l.version').all().map(row => JSON.parse(row.body));
}
async function projected(t) {
  const store = await metricsStore(t);
  await projectWorkflow(syntheticCore(journal()), store);
  assert.equal(await store.captureIncomplete(), false);
  return { store, rows: await localRows(store) };
}
const pick = (row, keys) => Object.fromEntries(keys.map(key => [key, row[key] ?? null]));

test('R1: finding rows carry severity, class, criterion, effective and reviewer blocking, demotion and round, and no scenario text', async t => {
  const { rows } = await projected(t);
  const findings = Object.fromEntries(rows.filter(row => row.kind === 'finding').map(row => [row.findingId, row]));
  const keys = ['severity', 'classId', 'classStatement', 'criterion', 'reviewerBlocking', 'blocking', 'demoted', 'hasFailureScenario', 'reviewScope', 'round', 'provider', 'model', 'reference'];
  assert.deepEqual(pick(findings.H1, keys), { severity: 'high', classId: 'class-H1', classStatement: 'Class of H1', criterion: 'R1', reviewerBlocking: true, blocking: true, demoted: false,
    hasFailureScenario: true, reviewScope: 'slice', round: 1, provider: 'codex', model: 'gpt-x', reference: H(10) });
  // Round 4: a medium non-regression is demoted, a medium regression blocks, a low marked blocking is demoted.
  assert.deepEqual(pick(findings.M1, ['severity', 'blocking', 'demoted', 'round', 'reviewScope']), { severity: 'medium', blocking: false, demoted: true, round: 4, reviewScope: 'feature-final' });
  assert.deepEqual(pick(findings.M2, ['blocking', 'demoted']), { blocking: true, demoted: false });
  assert.deepEqual(pick(findings.L1, ['severity', 'reviewerBlocking', 'blocking', 'demoted']), { severity: 'low', reviewerBlocking: true, blocking: false, demoted: true });
  // An earlier-contract finding reads as unrated and blocks as recorded.
  assert.deepEqual(pick(findings.U1, ['severity', 'blocking', 'demoted', 'hasFailureScenario', 'classId']), { severity: 'unrated', blocking: true, demoted: false, hasFailureScenario: false, classId: null });
  // A multi-line or over-long class statement is omitted.
  assert.equal(findings.X1.classStatement, undefined); assert.equal(findings.X2.classStatement, undefined); assert.equal(findings.X3.classStatement, undefined);
  assert.equal(findings.C1.blocking, false); assert.equal(findings.C1.demoted, false);
  const serialized = JSON.stringify(rows);
  for (const hidden of ['SECRET-SCENARIO', 'SECRET-EVIDENCE', 'app/M1.js', 'app/M2.js', 'SECRET-INSTRUCTION', 'SECRET-REASON']) assert.ok(!serialized.includes(hidden), hidden);
});

test('R2: review result rows carry scope, round, band, reviewer status, UNAVAILABLE reason and failure category', async t => {
  const { rows } = await projected(t);
  const result = n => rows.find(row => row.kind === 'artifact' && row.check === 'review' && row.reference === H(n));
  const keys = ['reviewScope', 'round', 'band', 'reviewerStatus', 'unavailableReason', 'providerFailure'];
  assert.deepEqual(pick(result(10), keys), { reviewScope: 'slice', round: 1, band: 'all-non-low', reviewerStatus: 'completed', unavailableReason: null, providerFailure: null });
  assert.deepEqual(pick(result(20), keys), { reviewScope: 'slice', round: 1, band: 'all-non-low', reviewerStatus: 'verdict-rejected', unavailableReason: 'contract', providerFailure: null });
  assert.deepEqual(pick(result(40), keys), { reviewScope: 'slice', round: 2, band: 'all-non-low', reviewerStatus: 'provider-failed', unavailableReason: 'provider-error', providerFailure: 'configuration-or-execution' });
  assert.deepEqual(pick(result(60), ['band']), { band: 'high-and-medium-regressions' });
  assert.equal(result(90).reviewerStatus, 'refused');
  assert.equal(result(100).reviewerStatus, 'could-not-assess');
  // No round recorded: no round fields, status still recorded.
  assert.deepEqual(pick(result(80), keys), { reviewScope: null, round: null, band: null, reviewerStatus: 'completed', unavailableReason: null, providerFailure: null });
});

test('R3: round, pair, per-reviewer, adjudication and waiver rows', async t => {
  const { rows } = await projected(t);
  assert.deepEqual(rows.filter(row => row.check === 'ROUND_COUNTED').map(row => [row.reviewScope, row.round]).sort(), [['feature-final', 4], ['slice', 1], ['slice', 2]]);
  assert.deepEqual(rows.filter(row => row.check === 'BOUNDARY_REVIEWED').sort((a, b) => a.observedAt < b.observedAt ? -1 : 1).map(row => [row.reviewScope, row.round, row.outcome, row.count]),
    [['slice', 1, 'FAIL', 2], ['slice', 2, 'PASS', 2], ['feature-final', 4, 'FAIL', 2]]);
  const reviewers = rows.filter(row => row.check === 'boundary-reviewer').sort((a, b) => a.id < b.id ? -1 : 1);
  assert.deepEqual(reviewers.map(row => [row.reviewScope, row.round, row.provider, row.model, row.reviewerStatus, row.outcome, row.unavailableReason ?? null, row.reference]).sort(), [
    ['feature-final', 4, 'claude-code', 'opus-x', 'completed', 'FAIL', null, H(70)], ['feature-final', 4, 'codex', 'gpt-x', 'completed', 'FAIL', null, H(60)],
    ['slice', 1, 'claude-code', 'opus-x', 'verdict-rejected', 'UNAVAILABLE', 'contract', H(20)], ['slice', 1, 'codex', 'gpt-x', 'completed', 'FAIL', null, H(10)],
    ['slice', 2, 'claude-code', 'opus-x', 'completed', 'PASS', null, H(50)], ['slice', 2, 'codex', 'gpt-x', 'completed', 'PASS', null, H(30)]]);
  const adjudicated = rows.find(row => row.check === 'REVIEW_ADJUDICATED');
  assert.deepEqual([adjudicated.reviewScope, adjudicated.round, adjudicated.outcome], ['feature-final', 4, 'ADJUDICATED']);
  assert.deepEqual(rows.find(row => row.check === 'waive').gates, ['review', 'verification']);
  // A pair whose reviewer result is unreadable keeps the recorded status, never PASS.
  const store = await metricsStore(t);
  const events = [journal()[0], { sequence: 2, hash: 'count', recordedAt: '2026-11-27T00:59:00Z', type: 'ROUND_COUNTED', payload: { roundPolicy: { scope: 'slice', revision: H(9) }, after: 2 } },
    { sequence: 3, hash: 'lost', recordedAt: '2026-11-27T01:00:00Z', type: 'BOUNDARY_REVIEWED',
      payload: { roundPolicy: { scope: 'slice', revision: H(9) }, outcomes: [{ provider: 'codex', status: 'provider-failed', results: [{ hash: H(999) }] }, { provider: 'claude-code', status: 'retired-status' }] } }];
  await projectWorkflow(syntheticCore(events, '/runs/lost'), store);
  const lost = await localRows(store);
  assert.equal(await store.captureIncomplete(), false, 'a retired status value never fails the projection');
  // With no readable result, the round comes from the counted revision.
  assert.deepEqual(pick(lost.find(row => row.check === 'BOUNDARY_REVIEWED'), ['outcome', 'reviewScope', 'round']), { outcome: 'UNAVAILABLE', reviewScope: 'slice', round: 3 });
  assert.deepEqual(lost.filter(row => row.check === 'boundary-reviewer').map(row => [row.provider, row.reviewerStatus ?? null, row.outcome, row.round]).sort(),
    [['claude-code', null, 'UNAVAILABLE', 3], ['codex', 'provider-failed', 'UNAVAILABLE', 3]]);
  // A reused retained result keeps the recorded `refused` status (no reviewer launched).
  const reusedStore = await metricsStore(t);
  await projectWorkflow(syntheticCore([journal()[0], { sequence: 2, hash: 'reuse', recordedAt: '2026-11-27T02:00:00Z', type: 'BOUNDARY_REVIEWED',
    payload: { roundPolicy: { scope: 'slice', revision: H(3) }, outcomes: [{ provider: 'codex', status: 'refused', reused: true, results: [{ hash: H(30) }] }, { provider: 'claude-code', status: 'completed', results: [{ hash: H(50) }] }] } }], '/runs/reuse'), reusedStore);
  const reusedRows = await localRows(reusedStore);
  assert.deepEqual(reusedRows.filter(row => row.check === 'boundary-reviewer').map(row => [row.provider, row.reviewerStatus, row.outcome, row.round]).sort(),
    [['claude-code', 'completed', 'PASS', 2], ['codex', 'refused', 'PASS', 2]]);
  assert.equal(reusedRows.find(row => row.check === 'BOUNDARY_REVIEWED').outcome, 'UNAVAILABLE', 'a pair with a reused member is not a completed PASS');
});

test('R4: the observation schema accepts valid convergence fields and rejects invalid ones', () => {
  const base = { id: 'x', source: 's', observedAt: '2026-11-27T00:00:00Z', kind: 'finding' };
  const valid = { severity: 'medium', classId: 'race', classStatement: 'Lost update', criterion: 'R1', reviewerBlocking: true, blocking: false, demoted: true, hasFailureScenario: true,
    followUp: 'accepted-risk', reviewScope: 'slice', round: 4, band: 'high-and-medium-regressions', reviewerStatus: 'verdict-rejected', unavailableReason: 'contract', providerFailure: 'timeout', gates: ['review'] };
  assert.deepEqual(pick(observation({ ...base, ...valid }), Object.keys(valid)), valid);
  for (const [key, value] of [['severity', 'critical'], ['reviewerStatus', 'unknown'], ['band', 'wide'], ['unavailableReason', 'nope'], ['followUp', 'later'],
    ['round', -1], ['round', 1.5], ['round', '4'], ['blocking', 'true'], ['demoted', 1], ['reviewerBlocking', null === 0], ['hasFailureScenario', 'yes'],
    ['classStatement', 'x'.repeat(201)], ['classId', 'a\nb'], ['criterion', 'R1\nR2'], ['criterion', 'x'.repeat(1025)], ['reviewScope', 'slice\n'], ['reviewScope', 7],
    ['providerFailure', 'time\tout'], ['providerFailure', { category: 'timeout' }], ['gates', 'review'], ['gates', ['a\nb']], ['gates', ['not-a-gate']]]) {
    if (key === 'reviewerBlocking') { assert.throws(() => observation({ ...base, [key]: 'false' }), /Invalid reporting reviewerBlocking/u); continue; }
    assert.throws(() => observation({ ...base, [key]: value }), /Invalid reporting|Unsupported/u, `${key}=${JSON.stringify(value)}`);
  }
});

test('R5: an earlier-version workflow is replayed with the new fields; earlier rows are not otherwise converted or duplicated', async t => {
  const store = await metricsStore(t);
  const events = journal(), core = syntheticCore(events, '/runs/old');
  await store.admit(true); await store.key();
  const db = await reportingDatabase(store);
  const source = await store.identity(`source:${hostname()}`), workflow = await store.identity('/runs/old:run');
  // Rows as an earlier projection version stored them: no dial or convergence fields.
  const insert = row => {
    const body = JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => (a < b ? -1 : 1)))), version = createHash('sha256').update(body).digest('hex');
    db.prepare('INSERT INTO reporting_observations VALUES (?,?,?,?)').run(row.id, version, row.observedAt, body);
    db.prepare('INSERT INTO reporting_latest VALUES (?,?)').run(row.id, version);
    db.prepare('INSERT INTO reporting_local VALUES (?)').run(row.id);
    return body;
  };
  const common = { source, observedAt: events[2].recordedAt, project: 'gatereeve', projectKey: `${source}:x`, workflow, issue: 'feature', platform: 'host' };
  const started = insert({ ...common, id: `${source}:event-1`, kind: 'event', check: 'STARTED', reference: 'event-1' });
  insert({ ...common, id: `${source}:${H(10)}`, kind: 'artifact', check: 'review', outcome: 'FAIL', reference: H(10) });
  insert({ ...common, id: `${source}:${H(10)}:finding:H1`, kind: 'finding', check: 'review', outcome: 'FAIL', reference: H(10), findingId: 'H1' });
  db.prepare('INSERT INTO reporting_workflows VALUES (?,?,?)').run(workflow, '/runs/old', JSON.stringify({ sequence: 3, issue: 'feature', project: 'gatereeve' }));
  const ids = async () => db.prepare('SELECT COUNT(*) AS n FROM reporting_latest').get().n;
  await projectWorkflow(core, store);
  assert.equal(await store.captureIncomplete(), false);
  const latest = id => JSON.parse(db.prepare('SELECT o.body FROM reporting_latest l JOIN reporting_observations o ON o.id=l.id AND o.version=l.version WHERE l.id=?').get(id).body);
  // An earlier row without convergence fields is untouched.
  assert.equal(JSON.stringify(latest(`${source}:event-1`)), started);
  // A replayed finding keeps its ID and stored fields, gains only convergence fields (no dials).
  const replayed = latest(`${source}:${H(10)}:finding:H1`);
  assert.deepEqual(pick(replayed, ['severity', 'blocking', 'demoted', 'round', 'rigor', 'platform', 'projectKey']), { severity: 'high', blocking: true, demoted: false, round: 1, rigor: null, platform: 'host', projectKey: `${source}:x` });
  assert.equal(latest(`${source}:${H(10)}`).reviewerStatus, 'completed');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reporting_latest WHERE id=?').get(`${source}:${H(10)}:finding:H1`).n, 1);
  assert.equal(JSON.parse(db.prepare('SELECT body FROM reporting_workflows WHERE id=?').get(workflow).body).projection, PROJECTION_VERSION);
  // Replayed events gain per-reviewer rows; later events project in full.
  const rows = await localRows(store);
  assert.ok(rows.some(row => row.check === 'boundary-reviewer' && row.reference === H(10)));
  assert.equal(rows.find(row => row.reference === 'event-11').rigor, 'full');
  // A current-version workflow projects only new events.
  const before = await ids();
  await projectWorkflow(core, store);
  assert.equal(await ids(), before);
  const next = [...events, { sequence: 14, hash: 'event-14', recordedAt: '2026-11-27T01:00:00Z', type: 'MILESTONE', payload: { name: 'acceptance' } }];
  await projectWorkflow(syntheticCore(next, '/runs/old'), store);
  assert.equal(await ids(), before + 1);
});

// Measure fixtures: observation rows as the projection writes them.
let serial = 0;
const at = minutes => new Date(Date.parse('2026-11-27T00:00:00Z') + minutes * 60000).toISOString();
const row = fields => ({ id: `row-${serial++}`, source: 's', observedAt: at(serial), project: 'p', projectKey: 's:p', workflow: 'w1', ...fields });
// One reviewed round as the projection writes it: the pair row and one row per
// reviewer. PASS: both completed PASS; FAIL: codex FAILed; UNAVAILABLE: claude's provider failed.
const reviewerRow = (pair, slot, provider, fields) => row({ ...pair, id: `${pair.id}:reviewer:${slot}`, kind: 'artifact', check: 'boundary-reviewer', provider, reference: H(1000 + serial), ...fields });
const pairRow = (workflow, scope, round, outcome, minute) => {
  const pair = row({ workflow, kind: 'event', check: 'BOUNDARY_REVIEWED', reviewScope: scope, round, outcome, observedAt: at(minute) });
  return [pair, reviewerRow(pair, 0, 'codex', { reviewerStatus: 'completed', outcome: outcome === 'FAIL' ? 'FAIL' : 'PASS' }),
    reviewerRow(pair, 1, 'claude-code', outcome === 'UNAVAILABLE' ? { reviewerStatus: 'provider-failed', outcome: 'UNAVAILABLE' } : { reviewerStatus: 'completed', outcome: 'PASS' })];
};
const counter = (workflow, scope, round, minute) => row({ workflow, kind: 'event', check: 'ROUND_COUNTED', reviewScope: scope, round, observedAt: at(minute) });
const waiver = (workflow, minute, gates = ['review']) => row({ workflow, kind: 'decision', check: 'waive', gates, observedAt: at(minute) });

test('R6: rounds to PASS, adjudicated passes, open scopes as lower bounds, waived scopes and waives after a FAIL streak', () => {
  const measure = (...items) => roundsMeasure(items.flat(Infinity));
  // Passes at round 2 and (adjudicated) at round 3; met.
  const passing = [pairRow('w1', 'slice', 1, 'FAIL', 1), pairRow('w1', 'slice', 2, 'PASS', 2),
    pairRow('w2', 'feature-final', 3, 'FAIL', 3), row({ workflow: 'w2', kind: 'event', check: 'REVIEW_ADJUDICATED', reviewScope: 'feature-final', round: 3, observedAt: at(4) })];
  const met = measure(passing);
  assert.deepEqual([met.medianRoundsToPass, met.denominator, met.met, met.coverage], [2.5, { scopes: 2, passed: 2, open: 0, waived: 0 }, true, 'complete']);
  assert.deepEqual(met.scopes.map(scope => [scope.workflow, scope.scope, scope.status, scope.roundsToPass]), [['w1', 'slice', 'passed', 2], ['w2', 'feature-final', 'passed', 3]]);
  // A waiver without a FAIL streak closes its scope, leaves the median, and does not fail the measure.
  const waived = measure(passing, pairRow('w3', 'slice', 1, 'UNAVAILABLE', 5), waiver('w3', 6));
  assert.deepEqual([waived.denominator.waived, waived.waivesAfterFailStreak.length, waived.medianRoundsToPass, waived.met], [1, 0, 2.5, true]);
  // An open scope counts its current round and makes the measure in progress.
  const open = measure(passing, counter('w4', 'slice', 2, 5));
  assert.deepEqual([open.denominator.open, open.medianRoundsToPass, open.medianIncludesOpenScopes, open.met, open.progress], [1, 2, true, null, 'in-progress']);
  // Open scopes can only raise the median: past 3 the measure fails even while open.
  const slow = measure(pairRow('w1', 'slice', 1, 'PASS', 1), counter('w5', 'slice', 5, 2), counter('w6', 'feature-final', 6, 3));
  assert.deepEqual([slow.medianRoundsToPass, slow.met], [5, false]);
  // A waive after a FAIL streak fails the measure.
  const streak = measure(passing, pairRow('w7', 'slice', 1, 'FAIL', 7), pairRow('w7', 'slice', 2, 'FAIL', 8), waiver('w7', 9));
  assert.deepEqual([streak.waivesAfterFailStreak.map(item => [item.workflow, item.scope, item.round]), streak.met], [[['w7', 'slice', 2]], false]);
  assert.equal(streak.scopes.find(scope => scope.workflow === 'w7').waivedAfterFailStreak, true);
  // No passed scope: not measurable. Planning scopes are not boundary scopes.
  assert.equal(measure(pairRow('w1', 'planning:design', 1, 'PASS', 1)).met, null);
  assert.equal(measure([]).met, null);
});

test('R6: scope instances, one waiver per latest scope, re-reviews and reused results', () => {
  const measure = (...items) => roundsMeasure(items.flat(Infinity));
  // Two slices of one feature: slice 1 passes at round 1; slice 2 FAILs rounds 1-5 and is waived.
  const slices = measure(counter('w1', 'slice', 1, 1), pairRow('w1', 'slice', 1, 'PASS', 2),
    ...[1, 2, 3, 4, 5].flatMap(n => [counter('w1', 'slice', n, 10 + 2 * n), pairRow('w1', 'slice', n, 'FAIL', 11 + 2 * n)]), waiver('w1', 30));
  assert.deepEqual(slices.scopes.map(scope => [scope.scope, scope.instance, scope.status, scope.roundsToPass, scope.currentRound, scope.waivedAfterFailStreak]),
    [['slice', 1, 'passed', 1, 1, false], ['slice', 2, 'waived', null, 5, true]]);
  assert.deepEqual([slices.waivesAfterFailStreak.map(item => [item.scope, item.instance, item.round]), slices.met], [[['slice', 2, 5]], false]);
  // A waiver closes only the latest reviewed scope: an earlier open scope stays open.
  const later = measure(counter('w2', 'slice', 1, 1), pairRow('w2', 'slice', 1, 'FAIL', 2), counter('w2', 'feature-final', 1, 3), pairRow('w2', 'feature-final', 1, 'FAIL', 4), waiver('w2', 5));
  assert.deepEqual(later.scopes.map(scope => [scope.scope, scope.status]), [['feature-final', 'waived'], ['slice', 'open']]);
  // A scope with no reviewed round is never waived, whatever the order.
  const unreviewed = measure(waiver('w3', 1), counter('w3', 'slice', 1, 2));
  assert.deepEqual(unreviewed.scopes.map(scope => scope.status), ['open']);
  // A re-review of the same round's revision counts once; its PASS passes that round.
  const rereview = measure(counter('w4', 'slice', 1, 1), pairRow('w4', 'slice', 1, 'UNAVAILABLE', 2), pairRow('w4', 'slice', 1, 'PASS', 3));
  assert.deepEqual(rereview.scopes.map(scope => [scope.status, scope.roundsToPass, scope.reviewedRounds]), [['passed', 1, 1]]);
  // A later reused (refused) attempt never hides the attempt that ran.
  const [pair, codex, claude] = pairRow('w5', 'slice', 1, 'FAIL', 2);
  const reused = measure(counter('w5', 'slice', 1, 1), pair, codex, claude, reviewerRow(row({ ...pair, observedAt: at(3) }), 0, 'codex', { reviewerStatus: 'refused', outcome: 'PASS' }));
  assert.deepEqual(reused.scopes.map(scope => [scope.status, scope.roundsToPass]), [['open', null]]);
  // Completed reviewers of separate pair events never combine into a PASS no pair recorded:
  // codex PASSes while claude's provider fails; on re-review codex is reused (refused) and claude PASSes.
  const [first, firstCodex, firstClaude] = pairRow('w7', 'slice', 1, 'UNAVAILABLE', 2);
  const second = row({ ...first, observedAt: at(3) });
  const combined = measure(counter('w7', 'slice', 1, 1), first, firstCodex, firstClaude, second,
    reviewerRow(second, 0, 'codex', { reviewerStatus: 'refused', outcome: 'PASS' }), reviewerRow(second, 1, 'claude-code', { reviewerStatus: 'completed', outcome: 'PASS' }));
  assert.deepEqual(combined.scopes.map(scope => [scope.status, scope.roundsToPass]), [['open', null]]);
  // A round where a reviewer only reused a retained result is not a completed pair.
  const [onlyPair, onlyCodex] = pairRow('w6', 'slice', 1, 'PASS', 2);
  const refused = measure(counter('w6', 'slice', 1, 1), onlyPair, onlyCodex, reviewerRow(onlyPair, 1, 'claude-code', { reviewerStatus: 'refused', outcome: 'PASS' }));
  assert.deepEqual(refused.scopes.map(scope => [scope.status, scope.roundsToPass]), [['open', null]]);
});

const findingRow = fields => row({ kind: 'finding', check: 'review', reference: H(1), findingId: `F${serial}`, severity: 'medium', reviewerBlocking: true, blocking: false, demoted: true, hasFailureScenario: true, ...fields });
test('R7: demoted findings are counted by severity, recorded and decided parts reported separately', () => {
  const rows = [findingRow({ severity: 'medium' }), findingRow({ severity: 'low' }), findingRow({ severity: 'high', demoted: false, blocking: true })];
  const value = demotedMeasure(rows);
  assert.deepEqual([value.denominator, value.recorded.bySeverity, value.recorded.withSeverityAndScenario, value.recorded.met], [{ findings: 3, demoted: 2 }, { low: 1, medium: 1 }, 2, true]);
  assert.equal(value.decided.met, null); assert.match(value.decided.statement, /not recorded by this version/u);
  assert.equal(value.met, null);
  const missing = demotedMeasure([...rows, findingRow({ hasFailureScenario: false })]);
  assert.deepEqual([missing.recorded.withSeverityAndScenario, missing.recorded.met, missing.met], [2, false, null]);
  // Once follow-up records exist, the decided part counts them.
  const decided = demotedMeasure([findingRow({ followUp: 'accepted-risk' }), findingRow({ followUp: 'new-work' })]);
  assert.deepEqual([decided.decided.byFollowUp, decided.decided.met, decided.met], [{ 'accepted-risk': 1, 'new-work': 1 }, true, true]);
  const undecided = demotedMeasure([findingRow({ followUp: 'undecided' }), findingRow({})]);
  assert.deepEqual([undecided.decided.byFollowUp, undecided.decided.met, undecided.met], [{ [NOT_RECORDED]: 1, undecided: 1 }, false, false]);
  assert.equal(demotedMeasure([]).met, null);
});

test('R8: escaped defects traced to demoted findings, with follow-up counts and the qualified statement', () => {
  const demoted = findingRow({ reference: H(60), findingId: 'M1' }), blocked = findingRow({ reference: H(60), findingId: 'M2', demoted: false, blocking: true });
  const tracked = findingRow({ reference: H(61), findingId: 'T1', followUp: 'accepted-risk' });
  const defect = (links, basis = 'human-stated') => row({ kind: 'escaped-defect', fixId: `fix-${serial}`, links, ...(basis ? { linkBasis: basis } : {}) });
  const rows = [demoted, blocked, tracked,
    defect([`finding:${H(60)}:M1`]),                          // counted
    defect([`finding:${H(60)}:M1`], null),                    // no confirmed origin: links not projected, never counted
    defect([`finding:${H(60)}:M2`], 'agent-proposed'),        // non-demoted finding
    defect(['finding:abc:M1']),                               // malformed
    defect([`finding:${H(61)}:T1`, 'owner/repo#3'])];         // counted, with a follow-up
  const value = escapedMeasure(rows);
  assert.deepEqual([value.denominator, value.traced, value.tracedFindings, value.tracedWithFollowUp, value.met], [{ escapedDefects: 5, confirmed: 4 }, 2, 2, 1, null]);
  // One defect linking two demoted findings that both have follow-ups counts both findings.
  const both = [findingRow({ reference: H(62), findingId: 'A', followUp: 'new-work' }), findingRow({ reference: H(62), findingId: 'B', followUp: 'accepted-risk' }),
    defect([`finding:${H(62)}:A`, `finding:${H(62)}:B`])];
  assert.deepEqual([escapedMeasure(both).traced, escapedMeasure(both).tracedFindings, escapedMeasure(both).tracedWithFollowUp], [1, 2, 2]);
  assert.match(value.threshold, /no threshold/u);
  assert.match(value.statement, /neither a defect rate nor evidence of safety/u);
  const none = escapedMeasure([demoted]);
  assert.deepEqual([none.traced, none.tracedWithFollowUp, none.met], [0, 0, null]);
  assert.match(none.threshold, /no threshold/u);
  assert.match(none.statement, /not evidence that no defects escaped/u);
});

test('R9: second opinion per provider over final per-round outcomes; the class proxy never affects met', async t => {
  const { rows } = await projected(t);
  const value = secondOpinionMeasure(rows);
  // Claude's round-2 provider failure was retried in the same round: one round, counted once.
  assert.deepEqual(value.providers.map(row => [row.provider, row.rounds, row.unavailable, row.findings, row.peerUnmatchedClasses]),
    [['claude-code', 3, 1, 2, 1], ['codex', 3, 0, 8, 6]]);
  assert.equal(value.providers[0].unavailableRate, 1 / 3);
  assert.equal(value.met, false);
  assert.match(value.proxy, /does not establish distinct defects/u);
  const rounds = n => Array.from({ length: n }, (_, i) => pairRow('w1', 'slice', i + 1, 'PASS', i + 1)).flat();
  const eleven = rounds(11), refs = eleven.filter(item => item.check === 'boundary-reviewer' && item.round === 1).map(item => item.reference);
  const own = [findingRow({ reference: refs[0], classId: 'same' }), findingRow({ reference: refs[1], classId: 'same' })];
  const good = secondOpinionMeasure([...eleven, ...own]);
  assert.deepEqual([good.providers.map(item => [item.rounds, item.findings, item.peerUnmatchedClasses]), good.met], [[[11, 1, 0], [11, 1, 0]], true]);
  assert.equal(secondOpinionMeasure(eleven).met, false, 'no findings of its own');
  // A re-review of one round's revision counts once per provider: its last launched attempt.
  const rereview = secondOpinionMeasure([...eleven, ...own, ...pairRow('w1', 'slice', 1, 'UNAVAILABLE', 0.5)]);
  assert.deepEqual(rereview.providers.map(item => [item.provider, item.rounds, item.unavailable]), [['claude-code', 11, 0], ['codex', 11, 0]]);
  assert.equal(rereview.met, true);
  // A provider that only reused a retained result in a round did not complete it.
  const [pair, codex] = pairRow('w2', 'slice', 1, 'PASS', 1);
  const reused = secondOpinionMeasure([pair, codex, reviewerRow(pair, 1, 'claude-code', { reviewerStatus: 'refused', outcome: 'PASS' })]);
  assert.deepEqual(reused.providers.map(item => [item.provider, item.rounds, item.unavailable]), [['claude-code', 1, 1], ['codex', 1, 0]]);
  assert.equal(secondOpinionMeasure([]).met, null);
});

test('R10: per provider and model: statuses, UNAVAILABLE reasons, rule counts and severities', async t => {
  const { rows } = await projected(t);
  const table = Object.fromEntries(reviewerTable(rows).map(row => [`${row.provider}/${row.model}`, row]));
  assert.deepEqual(table['claude-code/opus-x'].byStatus, { completed: 2, 'provider-failed': 1, 'verdict-rejected': 1 });
  assert.deepEqual(table['claude-code/opus-x'].unavailableReasons, { contract: 1, 'provider-error': 1 });
  assert.deepEqual(table['claude-code/opus-x'].rejections, { 'schema-required': 1 });
  assert.deepEqual(table['claude-code/opus-x'].normalizations, { 'unknown-property': 2 });
  assert.deepEqual(table['claude-code/opus-x'].findingsBySeverity, { high: 1, low: 1 });
  assert.deepEqual(table['codex/gpt-x'].byStatus, { completed: 4, 'could-not-assess': 1, refused: 1 });
  assert.deepEqual(table['codex/gpt-x'].findingsBySeverity, { high: 4, low: 1, medium: 2, unrated: 1 });
  // A spec or verification result's rule counts are not in the reviewer table.
  const other = reviewerTable([row({ kind: 'artifact', check: 'review', provider: 'codex', model: 'm', reference: H(1), reviewerStatus: 'completed' }),
    row({ kind: 'event', check: 'verdict-normalization', provider: 'codex', model: 'm', reference: H(1), rule: 'unknown-property', count: 1, id: 'n1' }),
    row({ kind: 'event', check: 'verdict-normalization', provider: 'codex', model: 'm', reference: H(2), rule: 'unknown-property', count: 3, id: 'n2' }),
    row({ kind: 'event', check: 'verdict-rejection', provider: 'codex', model: 'm', reference: H(2), rule: 'schema-required', count: 1, id: 'n3' })]);
  assert.deepEqual([other[0].normalizations, other[0].rejections], [{ 'unknown-property': 1 }, {}]);
});

test('R11: rows without the new fields are not recorded, never zero, and make the measure incomplete', () => {
  const legacy = [row({ kind: 'event', check: 'BOUNDARY_REVIEWED' }), row({ kind: 'finding', check: 'review', reference: H(1), findingId: 'old' })];
  const value = convergence([...legacy, pairRow('w1', 'slice', 1, 'PASS', 1), findingRow({})].flat());
  assert.deepEqual([value.rounds.notRecorded, value.rounds.coverage, value.rounds.met, value.rounds.medianRoundsToPass], [1, 'incomplete', null, 1]);
  assert.deepEqual([value.demoted.notRecorded, value.demoted.coverage, value.demoted.met, value.demoted.denominator.demoted], [1, 'incomplete', null, 1]);
  assert.deepEqual([value.secondOpinion.coverage, value.secondOpinion.met], ['incomplete', null]);
  // A review result projected before these fields (no reviewer status) alone makes the cohort incomplete.
  const oldResult = convergence([pairRow('w1', 'slice', 1, 'PASS', 1), row({ kind: 'artifact', check: 'review', outcome: 'FAIL', reference: H(5) })].flat());
  assert.deepEqual([oldResult.rounds.coverage, oldResult.rounds.met, oldResult.secondOpinion.coverage, oldResult.secondOpinion.met], ['incomplete', null, 'incomplete', null]);
  // A final reviewer outcome without a recorded status is not recorded, not UNAVAILABLE.
  const [statusPair, statusCodex, statusClaude] = pairRow('w1', 'slice', 1, 'PASS', 1);
  const { reviewerStatus: _omitted, ...noStatus } = statusClaude;
  const missing = convergence([statusPair, statusCodex, noStatus, findingRow({})]);
  assert.deepEqual([missing.secondOpinion.notRecorded, missing.secondOpinion.coverage, missing.secondOpinion.met, missing.secondOpinion.denominator.reviewerRounds], [1, 'incomplete', null, 1]);
  // In measure 1 too, a counted reviewer outcome without a status is not recorded.
  assert.deepEqual([missing.rounds.coverage, missing.rounds.met], ['incomplete', null]);
  // A pair with a scope but no round is not a round: excluded, not "not recorded".
  const uncounted = convergence([pairRow('w1', 'slice', 1, 'PASS', 1), row({ kind: 'event', check: 'BOUNDARY_REVIEWED', reviewScope: 'slice', outcome: 'UNAVAILABLE' }),
    row({ kind: 'artifact', check: 'boundary-reviewer', provider: 'codex', outcome: 'UNAVAILABLE', reviewScope: 'slice', id: 'u:reviewer:0' })].flat());
  assert.deepEqual([uncounted.rounds.uncountedPairs, uncounted.rounds.coverage, uncounted.rounds.met], [1, 'complete', true]);
  assert.deepEqual([uncounted.secondOpinion.uncountedReviewerRows, uncounted.secondOpinion.denominator.reviewerRounds, uncounted.secondOpinion.coverage], [1, 2, 'complete']);
  // Every measure states its denominator.
  for (const key of ['rounds', 'demoted', 'escapedFromDemoted', 'secondOpinion']) assert.ok(value[key].denominator && Object.keys(value[key].denominator).length, key);
  assert.deepEqual(value.rounds.denominator, { scopes: 1, passed: 1, open: 0, waived: 0 });
  assert.deepEqual(value.escapedFromDemoted.denominator, { escapedDefects: 0, confirmed: 0 });
  assert.deepEqual(value.secondOpinion.denominator, { reviewerRounds: 2, providers: 2 });
});

function cli(args, env) {
  return new Promise((resolveRun, reject) => {
    const p = spawn(process.execPath, [join(repositoryRoot, 'cli/bin/workflow.js'), ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.on('data', chunk => stdout += chunk); p.stderr.on('data', chunk => stderr += chunk);
    p.on('error', reject); p.on('close', code => resolveRun({ code, stdout, stderr }));
  });
}
test('R12: metrics convergence over the local store and a dataset, filters, Markdown, reevaluation, HTML and MCP', async t => {
  const { store } = await projected(t);
  const env = { GATEREEVE_METRICS_DIR: store.root };
  const run = async (...args) => { const value = await cli(['metrics', 'convergence', ...args], env); assert.equal(value.code, 0, value.stderr); return value.stdout; };
  const local = JSON.parse(await run());
  assert.equal(local.cohort.source, 'local');
  assert.equal(local.convergence.rounds.denominator.scopes, 2);
  assert.deepEqual(local, await metricsRequest('convergence', {}, store));
  // Each filter excludes rows outside the cohort.
  assert.equal(JSON.parse(await run('--project', 'other')).cohort.observations, 0);
  assert.equal(JSON.parse(await run('--project', 'gatereeve')).cohort.observations, local.cohort.observations);
  assert.ok(JSON.parse(await run('--since', '2026-11-27T00:00:09Z')).convergence.rounds.denominator.scopes === 1, 'since drops the slice scope rows');
  assert.equal(JSON.parse(await run('--until', '2026-11-27T00:00:05Z')).convergence.secondOpinion.denominator.reviewerRounds, 2);
  const markdown = await run('--format', 'markdown');
  // The feature-final scope was adjudicated after its FAIL, so both scopes passed (rounds 2 and 4).
  for (const heading of ['## 1. Rounds to PASS: met', '## 2. Demoted findings: not measurable', '## 3. Escaped defects traced to demoted findings: 1', '## 4. Second opinion: not met', '## Reviewers']) assert.ok(markdown.includes(heading), heading);
  assert.equal(markdown, `${renderConvergenceMarkdown(local)}\n`);
  assert.notEqual((await cli(['metrics', 'convergence', '--format', 'html'], env)).code, 0);
  // A fixed dataset gives the same measures; the reevaluation carries them.
  const { dataset } = await metricsRequest('capture', {}, store);
  const fromDataset = JSON.parse(await run('--dataset', dataset));
  assert.deepEqual(fromDataset.convergence, local.convergence);
  const datasetMarkdown = await run('--dataset', dataset, '--format', 'markdown');
  assert.equal(datasetMarkdown, `${renderConvergenceMarkdown(fromDataset)}\n`);
  assert.match(datasetMarkdown, /^Cohort: dataset /mu);
  assert.equal(datasetMarkdown.split('\n').slice(3).join('\n'), markdown.split('\n').slice(3).join('\n'), 'same measures as the local store');
  const reevaluation = await metricsRequest('reevaluate', { dataset }, store);
  assert.deepEqual(reevaluation.measurement.convergence, local.convergence);
  const html = renderReevaluation(reevaluation, 'html');
  assert.match(html, /<h2>Convergence measures<\/h2>/u); assert.match(html, /Second opinion: not met/u);
  // MCP: a read-only tool returning the same report for the same cohort.
  const session = createSession({ store });
  await session({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'test' }, capabilities: {} } });
  await session({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const tools = (await session({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).result.tools;
  assert.equal(tools.find(tool => tool.name === 'metrics_convergence').annotations.readOnlyHint, true);
  const called = await session({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'metrics_convergence', arguments: { dataset } } });
  assert.equal(called.result.isError, false);
  assert.deepEqual(called.result.structuredContent, fromDataset);
  // Invalid input is refused.
  await assert.rejects(metricsRequest('convergence', { workflow: 'x' }, store), /Convergence accepts/u);
  await assert.rejects(metricsRequest('convergence', { since: 'not a date' }, store), /Invalid convergence date filter/u);
  assert.deepEqual(cohort([row({ observedAt: at(1) })], { until: at(0) }), []);
});
