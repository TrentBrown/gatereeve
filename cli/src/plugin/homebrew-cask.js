import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

import {
  assertCoordinatedRelease,
  readCoordinatedRelease,
  verifyCoordinatedReleaseWorkspace,
} from './coordinated-release.js';
import {
  publishRepositoryFileViaPullRequest,
  readRepositoryFile,
  requestGitHubApi,
} from './github-publication.js';
import { parseReleaseTag } from './release.js';

export const HOMEBREW_CASK_SCHEMA_VERSION = 1;
export const HOMEBREW_TAP_REPOSITORY = 'TrentBrown/homebrew-gatereeve';
export const HOMEBREW_CASK_TOKEN = 'gatereeve';
export const HOMEBREW_CASK_PATH = 'Casks/gatereeve.rb';
export const HOMEBREW_CASK_TAP = 'TrentBrown/gatereeve';

const COMMIT = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
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
  return value;
}

function requireTimestamp(value, label) {
  requireString(value, label);
  if (Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
}

function releaseUrl(record) {
  return `https://github.com/${RELEASE_REPOSITORY}/releases/download/${record.source.tag}/${record.candidates.desktop.artifact.filename}`;
}

function renderHomebrewCaskIdentity({ version, digest }) {
  parseReleaseTag(`v${version}`);
  if (!SHA256.test(digest ?? '')) throw new Error('Homebrew Cask SHA-256 is invalid');
  return `cask "${HOMEBREW_CASK_TOKEN}" do
  version "${version}"
  sha256 "${digest}"

  url "https://github.com/${RELEASE_REPOSITORY}/releases/download/v${version}/GateReeve-${version}-macos-universal.dmg"
  name "GateReeve"
  desc "Visual companion for governed agentic development workflows"
  homepage "https://gatereeve.pages.dev/"

  app "GateReeve.app"

  caveats <<~EOS
    GateReeve Desktop is an optional, read-only visual companion. The GateReeve
    Plugin is required to create and govern workflow state and remains managed
    separately by the native Codex or Claude plugin manager. This Cask installs
    neither the Plugin nor the optional GateReeve CLI.

    Setup and installation guidance:
    https://github.com/TrentBrown/gatereeve/blob/main/INSTALL.md
  EOS
end
`;
}

export function renderHomebrewCask(releaseRecord) {
  assertCoordinatedRelease(releaseRecord);
  return renderHomebrewCaskIdentity({
    version: releaseRecord.version,
    digest: releaseRecord.candidates.desktop.artifact.sha256,
  });
}

function comparePrerelease(left, right) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const leftParts = left.split('.');
  const rightParts = right.split('.');
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/u.test(leftPart);
    const rightNumeric = /^\d+$/u.test(rightPart);
    if (leftNumeric && rightNumeric) {
      return BigInt(leftPart) < BigInt(rightPart) ? -1 : 1;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function compareSemanticVersions(left, right) {
  const parsedLeft = parseReleaseTag(`v${left}`);
  const parsedRight = parseReleaseTag(`v${right}`);
  const leftBase = parsedLeft.baseVersion.split('.').map(Number);
  const rightBase = parsedRight.baseVersion.split('.').map(Number);
  for (let index = 0; index < leftBase.length; index += 1) {
    if (leftBase[index] !== rightBase[index]) {
      return leftBase[index] < rightBase[index] ? -1 : 1;
    }
  }
  return comparePrerelease(parsedLeft.prerelease, parsedRight.prerelease);
}

function canonicalPredecessorIdentity(content, targetVersion) {
  const version = /^  version "([^"]+)"$/mu.exec(content)?.[1];
  const digest = /^  sha256 "([a-f0-9]{64})"$/mu.exec(content)?.[1];
  if (
    version === undefined
    || digest === undefined
    || content !== renderHomebrewCaskIdentity({ version, digest })
  ) {
    throw new Error('The existing public GateReeve Cask is not canonical');
  }
  if (compareSemanticVersions(version, targetVersion) >= 0) {
    throw new Error('The existing public GateReeve Cask is not a strict predecessor');
  }
  return {
    version,
    tag: `v${version}`,
    filename: `GateReeve-${version}-macos-universal.dmg`,
    digest,
    prerelease: parseReleaseTag(`v${version}`).prerelease !== null,
  };
}

