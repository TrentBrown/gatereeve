import { loadHistoricalModel } from './historical-model.js';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import {
  acceptHumanReview,
  completeFinalizedFeature,
  createDefaultWorkflowPolicy,
  fingerprint,
  hashModuleDefinition,
  initializeFeature,
  invalidateFinalizationModules,
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
} from '../../../plugin-src/shared/resources/protocol/index.js';

const agent = { kind: 'agent', label: 'test-agent' };
const human = { kind: 'human-confirmed', label: 'test-user' };
const mergeInputSha = 'a'.repeat(40);

function moduleDefinition(value) {
  const definition = { ...value, digest: `sha256:${'0'.repeat(64)}` };
  definition.digest = hashModuleDefinition(definition);
  return definition;
}

async function modelWithFinalization() {
  const base = await loadHistoricalModel();
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
  const base = await loadHistoricalModel();
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

async function finalizingFeature(model = null, {
  mergePayload = { featureFinal: true, integrationSha: mergeInputSha },
} = {}) {
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
    payload: mergePayload,
    eventId: 'evt-merge',
  });
  return featureHome;
}

export {agent,human,mergeInputSha,moduleDefinition,modelWithFinalization,modelWithoutFinalization,finalizingFeature};
