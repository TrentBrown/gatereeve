import { ContractError } from './errors.js';

export const MODULE_PROVIDER_PROTOCOL_VERSION = 1;
export const MODULE_LIVE_STATUSES = Object.freeze([
  'pending',
  'running',
  'waiting',
  'blocked',
  'unavailable',
]);

const PROVIDER_ID = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._/-]*[a-z0-9])?$/u;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const OUTCOMES = new Set([null, 'PASS', 'FAIL']);
const MAX_MESSAGE_BYTES = 1_000_000;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys, label) {
  if (!isObject(value)) throw new ContractError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ContractError(`${label} has an invalid shape`);
  }
}

function nonempty(value, label, maximum = 2_048) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximum) {
    throw new ContractError(`${label} must be a bounded nonempty string`);
  }
}

function identity(value, label) {
  exactKeys(value, ['id', 'version'], label);
  if (!PROVIDER_ID.test(value.id) || !SEMVER.test(value.version)) {
    throw new ContractError(`${label} must contain a namespaced ID and exact semantic version`);
  }
}

function moduleIdentity(value, label) {
  exactKeys(value, ['id', 'version', 'digest'], label);
  if (!PROVIDER_ID.test(value.id) || !SEMVER.test(value.version) || !SHA256.test(value.digest)) {
    throw new ContractError(`${label} is invalid`);
  }
}

function jsonValue(value, label) {
  let encoded;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new ContractError(`${label} must be JSON serializable`);
  }
  if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > MAX_MESSAGE_BYTES) {
    throw new ContractError(`${label} exceeds the provider message limit`);
  }
}

function timestamp(value, label) {
  nonempty(value, label, 128);
  if (Number.isNaN(Date.parse(value))) throw new ContractError(`${label} must be an ISO timestamp`);
}

export function validateModuleProviderRequest(value) {
  exactKeys(
    value,
    ['schemaVersion', 'requestId', 'operation', 'provider', 'module', 'input'],
    'Module provider request',
  );
  if (value.schemaVersion !== MODULE_PROVIDER_PROTOCOL_VERSION || value.operation !== 'observe') {
    throw new ContractError('Module provider request version or operation is unsupported');
  }
  nonempty(value.requestId, 'Module provider request ID', 256);
  identity(value.provider, 'Module provider identity');
  moduleIdentity(value.module, 'Module identity');
  exactKeys(
    value.input,
    ['featureId', 'attemptId', 'scope', 'inputFingerprint', 'dependencyEventIds', 'evidence'],
    'Module provider input',
  );
  nonempty(value.input.featureId, 'Module provider feature ID', 512);
  nonempty(value.input.attemptId, 'Module provider attempt ID', 512);
  if (!['SLICE', 'FEATURE', 'FEATURE_FINAL'].includes(value.input.scope)) {
    throw new ContractError('Module provider scope is invalid');
  }
  if (!SHA256.test(value.input.inputFingerprint)) {
    throw new ContractError('Module provider input fingerprint is invalid');
  }
  if (!isObject(value.input.dependencyEventIds)) {
    throw new ContractError('Module provider dependency event IDs must be an object');
  }
  for (const [key, eventId] of Object.entries(value.input.dependencyEventIds)) {
    nonempty(key, 'Module provider dependency ID', 512);
    nonempty(eventId, 'Module provider dependency event ID', 512);
  }
  jsonValue(value.input.evidence, 'Module provider input evidence');
  jsonValue(value, 'Module provider request');
  return value;
}

function validateLive(value) {
  exactKeys(
    value,
    ['status', 'detail', 'updatedAt', 'stages', 'actions', 'attempts', 'evidence', 'links', 'failure'],
    'Module provider live status',
  );
  if (!MODULE_LIVE_STATUSES.includes(value.status)) {
    throw new ContractError('Module provider live status is invalid');
  }
  if (value.detail !== null) nonempty(value.detail, 'Module provider live detail', 8_192);
  timestamp(value.updatedAt, 'Module provider live updatedAt');
  for (const field of ['stages', 'actions', 'attempts', 'evidence', 'links']) {
    if (!Array.isArray(value[field]) || value[field].some((item) => !isObject(item))) {
      throw new ContractError(`Module provider live ${field} must be an array of objects`);
    }
  }
  if (value.failure !== null && !isObject(value.failure)) {
    throw new ContractError('Module provider live failure must be null or an object');
  }
}

