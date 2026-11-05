import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, mkdir, writeFile, readFile, lstat, symlink, link, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { withInstallerBuild, cleanupInstallers, inspectInstallers, setInstallerHold, withInstallerLease,
  withInstallerFile, addInstaller } from '../../plugin-src/shared/resources/storage/installers.js';
import { managedPackage, usesManagedInstaller } from '../../apps/desktop/scripts/managed-package.mjs';
import { verifyLocalPackage } from '../../apps/desktop/scripts/verify-local-package.mjs';

const execute = promisify(execFile);
const inactive = { inspectActivity: async () => 'inactive' };
async function fixture(t) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'installer-retention-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, 'installers');
  const build = (version, options = {}, produce) => withInstallerBuild({ root, version, ...inactive, ...options },
    produce ?? (entry => writeFile(entry.dmgPath, version)));
  return { parent, root, build, cleanup: options => cleanupInstallers({ root, ...inactive, ...options }) };
}
const exists = p => lstat(p).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; });
async function edit(entry, changes) {
  const p = join(entry.path, 'owner.json');
  await writeFile(p, JSON.stringify({ ...JSON.parse(await readFile(p, 'utf8')), ...changes }), { mode: 0o600 });
}

test('success rotates only DMGs while checksum, verification and arbitrary neighboring records survive', async t => {
  const f = await fixture(t), first = await f.build('one');
  await writeFile(join(first.path, 'verification.json'), 'proof');
  await mkdir(join(first.path, 'rollback.app')); await writeFile(join(first.path, 'rollback.app', 'data'), 'protected');
  const second = await f.build('two');
  assert.equal(second.cleanup.removed[0].id, first.id);
  assert.equal(await exists(first.dmgPath), false); assert.equal(await readFile(second.dmgPath, 'utf8'), 'two');
  assert.equal(await readFile(join(first.path, 'verification.json'), 'utf8'), 'proof');
  assert.equal(await readFile(join(first.path, 'rollback.app', 'data'), 'utf8'), 'protected');
  assert.match(JSON.parse(await readFile(join(first.path, 'checksum.json'))).file.sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(await readFile(join(first.path, 'deletion.json'))).status, 'deleted');
  assert.deepEqual((await f.cleanup({ apply: true })).removed, []);
});

test('failed and interrupted producers cannot replace the last successful installer', async t => {
  const f = await fixture(t), good = await f.build('good'); let failed;
  await assert.rejects(f.build('bad', {}, async entry => { failed = entry; await writeFile(entry.dmgPath, 'partial'); throw Error('build failed'); }), /build failed/);
  assert.equal(await exists(good.dmgPath), true);
  await edit(failed, { state: 'active', producer: { pid: 99999999, startedAt: 'old dead process' } });
  const result = await f.cleanup({ apply: true, probe: async () => null });
  assert.deepEqual(result.removed.map(e => e.id), [failed.id]);
  assert.equal(await exists(good.dmgPath), true);
});

test('live producer is protected; process identity failure is uncertain, not inactive', async t => {
  const f = await fixture(t); await f.build('old');
  await f.build('new', {}, async entry => {
    await writeFile(entry.dmgPath, 'new');
    const preview = await f.cleanup(); assert.equal(preview.entries.find(e => e.id === entry.id).status, 'active');
    const uncertain = await f.cleanup({ apply: true, probe: async () => { throw Error('ps unavailable'); } });
    assert.equal(uncertain.removed.length, 0); assert.equal(uncertain.errors.length, 1);
  });
});

test('consumer lease protects an older installer until its operation finishes, including throw', async t => {
  const f = await fixture(t), one = await f.build('one');
  await assert.rejects(withInstallerLease({ root: f.root, id: one.id }, async path => {
    await f.build('two'); assert.equal(await readFile(path, 'utf8'), 'one');
    assert.equal((await f.cleanup()).entries.find(e => e.id === one.id).status, 'active');
    throw Error('consumer failure');
  }), /consumer failure/);
  assert.equal((await f.cleanup({ apply: true })).removed[0].id, one.id);
});

