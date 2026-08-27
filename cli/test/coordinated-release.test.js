import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import test from 'node:test';

import {
  approveCoordinatedPublication,
  assertCoordinatedPublicationReady,
  convergeCoordinatedPublication,
  prepareCoordinatedRelease,
  publicationPlanSha256,
  readCoordinatedRelease,
  recordDesktopTrust,
  verifyCoordinatedReleaseWorkspace,
  writeCoordinatedRelease,
} from '../src/plugin/coordinated-release.js';
import { prepareRelease } from '../src/plugin/release.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const sourceRoot = resolve(repositoryRoot, 'plugin-src');
const sourceCommit = '1234567890abcdef1234567890abcdef12345678';

async function candidateFixture(root, tag = 'v0.1.0-rc.7', commit = sourceCommit) {
  const pluginRoot = join(root, `plugin-${tag.replaceAll(/[^a-z0-9]/giu, '-')}`);
  let ubuntuRcEvidencePath = null;
  if (!tag.slice(1).includes('-')) {
    ubuntuRcEvidencePath = join(root, `ubuntu-${commit}.json`);
    await writeFile(ubuntuRcEvidencePath, `${JSON.stringify({
      schemaVersion: 1,
      status: 'passed',
      releaseCandidate: 'v0.1.0-rc.7',
      candidateSourceCommit: commit,
      ubuntu: { passed: true, version: '24.04' },
      platforms: {
        codex: { passed: true, transcript: 'evidence/codex.md' },
        claude: { passed: true, transcript: 'evidence/claude.md' },
      },
    })}\n`);
  }
  await prepareRelease({
    sourceRoot,
    outputRoot: pluginRoot,
    sourceTag: tag,
    sourceCommit: commit,
    ubuntuRcEvidencePath,
  });
  const dmgPath = join(root, `GateReeve-${tag.slice(1)}-macos-universal.dmg`);
  await writeFile(dmgPath, `universal-dmg-${tag}-${commit}\n`);
  const content = await readFile(dmgPath);
  const sha256 = (await import('node:crypto')).createHash('sha256').update(content).digest('hex');
  const evidencePaths = [];
  for (const architecture of ['arm64', 'x64']) {
    const path = join(root, `${tag.slice(1)}-${architecture}.json`);
    await writeFile(path, `${JSON.stringify({
      schemaVersion: 1,
      kind: 'gatereeve-desktop-package-verification',
      sourceTag: tag,
      sourceCommit: commit,
      version: tag.slice(1),
      artifact: { filename: basename(dmgPath), bytes: content.length, sha256 },
      runner: { operatingSystem: 'darwin', architecture },
      checks: {
        dmgVerified: true,
        applicationIdentity: true,
        coordinatedVersion: true,
        universalBinaries: true,
        governedFixtureSmoke: true,
      },
      trust: { status: 'development-ad-hoc' },
      verifiedAt: '2026-08-27T20:00:00.000Z',
    }, null, 2)}\n`);
    evidencePaths.push(path);
  }
  return { pluginRoot, dmgPath, evidencePaths };
}

async function preparedFixture(tag = 'v0.1.0-rc.7', commit = sourceCommit, promotion = null) {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve coordinated release '));
  const candidate = await candidateFixture(root, tag, commit);
  return prepareCoordinatedRelease({
    sourceTag: tag,
    sourceCommit: commit,
    repository: 'https://github.com/TrentBrown/gatereeve',
    pluginRoot: candidate.pluginRoot,
    desktopDmgPath: candidate.dmgPath,
    desktopEvidencePaths: candidate.evidencePaths,
    outputRoot: join(root, 'coordinated'),
    stablePromotionRecord: promotion,
    now: () => new Date('2026-08-27T20:01:00.000Z'),
  });
}

function trustedAndApproved(record) {
  const trusted = recordDesktopTrust(record, {
    status: 'developer-id-notarized',
    evidence: ['codesign', 'timestamp', 'notarization', 'stapling', 'gatekeeper'],
  }, () => new Date('2026-08-27T20:02:00.000Z'));
  return approveCoordinatedPublication(trusted, {
    approvedBy: 'Trent Brown',
    planSha256: publicationPlanSha256(trusted),
  }, () => new Date('2026-08-27T20:03:00.000Z'));
}

