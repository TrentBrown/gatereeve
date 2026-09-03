import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROTOCOL_VERSION } from './constants.js';
import { assertVersionCompatible } from './compatibility.js';
import { ContractError, ProtocolError } from './errors.js';
import {
  createEvent,
  JOURNAL_FILE,
  parseJournal,
  serializeJournal,
  validateModelHashHistory,
  withJournalMutationLock,
} from './journal.js';
import {
  createModelLock,
  loadDefaultModel,
  loadProjectModel,
  stableJson,
  validateModelLock,
} from './model.js';
import { atomicCreateDirectory, atomicReplaceFile, pathExists } from './storage.js';

export const MODEL_LOCK_FILE = 'workflow-model.lock.json';
export const INTERVIEW_FILE = 'interview.md';
export const MIGRATION_MARKER_FILE = 'workflow-model.migration-pending.json';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const INTERVIEW_TEMPLATE = resolve(moduleDirectory, '..', 'templates/interview.md');

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function discoverFeatureMode(featureHome) {
  const home = resolve(featureHome);
  if (!(await isDirectory(home))) return { mode: 'missing', featureHome: home };
  const [hasModel, hasJournal, hasMigration] = await Promise.all([
    pathExists(resolve(home, MODEL_LOCK_FILE)),
    pathExists(resolve(home, JOURNAL_FILE)),
    pathExists(resolve(home, MIGRATION_MARKER_FILE)),
  ]);
  if (hasMigration) {
    return { mode: 'inconsistent', featureHome: home, reason: 'model migration pending' };
  }
  if (hasModel && hasJournal) return { mode: 'governed', featureHome: home };
  if (!hasModel && !hasJournal) return { mode: 'legacy', featureHome: home };
  return {
    mode: 'inconsistent',
    featureHome: home,
    reason: hasModel ? 'event journal missing' : 'model lock missing',
  };
}

export async function initializeFeature({
  featureHome,
  featureId,
  actor,
  model = null,
  repositoryRoot = null,
  coreVersion = PROTOCOL_VERSION,
  recordedAt = new Date().toISOString(),
  eventId,
}) {
  const selectedModel = model ?? (
    repositoryRoot === null
      ? await loadDefaultModel()
      : (await loadProjectModel(repositoryRoot)).model
  );
  const lock = createModelLock(selectedModel, { createdAt: recordedAt, coreVersion });
  assertVersionCompatible(coreVersion, lock.coreCompatibility);
  const initialEvent = createEvent({
    sequence: 1,
    featureId,
    type: 'FEATURE_INITIALIZED',
    modelHash: lock.modelHash,
    actor,
    payload: { featureState: selectedModel.feature.initial },
    recordedAt,
    ...(eventId ? { eventId } : {}),
  });
  const template = await readFile(INTERVIEW_TEMPLATE, 'utf8');
  const date = recordedAt.slice(0, 10);
  const interview = template.replaceAll('{branch}', featureId).replaceAll('{date}', date);

  const home = await atomicCreateDirectory(featureHome, async (temporary) => {
    await Promise.all([
      writeFile(resolve(temporary, MODEL_LOCK_FILE), stableJson(lock), { encoding: 'utf8', mode: 0o600 }),
      writeFile(resolve(temporary, JOURNAL_FILE), serializeJournal([initialEvent]), { encoding: 'utf8', mode: 0o600 }),
      writeFile(resolve(temporary, INTERVIEW_FILE), interview, { encoding: 'utf8', mode: 0o600 }),
    ]);
  });

  return {
    mode: 'governed',
    featureHome: home,
    modelLock: lock,
    events: [initialEvent],
    featureState: selectedModel.feature.initial,
  };
}

export async function readFeatureRecord(
  featureHome,
  { coreVersion = PROTOCOL_VERSION } = {}
) {
  const mode = await discoverFeatureMode(featureHome);
  if (mode.mode !== 'governed') {
    throw new ProtocolError(
      mode.mode === 'legacy' ? 'FEATURE_LEGACY' : 'FEATURE_NOT_GOVERNED',
      `Feature record is ${mode.mode}${mode.reason ? `: ${mode.reason}` : ''}`,
      mode
    );
  }
  let lock;
  try {
    lock = JSON.parse(await readFile(resolve(mode.featureHome, MODEL_LOCK_FILE), 'utf8'));
  } catch (error) {
    throw new ContractError('Model lock is not valid JSON', null, { cause: error });
  }
  validateModelLock(lock);
  assertVersionCompatible(coreVersion, lock.coreCompatibility);
  const journalText = await readFile(resolve(mode.featureHome, JOURNAL_FILE), 'utf8');
  const events = parseJournal(journalText, {
    featureId: eventsFeatureId(journalText),
  });
  validateModelHashHistory(events, lock.modelHash);
  return { ...mode, modelLock: lock, events };
}

