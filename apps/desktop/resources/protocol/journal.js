import { randomUUID } from 'node:crypto';
import { open, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { EVENT_SCHEMA_VERSION, EVENT_TYPES } from './constants.js';
import { ContractError, ProtocolError } from './errors.js';
import { normalizeValue, validateEvent } from './model.js';
import { atomicReplaceFile } from './storage.js';

export const JOURNAL_FILE = 'events.jsonl';
export const JOURNAL_LOCK_FILE = 'events.jsonl.lock';

export function createEvent({
  sequence,
  featureId,
  type,
  modelHash,
  actor,
  payload = {},
  recordedAt = new Date().toISOString(),
  eventId = `evt-${randomUUID()}`,
}) {
  if (!EVENT_TYPES.includes(type)) {
    throw new ContractError(`Unknown event type: ${type}`);
  }
  const event = normalizeValue({
    schemaVersion: EVENT_SCHEMA_VERSION,
    sequence,
    eventId,
    featureId,
    recordedAt,
    type,
    modelHash,
    actor,
    payload,
  });
  return validateEvent(event);
}

export function serializeJournal(events) {
  return events.map((event) => JSON.stringify(normalizeValue(event))).join('\n') + '\n';
}

export function parseJournal(text, { featureId = null, allowedModelHashes = null } = {}) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new ContractError('Event journal must contain at least one event');
  }
  if (!text.endsWith('\n')) {
    throw new ContractError('Event journal must end with a newline');
  }
  const lines = text.slice(0, -1).split('\n');
  const events = [];
  const eventIds = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    let event;
    try {
      event = JSON.parse(lines[index]);
    } catch (error) {
      throw new ContractError(`Event journal line ${index + 1} is not valid JSON`, null, {
        cause: error,
      });
    }
    validateEvent(event);
    const expectedSequence = index + 1;
    if (event.sequence !== expectedSequence) {
      throw new ContractError(
        `Event sequence ${event.sequence} is invalid; expected ${expectedSequence}`
      );
    }
    if (eventIds.has(event.eventId)) {
      throw new ContractError(`Duplicate event ID: ${event.eventId}`);
    }
    eventIds.add(event.eventId);
    if (featureId !== null && event.featureId !== featureId) {
      throw new ContractError(
        `Event ${event.eventId} belongs to ${event.featureId}, expected ${featureId}`
      );
    }
    if (allowedModelHashes !== null && !allowedModelHashes.has(event.modelHash)) {
      throw new ContractError(`Event ${event.eventId} references an unknown model hash`);
    }
    events.push(event);
  }
  return events;
}

export async function readJournal(featureHome, options = {}) {
  const path = resolve(featureHome, JOURNAL_FILE);
  const text = await readFile(path, 'utf8');
  return parseJournal(text, options);
}

async function acquireJournalLock(featureHome) {
  const path = resolve(featureHome, JOURNAL_LOCK_FILE);
  let handle;
  try {
    handle = await open(path, 'wx', 0o600);
    await handle.writeFile(
      `${JSON.stringify({ schemaVersion: 1, pid: process.pid, createdAt: new Date().toISOString() })}\n`,
      'utf8'
    );
    await handle.sync();
    return { path, handle };
  } catch (error) {
    if (handle) await handle.close();
    if (error?.code === 'EEXIST') {
      throw new ProtocolError(
        'JOURNAL_LOCKED',
        'The event journal is locked by another mutation; inspect the lock before retrying',
        { path }
      );
    }
    throw error;
  }
}

async function releaseJournalLock(lock) {
  await lock.handle.close();
  await rm(lock.path, { force: true });
}

export async function withJournalMutationLock(featureHome, mutation) {
  const lock = await acquireJournalLock(featureHome);
  try {
    return await mutation();
  } finally {
    await releaseJournalLock(lock);
  }
}

export function validateModelHashHistory(events, currentModelHash) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new ContractError('Model hash history requires at least one event');
  }
  let activeHash = events[0].modelHash;
  for (const event of events) {
    if (event.type === 'MODEL_MIGRATED') {
      const { fromModelHash, toModelHash } = event.payload;
      if (fromModelHash !== activeHash || event.modelHash !== toModelHash) {
        throw new ContractError(`Model migration event ${event.eventId} has an invalid hash chain`);
      }
      activeHash = toModelHash;
      continue;
    }
    if (event.modelHash !== activeHash) {
      throw new ContractError(
        `Event ${event.eventId} references ${event.modelHash}, expected ${activeHash}`
      );
    }
  }
  if (activeHash !== currentModelHash) {
    throw new ContractError(
      `Journal ends at model ${activeHash}, but the lock contains ${currentModelHash}`
    );
  }
}

export async function appendEvent(
  featureHome,
  event,
  {
    featureId = event.featureId,
    currentModelHash = event.modelHash,
    allowedModelHashes = null,
  } = {}
) {
  validateEvent(event);
  return withJournalMutationLock(featureHome, async () => {
    const events = await readJournal(featureHome, { featureId });
    const expectedCurrentHash =
      allowedModelHashes?.size === 1 ? [...allowedModelHashes][0] : currentModelHash;
    validateModelHashHistory(events, expectedCurrentHash);
    const expectedSequence = events.length + 1;
    if (event.sequence !== expectedSequence) {
      throw new ProtocolError(
        'EVENT_SEQUENCE_CONFLICT',
        `Event sequence ${event.sequence} is stale; expected ${expectedSequence}`,
        { expectedSequence, actualSequence: event.sequence }
      );
    }
    if (events.some((item) => item.eventId === event.eventId)) {
      throw new ProtocolError('EVENT_ID_CONFLICT', `Event ID already exists: ${event.eventId}`);
    }
    if (event.featureId !== featureId) {
      throw new ContractError(`Event featureId must be ${featureId}`);
    }
    if (event.modelHash !== expectedCurrentHash) {
      throw new ContractError(
        `Event ${event.eventId} references ${event.modelHash}, expected ${expectedCurrentHash}`
      );
    }
    const updated = [...events, event];
    await atomicReplaceFile(resolve(featureHome, JOURNAL_FILE), serializeJournal(updated));
    return updated;
  });
}
