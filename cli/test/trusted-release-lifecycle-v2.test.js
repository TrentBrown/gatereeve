import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { assertReleaseLifecycleV2 } from '../src/plugin/release-lifecycle-v2.js';
import { trustDigest } from '../src/plugin/native-trust-evidence-v2.js';
import { buildTrustedReleaseLifecycleV2 } from '../src/plugin/trusted-release-lifecycle-v2.js';

const source = {
  repository: 'https://github.com/TrentBrown/gatereeve',
  tag: 'v0.1.0-rc.9',
  commit: '1234567890abcdef1234567890abcdef12345678',
};
const submittedArtifact = {
  filename: 'GateReeve-0.1.0-rc.9-macos-universal.dmg',
  bytes: 12000,
  sha256: 'b'.repeat(64),
};
const artifact = { ...submittedArtifact, bytes: 12345, sha256: 'a'.repeat(64) };
const notarization = {
  attemptId: '11111111-1111-1111-1111-111111111111',
  requestId: '22222222-2222-2222-2222-222222222222',
  status: 'Accepted',
};
const appleTrust = {
  schemaVersion: 2,
  kind: 'gatereeve-apple-trust',
  status: 'developer-id-notarized',
  source: { tag: source.tag, commit: source.commit },
  candidate: { id: `gatereeve-${source.tag}`, version: source.tag.slice(1), sourceCommit: source.commit },
  submittedArtifact,
  artifact,
  signature: {
    identity: 'Developer ID Application: Trent Brown (ABCDEFGHIJ)',
    teamId: 'ABCDEFGHIJ',
    hardenedRuntime: true,
    secureTimestamp: true,
  },
  notarization: { ...notarization, submittedArtifactSha256: submittedArtifact.sha256 },
  staple: { validated: true },
  gatekeeper: { diskImage: 'accepted' },
  verifiedAt: '2026-08-30T20:00:00.000Z',
};
const nativeAggregate = {
  schemaVersion: 2,
  kind: 'gatereeve-native-trust-aggregate',
  source: appleTrust.source,
  candidate: appleTrust.candidate,
  artifact,
  notarization,
  appleTrustEvidenceSha256: trustDigest(appleTrust),
  architectures: ['arm64', 'x64'],
  documents: [
    { architecture: 'arm64', evidenceSha256: 'c'.repeat(64), verifiedAt: '2026-08-30T20:01:00.000Z' },
    { architecture: 'x64', evidenceSha256: 'd'.repeat(64), verifiedAt: '2026-08-30T20:02:00.000Z' },
  ],
};

async function writePluginCandidate(root, overrides = {}) {
  await writeFile(join(root, 'plugin.json'), '{"name":"gatereeve"}\n');
  await writeFile(join(root, 'RELEASE.json'), `${JSON.stringify({
    schemaVersion: 1,
    plugin: 'agentic-development-workflow',
    marketplace: 'quality-code',
    version: source.tag.slice(1),
    sourceTag: source.tag,
    sourceCommit: source.commit,
    ubuntuRcEvidence: null,
    ...overrides,
  }, null, 2)}\n`);
}

test('trusted production creates a schema-v2 lifecycle through Desktop trust', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-trusted-lifecycle-'));
  try {
    await writePluginCandidate(root);
    const record = await buildTrustedReleaseLifecycleV2({
      source,
      pluginRoot: root,
      appleTrust,
      nativeAggregate,
    });
    assert.equal(assertReleaseLifecycleV2(record), record);
    assert.deepEqual(record.stages.map((entry) => entry.stage), [
      'source-pinned',
      'policy-resolved',
      'plugin-candidate-built',
      'universal-desktop-packaged',
      'artifact-digests-established',
      'candidate-qualified',
      'trusted-universal-dmg-established',
      'authoritative-native-verified',
      'desktop-trust-verified',
    ]);
    assert.equal(record.candidate.appleArtifact.sha256, artifact.sha256);
    assert.equal(
      record.stages[6].evidence.submittedArtifact.sha256,
      submittedArtifact.sha256,
    );
    assert.deepEqual(record.stages[2].evidence.release, {
      tag: source.tag,
      version: source.tag.slice(1),
      sourceCommit: source.commit,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('trusted production rejects cross-request or changed-byte aggregation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-trusted-lifecycle-reject-'));
  try {
    await writePluginCandidate(root);
    const altered = structuredClone(nativeAggregate);
    altered.artifact.sha256 = 'e'.repeat(64);
    await assert.rejects(
      buildTrustedReleaseLifecycleV2({
        source,
        pluginRoot: root,
        appleTrust,
        nativeAggregate: altered,
      }),
      /does not match/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('trusted production rejects a same-source Plugin candidate from another RC', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-trusted-lifecycle-plugin-identity-'));
  try {
    await writePluginCandidate(root, {
      version: '0.1.0-rc.8',
      sourceTag: 'v0.1.0-rc.8',
    });
    await assert.rejects(
      buildTrustedReleaseLifecycleV2({
        source,
        pluginRoot: root,
        appleTrust,
        nativeAggregate,
      }),
      /does not match the exact tag and source commit/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
