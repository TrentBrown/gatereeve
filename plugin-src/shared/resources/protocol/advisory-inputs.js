import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { advisoryAssert } from './advisory-contract.js';
import { fingerprint } from './fingerprint.js';
import { readFeatureRecord } from './feature.js';
const exec = promisify(execFile);
const git = async (root, args) =>
  (
    await exec('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 12 * 1024 * 1024,
    })
  ).stdout;
const canonicalJournals = new Set(['workflow-model.lock.json', 'events.jsonl']);
const kinds = new Set([
  'workflow-judge',
  'review-view-audit',
  'gatereeve-agent-workflow-receipt',
  'validated-feature-recovery',
  'whole-feature-judge-waiver',
  'feature-verification',
  'feature-spec-evaluation',
  'feature-retention',
  'workflow-model-migration-impact',
  'slice-advisory-readiness',
  'slice-advisory-review',
  'slice-advisory-claim',
  'slice-advisory-proceed',
]);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const sha = value => /^[0-9a-f]{40}$/u.test(value ?? '');
const text = value => typeof value === 'string' && value.trim().length > 0;
function mergedPullRequest(value) {
  return exact(value, ['repository', 'number', 'url', 'state', 'isDraft', 'baseRefName', 'baseRefOid', 'headRefName', 'headRefOid'])
    && Number.isInteger(value.number) && value.number > 0 && value.state === 'MERGED' && typeof value.isDraft === 'boolean'
    && sha(value.baseRefOid) && sha(value.headRefOid)
    && ['repository', 'url', 'baseRefName', 'headRefName'].every(key => text(value[key]));
}
function retainedMechanicalRecord(value) {
  if (exact(value, ['schemaVersion', 'outcome', 'stage', 'judgeLaunched', 'source', 'error', 'defectClass'])) {
    const defect = value.defectClass;
    return value.schemaVersion === 1 && value.outcome === 'UNAVAILABLE'
      && value.stage === 'compact-input-preparation' && value.judgeLaunched === false && sha(value.source) && text(value.error)
      && exact(defect, ['invariant', 'affectedPaths', 'remediation', 'regression', 'results'])
      && ['invariant', 'remediation', 'regression', 'results'].every(key => text(defect[key]))
      && Array.isArray(defect.affectedPaths) && defect.affectedPaths.every(text);
  }
  if (exact(value, ['schemaVersion', 'outcome', 'stage', 'gateOutcome', 'model', 'reason', 'providerContextId', 'remediation'])) {
    return value.schemaVersion === 1 && value.outcome === 'UNAVAILABLE' && value.stage === 'native-codex' && value.gateOutcome === 'UNSET'
      && ['model', 'reason', 'providerContextId', 'remediation'].every(key => text(value[key]));
  }
  if (exact(value, ['schemaVersion', 'initialOutcome', 'reason', 'invalidatedBy', 'correctOutcome', 'evidence', 'recordedBy', 'sourceIntegrity', 'emptyPriorArtifact'])) {
    return value.schemaVersion === 1 && value.initialOutcome === 'invalidated' && value.correctOutcome === 'PASS'
      && ['reason', 'invalidatedBy', 'evidence', 'recordedBy', 'sourceIntegrity', 'emptyPriorArtifact'].every(key => text(value[key]));
  }
  if (exact(value, ['github', 'proof']) || exact(value, ['pullRequest', 'reviewedHeadSha', 'mergeCommitSha', 'humanConfirmation', 'proof'])) {
    const proof = value.proof;
    if (!exact(proof, ['schemaVersion', 'status', 'method', 'repositoryRoot', 'reviewedBaseSha', 'reviewedHeadSha', 'integrationRef', 'integrationSha', 'changedPaths'])
        || proof.schemaVersion !== 1 || proof.status !== 'verified' || !['ancestor', 'tree-content'].includes(proof.method)
        || !['reviewedBaseSha', 'reviewedHeadSha', 'integrationSha'].every(key => sha(proof[key]))
        || !Array.isArray(proof.changedPaths) || !proof.changedPaths.every(text)) return false;
    if (value.github) return exact(value.github, ['status', 'pullRequest', 'reviewedHeadSha', 'authorization'])
      && value.github.status === 'merged' && value.github.reviewedHeadSha === proof.reviewedHeadSha
      && mergedPullRequest(value.github.pullRequest) && text(value.github.authorization);
    return Number.isInteger(value.pullRequest) && value.pullRequest > 0 && value.reviewedHeadSha === proof.reviewedHeadSha
      && value.mergeCommitSha === proof.integrationSha && text(value.humanConfirmation);
  }
  if (exact(value, ['featureId', 'impact', 'confirmationRequired'])) {
    const impact = value.impact;
    return text(value.featureId) && value.confirmationRequired === true
      && exact(impact, ['fromModelVersion', 'toModelVersion', 'fromModelHash', 'toModelHash',
        'guardsAdded', 'guardsRemoved', 'transitionsAdded', 'transitionsRemoved', 'modulesAdded', 'modulesRemoved', 'modulesChanged', 'boundaryGateIdsInvalidated'])
      && ['fromModelVersion', 'toModelVersion', 'fromModelHash', 'toModelHash'].every(key => text(impact[key]))
      && ['guardsAdded', 'guardsRemoved', 'transitionsAdded', 'transitionsRemoved', 'modulesAdded', 'modulesRemoved', 'modulesChanged', 'boundaryGateIdsInvalidated'].every(key => Array.isArray(impact[key]));
  }
  if (exact(value, ['schemaVersion', 'kind', 'cases', 'orchestration', 'timing', 'proof'])) {
    return value.schemaVersion === 1 && value.kind === 'structural-cost-verification'
      && Array.isArray(value.cases) && value.cases.length > 0 && value.cases.every(item =>
        exact(item, ['name', 'source', 'metrics', 'inlineManifestFractionOfReferencedText', 'retainedBinaryBlobsAndRepositorySnapshot'])
        && text(item.name) && exact(item.source, ['baseSha', 'headSha', 'sliceBaseSha']) && Object.values(item.source).every(sha)
        && exact(item.metrics, ['manifestBytes', 'materialBytes', 'duplicatePatchBytesAvoided', 'changedFiles'])
        && Object.values(item.metrics).every(number => Number.isSafeInteger(number) && number >= 0)
        && typeof item.inlineManifestFractionOfReferencedText === 'number' && text(item.retainedBinaryBlobsAndRepositorySnapshot))
      && exact(value.orchestration, ['evidence', 'formalAttemptsBeforeAdvisoryDefectDiscovery', 'formalAttemptsAfterRevisedReadyAndInterruptedResume',
        'duplicateAttemptEventsAfterInterruptedResume', 'duplicateGateEventsAfterUncertainRecord', 'commandContract', 'bookkeepingCommitPushCheckpoints', 'bookkeepingLimitation'])
      && ['formalAttemptsBeforeAdvisoryDefectDiscovery', 'formalAttemptsAfterRevisedReadyAndInterruptedResume',
        'duplicateAttemptEventsAfterInterruptedResume', 'duplicateGateEventsAfterUncertainRecord', 'bookkeepingCommitPushCheckpoints']
        .every(key => Number.isSafeInteger(value.orchestration[key]) && value.orchestration[key] >= 0)
      && ['evidence', 'commandContract', 'bookkeepingLimitation'].every(key => text(value.orchestration[key]))
      && exact(value.timing, ['measuredModelLatency', 'historicalWallClockEstimates']) && value.timing.measuredModelLatency === false
      && text(value.timing.historicalWallClockEstimates) && text(value.proof);
  }
  return false;
}
function modularPacketRecord(value) {
  const fields = ['schemaVersion', 'scope', 'featureId', 'repositoryAlias', 'packetId',
    'pullRequest', 'mergeBaseSha', 'evaluatedSourceSha', 'featureBaseSha', 'applicability', 'gates', 'attemptId'];
  const gates = new Set(['verification', 'specEvaluation', 'judge', 'codeReview', 'patternReview', 'explainDiff']);
  const conditional = new Set(['specEvaluation', 'judge', 'patternReview']);
  if (!exact(value, fields) || value.schemaVersion !== 4
      || !/^pr-(?:[A-Za-z0-9._-]+-)?[1-9][0-9]*$/u.test(value.packetId ?? '')
      || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value.attemptId ?? '')
      || !['slice', 'feature-final'].includes(value.scope) || !text(value.featureId) || !text(value.repositoryAlias)
      || !sha(value.mergeBaseSha) || !sha(value.evaluatedSourceSha)
      || (value.scope === 'slice' ? value.featureBaseSha !== null : !sha(value.featureBaseSha))
      || !exact(value.pullRequest, ['repository', 'number', 'url', 'state', 'isDraft', 'baseRefName', 'baseRefOid', 'headRefName', 'headRefOid'])
      || !Number.isSafeInteger(value.pullRequest.number) || value.pullRequest.number < 1
      || !['OPEN', 'CLOSED', 'MERGED'].includes(value.pullRequest.state) || typeof value.pullRequest.isDraft !== 'boolean'
      || !sha(value.pullRequest.baseRefOid) || !sha(value.pullRequest.headRefOid)
      || !['repository', 'url', 'baseRefName', 'headRefName'].every(key => text(value.pullRequest[key]))
      || !value.gates || Array.isArray(value.gates) || !value.applicability) return false;
  const keys = Object.keys(value.gates);
  if (!keys.length || keys.some(key => !gates.has(key))
      || !exact(value.applicability, keys.filter(key => conditional.has(key)))
      || Object.values(value.applicability).some(applicable => typeof applicable !== 'boolean')) return false;
  return Object.values(value.gates).every(gate => exact(gate, ['disposition', 'reason', 'evidence'])
    && ['passed', 'waived', 'not_applicable'].includes(gate.disposition)
    && (gate.disposition === 'passed' ? gate.reason === null : text(gate.reason))
    && (gate.disposition === 'not_applicable' ? gate.evidence === null
      : exact(gate.evidence, ['path', 'sha256']) && text(gate.evidence.path) && /^sha256:[0-9a-f]{64}$/u.test(gate.evidence.sha256 ?? '')));
}

