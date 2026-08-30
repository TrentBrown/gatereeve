import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  aggregateNativeTrustEvidenceV2,
  assertNativeTrustEvidenceV2,
  trustDigest,
} from '../src/plugin/native-trust-evidence-v2.js';

const source = { tag: 'v0.1.0-rc.9', commit: '1234567890abcdef1234567890abcdef12345678' };
const candidate = { id: 'gatereeve-v0.1.0-rc.9', version: '0.1.0-rc.9', sourceCommit: source.commit };
const artifact = {
  filename: 'GateReeve-0.1.0-rc.9-macos-universal.dmg',
  bytes: 12345,
  sha256: 'a'.repeat(64),
};
const notarization = {
  attemptId: '11111111-1111-1111-1111-111111111111',
  requestId: '22222222-2222-2222-2222-222222222222',
  status: 'Accepted',
};
const appleTrust = {
  schemaVersion: 2,
  kind: 'gatereeve-apple-trust',
  status: 'developer-id-notarized',
  source,
  candidate,
  submittedArtifact: { ...artifact, sha256: 'b'.repeat(64) },
  artifact,
  signature: {
    identity: 'Developer ID Application: Trent Brown (ABCDEFGHIJ)',
    teamId: 'ABCDEFGHIJ',
    hardenedRuntime: true,
    secureTimestamp: true,
  },
  notarization: { ...notarization, submittedArtifactSha256: 'b'.repeat(64) },
  staple: { validated: true },
  gatekeeper: { diskImage: 'accepted' },
  verifiedAt: '2026-08-30T19:00:00.000Z',
};

function nativeEvidence(architecture) {
  return {
    schemaVersion: 2,
    kind: 'gatereeve-native-trust-verification',
    source,
    candidate,
    artifact,
    runner: {
      operatingSystem: 'darwin',
      architecture,
      processArchitecture: architecture,
      native: true,
      rosettaTranslated: false,
    },
    checks: {
      dmgVerified: true,
      applicationIdentity: true,
      coordinatedVersion: true,
      universalBinaries: true,
      universalSlices: ['arm64', 'x86_64'],
      strictDeveloperIdSignature: true,
      hardenedRuntime: true,
      secureTimestamp: true,
      notarizationAccepted: true,
      stapleValidated: true,
      dmgGatekeeperAccepted: true,
      mountedApplicationGatekeeperAccepted: true,
      governedFixtureSmoke: true,
    },
    notarization,
    trust: {
      status: 'developer-id-notarized',
      identity: appleTrust.signature.identity,
      teamId: appleTrust.signature.teamId,
      hardenedRuntime: true,
      secureTimestamp: true,
      notarizationId: notarization.requestId,
      notarizationStatus: 'Accepted',
      stapled: true,
      gatekeeperAccepted: true,
      evidence: [
        `codesign:${appleTrust.signature.identity}`,
        `notarytool:${notarization.requestId}`,
        'stapler:validated',
        'spctl:accepted',
      ],
    },
    appleTrustEvidenceSha256: trustDigest(appleTrust),
    verifiedAt: `2026-08-30T19:0${architecture === 'arm64' ? '1' : '2'}:00.000Z`,
  };
}

test('GateReeve native evidence reproduces the shared exact-byte and request anchors', () => {
  const arm64 = nativeEvidence('arm64');
  const x64 = nativeEvidence('x64');
  assert.equal(assertNativeTrustEvidenceV2(arm64), arm64);
  const aggregate = aggregateNativeTrustEvidenceV2({ appleTrust, evidence: [arm64, x64] });
  assert.deepEqual(aggregate.architectures, ['arm64', 'x64']);
  assert.deepEqual(aggregate.artifact, artifact);
  assert.deepEqual(aggregate.notarization, notarization);
  assert.equal(aggregate.documents.length, 2);
});

test('the repository-local conformance fixture preserves shared semantics and GateReeve topology', async () => {
  const fixture = JSON.parse(await readFile(new URL(
    './fixtures/release-trust-conformance.json',
    import.meta.url,
  )));
  assert.deepEqual(fixture.gateReeveTopology.nativeAuthorities, ['arm64', 'x64']);
  assert.equal(fixture.gateReeveTopology.desktop, 'universal-dmg');
  assert.equal(fixture.gateReeveTopology.standaloneCli, false);
  assert(fixture.sharedInvariants.includes('notarization-request-continuity'));
  assert(fixture.commonAnchors.includes('authoritative-native-verified'));
});

test('aggregation rejects missing, duplicate, stale, altered, synthetic, and Rosetta evidence', () => {
  const arm64 = nativeEvidence('arm64');
  const x64 = nativeEvidence('x64');
  assert.throws(
    () => aggregateNativeTrustEvidenceV2({ appleTrust, evidence: [arm64] }),
    /exactly two/u,
  );
  assert.throws(
    () => aggregateNativeTrustEvidenceV2({ appleTrust, evidence: [arm64, arm64] }),
    /one ARM64 and one Intel/u,
  );
  const stale = structuredClone(x64);
  stale.source.commit = 'f'.repeat(40);
  assert.throws(
    () => aggregateNativeTrustEvidenceV2({ appleTrust, evidence: [arm64, stale] }),
    /incomplete or invalid/u,
  );
  const altered = structuredClone(x64);
  altered.artifact.sha256 = 'c'.repeat(64);
  assert.throws(
    () => aggregateNativeTrustEvidenceV2({ appleTrust, evidence: [arm64, altered] }),
    /disagree/u,
  );
  const synthetic = structuredClone(x64);
  synthetic.checks.stapleValidated = false;
  assert.throws(() => assertNativeTrustEvidenceV2(synthetic), /stapleValidated/u);
  const rosetta = structuredClone(x64);
  rosetta.runner.rosettaTranslated = true;
  assert.throws(() => assertNativeTrustEvidenceV2(rosetta), /Rosetta/u);
});
