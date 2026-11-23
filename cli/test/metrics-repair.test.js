import './helpers/private-scratch.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readdir, utimes, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MetricsStore } from '../../plugin-src/shared/resources/performance/store.js';
import { importSnapshot, reportingDatabase, purgeTestData, humanWait, temporaryHome, SNAPSHOT_FORMAT } from '../../plugin-src/shared/resources/performance/fleet.js';
import { metricsRequest } from '../../plugin-src/shared/resources/performance/service.js';
import { createScratch, cleanupScratch, inspectScratch, REPORT_LIMIT } from '../../plugin-src/shared/resources/storage/scratch.js';
import { isolatedTestEnvironment } from '../scripts/isolated-test.js';
import { fixture } from './helpers/lightweight-fixture.js';

const inactive = { probe: async () => null, inspectActivity: async () => 'inactive' };
async function temp(t, prefix) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
const source = { id: 'src', platform: 'host', capturedAt: '2026-11-22T00:00:00.000Z', since: null, until: null, status: 'available', limitations: ['test'] };
const row = (id, extra = {}) => ({ id, source: 'src', observedAt: '2026-11-21T00:00:00.000Z', kind: 'event', check: 'STARTED', ...extra });

test('npm test runs against a private scratch root and metrics store', async t => {
  const base = await temp(t, 'isolation-');
  const { env } = await isolatedTestEnvironment({ PATH: '/usr/bin' }, base);
  assert.equal(env.GATEREEVE_SCRATCH_ROOT, join(base, 'gatereeve'));
  assert.equal(env.GATEREEVE_METRICS_DIR, join(base, 'metrics'));
  const pkg = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.test, 'node scripts/isolated-test.js');
  // This suite itself runs isolated, so nothing here reaches the host stores.
  if (process.env.GATEREEVE_TEST_ISOLATED) {
    assert.notEqual(process.env.GATEREEVE_SCRATCH_ROOT, join(tmpdir(), 'gatereeve'));
    assert.ok(process.env.GATEREEVE_METRICS_DIR);
  }
});

test('the test-data purge previews, then removes only workflows that lived in temporary directories', async t => {
  const store = new MetricsStore(await temp(t, 'metrics-'));
  await importSnapshot({ format: SNAPSHOT_FORMAT, sources: [source], records: [
    row('real-1', { workflow: 'w-real', project: 'product' }), row('fixture-1', { workflow: 'w-temp', project: 'gatereeve-current-AbC123' }),
    row('fixture-2', { projectKey: 'src:temp-project', project: 'gatereeve-light-XyZ789' })] }, store);
  const db = await reportingDatabase(store);
  db.prepare('INSERT INTO reporting_workflows VALUES (?,?,?)').run('w-real', '/home/someone/code/product/docs/issues/x', JSON.stringify({ projectKey: 'src:real' }));
  db.prepare('INSERT INTO reporting_workflows VALUES (?,?,?)').run('w-temp', join(tmpdir(), 'gatereeve-current-AbC123/docs/issues/f'), JSON.stringify({ projectKey: 'src:temp-project' }));
  // A real workspace that happens to live under a temporary root is not test data.
  db.prepare('INSERT INTO reporting_workflows VALUES (?,?,?)').run('w-tmp-real', join(tmpdir(), 'product/docs/issues/x'), JSON.stringify({ projectKey: 'src:tmp-real' }));
  const preview = await purgeTestData({}, store);
  assert.equal(preview.applied, false);
  assert.equal(preview.workflows, 1);
  assert.equal(preview.observations, 2);
  assert.equal((await metricsRequest('status', {}, store)).breakdown.observations, 3);
  const applied = await purgeTestData({ apply: true }, store);
  assert.equal(applied.observations, 2);
  const status = await metricsRequest('status', {}, store);
  assert.deepEqual([status.breakdown.observations, status.breakdown.workflows, status.records], [1, 2, 1]);
  assert.equal(temporaryHome('/home/someone/code/x'), false);
  assert.equal(temporaryHome(join(tmpdir(), 'product')), false);
  assert.equal(temporaryHome(join(tmpdir(), 'my-product/docs')), false);
  assert.equal(temporaryHome(join(tmpdir(), 'gatereeve-current-AbC123/docs')), true);
  assert.equal(temporaryHome('/tmp/gatereeve/runs/node-x/tmp/gatereeve-light-q1W2e3/docs/issues/f', ['/tmp']), true);
  assert.equal(temporaryHome('/tmp/gatereeve session start ysAb12Cd/docs', ['/tmp']), true);
});

