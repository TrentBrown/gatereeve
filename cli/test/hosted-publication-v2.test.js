import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  finalizeHostedPublicationV2,
  publishHostedReleaseV2,
  verifyHostedPublicationPacket,
} from '../src/plugin/hosted-publication-v2.js';
import {
  homebrewCaskPlanSha256V2,
  prepareHomebrewCaskV2,
  publishHomebrewCaskV2,
  verifyHomebrewCaskWorkspaceV2,
} from '../src/plugin/homebrew-cask-v2.js';
import {
  aggregateNativeTrustEvidenceV2,
  NATIVE_TRUST_REQUIRED_CHECKS_V2,
  trustDigest,
} from '../src/plugin/native-trust-evidence-v2.js';
import { buildTrustedReleaseLifecycleV2 } from '../src/plugin/trusted-release-lifecycle-v2.js';
import { writePluginCandidateFixture } from './helpers/plugin-candidate.js';

const source = {
  repository: 'https://github.com/TrentBrown/gatereeve',
  tag: 'v0.1.0-rc.9',
  commit: '1234567890abcdef1234567890abcdef12345678',
};

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-hosted-publication-'));
  const pluginRoot = join(root, 'plugin');
  const pluginIntegrityPath = await writePluginCandidateFixture({ root: pluginRoot, source });
  const dmgContent = Buffer.from('final trusted universal dmg\n');
  const dmgPath = join(root, `GateReeve-${source.tag.slice(1)}-macos-universal.dmg`);
  await writeFile(dmgPath, dmgContent);
  const submittedArtifact = {
    filename: dmgPath.split('/').at(-1),
    bytes: 20,
    sha256: 'b'.repeat(64),
  };
  const artifact = {
    filename: dmgPath.split('/').at(-1),
    bytes: dmgContent.length,
    sha256: sha256(dmgContent),
  };
  const notarization = {
    attemptId: '11111111-1111-1111-1111-111111111111',
    requestId: '22222222-2222-2222-2222-222222222222',
    status: 'Accepted',
  };
  const trust = {
    status: 'developer-id-notarized',
    identity: 'Developer ID Application: Trent Brown (ABCDEFGHIJ)',
    teamId: 'ABCDEFGHIJ',
    hardenedRuntime: true,
    secureTimestamp: true,
    notarizationId: notarization.requestId,
    notarizationStatus: 'Accepted',
    stapled: true,
    gatekeeperAccepted: true,
    evidence: [
      'codesign:Developer ID Application: Trent Brown (ABCDEFGHIJ)',
      `notarytool:${notarization.requestId}`,
      'stapler:validated',
      'spctl:accepted',
    ],
  };
  const appleTrust = {
    schemaVersion: 2,
    kind: 'gatereeve-apple-trust',
    status: 'developer-id-notarized',
    source: { tag: source.tag, commit: source.commit },
    candidate: {
      id: `gatereeve-${source.tag}`,
      version: source.tag.slice(1),
      sourceCommit: source.commit,
    },
    submittedArtifact,
    artifact,
    signature: {
      identity: trust.identity,
      teamId: trust.teamId,
      hardenedRuntime: true,
      secureTimestamp: true,
    },
    notarization: { ...notarization, submittedArtifactSha256: submittedArtifact.sha256 },
    staple: { validated: true },
    gatekeeper: { diskImage: 'accepted' },
    verifiedAt: '2026-08-30T20:00:00.000Z',
  };
  const evidencePaths = [];
  const evidence = [];
  for (const [index, architecture] of ['arm64', 'x64'].entries()) {
    const checks = Object.fromEntries(NATIVE_TRUST_REQUIRED_CHECKS_V2.map((name) => [name, true]));
    checks.universalSlices = ['arm64', 'x86_64'];
    const document = {
      schemaVersion: 2,
      kind: 'gatereeve-native-trust-verification',
      source: appleTrust.source,
      candidate: appleTrust.candidate,
      artifact,
      notarization,
      appleTrustEvidenceSha256: trustDigest(appleTrust),
      runner: {
        operatingSystem: 'darwin',
        architecture,
        native: true,
        processArchitecture: architecture,
        rosettaTranslated: false,
      },
      checks,
      trust,
      verifiedAt: `2026-08-30T20:0${index + 1}:00.000Z`,
    };
    const path = join(root, `desktop-${architecture}.json`);
    await writeFile(path, `${JSON.stringify(document, null, 2)}\n`);
    evidence.push(document);
    evidencePaths.push(path);
  }
  const nativeAggregate = aggregateNativeTrustEvidenceV2({ appleTrust, evidence });
  const trusted = await buildTrustedReleaseLifecycleV2({
    source,
    pluginRoot,
    pluginIntegrityPath,
    appleTrust,
    nativeAggregate,
    now: () => new Date('2026-08-30T20:03:00.000Z'),
  });
  const trustedRecordPath = join(root, 'trusted-release.json');
  await writeFile(trustedRecordPath, `${JSON.stringify(trusted, null, 2)}\n`);
  const currentUpdateManifestPath = join(root, 'desktop.json');
  await writeFile(currentUpdateManifestPath, `${JSON.stringify({
    schemaVersion: 1,
    product: 'gatereeve-desktop',
    generatedAt: null,
    channels: { stable: null, rc: null },
  }, null, 2)}\n`);
  return {
    root,
    pluginRoot,
    pluginIntegrityPath,
    dmgPath,
    evidencePaths,
    trustedRecordPath,
    currentUpdateManifestPath,
    outputRoot: join(root, 'packet'),
  };
}

