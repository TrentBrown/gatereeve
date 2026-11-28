import './helpers/private-scratch.js';
// Follow-up status in the metrics store and convergence measure 2 (issue
// #148; spec AC9 and amendment 1, rubric R9).
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MetricsStore } from '../../plugin-src/shared/resources/performance/store.js';
import { projectWorkflow } from '../../plugin-src/shared/resources/performance/workflow-projection.js';
import { observation, reportingDatabase } from '../../plugin-src/shared/resources/performance/fleet.js';
import { demotedMeasure, escapedMeasure } from '../../plugin-src/shared/resources/performance/convergence.js';
import { followUpId } from '../../plugin-src/shared/resources/protocol/current/follow-ups.js';
import { fixture, human } from './helpers/lightweight-fixture.js';
import { selection } from './helpers/paired-review-fixture.js';
import { revise, reviewers } from './helpers/round-fixture.js';

const H = n => `sha256:${String(n).padStart(64, '0')}`;
const finding = (id, fields) => ({ id, classId: `class-${id}`, classStatement: `Class of ${id}`, criterion: 'R1', path: `app/${id}.js`,
  failureScenario: 'Input -> wrong output', evidence: 'Evidence', blocking: true, ...fields });
const policy = round => ({ roundPolicy: { policy: 'round-policy/1', scope: 'slice', round, epoch: 0, revision: `rev-${round}`, regressionPaths: [] }, configuration: { provider: 'codex', model: 'gpt-x' } });
function objects() {
  const result = (n, fields, input) => [[H(n), { gate: 'review', mode: 'full', input: { hash: H(n + 1) }, receipt: { hash: H(n + 2) }, dispositions: [], reviewerLaunched: true, ...fields }],
    [H(n + 1), input], [H(n + 2), { evaluator: { provider: 'codex', model: 'gpt-x' } }]];
  return new Map([
    // Round 1: a low follow-up L1 and a blocking high H1.
    ...result(10, { outcome: 'FAIL', findings: [finding('L1', { severity: 'low', blocking: false }), finding('H1', { severity: 'high' })] }, policy(1)),
    // Round 4: a demoted medium M1.
    ...result(20, { outcome: 'PASS', findings: [finding('M1', { severity: 'medium' })] }, policy(4)),
    // Round 5: M1 resolved.
    ...result(30, { outcome: 'PASS', findings: [], dispositions: [{ id: 'M1', status: 'resolved', evidence: 'Fixed.' }] }, policy(5)),
  ]);
}
function journal({ marked = true } = {}) {
  let n = 0;
  const event = (type, payload) => { n++; return { sequence: n, hash: `event-${n}`, recordedAt: new Date(Date.parse('2026-11-27T00:00:00Z') + n * 1000).toISOString(), type, payload }; };
  const decided = (rows, kind = 'human-confirmed') => event('FOLLOW_UP_DECIDED', { authority: { kind }, reason: 'Decided.', decisions: rows });
  const L1 = followUpId(`review:${H(10)}:L1`), M1 = followUpId(`review:${H(20)}:M1`);
  return { L1, M1, events: [
    event('STARTED', { featureId: 'feature', implementers: ['implementer'], optionalGates: [], ...(marked ? { followUps: 1 } : {}),
      dials: { rigor: { value: 'full', source: 'built-in' }, autonomy: { value: 'supervised', source: 'built-in' } } }),
    event('JOB_FINISHED', { jobId: 'j1', results: [{ hash: H(10) }] }),
    event('JOB_FINISHED', { jobId: 'j2', results: [{ hash: H(20) }] }),
    decided([{ id: L1, decision: 'reject' }]),
    decided([{ id: M1, decision: 'new-work', tracking: { kind: 'seed', repository: 'app' } }], 'policy-default'),
    event('JOB_FINISHED', { jobId: 'j3', results: [{ hash: H(30) }] }),
  ] };
}
function syntheticCore(events, workflowHome = '/runs/feature') {
  const store = objects();
  const core = { context: { workspaceRoot: '/project/gatereeve', featureId: 'feature', repositories: [{ alias: 'app' }] }, store: { home: workflowHome, json: async ref => store.get(ref.hash) },
    visible: events.length, state: async () => ({ state: { runId: 'run' }, events: events.slice(0, core.visible) }) };
  return core;
}
async function metricsStore(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gatereeve-follow-up-metrics-')));
  const store = new MetricsStore(join(root, 'metrics'), { privateConnection: true });
  t.after(async () => { store.close(); await rm(root, { recursive: true, force: true }); });
  return store;
}
async function rows(store) {
  const db = await reportingDatabase(store, false);
  return db.prepare('SELECT o.body FROM reporting_latest l JOIN reporting_observations o ON o.id=l.id AND o.version=l.version').all().map(row => JSON.parse(row.body));
}

