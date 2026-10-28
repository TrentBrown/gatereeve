import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, lstat, symlink, chmod, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { publishScratch, createScratch, finishScratch, cleanupScratch, processIdentity, runScratchCommand } from '../../plugin-src/shared/resources/storage/scratch.js';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('../../plugin-src/shared/resources/storage/scratch.js', import.meta.url));
async function fixture(t) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'scratch-default-test-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  return parent;
}

test('supervised tools inherit managed temporary storage, preserve cwd and share one nested root', async t => {
  const parent = await fixture(t), report = join(parent, 'result.json');
  const cwd = join(parent, 'project'); await mkdir(cwd);
  const child = `
    import { tmpdir } from 'node:os';
    import { mkdtemp, writeFile } from 'node:fs/promises';
    import { join } from 'node:path';
    import { withScratch } from ${JSON.stringify(new URL('../../plugin-src/shared/resources/storage/scratch.js', import.meta.url).href)};
    const raw = await mkdtemp(join(tmpdir(), 'tool-leftover-'));
    await writeFile(join(raw, 'bulk'), Buffer.alloc(1024 * 1024));
    await withScratch({ purpose: 'nested' }, async nested => {
      await writeFile(${JSON.stringify(report)}, JSON.stringify({ cwd:process.cwd(), raw,
        tmp:process.env.TMP, temp:process.env.TEMP, tmpdir:tmpdir(),
        parent:process.env.GATEREEVE_SCRATCH, root:process.env.GATEREEVE_SCRATCH_ROOT, nested:nested.path }));
    });
  `;
  await execute(process.execPath, [helper, 'run', process.execPath, '--input-type=module', '-e', child], {
    cwd, env: { ...process.env, GATEREEVE_SCRATCH_ROOT: '', TMPDIR: parent, TMP: parent, TEMP: parent },
  });
  const result = JSON.parse(await readFile(report));
  assert.equal(result.cwd, cwd);
  assert.equal(result.tmpdir, join(result.parent, 'tmp'));
  assert.equal(result.tmp, result.tmpdir); assert.equal(result.temp, result.tmpdir);
  assert.equal(result.root, join(parent, 'gatereeve'));
  assert.ok(result.raw.startsWith(`${result.tmpdir}/`));
  assert.ok(result.nested.startsWith(join(result.root, 'runs') + '/'));
  assert.ok(!result.nested.startsWith(result.parent + '/'));
  assert.deepEqual(await readdir(join(result.root, 'runs')), []);
  assert.equal((await readdir(join(result.root, 'reports'))).length, 2);
  // Required exported report and caller cwd outlive both runs.
  assert.ok((await lstat(cwd)).isDirectory());
});

test('failed child exports bounded diagnostics before reclaiming tool leftovers', async t => {
  const parent = await fixture(t);
  await assert.rejects(execute(process.execPath, [helper, 'run', process.execPath, '-e',
    "require('fs').writeFileSync(require('path').join(require('os').tmpdir(),'bulk'),Buffer.alloc(1024*1024));console.error('owned failure');process.exit(3)"], {
    env: { ...process.env, GATEREEVE_SCRATCH_ROOT: '', TMPDIR: parent, TMP: parent, TEMP: parent },
  }), /owned failure/);
  assert.deepEqual(await readdir(join(parent, 'gatereeve/runs')), []);
  const [name] = await readdir(join(parent, 'gatereeve/reports'));
  const receipt = JSON.parse(await readFile(join(parent, 'gatereeve/reports', name)));
  assert.equal(receipt.outcome, 'FAIL'); assert.match(receipt.error, /owned failure/);
});

