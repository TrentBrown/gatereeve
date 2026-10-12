import { ContractError } from './errors.js';
import { fingerprint, SHA256_FINGERPRINT } from './fingerprint.js';

export const RECOVERY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
export const RECOVERY_SHA = /^[0-9a-f]{40}$/u;
export const VERIFICATION_CATEGORIES = ['build', 'lint', 'unit', 'integration', 'endToEnd', 'runtime'];

export function requireRecovery(condition, message) {
  if (!condition) throw new ContractError(`Completion recovery: ${message}`);
}

export function boundReport(report, kind, featureId, source) {
  requireRecovery(report?.schemaVersion === 1 && report.kind === kind
    && report.featureId === featureId && report.scope === 'FEATURE'
    && report.source && typeof report.source === 'object'
    && fingerprint(report.source) === fingerprint(source),
  `${kind} must bind this feature, whole-feature scope and the exact source/requirements`);
}

export function confirmation(value, label) {
  requireRecovery(value?.kind === 'human-confirmed' && typeof value.label === 'string'
    && value.label.trim().length > 0, `${label} requires explicit human confirmation`);
}

export function validateRecoveryWaiver(report, featureId, source) {
  boundReport(report, 'whole-feature-judge-waiver', featureId, source);
  requireRecovery(report.obligation === 'whole-feature-judge'
    && typeof report.reason === 'string' && report.reason.trim().length > 0,
  'a tooling error, slice verdict or general proceed instruction is not a whole-feature Judge waiver');
  confirmation(report.confirmedBy, 'whole-feature Judge waiver');
  requireRecovery(['observed-confirmation', 'historical-confirmation'].includes(report.confirmation?.kind)
    && typeof report.confirmation.quote === 'string' && report.confirmation.quote.trim().length > 0,
  'waiver must retain the observed explicit confirmation and its bound evidence');
  requireRecovery(/\b(?:waiv(?:e|ed|ing|er)|wav(?:e|ed|ing))\b/iu.test(report.confirmation.quote)
    && /\bjudge\b/iu.test(report.confirmation.quote)
    && !/\bslice(?:[-\s]+only)?\s+judge\b/iu.test(report.confirmation.quote),
  'confirmation does not explicitly waive the applicable Judge obligation');
  if (report.confirmation.kind === 'historical-confirmation') requireRecovery(
    typeof report.confirmation.context === 'string'
    && /whole[- ]feature|feature[- ]final/iu.test(report.confirmation.context),
    'ambiguous historical scope requires reconciliation against explicit whole-feature context');
  const quotedSources = [...report.confirmation.quote.matchAll(/\b[0-9a-f]{40}\b/giu)]
    .map((match) => match[0].toLowerCase());
  requireRecovery(quotedSources.every((sha) => [source.integrationSha, source.featureBaseSha].includes(sha)),
    'explicit source in waiver confirmation conflicts with the selected source; reconcile its applicability');
}

function evidenceReferences(value, label) {
  requireRecovery(Array.isArray(value) && value.length > 0, `${label} requires concrete evidence`);
  for (const ref of value) requireRecovery(typeof ref?.path === 'string'
    && ref.path.length > 0 && SHA256_FINGERPRINT.test(ref.hash), `${label} evidence reference is invalid`);
}