test('R9: a marked run projects followUp on finding rows and one follow-up row per record, re-emitted as the status changes', async t => {
  const store = await metricsStore(t);
  const { events, L1, M1 } = journal();
  const core = syntheticCore(events);
  const statusOf = async () => {
    const all = await rows(store);
    return { started: all.find(row => row.check === 'STARTED')?.followUpTracking,
      findings: Object.fromEntries(all.filter(row => row.kind === 'finding').map(row => [row.findingId, row.followUp ?? null])),
      followUps: Object.fromEntries(all.filter(row => row.kind === 'follow-up').map(row => [row.findingId, row.followUp])) };
  };
  // After the round-4 result only: both follow-ups undecided; the blocking high has none.
  core.visible = 3;
  await projectWorkflow(core, store);
  assert.equal(await store.captureIncomplete(), false);
  assert.deepEqual(await statusOf(), { started: true, findings: { L1: 'undecided', H1: null, M1: 'undecided' }, followUps: { L1: 'undecided', M1: 'undecided' } });
  // Decisions re-emit the changed rows; `rejected` is an accepted value.
  core.visible = 5;
  await projectWorkflow(core, store);
  assert.deepEqual(await statusOf(), { started: true, findings: { L1: 'rejected', H1: null, M1: 'new-work' }, followUps: { L1: 'rejected', M1: 'new-work' } });
  // A later resolved disposition makes M1 fixed.
  core.visible = 6;
  await projectWorkflow(core, store);
  assert.deepEqual((await statusOf()).followUps, { L1: 'rejected', M1: 'fixed' });
  const followUpRow = (await rows(store)).find(row => row.kind === 'follow-up' && row.findingId === 'M1');
  assert.deepEqual([followUpRow.severity, followUpRow.reason, followUpRow.reviewScope, followUpRow.round, followUpRow.reference], ['medium', 'demoted', 'slice', 4, H(20)]);
  assert.ok(!JSON.stringify(await rows(store)).includes('Input -> wrong output'), 'no scenario text');
  assert.ok([L1, M1].every(id => /^fu-/u.test(id)));
  assert.doesNotThrow(() => observation({ ...followUpRow, followUp: 'rejected' }));
  assert.throws(() => observation({ ...followUpRow, followUp: 'maybe' }), /Invalid reporting followUp/u);
});

test('R9: a reopened follow-up reads undecided again in the store', async t => {
  const store = await metricsStore(t);
  const { events } = journal();
  // Round 6 re-reports M1 after it was resolved: reopened, its decision no longer counts.
  const objectsWithReopen = objects();
  objectsWithReopen.set(H(40), { gate: 'review', input: { hash: H(41) }, receipt: { hash: H(42) }, outcome: 'PASS', dispositions: [], findings: [finding('M1', { severity: 'medium' })] });
  objectsWithReopen.set(H(41), { ...policy(6), roundPolicy: { ...policy(6).roundPolicy, round: 6 } });
  objectsWithReopen.set(H(42), { evaluator: { provider: 'codex', model: 'gpt-x' } });
  const all = [...events, { sequence: 7, hash: 'event-7', recordedAt: '2026-11-27T00:01:00.000Z', type: 'JOB_FINISHED', payload: { jobId: 'j4', results: [{ hash: H(40) }] } }];
  const core = { context: { workspaceRoot: '/project/gatereeve', featureId: 'feature', repositories: [{ alias: 'app' }] }, store: { home: '/runs/feature', json: async ref => objectsWithReopen.get(ref.hash) },
    state: async () => ({ state: { runId: 'run' }, events: all }) };
  await projectWorkflow(core, store);
  const followUps = Object.fromEntries((await rows(store)).filter(row => row.kind === 'follow-up').map(row => [row.findingId, row.followUp]));
  assert.deepEqual(followUps, { L1: 'rejected', M1: 'undecided' });
});

test('R9: a follow-up whose finding blocks again is withdrawn from the store', async t => {
  const store = await metricsStore(t);
  const { events } = journal();
  const blocked = objects();
  // Round 2 re-reports L1 as a blocking high: it is no longer a follow-up.
  blocked.set(H(50), { gate: 'review', input: { hash: H(51) }, receipt: { hash: H(52) }, outcome: 'FAIL', dispositions: [], findings: [finding('L1', { severity: 'high' })] });
  blocked.set(H(51), policy(2)); blocked.set(H(52), { evaluator: { provider: 'codex', model: 'gpt-x' } });
  const all = [...events, { sequence: 7, hash: 'event-7', recordedAt: '2026-11-27T00:02:00.000Z', type: 'JOB_FINISHED', payload: { jobId: 'j5', results: [{ hash: H(50) }] } }];
  const core = { context: { workspaceRoot: '/project/gatereeve', featureId: 'feature', repositories: [{ alias: 'app' }] }, store: { home: '/runs/feature', json: async ref => blocked.get(ref.hash) },
    visible: events.length, state: async () => ({ state: { runId: 'run' }, events: all.slice(0, core.visible) }) };
  await projectWorkflow(core, store);
  const before = await rows(store);
  assert.equal(before.find(row => row.kind === 'follow-up' && row.findingId === 'L1').followUp, 'rejected');
  const versions = async () => (await reportingDatabase(store, false)).prepare('SELECT COUNT(*) AS n FROM reporting_observations').get().n;
  const count = await versions();
  // Projecting again with no new event re-emits nothing (no observation-time churn).
  await projectWorkflow(core, store);
  assert.equal(await versions(), count);
  core.visible = all.length;
  await projectWorkflow(core, store);
  const after = await rows(store);
  const withdrawn = after.find(row => row.kind === 'follow-up' && row.findingId === 'L1');
  assert.deepEqual([withdrawn.followUp, withdrawn.outcome], [undefined, 'WITHDRAWN']);
  assert.ok(after.filter(row => row.kind === 'finding' && row.findingId === 'L1').every(row => row.followUp === undefined), 'finding rows lose followUp');
  const decided = demotedMeasure(after).decided;
  assert.deepEqual(decided.byFollowUp, { fixed: 1 }, 'measure 2 no longer counts the withdrawn decision');
});

