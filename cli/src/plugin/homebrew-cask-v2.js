import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

import {
  convergeHomebrewCaskPublication,
  HOMEBREW_CASK_PATH,
  HOMEBREW_CASK_TAP,
  HOMEBREW_CASK_TOKEN,
  HOMEBREW_TAP_REPOSITORY,
  preflightHomebrewCaskRecord,
  renderHomebrewCaskIdentity,
} from './homebrew-cask.js';
import { verifyHostedPublicationPacket } from './hosted-publication-v2.js';
import { trustDigest } from './native-trust-evidence-v2.js';
import { assertReleaseLifecycleV2 } from './release-lifecycle-v2.js';
import { parseReleaseTag } from './release.js';

export const HOMEBREW_CASK_SCHEMA_VERSION_V2 = 2;

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const RELEASE_REPOSITORY = 'TrentBrown/gatereeve';

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function requireTimestamp(value, label) {
  requireString(value, label);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
}

function stage(record, name) {
  return record.stages.find((entry) => entry.stage === name) ?? null;
}

function same(left, right) {
  return trustDigest(left) === trustDigest(right);
}

function desktopIdentity(value) {
  return { filename: value?.filename, bytes: value?.bytes, sha256: value?.sha256 };
}

function publicationPlanText(record) {
  return `# GateReeve ${record.version} linked Homebrew Cask publication plan

- Cask release ID: \`${record.caskReleaseId}\`
- Primary release ID: \`${record.primary.releaseId}\`
- Primary release record SHA-256: \`${record.primary.recordSha256}\`
- Primary published stage SHA-256: \`${record.primary.publishedStageSha256}\`
- Primary publication plan SHA-256: \`${record.primary.planSha256}\`
- Primary receipts SHA-256: \`${record.primary.receiptsSha256}\`
- Source tag: \`${record.source.tag}\`
- Source commit: \`${record.source.commit}\`
- Public universal DMG: \`${record.desktop.filename}\`
- Universal DMG bytes: \`${record.desktop.bytes}\`
- Universal DMG SHA-256: \`${record.desktop.sha256}\`
- Apple signing identity: \`${record.desktop.trust.identity}\`
- Apple team ID: \`${record.desktop.trust.teamId}\`
- Apple notarization ID: \`${record.desktop.trust.notarizationId}\` (\`${record.desktop.trust.notarizationStatus}\`)
- Direct public-DMG installation and launch: confirmed by \`${record.directInstallation.confirmedBy}\` at \`${record.directInstallation.confirmedAt}\`
- Direct-install evidence SHA-256: \`${record.directInstallation.evidenceSha256}\`
- Tap repository: \`${record.cask.repository}\`
- Cask path: \`${record.cask.path}\`
- Cask token: \`${record.cask.token}\`
- Exact Cask SHA-256: \`${record.cask.sha256}\`

## Exact public mutation

1. Verify the completed primary record and exact public universal DMG.
2. Verify direct installation and launch evidence for that public DMG.
3. Publish only \`${record.cask.path}\` through the deterministic tap pull-request transport.
4. Record the exact merged commit and Cask digest; retries converge without replacing completed history.

Primary publication is already complete and remains valid if this separately approved Cask operation stays pending or fails.
`;
}

export function renderHomebrewCaskPublicationPlanV2(record) {
  assertHomebrewCaskRecordV2(record);
  return publicationPlanText(record);
}

export function homebrewCaskPlanSha256V2(record) {
  return sha256(publicationPlanText(record));
}

function assertTrust(trust) {
  const expectedEvidence = [
    `codesign:${trust?.identity}`,
    `notarytool:${trust?.notarizationId}`,
    'stapler:validated',
    'spctl:accepted',
  ];
  if (
    trust?.status !== 'developer-id-notarized'
    || typeof trust.identity !== 'string'
    || !trust.identity.startsWith('Developer ID Application: ')
    || !/^[A-Z0-9]{10}$/u.test(trust.teamId ?? '')
    || !trust.identity.endsWith(` (${trust.teamId})`)
    || trust.hardenedRuntime !== true
    || trust.secureTimestamp !== true
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(
      trust.notarizationId ?? '',
    )
    || trust.notarizationStatus !== 'Accepted'
    || trust.stapled !== true
    || trust.gatekeeperAccepted !== true
    || !same(trust.evidence, expectedEvidence)
  ) throw new Error('Homebrew Cask v2 Apple trust identity is invalid');
}

