import { identity, requireThat, text } from './contracts.js';

export const checkIdentity = ({ repository, command, args }) => identity({ repository, command, args });

export async function coverageClaims(core, state, candidate, claims = []) {
  requireThat(Array.isArray(claims) && new Set(claims.map(item => item.id)).size === claims.length, 'Coverage claims need distinct identities');
  for (const claim of claims) {
    requireThat(claim && Object.keys(claim).every(key => ['id', 'supersedes', 'replacements', 'criteria', 'reason'].includes(key)), 'Unknown coverage claim field');
    text(claim.id, 'Coverage claim identity'); text(claim.reason, 'Coverage claim rationale');
    requireThat(Array.isArray(claim.criteria) && claim.criteria.length && claim.criteria.every(id => candidate.criteria.includes(id)), 'Coverage claim needs selected criteria');
    for (const key of ['supersedes', 'replacements']) {
      requireThat(Array.isArray(claim[key]) && claim[key].length, `Coverage claim needs ${key} evidence`);
      for (const ref of claim[key]) {
        const { result } = await core.recordedResult(ref, state);
        requireThat(result.gate === 'verification' && result.runner, 'Coverage claims require actual verification receipts');
        const before = await core.store.json((await core.store.json(result.input)).candidate);
        requireThat(before.criteria.every(id => claim.criteria.includes(id))
          && before.repositories.every(repo => candidate.repositories.some(selected => identity(selected.identity) === identity(repo.identity))), 'Coverage evidence is outside the declared claim scope');
        if (key === 'replacements') requireThat((await core.currentResult(ref, candidate, state, new Set(), new Map(), false)).outcome === 'PASS', 'Replacement checks must be passing and applicable');
      }
    }
  }
  return claims;
}

export function validateCoverageDecisions(verdict, claims) {
  const decisions = verdict.coverageDecisions ?? [];
  requireThat(Array.isArray(decisions) && new Set(decisions.map(item => item.id)).size === decisions.length, 'Coverage decisions must have distinct identities');
  requireThat(decisions.every(item => claims.some(claim => claim.id === item.id)), 'Unknown coverage decision');
  if (['spec', 'judge'].includes(verdict.gate)) {
    requireThat(claims.every(claim => decisions.some(item => item.id === claim.id)), 'Assess every proposed coverage replacement');
    for (const decision of decisions) {
      text(decision.evidence, 'Coverage decision evidence');
      requireThat(['PASS', 'FAIL'].includes(decision.outcome), 'Invalid coverage decision outcome');
      requireThat(verdict.outcome !== 'PASS' || decision.outcome === 'PASS', 'Passing verdict contradicts rejected replacement coverage');
    }
  } else requireThat(!decisions.length, 'Only spec and Judge assess coverage replacements');
}
