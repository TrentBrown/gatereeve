import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { BOUNDARY_SCOPES } from './constants.js';
import { ContractError } from './errors.js';
import { TRUSTED_GUARD_IDS } from './guards.js';

export const MODULE_SCHEMA_VERSION = 1;
export const WORKFLOW_POLICY_SCHEMA_VERSION = 1;
export const MODULE_GRAPH_SCHEMA_VERSION = 1;
export const MODULE_SLOTS = Object.freeze([
  'boundary.evaluation',
  'feature.finalization',
]);

const MODULE_SEGMENT = '[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?';
const MODULE_ID = new RegExp(`^${MODULE_SEGMENT}/${MODULE_SEGMENT}(?:/${MODULE_SEGMENT})*$`);
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const GATE_ID = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const DISPOSITIONS = new Set(['required', 'optional']);
const RUN_KINDS = new Set(['skill', 'manual', 'command']);
const EVALUATION_SCOPES = new Set(['SLICE', 'FEATURE']);
const DEFINITION_KEYS = new Set([
  'schemaVersion',
  'id',
  'version',
  'digest',
  'label',
  'description',
  'slot',
  'dependsOn',
  'after',
  'disposition',
  'locked',
  'enabledByDefault',
  'waiverAllowed',
  'evidence',
  'fingerprint',
  'boundary',
  'run',
  'observe',
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertObject(value, label) {
  if (!isObject(value)) throw new ContractError(`${label} must be an object`);
}

function assertAllowedKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new ContractError(`${label} contains unknown fields: ${unknown.sort().join(', ')}`);
  }
}

function assertNonemptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ContractError(`${label} must be a nonempty string`);
  }
}

function isSafeWorkingDirectory(value) {
  if (value === 'repository') return true;
  return (
    typeof value === 'string' &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.includes('\u0000') &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

function isSafeRepositoryPath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.includes('\u0000') &&
    value.split('/').every((part) => part !== '' && part !== '..')
  );
}

function normalized(value) {
  if (Array.isArray(value)) return value.map(normalized);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, normalized(value[key])])
  );
}

