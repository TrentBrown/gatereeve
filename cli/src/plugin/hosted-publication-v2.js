import { createHash, randomUUID } from 'node:crypto';
import {
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

import { createCoordinatedPublicationAdapters } from './coordinated-publication.js';
import {
  assertCoordinatedReleaseV1,
  prepareCoordinatedRelease,
  publicationPlanSha256,
  renderPublicationPlan,
} from './coordinated-release.js';
import {
  assertNativeTrustEvidenceV2,
  trustDigest,
} from './native-trust-evidence-v2.js';
import {
  advanceReleaseStageV2,
  assertReleaseLifecycleV2,
  RELEASE_STAGE_SEQUENCE_V2,
} from './release-lifecycle-v2.js';

export const HOSTED_PUBLICATION_RECEIPT_SCHEMA_VERSION = 2;

const SHA256 = /^[a-f0-9]{64}$/u;
const PUBLICATION_ORDER = Object.freeze([
  'tag',
  'pluginMarketplace',
  'desktopPrerelease',
  'updateManifest',
  'earlyAccessWebsite',
]);

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function sha256File(path) {
  return sha256(await readFile(path));
}

async function inventoryTree(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Publication packet contains a symbolic link: ${path}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const details = await stat(path);
        files.push({
          path: relative(root, path).split(sep).join('/'),
          bytes: details.size,
          sha256: await sha256File(path),
        });
      } else throw new Error(`Publication packet contains an unsupported entry: ${path}`);
    }
  }
  await visit(root);
  return files;
}

function treeDigest(files) {
  return sha256(stableJson(files));
}

function artifactIdentity(value) {
  return { filename: value?.filename, bytes: value?.bytes, sha256: value?.sha256 };
}

function exact(left, right) {
  return trustDigest(left) === trustDigest(right);
}

function distributionStage(record) {
  const index = RELEASE_STAGE_SEQUENCE_V2.indexOf('distribution-finalized');
  if (record.stages.length <= index) {
    throw new Error('Hosted publication requires a distribution-finalized schema-v2 packet');
  }
  return record.stages[index];
}

function stage(record, name) {
  return record.stages.find((entry) => entry.stage === name) ?? null;
}

function createReceiptJournal(record, planSha256) {
  return {
    schemaVersion: HOSTED_PUBLICATION_RECEIPT_SCHEMA_VERSION,
    kind: 'gatereeve-hosted-publication-receipts',
    releaseId: record.releaseId,
    source: structuredClone(record.source),
    planSha256,
    order: [...PUBLICATION_ORDER],
    receipts: [],
  };
}

export function assertHostedPublicationReceipts(value, record, planSha256) {
  if (
    value?.schemaVersion !== HOSTED_PUBLICATION_RECEIPT_SCHEMA_VERSION
    || value.kind !== 'gatereeve-hosted-publication-receipts'
    || value.releaseId !== record.releaseId
    || JSON.stringify(value.source) !== JSON.stringify(record.source)
    || value.planSha256 !== planSha256
    || JSON.stringify(value.order) !== JSON.stringify(PUBLICATION_ORDER)
    || !Array.isArray(value.receipts)
    || value.receipts.length > PUBLICATION_ORDER.length
  ) throw new Error('Hosted publication receipt journal identity is invalid');
  value.receipts.forEach((receipt, index) => {
    if (
      receipt?.surface !== PUBLICATION_ORDER[index]
      || receipt.tag !== record.source.tag
      || receipt.sourceCommit !== record.source.commit
      || typeof receipt.identity !== 'string'
      || receipt.identity === ''
      || !Number.isFinite(Date.parse(receipt.completedAt))
    ) throw new Error('Hosted publication receipts must form an exact ordered prefix');
  });
  return value;
}

