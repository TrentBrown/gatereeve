import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  acceptHumanReview,
  completeFinalizedFeature,
  createDefaultWorkflowPolicy,
  fingerprint,
  hashModuleDefinition,
  initializeFeature,
  invalidateFinalizationModules,
  loadDefaultModel,
  migrateFeatureModel,
  pauseFeature,
  projectRecord,
  proposeSlice,
  readFeatureRecord,
  recordFeatureTransition,
  recordFinalizationOutcome,
  recordFinalizationWaiver,
  recordGateOutcome,
  recordSliceTransition,
  requestBoundaryHumanReview,
  resolveModuleGraph,
  serializeJournal,
  startFeatureFinalization,
} from '../../plugin-src/shared/resources/protocol/index.js';

const agent = { kind: 'agent', label: 'test-agent' };
const human = { kind: 'human-confirmed', label: 'test-user' };
const mergeInputSha = 'a'.repeat(40);

function moduleDefinition(value) {
  const definition = { ...value, digest: `sha256:${'0'.repeat(64)}` };
  definition.digest = hashModuleDefinition(definition);
  return definition;
}

async function modelWithFinalization() {
  const base = await loadDefaultModel();
  const prepare = moduleDefinition({
    schemaVersion: 1,
    id: 'example/prepare',
    version: '1.0.0',
    label: 'Prepare',
    description: 'Prepare final evidence.',
    slot: 'feature.finalization',
    dependsOn: [],
    disposition: 'required',
    locked: false,
    enabledByDefault: true,
    waiverAllowed: false,
    evidence: { kind: 'reference', requiredFor: ['PASS', 'FAIL'] },
    fingerprint: { kind: 'feature-finalization-v1', dependencyBinding: 'event-ids' },
    run: { kind: 'manual', instructions: 'Confirm preparation.' },
  });
  const release = moduleDefinition({
    schemaVersion: 1,
    id: 'example/release',
    version: '1.0.0',
    label: 'Release',
    description: 'Verify the release.',
    slot: 'feature.finalization',
    dependsOn: ['example/prepare'],
    disposition: 'required',
    locked: false,
    enabledByDefault: true,
    waiverAllowed: true,
    evidence: { kind: 'reference', requiredFor: ['PASS', 'FAIL'] },
    fingerprint: { kind: 'feature-finalization-v1', dependencyBinding: 'event-ids' },
    observe: { providerId: 'example/release-observer', version: '1.0.0' },
  });
  const definitions = [...base.moduleGraph.modules, prepare, release];
  const policy = createDefaultWorkflowPolicy(definitions);
  policy.modules.find((item) => item.id === 'gatereeve/release').enabled = false;
  const graph = resolveModuleGraph({ definitions, policy });
  return {
    ...base,
    moduleGraph: {
      schemaVersion: graph.schemaVersion,
      policyDigest: graph.policyDigest,
      modules: graph.modules,
      enabledModuleIds: graph.enabledModuleIds,
    },
  };
}

async function modelWithoutFinalization() {
  const base = await loadDefaultModel();
  const policy = createDefaultWorkflowPolicy(base.moduleGraph.modules);
  policy.modules.find((item) => item.id === 'gatereeve/release').enabled = false;
  const graph = resolveModuleGraph({ definitions: base.moduleGraph.modules, policy });
  return {
    ...base,
    moduleGraph: {
      schemaVersion: graph.schemaVersion,
      policyDigest: graph.policyDigest,
      modules: graph.modules,
      enabledModuleIds: graph.enabledModuleIds,
    },
  };
}

