import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
