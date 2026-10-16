// @ts-check

import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import {
  migrateFeatureModel,
  previewFeatureModelMigration,
  readFeatureRecord,
} from '../resources/protocol/feature.js';
import { hashModel, loadDefaultModel, loadProjectModel } from '../resources/protocol/model.js';
import { moduleDependencyEdges, resolveModuleGraph } from '../resources/protocol/modules.js';
import { fingerprint } from '../resources/protocol/fingerprint.js';

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

function policyFor(definitions, currentPolicy, enabled, ordering = currentPolicy.ordering) {
  const current = new Map(currentPolicy.modules.map((selector) => [selector.id, selector]));
  return {
    schemaVersion: ordering === undefined ? 1 : 2,
    ...(ordering === undefined ? {} : { ordering: structuredClone(ordering) }),
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

function orderingIdentity(value = {}) {
  return JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([id, rule]) => [id, [...rule.after].sort()]));
}

async function withPolicyMutationLock(policyPath, mutation) {
  const path = `${policyPath}.lock`;
  let handle;
  try { handle = await open(path, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Module policy is locked by another operation. Inspect ${path} before retrying.`);
    throw error;
  }
  try {
    await handle.writeFile(`${JSON.stringify({ schemaVersion: 1, pid: process.pid, createdAt: new Date().toISOString() })}\n`);
    await handle.sync();
    return await mutation();
  } finally { await handle.close();await unlink(path); }
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
    schemaVersion: project.policy.schemaVersion,
    ...(project.policy.ordering ? { ordering: project.policy.ordering } : {}),
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
    ordering: project.policy.ordering ?? {},
    edges: moduleDependencyEdges(catalog),
  };
}

export function createModulePolicyManager({
  getAvailability = async () => null,
  randomId = randomUUID,
  migrate = migrateFeatureModel,
} = {}) {
  async function candidate(repositoryRoot, featureHome, enabledModuleIds, ordering) {
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
    const nextPolicy = policyFor(definitions, current.policy, closure.enabled, ordering);
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
        ...(graph.ordering ? { ordering: graph.ordering } : {}),
      },
    };
    if (graph?.schemaVersion === 2) nextModel.coreCompatibility.minimum = '1.4.0';
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
      ordering: nextPolicy.ordering ?? {},
      orderingChanged: error === null ? orderingIdentity(current.policy.ordering) !== orderingIdentity(nextPolicy.ordering) : true,
      edges: graph ? moduleDependencyEdges(graph) : [],
      previewFingerprint: error === null && nextModel !== null ? fingerprint({
        repositoryRoot: resolve(repositoryRoot),
        featureHome: resolve(featureHome),
        featureId: record.events[0].featureId,
        policyDigest: graph.policyDigest,
        nextModelHash: hashModel(nextModel),
        featureModelHash: record.modelLock.modelHash,
        featureSequence: record.events.length,
        featureEventId: record.events.at(-1)?.eventId,
        currentPolicyDigest: current.model.moduleGraph.policyDigest,
        catalog: definitions.map(({ id, version, digest }) => ({ id, version, digest })).sort((a, b) => a.id.localeCompare(b.id)),
      }) : null,
      baseline: { modelHash: record.modelLock.modelHash, sequence: record.events.length },
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
      ordering,
      expectedPolicyDigest,
      expectedPreviewFingerprint,
    } = {}) {
      const policyPath = join(repositoryRoot, '.gatereeve', 'workflow.json');
      await ensurePolicyDirectory(policyPath);
      return withPolicyMutationLock(policyPath, async () => {
        if (expectedPolicyDigest !== undefined) {
          const current = await loadProjectModel(repositoryRoot);
          if (current.model.moduleGraph.policyDigest !== expectedPolicyDigest) {
            throw new Error('Project policy changed since preview. Reload module settings before applying.');
          }
        }
        const preview = await candidate(repositoryRoot, featureHome, enabledModuleIds, ordering);
        if (!preview.valid || preview.nextModel === null) {
          throw new Error(preview.error ?? 'The module policy is invalid.');
        }
        if (preview.policy.schemaVersion === 2 && expectedPreviewFingerprint !== preview.previewFingerprint) {
          throw new Error('Current preview confirmation is required: the module catalog, feature baseline or staged policy changed. Reload and confirm the current impact.');
        }
        if (preview.autoEnabled.length > 0) {
          throw new Error(`Apply the visible dependency additions first: ${preview.autoEnabled.join(', ')}`);
        }
        if (preview.migrationImpact !== null && (!confirmedMigration || !confirmationLabel?.trim())) {
          const error = new Error('Active feature migration confirmation is required.');
          error.code = 'MODULE_MIGRATION_CONFIRMATION_REQUIRED';
          throw error;
        }
        await regularFileState(policyPath);
        const temporary = `${policyPath}.${randomId()}.tmp`;
        let previousPolicy = null;
        let temporaryCreated = false;
        try {
          await writeFile(temporary, stableJson(preview.policy), {
            encoding: 'utf8',
            mode: 0o644,
            flag: 'wx',
          });
          temporaryCreated = true;
          const currentPreview = await candidate(repositoryRoot, featureHome, enabledModuleIds, ordering);
          if (currentPreview.previewFingerprint !== preview.previewFingerprint || !currentPreview.valid) {
            throw new Error('Project or feature changed during policy preparation. Reload and confirm the current preview.');
          }
          previousPolicy = await readFile(policyPath, 'utf8').catch(error => {
            if (error.code === 'ENOENT') return null;
            throw error;
          });
          await rename(temporary, policyPath);
        } catch (error) {
          if (temporaryCreated) await unlink(temporary).catch(() => {});
          throw error;
        }
        if (preview.migrationImpact !== null) {
          try { await migrate({
            featureHome,
            nextModel: preview.nextModel,
            confirmedBy: { kind: 'human-confirmed', label: confirmationLabel },
            eventId: `evt-module-policy-${randomId()}`,
            expectedModelHash: preview.baseline.modelHash,
            expectedJournalSequence: preview.baseline.sequence,
          }); } catch (error) {
            // Restore only when the core confirms no migration was published.
            // Conflict/lock-refusal codes certify this operation made no writes,
            // even when another journal writer progresses before we observe it.
            // Unknown failures with pending markers/changed state need recovery.
            let unchanged = ['MODEL_MIGRATION_CONFLICT', 'JOURNAL_LOCKED'].includes(error.code);
            if (!unchanged) {
              try { const current = await readFeatureRecord(featureHome);
                unchanged = current.modelLock.modelHash === preview.baseline.modelHash
                  && current.events.length === preview.baseline.sequence;
              } catch { /* Pending migration is intentionally not rolled back. */ }
            }
            if (unchanged) {
              const published = await readFile(policyPath, 'utf8');
              if (published !== stableJson(preview.policy)) {
                throw new Error('Migration was refused and another policy writer changed the file; reload and reconcile before applying.', { cause: error });
              }
              if (previousPolicy === null) await unlink(policyPath);
              else {
                const rollback = `${policyPath}.${randomId()}.rollback.tmp`;
                try { await writeFile(rollback, previousPolicy, { flag: 'wx', mode: 0o644 });await rename(rollback, policyPath); }
                finally { await unlink(rollback).catch(() => {}); }
              }
            }
            if (!unchanged) throw new Error('Policy saved but migration state requires reconciliation. Recover any pending core migration and reload module settings before retrying.', { cause: error });
            throw error;
          }
        }
        return inspect(repositoryRoot, featureHome, await getAvailability());
      });
    },
  });
}