export function renderPredecessorHomebrewCask(content) {
  const match = /^  version "(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?"$/mu.exec(content);
  if (!match) throw new Error('Homebrew upgrade smoke requires a semantic Cask version');
  const predecessor = match[4] === undefined
    ? `${match[1]}.${match[2]}.${match[3]}-rc.999`
    : Number(match[4]) === 0
      ? `${match[1]}.${match[2]}.${match[3]}-preview.0`
      : `${match[1]}.${match[2]}.${match[3]}-rc.${Number(match[4]) - 1}`;
  return content.replace(match[0], `  version "${predecessor}"`);
}

function publicationPlanText(record) {
  return `# GateReeve ${record.version} Homebrew Cask publication plan

- Cask release ID: \`${record.caskReleaseId}\`
- Source tag: \`${record.source.tag}\`
- Source commit: \`${record.source.commit}\`
- Universal DMG: \`${record.desktop.filename}\`
- Universal DMG bytes: \`${record.desktop.bytes}\`
- Universal DMG SHA-256: \`${record.desktop.sha256}\`
- Apple signing identity: \`${record.desktop.trust.identity}\`
- Apple team ID: \`${record.desktop.trust.teamId}\`
- Apple notarization ID: \`${record.desktop.trust.notarizationId}\` (\`${record.desktop.trust.notarizationStatus}\`)
- Direct DMG installation: confirmed by \`${record.directInstallation.confirmedBy}\` at \`${record.directInstallation.confirmedAt}\`
- Tap repository: \`${record.cask.repository}\`${record.cask.createRepositoryIfAbsent ? ' (create publicly if absent)' : ''}
- Cask path: \`${record.cask.path}\`
- Cask token: \`${record.cask.token}\`
- Cask SHA-256: \`${record.cask.sha256}\`

## Exact public mutation

1. Verify the existing GitHub prerelease still exposes the approved universal DMG identity.
2. Create the public \`${record.cask.repository}\` tap with an initialized \`main\` branch only if it is absent.
3. Publish only \`${record.cask.path}\` through one generated pull request whose content is bound to this plan.
4. Merge only the clean, exact generated commit and verify the bytes on \`main\`.

The Cask downloads the existing approved DMG from GitHub Releases. It never rebuilds or repackages GateReeve and it does not install, update, or remove the Plugin or CLI.
`;
}

export function renderHomebrewCaskPublicationPlan(record) {
  assertHomebrewCaskRecord(record);
  return publicationPlanText(record);
}

export function homebrewCaskPlanSha256(record) {
  return sha256(publicationPlanText(record));
}

