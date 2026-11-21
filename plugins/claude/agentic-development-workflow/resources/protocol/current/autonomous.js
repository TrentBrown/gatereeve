import { identity, requireThat, text, mandateRebuttal } from './contracts.js';
import { boundaryReviews } from './boundary-review.js';
import { checkCandidate } from './evidence.js';
import { guardDelegatedAction, isAutonomous } from './delegation.js';

export function eligibleResidualRisk(pair, mandate = null, rebuttal = null) {
  requireThat(pair.members.length === 2, 'Residual-risk acceptance requires both independent perspectives');
  requireThat(pair.initialEstablished !== false, 'Initial reviewer independence must be established before adjudication');
  if (rebuttal) { requireThat(mandate, 'A rebuttal needs the fixed mandate'); mandateRebuttal(rebuttal, mandate); }
  for (const member of pair.members) {
    const { result } = member;
    requireThat(['PASS', 'FAIL'].includes(result.outcome) && !result.unvalidatedVerdict,
      'Unavailable or invalid review cannot be adjudicated');
    requireThat(result.coverage?.complete === true && result.coverage.limitations.length === 0,
      'Uncovered required scope cannot be adjudicated');
    requireThat(result.dimensions?.length === 5 && result.dimensions.every(row => ['PASS', 'FAIL'].includes(row.outcome))
      && result.criteria?.length > 0 && result.criteria.every(row => ['PASS', 'FAIL'].includes(row.outcome)),
    'Adjudication needs complete responsibility and criterion conclusions, not unavailable assessments');
    requireThat(!(member.unreconciledFindings ?? []).length, 'Unreconciled historical findings need independent clarification before adjudication');
    requireThat(!member.incompleteDelta, 'Incomplete changed-path or interaction coverage cannot be adjudicated');
    requireThat(result.mandateAssessment?.outcome === 'PASS' || result.mandateAssessment?.outcome === 'FAIL' && rebuttal,
      'Mandate violations or unknown compliance cannot be accepted as residual risk; an unsupported claim needs counterevidence');
    for (const dimension of ['evidence', 'scope']) {
      const outcome = result.dimensions?.find(row => row.name === dimension)?.outcome;
      requireThat(outcome === 'PASS' || outcome === 'FAIL' && rebuttal,
        'Missing verification or unknown scope cannot be adjudicated; unsupported objections need counterevidence');
    }
    requireThat(!(result.coverageDecisions ?? []).some(row => row.outcome !== 'PASS'), 'Rejected verification coverage cannot be adjudicated');
    requireThat(result.outcome !== 'FAIL' || (member.materialFindings ?? result.findings).some(finding => finding.blocking),
      'An unexplained failed assessment needs reviewer clarification, not residual-risk acceptance');
  }
  const findings = new Map();
  for (const member of pair.members) for (const finding of member.materialFindings ?? member.result.findings.filter(finding => finding.blocking)) {
    const rebuttalRequired = member.result.mandateAssessment.outcome !== 'PASS'
      || member.result.dimensions.some(row => ['evidence', 'scope'].includes(row.name) && row.outcome !== 'PASS');
    const existing = findings.get(finding.id);
    if (existing) { existing.reviews.push(member.ref); existing.rebuttalRequired ||= rebuttalRequired; }
    else findings.set(finding.id, { finding, reviews: [member.ref], reviewer: member.reviewer, rebuttalRequired });
  }
  return [...findings.values()];
}