async function finalizingFeature(model = null) {
  const root = await mkdtemp(resolve(tmpdir(), 'gatereeve finalization '));
  const featureHome = resolve(root, 'docs/issues/finalization');
  await initializeFeature({
    featureHome,
    featureId: 'finalization',
    model: model ?? await modelWithFinalization(),
    actor: agent,
    eventId: 'evt-init',
  });
  await recordFeatureTransition(featureHome, 'approve-design', { actor: human, eventId: 'evt-design' });
  await recordFeatureTransition(featureHome, 'validate-spec', {
    actor: agent, facts: { specValidationCurrent: true }, eventId: 'evt-spec',
  });
  await recordFeatureTransition(featureHome, 'authorize-plan', { actor: human, eventId: 'evt-plan' });
  await proposeSlice(featureHome, {
    sliceId: 'final-slice', scope: 'FEATURE_FINAL', actor: agent, eventId: 'evt-propose',
  });
  await recordSliceTransition(featureHome, 'plan-slice', 'final-slice', { actor: agent, eventId: 'evt-slice-plan' });
  await recordSliceTransition(featureHome, 'start-slice', 'final-slice', {
    actor: agent, facts: { sliceReadinessCurrent: true }, eventId: 'evt-start',
  });
  await recordSliceTransition(featureHome, 'begin-boundary', 'final-slice', {
    actor: agent,
    payload: { attemptId: 'boundary-1', scope: 'FEATURE_FINAL' },
    eventId: 'evt-boundary',
  });
  const currentFingerprints = {};
  const attempt = projectRecord(await readFeatureRecord(featureHome)).boundaryAttempts.at(-1);
  for (const gate of attempt.gates) {
    const notApplicable = gate.optional;
    const result = await recordGateOutcome(featureHome, {
      attemptId: attempt.id,
      gateId: gate.id,
      outcome: notApplicable ? 'NOT_APPLICABLE' : 'PASS',
      inputs: { gateId: gate.id },
      currentFingerprints,
      evidence: notApplicable ? null : { path: `${gate.id}.md`, hash: fingerprint(gate.id) },
      reason: notApplicable ? 'Not configured in fixture' : null,
      actor: agent,
      eventId: `evt-gate-${gate.id}`,
    });
    currentFingerprints[gate.id] = result.inputFingerprint;
  }
  await requestBoundaryHumanReview(featureHome, {
    attemptId: attempt.id, currentFingerprints, actor: agent, eventId: 'evt-review-request',
  });
  await acceptHumanReview(featureHome, 'final-slice', { actor: human, eventId: 'evt-review-accepted' });
  await recordSliceTransition(featureHome, 'record-merge', 'final-slice', {
    actor: agent,
    facts: { reviewedContentMerged: true },
    currentFingerprints,
    payload: { featureFinal: true, integrationSha: mergeInputSha },
    eventId: 'evt-merge',
  });
  return featureHome;
}

test('required finalization modules bind merge input, dependencies, waivers, and completion', async () => {
  const featureHome = await finalizingFeature();
  const started = await startFeatureFinalization(featureHome, {
    attemptId: 'finalization-1', mergeInputSha, actor: agent, eventId: 'evt-finalization-start',
  });
  assert.equal(started.projection.feature.state, 'FINALIZING');
  assert.deepEqual(started.projection.finalizationAttempts[0].modules.map((item) => item.id), [
    'example/prepare', 'example/release',
  ]);
  await assert.rejects(
    completeFinalizedFeature(featureHome, { attemptId: 'finalization-1', actor: agent }),
    /not current and nonblocking/,
  );
  const beforeForgedCompletion = (await readFeatureRecord(featureHome)).events.length;
  await assert.rejects(
    recordFeatureTransition(featureHome, 'complete-feature', {
      actor: agent, facts: { featureCloseoutCurrent: true }, eventId: 'evt-forged-complete',
    }),
    /not eligible/,
  );
  assert.equal((await readFeatureRecord(featureHome)).events.length, beforeForgedCompletion);
  await assert.rejects(
    recordFinalizationOutcome(featureHome, {
      attemptId: 'finalization-1', moduleId: 'example/release', outcome: 'PASS',
      evidence: { path: 'release.json', hash: fingerprint('release') }, actor: agent,
    }),
    /not eligible/,
  );
  await recordFinalizationOutcome(featureHome, {
    attemptId: 'finalization-1', moduleId: 'example/prepare', outcome: 'PASS',
    evidence: { path: 'prepare.json', hash: fingerprint('prepare') }, actor: agent,
    eventId: 'evt-prepare-pass',
  });
  await recordFinalizationWaiver(featureHome, {
    attemptId: 'finalization-1', moduleId: 'example/release',
    reason: 'Release is intentionally deferred for this feature.', actor: human,
    eventId: 'evt-release-waive-1',
  });
  let projection = projectRecord(await readFeatureRecord(featureHome));
  assert.equal(projection.finalizationAttempts[0].requiredCurrentAndNonblocking, true);
  await invalidateFinalizationModules(featureHome, {
    attemptId: 'finalization-1', moduleIds: ['example/release'], reason: 'evidence changed',
    actor: agent, eventId: 'evt-release-invalidate',
  });
  projection = projectRecord(await readFeatureRecord(featureHome));
  assert.equal(projection.finalizationAttempts[0].modules[1].freshness, 'STALE');
  assert.equal(projection.finalizationAttempts[0].requiredCurrentAndNonblocking, false);
  await recordFinalizationWaiver(featureHome, {
    attemptId: 'finalization-1', moduleId: 'example/release',
    reason: 'Renewed risk acceptance after changed evidence.', actor: human,
    eventId: 'evt-release-waive-2',
  });
  const completed = await completeFinalizedFeature(featureHome, {
    attemptId: 'finalization-1', actor: agent, eventId: 'evt-complete',
  });
  assert.equal(completed.projection.feature.state, 'COMPLETE');
  assert.equal(completed.projection.finalizationAttempts[0].state, 'COMPLETE');
});

