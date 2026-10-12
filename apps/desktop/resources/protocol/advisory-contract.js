import { ContractError } from './errors.js';
import { fingerprint, SHA256_FINGERPRINT } from './fingerprint.js';
import {
  validateAgentWorkflowReceipt,
  sha256Digest,
} from './agent-workflow.js';

export const ADVISORY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/u;
export const ADVISORY_OUTCOMES = [
  'READY_FOR_FORMAL_REVIEW',
  'FINDINGS',
  'UNAVAILABLE',
  'NOT_APPLICABLE',
];
export const MAX_ADVISORY_BYTES = 128 * 1024;
function exactFields(value, required, optional = []) {
  advisoryAssert(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      required.every((key) => Object.hasOwn(value, key)) &&
      Object.keys(value).every((key) =>
        [...required, ...optional].includes(key)
      ),
    'record has unsupported or missing fields'
  );
}
function validateSource(value) {
  exactFields(value, [
    'baseSha',
    'headSha',
    'sliceBaseSha',
    'scope',
    'boundaryScope',
  ]);
  advisoryAssert(
    ['baseSha', 'headSha', 'sliceBaseSha'].every((key) =>
      /^[0-9a-f]{40}$/u.test(value[key])
    ) &&
      ['SLICE', 'FEATURE'].includes(value.scope) &&
      ['SLICE', 'FEATURE_FINAL'].includes(value.boundaryScope),
    'retained source binding is invalid'
  );
}
export function advisoryAssert(condition, message) {
  if (!condition) throw new ContractError('Advisory: ' + message);
}
export function advisoryText(value, label, maximum = 2048) {
  advisoryAssert(
    typeof value === 'string' && value.trim() && value.length <= maximum,
    label + ' must be bounded nonempty text'
  );
}
export function advisoryReference(ref) {
  advisoryAssert(
    typeof ref?.path === 'string' &&
      ref.path &&
      !ref.path.startsWith('/') &&
      !ref.path.includes('\\') &&
      ref.path.split('/').every((p) => p && p !== '.' && p !== '..') &&
      SHA256_FINGERPRINT.test(ref.hash),
    'evidence must have a safe relative path and SHA-256 hash'
  );
}
function strings(values, label, maximum = 100) {
  advisoryAssert(
    Array.isArray(values) && values.length && values.length <= maximum,
    label + ' must be a nonempty bounded list'
  );
  values.forEach((value) => advisoryText(value, label));
  advisoryAssert(
    new Set(values).size === values.length,
    label + ' contains duplicates'
  );
}
export function underlyingFindingKey({ invariant, affectedPaths }) {
  advisoryText(invariant, 'finding invariant');
  strings(affectedPaths, 'affected paths');
  affectedPaths.forEach((path) =>
    advisoryReference({ path, hash: 'sha256:' + '0'.repeat(64) })
  );
  return fingerprint({
    invariant: invariant.trim().toLowerCase().replace(/\s+/gu, ' '),
    paths: [...affectedPaths].sort(),
  });
}
export function validateAdvisoryResult(result, criteria, priorFindings) {
  exactFields(result, [
    'schemaVersion',
    'outcome',
    'fullVerification',
    'summary',
    'criteria',
    'scopeCheck',
    'gapCheck',
    'contradictionCheck',
    'findings',
    'checklist',
  ]);
  advisoryAssert(
    result?.schemaVersion === 1 &&
      ['READY_FOR_FORMAL_REVIEW', 'FINDINGS'].includes(result.outcome),
    'provider result outcome is invalid'
  );
  advisoryText(result.summary, 'review summary');
  advisoryAssert(
    result.fullVerification === 'PENDING',
    'advisory cannot certify full verification'
  );
  advisoryAssert(
    Array.isArray(result.criteria) &&
      result.criteria.length === criteria.length,
    'review must cover every in-scope criterion'
  );
  const ids = result.criteria.map((c) => c.id);
  advisoryAssert(
    new Set(ids).size === ids.length &&
      fingerprint([...ids].sort()) === fingerprint([...criteria].sort()),
    'review criteria do not match the complete declared scope'
  );
  for (const row of result.criteria) {
    exactFields(row, ['id', 'result', 'explanation', 'evidence']);
    advisoryAssert(
      ['SATISFIED', 'FINDING'].includes(row.result),
      'criterion has invalid readiness result'
    );
    advisoryText(row.explanation, 'criterion explanation');
    strings(row.evidence, 'criterion evidence');
  }
  const checks = ['scopeCheck', 'gapCheck', 'contradictionCheck'].map(
    (key) => result[key]
  );
  for (const check of checks) {
    exactFields(check, ['result', 'explanation', 'evidence']);
    advisoryAssert(
      ['SATISFIED', 'FINDING'].includes(check?.result),
      'scope/gap/contradiction readiness checks are required'
    );
    advisoryText(check.explanation, 'independent check explanation');
    strings(check.evidence, 'independent check evidence');
  }
  advisoryAssert(
    Array.isArray(result.findings) && result.findings.length <= 100,
    'findings must be bounded'
  );
  const keys = new Set();
  for (const finding of result.findings) {
    exactFields(finding, [
      'summary',
      'criterionIds',
      'invariant',
      'affectedPaths',
      'evidence',
    ]);
    advisoryText(finding.summary, 'finding summary');
    advisoryAssert(
      Array.isArray(finding.criterionIds),
      'finding criteria must be a list'
    );
    advisoryAssert(
      finding.criterionIds.every((id) => criteria.includes(id)),
      'finding is outside declared criteria'
    );
    strings(finding.evidence, 'finding evidence');
    const key = underlyingFindingKey(finding);
    advisoryAssert(!keys.has(key), 'duplicate underlying finding');
    keys.add(key);
  }
  advisoryAssert(
    Array.isArray(result.checklist) &&
      result.checklist.length === priorFindings.length,
    'every prior finding needs an explicit fix check'
  );
  const expected = priorFindings.map((f) => f.id).sort();
  const actual = result.checklist.map((c) => c.findingId).sort();
  advisoryAssert(
    new Set(actual).size === actual.length &&
      fingerprint(actual) === fingerprint(expected),
    'fix checklist differs from bound prior findings'
  );
  for (const row of result.checklist) {
    exactFields(row, ['findingId', 'result', 'explanation', 'evidence']);
    advisoryAssert(
      ['RESOLVED', 'STILL_PRESENT'].includes(row.result),
      'fix check outcome is invalid'
    );
    advisoryText(row.explanation, 'fix check explanation');
    strings(row.evidence, 'fix check evidence');
  }
  const clean =
    !result.findings.length &&
    result.criteria.every((c) => c.result === 'SATISFIED') &&
    result.checklist.every((c) => c.result === 'RESOLVED') &&
    checks.every((c) => c.result === 'SATISFIED');
  advisoryAssert(
    (result.outcome === 'READY_FOR_FORMAL_REVIEW') === clean,
    'readiness contradicts supported findings or fix checks'
  );
  if (checks.some((c) => c.result === 'FINDING'))
    advisoryAssert(
      result.findings.length,
      'independent check failure needs a supported finding'
    );
  for (const row of result.criteria.filter((c) => c.result === 'FINDING')) {
    advisoryAssert(
      result.findings.some((f) => f.criterionIds.includes(row.id)),
      'failing criterion needs a supported finding'
    );
  }
  for (const row of result.checklist.filter(
    (c) => c.result === 'STILL_PRESENT'
  )) {
    const prior = priorFindings.find((f) => f.id === row.findingId);
    advisoryAssert(
      result.findings.some(
        (f) => underlyingFindingKey(f) === prior.underlyingKey
      ),
      'recurring finding needs its underlying invariant and paths'
    );
  }
  return result;
}
export function validateDefectClassReview(
  remediation,
  findings,
  previousDeclarations
) {
  if (!findings.length) {
    advisoryAssert(
      remediation === null || remediation === undefined,
      'remediation must refer to actual code failures'
    );
    return;
  }
  advisoryAssert(
    Array.isArray(remediation) && remediation.length <= 100,
    'revised readiness requires defect-class reviews'
  );
  const covered = [];
  for (const review of remediation) {
    strings(review.findingIds, 'remediated findings');
    covered.push(...review.findingIds);
    advisoryText(review.invariant, 'violated invariant');
    strings(review.examinedPaths, 'examined mutation/transition paths');
    review.examinedPaths.forEach((path) =>
      advisoryReference({ path, hash: 'sha256:' + '0'.repeat(64) })
    );
    advisoryText(review.approach, 'remediation approach');
    advisoryAssert(
      Array.isArray(review.regressions) && review.regressions.length > 0,
      'related defects need focused regression coverage'
    );
    for (const regression of review.regressions) {
      advisoryText(regression.scenario, 'regression scenario');
      advisoryText(regression.command, 'regression command');
      advisoryAssert(
        regression.outcome === 'PASS' &&
          Array.isArray(regression.evidence) &&
          regression.evidence.length,
        'regression checks must pass with bound evidence'
      );
      regression.evidence.forEach(advisoryReference);
    }
    const matching = findings.filter((f) => review.findingIds.includes(f.id));
    advisoryAssert(
      matching.length === review.findingIds.length,
      'remediation references unknown findings'
    );
    advisoryAssert(
      matching.every((finding) =>
        finding.affectedPaths.every((path) =>
          review.examinedPaths.some(
            (examined) => path === examined || path.startsWith(examined + '/')
          )
        )
      ),
      'defect-class review must examine every identified affected path'
    );
    const priorFixes = previousDeclarations.flatMap((declaration) =>
      (declaration.remediation ?? []).map((old) => ({
        declaration,
        review: old,
      }))
    );
    const repeated = matching.flatMap((finding) => {
      const latest = priorFixes
        .filter(
          ({ review: old }) =>
            old.underlyingKeys?.includes(finding.underlyingKey) ||
            (old.invariant.trim().toLowerCase() ===
              review.invariant.trim().toLowerCase() &&
              old.examinedPaths.some((path) =>
                review.examinedPaths.includes(path)
              ))
        )
        .at(-1);
      return latest &&
        !latest.declaration.priorFindings.some(
          (prior) => prior.id === finding.id
        )
        ? [latest.review]
        : [];
    });
    if (repeated.length) {
      advisoryText(
        review.failedFixExplanation,
        'recurrence failed-fix explanation'
      );
      advisoryAssert(
        repeated.every((old) => old.approach.trim() !== review.approach.trim()),
        'recurrence requires a changed remediation approach'
      );
    }
    review.underlyingKeys = [
      ...new Set(matching.map((f) => f.underlyingKey)),
    ].sort();
  }
  advisoryAssert(
    new Set(covered).size === covered.length &&
      fingerprint([...covered].sort()) ===
        fingerprint(findings.map((f) => f.id).sort()),
    'every distinct prior failure requires defect-class coverage'
  );
}
export function validateAdvisoryReadiness(record) {
  exactFields(record, [
    'schemaVersion',
    'kind',
    'featureId',
    'sliceId',
    'readinessId',
    'declaredAt',
    'scope',
    'baseSha',
    'sliceBaseSha',
    'criteria',
    'source',
    'inputIdentity',
    'requestIdentity',
    'inputManifest',
    'checks',
    'remediation',
    'priorFindings',
    'execution',
    'declaredBy',
  ]);
  advisoryAssert(
    record.schemaVersion === 1 &&
      record.kind === 'slice-advisory-readiness' &&
      ADVISORY_ID.test(record.readinessId) &&
      !Number.isNaN(Date.parse(record.declaredAt)),
    'readiness record identity is invalid'
  );
  advisoryText(record.featureId, 'feature identity');
  advisoryText(record.sliceId, 'slice identity');
  validateSource(record.source);
  strings(record.criteria, 'declared criteria');
  advisoryAssert(
    record.scope === record.source.boundaryScope &&
      record.baseSha === record.source.baseSha &&
      record.sliceBaseSha === record.source.sliceBaseSha &&
      record.inputIdentity === fingerprint(record.inputManifest) &&
      record.requestIdentity ===
        fingerprint({
          readinessId: record.readinessId,
          sliceId: record.sliceId,
          inputIdentity: record.inputIdentity,
          remediation: record.remediation,
        }) &&
      fingerprint(record.checks) === fingerprint(record.inputManifest.checks) &&
      fingerprint(record.priorFindings) ===
        record.inputManifest.priorFindingsIdentity &&
      fingerprint(record.criteria) ===
        fingerprint(record.inputManifest.criteria),
    'readiness inputs or request binding changed'
  );
  return record;
}
export function validateAdvisoryRecord(record, readiness = null) {
  exactFields(
    record,
    [
      'schemaVersion',
      'kind',
      'featureId',
      'sliceId',
      'readinessId',
      'source',
      'inputIdentity',
      'requestIdentity',
      'readiness',
      'fullVerification',
      'outcome',
      'result',
      'receipts',
      'operationalErrors',
    ],
    ['reusedFrom', 'reviewedSource']
  );
  advisoryAssert(
    record?.schemaVersion === 1 &&
      record.kind === 'slice-advisory-review' &&
      ADVISORY_ID.test(record.readinessId) &&
      typeof record.sliceId === 'string' &&
      ADVISORY_OUTCOMES.includes(record.outcome) &&
      record.fullVerification === 'PENDING' &&
      SHA256_FINGERPRINT.test(record.inputIdentity) &&
      SHA256_FINGERPRINT.test(record.requestIdentity),
    'retained review record is invalid'
  );
  validateSource(record.source);
  advisoryReference(record.readiness);
  advisoryAssert(
    Array.isArray(record.operationalErrors) &&
      record.operationalErrors.length <= 2,
    'operational errors are unbounded'
  );
  advisoryAssert(
    Array.isArray(record.receipts) && record.receipts.length <= 1,
    'compact record must not contain transcripts'
  );
  for (const error of record.operationalErrors) {
    exactFields(error, ['code', 'category', 'message']);
    advisoryText(error.code, 'operational error code', 128);
    advisoryText(error.message, 'operational diagnostic');
    advisoryAssert(
      ['TRANSIENT', 'PERSISTENT'].includes(error.category),
      'operational error classification is invalid'
    );
  }
  if (readiness) {
    validateAdvisoryReadiness(readiness);
    advisoryAssert(
      [
        'featureId',
        'sliceId',
        'readinessId',
        'inputIdentity',
        'requestIdentity',
      ].every((key) => record[key] === readiness[key]) &&
        fingerprint(record.source) === fingerprint(readiness.source),
      'review differs from its readiness declaration'
    );
    if (['READY_FOR_FORMAL_REVIEW', 'FINDINGS'].includes(record.outcome)) {
      validateAdvisoryResult(
        record.result,
        readiness.criteria,
        readiness.priorFindings
      );
      advisoryAssert(
        record.result.outcome === record.outcome &&
          record.receipts.length === 1,
        'review outcome lacks completed provider evidence'
      );
      const receipt = validateAgentWorkflowReceipt(record.receipts[0]);
      advisoryAssert(
        receipt.status === 'completed' &&
          receipt.stage === 'advisory' &&
          receipt.digests.output === sha256Digest(record.result) &&
          fingerprint(receipt.module) ===
            fingerprint(readiness.inputManifest.advisoryModule),
        'review provider receipt differs from the pinned result/module'
      );
      if (!record.reusedFrom)
        advisoryAssert(
          receipt.attemptId === 'advisory-' + record.readinessId,
          'review receipt belongs to another declaration'
        );
    } else {
      advisoryAssert(
        record.result === null && record.receipts.length === 0,
        'operational/inapplicable disposition cannot masquerade as a code review'
      );
    }
  }
  if (record.reusedFrom) {
    advisoryReference(record.reusedFrom);
    validateSource(record.reviewedSource);
    advisoryAssert(
      record.outcome === 'READY_FOR_FORMAL_REVIEW',
      'only clean code review may be reused'
    );
  } else
    advisoryAssert(
      record.reviewedSource === undefined,
      'original reviewed source requires a retained reuse reference'
    );
  return record;
}
export function validateAdvisoryBoundaryProof(
  proof,
  { featureId = null, sliceId, context, scope = null, criteria = null }
) {
  advisoryAssert(
    proof?.schemaVersion === 1 &&
      proof.sliceId === sliceId &&
      ADVISORY_ID.test(proof.readinessId) &&
      proof.checkedSourceSha ===
        (context.evaluatedSourceSha ?? context.headSha) &&
      SHA256_FINGERPRINT.test(proof.inputIdentity),
    'formal boundary lacks current advisory disposition'
  );
  if (featureId)
    advisoryAssert(
      proof.featureId === featureId,
      'advisory proof belongs to another feature'
    );
  if (scope)
    advisoryAssert(
      proof.boundaryScope === scope,
      'advisory proof has a different boundary scope'
    );
  if (criteria)
    advisoryAssert(
      fingerprint(proof.criteria) === fingerprint(criteria),
      'advisory proof has different criteria'
    );
  if (context.mergeBaseSha)
    advisoryAssert(
      proof.checkedSliceBaseSha === context.mergeBaseSha,
      'advisory proof has a different slice base'
    );
  if (scope === 'FEATURE_FINAL')
    advisoryAssert(
      proof.checkedFeatureBaseSha === context.featureBaseSha,
      'advisory proof has a different original feature base'
    );
  advisoryReference(proof.readiness);
  advisoryReference(proof.review);
  if (!['READY_FOR_FORMAL_REVIEW', 'NOT_APPLICABLE'].includes(proof.outcome)) {
    advisoryAssert(
      ['FINDINGS', 'UNAVAILABLE', 'IN_PROGRESS'].includes(proof.outcome),
      'invalid advisory boundary outcome'
    );
    advisoryReference(proof.proceed);
    advisoryText(proof.reason, 'reason for proceeding without clean advisory');
  }
}
