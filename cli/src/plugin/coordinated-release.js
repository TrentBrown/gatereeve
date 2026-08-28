import { createHash, randomUUID } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';

import { parseReleaseTag } from './release.js';

export const COORDINATED_RELEASE_SCHEMA_VERSION = 1;
export const PUBLICATION_SURFACES = Object.freeze([
  'tag',
  'pluginMarketplace',
  'desktopPrerelease',
  'updateManifest',
  'earlyAccessWebsite',
]);

const COMMIT = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const DESKTOP_ARCHITECTURES = Object.freeze(['arm64', 'x64']);

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function portablePath(path) {
  return path.split(sep).join('/');
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

async function sha256File(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function inventoryTree(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Release candidates must not contain symbolic links: ${path}`);
      }
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        const details = await stat(path);
        files.push({
          path: portablePath(relative(root, path)),
          bytes: details.size,
          sha256: await sha256File(path),
        });
      } else {
        throw new Error(`Unsupported release-candidate entry: ${path}`);
      }
    }
  }
  await visit(root);
  return files;
}

function treeDigest(files) {
  return createHash('sha256').update(stableJson(files)).digest('hex');
}

async function requireFreshOutput(path) {
  try {
    const entries = await readdir(path);
    if (entries.length > 0) throw new Error(`Release output must be absent or empty: ${path}`);
    await rm(path, { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function validateDesktopEvidence(value, expected) {
  if (
    value?.schemaVersion !== 1
    || value.kind !== 'gatereeve-desktop-package-verification'
    || value.sourceTag !== expected.sourceTag
    || value.sourceCommit !== expected.sourceCommit
    || value.version !== expected.desktopVersion
    || !DESKTOP_ARCHITECTURES.includes(value?.runner?.architecture)
    || value?.runner?.operatingSystem !== 'darwin'
    || value?.artifact?.filename !== expected.filename
    || value?.artifact?.bytes !== expected.bytes
    || value?.artifact?.sha256 !== expected.sha256
    || value?.checks?.dmgVerified !== true
    || value?.checks?.applicationIdentity !== true
    || value?.checks?.coordinatedVersion !== true
    || value?.checks?.universalBinaries !== true
    || value?.checks?.governedFixtureSmoke !== true
  ) {
    throw new Error('Desktop verification evidence does not match the coordinated candidate');
  }
  validateCoordinatedTrust(value.trust);
  return value;
}

function validateCoordinatedTrust(trust) {
  if (!Array.isArray(trust?.evidence) || trust.evidence.some(
    (item) => typeof item !== 'string' || item === ''
  )) {
    throw new Error('Coordinated Desktop trust evidence is invalid');
  }
  if (trust.status === 'development-ad-hoc') {
    if (trust.evidence.length !== 0) {
      throw new Error('Development Desktop trust must not claim public evidence');
    }
    return trust;
  }
  if (
    trust.status !== 'developer-id-notarized'
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
  ) {
    throw new Error('Coordinated Desktop trust evidence is invalid');
  }
  const expectedEvidence = [
    `codesign:${trust.identity}`,
    `notarytool:${trust.notarizationId}`,
    'stapler:validated',
    'spctl:accepted',
  ];
  if (JSON.stringify(trust.evidence) !== JSON.stringify(expectedEvidence)) {
    throw new Error('Coordinated Desktop trust evidence is contradictory');
  }
  return trust;
}

function validateStablePromotion({ sourceTag, sourceCommit, releaseCandidate }) {
  const stable = parseReleaseTag(sourceTag);
  if (stable.prerelease !== null) return null;
  assertCoordinatedRelease(releaseCandidate);
  const candidate = parseReleaseTag(releaseCandidate.source.tag);
  if (
    !candidate.prerelease?.match(/^rc\.(?:0|[1-9]\d*)$/u)
    || candidate.baseVersion !== stable.baseVersion
    || releaseCandidate.source.commit !== sourceCommit
  ) {
    throw new Error('Stable promotion must use the exact source of a coordinated RC on the same version line');
  }
  return {
    releaseId: releaseCandidate.releaseId,
    tag: releaseCandidate.source.tag,
    sourceCommit: releaseCandidate.source.commit,
  };
}

function publicationPlanText(record) {
  const rows = PUBLICATION_SURFACES.map((surface, index) => (
    `${index + 1}. ${surface}`
  ));
  return [
    `# GateReeve ${record.source.tag} publication plan`,
    '',
    `- Release ID: \`${record.releaseId}\``,
    `- Version: \`${record.version}\``,
    `- Source commit: \`${record.source.commit}\``,
    `- Plugin candidate SHA-256: \`${record.candidates.plugin.artifact.sha256}\``,
    `- Desktop DMG SHA-256: \`${record.candidates.desktop.artifact.sha256}\``,
    ...record.candidates.desktop.verification.evidence.map(
      (item) => `- Desktop ${item.architecture} evidence SHA-256: \`${item.sha256}\``
    ),
    `- Desktop trust: \`${record.candidates.desktop.trust.status}\``,
    ...record.candidates.desktop.trust.evidence.map((item) => `- Trust evidence: \`${item}\``),
    '',
    '## Deterministic publication order',
    '',
    ...rows,
    '',
    'Retries must converge this exact tag, source commit, and candidate identity. Completed surfaces are never deleted, replaced, or republished.',
    '',
  ].join('\n');
}

export function renderPublicationPlan(record) {
  assertCoordinatedRelease(record);
  return publicationPlanText(record);
}

export function publicationPlanSha256(record) {
  return createHash('sha256').update(publicationPlanText(record)).digest('hex');
}

export async function prepareCoordinatedRelease({
  sourceTag,
  sourceCommit,
  repository,
  pluginRoot,
  desktopDmgPath,
  desktopEvidencePaths,
  outputRoot,
  stablePromotionRecord = null,
  now = () => new Date(),
}) {
  const parsed = parseReleaseTag(sourceTag);
  if (!COMMIT.test(sourceCommit ?? '')) {
    throw new Error('Coordinated release source commit must be a full lowercase Git SHA');
  }
  requireString(repository, 'Source repository');
  if (!Array.isArray(desktopEvidencePaths) || desktopEvidencePaths.length !== 2) {
    throw new Error('Coordinated release preparation requires ARM64 and Intel Desktop evidence');
  }
  const promotion = parsed.prerelease === null
    ? validateStablePromotion({
        sourceTag,
        sourceCommit,
        releaseCandidate: stablePromotionRecord,
      })
    : null;

  const pluginRelease = JSON.parse(await readFile(resolve(pluginRoot, 'RELEASE.json'), 'utf8'));
  if (
    pluginRelease.sourceTag !== sourceTag
    || pluginRelease.sourceCommit !== sourceCommit
    || pluginRelease.version !== parsed.version
    || pluginRelease.plugin !== 'agentic-development-workflow'
    || pluginRelease.marketplace !== 'quality-code'
  ) {
    throw new Error('Plugin candidate does not match the coordinated tag and source commit');
  }
  const pluginFiles = await inventoryTree(resolve(pluginRoot));
  if (pluginFiles.length === 0) throw new Error('Plugin candidate is empty');

  const dmgPath = resolve(desktopDmgPath);
  const dmgDetails = await stat(dmgPath);
  if (!dmgDetails.isFile()) throw new Error(`Desktop candidate is not a file: ${dmgPath}`);
  const dmg = {
    filename: basename(dmgPath),
    bytes: dmgDetails.size,
    sha256: await sha256File(dmgPath),
  };
  const evidence = [];
  for (const path of desktopEvidencePaths) {
    const value = JSON.parse(await readFile(resolve(path), 'utf8'));
    evidence.push(validateDesktopEvidence(value, {
      sourceTag,
      sourceCommit,
      desktopVersion: parsed.version,
      ...dmg,
    }));
  }
  const architectures = evidence.map((item) => item.runner.architecture).sort();
  if (JSON.stringify(architectures) !== JSON.stringify([...DESKTOP_ARCHITECTURES].sort())) {
    throw new Error('Desktop evidence must contain one native ARM64 and one native Intel verification');
  }
  const desktopVersions = new Set(evidence.map((item) => item.version));
  if (desktopVersions.size !== 1) {
    throw new Error('Desktop verification evidence disagrees about the application version');
  }
  const desktopTrust = structuredClone(evidence[0].trust);
  if (evidence.some((item) => JSON.stringify(item.trust) !== JSON.stringify(desktopTrust))) {
    throw new Error('Desktop verification evidence disagrees about Apple trust');
  }

  const output = resolve(outputRoot);
  await requireFreshOutput(output);
  await mkdir(dirname(output), { recursive: true });
  const stagingRoot = await mkdtemp(resolve(dirname(output), '.gatereeve-release-'));
  try {
    const pluginOutput = resolve(stagingRoot, 'plugin', 'marketplace');
    const desktopOutput = resolve(stagingRoot, 'desktop', dmg.filename);
    const evidenceRoot = resolve(stagingRoot, 'evidence');
    await mkdir(dirname(pluginOutput), { recursive: true });
    await mkdir(dirname(desktopOutput), { recursive: true });
    await mkdir(evidenceRoot, { recursive: true });
    await cp(resolve(pluginRoot), pluginOutput, { recursive: true });
    await cp(dmgPath, desktopOutput);
    const evidenceRecords = [];
    for (const item of evidence) {
      const filename = `desktop-${item.runner.architecture}.json`;
      const content = stableJson(item);
      await writeFile(resolve(evidenceRoot, filename), content);
      evidenceRecords.push({
        architecture: item.runner.architecture,
        path: `evidence/${filename}`,
        sha256: createHash('sha256').update(content).digest('hex'),
      });
    }

    const timestamp = now().toISOString();
    const record = {
      schemaVersion: COORDINATED_RELEASE_SCHEMA_VERSION,
      releaseId: `gatereeve-v${parsed.version}`,
      version: parsed.version,
      channel: parsed.prerelease === null ? 'stable' : 'rc',
      source: { repository, commit: sourceCommit, tag: sourceTag },
      promotion,
      state: 'prepared',
      candidates: {
        plugin: {
          artifact: {
            path: 'plugin/marketplace',
            fileCount: pluginFiles.length,
            sha256: treeDigest(pluginFiles),
          },
          verification: {
            status: 'passed',
            packageCount: 2,
            releaseMetadata: 'plugin/marketplace/RELEASE.json',
          },
        },
        desktop: {
          applicationVersion: [...desktopVersions][0],
          artifact: { path: `desktop/${dmg.filename}`, ...dmg },
          verification: {
            status: 'passed',
            architectures,
            evidence: evidenceRecords,
          },
          trust: desktopTrust,
        },
      },
      publication: {
        order: [...PUBLICATION_SURFACES],
        approval: { state: 'unapproved' },
        surfaces: Object.fromEntries(PUBLICATION_SURFACES.map((surface) => [
          surface,
          { state: 'pending', receipt: null },
        ])),
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    assertCoordinatedRelease(record);
    await writeFile(resolve(stagingRoot, 'release-record.json'), stableJson(record));
    await writeFile(resolve(stagingRoot, 'publication-plan.md'), renderPublicationPlan(record));
    await rename(stagingRoot, output);
    return {
      schemaVersion: 1,
      outputRoot: output,
      recordPath: resolve(output, 'release-record.json'),
      planPath: resolve(output, 'publication-plan.md'),
      planSha256: publicationPlanSha256(record),
      record,
    };
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

export function assertCoordinatedRelease(value) {
  if (value?.schemaVersion !== COORDINATED_RELEASE_SCHEMA_VERSION) {
    throw new Error('Unsupported coordinated release record schema');
  }
  const parsed = parseReleaseTag(value?.source?.tag ?? '');
  if (
    value.releaseId !== `gatereeve-v${parsed.version}`
    || value.version !== parsed.version
    || !COMMIT.test(value?.source?.commit ?? '')
    || value.channel !== (parsed.prerelease === null ? 'stable' : 'rc')
    || !['prepared', 'approved', 'publishing', 'published'].includes(value.state)
  ) {
    throw new Error('Coordinated release identity is internally inconsistent');
  }
  requireString(value.source.repository, 'Source repository');
  if (parsed.prerelease === null) {
    let candidate;
    try {
      candidate = parseReleaseTag(value?.promotion?.tag ?? '');
    } catch {
      throw new Error('Stable coordinated release promotion evidence is invalid');
    }
    if (
      !candidate.prerelease?.match(/^rc\.(?:0|[1-9]\d*)$/u)
      || candidate.baseVersion !== parsed.baseVersion
      || value.promotion.releaseId !== `gatereeve-v${candidate.version}`
      || value.promotion.sourceCommit !== value.source.commit
    ) {
      throw new Error('Stable coordinated release promotion evidence is invalid');
    }
  } else if (value.promotion !== null) {
    throw new Error('RC coordinated releases must not contain stable promotion evidence');
  }
  requireTimestamp(value.createdAt, 'Release creation time');
  requireTimestamp(value.updatedAt, 'Release update time');
  for (const candidate of [value?.candidates?.plugin, value?.candidates?.desktop]) {
    if (candidate?.verification?.status !== 'passed' || !SHA256.test(candidate?.artifact?.sha256 ?? '')) {
      throw new Error('Coordinated release candidate verification is incomplete');
    }
  }
  if (
    value.candidates.plugin.artifact.path !== 'plugin/marketplace'
    || !Number.isSafeInteger(value.candidates.plugin.artifact.fileCount)
    || value.candidates.plugin.artifact.fileCount < 1
    || typeof value.candidates.desktop.artifact.filename !== 'string'
    || basename(value.candidates.desktop.artifact.filename)
      !== value.candidates.desktop.artifact.filename
    || value.candidates.desktop.artifact.path !== `desktop/${value.candidates.desktop.artifact.filename}`
    || !Number.isSafeInteger(value.candidates.desktop.artifact.bytes)
    || value.candidates.desktop.artifact.bytes < 1
    || value.candidates.desktop.applicationVersion !== value.version
  ) {
    throw new Error('Coordinated release artifact metadata is invalid');
  }
  validateCoordinatedTrust(value.candidates.desktop.trust);
  const desktopEvidence = value.candidates.desktop.verification.evidence;
  if (
    !Array.isArray(desktopEvidence)
    || desktopEvidence.length !== DESKTOP_ARCHITECTURES.length
    || JSON.stringify(desktopEvidence.map((item) => item.architecture).sort())
      !== JSON.stringify([...DESKTOP_ARCHITECTURES].sort())
    || desktopEvidence.some((item) => (
      item.path !== `evidence/desktop-${item.architecture}.json`
      || !SHA256.test(item.sha256 ?? '')
    ))
  ) {
    throw new Error('Coordinated Desktop verification evidence is invalid');
  }
  if (
    !Array.isArray(value?.publication?.order)
    || JSON.stringify(value.publication.order) !== JSON.stringify(PUBLICATION_SURFACES)
    || !['unapproved', 'approved'].includes(value?.publication?.approval?.state)
  ) {
    throw new Error('Coordinated publication policy is invalid');
  }
  let sawPending = false;
  for (const surface of PUBLICATION_SURFACES) {
    const entry = value.publication.surfaces?.[surface];
    if (!['pending', 'complete'].includes(entry?.state)) {
      throw new Error(`Coordinated publication state is invalid for ${surface}`);
    }
    if (entry.state === 'pending') sawPending = true;
    if (entry.state === 'complete') {
      if (sawPending || entry.receipt?.surface !== surface) {
        throw new Error('Completed publication surfaces must form an ordered prefix');
      }
      if (
        entry.receipt.tag !== value.source.tag
        || entry.receipt.sourceCommit !== value.source.commit
        || typeof entry.receipt.identity !== 'string'
        || entry.receipt.identity === ''
      ) {
        throw new Error(`Publication receipt does not match ${surface}`);
      }
    } else if (entry.receipt !== null) {
      throw new Error(`Pending publication surface has a receipt: ${surface}`);
    }
  }
  const complete = PUBLICATION_SURFACES.every(
    (surface) => value.publication.surfaces[surface].state === 'complete'
  );
  const completedCount = PUBLICATION_SURFACES.filter(
    (surface) => value.publication.surfaces[surface].state === 'complete'
  ).length;
  if (value.publication.approval.state === 'approved') {
    requireString(value.publication.approval.approvedBy, 'Publication approver');
    requireTimestamp(value.publication.approval.approvedAt, 'Publication approval time');
    if (!SHA256.test(value.publication.approval.planSha256 ?? '')) {
      throw new Error('Publication approval plan digest is invalid');
    }
    if (value.publication.approval.planSha256 !== publicationPlanSha256(value)) {
      throw new Error('Publication approval no longer matches the exact release plan');
    }
  }
  const expectedState = complete
    ? 'published'
    : completedCount > 0
      ? 'publishing'
      : value.publication.approval.state === 'approved'
        ? 'approved'
        : 'prepared';
  if (value.state !== expectedState) {
    throw new Error('Coordinated release state does not match approval and publication progress');
  }
  return value;
}

export async function readCoordinatedRelease(path) {
  return assertCoordinatedRelease(JSON.parse(await readFile(resolve(path), 'utf8')));
}

export async function verifyCoordinatedReleaseWorkspace(recordPath) {
  const path = resolve(recordPath);
  const root = dirname(path);
  const record = await readCoordinatedRelease(path);
  const pluginFiles = await inventoryTree(resolve(root, record.candidates.plugin.artifact.path));
  if (
    pluginFiles.length !== record.candidates.plugin.artifact.fileCount
    || treeDigest(pluginFiles) !== record.candidates.plugin.artifact.sha256
  ) {
    throw new Error('Recorded Plugin candidate identity changed');
  }
  const dmgPath = resolve(root, record.candidates.desktop.artifact.path);
  const dmgDetails = await stat(dmgPath);
  if (
    !dmgDetails.isFile()
    || dmgDetails.size !== record.candidates.desktop.artifact.bytes
    || await sha256File(dmgPath) !== record.candidates.desktop.artifact.sha256
  ) {
    throw new Error('Recorded Desktop candidate identity changed');
  }
  for (const evidence of record.candidates.desktop.verification.evidence) {
    if (await sha256File(resolve(root, evidence.path)) !== evidence.sha256) {
      throw new Error(`Recorded Desktop ${evidence.architecture} evidence changed`);
    }
  }
  const planPath = resolve(root, 'publication-plan.md');
  if (await readFile(planPath, 'utf8') !== renderPublicationPlan(record)) {
    throw new Error('Publication plan does not match the coordinated release record');
  }
  return record;
}

export async function writeCoordinatedRelease(path, record) {
  assertCoordinatedRelease(record);
  const output = resolve(path);
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, stableJson(record), { flag: 'wx' });
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
}

export function recordDesktopTrust(record, evidence, now = () => new Date()) {
  assertCoordinatedRelease(record);
  if (
    record.publication.approval.state !== 'unapproved'
    || PUBLICATION_SURFACES.some(
      (surface) => record.publication.surfaces[surface].state !== 'pending'
    )
  ) {
    throw new Error('Desktop trust cannot change after publication approval or progress');
  }
  if (
    evidence?.status !== 'developer-id-notarized'
  ) {
    throw new Error('Desktop trust requires Developer ID, notarization, stapling, and Gatekeeper evidence');
  }
  validateCoordinatedTrust(evidence);
  const next = structuredClone(record);
  next.candidates.desktop.trust = structuredClone(evidence);
  next.updatedAt = now().toISOString();
  assertCoordinatedRelease(next);
  return next;
}

export function approveCoordinatedPublication(record, approval, now = () => new Date()) {
  assertCoordinatedRelease(record);
  if (record.candidates.desktop.trust.status !== 'developer-id-notarized') {
    throw new Error('Public release approval requires complete Apple trust evidence');
  }
  const expectedPlanSha256 = publicationPlanSha256(record);
  if (approval?.planSha256 !== expectedPlanSha256) {
    throw new Error('Publication approval does not match the exact release plan');
  }
  requireString(approval.approvedBy, 'Publication approver');
  const next = structuredClone(record);
  next.publication.approval = {
    state: 'approved',
    approvedBy: approval.approvedBy,
    approvedAt: now().toISOString(),
    planSha256: approval.planSha256,
  };
  next.state = 'approved';
  next.updatedAt = next.publication.approval.approvedAt;
  assertCoordinatedRelease(next);
  return next;
}

export function assertCoordinatedPublicationReady(record, expected = {}) {
  assertCoordinatedRelease(record);
  if (
    (expected.tag && expected.tag !== record.source.tag)
    || (expected.sourceCommit && expected.sourceCommit !== record.source.commit)
  ) {
    throw new Error('Coordinated release record does not match the selected tag and source commit');
  }
  if (
    record.publication.approval.state !== 'approved'
    || record.candidates.desktop.trust.status !== 'developer-id-notarized'
    || record.publication.approval.planSha256 !== publicationPlanSha256(record)
  ) {
    throw new Error('Coordinated release is not approved and trusted for public publication');
  }
  return record;
}

export async function convergeCoordinatedPublication({
  recordPath,
  adapters,
  now = () => new Date(),
  afterSurface = async () => {},
}) {
  let record = await readCoordinatedRelease(recordPath);
  assertCoordinatedPublicationReady(record);
  for (const surface of PUBLICATION_SURFACES) {
    if (record.publication.surfaces[surface].state === 'complete') continue;
    const adapter = adapters?.[surface];
    if (typeof adapter?.converge !== 'function') {
      throw new Error(`Publication adapter is missing for ${surface}`);
    }
    const result = await adapter.converge({ record: structuredClone(record), surface });
    const receipt = {
      surface,
      tag: record.source.tag,
      sourceCommit: record.source.commit,
      identity: requireString(result?.identity, `${surface} publication identity`),
      completedAt: now().toISOString(),
    };
    const next = structuredClone(record);
    next.publication.surfaces[surface] = { state: 'complete', receipt };
    const complete = PUBLICATION_SURFACES.every(
      (name) => next.publication.surfaces[name].state === 'complete'
    );
    next.state = complete ? 'published' : 'publishing';
    next.updatedAt = receipt.completedAt;
    await writeCoordinatedRelease(recordPath, next);
    record = next;
    await afterSurface(surface, structuredClone(record));
  }
  return record;
}