test('file-based verifier lease protects managed files and leaves explicit external paths alone', async t => {
  const f = await fixture(t), one = await f.build('one');
  await withInstallerFile({ root: f.root, path: one.dmgPath }, async path => {
    await f.build('two'); assert.equal(await exists(path), true);
  });
  await assert.rejects(withInstallerFile({ root: f.root, path: join(f.root, 'unexpected.dmg') }, () => {}), /Unexpected/);
  assert.equal(await withInstallerFile({ root: f.root, path: '/outside.dmg' }, path => path), '/outside.dmg');
});

test('holds protect exact IDs; expiry permits cleanup; keeper survives expired holds', async t => {
  const f = await fixture(t), one = await f.build('one');
  await setInstallerHold({ root: f.root, id: one.id, until: '2099-01-01T00:00:00Z', reason: 'investigation' });
  const two = await f.build('two'); assert.equal(await exists(one.dmgPath), true);
  assert.equal((await f.cleanup()).entries.find(e => e.id === one.id).status, 'held');
  await edit(one, { hold: { until: '2000-01-01T00:00:00Z', reason: 'expired' } });
  assert.equal((await f.cleanup({ apply: true })).removed[0].id, one.id);
  assert.equal(await exists(two.dmgPath), true);
  await assert.rejects(setInstallerHold({ root: f.root, id: two.id, until: 'invalid', reason: 'bad' }), /Hold needs/);
});

test('mounted/open or unknown activity preserves obsolete DMGs', async t => {
  const f = await fixture(t), one = await f.build('one');
  await f.build('two', { inspectActivity: async () => 'mounted' });
  for (const state of ['mounted', 'active', 'unknown']) {
    const result = await f.cleanup({ apply: true, inspectActivity: async () => state });
    assert.equal(result.removed.length, 0); assert.equal(await exists(one.dmgPath), true);
  }
});

test('root absence and Doctor preview do not create storage; unowned directories are not adopted', async t => {
  const f = await fixture(t);
  assert.deepEqual((await inspectInstallers({ root: f.root, quick: true })).entries, []);
  assert.equal(await exists(f.root), false);
  await mkdir(f.root, { mode: 0o700 }); await writeFile(join(f.root, 'foreign.dmg'), 'keep');
  await assert.rejects(f.build('one'), /ENOENT/);
  assert.ok((await f.cleanup({ apply: true })).error);
  assert.equal(await readFile(join(f.root, 'foreign.dmg'), 'utf8'), 'keep');
});

test('symlink and hardlink installer substitutions block cleanup and preserve external bytes', async t => {
  for (const substitute of [symlink, link]) {
    const f = await fixture(t), one = await f.build('one');
    await f.build('two', { inspectActivity: async () => 'active' });
    const external = join(f.parent, 'external'); await writeFile(external, 'protected');
    await unlink(one.dmgPath); await substitute(external, one.dmgPath);
    const result = await f.cleanup({ apply: true }); assert.equal(result.removed.length, 0); assert.ok(result.errors.length);
    assert.equal(await readFile(external, 'utf8'), 'protected');
  }
});

test('corrupt keeper/hold metadata or changed content fails closed across the sweep', async t => {
  for (const mutation of ['hold', 'content', 'owner']) {
    const f = await fixture(t), one = await f.build('one');
    const two = await f.build('two', { inspectActivity: async () => 'active' });
    if (mutation === 'hold') await edit(two, { hold: { until: 'nonsense', reason: 'bad' } });
    if (mutation === 'content') await writeFile(two.dmgPath, 'changed');
    if (mutation === 'owner') await writeFile(join(two.path, 'owner.json'), '{bad');
    const result = await f.cleanup({ apply: true }); assert.equal(result.removed.length, 0); assert.ok(result.errors.length);
    assert.equal(await exists(one.dmgPath), true);
  }
});