export function validateRecoveryReports(receipt, modules) {
  const { featureId, source, requirements, verification, specEvaluation, retention } = receipt;
  requireRecovery(Array.isArray(requirements?.rubricIds) && requirements.rubricIds.length > 0
    && new Set(requirements.rubricIds).size === requirements.rubricIds.length
    && source.requirementsIdentity === fingerprint(requirements), 'approved requirement identity is invalid');
  for (const [report, kind, gateId] of [[verification, 'feature-verification', 'verification'],
    [specEvaluation, 'feature-spec-evaluation', 'specEvaluation']]) {
    boundReport(report, kind, featureId, source);
    if (report.outcome === 'WAIVED') {
      const module = modules.find((item) => item.boundary?.gateId === gateId);
      requireRecovery(module?.waiverAllowed === true, `${gateId} waiver is prohibited by the pinned policy`);
      confirmation(report.waiver?.confirmedBy, `${gateId} waiver`);
      requireRecovery(report.waiver.obligation === kind && report.waiver.reason?.trim(),
        `${gateId} requires its own explicit whole-feature waiver`);
      evidenceReferences(report.waiver.evidence, `${gateId} waiver`);
      requireRecovery(typeof report.waiver.confirmation?.quote === 'string'
        && /\bwaiv(?:e|ed|ing|er)\b/iu.test(report.waiver.confirmation.quote)
        && (gateId === 'verification' ? /verification/iu : /spec/iu).test(report.waiver.confirmation.quote),
      `${gateId} waiver requires its own observed explicit confirmation`);
      evidenceReferences([report.waiver.confirmation.evidence], `${gateId} confirmation`);
      if (module.waiverPolicy === 'non-behavioral-only') {
        requireRecovery(report.waiver.waiverBasis?.classification === 'NON_BEHAVIORAL',
          `${gateId} waiver requires human non-behavioral classification`);
        evidenceReferences([report.waiver.waiverBasis.evidence], `${gateId} classification`);
      }
      continue;
    }
    requireRecovery(report.outcome === 'PASS', `${gateId} has not passed`);
    if (gateId === 'verification') {
      const actual = report.checks?.map((check) => check.category) ?? [];
      requireRecovery(fingerprint([...actual].sort()) === fingerprint([...VERIFICATION_CATEGORIES].sort()),
        'whole-feature verification must account for all six check categories exactly once');
      for (const check of report.checks) {
        requireRecovery(['PASS', 'NOT_APPLICABLE'].includes(check.outcome), 'verification contains an unresolved check');
        if (check.outcome === 'NOT_APPLICABLE') requireRecovery(check.reason?.trim(), 'N/A checks require a reason');
        else {
          requireRecovery(check.command?.trim(), 'passed checks require their actual command');
          evidenceReferences(check.evidence, 'verification check');
        }
      }
    } else {
      const actual = report.criteria?.map((criterion) => criterion.id) ?? [];
      requireRecovery(fingerprint([...actual].sort()) === fingerprint([...requirements.rubricIds].sort()),
        'spec evaluation must cover the entire approved rubric exactly once');
      for (const criterion of report.criteria) {
        requireRecovery(criterion.result === 'PASS' && criterion.explanation?.trim(), 'spec has an unresolved criterion');
        evidenceReferences(criterion.evidence, 'spec criterion');
      }
    }
  }
  boundReport(retention, 'feature-retention', featureId, source);
  requireRecovery(['TRACKED', 'HUMAN_RETAINED'].includes(retention.outcome), 'retention is unresolved');
  if (retention.outcome === 'HUMAN_RETAINED') {
    confirmation(retention.confirmedBy, 'retention decision');
    requireRecovery(retention.decision === 'retain-workspace' && retention.reason?.trim(),
      'untracked records require an explicit decision to retain this workspace');
    evidenceReferences(retention.evidence, 'retention decision');
    requireRecovery(typeof retention.confirmation?.quote === 'string'
      && /retain|keep|preserve/iu.test(retention.confirmation.quote)
      && /workspace/iu.test(retention.confirmation.quote), 'retention requires an observed explicit workspace decision');
    evidenceReferences([retention.confirmation.evidence], 'retention confirmation');
  }
}