export function assertHomebrewCaskRecordV2(value) {
  const parsed = parseReleaseTag(value?.source?.tag ?? '');
  if (
    value?.schemaVersion !== HOMEBREW_CASK_SCHEMA_VERSION_V2
    || value.kind !== 'gatereeve-homebrew-cask'
    || value.caskReleaseId !== `gatereeve-cask-v${value?.version}`
    || value.source?.tag !== `v${value.version}`
    || !COMMIT.test(value.source?.commit ?? '')
    || value.source.repository !== `https://github.com/${RELEASE_REPOSITORY}`
    || value.channel !== (parsed.prerelease === null ? 'stable' : 'rc')
    || !['prepared', 'approved', 'published'].includes(value.state)
  ) throw new Error('Homebrew Cask v2 release identity is invalid');
  if (
    value.primary?.releaseId !== `gatereeve-v${value.version}`
    || !SHA256.test(value.primary.recordSha256 ?? '')
    || !SHA256.test(value.primary.publishedStageSha256 ?? '')
    || !SHA256.test(value.primary.planSha256 ?? '')
    || !SHA256.test(value.primary.receiptsSha256 ?? '')
  ) throw new Error('Homebrew Cask v2 primary publication linkage is invalid');
  if (
    typeof value.desktop?.filename !== 'string'
    || basename(value.desktop.filename) !== value.desktop.filename
    || !Number.isSafeInteger(value.desktop.bytes)
    || value.desktop.bytes < 1
    || !SHA256.test(value.desktop.sha256 ?? '')
    || value.desktop.url !== `https://github.com/${RELEASE_REPOSITORY}/releases/download/${value.source.tag}/${value.desktop.filename}`
  ) throw new Error('Homebrew Cask v2 Desktop identity is invalid');
  assertTrust(value.desktop.trust);
  const installation = value.directInstallation;
  if (
    installation?.schemaVersion !== 2
    || installation.kind !== 'gatereeve-direct-public-dmg-installation'
    || installation.status !== 'passed'
    || !same(installation.source, value.source)
    || !same(installation.artifact, desktopIdentity(value.desktop))
    || installation.checks?.installedFromPublicDmg !== true
    || installation.checks.applicationLaunched !== true
    || installation.checks.bundleIdentifier !== 'com.trentbrown.gatereeve.desktop'
    || !SHA256.test(installation.evidenceSha256 ?? '')
    || installation.evidenceSha256 !== trustDigest({
      source: installation.source,
      artifact: installation.artifact,
      confirmedBy: installation.confirmedBy,
      confirmedAt: installation.confirmedAt,
      checks: installation.checks,
    })
  ) throw new Error('Homebrew Cask v2 requires exact public-DMG install and launch evidence');
  requireString(installation.confirmedBy, 'Direct installation confirmer');
  requireTimestamp(installation.confirmedAt, 'Direct installation confirmation time');
  if (
    value.cask?.repository !== HOMEBREW_TAP_REPOSITORY
    || value.cask.tap !== HOMEBREW_CASK_TAP
    || value.cask.token !== HOMEBREW_CASK_TOKEN
    || value.cask.path !== HOMEBREW_CASK_PATH
    || value.cask.outputPath !== HOMEBREW_CASK_PATH
    || value.cask.createRepositoryIfAbsent !== true
    || !SHA256.test(value.cask.sha256 ?? '')
  ) throw new Error('Homebrew Cask v2 destination is invalid');
  const approval = value.publication?.approval;
  const surface = value.publication?.surface;
  if (!['unapproved', 'approved'].includes(approval?.state)) {
    throw new Error('Homebrew Cask v2 approval is invalid');
  }
  if (!['pending', 'complete'].includes(surface?.state)) {
    throw new Error('Homebrew Cask v2 publication surface is invalid');
  }
  if (approval.state === 'approved') {
    requireString(approval.approvedBy, 'Homebrew Cask v2 approver');
    requireTimestamp(approval.approvedAt, 'Homebrew Cask v2 approval time');
    if (approval.planSha256 !== homebrewCaskPlanSha256V2(value)) {
      throw new Error('Homebrew Cask v2 approval differs from its exact plan');
    }
  }
  if (surface.state === 'complete') {
    if (
      approval.state !== 'approved'
      || surface.receipt?.repository !== HOMEBREW_TAP_REPOSITORY
      || surface.receipt.path !== HOMEBREW_CASK_PATH
      || typeof surface.receipt.pullRequestUrl !== 'string'
      || !COMMIT.test(surface.receipt.mergeCommit ?? '')
      || surface.receipt.fileSha256 !== value.cask.sha256
    ) throw new Error('Homebrew Cask v2 publication receipt is invalid');
    requireTimestamp(surface.receipt.publishedAt, 'Homebrew Cask v2 publication time');
  } else if (surface.receipt !== null) {
    throw new Error('Pending Homebrew Cask v2 publication cannot have a receipt');
  }
  const expectedState = surface.state === 'complete'
    ? 'published' : approval.state === 'approved' ? 'approved' : 'prepared';
  if (value.state !== expectedState) throw new Error('Homebrew Cask v2 state is inconsistent');
  requireTimestamp(value.createdAt, 'Homebrew Cask v2 creation time');
  requireTimestamp(value.updatedAt, 'Homebrew Cask v2 update time');
  return value;
}

