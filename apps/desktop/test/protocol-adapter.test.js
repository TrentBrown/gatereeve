import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { initializeFeature } from '../../../plugin-src/shared/resources/protocol/feature.js';
import { loadDefaultModel } from '../../../plugin-src/shared/resources/protocol/model.js';
import { createProtocolAdapter } from '../main/protocol-adapter.js';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('Desktop reads canonical snapshots and details without journal mutation or CLI execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-desktop-protocol-'));
  const featureHome = join(root, 'docs/issues/desktop-fixture');
  await initializeFeature({
    featureHome,
    featureId: 'desktop-fixture',
    actor: { kind: 'agent', label: 'desktop protocol test' },
    eventId: 'evt-desktop-init',
    recordedAt: '2026-08-26T12:00:00.000Z',
  });
  const journalPath = join(featureHome, 'events.jsonl');
  const before = digest(await readFile(journalPath));
  const adapter = createProtocolAdapter();
  const snapshot = await adapter.snapshot(featureHome, {
    sources: {
      local: { status: 'current', detail: 'fixture', checkedAt: '2026-08-26T12:00:00.000Z' },
    },
  });
  const events = await adapter.read(featureHome, 'events');
  assert.equal(snapshot.featureId, 'desktop-fixture');
  assert.equal(snapshot.mode, 'governed');
  assert.equal(snapshot.modules.schemaVersion, 1);
  assert.equal(snapshot.modules.slots.length, 2);
  assert.equal(
    snapshot.modules.slots.find((slot) => slot.id === 'boundary.evaluation').modules
      .find((module) => module.id === 'gatereeve/judge').label,
    'Judge',
  );
  assert.equal(
    snapshot.modules.slots.find((slot) => slot.id === 'feature.finalization').modules.length,
    0,
  );
  assert.equal(events.kind, 'events');
  assert.equal(digest(await readFile(journalPath)), before);
});

test('Desktop preserves canonical missing, legacy, inconsistent, and incompatible diagnostics', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-desktop-modes-'));
  const adapter = createProtocolAdapter();
  const missing = join(root, 'missing');
  assert.equal((await adapter.snapshot(missing)).mode, 'missing');

  const legacy = join(root, 'legacy');
  await mkdir(legacy);
  assert.equal((await adapter.snapshot(legacy)).mode, 'legacy');

  const inconsistent = join(root, 'inconsistent');
  await mkdir(inconsistent);
  await writeFile(join(inconsistent, 'events.jsonl'), '');
  assert.equal((await adapter.snapshot(inconsistent)).mode, 'inconsistent');

  const incompatible = join(root, 'incompatible');
  const model = { ...(await loadDefaultModel()), modelId: 'example/custom-workflow' };
  await initializeFeature({
    featureHome: incompatible,
    featureId: 'incompatible-fixture',
    model,
    actor: { kind: 'agent', label: 'desktop protocol test' },
    eventId: 'evt-incompatible-init',
    recordedAt: '2026-08-26T12:00:00.000Z',
  });
  assert.equal((await adapter.snapshot(incompatible)).mode, 'incompatible');
});

test('Desktop boundary waivers recompute exact inputs and retain only a scoped mutation', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'gatereeve-desktop-waiver-'));
  const calls = [];
  let contextPath = null;
  let sequence = 0;
  const adapter = createProtocolAdapter({
    temporaryDirectory,
    randomId: () => `id-${sequence += 1}`,
    readRecord: async () => ({ modelLock: { modelHash: `sha256:${'a'.repeat(64)}` } }),
    project: () => ({
      boundaryAttempts: [{
        id: 'attempt-1', scope: 'SLICE', state: 'ACTIVE', context: { headSha: 'a'.repeat(40) },
        gates: [{ id: 'pinContext', waiverAllowed: false, locked: true }, {
          id: 'judge', waiverAllowed: true, locked: false,
        }],
      }],
    }),
    runGuard: async (_guard, args, options) => {
      contextPath = args[args.indexOf('--context') + 1];
      const gateId = args[args.indexOf('--gate') + 1];
      calls.push(['guard', gateId, options.cwd]);
      assert.equal(JSON.parse(await readFile(contextPath, 'utf8')).headSha, 'a'.repeat(40));
      return { passed: true, data: { gateId, current: true } };
    },
    recordWaiver: async (featureHome, request) => {
      calls.push(['waiver', featureHome, request]);
      return { event: { eventId: request.eventId } };
    },
  });
  const result = await adapter.waiveBoundaryGate({
    featureHome: '/repo/docs/issues/feature',
    repositoryRoot: '/repo',
    attemptId: 'attempt-1',
    gateId: 'judge',
    reason: '  Small and low risk.  ',
    confirmationLabel: '  Trent  ',
  });
  assert.equal(result.event.eventId, 'evt-desktop-waiver-id-2');
  assert.deepEqual(calls.slice(0, 2), [
    ['guard', 'pinContext', '/repo'],
    ['guard', 'judge', '/repo'],
  ]);
  const waiver = calls[2][2];
  assert.equal(waiver.reason, 'Small and low risk.');
  assert.deepEqual(waiver.actor, { kind: 'human-confirmed', label: 'Trent' });
  assert.deepEqual(waiver.inputs, { gateId: 'judge', current: true });
  assert.deepEqual(Object.keys(waiver.currentFingerprints).sort(), ['judge', 'pinContext']);
  await assert.rejects(access(contextPath), /ENOENT/);
});

test('Desktop rejects waiver mutation once human review has begun', async () => {
  const adapter = createProtocolAdapter({
    readRecord: async () => ({ modelLock: { modelHash: `sha256:${'a'.repeat(64)}` } }),
    project: () => ({
      boundaryAttempts: [{
        id: 'attempt-1', scope: 'SLICE', state: 'HUMAN_REVIEW', context: {},
        gates: [{ id: 'judge', waiverAllowed: true, locked: false }],
      }],
    }),
  });
  await assert.rejects(adapter.waiveBoundaryGate({
    featureHome: '/repo/docs/issues/feature',
    repositoryRoot: '/repo',
    attemptId: 'attempt-1',
    gateId: 'judge',
    reason: 'Too late',
    confirmationLabel: 'Trent',
  }), /not active/);
});
