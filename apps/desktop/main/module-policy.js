// @ts-check

import { randomUUID } from 'node:crypto';
import { lstat, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import {
  migrateFeatureModel,
  previewFeatureModelMigration,
  readFeatureRecord,
} from '../resources/protocol/feature.js';
import { hashModel, loadDefaultModel, loadProjectModel } from '../resources/protocol/model.js';
import { resolveModuleGraph } from '../resources/protocol/modules.js';

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function regularFileState(path) {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error('.gatereeve/workflow.json must be a regular file, not a symlink.');
    }
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function ensurePolicyDirectory(path) {
  const directory = dirname(path);
  try {
    const info = await lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error('.gatereeve must be a regular directory, not a symlink.');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(directory, { recursive: true, mode: 0o755 });
  }
}

function exactEnabledIds(value, knownIds) {
  if (
    !Array.isArray(value)
    || value.some((id) => typeof id !== 'string' || !knownIds.has(id))
    || new Set(value).size !== value.length
  ) {
    throw new TypeError('Enabled module IDs must be a unique list of known module IDs.');
  }
  return new Set(value);
}

function dependencyClosure(definitions, requested) {
  const byId = new Map(definitions.map((module) => [module.id, module]));
  const enabled = new Set(requested);
  const autoEnabled = [];
  const visited = new Set();
  const visit = (id) => {
    if (visited.has(id)) return;
    visited.add(id);
    for (const dependencyId of byId.get(id)?.dependsOn ?? []) {
      if (!enabled.has(dependencyId)) {
        enabled.add(dependencyId);
        autoEnabled.push(dependencyId);
      }
      visit(dependencyId);
    }
  };
  for (const id of [...enabled]) visit(id);
  return { enabled, autoEnabled: [...new Set(autoEnabled)] };
}

function enabledDependents(definitions, requested, currentEnabled) {
  const requestedSet = new Set(requested);
  const explicitlyDisabled = new Set(
    [...currentEnabled].filter((id) => !requestedSet.has(id))
  );
  const byId = new Map(definitions.map((module) => [module.id, module]));
  const blocked = new Set(explicitlyDisabled);
  const result = new Map();
  let changed = true;
  while (changed) {
    changed = false;
    for (const module of definitions) {
      const missingDependencies = module.dependsOn.filter((id) => blocked.has(id));
      if (requestedSet.has(module.id) && missingDependencies.length > 0 && !result.has(module.id)) {
        result.set(module.id, {
          id: module.id,
          label: module.label,
          locked: module.locked,
          missingDependencies,
        });
        blocked.add(module.id);
        changed = true;
      }
    }
  }
  return [...result.values()].filter((item) => byId.has(item.id));
}

function policyFor(definitions, currentPolicy, enabled) {
  const current = new Map(currentPolicy.modules.map((selector) => [selector.id, selector]));
  return {
    schemaVersion: 1,
    modules: definitions.map((module) => ({
      id: module.id,
      version: current.get(module.id)?.version ?? module.version,
      digest: current.get(module.id)?.digest ?? module.digest,
      enabled: enabled.has(module.id),
    })),
  };
}

function moduleRows(model, readiness) {
  const enabled = new Set(model.moduleGraph.enabledModuleIds);
  return model.moduleGraph.modules.map((module) => ({
    id: module.id,
    version: module.version,
    digest: module.digest,
    label: module.label,
    description: module.description,
    slot: module.slot,
    enabled: enabled.has(module.id),
    locked: module.locked,
    disposition: module.disposition,
    waiverAllowed: module.waiverAllowed,
    dependsOn: [...module.dependsOn],
    after: [...(module.after ?? [])],
    readiness: readiness[module.id] ?? { status: 'unchecked', missing: [] },
    runKind: module.run?.kind ?? null,
    observeProvider: module.observe?.providerId ?? null,
  }));
}

function policyDiff(currentPolicy, candidatePolicy) {
  const current = new Map(currentPolicy.modules.map((item) => [item.id, item.enabled]));
  return candidatePolicy.modules
    .filter((item) => (current.get(item.id) === true) !== item.enabled)
    .map((item) => ({ id: item.id, before: current.get(item.id) === true, after: item.enabled }));
}

async function inspect(repositoryRoot, featureHome, availability) {
  const policyPath = resolve(repositoryRoot, '.gatereeve', 'workflow.json');
  const policyExists = await regularFileState(policyPath);
  const [baseModel, project, record] = await Promise.all([
    loadDefaultModel(),
    loadProjectModel(repositoryRoot, { availability }),
    readFeatureRecord(featureHome),
  ]);
  const definitions = [...baseModel.moduleGraph.modules, ...project.projectDefinitions];
  const selected = new Set(project.policy.modules.map((item) => item.id));
  const catalogPolicy = {
    schemaVersion: 1,
    modules: [
      ...project.policy.modules,
      ...definitions.filter((module) => !selected.has(module.id)).map((module) => ({
        id: module.id,
        version: module.version,
        digest: module.digest,
        enabled: false,
      })),
    ],
  };
  const catalog = resolveModuleGraph({ definitions, policy: catalogPolicy, availability });
  return {
    schemaVersion: 1,
    policyPath,
    policyExists,
    policyDigest: project.model.moduleGraph.policyDigest,
    featureModelHash: record.modelLock.modelHash,
    projectModelHash: hashModel(project.model),
    migrationRequired: record.modelLock.modelHash !== hashModel(project.model),
    modules: moduleRows({ moduleGraph: catalog }, catalog.readiness),
  };
}

export function createModulePolicyManager({
  getAvailability = async () => null,
  randomId = randomUUID,
} = {}) {
  async function candidate(repositoryRoot, featureHome, enabledModuleIds) {
    const availability = await getAvailability();
    await regularFileState(resolve(repositoryRoot, '.gatereeve', 'workflow.json'));
    const [baseModel, current, record] = await Promise.all([
      loadDefaultModel(),
      loadProjectModel(repositoryRoot, { availability }),
      readFeatureRecord(featureHome),
    ]);
    const definitions = [...baseModel.moduleGraph.modules, ...current.projectDefinitions];
    const knownIds = new Set(definitions.map((module) => module.id));
    const requested = exactEnabledIds(enabledModuleIds, knownIds);
    const currentEnabled = new Set(current.model.moduleGraph.enabledModuleIds);
    const dependents = enabledDependents(definitions, requested, currentEnabled);
    const closure = dependencyClosure(definitions, requested);
    const nextPolicy = policyFor(definitions, current.policy, closure.enabled);
    let graph = null;
    let error = null;
    try {
      graph = resolveModuleGraph({ definitions, policy: nextPolicy, availability });
      const enabledBefore = currentEnabled;
      const newlyEnabledUnavailable = graph.modules.filter((module) => (
        graph.enabledModuleIds.includes(module.id)
        && !enabledBefore.has(module.id)
        && graph.readiness[module.id]?.status === 'unavailable'
      ));
      if (newlyEnabledUnavailable.length > 0) {
        error = `Implementation unavailable: ${newlyEnabledUnavailable.map((item) => item.label).join(', ')}`;
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    if (dependents.length > 0) {
      const locked = dependents.filter((item) => item.locked);
      error = locked.length > 0
        ? `Locked dependents prevent this change: ${locked.map((item) => item.label).join(', ')}`
        : `Disable dependent modules too: ${dependents.map((item) => item.label).join(', ')}`;
    }
    const nextModel = graph === null ? null : {
      ...structuredClone(baseModel),
      moduleGraph: {
        schemaVersion: graph.schemaVersion,
        policyDigest: graph.policyDigest,
        modules: graph.modules,
        enabledModuleIds: graph.enabledModuleIds,
      },
    };
    let migrationImpact = null;
    if (nextModel !== null && record.modelLock.modelHash !== hashModel(nextModel)) {
      migrationImpact = (await previewFeatureModelMigration({
        featureHome,
        nextModel,
      })).impact;
    }
    const suggested = new Set(requested);
    for (const dependent of dependents.filter((item) => !item.locked)) suggested.delete(dependent.id);
    return {
      schemaVersion: 1,
      valid: error === null,
      error,
      autoEnabled: closure.autoEnabled,
      blockingDependents: dependents,
      enabledModuleIds: graph?.enabledModuleIds ?? [...closure.enabled],
      suggestedEnabledModuleIds: [...suggested],
      diff: policyDiff(current.policy, nextPolicy),
      migrationImpact,
      policy: nextPolicy,
      nextModel,
    };
  }

  return Object.freeze({
    availability: getAvailability,
    inspect: async (repositoryRoot, featureHome) => inspect(
      repositoryRoot,
      featureHome,
      await getAvailability(),
    ),

    preview: candidate,

    async apply(repositoryRoot, featureHome, enabledModuleIds, {
      confirmedMigration = false,
      confirmationLabel = null,
    } = {}) {
      const preview = await candidate(repositoryRoot, featureHome, enabledModuleIds);
      if (!preview.valid || preview.nextModel === null) {
        throw new Error(preview.error ?? 'The module policy is invalid.');
      }
      if (preview.autoEnabled.length > 0) {
        throw new Error(`Apply the visible dependency additions first: ${preview.autoEnabled.join(', ')}`);
      }
      if (preview.migrationImpact !== null && (!confirmedMigration || !confirmationLabel?.trim())) {
        const error = new Error('Active feature migration confirmation is required.');
        error.code = 'MODULE_MIGRATION_CONFIRMATION_REQUIRED';
        throw error;
      }
      const policyPath = join(repositoryRoot, '.gatereeve', 'workflow.json');
      await ensurePolicyDirectory(policyPath);
      await regularFileState(policyPath);
      const temporary = `${policyPath}.${randomId()}.tmp`;
      let temporaryCreated = false;
      try {
        await writeFile(temporary, stableJson(preview.policy), {
          encoding: 'utf8',
          mode: 0o644,
          flag: 'wx',
        });
        temporaryCreated = true;
        await rename(temporary, policyPath);
      } catch (error) {
        if (temporaryCreated) await unlink(temporary).catch(() => {});
        throw error;
      }
      if (preview.migrationImpact !== null) {
        await migrateFeatureModel({
          featureHome,
          nextModel: preview.nextModel,
          confirmedBy: { kind: 'human-confirmed', label: confirmationLabel },
          eventId: `evt-module-policy-${randomId()}`,
        });
      }
      return inspect(repositoryRoot, featureHome, await getAvailability());
    },
  });
}
