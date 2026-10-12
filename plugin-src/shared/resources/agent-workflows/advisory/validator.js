// The protocol host validates the complete scope, checklist, evidence and
// readiness contract before publication. This mapping does not record a gate.
export function evaluateAdvisoryReview({ outputs }) {
  const result = outputs.advisory;
  return {
    outcome: result.outcome === 'READY_FOR_FORMAL_REVIEW' ? 'PASS' : 'FAIL',
    result,
  };
}