async function requireFreshOutput(path) {
  try {
    if ((await readdir(path)).length > 0) throw new Error(`Homebrew Cask output must be absent or empty: ${path}`);
    await rm(path, { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function atomicJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, stableJson(value), { flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function prepareHomebrewCaskV2({
  primaryRecordPath,
  outputRoot,
  directInstallConfirmedBy,
  directInstallConfirmedAt,
  now = () => new Date(),
}) {
  const primary = await verifyHostedPublicationPacket(primaryRecordPath);
  const published = stage(primary.record, 'published');
  if (primary.record.stages.at(-1).stage !== 'published' || published === null) {
    throw new Error('Homebrew Cask v2 requires completed primary publication');
  }
  requireString(directInstallConfirmedBy, 'Direct installation confirmer');
  requireTimestamp(directInstallConfirmedAt, 'Direct installation confirmation time');
  const output = resolve(outputRoot);
  await requireFreshOutput(output);
  const staging = `${output}.${randomUUID()}.tmp`;
  const desktop = primary.projected.candidates.desktop;
  const caskContent = renderHomebrewCaskIdentity({
    version: primary.record.version,
    digest: desktop.artifact.sha256,
  });
  const confirmedAt = new Date(directInstallConfirmedAt).toISOString();
  if (Date.parse(confirmedAt) < Date.parse(published.completedAt)) {
    throw new Error('Direct installation and launch must occur after primary publication');
  }
  const directEvidence = {
    schemaVersion: 2,
    kind: 'gatereeve-direct-public-dmg-installation',
    status: 'passed',
    source: structuredClone(primary.record.source),
    artifact: desktopIdentity(desktop.artifact),
    confirmedBy: directInstallConfirmedBy,
    confirmedAt,
    checks: {
      installedFromPublicDmg: true,
      applicationLaunched: true,
      bundleIdentifier: 'com.trentbrown.gatereeve.desktop',
    },
  };
  directEvidence.evidenceSha256 = trustDigest({
    source: directEvidence.source,
    artifact: directEvidence.artifact,
    confirmedBy: directEvidence.confirmedBy,
    confirmedAt: directEvidence.confirmedAt,
    checks: directEvidence.checks,
  });
  const createdAt = now().toISOString();
  const record = {
    schemaVersion: 2,
    kind: 'gatereeve-homebrew-cask',
    caskReleaseId: `gatereeve-cask-v${primary.record.version}`,
    version: primary.record.version,
    channel: primary.record.channel,
    source: structuredClone(primary.record.source),
    primary: {
      releaseId: primary.record.releaseId,
      recordSha256: trustDigest(primary.record),
      publishedStageSha256: published.stageSha256,
      planSha256: published.evidence.planSha256,
      receiptsSha256: published.evidence.receiptsSha256,
    },
    desktop: {
      filename: desktop.artifact.filename,
      bytes: desktop.artifact.bytes,
      sha256: desktop.artifact.sha256,
      url: `https://github.com/${RELEASE_REPOSITORY}/releases/download/${primary.record.source.tag}/${desktop.artifact.filename}`,
      trust: structuredClone(desktop.trust),
    },
    directInstallation: directEvidence,
    cask: {
      repository: HOMEBREW_TAP_REPOSITORY,
      tap: HOMEBREW_CASK_TAP,
      token: HOMEBREW_CASK_TOKEN,
      path: HOMEBREW_CASK_PATH,
      outputPath: HOMEBREW_CASK_PATH,
      sha256: sha256(caskContent),
      createRepositoryIfAbsent: true,
    },
    state: 'prepared',
    publication: {
      approval: { state: 'unapproved' },
      surface: { state: 'pending', receipt: null },
    },
    createdAt,
    updatedAt: createdAt,
  };
  assertHomebrewCaskRecordV2(record);
  try {
    await mkdir(resolve(staging, 'Casks'), { recursive: true });
    await writeFile(resolve(staging, HOMEBREW_CASK_PATH), caskContent, { flag: 'wx' });
    await writeFile(resolve(staging, 'primary-release-record.json'), stableJson(primary.record), { flag: 'wx' });
    await writeFile(resolve(staging, 'cask-record.json'), stableJson(record), { flag: 'wx' });
    await writeFile(resolve(staging, 'publication-plan.md'), publicationPlanText(record), { flag: 'wx' });
    await rename(staging, output);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return {
    outputRoot: output,
    recordPath: resolve(output, 'cask-record.json'),
    planPath: resolve(output, 'publication-plan.md'),
    caskPath: resolve(output, HOMEBREW_CASK_PATH),
    planSha256: homebrewCaskPlanSha256V2(record),
    record,
  };
}

export async function verifyHomebrewCaskWorkspaceV2(recordPath) {
  const path = resolve(recordPath);
  const root = dirname(path);
  const record = assertHomebrewCaskRecordV2(JSON.parse(await readFile(path, 'utf8')));
  const primary = assertReleaseLifecycleV2(
    JSON.parse(await readFile(resolve(root, 'primary-release-record.json'), 'utf8')),
  );
  const published = stage(primary, 'published');
  const finalized = stage(primary, 'distribution-finalized');
  if (
    primary.stages.at(-1).stage !== 'published'
    || primary.releaseId !== record.primary.releaseId
    || trustDigest(primary) !== record.primary.recordSha256
    || published?.stageSha256 !== record.primary.publishedStageSha256
    || published?.evidence?.planSha256 !== record.primary.planSha256
    || published?.evidence?.receiptsSha256 !== record.primary.receiptsSha256
    || Date.parse(record.directInstallation.confirmedAt) < Date.parse(published.completedAt)
    || !same(primary.source, record.source)
    || !same(desktopIdentity(finalized?.evidence?.candidates?.desktop?.artifact), desktopIdentity(record.desktop))
    || !same(finalized?.evidence?.candidates?.desktop?.trust, record.desktop.trust)
  ) throw new Error('Homebrew Cask v2 primary publication linkage changed');
  const cask = await readFile(resolve(root, record.cask.outputPath), 'utf8');
  if (
    sha256(cask) !== record.cask.sha256
    || cask !== renderHomebrewCaskIdentity({ version: record.version, digest: record.desktop.sha256 })
  ) throw new Error('Homebrew Cask v2 bytes changed');
  if (await readFile(resolve(root, 'publication-plan.md'), 'utf8') !== publicationPlanText(record)) {
    throw new Error('Homebrew Cask v2 publication plan changed');
  }
  return { record, root, recordPath: path };
}

export async function publishHomebrewCaskV2({
  recordPath,
  planSha256,
  approvedBy,
  confirm = false,
  dryRun = false,
  request,
  publishFile,
  now = () => new Date(),
}) {
  if (confirm === dryRun) throw new Error('Choose exactly one of confirm or dry run');
  let packet = await verifyHomebrewCaskWorkspaceV2(recordPath);
  const exactPlanSha256 = homebrewCaskPlanSha256V2(packet.record);
  if (planSha256 !== exactPlanSha256) {
    throw new Error(`Homebrew Cask v2 plan digest differs; expected ${exactPlanSha256}`);
  }
  const preflight = await preflightHomebrewCaskRecord({
    record: packet.record,
    workspaceRoot: packet.root,
    request,
  });
  if (dryRun) return { dryRun: true, ...packet, planSha256: exactPlanSha256, ...preflight };
  requireString(approvedBy, 'Homebrew Cask v2 approver');
  if (packet.record.publication.approval.state === 'unapproved') {
    const approvedAt = now().toISOString();
    packet.record = structuredClone(packet.record);
    packet.record.publication.approval = {
      state: 'approved',
      approvedBy,
      approvedAt,
      planSha256: exactPlanSha256,
      environment: 'release-publication',
    };
    packet.record.state = 'approved';
    packet.record.updatedAt = approvedAt;
    await atomicJson(packet.recordPath, packet.record);
    packet = await verifyHomebrewCaskWorkspaceV2(packet.recordPath);
  }
  if (
    packet.record.publication.approval.approvedBy !== approvedBy
    || packet.record.publication.approval.planSha256 !== exactPlanSha256
  ) throw new Error('Homebrew Cask v2 approval differs from the sealed plan or approver');
  if (packet.record.publication.surface.state === 'pending') {
    const receipt = await convergeHomebrewCaskPublication({
      record: packet.record,
      workspaceRoot: packet.root,
      planSha256: exactPlanSha256,
      request,
      publishFile,
    });
    const publishedAt = now().toISOString();
    packet.record = structuredClone(packet.record);
    packet.record.publication.surface = {
      state: 'complete',
      receipt: {
        repository: HOMEBREW_TAP_REPOSITORY,
        path: HOMEBREW_CASK_PATH,
        pullRequestUrl: receipt.pullRequestUrl,
        mergeCommit: receipt.mergeCommit,
        fileSha256: packet.record.cask.sha256,
        publishedAt,
      },
    };
    packet.record.state = 'published';
    packet.record.updatedAt = publishedAt;
    await atomicJson(packet.recordPath, packet.record);
  }
  packet = await verifyHomebrewCaskWorkspaceV2(packet.recordPath);
  return { dryRun: false, ...packet, planSha256: exactPlanSha256, tapState: 'present' };
}