export function isAdvisoryWorkflowRecord(value) {
  if (modularPacketRecord(value)) return true;
  if (retainedMechanicalRecord(value)) return true;
  if (value?.kind === 'workflow-judge') {
    return (
      value.schemaVersion === 1 &&
      ['PASS', 'FAIL'].includes(value.outcome) &&
      /^[0-9a-f]{40}$/u.test(value.source?.headSha ?? '') &&
      value.files?.result?.path === 'judge-result.json' &&
      value.files?.receipt?.path === 'judge-receipt.json'
    );
  }
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (kinds.has(value.kind) ||
      (value.schemaVersion === 1 &&
        value.ok === true &&
        typeof value.operation === 'string' &&
        /^(?:feature|advisory)\./u.test(value.operation)) ||
      (value.schemaVersion === 1 &&
        value.mergeVerification?.status === 'verified' &&
        typeof value.reviewedHeadSha === 'string') ||
      (value.schemaVersion === 1 &&
        value.pullRequest &&
        typeof value.evaluatedSourceSha === 'string' &&
        typeof value.mergeBaseSha === 'string') ||
      (value.schemaVersion === 2 &&
        /^pr-\d+$/u.test(value.packetId ?? '') &&
        value.gates) ||
      (value.schemaVersion === 1 &&
        ['PASS', 'FAIL'].includes(value.verdict) &&
        Array.isArray(value.criteria)) ||
      (value.schemaVersion === 1 &&
        ['valid', 'synchronized', 'verified'].includes(value.status) &&
        (value.evaluatedSourceSha || value.integrationSha)))
  );
}

