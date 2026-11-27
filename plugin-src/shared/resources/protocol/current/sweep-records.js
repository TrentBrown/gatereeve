import { identity, requireThat } from './contracts.js';
import { scopeEpoch } from './round-policy.js';

// Class-level fix records (issue #144, source design D12). An implementer's
// claim says whether it fixed a finding (`fixed`) or rebuts it (`disputed`).
// A `fixed` claim carries a sweep record: the defect class, every site found
// with the search that found them, where the fix lives, the class-level test
// and how dependents were checked. GateReeve checks presence and shape only;
// the reviewers of later rounds verify truth. A later finding of a swept class
// is a regression of the previous fix (round-policy.js, boundary-review.js).
//
// Records are versioned by `format`; a later version (for example follow-up
// records, #148) may add optional fields without changing these.
export const SWEEP_FORMAT = 'sweep-record/1';
export const CLAIM_DISPOSITIONS = Object.freeze(['fixed', 'disputed']);
export const MAX_CLAIMS = 128;
export const MAX_SITES = 256;
const CLAIM_KEYS = Object.freeze(['findingId', 'claim', 'disposition', 'sweep']);
const SWEEP_KEYS = Object.freeze(['class', 'search', 'sites', 'fix', 'test', 'dependents']);
const SWEEP_TEXT = Object.freeze(['class', 'search', 'fix', 'test', 'dependents']);
const TEXT_LIMIT = 4096, PATH_LIMIT = 1024;

export const SWEEP_GUIDE = 'packet.sweepRecords.records lists the sweep records of this review scope: each fixed claim says which finding it fixed (findingId), the defect class (classId from that finding, class as the implementer states it), the search used, every site found (path and line), where the fix lives (fix), the class-level test (test) and how dependents were checked (dependents), with the round that received it. Records are implementer claims, not proof. Verify each one against the candidate: run or reason through the search, check every listed site and look for sites it missed, and check that the fix, the test and the dependents are as stated. Report a missed site of a swept class as a finding with that record\'s classId. Such a finding, including an earlier finding of the class that is still present, is a regression of the previous fix: in rounds 4-5 a medium or high one blocks.';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const boundedText = (value, path, limit) => requireThat(typeof value === 'string' && value.trim().length > 0 && value.length <= limit,
  `${path} must be nonempty text of at most ${limit} characters`);
const onlyKeys = (value, keys, path, what) => {
  const unknown = Object.keys(value).find(key => !keys.includes(key));
  requireThat(unknown === undefined, `${path}.${unknown} is not allowed; ${what} has exactly ${keys.join(', ')}`);
};

function checkSweep(sweep, path) {
  requireThat(isObject(sweep), `${path} must be an object`);
  onlyKeys(sweep, SWEEP_KEYS, path, 'a sweep record');
  for (const key of SWEEP_KEYS) requireThat(sweep[key] !== undefined, `${path}.${key} is required`);
  for (const key of SWEEP_TEXT) boundedText(sweep[key], `${path}.${key}`, TEXT_LIMIT);
  requireThat(Array.isArray(sweep.sites) && sweep.sites.length >= 1 && sweep.sites.length <= MAX_SITES,
    `${path}.sites must list 1 to ${MAX_SITES} sites`);
  sweep.sites.forEach((site, index) => {
    const at = `${path}.sites[${index}]`;
    requireThat(isObject(site), `${at} must be an object`);
    onlyKeys(site, ['path', 'line'], at, 'a site');
    boundedText(site.path, `${at}.path`, PATH_LIMIT);
    requireThat(Number.isInteger(site.line) && site.line > 0, `${at}.line must be a positive integer`);
  });
}

// Input contract for `claims` (AC1, AC2). Refusals name the field path and
// happen before any reviewer starts.
export function checkClaims(claims) {
  requireThat(Array.isArray(claims) && claims.length <= MAX_CLAIMS, `Claims must be a list of at most ${MAX_CLAIMS} dispositions`);
  claims.forEach((claim, index) => {
    const at = `claims[${index}]`;
    requireThat(isObject(claim), `${at} must be an object`);
    onlyKeys(claim, CLAIM_KEYS, at, 'a claim');
    boundedText(claim.findingId, `${at}.findingId`, TEXT_LIMIT);
    boundedText(claim.claim, `${at}.claim`, TEXT_LIMIT);
    requireThat(CLAIM_DISPOSITIONS.includes(claim.disposition), `${at}.disposition must be ${CLAIM_DISPOSITIONS.join(' or ')}`);
    if (claim.disposition === 'fixed') {
      requireThat(claim.sweep !== undefined, `${at}.sweep is required for a fixed claim`);
      checkSweep(claim.sweep, `${at}.sweep`);
    } else requireThat(claim.sweep === undefined, `${at}.sweep is not allowed on a disputed claim`);
  });
  return claims;
}

// Duplicates are records with equal content (both peers of a round receive
// the same claim); a later re-claim of the same finding is a second record.
export function uniqueRecords(records) {
  return [...new Map(records.map(record => [identity(record), record])).values()];
}

// Records for this execution's retained `fixed` claims. The swept class is
// the claimed finding's classId, from the first retained report of it.
export function claimRecords(claims, history, round) {
  return claims.filter(claim => claim.disposition === 'fixed').map(claim => {
    const finding = history.flatMap(entry => entry.reviewerResult.findings ?? []).find(row => row.id === claim.findingId);
    return { findingId: claim.findingId, classId: typeof finding?.classId === 'string' ? finding.classId : null, round, ...claim.sweep };
  });
}

// Records in the inputs of earlier boundary reviews of revisions that belong to
// the open review scope. A closed scope (integration, split, amendment) has no
// entry, and a later scope of the same name has a later epoch, so a closed
// scope's records are not carried.
export async function scopeSweepRecords(core, state, scope) {
  const revisions = new Set((state.reviewScopes?.[scope]?.revisions ?? []).map(row => row.revision)), epoch = scopeEpoch(state, scope);
  if (!revisions.size) return [];
  const records = [], inputs = new Set();
  for (const ref of state.results) {
    let input;
    try {
      const report = await core.store.json(ref);
      if (report.gate !== 'review' || !report.input || inputs.has(report.input.hash)) continue;
      inputs.add(report.input.hash);
      input = await core.store.json(report.input);
    } catch { continue; } // An unreadable review contributes no record.
    if (input.roundPolicy?.scope !== scope || input.roundPolicy.epoch !== epoch || !revisions.has(input.roundPolicy.revision)) continue;
    records.push(...(input.sweepRecords?.records ?? []));
  }
  return uniqueRecords(records);
}

// The packet field: this execution's records plus the open scope's earlier
// ones. Absent without records.
export async function packetSweepRecords(core, state, roundPolicy, claims, history) {
  const own = claimRecords(claims, history, roundPolicy?.round ?? null);
  const records = uniqueRecords([...(roundPolicy ? await scopeSweepRecords(core, state, roundPolicy.scope) : []), ...own]);
  return records.length ? { format: SWEEP_FORMAT, guide: SWEEP_GUIDE, records } : null;
}

// A finding of a swept class other than the claimed finding is a missed site,
// so a regression of the previous fix (AC4). Records without a round take no
// part in qualification.
export function sweptClassRegression(records, finding, round) {
  return typeof finding?.classId === 'string' && records.some(record => record.round !== null && record.round <= round
    && record.classId === finding.classId && record.findingId !== finding.id);
}
