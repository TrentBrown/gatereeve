import assert from 'node:assert/strict';
import { access, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import { currentFixture } from './helpers/current-fixture.js';
import { stageProtocolResources } from '../src/protocol/stage.js';

test('CLI staging records an exact canonical protocol inventory and hash', async t => {
  const destinationRoot = await mkdtemp(join(tmpdir(), 'gatereeve staged protocol '));
  const sourceRoot = resolve(import.meta.dirname, '../../plugin-src/shared/resources');
  const manifest = await stageProtocolResources({ sourceRoot, destinationRoot });

  assert.match(manifest.protocolHash, /^sha256:[0-9a-f]{64}$/);
  assert.match(manifest.contractSha256, /^[0-9a-f]{64}$/);
  assert(manifest.files.some((item) => item.path === 'current/core.js'));
  assert(manifest.files.some((item) => item.path === 'plugin-adapter.js'));

  const source = await readFile(resolve(sourceRoot, 'protocol/current/core.js'), 'utf8');
  const staged = await readFile(resolve(destinationRoot, 'protocol/current/core.js'), 'utf8');
  assert.equal(staged, source);

  const persisted = JSON.parse(
    await readFile(resolve(destinationRoot, 'cli-projection.json'), 'utf8')
  );
  assert.deepEqual(persisted, manifest);

  const { executePluginRequest } = await import(
    pathToFileURL(resolve(destinationRoot, 'protocol/plugin-adapter.js')).href
  );
  const fixture = await currentFixture(t);
  const initialized = await executePluginRequest({ operation: 'run.start', cwd: fixture.repo,
    input: { implementers: ['staging-test'] }, operationId: 'staged-start' });
  assert.equal(initialized.ok, true, initialized.error?.message);
  const observed = await executePluginRequest({ operation: 'snapshot', cwd: fixture.repo });
  assert.equal(observed.ok, true);
  assert.equal(observed.data.featureId, 'feature');
  assert.equal(observed.data.contract, 'gatereeve/current/2');

});

test('consumer staging copies only validated support paths and names its manifest', async () => {
  const destinationRoot = await mkdtemp(join(tmpdir(), 'gatereeve staged consumer '));
  const sourceRoot = resolve(import.meta.dirname, '../../plugin-src/shared/resources');
  const manifest = await stageProtocolResources({
    sourceRoot,
    destinationRoot,
    manifestName: 'desktop-projection.json',
    includePaths: ['protocol'],
  });
  assert.deepEqual(
    JSON.parse(await readFile(resolve(destinationRoot, 'desktop-projection.json'), 'utf8')),
    manifest,
  );
  await assert.rejects(access(resolve(destinationRoot, 'commands')), /ENOENT/);
  await assert.rejects(access(resolve(destinationRoot, 'scripts')), /ENOENT/);
  await assert.rejects(
    stageProtocolResources({
      sourceRoot,
      destinationRoot,
      manifestName: '../outside.json',
      includePaths: ['protocol'],
    }),
    /plain file name/,
  );
  assert.deepEqual(
    JSON.parse(await readFile(resolve(destinationRoot, 'desktop-projection.json'), 'utf8')),
    manifest,
  );
});