test('prepares one immutable Plugin and Desktop release record without publication authority', async () => {
  const result = await preparedFixture();
  const record = await readCoordinatedRelease(result.recordPath);
  assert.equal(record.releaseId, 'gatereeve-v0.1.0-rc.7');
  assert.equal(record.source.commit, sourceCommit);
  assert.equal(record.candidates.plugin.verification.status, 'passed');
  assert.deepEqual(record.candidates.desktop.verification.architectures, ['arm64', 'x64']);
  assert.equal(record.candidates.desktop.applicationVersion, '0.1.0-rc.7');
  assert.match(record.candidates.plugin.artifact.sha256, /^[a-f0-9]{64}$/u);
  assert.match(record.candidates.desktop.artifact.sha256, /^[a-f0-9]{64}$/u);
  assert.equal(record.candidates.desktop.trust.status, 'development-ad-hoc');
  assert.equal(record.publication.approval.state, 'unapproved');
  assert(record.publication.order.every(
    (surface) => record.publication.surfaces[surface].state === 'pending'
  ));
  await assert.rejects(
    async () => assertCoordinatedPublicationReady(record),
    /not approved and trusted/
  );
  assert.equal(result.planSha256, publicationPlanSha256(record));
  await assert.doesNotReject(verifyCoordinatedReleaseWorkspace(result.recordPath));
  const evidencePath = join(
    result.outputRoot,
    record.candidates.desktop.verification.evidence[0].path,
  );
  const originalEvidence = await readFile(evidencePath);
  await writeFile(evidencePath, 'changed evidence\n');
  await assert.rejects(
    verifyCoordinatedReleaseWorkspace(result.recordPath),
    /Desktop arm64 evidence changed/
  );
  await writeFile(evidencePath, originalEvidence);
  await writeFile(
    join(result.outputRoot, record.candidates.desktop.artifact.path),
    'changed candidate bytes\n'
  );
  await assert.rejects(
    verifyCoordinatedReleaseWorkspace(result.recordPath),
    /Desktop candidate identity changed/
  );
});

test('stable promotion is bound to the exact coordinated RC source', async () => {
  const rc = await preparedFixture();
  const stable = await preparedFixture('v0.1.0', sourceCommit, rc.record);
  assert.deepEqual(stable.record.promotion, {
    releaseId: rc.record.releaseId,
    tag: 'v0.1.0-rc.7',
    sourceCommit,
  });
  await assert.rejects(
    preparedFixture('v0.1.0', 'abcdef1234567890abcdef1234567890abcdef12', rc.record),
    /exact source of a coordinated RC/
  );
});

test('rejects a Desktop candidate whose release version diverges from the Plugin tag', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve version mismatch '));
  const candidate = await candidateFixture(root);
  const evidence = JSON.parse(await readFile(candidate.evidencePaths[1], 'utf8'));
  evidence.version = '0.1.0';
  await writeFile(candidate.evidencePaths[1], `${JSON.stringify(evidence, null, 2)}\n`);
  await assert.rejects(
    prepareCoordinatedRelease({
      sourceTag: 'v0.1.0-rc.7',
      sourceCommit,
      repository: 'https://github.com/TrentBrown/gatereeve',
      pluginRoot: candidate.pluginRoot,
      desktopDmgPath: candidate.dmgPath,
      desktopEvidencePaths: candidate.evidencePaths,
      outputRoot: join(root, 'coordinated'),
    }),
    /Desktop verification evidence does not match/
  );
});

test('publication resumes every partial boundary without duplicating a remote mutation', async () => {
  const surfaces = [
    'tag',
    'pluginMarketplace',
    'desktopPrerelease',
    'updateManifest',
    'earlyAccessWebsite',
  ];
  for (const failedSurface of surfaces) {
    const prepared = await preparedFixture();
    await writeCoordinatedRelease(prepared.recordPath, trustedAndApproved(prepared.record));
    const remote = new Map();
    const mutations = new Map(surfaces.map((surface) => [surface, 0]));
    let injected = false;
    const adapters = Object.fromEntries(surfaces.map((surface) => [surface, {
      async converge({ record }) {
        const existing = remote.get(surface);
        if (existing) return { identity: existing };
        const identity = `${surface}:${record.source.tag}:${record.source.commit}`;
        remote.set(surface, identity);
        mutations.set(surface, mutations.get(surface) + 1);
        if (surface === failedSurface && !injected) {
          injected = true;
          throw new Error(`injected failure after ${surface} remote mutation`);
        }
        return { identity };
      },
    }]));

    await assert.rejects(
      convergeCoordinatedPublication({ recordPath: prepared.recordPath, adapters }),
      new RegExp(`injected failure after ${failedSurface}`)
    );
    const partial = await readCoordinatedRelease(prepared.recordPath);
    assert.equal(partial.publication.surfaces[failedSurface].state, 'pending');
    const finished = await convergeCoordinatedPublication({
      recordPath: prepared.recordPath,
      adapters,
    });
    assert.equal(finished.state, 'published');
    assert.deepEqual(Object.fromEntries(mutations), Object.fromEntries(
      surfaces.map((surface) => [surface, 1])
    ));
  }
});