test('split UTF-8 output is preserved in captured streams and failure diagnostics', async t => {
  const child = `
    const { setTimeout: delay } = require('node:timers/promises');
    (async () => {
      for (const [out, err] of [['e282','c3'], ['ac','a9'], ['f09f','f09f'], ['9880','9880']]) {
        process.stdout.write(Buffer.from(out, 'hex'));
        process.stderr.write(Buffer.from(err, 'hex'));
        await delay(100);
      }
      process.exitCode = 7;
    })();
  `;
  const parent = await fixture(t);
  let failure;
  try {
    await runScratchCommand(process.execPath, ['-e', child], { root:join(parent, 'captured'), capture:true });
  } catch (error) { failure = error; }
  assert.equal(failure.scratchResult.code, 7);
  assert.equal(failure.scratchResult.stdout, '€😀');
  assert.equal(failure.scratchResult.stderr, 'é😀');
  let forwarded;
  try {
    await execute(process.execPath, [helper, 'run', process.execPath, '-e', child], {
      env:{...process.env, GATEREEVE_SCRATCH_ROOT:'', TMPDIR:parent, TMP:parent, TEMP:parent},
    });
  } catch (error) { forwarded = error; }
  assert.equal(forwarded.stdout, '€😀');
  assert.ok(forwarded.stderr.startsWith('é😀'));
  const [name] = await readdir(join(parent, 'gatereeve/reports'));
  const report = JSON.parse(await readFile(join(parent, 'gatereeve/reports', name)));
  assert.match(report.error, /€/);
  assert.match(report.error, /é/);
  assert.match(report.error, /😀/);
  assert.doesNotMatch(report.error, /�/);
});

test('inherited unmanaged root is rejected without adopting it', async t => {
  const parent = await fixture(t), unowned = join(parent, 'unowned'); await mkdir(unowned, { mode: 0o700 });
  await assert.rejects(execute(process.execPath, [helper, 'run', process.execPath, '-e', 'process.exit(0)'], {
    env: { ...process.env, GATEREEVE_SCRATCH_ROOT: unowned },
  }));
  assert.deepEqual(await readdir(unowned), []);
});

test('cross-volume publication preserves outputs and symlinks without exposing ownership records', async t => {
  const parent = await fixture(t), source = join(parent, 'source'), destination = join(parent, 'output');
  await mkdir(source); await writeFile(join(source, 'artifact'), 'deliverable');
  await symlink('artifact', join(source, 'shortcut'));
  const move = async () => { throw Object.assign(new Error('different volume'), { code: 'EXDEV' }); };
  await publishScratch(source, destination, { move });
  assert.equal(await readFile(join(destination, 'artifact'), 'utf8'), 'deliverable');
  assert.ok((await lstat(join(destination, 'shortcut'))).isSymbolicLink());
  assert.equal(await readFile(join(source, 'artifact'), 'utf8'), 'deliverable');
  await assert.rejects(publishScratch(join(parent, 'missing'), join(parent, 'failed'), { move }), { code: 'ENOENT' });
  assert.deepEqual((await readdir(parent)).sort(), ['output', 'source']);
});

test('sealed reviewer trees are reclaimable without following links into caller data', async t => {
  const parent = await fixture(t), root = join(parent, 'gatereeve'), outside = join(parent, 'caller');
  await mkdir(outside, { mode: 0o500 });
  const run = await createScratch({ root, purpose: 'sealed-review' });
  const view = join(run.path, 'view'); await mkdir(view); await writeFile(join(view, 'source'), 'pinned');
  await symlink(outside, join(view, 'outside')); await chmod(view, 0o500);
  await finishScratch(run);
  await cleanupScratch({ root, run: run.id, apply: true });
  assert.deepEqual(await readdir(join(root, 'runs')), []);
  assert.equal((await lstat(outside)).mode & 0o777, 0o500);
});

test('governed check supervisor captures failure, bounds timeout and reaps the command', async t => {
  const { runCheckProcess } = await import('../../plugin-src/shared/resources/protocol/current/execution.js');
  const { runnerEnvironment } = await import('../../plugin-src/shared/resources/protocol/current/runner-profile.js');
  const env = runnerEnvironment();
  const failure = await runCheckProcess({ command: process.execPath, args: ['-e', 'console.log(process.env.TMPDIR);console.error("check failure");process.exit(7)'] }, {}, process.cwd(), env);
  assert.equal(failure.outcome, 'FAIL'); assert.equal(failure.exitCode, 7);
  assert.match(failure.stderr, /check failure/);
  assert.match(failure.stdout, /gatereeve.*runs.*validation-check/);
  await assert.rejects(lstat(failure.stdout.trim()), { code: 'ENOENT' });
  const timeout = await runCheckProcess({ command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], timeoutMs: 100 }, {}, process.cwd(), env);
  assert.equal(timeout.outcome, 'UNAVAILABLE'); assert.equal(timeout.termination.kind, 'timeout');
  const missing = await runCheckProcess({ command: '/no-such-executable', args: [] }, {}, process.cwd(), env);
  assert.equal(missing.outcome, 'UNAVAILABLE'); assert.equal(missing.termination.kind, 'process-error');
});

