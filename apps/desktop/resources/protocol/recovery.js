import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

import { resolveWorkflowContext } from './context.js';
import { readFeatureRecord } from './feature.js';
import { fingerprint } from './fingerprint.js';
import { appendProjectedEvent, createEvent } from './journal.js';
import { projectRecord } from './projection.js';
import { preflightFeatureTransition } from './transitions.js';
import { runTrustedPythonGuard } from './python-guards.js';
import { RECOVERY_ID, RECOVERY_SHA, requireRecovery, validateRecoveryReports,
  validateRecoveryWaiver } from './recovery-contract.js';

const exec = promisify(execFile);
async function git(root, args) {
  return (await exec('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 })).stdout;
}
async function ancestor(root, before, after) {
  try { await git(root, ['merge-base', '--is-ancestor', before, after]); return true; }
  catch (error) { if (error.code === 1) return false; throw error; }
}

async function boundFile(home, reference, { json = false, text = false, retained = null } = {}) {
  requireRecovery(typeof reference?.path === 'string' && reference.path.length > 0
    && !reference.path.startsWith('/') && !reference.path.includes('\\')
    && reference.path.split('/').every((part) => part && part !== '.' && part !== '..')
    && /^sha256:[0-9a-f]{64}$/u.test(reference.hash ?? ''), 'evidence needs a safe feature-relative path/hash');
  let path = home;
  for (const part of reference.path.split('/')) {
    path = resolve(path, part);
    requireRecovery(!(await lstat(path)).isSymbolicLink(), 'evidence paths cannot contain symlinks');
  }
  const canonical = await realpath(path);
  requireRecovery(canonical.startsWith(home + sep) && (await lstat(canonical)).isFile(), 'evidence escapes the feature record');
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(canonical)) { hash.update(chunk); bytes += chunk.length; }
  requireRecovery(bytes > 0 && reference.hash === 'sha256:' + hash.digest('hex'), 'evidence is empty or its content changed');
  retained?.add(reference.path);
  if (!json && !text) return;
  requireRecovery(bytes <= 1024 * 1024, 'structured evidence or confirmation exceeds the bounded report size');
  const buffer = await readFile(canonical);
  requireRecovery(buffer.length <= 1024 * 1024
    && reference.hash === 'sha256:' + createHash('sha256').update(buffer).digest('hex'),
  'structured evidence changed between hash validation and reading');
  const content = buffer.toString('utf8');
  return json ? JSON.parse(content) : content;
}

async function approvedRequirements(root, home, sha) {
  const featurePath = relative(root, home).split(sep).join('/');
  requireRecovery(/^docs\/issues\/[^/]+$/u.test(featurePath), 'approved documents must be in the selected canonical repository');
  const result = {};
  for (const name of ['spec', 'design']) {
    const path = featurePath + '/' + name + '.md';
    const entry = (await git(root, ['ls-tree', sha, '--', path])).trim();
    requireRecovery(/^(100644|100755) blob /u.test(entry), `approved ${name} is missing or is not a regular Git blob`);
    const content = await git(root, ['show', sha + ':' + path]);
    requireRecovery(content.trim() && (name !== 'design' || /\*\*Status:\*\*\s*approved\b/iu.test(content)), 'approved requirement reconciliation is needed');
    result[name] = { path, hash: 'sha256:' + createHash('sha256').update(content).digest('hex') };
    if (name === 'spec') result.rubricIds = [...content.matchAll(/^\|\s*(R\d+)\s*\|/gmu)].map((match) => match[1]);
  }
  requireRecovery(result.rubricIds.length > 0 && new Set(result.rubricIds).size === result.rubricIds.length,
    'approved rubric IDs are missing or duplicated');
  return result;
}

async function supportingEvidence(home, report, retained) {
  const refs = [];
  for (const check of report.checks ?? []) refs.push(...check.evidence ?? []);
  for (const criterion of report.criteria ?? []) refs.push(...criterion.evidence ?? []);
  refs.push(...report.evidence ?? [], ...report.waiver?.evidence ?? []);
  if (report.waiver?.waiverBasis?.evidence) refs.push(report.waiver.waiverBasis.evidence);
  for (const ref of refs) await boundFile(home, ref, { retained });
  const confirmation = report.waiver?.confirmation ?? report.confirmation;
  if (confirmation) {
    const content = await boundFile(home, confirmation.evidence, { text: true, retained });
    requireRecovery(content.includes(confirmation.quote), 'observed confirmation is absent from its bound evidence');
    if (confirmation.context !== undefined) requireRecovery(content.includes(confirmation.context),
      'observed approval context is absent from its bound evidence');
  }
}

function identity(input) {
  return fingerprint({ recoveryId: input.recoveryId, integrationSha: input.integrationSha,
    waiver: input.waiver, evidence: input.evidence });
}

async function prepare(featureHome, input) {
  const record = await readFeatureRecord(featureHome);
  const home = await realpath(record.featureHome);
  requireRecovery(typeof input.recoveryId === 'string' && RECOVERY_ID.test(input.recoveryId)
    && typeof input.integrationSha === 'string' && RECOVERY_SHA.test(input.integrationSha),
  'stable recovery ID and full integrated source SHA are required');
  requireRecovery(['agent', 'human-confirmed'].includes(input.actor?.kind)
    && typeof input.actor.label === 'string', 'agent-capable actor is required');
  const requestIdentity = identity(input);
  const existing = record.events.find((event) => event.type === 'FEATURE_FINALIZATION_RECOVERED'
    && event.payload.recoveryId === input.recoveryId);
  if (existing) requireRecovery(existing.payload.requestIdentity === requestIdentity, 'recovery ID conflicts with another request');
  const recoveryTransition = record.modelLock.model.feature.transitions.find((transition) => transition.id === 'recover-finalization');
  requireRecovery(recoveryTransition,
    'explicit compatible model adoption is required before recovery');
  requireRecovery(recoveryTransition.from === 'DELIVERING_SLICES' && recoveryTransition.to === 'FINALIZING'
    && recoveryTransition.eventType === 'FEATURE_FINALIZATION_RECOVERED',
  'pinned model must preserve the Delivering Slices to Finalizing recovery contract');
  const projection = projectRecord(record);
  if (!existing) {
    requireRecovery(projection.feature.state === 'DELIVERING_SLICES' && !projection.suspension.paused
      && projection.blockingChangeIds.length === 0 && projection.implementationAuthorization?.current,
    'feature is paused, blocked, unauthorized or outside Delivering Slices');
    requireRecovery(projection.slices.length > 0 && projection.slices.every((slice) => ['MERGED', 'ABANDONED'].includes(slice.state)),
      'active or unresolved delivery prevents recovery');
  }
  requireRecovery(typeof input.repositoryRoot === 'string' && input.repositoryRoot.trim(), 'selected repository root is required');
  const root = await realpath(resolve(input.repositoryRoot));
  requireRecovery((await git(root, ['rev-parse', '--show-toplevel'])).trim() === root, 'selected repository must be its Git top level');
  const context = await resolveWorkflowContext({ cwd: root, repository: input.repositoryAlias ?? null });
  requireRecovery(await realpath(context.featureHome) === home && context.featureId === record.events[0].featureId,
    'selected repository and feature identity do not match');
  const base = context.repository.featureBaseSha;
  requireRecovery(RECOVERY_SHA.test(base ?? ''), 'configured original feature base is required');
  const integratedRef = context.repository.remote + '/' + context.repository.integrationBranch;
  const integrationHead = (await git(root, ['rev-parse', integratedRef + '^{commit}'])).trim();
  requireRecovery(await ancestor(root, base, input.integrationSha)
    && await ancestor(root, input.integrationSha, integrationHead), 'selected source is not on the configured integration history');
  const requirements = await approvedRequirements(root, home, input.integrationSha);
  const source = { featureBaseSha: base, integrationSha: input.integrationSha, requirementsIdentity: fingerprint(requirements) };
  const featureId = context.featureId;
  const retained = new Set();
  const waiver = await boundFile(home, input.waiver, { json: true, retained });
  validateRecoveryWaiver(waiver, featureId, source);
  const confirmationText = await boundFile(home, waiver.confirmation.evidence, { text: true, retained });
  requireRecovery(confirmationText.includes(waiver.confirmation.quote), 'waiver quote is not present in its bound confirmation evidence');
  if (waiver.confirmation.context) requireRecovery(typeof waiver.confirmation.context === 'string'
    && confirmationText.includes(waiver.confirmation.context), 'waiver approval context is not present in its bound evidence');
  const reports = {};
  for (const key of ['verification', 'specEvaluation', 'retention']) reports[key] = await boundFile(home, input.evidence?.[key], { json: true, retained });
  const receipt = { schemaVersion: 1, kind: 'validated-feature-recovery', featureId, source,
    requirements, waiver, ...reports, references: { waiver: input.waiver, ...input.evidence }, merges: [] };
  validateRecoveryReports(receipt, record.modelLock.model.moduleGraph?.modules ?? []);
  for (const report of Object.values(reports)) await supportingEvidence(home, report, retained);
  if (reports.retention.outcome === 'TRACKED') {
    const path = relative(root, home).split(sep).join('/');
    const dirty = (await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching', '--', path]))
      .split('\0').filter(Boolean);
    requireRecovery(dirty.length === 0 || (existing && dirty.every((item) => item.slice(3) === path + '/events.jsonl')),
      'tracked retention requires a clean fully tracked feature record before recovery');
    const trackedPaths = new Set((await git(root, ['ls-files', '-z', '--', path])).split('\0'));
    requireRecovery([...retained].every((reference) => trackedPaths.has(path + '/' + reference)),
      'tracked retention requires every bound report, confirmation and supporting evidence file to be tracked');
    const tracked = (await git(root, ['ls-files', '--stage', '--', path])).split('\n');
    requireRecovery(!tracked.some((line) => line.startsWith('120000 ')), 'retained feature records contain a symlink');
  }
  const merged = projection.slices.filter((slice) => slice.state === 'MERGED');
  requireRecovery(merged.length > 0, 'at least one accepted merged slice is required');
  for (const slice of merged) {
    requireRecovery(projection.acceptedReviewSliceIds.includes(slice.id), 'a slice lacks accepted human review');
    const merge = record.events.findLast((event) => event.type === 'SLICE_MERGE_RECORDED' && event.payload.sliceId === slice.id);
    const started = record.events.findLast((event) => event.type === 'BOUNDARY_STARTED'
      && event.payload.sliceId === slice.id && event.sequence < merge.sequence);
    const range = started?.payload.context;
    const observed = merge.payload.mergeVerification ?? merge.payload.proof ?? {};
    const recordedIntegrationSha = merge.payload.integrationSha ?? merge.payload.mergeCommitSha;
    requireRecovery(!merge.payload.integrationSha || !merge.payload.mergeCommitSha
      || merge.payload.integrationSha === merge.payload.mergeCommitSha, 'recorded integration identities conflict');
    const reviewedBaseSha = observed.reviewedBaseSha ?? merge.payload.reviewedBaseSha ?? range?.mergeBaseSha;
    const reviewedHeadSha = observed.reviewedHeadSha ?? merge.payload.reviewedHeadSha
      ?? range?.evaluatedSourceSha ?? range?.headSha;
    requireRecovery((!observed.status || observed.status === 'verified')
      && (!observed.integrationSha || observed.integrationSha === recordedIntegrationSha)
      && (!observed.reviewedHeadSha || !merge.payload.reviewedHeadSha
        || observed.reviewedHeadSha === merge.payload.reviewedHeadSha)
      && (!observed.reviewedBaseSha || !merge.payload.reviewedBaseSha
        || observed.reviewedBaseSha === merge.payload.reviewedBaseSha),
    'historical merge proof contains conflicting identities or an unsuccessful result');
    requireRecovery(range && (!range.repositoryAlias || range.repositoryAlias === context.repository.alias)
      && RECOVERY_SHA.test(recordedIntegrationSha ?? '') && RECOVERY_SHA.test(reviewedBaseSha ?? '')
      && RECOVERY_SHA.test(reviewedHeadSha ?? '') && reviewedBaseSha === range.mergeBaseSha,
    'merged slices need unambiguous accepted boundary/source provenance in the selected repository');
    requireRecovery(!range.featureBaseSha || range.featureBaseSha === base, 'original feature base conflicts with historical review');
    const evaluated = range.evaluatedSourceSha ?? range.headSha;
    requireRecovery(RECOVERY_SHA.test(evaluated ?? '') && await ancestor(root, evaluated, reviewedHeadSha),
      'accepted reviewed head does not descend from its evaluated source');
    const paths = (await git(root, ['diff', '--name-only', '-z', evaluated + '..' + reviewedHeadSha])).split('\0').filter(Boolean);
    const featurePath = relative(root, home).split(sep).join('/');
    requireRecovery(paths.every((path) => {
      if (!path.startsWith(featurePath + '/')) return false;
      const local = path.slice(featurePath.length + 1);
      return /^(?:pr-\d+|review-[^/]+)\//u.test(local)
        || ['tracker.md', 'issues.md', 'decisions.md', 'scratchpad.md', 'events.jsonl'].includes(local);
    }), 'non-evidence source moved between evaluated and accepted review heads');
    const first = await runTrustedPythonGuard('merge.reviewedContent.verified', ['--repository', root,
      '--reviewed-base', reviewedBaseSha, '--reviewed-head', reviewedHeadSha,
      '--integration-ref', recordedIntegrationSha, '--json'], { cwd: root });
    requireRecovery(first.passed, 'trusted recorded-merge verification failed: ' + first.stderr);
    requireRecovery(await ancestor(root, recordedIntegrationSha, input.integrationSha), 'recorded merge is not integrated in selected source');
    const proof = await runTrustedPythonGuard('merge.reviewedContent.verified', ['--repository', root,
      '--reviewed-base', reviewedBaseSha, '--reviewed-head', reviewedHeadSha,
      '--integration-ref', input.integrationSha, '--json'], { cwd: root });
    requireRecovery(proof.passed, 'trusted selected-source verification failed: ' + proof.stderr);
    receipt.merges.push({ sliceId: slice.id, eventId: merge.eventId, eventHash: fingerprint(merge),
      recordedIntegrationSha, proof: proof.data });
  }
  const last = merged.at(-1);
  const lastMerge = record.events.findLast((event) => event.type === 'SLICE_MERGE_RECORDED' && event.payload.sliceId === last.id);
  const lastBoundary = record.events.findLast((event) => event.type === 'BOUNDARY_STARTED'
    && event.payload.sliceId === last.id && event.sequence < lastMerge.sequence);
  requireRecovery(lastBoundary?.payload.scope === 'SLICE' && lastMerge.payload.featureFinal !== true,
    'normal feature-final reviews use ordinary finalization');
  const transition = record.modelLock.model.feature.transitions.find((item) => item.id === 'recover-finalization');
  const evaluation = existing ? null : preflightFeatureTransition(record, transition.id,
    { actor: input.actor, facts: { featureRecoveryValidated: true } });
  requireRecovery(existing || evaluation.eligible, 'a configured recovery guard is unmet');
  return { record, projection, requestIdentity, receipt, existing, evaluation };
}

export async function preflightFeatureFinalizationRecovery(featureHome, input) {
  try {
    const prepared = await prepare(featureHome, input);
    return { schemaVersion: 1, eligible: true, blockers: [], recoveryId: input.recoveryId,
      requestIdentity: prepared.requestIdentity, receipt: prepared.receipt,
      alreadyRecorded: Boolean(prepared.existing) };
  } catch (error) {
    return { schemaVersion: 1, eligible: false, blockers: [{ code: error.code ?? 'RECOVERY_INVALID', message: error.message }] };
  }
}

export async function recoverFeatureFinalization(featureHome, input) {
  const prepared = await prepare(featureHome, input);
  if (prepared.existing) return { event: prepared.existing, projection: prepared.projection, alreadyRecorded: true };
  const transition = prepared.record.modelLock.model.feature.transitions.find((item) => item.id === 'recover-finalization');
  const event = createEvent({ sequence: prepared.record.events.length + 1,
    featureId: prepared.record.events[0].featureId, type: 'FEATURE_FINALIZATION_RECOVERED',
    modelHash: prepared.record.modelLock.modelHash, actor: input.actor,
    payload: { schemaVersion: 1, recoveryId: input.recoveryId, integrationSha: input.integrationSha,
      requestIdentity: prepared.requestIdentity, receipt: prepared.receipt, receiptHash: fingerprint(prepared.receipt),
      passage: { transitionId: transition.id, guards: prepared.evaluation.guards } },
    ...(input.eventId ? { eventId: input.eventId } : { eventId: 'evt-recovery-' + input.recoveryId }),
    ...(input.recordedAt ? { recordedAt: input.recordedAt } : {}) });
  await appendProjectedEvent(prepared.record, event, { currentModelHash: prepared.record.modelLock.modelHash });
  return { event, projection: projectRecord(await readFeatureRecord(featureHome)), alreadyRecorded: false };
}
