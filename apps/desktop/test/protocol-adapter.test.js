import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, symlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { currentFixture } from '../../../cli/test/helpers/current-fixture.js';
import { createProtocolAdapter } from '../main/protocol-adapter.js';
import { validateSnapshot, validateDetail } from '../resources/protocol/current/observation.js';

test('desktop resolves the parent record, observes current core and does not mutate', async t => {
  const f = await currentFixture(t); const adapter = createProtocolAdapter();
  await f.request('run.start', { implementers: ['fixture'] }, 'start');
  await adapter.resolve(f.repo);
  const before = (await f.core.state()).events;
  const snapshot = validateSnapshot(await adapter.snapshot(f.home));
  assert.equal(snapshot.contract, 'gatereeve/current/5');
  assert.equal(snapshot.current.phase, 'DESIGNING');
  assert.equal(snapshot.obligations.some(item => item.id === 'judge'), true);
  const detail = validateDetail(await adapter.read(f.home, 'artifact', 'design.md'));
  assert.match(detail.data.content, /Approved fixture/);
  assert.deepEqual((await f.core.state()).events, before);
  assert.equal(adapter.waiveBoundaryGate, undefined); assert.equal(adapter.recordBoundaryModuleOutcome, undefined);
});

test('desktop shows current-entry for old records and confines artifact reads to resolved inventory', async t => {
  const f = await currentFixture(t); const adapter = createProtocolAdapter();
  await assert.rejects(adapter.snapshot(f.home), /Resolve/);
  await adapter.resolve(f.repo);
  assert.equal((await adapter.snapshot(f.home)).mode, 'current-entry');
  assert.equal(await readFile(join(f.home, 'events.jsonl'), 'utf8'), 'historical bytes\n');
  await assert.rejects(adapter.read(f.home, 'artifact', '../app/app.js'), /not safely/);
  await symlink(join(f.repo, 'app.js'), join(f.home, 'tracker.md'));
  assert.equal((await adapter.snapshot(f.home)).artifacts.find(item => item.id === 'tracker.md').unsafe, true);
  await assert.rejects(adapter.read(f.home, 'artifact', 'tracker.md'), /not safely/);
});


test('desktop requalifies actual native validators and pattern inputs with GUI Python discovery', async t => {
  const { establishCurrentRun } = await import('../../../cli/test/helpers/established-current-run.js');
  const { discoverCompatiblePythonExecutable } = await import('../main/executable-discovery.js');
  const { executeCurrentRequest } = await import('../../../plugin-src/shared/resources/protocol/current/adapter.js');
  const f = await currentFixture(t);
  const pythonExecutable = await discoverCompatiblePythonExecutable();
  assert.ok(pythonExecutable);
  f.core.runtime.pythonGuardOptions = { pythonExecutable };
  await establishCurrentRun(f.core);
  const saved = { ...process.env };
  t.after(() => { for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved); });
  // GUI environment differs from the native producer and omits Homebrew Python.
  const emptyPath = join(f.root, 'empty-gui-path');
  await mkdir(emptyPath);
  process.env.PATH = emptyPath;
  process.env.GATEREEVE_OBSERVER_WINDOW_ID = 'different-window';
  const adapter = createProtocolAdapter({ gitExecutable: '/usr/bin/git', pythonExecutable });
  await adapter.resolve(f.repo);
  const before = (await f.core.state()).events;
  const snapshot = validateSnapshot(await adapter.snapshot(f.home));
  assert.equal(snapshot.current.phase, 'IMPLEMENTING');
  assert.equal(snapshot.milestones.find(x => x.name === 'implementation').allowed, true);
  for (const id of ['reconcile', 'pattern']) {
    assert.equal(snapshot.milestones.find(x => x.name === 'acceptance').outcomes.find(x => x.id === id).outcome, 'PASS');
  }
  const publicSnapshot = await executeCurrentRequest({ operation: 'snapshot', cwd: f.repo }, { gitExecutable: '/usr/bin/git', pythonGuardOptions: { pythonExecutable } });
  assert.equal(publicSnapshot.ok, true);
  assert.equal(publicSnapshot.data.milestones.find(x => x.name === 'implementation').allowed, true);
  assert.deepEqual((await f.core.state()).events, before);
  const missing = createProtocolAdapter({ gitExecutable: '/usr/bin/git', pythonExecutable: join(f.root, 'missing-python') });
  await missing.resolve(f.repo);
  assert.equal((await missing.snapshot(f.home)).milestones.find(x => x.name === 'implementation').allowed, true, 'native planning no longer depends on Python discovery');
});
