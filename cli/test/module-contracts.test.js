import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  assessModuleReadiness,
  boundaryGateDefinitions,
  buildModelMigrationImpact,
  createDefaultWorkflowPolicy,
  createModelLock,
  hashModuleDefinition,
  loadDefaultModel,
  loadDefaultWorkflowPolicy,
  loadProjectModel,
  migrateFeatureModel,
  initializeFeature,
  projectRecord,
  proposeSlice,
  readFeatureRecord,
  recordFeatureTransition,
  recordSliceTransition,
  resolveModuleGraph,
  resolveProjectModuleGraph,
  stableJson,
  validateModuleDefinition,
  validateModel,
} from '../../plugin-src/shared/resources/protocol/index.js';

const ZERO_DIGEST = `sha256:${'0'.repeat(64)}`;

function definition({
  id,
  slot = 'boundary.evaluation',
  gateId = id,
  dependsOn = [],
  after = undefined,
  locked = false,
  enabledByDefault = false,
  waiverAllowed = true,
  disposition = 'required',
  run = undefined,
  observe = undefined,
}) {
  const value = {
    schemaVersion: 1,
    id,
    version: '1.0.0',
    digest: ZERO_DIGEST,
    label: id,
    description: `Fixture for ${id}`,
    slot,
    dependsOn,
    ...(after === undefined ? {} : { after }),
    disposition,
    locked,
    enabledByDefault,
    waiverAllowed,
    evidence: { kind: 'reference', requiredFor: ['PASS', 'FAIL'] },
    fingerprint: {
      kind: slot === 'boundary.evaluation' ? 'boundary-gate-v1' : 'feature-finalization-v1',
      dependencyBinding: 'event-ids',
    },
    ...(slot === 'boundary.evaluation' ? {
      boundary: {
        gateId,
        evaluationScope: { SLICE: 'SLICE', FEATURE_FINAL: 'FEATURE' },
        guards: ['boundary.context.current'],
      },
    } : {}),
    ...(run === undefined ? {} : { run }),
    ...(observe === undefined ? {} : { observe }),
  };
  value.digest = hashModuleDefinition(value);
  return value;
}

function selector(module, enabled = true) {
  return {
    id: module.id,
    version: module.version,
    digest: module.digest,
    enabled,
  };
}

function policy(modules, enabled = new Map()) {
  return {
    schemaVersion: 1,
    modules: modules.map((module) => selector(
      module,
      enabled.has(module.id) ? enabled.get(module.id) : true
    )),
  };
}

test('bundled policy resolves the declarative boundary with exact legacy behavior keys', async () => {
  const model = await loadDefaultModel();
  const bundledPolicy = await loadDefaultWorkflowPolicy();
  const resolved = resolveModuleGraph({
    definitions: model.moduleGraph.modules,
    policy: bundledPolicy,
  });

  assert.equal(resolved.policyDigest, model.moduleGraph.policyDigest);
  assert.deepEqual(resolved.modules, model.moduleGraph.modules);
  assert.deepEqual(resolved.enabledModuleIds, model.moduleGraph.enabledModuleIds);
  assert.deepEqual(
    boundaryGateDefinitions(model).map(({ id, dependsOn, optional, locked, waiverAllowed }) => ({
      id,
      dependsOn,
      optional,
      locked,
      waiverAllowed,
    })),
    [
      { id: 'pinContext', dependsOn: [], optional: false, locked: true, waiverAllowed: false },
      { id: 'reconcile', dependsOn: ['pinContext'], optional: false, locked: true, waiverAllowed: false },
      { id: 'verification', dependsOn: ['reconcile'], optional: false, locked: false, waiverAllowed: true },
      { id: 'specEvaluation', dependsOn: ['verification'], optional: false, locked: false, waiverAllowed: true },
      { id: 'patternReview', dependsOn: ['verification'], optional: true, locked: false, waiverAllowed: true },
      { id: 'judge', dependsOn: ['verification'], optional: false, locked: false, waiverAllowed: true },
      { id: 'codeReview', dependsOn: ['verification'], optional: false, locked: false, waiverAllowed: true },
      { id: 'decisionTriage', dependsOn: ['specEvaluation', 'patternReview', 'judge', 'codeReview'], optional: false, locked: true, waiverAllowed: false },
      { id: 'explainDiff', dependsOn: ['decisionTriage'], optional: false, locked: false, waiverAllowed: false },
      { id: 'packetValidation', dependsOn: ['explainDiff'], optional: false, locked: true, waiverAllowed: false },
    ]
  );
});

