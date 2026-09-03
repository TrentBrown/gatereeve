import assert from 'node:assert/strict';
import { mkdtemp, mkdir, open, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  JOURNAL_FILE,
  JOURNAL_LOCK_FILE,
  MIGRATION_MARKER_FILE,
  MODEL_LOCK_FILE,
  appendEvent,
  assertVersionCompatible,
  createEvent,
  createModelLock,
  discoverFeatureMode,
  initializeFeature,
  loadDefaultModel,
  migrateFeatureModel,
  parseJournal,
  previewFeatureModelMigration,
  recoverPendingModelMigration,
  readFeatureRecord,
  stableJson,
} from '../../plugin-src/shared/resources/protocol/index.js';
import { atomicCreateDirectory } from '../../plugin-src/shared/resources/protocol/storage.js';

async function temporaryFeature(name = 'state-machine-feature') {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve feature store '));
  return { root, featureHome: resolve(root, 'docs/issues', name), featureId: name };
}

const actor = { kind: 'agent', label: 'test-agent' };

test('feature initialization atomically creates a governed DESIGNING record', async () => {
  const fixture = await temporaryFeature();
  const initialized = await initializeFeature({
    ...fixture,
    actor,
    recordedAt: '2026-08-25T01:02:03Z',
    eventId: 'evt-initial',
  });

  assert.equal(initialized.featureState, 'DESIGNING');
  assert.equal((await discoverFeatureMode(fixture.featureHome)).mode, 'governed');
  const files = (await readdir(fixture.featureHome)).sort();
  assert.deepEqual(files, ['events.jsonl', 'interview.md', 'workflow-model.lock.json']);

  const record = await readFeatureRecord(fixture.featureHome);
  assert.equal(record.events.length, 1);
  assert.equal(record.events[0].type, 'FEATURE_INITIALIZED');
  assert.equal(record.events[0].payload.featureState, 'DESIGNING');
  assert.equal(record.events[0].modelHash, record.modelLock.modelHash);

  const interview = await readFile(resolve(fixture.featureHome, 'interview.md'), 'utf8');
  assert.match(interview, /^# Interview - state-machine-feature/m);
  assert.match(interview, /\*\*Status:\*\* active/);
});

test('atomic directory creation removes prepared content when its writer fails', async () => {
  const fixture = await temporaryFeature('failure-injected');
  await assert.rejects(
    atomicCreateDirectory(fixture.featureHome, async (temporary) => {
      await writeFile(resolve(temporary, 'partial.txt'), 'partial');
      throw new Error('injected preparation failure');
    }),
    /injected preparation failure/
  );

  assert.equal((await discoverFeatureMode(fixture.featureHome)).mode, 'missing');
  const issueRoot = resolve(fixture.root, 'docs/issues');
  assert.deepEqual(await readdir(issueRoot), []);
});

test('legacy and incomplete records are never silently treated as governed', async () => {
  const legacy = await temporaryFeature('legacy-feature');
  await mkdir(legacy.featureHome, { recursive: true });
  await writeFile(resolve(legacy.featureHome, 'interview.md'), '# legacy\n');
  assert.equal((await discoverFeatureMode(legacy.featureHome)).mode, 'legacy');
  await assert.rejects(readFeatureRecord(legacy.featureHome), /Feature record is legacy/);

  const incomplete = await temporaryFeature('incomplete-feature');
  await mkdir(incomplete.featureHome, { recursive: true });
  await writeFile(resolve(incomplete.featureHome, MODEL_LOCK_FILE), '{}\n');
  const mode = await discoverFeatureMode(incomplete.featureHome);
  assert.equal(mode.mode, 'inconsistent');
  assert.equal(mode.reason, 'event journal missing');
});

test('journal append revalidates sequence and preserves the prior journal on rejection', async () => {
  const fixture = await temporaryFeature();
  const initialized = await initializeFeature({
    ...fixture,
    actor,
    recordedAt: '2026-08-25T01:02:03Z',
    eventId: 'evt-initial',
  });
  const hashes = new Set([initialized.modelLock.modelHash]);
  const second = createEvent({
    sequence: 2,
    featureId: fixture.featureId,
    type: 'DESIGN_APPROVED',
    modelHash: initialized.modelLock.modelHash,
    actor: { kind: 'human-confirmed', label: 'user in conversation' },
    payload: { designHash: 'sha256:example' },
    recordedAt: '2026-08-25T01:03:00Z',
    eventId: 'evt-design-approved',
  });
  await appendEvent(fixture.featureHome, second, { allowedModelHashes: hashes });

  const before = await readFile(resolve(fixture.featureHome, JOURNAL_FILE), 'utf8');
  const stale = createEvent({
    ...second,
    eventId: 'evt-stale',
    type: 'SPEC_VALIDATED',
  });
  await assert.rejects(
    appendEvent(fixture.featureHome, stale, { allowedModelHashes: hashes }),
    /sequence 2 is stale; expected 3/
  );
  const after = await readFile(resolve(fixture.featureHome, JOURNAL_FILE), 'utf8');
  assert.equal(after, before);
  assert.equal(parseJournal(after).length, 2);
});

test('an existing journal lock rejects mutation without changing the journal', async () => {
  const fixture = await temporaryFeature();
  const initialized = await initializeFeature({
    ...fixture,
    actor,
    eventId: 'evt-initial',
  });
  const before = await readFile(resolve(fixture.featureHome, JOURNAL_FILE), 'utf8');
  const lock = await open(resolve(fixture.featureHome, JOURNAL_LOCK_FILE), 'wx');
  await lock.close();
  const event = createEvent({
    sequence: 2,
    featureId: fixture.featureId,
    type: 'DESIGN_APPROVED',
    modelHash: initialized.modelLock.modelHash,
    actor: { kind: 'human-confirmed', label: 'user' },
    eventId: 'evt-locked',
  });

  await assert.rejects(appendEvent(fixture.featureHome, event), /journal is locked/i);
  assert.equal(await readFile(resolve(fixture.featureHome, JOURNAL_FILE), 'utf8'), before);
});

test('journal parsing and core compatibility fail closed', async () => {
  const fixture = await temporaryFeature();
  await initializeFeature({ ...fixture, actor, eventId: 'evt-initial' });
  const journalPath = resolve(fixture.featureHome, JOURNAL_FILE);
  const event = JSON.parse((await readFile(journalPath, 'utf8')).trim());
  await writeFile(journalPath, `${JSON.stringify({ ...event, sequence: 2 })}\n`);
  await assert.rejects(readFeatureRecord(fixture.featureHome), /expected 1/);

  assert.throws(
    () => assertVersionCompatible('2.0.0', { minimum: '1.0.0', maximumExclusive: '2.0.0' }),
    /outside the model compatibility range/
  );
});

test('model migration requires confirmation, reports impact, and preserves history', async () => {
  const fixture = await temporaryFeature();
  await initializeFeature({ ...fixture, actor, eventId: 'evt-initial' });
  const nextModel = structuredClone(await loadDefaultModel());
  nextModel.modelVersion = '1.0.1';

  const journalPath = resolve(fixture.featureHome, JOURNAL_FILE);
  const beforePreview = await readFile(journalPath, 'utf8');
  const preview = await previewFeatureModelMigration({
    featureHome: fixture.featureHome,
    nextModel,
    preparedAt: '2026-08-25T01:30:00Z',
  });
  assert.equal(preview.confirmationRequired, true);
  assert.equal(preview.impact.toModelVersion, '1.0.1');
  assert.equal(await readFile(journalPath, 'utf8'), beforePreview);

  await assert.rejects(
    migrateFeatureModel({
      featureHome: fixture.featureHome,
      nextModel,
      confirmedBy: actor,
      eventId: 'evt-migration-rejected',
    }),
    /requires a recorded human confirmation/
  );

  const migrated = await migrateFeatureModel({
    featureHome: fixture.featureHome,
    nextModel,
    confirmedBy: { kind: 'human-confirmed', label: 'user approved impact report' },
    recordedAt: '2026-08-25T02:00:00Z',
    eventId: 'evt-migration',
  });
  assert.equal(migrated.modelLock.modelVersion, '1.0.1');
  assert.notEqual(migrated.impact.fromModelHash, migrated.impact.toModelHash);
  assert.equal(migrated.events.at(-1).type, 'MODEL_MIGRATED');
  assert.equal((await discoverFeatureMode(fixture.featureHome)).mode, 'governed');
  assert.equal((await readFeatureRecord(fixture.featureHome)).events.length, 2);
});

test('model migration validates replay before writing durable state', async () => {
  const fixture = await temporaryFeature('invalid-migration-candidate');
  const initialized = await initializeFeature({ ...fixture, actor, eventId: 'evt-initial' });
  await appendEvent(fixture.featureHome, createEvent({
    sequence: 2,
    featureId: fixture.featureId,
    type: 'SPEC_VALIDATED',
    modelHash: initialized.modelLock.modelHash,
    actor,
    payload: {},
    eventId: 'evt-invalid-spec-passage',
  }));
  const journalPath = resolve(fixture.featureHome, JOURNAL_FILE);
  const lockPath = resolve(fixture.featureHome, MODEL_LOCK_FILE);
  const markerPath = resolve(fixture.featureHome, MIGRATION_MARKER_FILE);
  const beforeJournal = await readFile(journalPath, 'utf8');
  const beforeLock = await readFile(lockPath, 'utf8');
  const nextModel = structuredClone(initialized.modelLock.model);
  nextModel.modelVersion = '1.0.1';

  await assert.rejects(migrateFeatureModel({
    featureHome: fixture.featureHome,
    nextModel,
    confirmedBy: { kind: 'human-confirmed', label: 'user' },
    eventId: 'evt-invalid-candidate-migration',
  }), /cannot apply|cannot transition|must record passage/);
  assert.equal(await readFile(journalPath, 'utf8'), beforeJournal);
  assert.equal(await readFile(lockPath, 'utf8'), beforeLock);
  await assert.rejects(readFile(markerPath, 'utf8'), /ENOENT/);
});

test('pending model migration fails closed and can deterministically roll forward', async () => {
  const fixture = await temporaryFeature('recover-migration');
  const initialized = await initializeFeature({
    ...fixture,
    actor,
    eventId: 'evt-initial',
    recordedAt: '2026-08-25T01:00:00Z',
  });
  const nextModel = structuredClone(await loadDefaultModel());
  nextModel.modelVersion = '1.0.1';
  const nextLock = createModelLock(nextModel, {
    createdAt: '2026-08-25T02:00:00Z',
  });
  const migrationEvent = createEvent({
    sequence: 2,
    featureId: fixture.featureId,
    type: 'MODEL_MIGRATED',
    modelHash: nextLock.modelHash,
    actor: { kind: 'human-confirmed', label: 'user' },
    payload: {
      fromModelHash: initialized.modelLock.modelHash,
      toModelHash: nextLock.modelHash,
    },
    recordedAt: '2026-08-25T02:00:00Z',
    eventId: 'evt-recovery-migration',
  });
  const marker = {
    schemaVersion: 1,
    createdAt: '2026-08-25T02:00:00Z',
    fromModelHash: initialized.modelLock.modelHash,
    toModelHash: nextLock.modelHash,
    nextLock,
    migrationEvent,
  };
  await writeFile(
    resolve(fixture.featureHome, MIGRATION_MARKER_FILE),
    stableJson(marker)
  );
  await writeFile(
    resolve(fixture.featureHome, MODEL_LOCK_FILE),
    stableJson(nextLock)
  );

  assert.equal((await discoverFeatureMode(fixture.featureHome)).mode, 'inconsistent');
  await assert.rejects(readFeatureRecord(fixture.featureHome), /model migration pending/);

  const recovered = await recoverPendingModelMigration(fixture.featureHome);
  assert.equal(recovered.modelLock.modelHash, nextLock.modelHash);
  assert.equal(recovered.events.at(-1).eventId, 'evt-recovery-migration');
  assert.equal((await discoverFeatureMode(fixture.featureHome)).mode, 'governed');
});

test('pending migration recovery validates replay before rolling forward', async () => {
  const fixture = await temporaryFeature('invalid-recovery-migration');
  const initialized = await initializeFeature({
    ...fixture,
    actor,
    eventId: 'evt-initial',
    recordedAt: '2026-08-25T01:00:00Z',
  });
  const nextModel = structuredClone(initialized.modelLock.model);
  nextModel.modelVersion = '1.0.1';
  const nextLock = createModelLock(nextModel, { createdAt: '2026-08-25T02:00:00Z' });
  const migrationEvent = createEvent({
    sequence: 2,
    featureId: fixture.featureId,
    type: 'MODEL_MIGRATED',
    modelHash: nextLock.modelHash,
    actor,
    payload: {
      fromModelHash: initialized.modelLock.modelHash,
      toModelHash: nextLock.modelHash,
      previousBoundary: { moduleGraph: structuredClone(initialized.modelLock.model.moduleGraph) },
    },
    recordedAt: '2026-08-25T02:00:00Z',
    eventId: 'evt-invalid-recovery-migration',
  });
  const markerPath = resolve(fixture.featureHome, MIGRATION_MARKER_FILE);
  const journalPath = resolve(fixture.featureHome, JOURNAL_FILE);
  const lockPath = resolve(fixture.featureHome, MODEL_LOCK_FILE);
  await writeFile(markerPath, stableJson({
    schemaVersion: 1,
    createdAt: '2026-08-25T02:00:00Z',
    fromModelHash: initialized.modelLock.modelHash,
    toModelHash: nextLock.modelHash,
    nextLock,
    migrationEvent,
  }));
  const beforeMarker = await readFile(markerPath, 'utf8');
  const beforeJournal = await readFile(journalPath, 'utf8');
  const beforeLock = await readFile(lockPath, 'utf8');

  await assert.rejects(
    recoverPendingModelMigration(fixture.featureHome),
    /does not satisfy human-confirmation/,
  );
  assert.equal(await readFile(markerPath, 'utf8'), beforeMarker);
  assert.equal(await readFile(journalPath, 'utf8'), beforeJournal);
  assert.equal(await readFile(lockPath, 'utf8'), beforeLock);
  assert.equal((await discoverFeatureMode(fixture.featureHome)).mode, 'inconsistent');
});
