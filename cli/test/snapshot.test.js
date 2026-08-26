import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  createModelLock,
  initializeFeature,
  loadDefaultModel,
  proposeSlice,
  readDetail,
  recordFeatureTransition,
  recordSliceTransition,
  snapshot,
  stableJson,
  validateDetail,
  validateSnapshot,
} from '../../plugin-src/shared/resources/protocol/index.js';
import { executePluginRequest } from '../../plugin-src/shared/resources/protocol/plugin-adapter.js';

const execFileAsync = promisify(execFile);
const executable = resolve(import.meta.dirname, '../bin/workflow.js');
const agent = { kind: 'agent', label: 'snapshot-agent' };
const human = { kind: 'human-confirmed', label: 'snapshot-user' };

async function featureFixture(featureId = 'snapshot-feature') {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve snapshot '));
  const featureHome = resolve(root, 'docs/issues', featureId);
  await initializeFeature({
    featureHome,
    featureId,
    actor: agent,
    eventId: 'evt-init',
    recordedAt: '2026-08-26T00:00:00Z',
  });
  return { root, featureHome };
}

async function completeInterview(featureHome) {
  const path = resolve(featureHome, 'interview.md');
  const content = await readFile(path, 'utf8');
  await writeFile(path, content.replace('**Status:** active', '**Status:** complete'));
  await writeFile(
    resolve(featureHome, 'design.md'),
    '# Design - snapshot-feature\n\n**Status:** approved (gate passed 2026-08-26)\n'
  );
}

async function cli(args) {
  const result = await execFileAsync(process.execPath, [executable, ...args]);
  return JSON.parse(result.stdout);
}

test('snapshot distinguishes blocked, available, and ready actions from current evidence', async () => {
  const fixture = await featureFixture();
  const journalPath = resolve(fixture.featureHome, 'events.jsonl');
  const before = await readFile(journalPath, 'utf8');

  const blocked = await snapshot(fixture.featureHome);
  assert.equal(validateSnapshot(blocked.data), blocked.data);
  assert.equal(blocked.data.actions[0].command, 'feature approve-design');
  assert.equal(blocked.data.actions[0].readiness, 'blocked');
  assert.deepEqual(
    blocked.data.actions[0].blockers.map((item) => item.id),
    ['design.interview.complete', 'design.artifact.present']
  );
  assert.deepEqual(blocked.data.actions[0].inputs.map((item) => item.id), [
    'humanConfirmation',
  ]);
  assert.match(blocked.data.actions[0].copyCommand, /--human-confirmed/);
  assert.equal(blocked.data.artifacts.find((item) => item.id === 'design').status, 'pending');

  await completeInterview(fixture.featureHome);
  const ready = await snapshot(fixture.featureHome);
  assert.equal(ready.data.actions[0].readiness, 'ready');
  assert.equal(ready.data.milestones.find((item) => item.id === 'design.interview').status, 'complete');
  assert.equal(await readFile(journalPath, 'utf8'), before);

  await recordFeatureTransition(fixture.featureHome, 'approve-design', {
    actor: human,
    eventId: 'evt-design',
  });
  await writeFile(resolve(fixture.featureHome, 'spec.md'), '# Spec\n');
  const afterTransition = await readFile(journalPath, 'utf8');
  const available = await snapshot(fixture.featureHome);
  assert.equal(available.data.actions[0].command, 'feature validate-spec');
  assert.equal(available.data.actions[0].readiness, 'available');
  assert.equal(available.data.actions[0].blockers[0].id, 'spec.validation.current');

  const failed = await snapshot(fixture.featureHome, {
    facts: { specValidationCurrent: false },
  });
  assert.equal(failed.data.actions[0].readiness, 'blocked');
  const validated = await snapshot(fixture.featureHome, {
    facts: {
      specValidationCurrent: {
        passed: true,
        evidence: { provider: 'python', result: 'PASS' },
      },
    },
  });
  assert.equal(validated.data.actions[0].readiness, 'ready');
  assert.equal(await readFile(journalPath, 'utf8'), afterTransition);
});

test('snapshot reports source and governance facts without collapsing ordinary activity', async () => {
  const fixture = await featureFixture();
  const result = await snapshot(fixture.featureHome, {
    sources: {
      git: { status: 'current', detail: 'cleanly inspected' },
      github: { status: 'unavailable', detail: 'offline' },
    },
    facts: {
      worktree: { sourceDirty: true, journalDirty: true, modelDirty: true },
      artifacts: { interview: { status: 'changed', evidence: { source: 'git' } } },
    },
  });

  assert.equal(result.data.sources.local.status, 'current');
  assert.equal(result.data.sources.git.status, 'current');
  assert.equal(result.data.sources.github.status, 'unavailable');
  assert.deepEqual(
    result.data.warnings.map((item) => [item.type, item.severity]),
    [
      ['journal-uncommitted', 'warning'],
      ['model-uncommitted', 'warning'],
      ['source-uncommitted', 'activity'],
    ]
  );
  assert.equal(result.data.artifacts.find((item) => item.id === 'interview').status, 'changed');
});

