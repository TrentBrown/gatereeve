import { ContractError } from './errors.js';

export const GUARD_DESCRIPTORS = Object.freeze({
  'feature.record.absent': { provider: 'core', fact: 'featureRecordAbsent' },
  'design.approval.confirmed': { provider: 'core', fact: 'designApprovalCurrent' },
  'spec.validation.current': { provider: 'python', fact: 'specValidationCurrent' },
  'plan.authorization.current': { provider: 'core', fact: 'planAuthorizationCurrent' },
  'slice.noneActive': { provider: 'core', fact: 'noActiveSlice' },
  'slice.readiness.current': { provider: 'core', fact: 'sliceReadinessCurrent' },
  'slice.active': { provider: 'core', fact: 'activeSliceExists' },
  'boundary.context.current': { provider: 'python', fact: 'boundaryContextCurrent' },
  'boundary.requiredGates.current': {
    provider: 'core',
    fact: 'requiredBoundaryGatesCurrentAndNonblocking',
  },
  'human.review.accepted': { provider: 'core', fact: 'humanReviewAccepted' },
  'merge.reviewedContent.verified': {
    provider: 'python',
    fact: 'reviewedContentMerged',
  },
  'feature.closeout.current': { provider: 'core', fact: 'featureCloseoutCurrent' },
  'feature.abandonment.confirmed': {
    provider: 'core',
    fact: 'featureAbandonmentConfirmed',
  },
  'suspension.notPaused': { provider: 'core', fact: 'featureNotPaused' },
  'change.blockers.none': { provider: 'core', fact: 'noBlockingChanges' },
  'change.authority.satisfied': { provider: 'core', fact: 'changeAuthoritySatisfied' },
  'model.migration.confirmed': { provider: 'core', fact: 'modelMigrationConfirmed' },
});

export const TRUSTED_GUARD_IDS = Object.freeze(Object.keys(GUARD_DESCRIPTORS).sort());

export function assertTrustedGuardIds(guardIds, label = 'guard list') {
  if (!Array.isArray(guardIds)) {
    throw new ContractError(`${label} must be an array`);
  }

  const seen = new Set();
  for (const guardId of guardIds) {
    if (typeof guardId !== 'string' || guardId.length === 0) {
      throw new ContractError(`${label} contains a non-string guard identifier`);
    }
    if (!(guardId in GUARD_DESCRIPTORS)) {
      throw new ContractError(`${label} references unknown guard ${guardId}`);
    }
    if (seen.has(guardId)) {
      throw new ContractError(`${label} contains duplicate guard ${guardId}`);
    }
    seen.add(guardId);
  }
}
