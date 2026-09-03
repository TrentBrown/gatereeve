import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  ContractError,
  EVENT_SCHEMA_VERSION,
  createModelLock,
  failureResult,
  hashModel,
  hashModuleDefinition,
  loadDefaultModel,
  stableJson,
  successResult,
  validateEvent,
  validateModel,
  validateModelLock,
  validateResultEnvelope,
} from '../../plugin-src/shared/resources/protocol/index.js';
import { composePackages } from '../src/plugin/compose.js';

const protocolRoot = resolve(
  import.meta.dirname,
  '../../plugin-src/shared/resources/protocol'
);

test('default workflow model validates and hashes deterministically', async () => {
  const model = await loadDefaultModel();
  const reordered = JSON.parse(stableJson(model));

  assert.equal(hashModel(model), hashModel(reordered));
  assert.match(hashModel(model), /^sha256:[0-9a-f]{64}$/);

  const lock = createModelLock(model, { createdAt: '2026-08-25T00:00:00Z' });
  assert.equal(validateModelLock(lock), lock);
  assert.equal(lock.modelHash, hashModel(model));
  assert.deepEqual([...lock.guardIds].sort(), lock.guardIds);
});

test('model validation rejects unknown guards, cycles, and provider injection fields', async () => {
  const model = structuredClone(await loadDefaultModel());
  model.feature.transitions[0].guards.push('shell.run-anything');

  assert.throws(() => validateModel(model), /unknown guard shell\.run-anything/);

  const cyclic = structuredClone(await loadDefaultModel());
  cyclic.moduleGraph.modules[0].dependsOn = [cyclic.moduleGraph.modules[0].id];
  cyclic.moduleGraph.modules[0].digest = hashModuleDefinition(cyclic.moduleGraph.modules[0]);
  assert.throws(() => validateModel(cyclic), /dependsOn must contain unique namespaced module IDs/);

  const providerInjection = structuredClone(await loadDefaultModel());
  providerInjection.moduleGraph.modules[2].observe = {
    providerId: 'gatereeve/verification-provider',
    version: '1.0.0',
    executable: './from-the-repository',
  };
  providerInjection.moduleGraph.modules[2].digest = hashModuleDefinition(
    providerInjection.moduleGraph.modules[2]
  );
  assert.throws(() => validateModel(providerInjection), /observe contains unknown fields: executable/);
});

test('event contract accepts complete events and rejects malformed identity', async () => {
  const model = await loadDefaultModel();
  const event = {
    schemaVersion: EVENT_SCHEMA_VERSION,
    sequence: 1,
    eventId: 'evt-0001',
    featureId: 'workflow-state-machine-cli',
    recordedAt: '2026-08-25T00:00:00Z',
    type: 'FEATURE_INITIALIZED',
    modelHash: hashModel(model),
    actor: { kind: 'agent', label: 'Codex' },
    payload: {},
  };

  assert.equal(validateEvent(event), event);
  assert.throws(
    () => validateEvent({ ...event, eventId: '../event' }),
    /evt- portable identifier/
  );
  assert.throws(
    () => validateEvent({ ...event, actor: { kind: 'pretend-human', label: 'agent' } }),
    /recognized kind/
  );
});

test('result envelope has one stable success and failure shape', () => {
  const success = successResult('status', { featureState: 'DESIGNING' });
  const failure = failureResult(
    'slice start',
    new ContractError('Slice is not eligible', { blocker: 'plan authorization' })
  );

  assert.equal(validateResultEnvelope(success), success);
  assert.equal(validateResultEnvelope(failure), failure);
  assert.deepEqual(Object.keys(success), Object.keys(failure));
  assert.equal(failure.error.code, 'CONTRACT_INVALID');
});

test('native packages retain one identical canonical protocol manifest', async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), 'gatereeve protocol packages '));
  const sourceRoot = resolve(import.meta.dirname, '../../plugin-src');
  const result = await composePackages({
    sourceRoot,
    distRoot: outputRoot,
    version: '0.1.0',
    sourceCommit: 'contract-test',
  });

  assert.match(result.protocol.hash, /^sha256:[0-9a-f]{64}$/);
  const manifests = await Promise.all(
    ['codex', 'claude'].map(async (platform) =>
      JSON.parse(
        await readFile(
          resolve(outputRoot, platform, '.workflow-build/protocol-source.json'),
          'utf8'
        )
      )
    )
  );
  assert.deepEqual(manifests[0], result.protocol);
  assert.deepEqual(manifests[1], result.protocol);
  assert(manifests[0].files.some((item) => item.path === 'model/workflow-model.json'));
});
