// @ts-check

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const TEAM_ID = /^[A-Z0-9]{10}$/u;
const KEY_ID = /^[A-Z0-9]{10}$/u;
const ISSUER_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const NOTARIZATION_ID = ISSUER_ID;

export const APPLE_TRUST_STATUS = 'developer-id-notarized';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function appleTrustEvidenceSha256(value) {
  assertAppleTrustEvidence(value);
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function assertArtifact(value, label) {
  if (
    typeof value?.filename !== 'string'
    || value.filename === ''
    || value.filename.includes('/')
    || value.filename.includes('\\')
    || !Number.isSafeInteger(value.bytes)
    || value.bytes < 1
    || !SHA256.test(value.sha256 ?? '')
  ) throw new Error(`${label} identity is invalid`);
  return value;
}

/** @param {unknown} value @param {string} label */
function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

/**
 * @param {{identity?: unknown, teamId?: unknown, keyId?: unknown,
 *   issuerId?: unknown}} value
 */
export function assertAppleSigningConfiguration(value) {
  const identity = requireString(value.identity, 'Developer ID identity');
  const teamId = requireString(value.teamId, 'Apple team ID');
  const keyId = requireString(value.keyId, 'Notarization key ID');
  const issuerId = requireString(value.issuerId, 'Notarization issuer ID');
  if (!TEAM_ID.test(teamId)) throw new Error('Apple team ID must contain 10 uppercase letters or digits');
  if (!KEY_ID.test(keyId)) throw new Error('Notarization key ID must contain 10 uppercase letters or digits');
  if (!ISSUER_ID.test(issuerId)) throw new Error('Notarization issuer ID must be a UUID');
  const expectedSuffix = ` (${teamId})`;
  if (!identity.startsWith('Developer ID Application: ') || !identity.endsWith(expectedSuffix)) {
    throw new Error('Developer ID identity must be an Application identity for the configured team');
  }
  return { identity, teamId, keyId, issuerId };
}

/**
 * @param {unknown} value
 * @param {{sourceTag?: string, sourceCommit?: string, version?: string,
 *   filename?: string, bytes?: number, sha256?: string}} [expected]
 */
export function assertAppleTrustEvidenceV1(value, expected = {}) {
  const candidate = /** @type {any} */ (value);
  if (
    candidate?.schemaVersion !== 1
    || candidate.kind !== 'gatereeve-apple-trust'
    || candidate.status !== APPLE_TRUST_STATUS
    || !COMMIT.test(candidate.sourceCommit ?? '')
    || typeof candidate.sourceTag !== 'string'
    || typeof candidate.version !== 'string'
    || typeof candidate.artifact?.filename !== 'string'
    || !Number.isSafeInteger(candidate.artifact?.bytes)
    || candidate.artifact.bytes < 1
    || !SHA256.test(candidate.artifact?.sha256 ?? '')
    || typeof candidate.signature?.identity !== 'string'
    || !candidate.signature.identity.startsWith('Developer ID Application: ')
    || !TEAM_ID.test(candidate.signature?.teamId ?? '')
    || candidate.signature.hardenedRuntime !== true
    || candidate.signature.secureTimestamp !== true
    || !NOTARIZATION_ID.test(candidate.notarization?.id ?? '')
    || candidate.notarization.status !== 'Accepted'
    || candidate.staple?.validated !== true
    || candidate.gatekeeper?.diskImage !== 'accepted'
    || !Number.isFinite(Date.parse(candidate.verifiedAt))
  ) {
    throw new Error('Apple trust evidence is incomplete or invalid');
  }
  if (!candidate.signature.identity.endsWith(` (${candidate.signature.teamId})`)) {
    throw new Error('Apple trust identity does not match its team ID');
  }
  for (const [field, actual] of [
    ['sourceTag', candidate.sourceTag],
    ['sourceCommit', candidate.sourceCommit],
    ['version', candidate.version],
  ]) {
    if (expected[field] !== undefined && expected[field] !== actual) {
      throw new Error(`Apple trust evidence does not match ${field}`);
    }
  }
  for (const [field, actual] of [
    ['filename', candidate.artifact.filename],
    ['bytes', candidate.artifact.bytes],
    ['sha256', candidate.artifact.sha256],
  ]) {
    if (expected[field] !== undefined && expected[field] !== actual) {
      throw new Error(`Apple trust evidence does not match artifact ${field}`);
    }
  }
  return candidate;
}

/**
 * @param {unknown} value
 * @param {{sourceTag?: string, sourceCommit?: string, version?: string,
 *   filename?: string, bytes?: number, sha256?: string}} [expected]
 */
export function assertAppleTrustEvidenceV2(value, expected = {}) {
  const candidate = /** @type {any} */ (value);
  if (
    candidate?.schemaVersion !== 2
    || candidate.kind !== 'gatereeve-apple-trust'
    || candidate.status !== APPLE_TRUST_STATUS
    || !COMMIT.test(candidate?.source?.commit ?? '')
    || typeof candidate.source.tag !== 'string'
    || candidate.source.tag !== `v${candidate?.candidate?.version}`
    || candidate.candidate.id !== `gatereeve-${candidate.source.tag}`
    || candidate.candidate.sourceCommit !== candidate.source.commit
    || typeof candidate.signature?.identity !== 'string'
    || !candidate.signature.identity.startsWith('Developer ID Application: ')
    || !TEAM_ID.test(candidate.signature?.teamId ?? '')
    || candidate.signature.hardenedRuntime !== true
    || candidate.signature.secureTimestamp !== true
    || !NOTARIZATION_ID.test(candidate.notarization?.attemptId ?? '')
    || !NOTARIZATION_ID.test(candidate.notarization?.requestId ?? '')
    || candidate.notarization.status !== 'Accepted'
    || candidate.notarization.submittedArtifactSha256 !== candidate.submittedArtifact?.sha256
    || candidate.staple?.validated !== true
    || candidate.gatekeeper?.diskImage !== 'accepted'
    || !Number.isFinite(Date.parse(candidate.verifiedAt))
  ) throw new Error('Apple trust evidence v2 is incomplete or invalid');
  assertArtifact(candidate.submittedArtifact, 'Submitted Apple artifact');
  assertArtifact(candidate.artifact, 'Final trusted Apple artifact');
  if (!candidate.signature.identity.endsWith(` (${candidate.signature.teamId})`)) {
    throw new Error('Apple trust identity does not match its team ID');
  }
  for (const [field, actual] of [
    ['sourceTag', candidate.source.tag],
    ['sourceCommit', candidate.source.commit],
    ['version', candidate.candidate.version],
  ]) {
    if (expected[field] !== undefined && expected[field] !== actual) {
      throw new Error(`Apple trust evidence does not match ${field}`);
    }
  }
  for (const [field, actual] of [
    ['filename', candidate.artifact.filename],
    ['bytes', candidate.artifact.bytes],
    ['sha256', candidate.artifact.sha256],
  ]) {
    if (expected[field] !== undefined && expected[field] !== actual) {
      throw new Error(`Apple trust evidence does not match artifact ${field}`);
    }
  }
  return candidate;
}

export function assertAppleTrustEvidence(value, expected = {}) {
  if (/** @type {any} */ (value)?.schemaVersion === 1) {
    return assertAppleTrustEvidenceV1(value, expected);
  }
  return assertAppleTrustEvidenceV2(value, expected);
}

/** @param {any} evidence */
export function coordinatedTrustFromEvidence(evidence) {
  assertAppleTrustEvidence(evidence);
  const notarizationId = evidence.schemaVersion === 2
    ? evidence.notarization.requestId
    : evidence.notarization.id;
  return {
    status: APPLE_TRUST_STATUS,
    identity: evidence.signature.identity,
    teamId: evidence.signature.teamId,
    hardenedRuntime: true,
    secureTimestamp: true,
    notarizationId,
    notarizationStatus: 'Accepted',
    stapled: true,
    gatekeeperAccepted: true,
    evidence: [
      `codesign:${evidence.signature.identity}`,
      `notarytool:${notarizationId}`,
      'stapler:validated',
      'spctl:accepted',
    ],
  };
}

/**
 * Parse the stable, non-secret facts printed by `codesign --display --verbose=4`.
 * @param {string} output
 * @param {{requireRuntime?: boolean}} [options]
 */
export function parseCodesignFacts(output, options = {}) {
  const authority = output.match(/^Authority=(Developer ID Application: .+)$/mu)?.[1];
  const teamId = output.match(/^TeamIdentifier=([A-Z0-9]{10})$/mu)?.[1];
  const timestamp = output.match(/^Timestamp=(.+)$/mu)?.[1];
  const runtime = /flags=.*\(runtime\)/u.test(output);
  assert.ok(authority, 'Developer ID authority is missing');
  assert.ok(teamId, 'Developer ID team identifier is missing');
  assert.ok(timestamp, 'Secure timestamp is missing');
  if (options.requireRuntime ?? true) {
    assert.equal(runtime, true, 'Hardened runtime flag is missing');
  }
  return {
    identity: authority,
    teamId,
    hardenedRuntime: runtime,
    secureTimestamp: true,
  };
}
