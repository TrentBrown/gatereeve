import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  ACTOR_KINDS,
  AUTHORITIES,
  BOUNDARY_SCOPES,
  CHANGE_STATES,
  EVENT_SCHEMA_VERSION,
  EVENT_TYPES,
  FEATURE_STATES,
  GATE_FRESHNESS,
  GATE_OUTCOMES,
  MODEL_SCHEMA_VERSION,
  PROTOCOL_VERSION,
  RESULT_SCHEMA_VERSION,
  SLICE_STATES,
} from './constants.js';
import { ContractError } from './errors.js';
import { assertTrustedGuardIds, TRUSTED_GUARD_IDS } from './guards.js';
import {
  boundaryGateDefinitions,
  hashWorkflowPolicy,
  resolveProjectModuleGraph,
  resolveModuleGraph,
  validateWorkflowPolicy,
  validateResolvedModuleGraph,
} from './modules.js';

const DEFAULT_MODEL_URL = new URL('./model/workflow-model.json', import.meta.url);
const DEFAULT_POLICY_URL = new URL('./model/default-workflow-policy.json', import.meta.url);
const EVENT_ID = /^evt-[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FEATURE_ID = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const MODEL_HASH = /^sha256:[0-9a-f]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertObject(value, label) {
  if (!isObject(value)) throw new ContractError(`${label} must be an object`);
}

function assertExactStringSet(actual, expected, label) {
  if (!Array.isArray(actual) || actual.some((item) => typeof item !== 'string')) {
    throw new ContractError(`${label} must be an array of strings`);
  }
  const normalizedActual = [...new Set(actual)].sort();
  const normalizedExpected = [...expected].sort();
  if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
    throw new ContractError(`${label} does not match the protocol contract`, {
      expected: normalizedExpected,
      actual: normalizedActual,
    });
  }
}

function validateMachine(machine, expectedStates, label) {
  assertObject(machine, label);
  assertExactStringSet(machine.states, expectedStates, `${label}.states`);
  if (!expectedStates.includes(machine.initial)) {
    throw new ContractError(`${label}.initial is not a declared state`);
  }
  if (!Array.isArray(machine.terminal) || machine.terminal.some((state) => !expectedStates.includes(state))) {
    throw new ContractError(`${label}.terminal contains an undeclared state`);
  }
  if (!Array.isArray(machine.transitions)) {
    throw new ContractError(`${label}.transitions must be an array`);
  }

  const transitionIds = new Set();
  for (const transition of machine.transitions) {
    assertObject(transition, `${label} transition`);
    if (typeof transition.id !== 'string' || transitionIds.has(transition.id)) {
      throw new ContractError(`${label} transition IDs must be nonempty and unique`);
    }
    transitionIds.add(transition.id);
    if (!expectedStates.includes(transition.from) || !expectedStates.includes(transition.to)) {
      throw new ContractError(`${label}.${transition.id} references an undeclared state`);
    }
    if (typeof transition.eventType !== 'string' || transition.eventType.length === 0) {
      throw new ContractError(`${label}.${transition.id} must declare eventType`);
    }
    if (!EVENT_TYPES.includes(transition.eventType)) {
      throw new ContractError(`${label}.${transition.id} references unknown eventType`);
    }
    if (!AUTHORITIES.includes(transition.authority)) {
      throw new ContractError(`${label}.${transition.id} has invalid authority`);
    }
    assertTrustedGuardIds(transition.guards, `${label}.${transition.id}.guards`);
  }
}

export function normalizeValue(value) {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, normalizeValue(value[key])])
  );
}

export function stableJson(value) {
  return `${JSON.stringify(normalizeValue(value), null, 2)}\n`;
}

export function hashModel(model) {
  return `sha256:${createHash('sha256').update(stableJson(model)).digest('hex')}`;
}