test('capture keeps the stored value and reports a conflicting row; explicit import still refuses', async t => {
  const store = new MetricsStore(await temp(t, 'metrics-'));
  await importSnapshot({ format: SNAPSHOT_FORMAT, sources: [source], records: [row('same', { project: 'one' })] }, store);
  const conflicting = { format: SNAPSHOT_FORMAT, sources: [source], records: [row('same', { project: 'two' }), row('other')] };
  await assert.rejects(importSnapshot(conflicting, store), /Conflicting values for the same observation time/u);
  const captured = await importSnapshot(conflicting, store, { skipConflicts: true });
  assert.deepEqual(captured.skipped.map(item => item.id), ['same']);
  assert.equal(captured.records, 1);
});

test('status counts reporting observations as records, not only execution records', async t => {
  const store = new MetricsStore(await temp(t, 'metrics-'));
  await importSnapshot({ format: SNAPSHOT_FORMAT, sources: [source], records: [row('a'), row('b')] }, store);
  const status = await metricsRequest('status', {}, store);
  assert.equal(status.records, 2);
  assert.deepEqual(status.breakdown, { executionRecords: 0, observations: 2, workflows: 0, datasets: 1 });
});

test('a decision question is recorded when presented, without becoming a pending decision', async t => {
  const f = await fixture(t);
  const asked = await f.request('decision.ask', { kind: 'accept', question: 'Accept the candidate?' }, 'ask-1');
  assert.equal(asked.event.type, 'DECISION_PENDING');
  assert.equal(asked.event.payload.asked, true);
  assert.deepEqual(asked.event.payload.decision, { kind: 'accept' });
  assert.deepEqual(asked.state.pendingDecisions, []);
  await assert.rejects(f.request('decision.ask', { kind: 'nope', question: 'x' }, 'ask-2'), /Unknown decision kind/u);
  await assert.rejects(f.request('decision.ask', { kind: 'accept', question: '' }, 'ask-3'), /short summary/u);
});

test('human wait runs from the recorded question to the human answer of the same kind', () => {
  const at = minutes => new Date(Date.UTC(2026, 10, 22, 0, minutes)).toISOString();
  const rows = [
    { workflow: 'w', check: 'asked:accept', observedAt: at(0) },
    { workflow: 'w', kind: 'decision', check: 'accept', authorityKind: 'human-confirmed', observedAt: at(10) },
    { workflow: 'w', kind: 'decision', check: 'approve-design', authorityKind: 'human-confirmed', observedAt: at(20) },
  ];
  const wait = humanWait(rows.filter(r => r.kind === 'decision'), rows);
  assert.deepEqual(wait, { measured: 1, unmeasured: 1, totalMs: 600000, medianMs: 600000 });
});