function dispositionsFor(pair, input, mandate) {
  const findings = eligibleResidualRisk(pair, mandate, input.mandateRebuttal);
  requireThat(Array.isArray(input.dispositions) && input.dispositions.length === findings.length
    && new Set(input.dispositions.map(row => row.findingId)).size === findings.length,
  'Adjudication needs a distinct disposition for every material finding');
  return input.dispositions.map(row => {
    requireThat(row && Object.keys(row).every(key => ['findingId', 'outcome', 'reason', 'evidence', 'residualRisk'].includes(key)), 'Unsupported adjudication disposition');
    requireThat(findings.some(item => item.finding.id === row.findingId), 'Adjudication names an unknown finding');
    requireThat(['accepted-risk', 'unsupported'].includes(row.outcome), 'An adjudication accepts risk or records an evidence-backed rebuttal; it does not invent a fix');
    requireThat(!findings.find(item => item.finding.id === row.findingId).rebuttalRequired || row.outcome === 'unsupported',
      'A claimed mandate, scope or verification violation can be rebutted with evidence, not accepted as a known violation');
    text(row.reason, 'Disposition reason'); text(row.evidence, 'Disposition evidence'); text(row.residualRisk, 'Remaining risk');
    return structuredClone(row);
  });
}

export async function adjudicateReview(core, input, operation) {
  requireThat(input && Object.keys(input).every(key => ['candidate', 'pair', 'reason', 'dispositions', 'stopReason', 'evidence', 'mandateRebuttal'].includes(key)), 'Unsupported autonomous adjudication field');
  const { state } = await core.state();
  requireThat(isAutonomous(state), 'Only autonomous mode may adjudicate residual risk without human clearance');
  requireThat(!state.paused && ['IMPLEMENTING', 'ACCEPTING'].includes(state.phase) && state.candidate?.hash === input.candidate, 'Adjudication must bind the current active candidate');
  const candidate = await checkCandidate(core.store, core.context, state.candidate);
  const pair = await boundaryReviews(core, state, candidate);
  requireThat(input.pair === pair.identity, 'Adjudication must bind both current reviewer results');
  text(input.reason, 'Adjudication rationale');
  if (input.stopReason !== undefined) text(input.stopReason, 'Diminishing-returns stopping rationale');
  requireThat(Array.isArray(input.evidence) && input.evidence.length > 0, 'Adjudication needs retained supporting evidence');
  for (const reference of input.evidence) { await core.store.get(reference); await core.store.closure(reference); }
  const dispositions = dispositionsFor(pair, input, state.dials.autonomy.mandate);
  const check = await core.check('acceptance');
  requireThat(check.outcomes.filter(row => row.required && row.id !== 'review').every(row => row.outcome === 'PASS'),
    'Autonomous risk acceptance cannot excuse failed or missing mandatory checks');
  requireThat((await core.check('implementation')).allowed && state.ready, 'Current implementation authority and candidate readiness are required');
  await guardDelegatedAction(core, state, 'autonomous adjudication');
  const current = (await core.state()).state;
  requireThat(current.eventCount === state.eventCount, 'Candidate or authority changed during adjudication');
  return core.append(current, 'REVIEW_ADJUDICATED', { candidate: state.candidate, pair: pair.identity,
    reviews: pair.members.map(member => member.ref), selection: pair.selection.event, grant: state.dials.autonomy.event,
    mandate: identity(state.dials.autonomy.mandate), reason: input.reason, dispositions, evidence: input.evidence,
    ...(input.mandateRebuttal ? { mandateRebuttal: mandateRebuttal(input.mandateRebuttal, state.dials.autonomy.mandate) } : {}),
    ...(input.stopReason ? { stopReason: input.stopReason } : {}), originalOutcomes: pair.members.map(member => ({ review: member.ref, outcome: member.result.outcome })) }, operation);
}

export async function currentAdjudication(core, state, pair) {
  if (!isAutonomous(state)) return null;
  const record = [...state.adjudications].reverse().find(item => item.candidate.hash === state.candidate?.hash
    && item.pair === pair.identity && item.selection === state.reviewerSelection?.event
    && item.grant === state.dials.autonomy.event && item.mandate === identity(state.dials.autonomy.mandate));
  if (!record) return null;
  dispositionsFor(pair, record, state.dials.autonomy.mandate);
  for (const reference of record.evidence) { await core.store.get(reference); await core.store.closure(reference); }
  return record;
}

export const allowedRunOutcome = (state, outcome) => outcome.outcome === 'PASS'
  || isAutonomous(state) && outcome.id === 'review' && outcome.outcome === 'FAIL' && Boolean(outcome.adjudication);