test('finalizes trusted schema-v2 bytes into one sealed hosted publication packet', async () => {
  const value = await fixture();
  try {
    const result = await finalizeHostedPublicationV2({
      trustedRecordPath: value.trustedRecordPath,
      pluginRoot: value.pluginRoot,
      pluginIntegrityPath: value.pluginIntegrityPath,
      desktopDmgPath: value.dmgPath,
      desktopEvidencePaths: value.evidencePaths,
      currentUpdateManifestPath: value.currentUpdateManifestPath,
      outputRoot: value.outputRoot,
      now: () => new Date('2026-08-30T20:04:00.000Z'),
    });
    assert.equal(result.record.schemaVersion, 2);
    assert.equal(result.record.stages.at(-1).stage, 'distribution-finalized');
    assert.match(result.planSha256, /^[a-f0-9]{64}$/u);
    const verified = await verifyHostedPublicationPacket(result.recordPath);
    assert.equal(verified.projected.schemaVersion, 1);
    assert.equal(verified.receipts.schemaVersion, 2);
    assert.equal(verified.receipts.receipts.length, 0);
    const catalogPath = join(
      result.outputRoot,
      'plugin/marketplace/.agents/plugins/marketplace.json',
    );
    const catalogBytes = await readFile(catalogPath);
    await writeFile(catalogPath, '{"changed":true}\n');
    await assert.rejects(
      verifyHostedPublicationPacket(result.recordPath),
      /producer integrity manifest/u,
    );
    await writeFile(catalogPath, catalogBytes);
    const changed = JSON.parse(await readFile(result.recordPath, 'utf8'));
    changed.stages.at(-1).evidence.planSha256 = '0'.repeat(64);
    await writeFile(result.recordPath, `${JSON.stringify(changed, null, 2)}\n`);
    await assert.rejects(verifyHostedPublicationPacket(result.recordPath), /immutable evidence/u);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test('rejects finalization inputs that differ from the trusted lifecycle', async () => {
  const value = await fixture();
  try {
    await writeFile(join(value.pluginRoot, 'untrusted-addition.txt'), 'different Plugin tree\n');
    await assert.rejects(finalizeHostedPublicationV2({
      trustedRecordPath: value.trustedRecordPath,
      pluginRoot: value.pluginRoot,
      pluginIntegrityPath: value.pluginIntegrityPath,
      desktopDmgPath: value.dmgPath,
      desktopEvidencePaths: value.evidencePaths,
      currentUpdateManifestPath: value.currentUpdateManifestPath,
      outputRoot: value.outputRoot,
    }), /Plugin candidate tree differs from its producer integrity manifest/u);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test('dry run performs only preflights and real retry records each surface once', async () => {
  const value = await fixture();
  try {
    const finalized = await finalizeHostedPublicationV2({
      trustedRecordPath: value.trustedRecordPath,
      pluginRoot: value.pluginRoot,
      pluginIntegrityPath: value.pluginIntegrityPath,
      desktopDmgPath: value.dmgPath,
      desktopEvidencePaths: value.evidencePaths,
      currentUpdateManifestPath: value.currentUpdateManifestPath,
      outputRoot: value.outputRoot,
      now: () => new Date('2026-08-30T20:04:00.000Z'),
    });
    const calls = [];
    const adapters = Object.fromEntries([
      'tag', 'pluginMarketplace', 'desktopPrerelease', 'updateManifest', 'earlyAccessWebsite',
    ].map((surface) => [surface, {
      async preflight() { calls.push(`preflight:${surface}`); },
      async converge() { calls.push(`converge:${surface}`); return { identity: `${surface}:exact` }; },
    }]));
    const dryRun = await publishHostedReleaseV2({
      recordPath: finalized.recordPath,
      repositoryRoot: value.root,
      planSha256: finalized.planSha256,
      dryRun: true,
      adapters,
    });
    assert.equal(dryRun.dryRun, true);
    assert(calls.every((call) => call.startsWith('preflight:')));
    calls.length = 0;
    const published = await publishHostedReleaseV2({
      recordPath: finalized.recordPath,
      repositoryRoot: value.root,
      planSha256: finalized.planSha256,
      approvedBy: 'Trent Brown',
      confirm: true,
      adapters,
      now: (() => {
        let second = 5;
        return () => new Date(`2026-08-30T20:04:${String(second++).padStart(2, '0')}.000Z`);
      })(),
    });
    assert.equal(published.record.stages.at(-1).stage, 'published');
    assert.equal(published.receipts.receipts.length, 5);
    assert.equal(calls.filter((call) => call.startsWith('converge:')).length, 5);
    calls.length = 0;
    const retry = await publishHostedReleaseV2({
      recordPath: finalized.recordPath,
      repositoryRoot: value.root,
      planSha256: finalized.planSha256,
      approvedBy: 'Trent Brown',
      confirm: true,
      adapters,
    });
    assert.equal(retry.record.stages.at(-1).stage, 'published');
    assert.equal(calls.filter((call) => call.startsWith('converge:')).length, 0);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test('keeps Cask pending until primary publication and then links one idempotent receipt', async () => {
  const value = await fixture();
  try {
    const finalized = await finalizeHostedPublicationV2({
      trustedRecordPath: value.trustedRecordPath,
      pluginRoot: value.pluginRoot,
      pluginIntegrityPath: value.pluginIntegrityPath,
      desktopDmgPath: value.dmgPath,
      desktopEvidencePaths: value.evidencePaths,
      currentUpdateManifestPath: value.currentUpdateManifestPath,
      outputRoot: value.outputRoot,
      now: () => new Date('2026-08-30T20:04:00.000Z'),
    });
    await assert.rejects(prepareHomebrewCaskV2({
      primaryRecordPath: finalized.recordPath,
      outputRoot: join(value.root, 'premature-cask'),
      directInstallConfirmedBy: 'Trent Brown',
      directInstallConfirmedAt: '2026-08-30T20:10:00.000Z',
    }), /completed primary publication/u);
    const primaryAdapters = Object.fromEntries([
      'tag', 'pluginMarketplace', 'desktopPrerelease', 'updateManifest', 'earlyAccessWebsite',
    ].map((surface) => [surface, {
      async preflight() {},
      async converge() { return { identity: `${surface}:exact` }; },
    }]));
    await publishHostedReleaseV2({
      recordPath: finalized.recordPath,
      repositoryRoot: value.root,
      planSha256: finalized.planSha256,
      approvedBy: 'Trent Brown',
      confirm: true,
      adapters: primaryAdapters,
      now: (() => {
        let second = 11;
        return () => new Date(`2026-08-30T20:10:${String(second++).padStart(2, '0')}.000Z`);
      })(),
    });
    const cask = await prepareHomebrewCaskV2({
      primaryRecordPath: finalized.recordPath,
      outputRoot: join(value.root, 'cask'),
      directInstallConfirmedBy: 'Trent Brown',
      directInstallConfirmedAt: '2026-08-30T20:11:00.000Z',
      now: () => new Date('2026-08-30T20:12:00.000Z'),
    });
    assert.equal(cask.record.state, 'prepared');
    assert.equal(cask.record.directInstallation.checks.applicationLaunched, true);
    await assert.doesNotReject(verifyHomebrewCaskWorkspaceV2(cask.recordPath));
    const primaryRecordPath = join(cask.outputRoot, 'primary-release-record.json');
    const primaryRecordBytes = await readFile(primaryRecordPath, 'utf8');
    const changedPrimary = JSON.parse(primaryRecordBytes);
    changedPrimary.stages.at(-1).evidence.receiptsSha256 = '0'.repeat(64);
    await writeFile(primaryRecordPath, `${JSON.stringify(changedPrimary, null, 2)}\n`);
    await assert.rejects(
      verifyHomebrewCaskWorkspaceV2(cask.recordPath),
      /immutable evidence|primary publication linkage changed/u,
    );
    await writeFile(primaryRecordPath, primaryRecordBytes);
    let publicCask = null;
    let mutationCount = 0;
    const request = async (request_) => {
      if (request_.method && request_.method !== 'GET') mutationCount += 1;
      if (request_.endpoint.includes('/releases/tags/')) {
        return {
          tag_name: cask.record.source.tag,
          prerelease: true,
          target_commitish: cask.record.source.commit,
          assets: [{
            name: cask.record.desktop.filename,
            size: cask.record.desktop.bytes,
            digest: `sha256:${cask.record.desktop.sha256}`,
          }],
        };
      }
      if (request_.endpoint === 'repos/TrentBrown/homebrew-gatereeve') {
        return {
          full_name: 'TrentBrown/homebrew-gatereeve',
          private: false,
          default_branch: 'main',
          owner: { login: 'TrentBrown' },
        };
      }
      if (request_.endpoint === 'repos/TrentBrown/homebrew-gatereeve/branches/main') {
        return { name: 'main' };
      }
      if (request_.endpoint.startsWith('repos/TrentBrown/homebrew-gatereeve/contents/')) {
        return publicCask === null ? null : {
          type: 'file',
          sha: 'public-cask',
          content: Buffer.from(publicCask).toString('base64'),
        };
      }
      throw new Error(`Unexpected request: ${request_.endpoint}`);
    };
    const dryRun = await publishHomebrewCaskV2({
      recordPath: cask.recordPath,
      planSha256: homebrewCaskPlanSha256V2(cask.record),
      dryRun: true,
      request,
    });
    assert.equal(dryRun.dryRun, true);
    assert.equal(mutationCount, 0);
    let publicationCalls = 0;
    const publishFile = async ({ content }) => {
      publicationCalls += 1;
      publicCask = content;
      return {
        pullRequestUrl: 'https://github.com/TrentBrown/homebrew-gatereeve/pull/10',
        mergeCommit: 'a'.repeat(40),
      };
    };
    const published = await publishHomebrewCaskV2({
      recordPath: cask.recordPath,
      planSha256: cask.planSha256,
      approvedBy: 'Trent Brown',
      confirm: true,
      request,
      publishFile,
      now: (() => {
        let minute = 13;
        return () => new Date(`2026-08-30T20:${String(minute++).padStart(2, '0')}:00.000Z`);
      })(),
    });
    assert.equal(published.record.state, 'published');
    assert.equal(publicationCalls, 1);
    const retry = await publishHomebrewCaskV2({
      recordPath: cask.recordPath,
      planSha256: cask.planSha256,
      approvedBy: 'Trent Brown',
      confirm: true,
      request,
      publishFile,
    });
    assert.equal(retry.record.state, 'published');
    assert.equal(publicationCalls, 1);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