test('scratch cleanup counts files, labels stranded runs and limits diagnostic reports', async t => {
  const parent = await temp(t, 'scratch-repair-');
  const root = join(parent, 'gatereeve');
  const run = await createScratch({ root, purpose: 'review-source-view' });
  await mkdir(join(run.path, 'view'));
  await writeFile(join(run.path, 'view', 'a'), 'x'.repeat(5000));
  const unlinked = (await inspectScratch({ root, ...inactive })).entries.find(item => item.id === run.id);
  await link(join(run.path, 'view', 'a'), join(run.path, 'view', 'b'));
  // Left unfinished, as an interrupted job leaves it (its owner is gone).
  const preview = await inspectScratch({ root, ...inactive });
  const entry = preview.entries.find(item => item.id === run.id);
  assert.equal(entry.status, 'eligible');
  assert.ok(entry.files >= 3, 'files are counted');
  assert.equal(entry.bytes, unlinked.bytes, 'a hard-linked file is counted once');
  assert.equal(entry.files, unlinked.files + 1);
  assert.equal(entry.stranded, undefined);
  const quick = await inspectScratch({ root, quick: true });
  assert.equal(quick.entries.find(item => item.id === run.id).files, entry.files, 'doctor (quick) counts files too');
  assert.equal(quick.files >= entry.files, true);
  const later = await inspectScratch({ root, ...inactive, now: Date.now() + 8 * 86400000 });
  const stale = later.entries.find(item => item.id === run.id);
  assert.equal(stale.stranded, true);
  assert.match(stale.command, new RegExp(`gatereeve cleanup --run ${run.id} --apply$`, 'u'));
  // Reports: one past 30 days, REPORT_LIMIT + 1 recent, and one whose run still exists.
  const reports = join(root, 'reports');
  const old = join(reports, 'old-00000000-0000-4000-8000-000000000000.json');
  await writeFile(old, '{}'); await utimes(old, new Date(Date.now() - 40 * 86400000), new Date(Date.now() - 40 * 86400000));
  for (let i = 0; i <= REPORT_LIMIT; i++) await writeFile(join(reports, `bulk-${i}.json`), '{}');
  const keep = await createScratch({ root, purpose: 'kept', keepUntil: new Date(Date.now() + 86400000).toISOString() });
  const keepReport = join(reports, `${keep.id}.json`);
  await writeFile(keepReport, '{}'); await utimes(keepReport, new Date(Date.now() - 40 * 86400000), new Date(Date.now() - 40 * 86400000));
  const counted = await inspectScratch({ root, ...inactive });
  assert.equal(counted.reports.removable.age, 1);
  assert.ok(counted.reports.removable.count >= 1);
  const applied = await cleanupScratch({ root, apply: true, ...inactive });
  assert.ok(applied.reportsRemoved >= 2);
  const left = await readdir(reports);
  assert.ok(!left.includes('old-00000000-0000-4000-8000-000000000000.json'));
  assert.ok(left.includes(`${keep.id}.json`), 'a report whose run folder exists is kept');
  assert.ok(left.length <= REPORT_LIMIT + 2);
  assert.ok(applied.removed.some(item => item.id === run.id && item.files >= 3));
});

test('the CLI registers ask (decision.ask) and abandon-job (job.abandon)', async () => {
  const { createProgram } = await import('../src/index.js');
  const names = createProgram().commands.map(command => command.name());
  assert.ok(names.includes('ask'), names.join(', '));
  assert.ok(names.includes('abandon-job'), names.join(', '));
});

test('a full cleanup preview counts files for active and retained runs too', async t => {
  const parent = await temp(t, 'scratch-counts-');
  const root = join(parent, 'gatereeve');
  const active = await createScratch({ root, purpose: 'live' });
  await writeFile(join(active.path, 'a'), 'x'); await writeFile(join(active.path, 'b'), 'y');
  const kept = await createScratch({ root, purpose: 'kept', keepUntil: new Date(Date.now() + 86400000).toISOString() });
  const preview = await cleanupScratch({ root });
  const byId = id => preview.entries.find(item => item.id === id);
  assert.equal(byId(active.id).status, 'active');
  assert.ok(byId(active.id).files >= 4, 'active run files are counted');
  assert.equal(byId(kept.id).status, 'retained');
  assert.ok(byId(kept.id).files >= 1);
  assert.ok(preview.files >= byId(active.id).files + byId(kept.id).files);
});
