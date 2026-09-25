import { createHash } from 'node:crypto';

import { ContractError } from './errors.js';
import { stableJson } from './model.js';

export const SHA256_FINGERPRINT = /^sha256:[0-9a-f]{64}$/;

export function fingerprint(value) {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

export function gateInputFingerprint({ modelHash, attemptId, gateId, inputs }) {
  if (!SHA256_FINGERPRINT.test(modelHash)) {
    throw new ContractError('Gate fingerprint requires a valid modelHash');
  }
  if (typeof attemptId !== 'string' || typeof gateId !== 'string') {
    throw new ContractError('Gate fingerprint requires string attemptId and gateId');
  }
  if (inputs === undefined) {
    throw new ContractError('Gate fingerprint inputs must be explicit');
  }
  return fingerprint({ modelHash, attemptId, gateId, inputs });
}

export function validateEvidenceReference(evidence, { required = true } = {}) {
  if (evidence === null && !required) return null;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new ContractError('Gate evidence must be an object');
  }
  if (typeof evidence.path !== 'string' || evidence.path.length === 0) {
    throw new ContractError('Gate evidence path must be a nonempty string');
  }
  if (!SHA256_FINGERPRINT.test(evidence.hash)) {
    throw new ContractError('Gate evidence hash must be a sha256 fingerprint');
  }
  return evidence;
}