test('module resolution is deterministic and rejects invalid definitions and graphs', async () => {
  const base = await loadDefaultModel();
  const project = definition({
    id: 'example/license-audit',
    dependsOn: ['gatereeve/verification'],
    observe: { providerId: 'example/license-provider', version: '1.0.0' },
  });
  const command = definition({
    id: 'example/script-check',
    dependsOn: ['gatereeve/verification'],
    run: {
      kind: 'command',
      executable: './scripts/check.sh',
      entrypointDigest: ZERO_DIGEST,
      args: ['--json'],
      workingDirectory: 'tools/audit',
      supportFiles: [{ path: 'config/license-policy.json', digest: ZERO_DIGEST }],
      effects: ['Reads the worktree and may access the network.'],
      timeoutSeconds: 300,
    },
  });
  assert.equal(validateModuleDefinition(command), command);
  const unsafeCommand = structuredClone(command);
  unsafeCommand.run.workingDirectory = '../outside';
  unsafeCommand.digest = hashModuleDefinition(unsafeCommand);
  assert.throws(
    () => validateModuleDefinition(unsafeCommand),
    /safe repository-relative path/
  );
  const definitions = [...base.moduleGraph.modules, project];
  const selected = policy(definitions);
  const reordered = { ...selected, modules: [...selected.modules].reverse() };

  const first = resolveModuleGraph({ definitions, policy: selected });
  const second = resolveModuleGraph({ definitions, policy: reordered });
  assert.equal(first.policyDigest, second.policyDigest);
  assert.equal(stableJson(first.modules), stableJson(second.modules));
  assert.deepEqual(
    first.modules.find((module) => module.id === project.id).dependsOn,
    ['gatereeve/verification']
  );

  assert.throws(
    () => resolveModuleGraph({ definitions: [...definitions, project], policy: selected }),
    /Duplicate module definition/
  );

  const unknownSlot = definition({ id: 'example/unknown-slot' });
  unknownSlot.slot = 'feature.magic';
  unknownSlot.digest = hashModuleDefinition(unknownSlot);
  assert.throws(() => validateModuleDefinition(unknownSlot), /unknown slot/);

  const missingDefinitionPolicy = structuredClone(selected);
  missingDefinitionPolicy.modules.push({
    id: 'example/missing',
    version: '1.0.0',
    digest: ZERO_DIGEST,
    enabled: true,
  });
  assert.throws(
    () => resolveModuleGraph({ definitions, policy: missingDefinitionPolicy }),
    /missing module example\/missing/
  );

  const drifted = structuredClone(selected);
  drifted.modules.at(-1).digest = ZERO_DIGEST;
  assert.throws(() => resolveModuleGraph({ definitions, policy: drifted }), /digest mismatch/);

  const missingDependency = definition({
    id: 'example/missing-dependency',
    dependsOn: ['example/not-installed'],
  });
  assert.throws(
    () => resolveModuleGraph({
      definitions: [...base.moduleGraph.modules, missingDependency],
      policy: policy([...base.moduleGraph.modules, missingDependency]),
    }),
    /missing dependency example\/not-installed/
  );

  const left = definition({ id: 'example/left', dependsOn: ['example/right'] });
  const right = definition({ id: 'example/right', dependsOn: ['example/left'] });
  assert.throws(
    () => resolveModuleGraph({
      definitions: [...base.moduleGraph.modules, left, right],
      policy: policy([...base.moduleGraph.modules, left, right]),
    }),
    /dependencies contain a cycle/
  );
});