test('required finalization modules reject N/A and stale merge inputs cannot share attempts', async () => {
  const featureHome = await finalizingFeature();
  await assert.rejects(
    startFeatureFinalization(featureHome, {
      attemptId: 'wrong-input', mergeInputSha: 'b'.repeat(40), actor: agent,
    }),
    /must match the recorded feature-final merge/,
  );
  await assert.rejects(
    startFeatureFinalization(featureHome, {
      attemptId: 'boundary-1', mergeInputSha, actor: agent,
    }),
    /Duplicate finalization attempt/,
  );
  await startFeatureFinalization(featureHome, {
    attemptId: 'finalization-1', mergeInputSha, actor: agent, eventId: 'evt-finalization-start',
  });
  await assert.rejects(
    recordFinalizationOutcome(featureHome, {
      attemptId: 'finalization-1', moduleId: 'example/prepare', outcome: 'NOT_APPLICABLE',
      reason: 'not needed', evidence: null, actor: agent,
    }),
    /cannot be marked not applicable/,
  );
  await assert.rejects(
    startFeatureFinalization(featureHome, {
      attemptId: 'finalization-2', mergeInputSha: 'b'.repeat(40), actor: agent,
    }),
    /already active/,
  );
});

test('finalization replay rejects forged waivers and missing required evidence', async () => {
  const forgedWaiverHome = await finalizingFeature();
  await startFeatureFinalization(forgedWaiverHome, {
    attemptId: 'finalization-forged', mergeInputSha, actor: agent, eventId: 'evt-forged-start',
  });
  await recordFinalizationOutcome(forgedWaiverHome, {
    attemptId: 'finalization-forged', moduleId: 'example/prepare', outcome: 'PASS',
    evidence: { path: 'prepare.json', hash: fingerprint('prepare') }, actor: agent,
    eventId: 'evt-forged-prepare',
  });
  await recordFinalizationWaiver(forgedWaiverHome, {
    attemptId: 'finalization-forged', moduleId: 'example/release', reason: 'fixture',
    actor: human, eventId: 'evt-forged-waiver',
  });
  let record = await readFeatureRecord(forgedWaiverHome);
  record.events.at(-1).type = 'FEATURE_FINALIZATION_OUTCOME_RECORDED';
  record.events.at(-1).actor = agent;
  await writeFile(resolve(forgedWaiverHome, 'events.jsonl'), serializeJournal(record.events));
  await assert.rejects(
    async () => projectRecord(await readFeatureRecord(forgedWaiverHome)),
    /cannot record a waiver as an ordinary outcome/,
  );

  const missingEvidenceHome = await finalizingFeature();
  await startFeatureFinalization(missingEvidenceHome, {
    attemptId: 'finalization-evidence', mergeInputSha, actor: agent, eventId: 'evt-evidence-start',
  });
  await recordFinalizationOutcome(missingEvidenceHome, {
    attemptId: 'finalization-evidence', moduleId: 'example/prepare', outcome: 'PASS',
    evidence: { path: 'prepare.json', hash: fingerprint('prepare') }, actor: agent,
    eventId: 'evt-evidence-pass',
  });
  record = await readFeatureRecord(missingEvidenceHome);
  record.events.at(-1).payload.evidence = null;
  await writeFile(resolve(missingEvidenceHome, 'events.jsonl'), serializeJournal(record.events));
  await assert.rejects(
    async () => projectRecord(await readFeatureRecord(missingEvidenceHome)),
    /evidence must be an object/i,
  );
});