function eventsFeatureId(journalText) {
  const firstLine = journalText.split('\n', 1)[0];
  try {
    const first = JSON.parse(firstLine);
    if (typeof first.featureId !== 'string') throw new Error('missing featureId');
    return first.featureId;
  } catch (error) {
    throw new ContractError('Cannot resolve feature identity from the first event', null, {
      cause: error,
    });
  }
}

function transitionIds(model) {
  return ['feature', 'slice', 'change'].flatMap((machine) =>
    model[machine].transitions.map((transition) => `${machine}:${transition.id}`)
  ).sort();
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

function moduleDescriptors(model) {
  if (model.moduleGraph) {
    const enabledIds = new Set(model.moduleGraph.enabledModuleIds);
    return model.moduleGraph.modules.map((module) => ({
      id: module.id,
      version: module.version,
      digest: module.digest,
      slot: module.slot,
      gateId: module.boundary?.gateId ?? null,
      enabled: enabledIds.has(module.id),
    }));
  }
  return model.boundary.gates.map((gate) => ({
    id: gate.id,
    version: null,
    digest: null,
    slot: 'boundary.evaluation',
    gateId: gate.id,
    enabled: true,
  }));
}

function moduleMigration(currentModel, nextModel) {
  const current = new Map(moduleDescriptors(currentModel).map((module) => [module.id, module]));
  const next = new Map(moduleDescriptors(nextModel).map((module) => [module.id, module]));
  const modulesAdded = [...next.keys()].filter((id) => !current.has(id)).sort();
  const modulesRemoved = [...current.keys()].filter((id) => !next.has(id)).sort();
  const modulesChanged = [...next.keys()].filter((id) => {
    const before = current.get(id);
    return before && JSON.stringify(before) !== JSON.stringify(next.get(id));
  }).sort();
  return {
    modulesAdded,
    modulesRemoved,
    modulesChanged,
  };
}

export function buildModelMigrationImpact(currentLock, nextLock) {
  validateModelLock(currentLock);
  validateModelLock(nextLock);
  const currentTransitions = transitionIds(currentLock.model);
  const nextTransitions = transitionIds(nextLock.model);
  const currentModules = moduleDescriptors(currentLock.model);
  return {
    fromModelVersion: currentLock.modelVersion,
    toModelVersion: nextLock.modelVersion,
    fromModelHash: currentLock.modelHash,
    toModelHash: nextLock.modelHash,
    guardsAdded: difference(nextLock.guardIds, currentLock.guardIds),
    guardsRemoved: difference(currentLock.guardIds, nextLock.guardIds),
    transitionsAdded: difference(nextTransitions, currentTransitions),
    transitionsRemoved: difference(currentTransitions, nextTransitions),
    ...moduleMigration(currentLock.model, nextLock.model),
    boundaryGateIdsInvalidated: currentModules
      .filter((module) => module.enabled && module.slot === 'boundary.evaluation')
      .map((module) => module.gateId)
      .filter((gateId) => gateId !== null)
      .sort(),
  };
}

function assertHumanConfirmation(actor) {
  if (
    !actor ||
    actor.kind !== 'human-confirmed' ||
    typeof actor.label !== 'string' ||
    actor.label.trim().length === 0
  ) {
    throw new ProtocolError(
      'HUMAN_CONFIRMATION_REQUIRED',
      'Model migration requires a recorded human confirmation'
    );
  }
}

async function loadLock(path) {
  let lock;
  try {
    lock = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new ContractError('Model lock is not valid JSON', null, { cause: error });
  }
  return validateModelLock(lock);
}

export async function previewFeatureModelMigration({
  featureHome,
  nextModel,
  coreVersion = PROTOCOL_VERSION,
  preparedAt = new Date().toISOString(),
}) {
  const record = await readFeatureRecord(featureHome, { coreVersion });
  const nextLock = createModelLock(nextModel, { createdAt: preparedAt, coreVersion });
  assertVersionCompatible(coreVersion, nextLock.coreCompatibility);
  if (nextLock.modelHash === record.modelLock.modelHash) {
    throw new ProtocolError('MODEL_UNCHANGED', 'The requested model is already active');
  }
  return {
    featureId: record.events[0].featureId,
    impact: buildModelMigrationImpact(record.modelLock, nextLock),
    confirmationRequired: true,
  };
}

export async function migrateFeatureModel({
  featureHome,
  nextModel,
  confirmedBy,
  coreVersion = PROTOCOL_VERSION,
  recordedAt = new Date().toISOString(),
  eventId,
}) {
  assertHumanConfirmation(confirmedBy);
  const record = await readFeatureRecord(featureHome, { coreVersion });
  const nextLock = createModelLock(nextModel, { createdAt: recordedAt, coreVersion });
  assertVersionCompatible(coreVersion, nextLock.coreCompatibility);
  if (nextLock.modelHash === record.modelLock.modelHash) {
    throw new ProtocolError('MODEL_UNCHANGED', 'The requested model is already active');
  }
  const impact = buildModelMigrationImpact(record.modelLock, nextLock);
  const migrationEvent = createEvent({
    sequence: record.events.length + 1,
    featureId: record.events[0].featureId,
    type: 'MODEL_MIGRATED',
    modelHash: nextLock.modelHash,
    actor: confirmedBy,
    payload: impact,
    recordedAt,
    ...(eventId ? { eventId } : {}),
  });
  const marker = {
    schemaVersion: 1,
    createdAt: recordedAt,
    fromModelHash: record.modelLock.modelHash,
    toModelHash: nextLock.modelHash,
    nextLock,
    migrationEvent,
  };
  const home = resolve(featureHome);
  const markerPath = resolve(home, MIGRATION_MARKER_FILE);
  const lockPath = resolve(home, MODEL_LOCK_FILE);
  const journalPath = resolve(home, JOURNAL_FILE);

  return withJournalMutationLock(home, async () => {
    const currentLock = await loadLock(lockPath);
    const currentEvents = parseJournal(await readFile(journalPath, 'utf8'), {
      featureId: migrationEvent.featureId,
    });
    validateModelHashHistory(currentEvents, currentLock.modelHash);
    if (
      currentLock.modelHash !== record.modelLock.modelHash ||
      currentEvents.length !== record.events.length
    ) {
      throw new ProtocolError(
        'MODEL_MIGRATION_CONFLICT',
        'Feature state changed after the migration impact report was prepared'
      );
    }

    await atomicReplaceFile(markerPath, stableJson(marker));
    await atomicReplaceFile(lockPath, stableJson(nextLock));
    await atomicReplaceFile(
      journalPath,
      serializeJournal([...currentEvents, migrationEvent])
    );
    await rm(markerPath, { force: true });
    return {
      mode: 'governed',
      featureHome: home,
      modelLock: nextLock,
      events: [...currentEvents, migrationEvent],
      impact,
    };
  });
}

export async function recoverPendingModelMigration(
  featureHome,
  { coreVersion = PROTOCOL_VERSION } = {}
) {
  const home = resolve(featureHome);
  const markerPath = resolve(home, MIGRATION_MARKER_FILE);
  if (!(await pathExists(markerPath))) {
    throw new ProtocolError('NO_PENDING_MIGRATION', 'No pending model migration exists');
  }
  let marker;
  try {
    marker = JSON.parse(await readFile(markerPath, 'utf8'));
  } catch (error) {
    throw new ContractError('Migration marker is not valid JSON', null, { cause: error });
  }
  if (
    marker.schemaVersion !== 1 ||
    !marker.nextLock ||
    !marker.migrationEvent ||
    marker.nextLock.modelHash !== marker.toModelHash
  ) {
    throw new ContractError('Migration marker does not satisfy the recovery contract');
  }
  validateModelLock(marker.nextLock);
  assertVersionCompatible(coreVersion, marker.nextLock.coreCompatibility);
  const lockPath = resolve(home, MODEL_LOCK_FILE);
  const journalPath = resolve(home, JOURNAL_FILE);

  await withJournalMutationLock(home, async () => {
    const currentLock = await loadLock(lockPath);
    const events = parseJournal(await readFile(journalPath, 'utf8'), {
      featureId: marker.migrationEvent.featureId,
    });
    const hasMigrationEvent = events.some(
      (event) => event.eventId === marker.migrationEvent.eventId
    );
    if (!hasMigrationEvent) {
      validateModelHashHistory(events, marker.fromModelHash);
      if (currentLock.modelHash !== marker.fromModelHash && currentLock.modelHash !== marker.toModelHash) {
        throw new ContractError('Pending migration cannot reconcile the current model lock');
      }
      const expectedSequence = events.length + 1;
      if (marker.migrationEvent.sequence !== expectedSequence) {
        throw new ContractError('Pending migration event sequence no longer follows the journal');
      }
      await atomicReplaceFile(lockPath, stableJson(marker.nextLock));
      await atomicReplaceFile(
        journalPath,
        serializeJournal([...events, marker.migrationEvent])
      );
    } else {
      const recorded = events.find(
        (event) => event.eventId === marker.migrationEvent.eventId
      );
      if (stableJson(recorded) !== stableJson(marker.migrationEvent)) {
        throw new ContractError('Pending migration event differs from the journal event');
      }
      validateModelHashHistory(events, marker.toModelHash);
      if (currentLock.modelHash !== marker.toModelHash) {
        await atomicReplaceFile(lockPath, stableJson(marker.nextLock));
      }
    }
    await rm(markerPath, { force: true });
  });
  return readFeatureRecord(home, { coreVersion });
}
