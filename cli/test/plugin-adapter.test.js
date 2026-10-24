import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { executePluginRequest } from '../../plugin-src/shared/resources/protocol/plugin-adapter.js';
import { currentFixture } from './helpers/current-fixture.js';
const exec = promisify(execFile);

test('native current adapter starts without a PATH CLI and status process agrees', async t => {
  const f = await currentFixture(t);
  assert.equal((await f.request('run.start', { implementers: ['fixture'] }, 'start')).ok, true);
  const status = await f.request('status');
  assert.equal(status.data.current.phase, 'DESIGNING');
  const { stdout } = await exec(process.execPath, [resolve(import.meta.dirname, '../../plugin-src/shared/resources/protocol/plugin-adapter.js'), 'status', '--cwd', f.repo]);
  assert.deepEqual(JSON.parse(stdout), status);
});

test('unsupported old mutations and arbitrary feature homes cannot append passage', async t => {
  const f = await currentFixture(t);
  await f.request('run.start', { implementers: ['fixture'] }, 'start');
  const before = (await f.core.state()).events;
  for (const operation of ['feature.transition', 'gate.record', 'boundary.retry', 'feature.migrate-model']) {
    const result = await f.request(operation, { outcome: 'PASS' });
    assert.equal(result.ok, false); assert.match(result.error.message, /Unsupported/);
  }
  const wrong = await executePluginRequest({ operation: 'status', cwd: f.repo, featureHome: f.root });
  assert.equal(wrong.ok, false);
  assert.deepEqual((await f.core.state()).events, before);
});