test('governed checks retain command evidence when scratch report publication also fails', async t => {
  for (const mode of ['failure', 'success', 'timeout']) {
    const parent = await fixture(t);
    const child = `
      const fs = require('node:fs'), path = require('node:path');
      fs.writeFileSync(path.join(process.env.TMPDIR, 'bulk'), 'retain');
      fs.rmSync(path.join(process.env.GATEREEVE_SCRATCH_ROOT, 'reports'), { recursive:true });
      console.log('primary-output private-project-value');
      console.error('primary-error private-project-value');
      ${mode === 'timeout' ? 'setInterval(()=>{},1000)' : `process.exit(${mode === 'failure' ? 7 : 0})`};
    `;
    // A distinct process and root isolate this intentional publication failure
    // from concurrent checks and the test runner's own managed scratch.
    const script = `
      import { runCheckProcess } from ${JSON.stringify(new URL('../../plugin-src/shared/resources/protocol/current/execution.js', import.meta.url).href)};
      import { runnerDiagnostics } from ${JSON.stringify(new URL('../../plugin-src/shared/resources/protocol/current/diagnostics.js', import.meta.url).href)};
      const result = await runCheckProcess({ command:process.execPath, args:['-e',${JSON.stringify(child)}], timeoutMs:${mode === 'timeout' ? 1500 : 10000} }, {}, process.cwd(), process.env);
      const logs = runnerDiagnostics(result, {environment:{inherit:['PROJECT_SECRET']}}, {...process.env,PROJECT_SECRET:'private-project-value'});
      console.log(JSON.stringify({result,logs}));
    `;
    const { stdout } = await execute(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, GATEREEVE_SCRATCH_ROOT: '', TMPDIR: parent, TMP: parent, TEMP: parent },
    });
    const { result, logs } = JSON.parse(stdout);
    assert.equal(result.outcome, mode === 'failure' ? 'FAIL' : 'UNAVAILABLE');
    assert.equal(result.exitCode, mode === 'failure' ? 7 : mode === 'success' ? 0 : null);
    assert.equal(result.termination.kind, mode === 'timeout' ? 'timeout' : mode === 'failure' ? 'exit' : 'process-error');
    assert.match(result.termination.reason, /scratch finalization failed/);
    assert.match(result.stdout, /primary-output/);
    assert.match(result.stderr, /primary-error/);
    assert.match(result.stderr, /ENOENT/);
    assert.match(logs.stderr, /ENOENT/);
    assert.doesNotMatch(JSON.stringify(logs), /private-project-value/);
    const runs = await readdir(join(parent, 'gatereeve/runs'));
    assert.equal(runs.length, 1);
    assert.equal(await readFile(join(parent, 'gatereeve/runs', runs[0], 'tmp/bulk'), 'utf8'), 'retain');
  }
});


test('concurrent producers wait for a verified live maintainer beyond the interrupted-lock grace period', async t => {
  const parent = await fixture(t), root = join(parent, 'gatereeve');
  const first = await createScratch({ root, purpose: 'first' });
  const lock = join(root, '.maintenance-lock'); await mkdir(lock, { mode: 0o700 });
  await writeFile(join(lock, 'owner.json'), JSON.stringify({ processId: process.pid, processStartedAt: await processIdentity(process.pid) }), { mode: 0o600 });
  const second = createScratch({ root, purpose: 'second' });
  await new Promise(resolve => setTimeout(resolve, 2500));
  // This test owns the simulated maintainer and releases its exact lock normally.
  await rm(lock, { recursive: true });
  const created = await second;
  assert.notEqual(created.id, first.id);
  await finishScratch(created); await finishScratch(first);
});


test('captured validation output stays out of scratch failure diagnostics', async t => {
  const parent = await fixture(t), root = join(parent, 'gatereeve');
  let failure;
  try {
    await runScratchCommand(process.execPath, ['-e', 'console.error("private-project-value");process.exit(2)'], { root, purpose: 'private-capture', capture: true });
  } catch (error) { failure = error; }
  assert.match(failure.scratchResult.stderr, /private-project-value/);
  assert.doesNotMatch(failure.message, /private-project-value/);
  const [report] = await readdir(join(root, 'reports'));
  assert.doesNotMatch(await readFile(join(root, 'reports', report), 'utf8'), /private-project-value/);
});