test('named reads are schema-valid, allow-listed, and preserve full event and model detail', async () => {
  const fixture = await featureFixture();
  await completeInterview(fixture.featureHome);

  const artifact = await readDetail(fixture.featureHome, 'artifact', 'design');
  assert.equal(validateDetail(artifact.data), artifact.data);
  assert.match(artifact.data.data.content, /^# Design/m);
  assert.equal(artifact.data.data.artifact.format, 'markdown');

  const events = await readDetail(fixture.featureHome, 'events');
  assert.equal(events.data.data.events.length, 1);
  assert.equal(events.data.data.events[0].payload.featureState, 'DESIGNING');

  const event = await readDetail(fixture.featureHome, 'events', 'evt-init');
  assert.equal(event.data.data.events[0].eventId, 'evt-init');

  const model = await readDetail(fixture.featureHome, 'model');
  assert.equal(model.data.data.lock.modelId, 'gatereeve/workflow');
  assert.equal(model.data.data.graph.kind, 'model');

  await assert.rejects(
    readDetail(fixture.featureHome, 'artifact', '../events.jsonl'),
    /Unknown artifact ID/
  );
  await assert.rejects(
    readDetail(fixture.featureHome, 'attempt', 'missing-attempt'),
    /Unknown boundary attempt/
  );

  const outside = resolve(fixture.root, 'outside.md');
  const designPath = resolve(fixture.featureHome, 'design.md');
  await writeFile(outside, '# outside\n');
  await rm(designPath);
  await symlink(outside, designPath);
  await assert.rejects(
    readDetail(fixture.featureHome, 'artifact', 'design'),
    /outside the feature record/
  );
});

test('boundary snapshots inventory pinned gates and expose attempt detail by ID', async () => {
  const fixture = await featureFixture('boundary-snapshot');
  await completeInterview(fixture.featureHome);
  await recordFeatureTransition(fixture.featureHome, 'approve-design', {
    actor: human,
    eventId: 'evt-design',
  });
  await recordFeatureTransition(fixture.featureHome, 'validate-spec', {
    actor: agent,
    facts: { specValidationCurrent: true },
    eventId: 'evt-spec',
  });
  await recordFeatureTransition(fixture.featureHome, 'authorize-plan', {
    actor: human,
    eventId: 'evt-plan',
  });
  await proposeSlice(fixture.featureHome, {
    sliceId: 'slice-1',
    actor: agent,
    eventId: 'evt-propose',
  });
  await recordSliceTransition(fixture.featureHome, 'plan-slice', 'slice-1', {
    actor: agent,
    eventId: 'evt-slice-plan',
  });
  await recordSliceTransition(fixture.featureHome, 'start-slice', 'slice-1', {
    actor: agent,
    facts: { sliceReadinessCurrent: true },
    eventId: 'evt-start',
  });
  const packet = resolve(fixture.featureHome, 'pr-1');
  await mkdir(packet);
  await writeFile(resolve(packet, 'boundary.json'), '{"schemaVersion":1}\n');
  await writeFile(
    resolve(packet, 'explain-diff.html'),
    '<!doctype html><button onclick="window.exampleRan=true">Explain</button>\n'
  );
  await recordSliceTransition(fixture.featureHome, 'begin-boundary', 'slice-1', {
    actor: agent,
    payload: {
      attemptId: 'attempt-1',
      scope: 'SLICE',
      context: { packetPath: packet },
    },
    eventId: 'evt-boundary',
  });

  const observed = await snapshot(fixture.featureHome);
  const gateArtifacts = observed.data.artifacts.filter(
    (item) => item.context.kind === 'gate'
  );
  assert.equal(gateArtifacts.length, 10);
  assert.equal(
    gateArtifacts.find((item) => item.context.gateId === 'pinContext').status,
    'present'
  );
  assert.equal(
    gateArtifacts.find((item) => item.context.gateId === 'verification').status,
    'pending'
  );
  const manifest = await readDetail(
    fixture.featureHome,
    'artifact',
    'attempt:attempt-1:gate:pinContext'
  );
  assert.deepEqual(manifest.data.data.structured, { schemaVersion: 1 });
  const explain = await readDetail(
    fixture.featureHome,
    'artifact',
    'attempt:attempt-1:gate:explainDiff'
  );
  assert.match(explain.data.data.content, /onclick="window\.exampleRan=true"/);
  assert.equal(explain.data.data.structured, null);

  const detail = await readDetail(fixture.featureHome, 'attempt', 'attempt-1');
  assert.equal(detail.data.data.attempt.id, 'attempt-1');
  assert.equal(detail.data.data.attempt.gates.length, 10);
});

test('snapshot exposes missing, legacy, inconsistent, and incompatible modes read-only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve snapshot modes '));
  const missing = await snapshot(resolve(root, 'docs/issues/missing'));
  assert.equal(missing.data.mode, 'missing');

  const legacyHome = resolve(root, 'docs/issues/legacy');
  await mkdir(legacyHome, { recursive: true });
  await writeFile(resolve(legacyHome, 'interview.md'), '# legacy\n');
  const legacy = await snapshot(legacyHome);
  assert.equal(legacy.data.mode, 'legacy');

  const inconsistentHome = resolve(root, 'docs/issues/inconsistent');
  await mkdir(inconsistentHome, { recursive: true });
  await writeFile(resolve(inconsistentHome, 'events.jsonl'), '{}\n');
  const inconsistent = await snapshot(inconsistentHome);
  assert.equal(inconsistent.data.mode, 'inconsistent');

  const fixture = await featureFixture('incompatible-feature');
  const nextModel = structuredClone(await loadDefaultModel());
  nextModel.coreCompatibility = { minimum: '2.0.0', maximumExclusive: '3.0.0' };
  const lock = createModelLock(nextModel, {
    createdAt: '2026-08-26T00:00:00Z',
    coreVersion: '2.0.0',
  });
  await writeFile(resolve(fixture.featureHome, 'workflow-model.lock.json'), stableJson(lock));
  const incompatible = await snapshot(fixture.featureHome);
  assert.equal(incompatible.data.mode, 'incompatible');
  assert.match(incompatible.data.blockers[0].reason, /outside the model compatibility range/);
});

