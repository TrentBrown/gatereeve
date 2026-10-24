import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, symlink } from 'node:fs/promises';
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
  assert.equal(snapshot.contract, 'gatereeve/current/2');
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