test('locked modules remain enabled while conditional predecessors can be disabled', async () => {
  const model = await loadDefaultModel();
  const enabled = new Map([['gatereeve/judge', false]]);
  const graph = resolveModuleGraph({
    definitions: model.moduleGraph.modules,
    policy: policy(model.moduleGraph.modules, enabled),
  });
  const changed = structuredClone(model);
  changed.moduleGraph = {
    schemaVersion: graph.schemaVersion,
    policyDigest: graph.policyDigest,
    modules: graph.modules,
    enabledModuleIds: graph.enabledModuleIds,
  };
  validateModel(changed);
  const gates = boundaryGateDefinitions(changed);
  assert.equal(gates.some((gate) => gate.id === 'judge'), false);
  assert.deepEqual(
    gates.find((gate) => gate.id === 'decisionTriage').dependsOn,
    ['specEvaluation', 'patternReview', 'codeReview']
  );

  const lockedOff = new Map([['gatereeve/pin-context', false]]);
  assert.throws(
    () => resolveModuleGraph({
      definitions: model.moduleGraph.modules,
      policy: policy(model.moduleGraph.modules, lockedOff),
    }),
    /Locked module .* must remain selected and enabled/
  );

  const verificationOff = new Map([['gatereeve/verification', false]]);
  assert.throws(
    () => resolveModuleGraph({
      definitions: model.moduleGraph.modules,
      policy: policy(model.moduleGraph.modules, verificationOff),
    }),
    /requires disabled dependency gatereeve\/verification/
  );
});

test('project discovery pins selected manifests and reports readiness separately', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'gatereeve modules '));
  const moduleDirectory = resolve(root, '.gatereeve', 'modules');
  await mkdir(moduleDirectory, { recursive: true });
  const base = await loadDefaultModel();
  const project = definition({
    id: 'example/deploy-proof',
    slot: 'feature.finalization',
    gateId: undefined,
    observe: { providerId: 'example/deploy-provider', version: '1.0.0' },
  });
  await writeFile(resolve(moduleDirectory, 'deploy-proof.json'), `${JSON.stringify(project, null, 2)}\n`);

  const withoutPolicy = await resolveProjectModuleGraph({
    repositoryRoot: root,
    builtIns: base.moduleGraph.modules,
  });
  assert.equal(withoutPolicy.graph.modules.some((module) => module.id === project.id), false);

  const selected = createDefaultWorkflowPolicy(base.moduleGraph.modules);
  selected.modules.push(selector(project));
  await writeFile(
    resolve(root, '.gatereeve', 'workflow.json'),
    `${JSON.stringify(selected, null, 2)}\n`
  );
  const resolved = await resolveProjectModuleGraph({
    repositoryRoot: root,
    builtIns: base.moduleGraph.modules,
    availability: { providers: [], skills: [] },
  });
  assert.equal(resolved.graph.modules.some((module) => module.id === project.id), true);
  assert.deepEqual(resolved.graph.readiness[project.id], {
    status: 'unavailable',
    missing: [{ kind: 'provider', id: 'example/deploy-provider' }],
  });

  const pinned = await loadProjectModel(root);
  assert.equal(pinned.model.moduleGraph.modules.some((module) => module.id === project.id), true);
  assert.equal(validateModel(pinned.model), pinned.model);
  assert.equal(assessModuleReadiness(project, { providers: ['example/deploy-provider'] }).status, 'available');

  const missingBuiltIn = structuredClone(selected);
  missingBuiltIn.modules = missingBuiltIn.modules.filter(
    (item) => item.id !== 'gatereeve/judge'
  );
  await writeFile(
    resolve(root, '.gatereeve', 'workflow.json'),
    `${JSON.stringify(missingBuiltIn, null, 2)}\n`
  );
  await assert.rejects(
    resolveProjectModuleGraph({ repositoryRoot: root, builtIns: base.moduleGraph.modules }),
    /must select every built-in module: gatereeve\/judge/
  );
});

test('project discovery rejects symlinked manifests', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'gatereeve module symlink '));
  const moduleDirectory = resolve(root, '.gatereeve', 'modules');
  await mkdir(moduleDirectory, { recursive: true });
  const external = resolve(root, 'external.json');
  await writeFile(external, '{}\n');
  await symlink(external, resolve(moduleDirectory, 'linked.json'));
  const base = await loadDefaultModel();
  await assert.rejects(
    resolveProjectModuleGraph({ repositoryRoot: root, builtIns: base.moduleGraph.modules }),
    /must be a regular file/
  );
});