test('R9: an unmarked run projects no followUp, and measure 2 decided is met, unmet or incomplete from follow-up rows', async t => {
  const store = await metricsStore(t);
  await projectWorkflow(syntheticCore(journal({ marked: false }).events, '/runs/old'), store);
  const unmarked = await rows(store);
  assert.ok(unmarked.filter(row => row.kind === 'finding').every(row => row.followUp === undefined));
  assert.equal(unmarked.filter(row => row.kind === 'follow-up').length, 0);
  assert.equal(unmarked.find(row => row.check === 'STARTED').followUpTracking, undefined);
  assert.match(demotedMeasure(unmarked).decided.statement, /not recorded by this version/u);
  let serial = 0;
  const row = fields => ({ id: `r-${serial++}`, source: 's', observedAt: '2026-11-27T00:00:00.000Z', project: 'p', projectKey: 's:p', workflow: 'w1', ...fields });
  const started = workflow => row({ kind: 'event', check: 'STARTED', workflow, followUpTracking: true });
  const demoted = (workflow, extra = {}) => row({ kind: 'finding', check: 'review', workflow, findingId: `F${serial}`, reference: H(1), severity: 'medium', reviewerBlocking: true, blocking: false, demoted: true, hasFailureScenario: true, ...extra });
  const followUp = (workflow, status) => row({ kind: 'follow-up', check: 'follow-up', workflow, followUp: status, severity: 'medium' });
  const met = demotedMeasure([started('w1'), demoted('w1', { followUp: 'accepted-risk' }), followUp('w1', 'accepted-risk'), followUp('w1', 'fixed')]);
  assert.deepEqual([met.decided.denominator, met.decided.byFollowUp, met.decided.met, met.met, met.coverage], [2, { 'accepted-risk': 1, fixed: 1 }, true, true, 'complete']);
  const unmet = demotedMeasure([started('w1'), demoted('w1'), followUp('w1', 'undecided'), followUp('w1', 'new-work')]);
  assert.deepEqual([unmet.decided.met, unmet.met], [false, false]);
  const mixed = demotedMeasure([started('w1'), followUp('w1', 'accepted-risk'), demoted('w2')]);
  assert.deepEqual([mixed.decided.met, mixed.decided.untrackedDemoted, mixed.decided.coverage, mixed.coverage, mixed.met], [null, 1, 'incomplete', 'incomplete', null]);
  // Measure 3 counts a traced demoted finding with a follow-up record from its followUp field.
  const traced = demoted('w1', { reference: H(9), findingId: 'T1', followUp: 'new-work' });
  const escaped = escapedMeasure([traced, row({ kind: 'escaped-defect', links: [`finding:${H(9)}:T1`], linkBasis: 'human-stated' })]);
  assert.deepEqual([escaped.tracedFindings, escaped.tracedWithFollowUp], [1, 1]);
});

test('R9: the Completion milestone retains the final follow-up list', async t => {
  const f = await fixture(t, { rigor: 'full' });
  await revise(f, { 'app.js': 'export const answer = 42;\n' }, 'r1');
  await f.request('review.select', selection(), 'select');
  reviewers(f, { findings: { codex: [{ path: 'app/app.js', evidence: '[low] A low risk.' }] } });
  await f.request('review.execute', {}, 'round-1');
  const { records } = await f.request('followup.list');
  await f.request('followup.decide', { followUps: [records[0].id], decision: 'accept-risk', reason: 'Accepted.', authority: { ...human, instruction: 'Accept it.' } }, 'decide');
  // Integration and gate proof are outside this test: record an observed
  // integration and qualify the milestone so only the record shape is checked.
  const { state } = await f.core.state();
  await f.core.append(state, 'INTEGRATED', { repository: 'app', candidate: state.candidate }, { id: 'integrated', hash: H(77) });
  const current = (await f.core.state()).state;
  f.core.check = async () => ({ allowed: true, runId: current.runId, eventCount: current.eventCount, outcomes: [], liveInputs: {} });
  f.core.assertLiveInputs = async () => {};
  f.core.cleanupSource = async () => {};
  const passed = await f.core.pass('completion', { id: 'completion', hash: H(78) });
  assert.deepEqual(passed.event.payload.followUps, [{ id: records[0].id, status: 'accepted-risk', dedupKey: records[0].dedupKey, decision: 'accept-risk', authorityKind: 'human-confirmed' }]);
});