export function validateModel(model) {
  assertObject(model, 'Workflow model');
  if (model.schemaVersion !== MODEL_SCHEMA_VERSION) {
    throw new ContractError(`Workflow model schemaVersion must be ${MODEL_SCHEMA_VERSION}`);
  }
  if (typeof model.modelId !== 'string' || typeof model.modelVersion !== 'string') {
    throw new ContractError('Workflow model must declare modelId and modelVersion');
  }
  if (!SEMVER.test(model.modelVersion)) {
    throw new ContractError('Workflow model modelVersion must be semantic versioning');
  }
  assertObject(model.coreCompatibility, 'coreCompatibility');
  for (const field of ['minimum', 'maximumExclusive']) {
    if (!SEMVER.test(model.coreCompatibility[field])) {
      throw new ContractError(`coreCompatibility.${field} must be a version string`);
    }
  }
  if (model.eventSchemaVersion !== EVENT_SCHEMA_VERSION) {
    throw new ContractError(`Workflow model eventSchemaVersion must be ${EVENT_SCHEMA_VERSION}`);
  }
  if (model.resultSchemaVersion !== RESULT_SCHEMA_VERSION) {
    throw new ContractError(`Workflow model resultSchemaVersion must be ${RESULT_SCHEMA_VERSION}`);
  }
  assertExactStringSet(model.guardIds, TRUSTED_GUARD_IDS, 'guardIds');
  validateMachine(model.feature, FEATURE_STATES, 'feature');
  validateMachine(model.slice, SLICE_STATES, 'slice');
  validateMachine(model.change, CHANGE_STATES, 'change');
  assertObject(model.change.authorityByTarget, 'change.authorityByTarget');
  const expectedChangeAuthorities = {
    design: 'human-confirmation',
    spec: 'human-confirmation',
    plan: 'agent',
    slice: 'agent',
  };
  for (const [target, authority] of Object.entries(expectedChangeAuthorities)) {
    if (model.change.authorityByTarget[target] !== authority) {
      throw new ContractError(
        `change.authorityByTarget.${target} must be ${authority}`
      );
    }
  }
  assertObject(model.change.invalidationByTarget, 'change.invalidationByTarget');
  for (const target of Object.keys(expectedChangeAuthorities)) {
    const invalidation = model.change.invalidationByTarget[target];
    assertObject(invalidation, `change.invalidationByTarget.${target}`);
    if (
      typeof invalidation.implementationAuthorization !== 'boolean' ||
      !Array.isArray(invalidation.gateIds) ||
      invalidation.gateIds.some((gateId) => typeof gateId !== 'string')
    ) {
      throw new ContractError(
        `change.invalidationByTarget.${target} has an invalid contract`
      );
    }
  }

  assertObject(model.boundary, 'boundary');
  const usesModuleGraph = model.moduleGraph !== undefined;
  if (usesModuleGraph) {
    if (model.boundary.gates !== undefined || model.boundary.scopeRouting !== undefined) {
      throw new ContractError('Module workflow models cannot also declare hardcoded boundary gates');
    }
    validateResolvedModuleGraph(model.moduleGraph);
  } else if (!Array.isArray(model.boundary.gates) || model.boundary.gates.length === 0) {
    throw new ContractError('Legacy workflow models must declare a nonempty boundary.gates array');
  }
  const gateDefinitions = boundaryGateDefinitions(model);
  if (gateDefinitions.length === 0) {
    throw new ContractError('Workflow model must contain at least one boundary evaluation module');
  }
  const gateIds = new Set();
  for (const gate of gateDefinitions) {
    assertObject(gate, 'boundary gate');
    if (typeof gate.id !== 'string' || gateIds.has(gate.id)) {
      throw new ContractError('Boundary gate IDs must be nonempty and unique');
    }
    gateIds.add(gate.id);
    if (!Array.isArray(gate.dependsOn)) {
      throw new ContractError(`boundary.${gate.id}.dependsOn must be an array`);
    }
    if (typeof gate.optional !== 'boolean' || typeof gate.waiverAllowed !== 'boolean') {
      throw new ContractError(
        `boundary.${gate.id} must declare boolean optional and waiverAllowed fields`
      );
    }
    for (const dependency of gate.dependsOn) {
      if (dependency === gate.id || !gateIds.has(dependency)) {
        throw new ContractError(
          `boundary.${gate.id} dependency ${dependency} must precede it in the DAG`
        );
      }
    }
    assertTrustedGuardIds(gate.guards, `boundary.${gate.id}.guards`);
  }
  assertExactStringSet(model.boundary.scopes, BOUNDARY_SCOPES, 'boundary.scopes');
  assertExactStringSet(model.boundary.outcomes, GATE_OUTCOMES, 'boundary.outcomes');
  assertExactStringSet(model.boundary.freshness, GATE_FRESHNESS, 'boundary.freshness');
  const knownGateIds = usesModuleGraph
    ? new Set(
        model.moduleGraph.modules
          .filter((module) => module.slot === 'boundary.evaluation')
          .map((module) => module.boundary.gateId)
      )
    : gateIds;
  for (const [target, invalidation] of Object.entries(model.change.invalidationByTarget)) {
    for (const gateId of invalidation.gateIds) {
      if (!knownGateIds.has(gateId)) {
        throw new ContractError(
          `change.invalidationByTarget.${target} references unknown gate ${gateId}`
        );
      }
    }
  }
  if (!usesModuleGraph) {
    assertObject(model.boundary.scopeRouting, 'boundary.scopeRouting');
    for (const scope of BOUNDARY_SCOPES) {
      assertObject(model.boundary.scopeRouting[scope], `boundary.scopeRouting.${scope}`);
      assertExactStringSet(
        Object.keys(model.boundary.scopeRouting[scope]),
        [...gateIds],
        `boundary.scopeRouting.${scope} gate IDs`
      );
      for (const [gateId, evaluationScope] of Object.entries(
        model.boundary.scopeRouting[scope]
      )) {
        if (!['SLICE', 'FEATURE'].includes(evaluationScope)) {
          throw new ContractError(
            `boundary.scopeRouting.${scope}.${gateId} has invalid evaluation scope`
          );
        }
      }
    }
  }
  assertObject(model.presentation, 'presentation');
  return model;
}