test('active finalization survives model migration as stale and pause blocks mutation', async () => {
  const featureHome = await finalizingFeature();
  await startFeatureFinalization(featureHome, {
    attemptId: 'finalization-migration', mergeInputSha, actor: agent, eventId: 'evt-migration-start',
  });
  const current = await readFeatureRecord(featureHome);
  await migrateFeatureModel({
    featureHome,
    nextModel: { ...current.modelLock.model, modelVersion: '1.2.1' },
    confirmedBy: human,
    eventId: 'evt-model-migrated',
  });
  let projection = projectRecord(await readFeatureRecord(featureHome));
  assert.equal(projection.finalizationAttempts[0].modules.length, 2);
  assert.equal(projection.finalizationAttempts[0].requiredCurrentAndNonblocking, false);

  const pausedHome = await finalizingFeature();
  await startFeatureFinalization(pausedHome, {
    attemptId: 'finalization-paused', mergeInputSha, actor: agent, eventId: 'evt-pause-start',
  });
  await pauseFeature(pausedHome, { actor: agent, reason: 'fixture', eventId: 'evt-paused' });
  projection = projectRecord(await readFeatureRecord(pausedHome));
  assert.equal(projection.finalizationAttempts[0].modules[0].eligible, false);
  await assert.rejects(recordFinalizationOutcome(pausedHome, {
    attemptId: 'finalization-paused', moduleId: 'example/prepare', outcome: 'PASS',
    evidence: { path: 'prepare.json', hash: fingerprint('prepare') }, actor: agent,
  }), /while paused/);
});

test('zero-module models complete without creating a finalization attempt', async () => {
  const featureHome = await finalizingFeature(await modelWithoutFinalization());
  const completed = await completeFinalizedFeature(featureHome, {
    attemptId: null, actor: agent, eventId: 'evt-zero-module-complete',
  });
  assert.equal(completed.projection.feature.state, 'COMPLETE');
  assert.equal(completed.projection.finalizationAttempts.length, 0);
});

test('finalization dependency evidence is canonical across manifest key order', async () => {
  const base = await loadDefaultModel();
  const definition = (id, dependsOn = []) => moduleDefinition({
    schemaVersion: 1,
    id,
    version: '1.0.0',
    label: id,
    description: 'Canonical dependency fixture.',
    slot: 'feature.finalization',
    dependsOn,
    disposition: 'required',
    locked: false,
    enabledByDefault: true,
    waiverAllowed: false,
    evidence: { kind: 'reference', requiredFor: ['PASS', 'FAIL'] },
    fingerprint: { kind: 'feature-finalization-v1', dependencyBinding: 'event-ids' },
    run: { kind: 'manual', instructions: 'Confirm.' },
  });
  const definitions = [
    ...base.moduleGraph.modules,
    definition('example/z'),
    definition('example/a'),
    definition('example/join', ['example/z', 'example/a']),
  ];
  const policy = createDefaultWorkflowPolicy(definitions);
  policy.modules.find((item) => item.id === 'gatereeve/release').enabled = false;
  const graph = resolveModuleGraph({ definitions, policy });
  const featureHome = await finalizingFeature({
    ...base,
    moduleGraph: {
      schemaVersion: graph.schemaVersion,
      policyDigest: graph.policyDigest,
      modules: graph.modules,
      enabledModuleIds: graph.enabledModuleIds,
    },
  });
  await startFeatureFinalization(featureHome, {
    attemptId: 'ordered-dependencies', mergeInputSha, actor: agent, eventId: 'evt-order-start',
  });
  for (const moduleId of ['example/z', 'example/a', 'example/join']) {
    await recordFinalizationOutcome(featureHome, {
      attemptId: 'ordered-dependencies', moduleId, outcome: 'PASS',
      evidence: { path: `${moduleId}.json`, hash: fingerprint(moduleId) },
      actor: agent, eventId: `evt-order-${moduleId.replace('/', '-')}`,
    });
  }
  const projection = projectRecord(await readFeatureRecord(featureHome));
  assert.equal(projection.finalizationAttempts[0].modules.at(-1).freshness, 'CURRENT');
});