test('module enablement and definition changes are explicit migration impact', async () => {
  const model = await loadDefaultModel();
  const current = createModelLock(model, { createdAt: '2026-09-03T00:00:00Z' });
  const graph = resolveModuleGraph({
    definitions: model.moduleGraph.modules,
    policy: policy(model.moduleGraph.modules, new Map([['gatereeve/judge', false]])),
  });
  const nextModel = structuredClone(model);
  nextModel.modelVersion = '1.1.1';
  nextModel.moduleGraph = {
    schemaVersion: graph.schemaVersion,
    policyDigest: graph.policyDigest,
    modules: graph.modules,
    enabledModuleIds: graph.enabledModuleIds,
  };
  const next = createModelLock(nextModel, { createdAt: '2026-09-03T01:00:00Z' });
  const impact = buildModelMigrationImpact(current, next);
  assert.deepEqual(impact.modulesChanged, ['gatereeve/judge']);
  assert.deepEqual(
    impact.boundaryGateIdsInvalidated,
    boundaryGateDefinitions(model).map((gate) => gate.id).sort()
  );
  assert.deepEqual(impact.modulesAdded, []);
  assert.deepEqual(impact.modulesRemoved, []);
});

test('boundary attempts retain their pinned module graph after a model migration', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'gatereeve module history '));
  const featureHome = resolve(root, 'docs', 'issues', 'module-history');
  const agent = { kind: 'agent', label: 'module test' };
  const human = { kind: 'human-confirmed', label: 'module test user' };
  await initializeFeature({ featureHome, featureId: 'module-history', actor: agent });
  await recordFeatureTransition(featureHome, 'approve-design', { actor: human });
  await recordFeatureTransition(featureHome, 'validate-spec', {
    actor: agent,
    facts: { specValidationCurrent: true },
  });
  await recordFeatureTransition(featureHome, 'authorize-plan', { actor: human });
  await proposeSlice(featureHome, { sliceId: 'slice-1', actor: agent });
  await recordSliceTransition(featureHome, 'plan-slice', 'slice-1', { actor: agent });
  await recordSliceTransition(featureHome, 'start-slice', 'slice-1', {
    actor: agent,
    facts: { sliceReadinessCurrent: true },
  });
  await recordSliceTransition(featureHome, 'begin-boundary', 'slice-1', {
    actor: agent,
    payload: { attemptId: 'attempt-1', scope: 'SLICE' },
  });

  const before = await readFeatureRecord(featureHome);
  const boundaryEvent = before.events.find((event) => event.type === 'BOUNDARY_STARTED');
  assert.equal(boundaryEvent.payload.moduleGraph.enabledModuleIds.includes('gatereeve/judge'), true);

  const model = await loadDefaultModel();
  const graph = resolveModuleGraph({
    definitions: model.moduleGraph.modules,
    policy: policy(model.moduleGraph.modules, new Map([['gatereeve/judge', false]])),
  });
  const nextModel = structuredClone(model);
  nextModel.modelVersion = '1.1.1';
  nextModel.moduleGraph = {
    schemaVersion: graph.schemaVersion,
    policyDigest: graph.policyDigest,
    modules: graph.modules,
    enabledModuleIds: graph.enabledModuleIds,
  };
  await migrateFeatureModel({
    featureHome,
    nextModel,
    confirmedBy: human,
    eventId: 'evt-disable-judge',
  });

  const after = projectRecord(await readFeatureRecord(featureHome));
  const attempt = after.boundaryAttempts.find((item) => item.id === 'attempt-1');
  assert.equal(attempt.gates.some((gate) => gate.id === 'judge'), true);
  assert.equal(attempt.requiredCurrentAndNonblocking, false);
  assert.equal(
    attempt.gates[0].blockers.some((blocker) => blocker.type === 'model-migration'),
    true
  );
  assert.equal(after.model.version, '1.1.1');
});