function projection(record, receipts) {
  const finalized = distributionStage(record).evidence;
  const approval = stage(record, 'publication-approved')?.evidence ?? null;
  const surfaces = Object.fromEntries(PUBLICATION_ORDER.map((surface, index) => {
    const receipt = receipts.receipts[index] ?? null;
    return [surface, receipt === null
      ? { state: 'pending', receipt: null }
      : { state: 'complete', receipt: structuredClone(receipt) }];
  }));
  const complete = receipts.receipts.length === PUBLICATION_ORDER.length;
  const value = {
    schemaVersion: 1,
    releaseId: record.releaseId,
    version: record.version,
    channel: record.channel,
    source: structuredClone(record.source),
    promotion: structuredClone(finalized.promotion),
    state: complete ? 'published' : receipts.receipts.length > 0
      ? 'publishing' : approval === null ? 'prepared' : 'approved',
    candidates: structuredClone(finalized.candidates),
    publication: {
      order: [...PUBLICATION_ORDER],
      approval: approval === null ? { state: 'unapproved' } : {
        state: 'approved',
        approvedBy: approval.approvedBy,
        approvedAt: approval.approvedAt,
        planSha256: approval.planSha256,
      },
      inputs: structuredClone(finalized.publication.inputs),
      outputs: structuredClone(finalized.publication.outputs),
      surfaces,
    },
    createdAt: record.createdAt,
    updatedAt: receipts.receipts.at(-1)?.completedAt ?? approval?.approvedAt ?? record.updatedAt,
  };
  return assertCoordinatedReleaseV1(value);
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

async function verifyIdentity(root, identity) {
  const path = resolve(root, identity.path);
  const details = await stat(path);
  if (!details.isFile() || details.size !== identity.bytes || await sha256File(path) !== identity.sha256) {
    throw new Error(`Finalized publication packet changed: ${identity.path}`);
  }
}

async function assertFinalizationMatchesTrustedLifecycle({
  trusted,
  prepared,
  pluginRoot,
  desktopEvidencePaths,
}) {
  const pluginEvidence = stage(trusted, 'plugin-candidate-built')?.evidence;
  const pluginFiles = await inventoryTree(resolve(pluginRoot));
  const trustedPluginFiles = pluginEvidence?.files?.map(({ path, bytes, sha256: digest }) => ({
    path,
    bytes,
    sha256: digest,
  }));
  if (
    !Array.isArray(trustedPluginFiles)
    || !exact(pluginFiles, trustedPluginFiles)
    || pluginEvidence.treeSha256 !== sha256(stableJson(pluginEvidence.files))
    || prepared.record.candidates.plugin.artifact.fileCount !== pluginFiles.length
  ) throw new Error('Finalization Plugin candidate differs from the trusted lifecycle');

  const trustedArtifact = artifactIdentity(trusted.candidate.appleArtifact);
  const preparedArtifact = artifactIdentity(prepared.record.candidates.desktop.artifact);
  const digestEvidence = stage(trusted, 'artifact-digests-established')?.evidence;
  if (
    !exact(trustedArtifact, preparedArtifact)
    || digestEvidence?.pluginTreeSha256 !== pluginEvidence.treeSha256
    || digestEvidence?.finalTrustedDmgSha256 !== preparedArtifact.sha256
  ) throw new Error('Finalization artifacts differ from the trusted lifecycle');

  const documents = await Promise.all(desktopEvidencePaths.map(async (path) => (
    assertNativeTrustEvidenceV2(JSON.parse(await readFile(resolve(path), 'utf8')))
  )));
  const authoritative = stage(trusted, 'authoritative-native-verified')?.evidence;
  const expectedDocuments = documents.map((document) => ({
    architecture: document.runner.architecture,
    evidenceSha256: trustDigest(document),
    verifiedAt: document.verifiedAt,
  })).sort((left, right) => left.architecture.localeCompare(right.architecture));
  const recordedDocuments = authoritative?.documents?.toSorted(
    (left, right) => left.architecture.localeCompare(right.architecture),
  );
  if (!exact(expectedDocuments, recordedDocuments)) {
    throw new Error('Finalization native evidence differs from the trusted lifecycle');
  }

  const desktopTrust = stage(trusted, 'desktop-trust-verified')?.evidence;
  const appleEvidenceSha256 = documents[0]?.appleTrustEvidenceSha256;
  const notarization = documents[0]?.notarization;
  const trust = documents[0]?.trust;
  if (
    documents.some((document) => (
      document.appleTrustEvidenceSha256 !== appleEvidenceSha256
      || !exact(document.notarization, notarization)
      || !exact(document.trust, trust)
      || !exact(artifactIdentity(document.artifact), preparedArtifact)
    ))
    || appleEvidenceSha256 !== digestEvidence?.appleTrustEvidenceSha256
    || appleEvidenceSha256 !== desktopTrust?.appleTrustEvidenceSha256
    || !exact(notarization, {
      attemptId: desktopTrust?.notarization?.attemptId,
      requestId: desktopTrust?.notarization?.requestId,
      status: desktopTrust?.notarization?.status,
    })
    || !exact(desktopTrust?.signature, {
      identity: trust?.identity,
      teamId: trust?.teamId,
      hardenedRuntime: trust?.hardenedRuntime,
      secureTimestamp: trust?.secureTimestamp,
    })
    || desktopTrust?.staple?.validated !== trust?.stapled
    || desktopTrust?.gatekeeper?.diskImage !== 'accepted'
    || trust?.gatekeeperAccepted !== true
  ) throw new Error('Finalization Apple trust differs from the trusted lifecycle');
}

export async function verifyHostedPublicationPacket(recordPath) {
  const path = resolve(recordPath);
  const root = dirname(path);
  const record = assertReleaseLifecycleV2(JSON.parse(await readFile(path, 'utf8')));
  const finalized = distributionStage(record).evidence;
  if (
    finalized?.kind !== 'gatereeve-distribution-packet'
    || finalized.schemaVersion !== 2
    || !SHA256.test(finalized.planSha256 ?? '')
    || JSON.stringify(finalized.publication?.order) !== JSON.stringify(PUBLICATION_ORDER)
  ) throw new Error('Distribution-finalized evidence is invalid');
  const receiptsPath = resolve(root, 'publication-receipts.json');
  const receipts = assertHostedPublicationReceipts(
    JSON.parse(await readFile(receiptsPath, 'utf8')),
    record,
    finalized.planSha256,
  );
  const projected = projection(record, receipts);
  if (publicationPlanSha256(projected) !== finalized.planSha256) {
    throw new Error('Sealed publication plan digest changed');
  }
  if (await readFile(resolve(root, 'publication-plan.md'), 'utf8') !== renderPublicationPlan(projected)) {
    throw new Error('Sealed publication plan bytes changed');
  }
  const pluginFiles = await inventoryTree(resolve(root, projected.candidates.plugin.artifact.path));
  if (
    pluginFiles.length !== projected.candidates.plugin.artifact.fileCount
    || treeDigest(pluginFiles) !== projected.candidates.plugin.artifact.sha256
  ) throw new Error('Finalized Plugin candidate changed');
  await verifyIdentity(root, projected.candidates.desktop.artifact);
  for (const evidence of projected.candidates.desktop.verification.evidence) {
    await verifyIdentity(root, {
      ...evidence,
      bytes: (await stat(resolve(root, evidence.path))).size,
    });
  }
  for (const identity of [
    ...Object.values(projected.publication.inputs),
    ...Object.values(projected.publication.outputs).filter(Boolean),
  ]) await verifyIdentity(root, identity);
  const published = stage(record, 'published');
  if (published !== null) {
    if (
      receipts.receipts.length !== PUBLICATION_ORDER.length
      || published.evidence.planSha256 !== finalized.planSha256
      || published.evidence.receiptsSha256 !== sha256(stableJson(receipts))
    ) throw new Error('Published lifecycle stage does not match the receipt journal');
  }
  return { record, receipts, projected, root, recordPath: path, receiptsPath };
}

export async function finalizeHostedPublicationV2({
  trustedRecordPath,
  pluginRoot,
  desktopDmgPath,
  desktopEvidencePaths,
  currentUpdateManifestPath,
  outputRoot,
  now = () => new Date(),
}) {
  const trusted = assertReleaseLifecycleV2(
    JSON.parse(await readFile(resolve(trustedRecordPath), 'utf8')),
  );
  if (trusted.stages.at(-1).stage !== 'desktop-trust-verified') {
    throw new Error('Distribution finalization requires exactly desktop-trust-verified lifecycle state');
  }
  const output = resolve(outputRoot);
  try {
    if ((await readdir(output)).length > 0) throw new Error(`Publication output must be absent or empty: ${output}`);
    await rm(output, { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(output), { recursive: true });
  const staging = await mkdtemp(resolve(dirname(output), '.gatereeve-hosted-publication-'));
  const packet = resolve(staging, 'packet');
  try {
    const prepared = await prepareCoordinatedRelease({
      sourceTag: trusted.source.tag,
      sourceCommit: trusted.source.commit,
      repository: trusted.source.repository,
      pluginRoot,
      desktopDmgPath,
      desktopEvidencePaths,
      currentUpdateManifestPath,
      outputRoot: packet,
      now,
    });
    await assertFinalizationMatchesTrustedLifecycle({
      trusted,
      prepared,
      pluginRoot,
      desktopEvidencePaths,
    });
    const finalizedEvidence = {
      schemaVersion: 2,
      kind: 'gatereeve-distribution-packet',
      promotion: structuredClone(prepared.record.promotion),
      candidates: structuredClone(prepared.record.candidates),
      publication: {
        order: [...PUBLICATION_ORDER],
        inputs: structuredClone(prepared.record.publication.inputs),
        outputs: structuredClone(prepared.record.publication.outputs),
      },
      planSha256: prepared.planSha256,
    };
    const finalized = advanceReleaseStageV2(trusted, 'distribution-finalized', finalizedEvidence, now);
    await writeFile(resolve(packet, 'release-record.json'), stableJson(finalized));
    await writeFile(
      resolve(packet, 'publication-receipts.json'),
      stableJson(createReceiptJournal(finalized, prepared.planSha256)),
      { flag: 'wx' },
    );
    await verifyHostedPublicationPacket(resolve(packet, 'release-record.json'));
    await rename(packet, output);
    return {
      schemaVersion: 2,
      outputRoot: output,
      recordPath: resolve(output, 'release-record.json'),
      receiptsPath: resolve(output, 'publication-receipts.json'),
      planPath: resolve(output, 'publication-plan.md'),
      planSha256: prepared.planSha256,
      record: finalized,
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function publishHostedReleaseV2({
  recordPath,
  repositoryRoot,
  planSha256: approvedPlanSha256,
  approvedBy,
  confirm = false,
  dryRun = false,
  request,
  runner,
  fetchFn,
  sleep,
  websiteAttempts,
  websiteIntervalMilliseconds,
  adapters: providedAdapters,
  now = () => new Date(),
}) {
  if (confirm === dryRun) throw new Error('Choose exactly one of confirm or dryRun');
  let packet = await verifyHostedPublicationPacket(recordPath);
  const finalized = distributionStage(packet.record).evidence;
  if (approvedPlanSha256 !== finalized.planSha256) {
    throw new Error(`Publication plan digest differs; expected ${finalized.planSha256}`);
  }
  const adapters = providedAdapters ?? createCoordinatedPublicationAdapters({
    record: packet.projected,
    repositoryRoot,
    workspaceRoot: packet.root,
    planSha256: finalized.planSha256,
    request,
    runner,
    fetchFn,
    sleep,
    websiteAttempts,
    websiteIntervalMilliseconds,
  });
  for (const surface of PUBLICATION_ORDER) await adapters[surface].preflight(packet.projected);
  if (dryRun) return { dryRun: true, ...packet, planSha256: finalized.planSha256 };
  if (typeof approvedBy !== 'string' || approvedBy.trim() === '') {
    throw new Error('Hosted publication confirmation requires an approver identity');
  }
  if (stage(packet.record, 'publication-approved') === null) {
    const approvedAt = now().toISOString();
    packet.record = advanceReleaseStageV2(packet.record, 'publication-approved', {
      approvedBy,
      approvedAt,
      planSha256: finalized.planSha256,
      environment: 'release-publication',
    }, () => new Date(approvedAt));
    await atomicJson(packet.recordPath, packet.record);
    packet = await verifyHostedPublicationPacket(packet.recordPath);
  }
  const approval = stage(packet.record, 'publication-approved').evidence;
  if (approval.planSha256 !== finalized.planSha256 || approval.approvedBy !== approvedBy) {
    throw new Error('Hosted publication approval differs from the sealed plan or approver');
  }
  for (let index = packet.receipts.receipts.length; index < PUBLICATION_ORDER.length; index += 1) {
    const surface = PUBLICATION_ORDER[index];
    const result = await adapters[surface].converge({ record: packet.projected, surface });
    const completedAt = now().toISOString();
    packet.receipts.receipts.push({
      surface,
      tag: packet.record.source.tag,
      sourceCommit: packet.record.source.commit,
      identity: result?.identity,
      completedAt,
    });
    assertHostedPublicationReceipts(packet.receipts, packet.record, finalized.planSha256);
    await atomicJson(packet.receiptsPath, packet.receipts);
    packet = await verifyHostedPublicationPacket(packet.recordPath);
  }
  if (stage(packet.record, 'published') === null) {
    packet.record = advanceReleaseStageV2(packet.record, 'published', {
      planSha256: finalized.planSha256,
      receiptsSha256: sha256(stableJson(packet.receipts)),
      surfaces: [...PUBLICATION_ORDER],
    }, now);
    await atomicJson(packet.recordPath, packet.record);
  }
  packet = await verifyHostedPublicationPacket(packet.recordPath);
  return { dryRun: false, ...packet, planSha256: finalized.planSha256 };
}

export const HOSTED_PUBLICATION_SURFACES_V2 = PUBLICATION_ORDER;