// Replay checks the immutable validated receipt against the actual prior
// journal. Git/filesystem verification happens before the event is appended.
export function validateRecoveryEvent(payload, { featureId, slices, acceptedReviews, events, modules }) {
  requireRecovery(payload?.schemaVersion === 1 && typeof payload.recoveryId === 'string' && RECOVERY_ID.test(payload.recoveryId)
    && RECOVERY_SHA.test(payload.integrationSha)
    && SHA256_FINGERPRINT.test(payload.requestIdentity), 'recovery identity is invalid');
  const receipt = payload.receipt;
  requireRecovery(receipt?.schemaVersion === 1 && receipt.kind === 'validated-feature-recovery'
    && receipt.featureId === featureId && receipt.source?.integrationSha === payload.integrationSha
    && RECOVERY_SHA.test(receipt.source.featureBaseSha)
    && SHA256_FINGERPRINT.test(receipt.source.requirementsIdentity)
    && payload.receiptHash === fingerprint(receipt), 'validated receipt binding is invalid');
  validateRecoveryWaiver(receipt.waiver, featureId, receipt.source);
  validateRecoveryReports(receipt, modules);
  requireRecovery(slices.length > 0 && slices.every((slice) => ['MERGED', 'ABANDONED'].includes(slice.state)),
    'all delivery must be resolved');
  const merged = slices.filter((slice) => slice.state === 'MERGED');
  requireRecovery(merged.length > 0 && Array.isArray(receipt.merges) && receipt.merges.length === merged.length,
    'receipt must account for every merged slice');
  for (const slice of merged) {
    const merge = events.findLast((event) => event.type === 'SLICE_MERGE_RECORDED'
      && event.payload.sliceId === slice.id);
    const binding = receipt.merges.find((item) => item.sliceId === slice.id);
    const started = events.findLast((event) => event.type === 'BOUNDARY_STARTED'
      && event.payload.sliceId === slice.id && event.sequence < merge?.sequence);
    const observed = merge?.payload.mergeVerification ?? merge?.payload.proof ?? {};
    const expectedBase = observed.reviewedBaseSha ?? merge?.payload.reviewedBaseSha ?? started?.payload.context?.mergeBaseSha;
    const expectedHead = observed.reviewedHeadSha ?? merge?.payload.reviewedHeadSha
      ?? started?.payload.context?.evaluatedSourceSha ?? started?.payload.context?.headSha;
    requireRecovery(acceptedReviews.has(slice.id) && merge && binding
      && binding.eventId === merge.eventId && binding.eventHash === fingerprint(merge)
      && binding.proof.integrationSha === payload.integrationSha
      && binding.proof.status === 'verified'
      && binding.proof.reviewedBaseSha === expectedBase && binding.proof.reviewedHeadSha === expectedHead
      && ['ancestor', 'tree-content'].includes(binding.proof.method)
      && binding.recordedIntegrationSha === (merge.payload.integrationSha ?? merge.payload.mergeCommitSha),
    `merge provenance is invalid for ${slice.id}`);
  }
  const last = merged.at(-1);
  const lastMerge = events.findLast((event) => event.type === 'SLICE_MERGE_RECORDED'
    && event.payload.sliceId === last.id);
  const lastBoundary = events.findLast((event) => event.type === 'BOUNDARY_STARTED'
    && event.payload.sliceId === last.id && event.sequence < lastMerge.sequence);
  requireRecovery(lastBoundary?.payload.scope === 'SLICE' && lastMerge.payload.featureFinal !== true,
    'recovery applies to a final delivery merged at slice scope');
  boundReport(receipt.verification, 'feature-verification', featureId, receipt.source);
  boundReport(receipt.specEvaluation, 'feature-spec-evaluation', featureId, receipt.source);
  boundReport(receipt.retention, 'feature-retention', featureId, receipt.source);
  requireRecovery(['PASS', 'WAIVED'].includes(receipt.verification.outcome)
    && ['PASS', 'WAIVED'].includes(receipt.specEvaluation.outcome)
    && ['TRACKED', 'HUMAN_RETAINED'].includes(receipt.retention.outcome),
  'remaining completion obligations lack a permitted disposition');
  return receipt;
}