export async function loadDefaultModel() {
  const [model, policy] = await Promise.all([
    readFile(DEFAULT_MODEL_URL, 'utf8').then(JSON.parse),
    readFile(DEFAULT_POLICY_URL, 'utf8').then(JSON.parse),
  ]);
  validateWorkflowPolicy(policy);
  const resolved = resolveModuleGraph({ definitions: model.moduleGraph.modules, policy });
  if (hashWorkflowPolicy(policy) !== model.moduleGraph.policyDigest) {
    throw new ContractError('Default workflow policy digest differs from the bundled model');
  }
  if (
    stableJson(resolved.modules) !== stableJson(model.moduleGraph.modules) ||
    stableJson(resolved.enabledModuleIds) !== stableJson(model.moduleGraph.enabledModuleIds)
  ) {
    throw new ContractError('Default workflow policy does not resolve to the bundled module graph');
  }
  return validateModel(model);
}

export async function loadDefaultWorkflowPolicy() {
  return validateWorkflowPolicy(JSON.parse(await readFile(DEFAULT_POLICY_URL, 'utf8')));
}

export async function loadProjectModel(repositoryRoot, { availability = null } = {}) {
  const baseModel = await loadDefaultModel();
  const { graph, policy, projectDefinitions } = await resolveProjectModuleGraph({
    repositoryRoot,
    builtIns: baseModel.moduleGraph.modules,
    availability,
  });
  const model = structuredClone(baseModel);
  model.moduleGraph = {
    schemaVersion: graph.schemaVersion,
    policyDigest: graph.policyDigest,
    modules: graph.modules,
    enabledModuleIds: graph.enabledModuleIds,
  };
  return {
    model: validateModel(model),
    policy,
    projectDefinitions,
    readiness: graph.readiness,
  };
}