export function validateModuleProviderResponse(value, request = null) {
  exactKeys(
    value,
    [
      'schemaVersion', 'requestId', 'provider', 'module', 'observedInputFingerprint',
      'live', 'outcome', 'evidence',
    ],
    'Module provider response',
  );
  if (value.schemaVersion !== MODULE_PROVIDER_PROTOCOL_VERSION) {
    throw new ContractError('Module provider response version is unsupported');
  }
  nonempty(value.requestId, 'Module provider response request ID', 256);
  identity(value.provider, 'Module provider response identity');
  moduleIdentity(value.module, 'Module provider response module');
  if (!SHA256.test(value.observedInputFingerprint)) {
    throw new ContractError('Module provider observed input fingerprint is invalid');
  }
  validateLive(value.live);
  if (!OUTCOMES.has(value.outcome)) throw new ContractError('Module provider outcome is invalid');
  jsonValue(value.evidence, 'Module provider evidence');
  jsonValue(value, 'Module provider response');
  if (request !== null) {
    validateModuleProviderRequest(request);
    for (const [label, left, right] of [
      ['request ID', value.requestId, request.requestId],
      ['provider ID', value.provider.id, request.provider.id],
      ['provider version', value.provider.version, request.provider.version],
      ['module ID', value.module.id, request.module.id],
      ['module version', value.module.version, request.module.version],
      ['module digest', value.module.digest, request.module.digest],
      ['input fingerprint', value.observedInputFingerprint, request.input.inputFingerprint],
    ]) {
      if (left !== right) throw new ContractError(`Module provider returned stale or mismatched ${label}`);
    }
  }
  return value;
}

export function parseModuleProviderResponse(line, request) {
  if (typeof line !== 'string' || line.trim().length === 0) {
    throw new ContractError('Module provider returned no response');
  }
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    throw new ContractError('Module provider returned malformed JSON');
  }
  return validateModuleProviderResponse(value, request);
}

export function mapCommandCompletion({ exitCode, signal = null, timedOut = false, cancelled = false, observed = false }) {
  if (cancelled) {
    return Object.freeze({ attemptStatus: 'cancelled', outcome: 'UNSET', reason: 'Cancelled by user' });
  }
  if (timedOut) {
    return Object.freeze({ attemptStatus: 'timed-out', outcome: 'FAIL', reason: 'Command timed out' });
  }
  if (signal !== null) {
    return Object.freeze({ attemptStatus: 'failed', outcome: 'FAIL', reason: `Command exited on signal ${signal}` });
  }
  if (exitCode !== 0) {
    return Object.freeze({ attemptStatus: 'failed', outcome: 'FAIL', reason: `Command exited with code ${exitCode}` });
  }
  if (observed) {
    return Object.freeze({ attemptStatus: 'awaiting-provider', outcome: 'UNSET', reason: 'Command completed; awaiting provider' });
  }
  return Object.freeze({ attemptStatus: 'passed', outcome: 'PASS', reason: 'Command completed successfully' });
}

export function parseCommandStructuredOutput(output) {
  if (typeof output !== 'string') return null;
  const line = output.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean).at(-1);
  if (!line?.startsWith('{')) return null;
  let value;
  try { value = JSON.parse(line); }
  catch { return null; }
  if (!isObject(value)) return null;
  const keys = Object.keys(value);
  if (
    value.schemaVersion !== 1
    || keys.some((key) => !['schemaVersion', 'detail', 'evidence'].includes(key))
    || (value.detail !== undefined && (typeof value.detail !== 'string' || value.detail.length > 8_192))
  ) return null;
  jsonValue(value.evidence ?? null, 'Command structured evidence');
  return value;
}