test('deletion receipt must be durable before unlink, and failed sweeps can be retried', async t => {
  const f = await fixture(t), one = await f.build('one');
  await f.build('two', { inspectActivity: async () => 'active' });
  await mkdir(join(one.path, 'deletion.json'));
  const failure = await f.cleanup({ apply: true }); assert.ok(failure.errors.length); assert.equal(await exists(one.dmgPath), true);
  await rm(join(one.path, 'deletion.json'), { recursive: true });
  assert.equal((await f.cleanup({ apply: true })).removed[0].id, one.id);
});

test('target mutation during deletion-time assessment prevents unlink', async t => {
  const f = await fixture(t), one = await f.build('one'); await f.build('two', { inspectActivity: async () => 'active' });
  let reads = 0;
  const result = await f.cleanup({ apply: true, inspectActivity: async path => {
    if (path === one.path && ++reads === 2) await writeFile(one.dmgPath, 'replacement');
    return 'inactive';
  } });
  assert.ok(result.errors.length); assert.equal(await readFile(one.dmgPath, 'utf8'), 'replacement');
});

test('concurrent producers serialize registration and retain the actual final successful completion', async t => {
  const f = await fixture(t);
  const results = await Promise.all([f.build('one'), f.build('two'), f.build('three')]);
  const view = await f.cleanup({ apply: true });
  const present = [];
  for (const r of results) if (await exists(r.dmgPath)) present.push(r.id);
  assert.deepEqual(present, [view.keeper]);
});

test('explicit import copies one DMG, preserves source and records, and does not adopt its directory', async t => {
  const f = await fixture(t), source = join(f.parent, 'download.dmg');
  await writeFile(source, 'public installer'); await writeFile(join(f.parent, 'SHA256SUMS'), 'keep');
  const imported = await addInstaller({ root: f.root, path: source, version: 'old', ...inactive });
  await f.build('new'); assert.equal(await exists(imported.dmgPath), false);
  assert.equal(await readFile(source, 'utf8'), 'public installer'); assert.equal(await readFile(join(f.parent, 'SHA256SUMS'), 'utf8'), 'keep');
});

test('managed local packaging retains installer but removes generated app staging; exports/CI/signing opt out', async t => {
  const f = await fixture(t); let intermediate;
  const result = await managedPackage({ version: 'one', root: f.root, scratchRoot: join(f.parent, 'scratch'), produce: async output => {
    intermediate = output; await mkdir(output); const dmgPath = join(output, 'local.dmg'); await writeFile(dmgPath, 'installer');
    await mkdir(join(output, 'generated.app')); return { dmgPath, applicationPath: join(output, 'generated.app'), version: 'one' };
  } });
  assert.equal(await readFile(result.dmgPath, 'utf8'), 'installer'); assert.equal(result.applicationPath, null);
  assert.equal(await exists(intermediate), false);
  assert.equal(usesManagedInstaller({}, {}), true);
  for (const options of [{ outputRoot: '/explicit' }, { signingIdentity: 'Developer ID' }]) assert.equal(usesManagedInstaller(options, {}), false);
  for (const environment of [{ CI: 'true' }, { GITHUB_ACTIONS: 'true' }]) assert.equal(usesManagedInstaller({}, environment), false);
});