export function createModelLock(model, { createdAt, coreVersion = PROTOCOL_VERSION } = {}) {
  validateModel(model);
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) {
    throw new ContractError('Model lock createdAt must be an ISO-8601 timestamp');
  }
  return {
    schemaVersion: MODEL_SCHEMA_VERSION,
    modelId: model.modelId,
    modelVersion: model.modelVersion,
    modelHash: hashModel(model),
    coreVersion,
    coreCompatibility: normalizeValue(model.coreCompatibility),
    guardIds: [...model.guardIds].sort(),
    createdAt,
    model: normalizeValue(model),
  };
}

export function validateModelLock(lock) {
  assertObject(lock, 'Model lock');
  if (lock.schemaVersion !== MODEL_SCHEMA_VERSION) {
    throw new ContractError(`Model lock schemaVersion must be ${MODEL_SCHEMA_VERSION}`);
  }
  validateModel(lock.model);
  if (lock.modelId !== lock.model.modelId || lock.modelVersion !== lock.model.modelVersion) {
    throw new ContractError('Model lock identity differs from its normalized model');
  }
  if (!SEMVER.test(lock.coreVersion)) {
    throw new ContractError('Model lock coreVersion must be semantic versioning');
  }
  if (typeof lock.createdAt !== 'string' || Number.isNaN(Date.parse(lock.createdAt))) {
    throw new ContractError('Model lock createdAt must be an ISO-8601 timestamp');
  }
  if (stableJson(lock.coreCompatibility) !== stableJson(lock.model.coreCompatibility)) {
    throw new ContractError('Model lock compatibility differs from its normalized model');
  }
  const expectedHash = hashModel(lock.model);
  if (!MODEL_HASH.test(lock.modelHash) || lock.modelHash !== expectedHash) {
    throw new ContractError('Model lock hash does not match its normalized model', {
      expected: expectedHash,
      actual: lock.modelHash,
    });
  }
  assertExactStringSet(lock.guardIds, lock.model.guardIds, 'Model lock guardIds');
  return lock;
}

export function validateEvent(event) {
  assertObject(event, 'Event');
  if (event.schemaVersion !== EVENT_SCHEMA_VERSION) {
    throw new ContractError(`Event schemaVersion must be ${EVENT_SCHEMA_VERSION}`);
  }
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) {
    throw new ContractError('Event sequence must be a positive safe integer');
  }
  if (typeof event.eventId !== 'string' || !EVENT_ID.test(event.eventId)) {
    throw new ContractError('Event eventId must use the evt- portable identifier form');
  }
  if (
    typeof event.featureId !== 'string' ||
    !FEATURE_ID.test(event.featureId) ||
    event.featureId.includes('..') ||
    event.featureId.includes('//') ||
    event.featureId.includes('@{') ||
    event.featureId.endsWith('/')
  ) {
    throw new ContractError('Event featureId must be a portable feature identifier');
  }
  if (typeof event.recordedAt !== 'string' || Number.isNaN(Date.parse(event.recordedAt))) {
    throw new ContractError('Event recordedAt must be an ISO-8601 timestamp');
  }
  if (!EVENT_TYPES.includes(event.type)) {
    throw new ContractError(`Event type is not recognized: ${event.type}`);
  }
  if (typeof event.modelHash !== 'string' || !MODEL_HASH.test(event.modelHash)) {
    throw new ContractError('Event modelHash must be a sha256 fingerprint');
  }
  assertObject(event.actor, 'Event actor');
  if (!ACTOR_KINDS.includes(event.actor.kind) || typeof event.actor.label !== 'string') {
    throw new ContractError('Event actor must contain a recognized kind and string label');
  }
  assertObject(event.payload, 'Event payload');
  return event;
}