export function assertHomebrewCaskRecord(value) {
  const parsed = parseReleaseTag(value?.source?.tag ?? '');
  if (
    value?.schemaVersion !== HOMEBREW_CASK_SCHEMA_VERSION
    || value.caskReleaseId !== `gatereeve-cask-v${value?.version}`
    || value.version !== parsed.version
    || value.channel !== (parsed.prerelease === null ? 'stable' : 'rc')
    || !['prepared', 'approved', 'published'].includes(value.state)
    || value?.source?.repository !== `https://github.com/${RELEASE_REPOSITORY}`
    || value.source.tag !== `v${value.version}`
    || !COMMIT.test(value.source.commit ?? '')
  ) {
    throw new Error('Homebrew Cask release identity is invalid');
  }
  if (
    typeof value?.desktop?.filename !== 'string'
    || basename(value.desktop.filename) !== value.desktop.filename
    || !Number.isSafeInteger(value.desktop.bytes)
    || value.desktop.bytes < 1
    || !SHA256.test(value.desktop.sha256 ?? '')
    || value.desktop.url !== `https://github.com/${RELEASE_REPOSITORY}/releases/download/${value.source.tag}/${value.desktop.filename}`
  ) {
    throw new Error('Homebrew Cask Desktop identity is invalid');
  }
  const trust = value.desktop.trust;
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
      trust.notarizationId ?? ''
    )
    || trust.notarizationStatus !== 'Accepted'
    || trust.stapled !== true
    || trust.gatekeeperAccepted !== true
    || JSON.stringify(trust.evidence) !== JSON.stringify(expectedEvidence)
  ) {
    throw new Error('Homebrew Cask Apple trust identity is invalid');
  }
  if (
    value?.directInstallation?.status !== 'passed'
    || typeof value.directInstallation.confirmedBy !== 'string'
    || value.directInstallation.confirmedBy === ''
  ) {
    throw new Error('Homebrew Cask requires direct DMG installation proof');
  }
  requireTimestamp(value.directInstallation.confirmedAt, 'Direct installation confirmation time');
  if (
    value?.cask?.repository !== HOMEBREW_TAP_REPOSITORY
    || value.cask.path !== HOMEBREW_CASK_PATH
    || value.cask.token !== HOMEBREW_CASK_TOKEN
    || value.cask.tap !== HOMEBREW_CASK_TAP
    || value.cask.createRepositoryIfAbsent !== true
    || value.cask.outputPath !== 'Casks/gatereeve.rb'
    || !SHA256.test(value.cask.sha256 ?? '')
  ) {
    throw new Error('Homebrew Cask publication destination is invalid');
  }
  if (!['unapproved', 'approved'].includes(value?.publication?.approval?.state)) {
    throw new Error('Homebrew Cask publication approval is invalid');
  }
  if (!['pending', 'complete'].includes(value?.publication?.surface?.state)) {
    throw new Error('Homebrew Cask publication surface is invalid');
  }
  if (value.publication.approval.state === 'approved') {
    requireString(value.publication.approval.approvedBy, 'Homebrew Cask approver');
    requireTimestamp(value.publication.approval.approvedAt, 'Homebrew Cask approval time');
    if (
      !SHA256.test(value.publication.approval.planSha256 ?? '')
      || value.publication.approval.planSha256 !== homebrewCaskPlanSha256(value)
    ) {
      throw new Error('Homebrew Cask approval no longer matches its exact plan');
    }
  }
  if (value.publication.surface.state === 'complete') {
    if (
      value.publication.approval.state !== 'approved'
      || typeof value.publication.surface.receipt?.pullRequestUrl !== 'string'
      || !COMMIT.test(value.publication.surface.receipt?.mergeCommit ?? '')
      || value.publication.surface.receipt?.fileSha256 !== value.cask.sha256
    ) {
      throw new Error('Homebrew Cask publication receipt is invalid');
    }
  } else if (value.publication.surface.receipt !== null) {
    throw new Error('Pending Homebrew Cask publication must not have a receipt');
  }
  const expectedState = value.publication.surface.state === 'complete'
    ? 'published'
    : value.publication.approval.state === 'approved'
      ? 'approved'
      : 'prepared';
  if (value.state !== expectedState) {
    throw new Error('Homebrew Cask state does not match approval and publication progress');
  }
  requireTimestamp(value.createdAt, 'Homebrew Cask creation time');
  requireTimestamp(value.updatedAt, 'Homebrew Cask update time');
  return value;
}