test('local verification publishes external receipt before qualifying cached DMG; failure preserves last success', async t => {
  const f = await fixture(t), good = await f.build('good');
  const runtime = { root: join(f.parent, 'scratch'), installerRoot: f.root,
    packageMacos: async ({ outputRoot, version }) => { await mkdir(outputRoot); const dmgPath = join(outputRoot, 'test.dmg'); await writeFile(dmgPath, 'verified'); return { dmgPath, version }; },
    createFixture: async () => {}, verifyDmg: async () => { throw Error('smoke failed'); } };
  await assert.rejects(verifyLocalPackage({ version: 'bad', reportPath: join(f.parent, 'bad.json'), runtime }), /smoke failed/);
  assert.equal(await exists(good.dmgPath), true); assert.equal(await exists(join(f.parent, 'bad.json')), false);
  runtime.verifyDmg = async () => ({ smoke: 'PASS' });
  const result = await verifyLocalPackage({ version: 'new', reportPath: join(f.parent, 'good.json'), runtime });
  assert.equal(JSON.parse(await readFile(result.reportPath)).verification.smoke, 'PASS');
  assert.equal(await readFile(result.dmgPath, 'utf8'), 'verified');
});

test('CLI cleanup and Doctor expose managed installers; --run never widens to installer cleanup', async t => {
  const f = await fixture(t), one = await f.build('one'); await f.build('two', { inspectActivity: async () => 'active' });
  const cli = fileURLToPath(new URL('../bin/workflow.js', import.meta.url));
  const env = { ...process.env, GATEREEVE_INSTALLER_ROOT: f.root, GATEREEVE_SCRATCH_ROOT: '', TMPDIR: f.parent, TMP: f.parent, TEMP: f.parent };
  const doctor = JSON.parse((await execute(process.execPath, [cli, 'doctor', '--json'], { env })).stdout);
  assert.equal(doctor.installers.entries.length, 2); assert.equal(await exists(join(f.parent, 'gatereeve')), false);
  const scoped = JSON.parse((await execute(process.execPath, [cli, 'cleanup', '--run', 'missing-11111111-1111-1111-1111-111111111111', '--apply', '--json'], { env })).stdout);
  assert.equal(scoped.installers, undefined); assert.equal(await exists(one.dmgPath), true);
  const preview = JSON.parse((await execute(process.execPath, [cli, 'cleanup', '--json'], { env })).stdout);
  assert.equal(preview.installers.entries.find(e => e.id === one.id).status, 'eligible'); assert.equal(await exists(one.dmgPath), true);
  const applied = JSON.parse((await execute(process.execPath, [cli, 'cleanup', '--apply', '--json'], { env })).stdout);
  assert.equal(applied.installers.removed[0].id, one.id); assert.equal(await exists(one.dmgPath), false);
});

test('CLI import, hold and consumer lease preserve source and release lease after failed child', async t => {
  const f = await fixture(t), source = join(f.parent, 'selected.dmg');
  await writeFile(source, 'selected');
  const cli = fileURLToPath(new URL('../bin/workflow.js', import.meta.url));
  const env = { ...process.env, GATEREEVE_INSTALLER_ROOT: f.root, GATEREEVE_SCRATCH_ROOT: '', TMPDIR: f.parent, TMP: f.parent, TEMP: f.parent };
  const call = args => execute(process.execPath, [cli, ...args], { env });
  const added = JSON.parse((await call(['installer', 'add', source, '--version', 'one'])).stdout);
  await call(['installer', 'hold', added.id, '--until', '2099-01-01T00:00:00Z', '--reason', 'investigate']);
  await f.build('two'); assert.equal(await exists(added.dmgPath), true);
  const inspect = `const fs=require('node:fs'); const p=process.env.GATEREEVE_INSTALLER_PATH; if(process.argv[1]!==p||!JSON.parse(fs.readFileSync(require('node:path').join(require('node:path').dirname(p),'owner.json'))).consumers.length) process.exit(9); process.exit(7);`;
  await assert.rejects(call(['installer', 'use', added.id, process.execPath, '-e', inspect, '{installer}']), e => /Scratch command failed \(7\)/u.test(e.stderr));
  assert.equal(JSON.parse(await readFile(join(added.path, 'owner.json'))).consumers.length, 0);
  await call(['installer', 'release-hold', added.id]);
  assert.equal((await f.cleanup({ apply: true })).removed[0].id, added.id);
  assert.equal(await readFile(source, 'utf8'), 'selected');
});
