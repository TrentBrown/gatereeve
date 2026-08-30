import { createHash } from 'node:crypto';

const COMMIT = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const ARCHITECTURES = Object.freeze(['arm64', 'x64']);
const REQUIRED_CHECKS = Object.freeze([
  'dmgVerified',
  'applicationIdentity',
  'coordinatedVersion',
  'universalBinaries',
  'strictDeveloperIdSignature',
  'hardenedRuntime',
  'secureTimestamp',
  'notarizationAccepted',
  'stapleValidated',
  'dmgGatekeeperAccepted',
  'mountedApplicationGatekeeperAccepted',
  'governedFixtureSmoke',
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function trustDigest(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function artifact(value) {
  if (
    typeof value?.filename !== 'string'
    || value.filename === ''
    || value.filename.includes('/')
    || value.filename.includes('\\')
    || !Number.isSafeInteger(value.bytes)
    || value.bytes < 1
    || !SHA256.test(value.sha256 ?? '')
  ) throw new Error('Native trust artifact identity is invalid');
  return { filename: value.filename, bytes: value.bytes, sha256: value.sha256 };
}

function same(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

export function assertNativeTrustEvidenceV2(value) {
  if (
    value?.schemaVersion !== 2
    || value.kind !== 'gatereeve-native-trust-verification'
    || !COMMIT.test(value?.source?.commit ?? '')
    || typeof value.source.tag !== 'string'
    || value.source.tag !== `v${value?.candidate?.version}`
    || value.candidate.id !== `gatereeve-${value.source.tag}`
    || value.candidate.sourceCommit !== value.source.commit
    || value?.runner?.operatingSystem !== 'darwin'
    || !ARCHITECTURES.includes(value.runner.architecture)
    || value.runner.native !== true
    || value.runner.processArchitecture !== value.runner.architecture
    || !UUID.test(value?.notarization?.attemptId ?? '')
    || !UUID.test(value.notarization.requestId ?? '')
    || value.notarization.status !== 'Accepted'
    || !SHA256.test(value.appleTrustEvidenceSha256 ?? '')
    || !Number.isFinite(Date.parse(value.verifiedAt))
  ) throw new Error('Native trust evidence v2 is incomplete or invalid');
  artifact(value.artifact);
  for (const check of REQUIRED_CHECKS) {
    if (value.checks?.[check] !== true) {
      throw new Error(`Native trust evidence is missing required check ${check}`);
    }
  }
  if (!same(value.checks.universalSlices, ['arm64', 'x86_64'])) {
    throw new Error('Native trust evidence must verify exactly the universal ARM64 and Intel slices');
  }
  if (value.runner.rosettaTranslated !== false) {
    throw new Error('Native authority cannot be Rosetta-substituted');
  }
  if (
    value?.trust?.status !== 'developer-id-notarized'
    || typeof value.trust.identity !== 'string'
    || !value.trust.identity.startsWith('Developer ID Application: ')
    || !/^[A-Z0-9]{10}$/u.test(value.trust.teamId ?? '')
    || !value.trust.identity.endsWith(` (${value.trust.teamId})`)
    || value.trust.hardenedRuntime !== true
    || value.trust.secureTimestamp !== true
    || value.trust.notarizationId !== value.notarization.requestId
    || value.trust.notarizationStatus !== 'Accepted'
    || value.trust.stapled !== true
    || value.trust.gatekeeperAccepted !== true
    || !same(value.trust.evidence, [
      `codesign:${value.trust.identity}`,
      `notarytool:${value.notarization.requestId}`,
      'stapler:validated',
      'spctl:accepted',
    ])
  ) {
    throw new Error('Native trust evidence contains contradictory Developer ID trust facts');
  }
  return value;
}

export function assertNativeTrustAggregateV2(value, appleTrust) {
  const expectedNotarization = {
    attemptId: appleTrust?.notarization?.attemptId,
    requestId: appleTrust?.notarization?.requestId,
    status: appleTrust?.notarization?.status,
  };
  if (
    value?.schemaVersion !== 2
    || value.kind !== 'gatereeve-native-trust-aggregate'
    || !same(value.source, appleTrust?.source)
    || !same(value.candidate, appleTrust?.candidate)
    || !same(value.artifact, artifact(appleTrust?.artifact))
    || !same(value.notarization, expectedNotarization)
    || value.appleTrustEvidenceSha256 !== trustDigest(appleTrust)
    || !same(value.architectures, ARCHITECTURES)
    || !Array.isArray(value.documents)
    || value.documents.length !== ARCHITECTURES.length
  ) throw new Error('Native trust aggregate does not match the exact Apple trust evidence');
  const architectures = value.documents.map((document) => document?.architecture).sort();
  if (
    !same(architectures, [...ARCHITECTURES].sort())
    || value.documents.some((document) => (
      !SHA256.test(document?.evidenceSha256 ?? '')
      || !Number.isFinite(Date.parse(document?.verifiedAt))
    ))
  ) throw new Error('Native trust aggregate documents are incomplete or duplicated');
  return value;
}

export function aggregateNativeTrustEvidenceV2({ appleTrust, evidence }) {
  if (
    appleTrust?.schemaVersion !== 2
    || appleTrust.kind !== 'gatereeve-apple-trust'
    || appleTrust.status !== 'developer-id-notarized'
    || !Array.isArray(evidence)
    || evidence.length !== ARCHITECTURES.length
  ) throw new Error('Native trust aggregation requires Apple trust v2 and exactly two documents');
  const validated = evidence.map(assertNativeTrustEvidenceV2);
  const architectures = validated.map((item) => item.runner.architecture).sort();
  if (!same(architectures, [...ARCHITECTURES].sort())) {
    throw new Error('Native trust aggregation requires one ARM64 and one Intel document');
  }
  const appleTrustEvidenceSha256 = trustDigest(appleTrust);
  const expected = {
    source: appleTrust.source,
    candidate: appleTrust.candidate,
    artifact: artifact(appleTrust.artifact),
    notarization: {
      attemptId: appleTrust.notarization.attemptId,
      requestId: appleTrust.notarization.requestId,
      status: appleTrust.notarization.status,
    },
    appleTrustEvidenceSha256,
  };
  for (const item of validated) {
    const actual = {
      source: item.source,
      candidate: item.candidate,
      artifact: artifact(item.artifact),
      notarization: item.notarization,
      appleTrustEvidenceSha256: item.appleTrustEvidenceSha256,
    };
    if (!same(actual, expected)) {
      throw new Error('Native trust documents disagree about source, candidate, request, or exact DMG');
    }
  }
  const aggregate = {
    schemaVersion: 2,
    kind: 'gatereeve-native-trust-aggregate',
    source: structuredClone(expected.source),
    candidate: structuredClone(expected.candidate),
    artifact: structuredClone(expected.artifact),
    notarization: structuredClone(expected.notarization),
    appleTrustEvidenceSha256,
    architectures: [...ARCHITECTURES],
    documents: validated.map((item) => ({
      architecture: item.runner.architecture,
      evidenceSha256: trustDigest(item),
      verifiedAt: item.verifiedAt,
    })),
  };
  return assertNativeTrustAggregateV2(aggregate, appleTrust);
}

export const NATIVE_TRUST_ARCHITECTURES_V2 = ARCHITECTURES;
export const NATIVE_TRUST_REQUIRED_CHECKS_V2 = REQUIRED_CHECKS;
