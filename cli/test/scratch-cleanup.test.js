import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile, symlink, lstat, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createScratch, finishScratch, cleanupScratch, inspectScratch, withScratch, processIdentity } from '../../plugin-src/shared/resources/storage/scratch.js';
import { verifyLocalPackage } from '../../apps/desktop/scripts/verify-local-package.mjs';

const execute = promisify(execFile);
const inactive = { probe: async () => null, inspectActivity: async () => 'inactive' };
async function fixture(t) {
  const parent = await mkdtemp(join(tmpdir(), 'scratch-lifecycle-test-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  return { parent, root: join(parent, 'gatereeve') };
}
async function changeOwner(scratch, changes) {
  const path = join(scratch.path, 'owner.json');
  const owner = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, JSON.stringify({ ...owner, ...changes }));
}

test('preview is read-only, active work survives apply, unrelated sibling survives cleanup', async t => {
  const { root, parent } = await fixture(t);
  await mkdir(join(parent, 'unrelated')); await writeFile(join(parent, 'unrelated', 'important'), 'keep');
  assert.deepEqual((await inspectScratch({ root })).entries, []);
  await assert.rejects(lstat(root), { code: 'ENOENT' });
  const run = await createScratch({ root, purpose: 'build' });
  await writeFile(join(run.path, 'artifact'), 'payload');
  const before = await readFile(join(run.path, 'owner.json'));
  const preview = await cleanupScratch({ root });
  assert.equal(preview.entries[0].status, 'active');
  assert.equal((await cleanupScratch({ root, apply: true })).removed.length, 0);
  assert.deepEqual(await readFile(join(run.path, 'owner.json')), before);
  assert.equal((await cleanupScratch({ root, apply: true, ...inactive })).removed.length, 1);
  assert.equal(await readFile(join(parent, 'unrelated', 'important'), 'utf8'), 'keep');
});

test('PID reuse alone does not permit deletion; active child and unknown probes protect scratch', async t => {
  const { root } = await fixture(t), run = await createScratch({ root, purpose: 'child' });
  const reused = { probe: async () => 'different process start', inspectActivity: async () => 'active' };
  assert.equal((await cleanupScratch({ root, apply: true, ...reused })).entries[0].status, 'active');
  await changeOwner(run, { children: [{ processId: 123, processStartedAt: 'child-start', group: false }] });
  const child = await cleanupScratch({ root, apply: true, ...inactive, probe: async pid => pid === 123 ? 'child-start' : null });
  assert.equal(child.entries[0].status, 'active');
  assert.equal(child.removed.length, 0);
  const unknown = await cleanupScratch({ root, apply: true, ...inactive, inspectActivity: async () => { throw Error('permission denied'); } });
  assert.equal(unknown.entries[0].status, 'uncertain');
  assert.equal(unknown.removed.length, 0);
});

test('mounted, malformed, unowned and symlink entries are protected', async t => {
  const { root, parent } = await fixture(t), run = await createScratch({ root, purpose: 'mount' });
  const mounted = await cleanupScratch({ root, apply: true, ...inactive, inspectActivity: async () => 'mounted' });
  assert.equal(mounted.entries[0].status, 'mounted');
  assert.equal(mounted.entries[0].bytes, null);
  await mkdir(join(root, 'runs', 'unregistered'));
  await writeFile(join(parent, 'precious'), 'keep');
  await symlink(parent, join(root, 'runs', 'outside'));
  await rm(join(run.path, 'owner.json')); await symlink(join(parent, 'precious'), join(run.path, 'owner.json'));
  const result = await cleanupScratch({ root, apply: true, ...inactive });
  assert.ok(result.entries.every(item => item.status === 'uncertain'));
  assert.equal(result.removed.length, 0);
  assert.equal(await readFile(join(parent, 'precious'), 'utf8'), 'keep');
});

test('root substitution and ownership mismatch cannot redirect cleanup', async t => {
  const { root, parent } = await fixture(t);
  await createScratch({ root, purpose: 'safe' });
  await rename(root, join(parent, 'original'));
  await symlink(join(parent, 'original'), root);
  const observed = await cleanupScratch({ root, apply: true });
  assert.match(observed.error, /Unsafe/u);
  assert.equal(observed.removed.length, 0);
  await rm(root); await mkdir(root, { mode: 0o700 });
  await writeFile(join(root, 'owner.json'), '{}', { mode: 0o600 });
  assert.match((await cleanupScratch({ root, apply: true })).error, /ownership/u);
});

test('apply rechecks run identity and activity after preview', async t => {
  const { root } = await fixture(t), run = await createScratch({ root, purpose: 'race' });
  let reads = 0;
  const result = await cleanupScratch({ root, apply: true, ...inactive,
    inspectActivity: async () => ++reads === 1 ? 'inactive' : 'active' });
  assert.equal(result.removed.length, 0);
  assert.match(result.errors[0].reason, /no longer eligible/u);
  assert.ok(await lstat(run.path));
});

test('retention expires into eligibility; run selection leaves other runs alone', async t => {
  const { root } = await fixture(t);
  const run = await createScratch({ root, purpose: 'retained', keepUntil: new Date(Date.now() + 3600000).toISOString() });
  const other = await createScratch({ root, purpose: 'other' });
  assert.equal((await cleanupScratch({ root, apply: true, run: run.id, ...inactive })).entries[0].status, 'retained');
  const result = await cleanupScratch({ root, apply: true, run: run.id, ...inactive, now: Date.now() + 7200000 });
  assert.equal(result.removed.length, 1);
  assert.ok(await lstat(other.path));
  await assert.rejects(cleanupScratch({ root, run: '../reports' }), /Invalid/u);
});

test('quick Doctor inventory does not probe processes, traverse bulk, or mutate records', async t => {
  const { root } = await fixture(t), run = await createScratch({ root, purpose: 'doctor' });
  const before = await readdir(run.path);
  const result = await inspectScratch({ root, quick: true,
    probe: async () => { throw Error('must not probe'); }, inspectActivity: async () => { throw Error('must not probe'); } });
  assert.equal(result.entries[0].status, 'active-or-interrupted');
  assert.equal(result.entries[0].bytes, null);
  assert.equal(result.eligibleBytes, null);
  assert.deepEqual(await readdir(run.path), before);
});

test('interrupted child registration and maintenance locks remain protected', async t => {
  const { root } = await fixture(t), run = await createScratch({ root, purpose: 'interrupted' });
  await changeOwner(run, { supervisionPending: true });
  assert.equal((await cleanupScratch({ root, apply: true, ...inactive })).entries[0].status, 'uncertain');
  await mkdir(join(root, '.maintenance-lock'), { mode: 0o700 });
  await assert.rejects(createScratch({ root, purpose: 'second' }), /maintenance/u);
  assert.ok(await lstat(run.path));
});

test('concurrent creators in a new root have unique ownership', async t => {
  const { root } = await fixture(t);
  const runs = await Promise.all(Array.from({ length: 4 }, () => createScratch({ root, purpose: 'concurrent' })));
  assert.equal(new Set(runs.map(run => run.id)).size, 4);
  assert.equal((await cleanupScratch({ root, apply: true })).removed.length, 0);
});

test('success and ordinary failure remove bulk and preserve independent bounded reports', async t => {
  const { root } = await fixture(t);
  for (let index = 0; index < 3; index++) {
    let cleanup;
    const options = { root, purpose: 'repeat', onCleanup: value => { cleanup = value; } };
    const work = async ({ path }) => { await writeFile(join(path, 'bulk'), Buffer.alloc(32768)); if (index === 1) throw Error('original failure'); return 42; };
    if (index === 1) await assert.rejects(withScratch(options, work), /original failure/u);
    else assert.equal(await withScratch(options, work), 42);
    // Hosts without lsof safely retain scratch rather than claiming removal.
    if (cleanup.entries[0].status === 'uncertain') {
      assert.match(cleanup.entries[0].reason, /activity/u);
      await cleanupScratch({ root, apply: true, ...inactive });
    } else assert.equal(cleanup.removed.length, 1);
  }
  assert.deepEqual(await readdir(join(root, 'runs')), []);
  const files = await readdir(join(root, 'reports'));
  assert.equal(files.length, 3);
  const reports = await Promise.all(files.map(name => readFile(join(root, 'reports', name), 'utf8').then(JSON.parse)));
  assert.equal(reports.filter(report => report.outcome === 'FAIL').length, 1);
});

test('report publication failure preserves primary failure and protects bulk', async t => {
  const { root } = await fixture(t);
  await assert.rejects(withScratch({ root, purpose: 'diagnostic-failure' }, async ({ path }) => {
    await writeFile(join(path, 'bulk'), 'retain');
    await rm(join(root, 'reports'), { recursive: true });
    throw Error('primary test failure');
  }), error => error instanceof AggregateError && error.errors[0].message === 'primary test failure');
  assert.equal((await readdir(join(root, 'runs'))).length, 1);
});

test('desktop wrapper exports receipt outside scratch before removing fake build outputs', async t => {
  const { root, parent } = await fixture(t), reportPath = join(parent, 'verification.json');
  const result = await verifyLocalPackage({ reportPath, version: '0.1.0-rc.20', runtime: { root,
    packageMacos: async ({ outputRoot, version }) => {
      await mkdir(outputRoot); const dmgPath = join(outputRoot, 'app.dmg'); await writeFile(dmgPath, 'fake');
      return { version, dmgPath, dmgSha256: 'test-hash', dmgBytes: 4 };
    }, createFixture: async () => {}, verifyDmg: async ({ dmgPath }) => { assert.equal(await readFile(dmgPath, 'utf8'), 'fake'); return { smoke: true }; },
  } });
  assert.equal(JSON.parse(await readFile(reportPath, 'utf8')).dmgSha256, 'test-hash');
  assert.equal(result.publicRelease, false);
});

test('CLI preview/Doctor are read-only and scratch wrapper records failed command diagnostics', async t => {
  const { parent } = await fixture(t), cli = fileURLToPath(new URL('../bin/workflow.js', import.meta.url));
  const env = { ...process.env, TMPDIR: parent, TMP: parent, TEMP: parent };
  for (const command of ['cleanup', 'doctor']) {
    const result = await execute(process.execPath, [cli, command, '--json'], { env });
    assert.deepEqual(JSON.parse(result.stdout).entries, []);
    await assert.rejects(lstat(join(parent, 'gatereeve')), { code: 'ENOENT' });
  }
  await assert.rejects(execute(process.execPath, [cli, 'scratch', 'run', process.execPath, '-e', 'console.error("failure-marker");process.exit(7)'], { env }), /failure-marker/u);
  const reports = await readdir(join(parent, 'gatereeve', 'reports'));
  assert.equal(reports.length, 1);
  assert.match(await readFile(join(parent, 'gatereeve', 'reports', reports[0]), 'utf8'), /failure-marker/u);
});