async function requireFreshOutput(path) {
  try {
    if ((await readdir(path)).length > 0) {
      throw new Error(`Homebrew Cask output must be absent or empty: ${path}`);
    }
    await rm(path, { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export async function prepareHomebrewCask({
  releaseRecordPath,
  outputRoot,
  directInstallConfirmedBy,
  directInstallConfirmedAt,
  now = () => new Date(),
}) {
  const sourceRecord = await verifyCoordinatedReleaseWorkspace(releaseRecordPath);
  if (
    sourceRecord.candidates.desktop.trust.status !== 'developer-id-notarized'
  ) {
    throw new Error('Homebrew Cask preparation requires a trusted coordinated release');
  }
  requireString(directInstallConfirmedBy, 'Direct installation confirmer');
  requireTimestamp(directInstallConfirmedAt, 'Direct installation confirmation time');
  const output = resolve(outputRoot);
  await requireFreshOutput(output);
  const staging = `${output}.${randomUUID()}.tmp`;
  const cask = renderHomebrewCask(sourceRecord);
  const createdAt = now().toISOString();
  const desktop = sourceRecord.candidates.desktop.artifact;
  const record = {
    schemaVersion: HOMEBREW_CASK_SCHEMA_VERSION,
    caskReleaseId: `gatereeve-cask-v${sourceRecord.version}`,
    version: sourceRecord.version,
    channel: sourceRecord.channel,
    source: structuredClone(sourceRecord.source),
    desktop: {
      filename: desktop.filename,
      bytes: desktop.bytes,
      sha256: desktop.sha256,
      url: releaseUrl(sourceRecord),
      trust: structuredClone(sourceRecord.candidates.desktop.trust),
    },
    directInstallation: {
      status: 'passed',
      confirmedBy: directInstallConfirmedBy,
      confirmedAt: new Date(directInstallConfirmedAt).toISOString(),
    },
    cask: {
      repository: HOMEBREW_TAP_REPOSITORY,
      tap: HOMEBREW_CASK_TAP,
      token: HOMEBREW_CASK_TOKEN,
      path: HOMEBREW_CASK_PATH,
      outputPath: HOMEBREW_CASK_PATH,
      sha256: sha256(cask),
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
  assertHomebrewCaskRecord(record);
  try {
    await mkdir(resolve(staging, 'Casks'), { recursive: true });
    await writeFile(resolve(staging, HOMEBREW_CASK_PATH), cask, { flag: 'wx' });
    await writeFile(resolve(staging, 'source-release-record.json'), stableJson(sourceRecord), {
      flag: 'wx',
    });
    await writeFile(resolve(staging, 'cask-record.json'), stableJson(record), { flag: 'wx' });
    await writeFile(
      resolve(staging, 'publication-plan.md'),
      renderHomebrewCaskPublicationPlan(record),
      { flag: 'wx' },
    );
    await rename(staging, output);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return {
    outputRoot: output,
    recordPath: resolve(output, 'cask-record.json'),
    planPath: resolve(output, 'publication-plan.md'),
    caskPath: resolve(output, HOMEBREW_CASK_PATH),
    planSha256: homebrewCaskPlanSha256(record),
    record,
  };
}

export async function readHomebrewCaskRecord(path) {
  return assertHomebrewCaskRecord(JSON.parse(await readFile(resolve(path), 'utf8')));
}

export async function verifyHomebrewCaskWorkspace(recordPath) {
  const path = resolve(recordPath);
  const root = dirname(path);
  const record = await readHomebrewCaskRecord(path);
  const cask = await readFile(resolve(root, record.cask.outputPath), 'utf8');
  if (sha256(cask) !== record.cask.sha256) {
    throw new Error('Prepared Homebrew Cask bytes changed');
  }
  const source = await readCoordinatedRelease(resolve(root, 'source-release-record.json'));
  if (
    source.source.tag !== record.source.tag
    || source.source.commit !== record.source.commit
    || source.candidates.desktop.artifact.sha256 !== record.desktop.sha256
    || JSON.stringify(source.candidates.desktop.trust) !== JSON.stringify(record.desktop.trust)
    || renderHomebrewCask(source) !== cask
  ) {
    throw new Error('Prepared Homebrew Cask no longer matches its source release');
  }
  if (
    await readFile(resolve(root, 'publication-plan.md'), 'utf8')
      !== renderHomebrewCaskPublicationPlan(record)
  ) {
    throw new Error('Homebrew Cask publication plan changed');
  }
  return record;
}

async function writeHomebrewCaskRecord(path, record) {
  assertHomebrewCaskRecord(record);
  const output = resolve(path);
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, stableJson(record), { flag: 'wx' });
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
}

function assertExactPublicRelease(release, record) {
  const assets = new Map((release?.assets ?? []).map((asset) => [asset.name, asset]));
  const desktop = assets.get(record.desktop.filename);
  if (
    release?.tag_name !== record.source.tag
    || release.prerelease !== (record.channel === 'rc')
    || release.target_commitish !== record.source.commit
    || desktop?.size !== record.desktop.bytes
    || desktop?.digest !== `sha256:${record.desktop.sha256}`
  ) {
    throw new Error('Public GitHub prerelease differs from the approved Cask source');
  }
  return release;
}

function assertExactPredecessorRelease(release, predecessor) {
  const assets = new Map((release?.assets ?? []).map((asset) => [asset.name, asset]));
  const desktop = assets.get(predecessor.filename);
  if (
    release?.tag_name !== predecessor.tag
    || release.prerelease !== predecessor.prerelease
    || desktop?.digest !== `sha256:${predecessor.digest}`
  ) {
    throw new Error('The existing public GateReeve Cask does not match a published predecessor');
  }
}

async function inspectTap(request) {
  return request({
    endpoint: `repos/${HOMEBREW_TAP_REPOSITORY}`,
    allowNotFound: true,
  });
}

function assertTapIdentity(repository) {
  if (
    repository?.full_name !== HOMEBREW_TAP_REPOSITORY
    || repository.private !== false
    || repository.default_branch !== 'main'
    || repository.owner?.login !== 'TrentBrown'
  ) {
    throw new Error(`Existing ${HOMEBREW_TAP_REPOSITORY} repository is not the approved public tap`);
  }
  return repository;
}

async function ensureTapRepository(request) {
  let repository = await inspectTap(request);
  if (repository === null) {
    repository = await request({
      method: 'POST',
      endpoint: 'user/repos',
      body: {
        name: 'homebrew-gatereeve',
        description: 'Homebrew Cask for GateReeve',
        private: false,
        auto_init: true,
        has_issues: false,
        has_projects: false,
        has_wiki: false,
      },
    });
  }
  assertTapIdentity(repository);
  await request({ endpoint: `repos/${HOMEBREW_TAP_REPOSITORY}/branches/main` });
  return repository;
}

export async function preflightHomebrewCaskPublication({
  recordPath,
  request = requestGitHubApi,
}) {
  const record = await verifyHomebrewCaskWorkspace(recordPath);
  const release = await request({
    endpoint: `repos/${RELEASE_REPOSITORY}/releases/tags/${encodeURIComponent(record.source.tag)}`,
  });
  assertExactPublicRelease(release, record);
  const repository = await inspectTap(request);
  if (repository !== null) {
    assertTapIdentity(repository);
    await request({ endpoint: `repos/${HOMEBREW_TAP_REPOSITORY}/branches/main` });
    const destination = await readRepositoryFile({
      request,
      repository: HOMEBREW_TAP_REPOSITORY,
      path: HOMEBREW_CASK_PATH,
      reference: 'main',
      allowNotFound: true,
    });
    const content = await readFile(resolve(dirname(resolve(recordPath)), record.cask.outputPath), 'utf8');
    if (destination !== null && destination.content !== content) {
      const predecessor = canonicalPredecessorIdentity(destination.content, record.version);
      const predecessorRelease = await request({
        endpoint: `repos/${RELEASE_REPOSITORY}/releases/tags/${encodeURIComponent(predecessor.tag)}`,
      });
      assertExactPredecessorRelease(predecessorRelease, predecessor);
    }
  } else if (record.publication.surface.state === 'complete') {
    throw new Error('Published Homebrew Cask record has no public tap');
  }
  return { record, tapState: repository === null ? 'absent' : 'present' };
}

export async function publishHomebrewCask({
  recordPath,
  planSha256,
  approvedBy,
  confirm = false,
  dryRun = false,
  request = requestGitHubApi,
  publishFile = publishRepositoryFileViaPullRequest,
  now = () => new Date(),
}) {
  if (confirm === dryRun) throw new Error('Choose exactly one of confirm or dry run');
  let { record, tapState } = await preflightHomebrewCaskPublication({ recordPath, request });
  const exactPlanSha256 = homebrewCaskPlanSha256(record);
  if (planSha256 !== exactPlanSha256) {
    throw new Error(`Homebrew Cask plan digest differs; expected ${exactPlanSha256}`);
  }
  if (dryRun) return { dryRun: true, record, planSha256: exactPlanSha256, tapState };
  requireString(approvedBy, 'Homebrew Cask approver');
  if (record.publication.approval.state === 'unapproved') {
    const approvedAt = now().toISOString();
    record = structuredClone(record);
    record.publication.approval = {
      state: 'approved',
      approvedBy,
      approvedAt,
      planSha256: exactPlanSha256,
    };
    record.state = 'approved';
    record.updatedAt = approvedAt;
    await writeHomebrewCaskRecord(recordPath, record);
  }
  if (record.publication.surface.state === 'complete') {
    return { dryRun: false, record, planSha256: exactPlanSha256, tapState: 'present' };
  }
  await ensureTapRepository(request);
  const root = dirname(resolve(recordPath));
  const content = await readFile(resolve(root, record.cask.outputPath), 'utf8');
  const receipt = await publishFile({
    request,
    repository: HOMEBREW_TAP_REPOSITORY,
    baseBranch: 'main',
    version: record.version,
    sourceCommit: record.source.commit,
    planSha256: exactPlanSha256,
    title: `Publish GateReeve ${record.version} Homebrew Cask`,
    path: HOMEBREW_CASK_PATH,
    content,
    fileSha256: record.cask.sha256,
  });
  const publishedAt = now().toISOString();
  record = structuredClone(record);
  record.publication.surface = {
    state: 'complete',
    receipt: {
      repository: HOMEBREW_TAP_REPOSITORY,
      path: HOMEBREW_CASK_PATH,
      pullRequestUrl: receipt.pullRequestUrl,
      mergeCommit: receipt.mergeCommit,
      fileSha256: record.cask.sha256,
      publishedAt,
    },
  };
  record.state = 'published';
  record.updatedAt = publishedAt;
  await writeHomebrewCaskRecord(recordPath, record);
  return { dryRun: false, record, planSha256: exactPlanSha256, tapState: 'present' };
}
