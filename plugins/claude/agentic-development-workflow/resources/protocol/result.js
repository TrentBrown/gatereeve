import { RESULT_SCHEMA_VERSION } from './constants.js';
import { ContractError, ProtocolError } from './errors.js';

function assertCommand(command) {
  if (typeof command !== 'string' || command.trim().length === 0) {
    throw new ContractError('Result command must be a nonempty string');
  }
  return command.trim();
}

function normalizeWarnings(warnings) {
  if (!Array.isArray(warnings) || warnings.some((item) => typeof item !== 'string')) {
    throw new ContractError('Result warnings must be an array of strings');
  }
  return [...warnings];
}

export function successResult(command, data, { warnings = [] } = {}) {
  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    ok: true,
    command: assertCommand(command),
    data: data ?? null,
    error: null,
    warnings: normalizeWarnings(warnings),
  };
}

export function failureResult(command, error, { warnings = [] } = {}) {
  const normalized = error instanceof ProtocolError
    ? error
    : new ProtocolError('INTERNAL_ERROR', error instanceof Error ? error.message : String(error));

  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    ok: false,
    command: assertCommand(command),
    data: null,
    error: {
      code: normalized.code,
      message: normalized.message,
      details: normalized.details ?? null,
    },
    warnings: normalizeWarnings(warnings),
  };
}

export function validateResultEnvelope(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new ContractError('Result envelope must be an object');
  }
  if (result.schemaVersion !== RESULT_SCHEMA_VERSION) {
    throw new ContractError(`Result schemaVersion must be ${RESULT_SCHEMA_VERSION}`);
  }
  assertCommand(result.command);
  normalizeWarnings(result.warnings);
  if (typeof result.ok !== 'boolean') {
    throw new ContractError('Result ok must be boolean');
  }
  if (result.ok && (result.error !== null || !('data' in result))) {
    throw new ContractError('Successful result must contain data and a null error');
  }
  if (!result.ok) {
    if (result.data !== null || !result.error || typeof result.error !== 'object') {
      throw new ContractError('Failed result must contain a null data field and an error');
    }
    if (
      typeof result.error.code !== 'string' ||
      typeof result.error.message !== 'string' ||
      !('details' in result.error)
    ) {
      throw new ContractError('Failed result error must contain code, message, and details');
    }
  }
  return result;
}
