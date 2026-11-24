import { requireThat } from './contracts.js';

// Round policy (spec AC6, interview D7, D14, D23). One review scope is a slice
// PR candidate scope, the feature-final review or one planning document. One
// round is one paired (or planning) review of one candidate revision, counted
// even when a reviewer was UNAVAILABLE. Only a human-approved amendment resets
// the counter; observing the slice's integration closes its scope.
//
// Rounds recorded before this policy carry no `roundPolicy` marker and are not
// counted, so a resumed earlier-contract run starts at round 1 (spec AC11).
export const ROUND_POLICY = 'round-policy/1';
export const NARROW_FROM = 4;
export const HANDBACK_AT = 6;
export const ROUND_CHOICES = Object.freeze(['continue', 'split']);

export const boundaryScope = candidate => candidate.scope === 'FEATURE' ? 'feature-final' : 'slice';
export const planningScope = artifact => `planning:${artifact}`;
// Findings from earlier contracts have no severity and block exactly as before.
export const severityOf = finding => finding?.severity ?? 'unrated';

// Projection hooks, called from core.js project() in event order.
export function countRound(state, scope, revision, details) {
  const entry = state.reviewScopes[scope] ??= { scope, round: 0, revisions: [], decisions: [] };
  if (!entry.revisions.some(row => row.revision === revision)) entry.revisions.push({ round: ++entry.round, revision, ...details });
}
export function resetRounds(state, event) {
  for (const entry of Object.values(state.reviewScopes)) state.reviewScopeHistory.push({ ...entry, closed: { reason: 'amendment', event } });
  state.reviewScopes = {};
}
export function closeScope(state, scope, reason, event) {
  const entry = state.reviewScopes[scope];
  if (!entry) return;
  state.reviewScopeHistory.push({ ...entry, closed: { reason, event } });
  delete state.reviewScopes[scope];
}
export function recordRoundDecision(state, value, event) {
  const entry = state.reviewScopes[value.reviewScope];
  if (entry) entry.decisions.push({ choice: value.choice, round: entry.round, event });
}

// Round of one revision in its scope, or null when the revision was reviewed
// before this policy (legacy: original blocking applies, no hand-back).
export function roundOf(state, scope, revision) {
  return state.reviewScopes?.[scope]?.revisions.find(row => row.revision === revision)?.round ?? null;
}
export function previousRevision(state, scope, round) {
  return state.reviewScopes?.[scope]?.revisions.find(row => row.round === round - 1) ?? null;
}
export function roundDecision(state, scope) {
  return state.reviewScopes?.[scope]?.decisions.findLast(row => row.round >= HANDBACK_AT) ?? null;
}
export function band(round) {
  if (round === null || round === undefined) return 'legacy';
  return round < NARROW_FROM ? 'all-non-low' : round < HANDBACK_AT ? 'high-and-medium-regressions' : 'hand-back';
}

// Whether a finding blocks under the schedule. The reviewer's `blocking` flag
// stays the in-scope, failure-scenario judgment; low never blocks (B1 also
// forces it false). Rounds 4-5, and later rounds after a human continue or
// split, keep only high findings and medium regressions of the previous fix.
export function scheduledBlocking(finding, { round = null, regression = false } = {}) {
  if (!finding?.blocking) return false;
  const severity = severityOf(finding);
  if (severity === 'low') return false;
  if (round === null || round < NARROW_FROM || severity === 'unrated') return true;
  return severity === 'high' || (severity === 'medium' && regression);
}

// The hand-back at round 6 and later: not qualifying until the human records
// continue, amend (which resets the counter), waive or split. A goal run parks.
export function roundHandBack(state, scope, round, goal) {
  if (round === null || round < HANDBACK_AT || roundDecision(state, scope)) return null;
  return goal
    ? `Review scope ${scope} reached round ${round}: a goal run records goal.park with the PR and round evidence; adjudication past round ${HANDBACK_AT - 1} is refused`
    : `Review scope ${scope} reached round ${round}: the review is not qualifying until the human records continue or split (human.decide kind review-rounds), an amendment, or a waiver`;
}
export function refuseLateAdjudication(round) {
  requireThat(round === null || round === undefined || round < HANDBACK_AT,
    `Adjudication at round ${round} is refused: from round ${HANDBACK_AT} the review hands back to the human (goal runs record goal.park)`);
}

// Status projection: every open scope with its round, band and next step.
export function roundStatus(state, { light = false, goal = false } = {}) {
  const scopes = Object.values(state.reviewScopes ?? {}).map(entry => ({ scope: entry.scope, round: entry.round, band: band(entry.round),
    decision: roundDecision(state, entry.scope), handBack: roundHandBack(state, entry.scope, entry.round, goal) }));
  const advice = [];
  if (light) for (const entry of scopes) if (entry.round >= NARROW_FROM) advice.push(`Light run review scope ${entry.scope} is at round ${entry.round}: consider raising rigor (run.set-dial rigor full); this is advice only`);
  for (const entry of scopes) if (entry.handBack) advice.push(entry.handBack);
  return { policy: ROUND_POLICY, scopes, advice };
}