async function invalidatedEmptyReport(root, path, selectedSha, size) {
  if (size !== 0 || !/^docs\/issues\/[^/]+\/pr-[^/]+\/attempts\//u.test(path)) return false;
  const home = path.split('/').slice(0, 3).join('/');
  // An empty legacy artifact is history only when its exact evidence reference
  // was invalidated and superseded in a valid governed journal. Filename or
  // directory labels alone never classify empty configuration data.
  const record = await readFeatureRecord(root + '/' + home);
  const pinned = JSON.parse('[' + (await git(root, ['show', selectedSha + ':' + home + '/events.jsonl'])).trim().split('\n').join(',') + ']');
  const pinnedById = new Map(pinned.map(event => [event.eventId, event]));
  const events = record.events.filter(event => pinnedById.has(event.eventId)
    && fingerprint(pinnedById.get(event.eventId)) === fingerprint(event));
  const evidencePath = path.slice(home.length + 1);
  return events.some(event => event.type === 'GATE_OUTCOME_RECORDED' && event.payload.evidence?.path === evidencePath
    && events.some(invalidation => invalidation.type === 'GATE_INVALIDATED' && invalidation.sequence > event.sequence
      && invalidation.payload.attemptId === event.payload.attemptId && invalidation.payload.gateIds.includes(event.payload.gateId)
      && events.some(replacement => replacement.type === 'GATE_OUTCOME_RECORDED' && replacement.sequence > invalidation.sequence
        && replacement.payload.attemptId === event.payload.attemptId && replacement.payload.gateId === event.payload.gateId
        && replacement.payload.outcome === 'PASS' && replacement.payload.evidence?.path !== evidencePath)));
}
// Known workflow data may change without affecting advisory review. Bind opaque
// historical data conservatively; new/changed ambiguous configuration-shaped
// files in record namespaces require reconciliation instead of path-label reuse.
export async function opaqueAdvisoryInputIdentity(root, compact) {
  const changed = new Set(
    (
      await git(root, [
        'diff',
        '--name-only',
        '-z',
        compact.change.source.baseSha + '..' + compact.change.source.headSha,
      ])
    )
      .split('\0')
      .filter(Boolean)
  );
  const opaque = [];
  for (const path of compact.excludedPaths.filter((p) =>
    /\.(?:json|yaml|yml|toml|ini|cfg)$/u.test(p)
  )) {
    if (canonicalJournals.has(path.split('/').at(-1))) continue;
    let sha = compact.change.source.headSha;
    let entry = (await git(root, ['ls-tree', sha, '--', path])).trim();
    if (!entry) {
      sha = compact.change.source.baseSha;
      entry = (await git(root, ['ls-tree', sha, '--', path])).trim();
      if (!entry) continue;
    }
    let recognized = false;
    const size = Number(
      (await git(root, ['cat-file', '-s', sha + ':' + path])).trim()
    );
    if (path.endsWith('.json') && size <= 128 * 1024) {
      try {
        recognized = isAdvisoryWorkflowRecord(
          JSON.parse(await git(root, ['show', sha + ':' + path]))
        );
      } catch {
        /* Opaque data is not implicitly authoritative workflow evidence. */
      }
    }
    if (!recognized) recognized = await invalidatedEmptyReport(root, path, sha, size);
    if (recognized) continue;
    advisoryAssert(
      !changed.has(path),
      'changed ambiguous record-space data requires classification: ' + path
    );
    opaque.push({ path, entry });
  }
  return fingerprint(opaque);
}