function canonicalJson(value) {
  return `${JSON.stringify(normalized(value), null, 2)}\n`;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function withoutDigest(definition) {
  const { digest: _digest, ...content } = definition;
  return content;
}

export function hashModuleDefinition(definition) {
  assertObject(definition, 'Module definition');
  return sha256(withoutDigest(definition));
}

export function hashWorkflowPolicy(policy) {
  validateWorkflowPolicy(policy);
  return sha256({
    ...policy,
    modules: [...policy.modules].sort((left, right) => left.id.localeCompare(right.id)),
  });
}

function validateEvidenceContract(evidence, label) {
  assertObject(evidence, label);
  assertAllowedKeys(evidence, new Set(['kind', 'requiredFor']), label);
  if (evidence.kind !== 'reference') {
    throw new ContractError(`${label}.kind must be reference`);
  }
  if (
    !Array.isArray(evidence.requiredFor) ||
    evidence.requiredFor.length !== 2 ||
    new Set(evidence.requiredFor).size !== 2 ||
    !evidence.requiredFor.includes('PASS') ||
    !evidence.requiredFor.includes('FAIL')
  ) {
    throw new ContractError(`${label}.requiredFor must contain exactly PASS and FAIL`);
  }
}

function validateFingerprintContract(fingerprint, slot, label) {
  assertObject(fingerprint, label);
  assertAllowedKeys(fingerprint, new Set(['kind', 'dependencyBinding']), label);
  const expectedKind = slot === 'boundary.evaluation'
    ? 'boundary-gate-v1'
    : 'feature-finalization-v1';
  if (fingerprint.kind !== expectedKind) {
    throw new ContractError(`${label}.kind must be ${expectedKind}`);
  }
  if (fingerprint.dependencyBinding !== 'event-ids') {
    throw new ContractError(`${label}.dependencyBinding must be event-ids`);
  }
}

function validateBoundaryContract(boundary, label) {
  assertObject(boundary, label);
  assertAllowedKeys(boundary, new Set(['gateId', 'evaluationScope', 'guards']), label);
  if (
    typeof boundary.gateId !== 'string' ||
    !GATE_ID.test(boundary.gateId) ||
    boundary.gateId.includes('..') ||
    boundary.gateId.includes('//') ||
    boundary.gateId.endsWith('/')
  ) {
    throw new ContractError(`${label}.gateId must be a portable gate key`);
  }
  assertObject(boundary.evaluationScope, `${label}.evaluationScope`);
  const scopes = Object.keys(boundary.evaluationScope).sort();
  if (JSON.stringify(scopes) !== JSON.stringify([...BOUNDARY_SCOPES].sort())) {
    throw new ContractError(`${label}.evaluationScope must cover every boundary scope`);
  }
  for (const [scope, evaluationScope] of Object.entries(boundary.evaluationScope)) {
    if (!EVALUATION_SCOPES.has(evaluationScope)) {
      throw new ContractError(`${label}.evaluationScope.${scope} is invalid`);
    }
  }
  if (
    !Array.isArray(boundary.guards) ||
    boundary.guards.some((guardId) => !TRUSTED_GUARD_IDS.includes(guardId))
  ) {
    throw new ContractError(`${label}.guards references an unknown trusted guard`);
  }
}

function validateRunAdapter(run, label) {
  assertObject(run, label);
  if (!RUN_KINDS.has(run.kind)) {
    throw new ContractError(`${label}.kind must be skill, manual, or command`);
  }
  if (run.kind === 'skill') {
    assertAllowedKeys(run, new Set(['kind', 'skillId', 'invocation']), label);
    assertNonemptyString(run.skillId, `${label}.skillId`);
    if (run.invocation !== undefined) assertNonemptyString(run.invocation, `${label}.invocation`);
    return;
  }
  if (run.kind === 'manual') {
    assertAllowedKeys(run, new Set(['kind', 'instructions']), label);
    assertNonemptyString(run.instructions, `${label}.instructions`);
    return;
  }
  assertAllowedKeys(
    run,
    new Set([
      'kind',
      'executable',
      'entrypointDigest',
      'args',
      'workingDirectory',
      'supportFiles',
      'effects',
      'timeoutSeconds',
    ]),
    label
  );
  assertNonemptyString(run.executable, `${label}.executable`);
  if (run.entrypointDigest !== undefined && !SHA256.test(run.entrypointDigest)) {
    throw new ContractError(`${label}.entrypointDigest must be a sha256 fingerprint`);
  }
  if (!Array.isArray(run.args) || run.args.some((arg) => typeof arg !== 'string')) {
    throw new ContractError(`${label}.args must be an array of strings`);
  }
  if (!isSafeWorkingDirectory(run.workingDirectory)) {
    throw new ContractError(`${label}.workingDirectory must be repository or a safe repository-relative path`);
  }
  if (
    !Array.isArray(run.effects) ||
    run.effects.some((effect) => typeof effect !== 'string' || effect.trim().length === 0)
  ) {
    throw new ContractError(`${label}.effects must be an array of nonempty strings`);
  }
  if (run.supportFiles !== undefined) {
    if (!Array.isArray(run.supportFiles)) {
      throw new ContractError(`${label}.supportFiles must be an array`);
    }
    const paths = new Set();
    for (const file of run.supportFiles) {
      assertObject(file, `${label}.supportFiles entry`);
      assertAllowedKeys(file, new Set(['path', 'digest']), `${label}.supportFiles entry`);
      if (!isSafeRepositoryPath(file.path) || paths.has(file.path)) {
        throw new ContractError(`${label}.supportFiles paths must be unique and repository-relative`);
      }
      paths.add(file.path);
      if (!SHA256.test(file.digest)) {
        throw new ContractError(`${label}.supportFiles ${file.path} digest must be sha256`);
      }
    }
  }
  if (!Number.isSafeInteger(run.timeoutSeconds) || run.timeoutSeconds < 1) {
    throw new ContractError(`${label}.timeoutSeconds must be a positive integer`);
  }
}

function validateObserveAdapter(observe, label) {
  assertObject(observe, label);
  assertAllowedKeys(observe, new Set(['providerId', 'version']), label);
  if (typeof observe.providerId !== 'string' || !MODULE_ID.test(observe.providerId)) {
    throw new ContractError(`${label}.providerId must be namespaced`);
  }
  if (typeof observe.version !== 'string' || !SEMVER.test(observe.version)) {
    throw new ContractError(`${label}.version must use semantic versioning`);
  }
}

export function validateModuleDefinition(definition, { checkDigest = true } = {}) {
  assertObject(definition, 'Module definition');
  assertAllowedKeys(definition, DEFINITION_KEYS, `Module ${definition.id ?? '<unknown>'}`);
  if (definition.schemaVersion !== MODULE_SCHEMA_VERSION) {
    throw new ContractError(`Module ${definition.id ?? '<unknown>'} schemaVersion must be ${MODULE_SCHEMA_VERSION}`);
  }
  if (typeof definition.id !== 'string' || !MODULE_ID.test(definition.id)) {
    throw new ContractError('Module id must be a stable namespaced identifier');
  }
  if (typeof definition.version !== 'string' || !SEMVER.test(definition.version)) {
    throw new ContractError(`Module ${definition.id} version must use semantic versioning`);
  }
  if (typeof definition.digest !== 'string' || !SHA256.test(definition.digest)) {
    throw new ContractError(`Module ${definition.id} digest must be a sha256 fingerprint`);
  }
  if (checkDigest) {
    const expected = hashModuleDefinition(definition);
    if (definition.digest !== expected) {
      throw new ContractError(`Module ${definition.id} digest does not match its definition`, {
        expected,
        actual: definition.digest,
      });
    }
  }
  assertNonemptyString(definition.label, `Module ${definition.id} label`);
  assertNonemptyString(definition.description, `Module ${definition.id} description`);
  if (!MODULE_SLOTS.includes(definition.slot)) {
    throw new ContractError(`Module ${definition.id} uses unknown slot ${definition.slot}`);
  }
  if (
    !Array.isArray(definition.dependsOn) ||
    definition.dependsOn.some((id) => typeof id !== 'string' || !MODULE_ID.test(id)) ||
    new Set(definition.dependsOn).size !== definition.dependsOn.length ||
    definition.dependsOn.includes(definition.id)
  ) {
    throw new ContractError(`Module ${definition.id} dependsOn must contain unique namespaced module IDs`);
  }
  if (
    definition.after !== undefined &&
    (!Array.isArray(definition.after) ||
      definition.after.some((id) => typeof id !== 'string' || !MODULE_ID.test(id)) ||
      new Set(definition.after).size !== definition.after.length ||
      definition.after.includes(definition.id) ||
      definition.after.some((id) => definition.dependsOn.includes(id)))
  ) {
    throw new ContractError(`Module ${definition.id} after must contain distinct namespaced module IDs`);
  }
  if (!DISPOSITIONS.has(definition.disposition)) {
    throw new ContractError(`Module ${definition.id} disposition must be required or optional`);
  }
  for (const field of ['locked', 'enabledByDefault', 'waiverAllowed']) {
    if (typeof definition[field] !== 'boolean') {
      throw new ContractError(`Module ${definition.id} ${field} must be boolean`);
    }
  }
  if (definition.locked && (!definition.enabledByDefault || definition.waiverAllowed)) {
    throw new ContractError(`Locked module ${definition.id} must be enabled by default and non-waivable`);
  }
  validateEvidenceContract(definition.evidence, `Module ${definition.id} evidence`);
  validateFingerprintContract(definition.fingerprint, definition.slot, `Module ${definition.id} fingerprint`);
  if (definition.slot === 'boundary.evaluation') {
    validateBoundaryContract(definition.boundary, `Module ${definition.id} boundary`);
  } else if (definition.boundary !== undefined) {
    throw new ContractError(`Finalization module ${definition.id} cannot declare boundary metadata`);
  }
  if (definition.run !== undefined) validateRunAdapter(definition.run, `Module ${definition.id} run`);
  if (definition.observe !== undefined) validateObserveAdapter(definition.observe, `Module ${definition.id} observe`);
  return definition;
}

export function validateWorkflowPolicy(policy) {
  assertObject(policy, 'Workflow policy');
  assertAllowedKeys(policy, new Set(['schemaVersion', 'modules']), 'Workflow policy');
  if (policy.schemaVersion !== WORKFLOW_POLICY_SCHEMA_VERSION) {
    throw new ContractError(`Workflow policy schemaVersion must be ${WORKFLOW_POLICY_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(policy.modules)) {
    throw new ContractError('Workflow policy modules must be an array');
  }
  const ids = new Set();
  for (const selector of policy.modules) {
    assertObject(selector, 'Workflow policy module selector');
    assertAllowedKeys(selector, new Set(['id', 'version', 'digest', 'enabled']), `Workflow policy module ${selector.id ?? '<unknown>'}`);
    if (typeof selector.id !== 'string' || !MODULE_ID.test(selector.id) || ids.has(selector.id)) {
      throw new ContractError('Workflow policy module IDs must be unique and namespaced');
    }
    ids.add(selector.id);
    if (typeof selector.version !== 'string' || !SEMVER.test(selector.version)) {
      throw new ContractError(`Workflow policy module ${selector.id} requires an exact semantic version`);
    }
    if (typeof selector.digest !== 'string' || !SHA256.test(selector.digest)) {
      throw new ContractError(`Workflow policy module ${selector.id} requires an exact digest`);
    }
    if (typeof selector.enabled !== 'boolean') {
      throw new ContractError(`Workflow policy module ${selector.id} enabled must be boolean`);
    }
  }
  return policy;
}

export function createDefaultWorkflowPolicy(definitions) {
  definitions.forEach((definition) => validateModuleDefinition(definition));
  return {
    schemaVersion: WORKFLOW_POLICY_SCHEMA_VERSION,
    modules: definitions.map((definition) => ({
      id: definition.id,
      version: definition.version,
      digest: definition.digest,
      enabled: definition.enabledByDefault,
    })),
  };
}

function stableTopologicalOrder(modules, { enabledIds = null } = {}) {
  const byId = new Map(modules.map((module) => [module.id, module]));
  const index = new Map(modules.map((module, ordinal) => [module.id, ordinal]));
  const remaining = new Map(modules.map((module) => [
    module.id,
    new Set(
      [...module.dependsOn, ...(module.after ?? [])]
        .filter((id) => byId.has(id) && (enabledIds === null || enabledIds.has(id)))
    ),
  ]));
  const ordered = [];
  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, dependencies]) => dependencies.size === 0)
      .map(([id]) => id)
      .sort((left, right) => index.get(left) - index.get(right) || left.localeCompare(right));
    if (ready.length === 0) {
      throw new ContractError(`Module dependencies contain a cycle: ${[...remaining.keys()].sort().join(', ')}`);
    }
    for (const id of ready) {
      ordered.push(byId.get(id));
      remaining.delete(id);
      for (const dependencies of remaining.values()) dependencies.delete(id);
    }
  }
  return ordered;
}

export function assessModuleReadiness(module, availability = null) {
  validateModuleDefinition(module);
  if (availability === null) return { status: 'unchecked', missing: [] };
  const skills = new Set(availability.skills ?? []);
  const providers = new Set((availability.providers ?? []).map((provider) => (
    typeof provider === 'string' ? provider : `${provider.id}@${provider.version}`
  )));
  const missing = [];
  if (module.run?.kind === 'skill' && !skills.has(module.run.skillId)) {
    missing.push({ kind: 'skill', id: module.run.skillId });
  }
  if (
    module.observe
    && !providers.has(module.observe.providerId)
    && !providers.has(`${module.observe.providerId}@${module.observe.version}`)
  ) {
    missing.push({ kind: 'provider', id: module.observe.providerId });
  }
  return {
    status: missing.length === 0 ? 'available' : 'unavailable',
    missing,
  };
}

export function resolveModuleGraph({ definitions, policy, availability = null }) {
  if (!Array.isArray(definitions)) throw new ContractError('Module definitions must be an array');
  validateWorkflowPolicy(policy);
  const byId = new Map();
  for (const definition of definitions) {
    validateModuleDefinition(definition);
    if (byId.has(definition.id)) {
      throw new ContractError(`Duplicate module definition ${definition.id}`);
    }
    byId.set(definition.id, definition);
  }

  const selected = new Map(policy.modules.map((selector) => [selector.id, selector]));
  for (const definition of definitions.filter((item) => item.locked)) {
    const selector = selected.get(definition.id);
    if (!selector || selector.enabled !== true) {
      throw new ContractError(`Locked module ${definition.id} must remain selected and enabled`);
    }
  }

  const enabledIds = new Set();
  for (const selector of policy.modules) {
    const definition = byId.get(selector.id);
    if (!definition) throw new ContractError(`Workflow policy references missing module ${selector.id}`);
    if (selector.version !== definition.version) {
      throw new ContractError(`Workflow policy version mismatch for ${selector.id}`);
    }
    if (selector.digest !== definition.digest) {
      throw new ContractError(`Workflow policy digest mismatch for ${selector.id}`);
    }
    if (selector.enabled) enabledIds.add(definition.id);
  }

  const selectedDefinitions = definitions.filter((definition) => selected.has(definition.id));
  for (const module of selectedDefinitions) {
    for (const dependencyId of [...module.dependsOn, ...(module.after ?? [])]) {
      const dependency = byId.get(dependencyId);
      if (!dependency) {
        throw new ContractError(`Module ${module.id} references missing dependency ${dependencyId}`);
      }
      if (dependency.slot !== module.slot) {
        throw new ContractError(`Module ${module.id} dependency ${dependencyId} crosses module slots`);
      }
      if (enabledIds.has(module.id) && module.dependsOn.includes(dependencyId) && !enabledIds.has(dependencyId)) {
        throw new ContractError(`Module ${module.id} requires disabled dependency ${dependencyId}`);
      }
    }
  }

  const modules = stableTopologicalOrder(selectedDefinitions, { enabledIds });
  const boundaryGateIds = new Set();
  for (const module of modules.filter((item) => item.slot === 'boundary.evaluation' && enabledIds.has(item.id))) {
    const gateId = module.boundary.gateId;
    if (boundaryGateIds.has(gateId)) {
      throw new ContractError(`Boundary modules contain duplicate gate key ${gateId}`);
    }
    boundaryGateIds.add(gateId);
  }
  return {
    schemaVersion: MODULE_GRAPH_SCHEMA_VERSION,
    policyDigest: hashWorkflowPolicy(policy),
    modules: modules.map((module) => structuredClone(module)),
    enabledModuleIds: modules.filter((module) => enabledIds.has(module.id)).map((module) => module.id),
    readiness: Object.fromEntries(
      modules.map((module) => [module.id, assessModuleReadiness(module, availability)])
    ),
  };
}

async function readJson(path, label) {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new ContractError(`${label} must be a regular file, not a symlink`);
  }
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new ContractError(`${label} is not valid JSON`, null, { cause: error });
  }
}

export async function discoverProjectModuleDefinitions(repositoryRoot) {
  const directory = resolve(repositoryRoot, '.gatereeve', 'modules');
  let info;
  try {
    info = await lstat(directory);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new ContractError('.gatereeve/modules must be a regular directory, not a symlink');
  }
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.name.endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name));
  const definitions = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new ContractError(`Project module manifest ${entry.name} must be a regular file`);
    }
    const definition = await readJson(resolve(directory, entry.name), `Project module manifest ${entry.name}`);
    definitions.push(validateModuleDefinition(definition));
  }
  return definitions;
}

export async function loadProjectWorkflowPolicy(repositoryRoot, definitions) {
  const path = resolve(repositoryRoot, '.gatereeve', 'workflow.json');
  const policy = await readJson(path, '.gatereeve/workflow.json');
  return policy === null
    ? createDefaultWorkflowPolicy(definitions)
    : validateWorkflowPolicy(policy);
}

export async function resolveProjectModuleGraph({ repositoryRoot, builtIns, availability = null }) {
  const projectDefinitions = await discoverProjectModuleDefinitions(repositoryRoot);
  const definitions = [...builtIns, ...projectDefinitions];
  const policy = await loadProjectWorkflowPolicy(repositoryRoot, builtIns);
  const selectedIds = new Set(policy.modules.map((selector) => selector.id));
  const missingBuiltIns = builtIns
    .map((module) => module.id)
    .filter((id) => !selectedIds.has(id));
  if (missingBuiltIns.length > 0) {
    throw new ContractError(
      `Workflow policy must select every built-in module: ${missingBuiltIns.join(', ')}`
    );
  }
  return {
    graph: resolveModuleGraph({ definitions, policy, availability }),
    policy,
    projectDefinitions,
  };
}

export function boundaryGateDefinitions(model) {
  if (model.moduleGraph) {
    const enabledIds = new Set(model.moduleGraph.enabledModuleIds);
    return model.moduleGraph.modules
      .filter((module) => module.slot === 'boundary.evaluation' && enabledIds.has(module.id))
      .map((module) => ({
        id: module.boundary.gateId,
        moduleId: module.id,
        moduleVersion: module.version,
        moduleDigest: module.digest,
        dependsOn: [...module.dependsOn, ...(module.after ?? [])]
          .filter((dependencyId) => enabledIds.has(dependencyId))
          .map((dependencyId) => {
            const dependency = model.moduleGraph.modules.find((item) => item.id === dependencyId);
            if (!dependency || dependency.slot !== 'boundary.evaluation') {
              throw new ContractError(`Boundary module ${module.id} has unresolved dependency ${dependencyId}`);
            }
            return dependency.boundary.gateId;
          }),
        optional: module.disposition === 'optional',
        locked: module.locked,
        waiverAllowed: module.waiverAllowed,
        guards: [...module.boundary.guards],
        evaluationScope: structuredClone(module.boundary.evaluationScope),
      }));
  }
  return model.boundary.gates.map((gate) => ({
    ...structuredClone(gate),
    moduleId: gate.id,
    moduleVersion: null,
    moduleDigest: null,
    locked: !gate.waiverAllowed,
    evaluationScope: Object.fromEntries(
      BOUNDARY_SCOPES.map((scope) => [scope, model.boundary.scopeRouting[scope][gate.id]])
    ),
  }));
}

export function finalizationModuleDefinitions(model) {
  if (!model.moduleGraph) return [];
  const enabledIds = new Set(model.moduleGraph.enabledModuleIds);
  return model.moduleGraph.modules
    .filter((module) => module.slot === 'feature.finalization' && enabledIds.has(module.id))
    .map((module) => ({
      id: module.id,
      moduleId: module.id,
      moduleVersion: module.version,
      moduleDigest: module.digest,
      dependsOn: [...module.dependsOn, ...(module.after ?? [])]
        .filter((dependencyId) => enabledIds.has(dependencyId)),
      optional: module.disposition === 'optional',
      locked: module.locked,
      waiverAllowed: module.waiverAllowed,
    }));
}

export function validateResolvedModuleGraph(graph) {
  assertObject(graph, 'Resolved module graph');
  assertAllowedKeys(graph, new Set(['schemaVersion', 'policyDigest', 'modules', 'enabledModuleIds']), 'Resolved module graph');
  if (graph.schemaVersion !== MODULE_GRAPH_SCHEMA_VERSION || !SHA256.test(graph.policyDigest)) {
    throw new ContractError('Resolved module graph has an invalid version or policy digest');
  }
  if (
    !Array.isArray(graph.modules) ||
    !Array.isArray(graph.enabledModuleIds) ||
    graph.enabledModuleIds.some((id) => typeof id !== 'string') ||
    new Set(graph.enabledModuleIds).size !== graph.enabledModuleIds.length
  ) {
    throw new ContractError('Resolved module graph must declare modules and unique enabledModuleIds');
  }
  const enabledIds = new Set(graph.enabledModuleIds);
  const policy = {
    schemaVersion: WORKFLOW_POLICY_SCHEMA_VERSION,
    modules: graph.modules.map((module) => ({
      id: module.id,
      version: module.version,
      digest: module.digest,
      enabled: enabledIds.has(module.id),
    })),
  };
  const resolved = resolveModuleGraph({ definitions: graph.modules, policy });
  if (
    canonicalJson(resolved.modules) !== canonicalJson(graph.modules) ||
    canonicalJson(resolved.enabledModuleIds) !== canonicalJson(graph.enabledModuleIds)
  ) {
    throw new ContractError('Resolved module graph modules are not in deterministic topological order');
  }
  if (resolved.policyDigest !== graph.policyDigest) {
    throw new ContractError('Resolved module graph policy digest does not match its selected modules');
  }
  return graph;
}