test('Commander and plugin adapter return the same canonical snapshot and named read', async () => {
  const fixture = await featureFixture('parity-snapshot');
  await completeInterview(fixture.featureHome);
  const journal = resolve(fixture.featureHome, 'events.jsonl');
  const before = await readFile(journal, 'utf8');

  const pluginSnapshot = await executePluginRequest({
    operation: 'snapshot',
    featureHome: fixture.featureHome,
  });
  const cliSnapshot = await cli([
    'snapshot', '--feature-home', fixture.featureHome, '--json',
  ]);
  assert.deepEqual(cliSnapshot.data, pluginSnapshot.data);

  const pluginRead = await executePluginRequest({
    operation: 'read',
    kind: 'artifact',
    id: 'design',
    featureHome: fixture.featureHome,
  });
  const cliRead = await cli([
    'read', 'artifact', 'design', '--feature-home', fixture.featureHome, '--json',
  ]);
  assert.deepEqual(cliRead.data, pluginRead.data);
  assert.equal(await readFile(journal, 'utf8'), before);
});

test('snapshot validators reject malformed readiness and detail contracts', () => {
  assert.throws(
    () => validateSnapshot({ schemaVersion: 1, mode: 'governed' }),
    /Snapshot protocol must be an object/
  );
  assert.throws(
    () => validateDetail({ schemaVersion: 1, kind: 'path', data: {} }),
    /invalid value/
  );
  assert.throws(
    () => validateDetail({
      schemaVersion: 1,
      kind: 'artifact',
      featureId: 'feature',
      id: 'design',
      data: null,
    }),
    /Detail result data must be an object/
  );
});

test('snapshot validators reject malformed nested contracts', async () => {
  const fixture = await featureFixture('validation-fixture');
  const observed = await snapshot(fixture.featureHome);

  const withoutEvents = structuredClone(observed.data);
  withoutEvents.events = null;
  assert.throws(() => validateSnapshot(withoutEvents), /Snapshot events must be an object/);

  const mismatchedEligibility = structuredClone(observed.data);
  mismatchedEligibility.actions[0].eligible = !mismatchedEligibility.actions[0].eligible;
  assert.throws(
    () => validateSnapshot(mismatchedEligibility),
    /eligible must be true exactly when readiness is ready/
  );

  const malformedArtifact = structuredClone(observed.data);
  malformedArtifact.artifacts[0].exists = 'yes';
  assert.throws(
    () => validateSnapshot(malformedArtifact),
    /artifacts\[0\]\.exists must be boolean/
  );

  const model = await readDetail(fixture.featureHome, 'model');
  const malformedModel = structuredClone(model.data);
  malformedModel.data.graph.nodes = null;
  assert.throws(
    () => validateDetail(malformedModel),
    /Detail result data\.graph\.nodes must be an array/
  );
});
