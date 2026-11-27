import { NOT_RECORDED, escapedDefectStatement, LINK_BASES, reportingObservations } from './fleet.js';

// The four convergence success measures (source design D6) and the
// per-reviewer table, computed from reporting observations alone (issue #149).
// Rows projected before the convergence fields are counted as not recorded:
// they are never read as zero, PASS or non-demoted, and a measure whose cohort
// contains them reports `coverage: incomplete` with `met: null`.
export const CONVERGENCE_FORMAT = 'gatereeve-convergence/1';
export const BOUNDARY_SCOPES = Object.freeze(['slice', 'feature-final']);
export const ROUNDS_TARGET = 3;
export const UNAVAILABLE_TARGET = 0.1;
export const FINDING_LINK = /^finding:(sha256:[0-9a-f]{64}):(.+)$/u;
export const CONVERGENCE_CAVEAT = 'Recorded observations only. Rows projected before the convergence fields are not recorded, never zero; runs are not randomized; escaped-defect capture depends on human attribution. A met value is a reading of the recorded cohort, not proof that convergence improved.';

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const tally = (rows, value) => {
  const counts = {};
  for (const row of rows) { const key = value(row) ?? NOT_RECORDED; counts[key] = (counts[key] ?? 0) + 1; }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => compare(a, b)));
};
const time = row => Date.parse(row.observedAt);
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
const coverage = notRecorded => notRecorded ? 'incomplete' : 'complete';
const waives = row => row.kind === 'decision' && Array.isArray(row.gates) && row.gates.includes('review');

// Measure 1 (AC6): rounds to PASS per workflow and boundary scope.
export function roundsMeasure(rows) {
  const pairs = rows.filter(row => row.check === 'BOUNDARY_REVIEWED');
  const counted = rows.filter(row => row.check === 'ROUND_COUNTED');
  const adjudicated = rows.filter(row => row.check === 'REVIEW_ADJUDICATED');
  // A pair with its scope but no round launched no reviewer on a counted
  // revision, so it is not a round (round-policy.js); rows without the scope
  // were projected before these fields.
  const notRecorded = [...pairs, ...counted].filter(row => row.reviewScope == null).length + adjudicated.filter(row => row.reviewScope == null || row.round == null).length;
  const uncountedPairs = pairs.filter(row => row.reviewScope != null && row.round == null).length;
  const boundary = row => BOUNDARY_SCOPES.includes(row.reviewScope) && Number.isSafeInteger(row.round);
  const scopes = new Map();
  const entry = row => {
    const key = `${row.workflow ?? ''}\u0000${row.reviewScope}`;
    if (!scopes.has(key)) scopes.set(key, { workflow: row.workflow ?? null, issue: row.issue ?? null, scope: row.reviewScope, round: 0, pairs: [], passedRound: null });
    return scopes.get(key);
  };
  for (const row of counted.filter(boundary)) { const scope = entry(row); scope.round = Math.max(scope.round, row.round); }
  for (const row of pairs.filter(boundary)) { const scope = entry(row); scope.round = Math.max(scope.round, row.round); scope.pairs.push(row); }
  for (const row of [...pairs.filter(boundary).filter(row => row.outcome === 'PASS'), ...adjudicated.filter(boundary)]) {
    const scope = entry(row); scope.passedRound = scope.passedRound == null ? row.round : Math.min(scope.passedRound, row.round);
  }
  const waivers = rows.filter(waives);
  const latestPairBefore = (workflow, at, scope = null) => pairs.filter(boundary)
    .filter(row => row.workflow === workflow && time(row) <= at && (scope === null || row.reviewScope === scope))
    .sort((a, b) => time(a) - time(b) || a.round - b.round).at(-1) ?? null;
  // A waive after a FAIL streak: the workflow's latest pair before the waiver
  // FAILed, in a scope that never passed (attributed to that pair's scope).
  const afterFail = [];
  for (const waiver of waivers) {
    const latest = latestPairBefore(waiver.workflow, time(waiver));
    if (latest?.outcome === 'FAIL' && entry(latest).passedRound == null) afterFail.push({ workflow: waiver.workflow ?? null, scope: latest.reviewScope, round: latest.round, at: waiver.observedAt });
  }
  const list = [...scopes.values()].map(scope => {
    const latest = scope.pairs.length ? scope.pairs.reduce((a, b) => time(a) >= time(b) ? a : b) : null;
    const waived = scope.passedRound == null && waivers.some(waiver => waiver.workflow === scope.workflow && (!latest || time(waiver) >= time(latest)));
    const status = scope.passedRound != null ? 'passed' : waived ? 'waived' : 'open';
    return { workflow: scope.workflow, issue: scope.issue, scope: scope.scope, status, roundsToPass: scope.passedRound, currentRound: scope.round, pairs: scope.pairs.length,
      waivedAfterFailStreak: afterFail.some(row => row.workflow === scope.workflow && row.scope === scope.scope) };
  }).sort((a, b) => compare(`${a.workflow}${a.scope}`, `${b.workflow}${b.scope}`));
  const passed = list.filter(row => row.status === 'passed'), open = list.filter(row => row.status === 'open'), waived = list.filter(row => row.status === 'waived');
  // Open scopes count their current round as a lower bound; they can only raise the median.
  const value = median([...passed.map(row => row.roundsToPass), ...open.map(row => row.currentRound)]);
  let met;
  if (notRecorded) met = null;
  else if ((value != null && value > ROUNDS_TARGET) || afterFail.length) met = false;
  else if (open.length || !passed.length) met = null;
  else met = true;
  return { target: `median rounds to PASS <= ${ROUNDS_TARGET} and no waive after a FAIL streak`, denominator: { scopes: list.length, passed: passed.length, open: open.length, waived: waived.length },
    medianRoundsToPass: value, medianIncludesOpenScopes: open.length > 0, waivesAfterFailStreak: afterFail, scopes: list, uncountedPairs, notRecorded, coverage: coverage(notRecorded),
    ...(open.length && !notRecorded && met === null ? { progress: 'in-progress' } : {}), met };
}

const reviewFindings = rows => rows.filter(row => row.kind === 'finding' && row.check === 'review');
// Measure 2 (AC7): demoted findings, recorded and decided.
export function demotedMeasure(rows) {
  const findings = reviewFindings(rows);
  const notRecorded = findings.filter(row => row.severity == null || row.demoted == null).length;
  const demoted = findings.filter(row => row.demoted === true);
  const complete = demoted.filter(row => row.severity !== 'unrated' && row.hasFailureScenario === true);
  const recorded = { denominator: demoted.length, bySeverity: tally(demoted, row => row.severity), withSeverityAndScenario: complete.length,
    met: demoted.length ? complete.length === demoted.length : null };
  const tracked = demoted.filter(row => row.followUp != null);
  const decided = tracked.length
    ? { denominator: demoted.length, byFollowUp: tally(demoted, row => row.followUp), met: demoted.every(row => row.followUp != null && row.followUp !== 'undecided') }
    : { denominator: demoted.length, byFollowUp: {}, met: null, statement: 'Follow-up decisions are not recorded by this version; this part is unmeasured, not passed.' };
  let met;
  if (notRecorded || recorded.met === null || decided.met === null) met = null;
  else met = recorded.met && decided.met;
  return { target: 'every demoted finding is recorded with its severity and failure scenario, and decided at Completion',
    denominator: { findings: findings.length, demoted: demoted.length }, recorded, decided, notRecorded, coverage: coverage(notRecorded), met };
}

// Measure 3 (AC8): confirmed escaped defects traced to a demoted finding.
export function escapedMeasure(rows) {
  const defects = rows.filter(row => row.kind === 'escaped-defect');
  const confirmed = defects.filter(row => LINK_BASES.includes(row.linkBasis) && Array.isArray(row.links) && row.links.length);
  const findings = new Map(reviewFindings(rows).map(row => [`${row.reference}\u0000${row.findingId}`, row]));
  const traced = [];
  let notRecorded = 0, unmatched = 0;
  for (const defect of confirmed) {
    const linked = defect.links.map(link => FINDING_LINK.exec(link)).filter(Boolean).map(([, hash, id]) => findings.get(`${hash}\u0000${id}`));
    if (linked.some(row => row === undefined)) unmatched++;
    if (linked.some(row => row && row.demoted == null)) notRecorded++;
    const demoted = linked.filter(row => row?.demoted === true);
    if (demoted.length) traced.push({ fixId: defect.fixId ?? null, findings: demoted.length, withFollowUp: demoted.filter(row => row.followUp != null).length });
  }
  return { target: 'escaped defects traced to demoted findings are counted (no threshold)', denominator: { escapedDefects: defects.length, confirmed: confirmed.length },
    traced: traced.length, tracedWithFollowUp: traced.filter(row => row.withFollowUp > 0).length, defects: traced, unmatchedFindingLinks: unmatched,
    statement: escapedDefectStatement(defects.length, confirmed.length), threshold: 'D6 sets no threshold for this measure: it is counted, not passed, so met is always null.',
    notRecorded, coverage: coverage(notRecorded), met: null };
}

// Measure 4 (AC9): each provider's final per-round outcome in paired rounds.
export function secondOpinionMeasure(rows) {
  // Only reviewers of counted rounds: an uncounted pair launched no reviewer.
  const all = rows.filter(row => row.check === 'boundary-reviewer'), reviewers = all.filter(row => Number.isSafeInteger(row.round));
  const notRecorded = rows.filter(row => row.check === 'BOUNDARY_REVIEWED' && row.reviewScope == null).length;
  const findings = reviewFindings(rows);
  const byResult = new Map();
  for (const row of findings) byResult.set(row.reference, [...(byResult.get(row.reference) ?? []), row]);
  const pairOf = row => row.id.replace(/:reviewer:\d+$/u, '');
  const providers = new Map();
  for (const row of reviewers) {
    const provider = row.provider ?? NOT_RECORDED;
    if (!providers.has(provider)) providers.set(provider, { provider, rounds: 0, unavailable: 0, findings: 0, peerUnmatchedClasses: 0, models: new Set() });
    const entry = providers.get(provider);
    entry.rounds++; if (row.model) entry.models.add(row.model);
    if (row.outcome === 'UNAVAILABLE') entry.unavailable++;
    const own = row.outcome === 'UNAVAILABLE' ? [] : byResult.get(row.reference) ?? [];
    entry.findings += own.length;
    const peers = reviewers.filter(peer => peer !== row && pairOf(peer) === pairOf(row));
    const peerClasses = new Set(peers.flatMap(peer => (byResult.get(peer.reference) ?? []).map(finding => finding.classId)).filter(Boolean));
    entry.peerUnmatchedClasses += new Set(own.map(finding => finding.classId).filter(id => id && !peerClasses.has(id))).size;
  }
  const list = [...providers.values()].sort((a, b) => compare(a.provider, b.provider))
    .map(({ models, ...row }) => ({ ...row, models: [...models].sort(), unavailableRate: row.rounds ? row.unavailable / row.rounds : null }));
  let met;
  if (notRecorded || !list.length) met = null;
  else met = list.every(row => row.unavailableRate < UNAVAILABLE_TARGET && row.findings > 0);
  return { target: `every reviewer provider's UNAVAILABLE rate < ${UNAVAILABLE_TARGET * 100}% and it reports findings of its own`,
    denominator: { reviewerRounds: reviewers.length, providers: list.length }, uncountedReviewerRows: all.length - reviewers.length, providers: list,
    proxy: 'peerUnmatchedClasses counts class IDs the peer did not use in the same pair. Class IDs are reviewer slugs, so this does not establish distinct defects and never affects met.',
    notRecorded, coverage: coverage(notRecorded), met };
}

// Per provider and model (AC10): review results by status and reason, rule
// counts and findings by severity.
export function reviewerTable(rows) {
  const results = rows.filter(row => row.kind === 'artifact' && row.check === 'review');
  const rules = rows.filter(row => ['verdict-normalization', 'verdict-rejection'].includes(row.check));
  const findings = reviewFindings(rows);
  const key = row => `${row.provider ?? NOT_RECORDED}\u0000${row.model ?? NOT_RECORDED}`;
  const keys = [...new Set([...results, ...rules, ...findings].map(key))].sort(compare);
  const sum = (items, check) => { const counts = {}; for (const row of items.filter(item => item.check === check)) counts[row.rule] = (counts[row.rule] ?? 0) + (row.count ?? 0); return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => compare(a, b))); };
  return keys.map(id => {
    const [provider, model] = id.split('\u0000');
    const mine = results.filter(row => key(row) === id), unavailable = mine.filter(row => row.outcome === 'UNAVAILABLE'), ruled = rules.filter(row => key(row) === id);
    return { provider, model, results: mine.length, byOutcome: tally(mine, row => row.outcome), byStatus: tally(mine, row => row.reviewerStatus),
      unavailableReasons: tally(unavailable, row => row.unavailableReason), normalizations: sum(ruled, 'verdict-normalization'), rejections: sum(ruled, 'verdict-rejection'),
      findingsBySeverity: tally(findings.filter(row => key(row) === id), row => row.severity) };
  });
}

export function convergence(rows) {
  return { format: CONVERGENCE_FORMAT, rounds: roundsMeasure(rows), demoted: demotedMeasure(rows), escapedFromDemoted: escapedMeasure(rows),
    secondOpinion: secondOpinionMeasure(rows), reviewers: reviewerTable(rows), caveat: CONVERGENCE_CAVEAT };
}

// Cohort filters (AC12): project label, key or (for a workspace path) its
// keyed identity, and an observation time window.
export function cohort(rows, { project, since, until } = {}, projectIdentity = null) {
  const from = since == null ? -Infinity : Date.parse(since), to = until == null ? Infinity : Date.parse(until);
  if (!Number.isFinite(from) && since != null || !Number.isFinite(to) && until != null) throw new Error('Invalid convergence date filter');
  const inProject = row => project == null || row.project === project || row.projectKey === project
    || (projectIdentity != null && typeof row.projectKey === 'string' && row.projectKey.endsWith(`:${projectIdentity}`));
  return rows.filter(row => inProject(row) && time(row) >= from && time(row) <= to);
}

const met = value => value === true ? 'met' : value === false ? 'not met' : 'not measurable';
const counts = value => Object.entries(value ?? {}).map(([name, n]) => `${name} ${n}`).join(', ') || 'none';
const cell = value => String(value ?? '').replace(/[|\r\n]/gu, ' ');
export function renderConvergenceMarkdown(value) {
  const { rounds, demoted, escapedFromDemoted: escaped, secondOpinion, reviewers } = value.convergence ?? value;
  const lines = ['# GateReeve convergence measures', ''];
  if (value.cohort) lines.push(`Cohort: ${cell(value.cohort.source)}${value.cohort.dataset ? ` ${cell(value.cohort.dataset)}` : ''} · ${value.cohort.observations} observations${value.cohort.project ? ` · project ${cell(value.cohort.project)}` : ''}${value.cohort.since ? ` · since ${cell(value.cohort.since)}` : ''}${value.cohort.until ? ` · until ${cell(value.cohort.until)}` : ''}`, '');
  lines.push(`## 1. Rounds to PASS: ${met(rounds.met)}`, '', `Target: ${rounds.target}. Coverage: ${rounds.coverage} (${rounds.notRecorded} rows not recorded).`,
    `Scopes: ${rounds.denominator.scopes} (passed ${rounds.denominator.passed}, open ${rounds.denominator.open}, waived ${rounds.denominator.waived}). Median: ${rounds.medianRoundsToPass ?? 'none'}${rounds.medianIncludesOpenScopes ? ' (open scopes counted at their current round)' : ''}. Waives after a FAIL streak: ${rounds.waivesAfterFailStreak.length}. Uncounted pairs (no reviewer launched on a counted revision): ${rounds.uncountedPairs}.`, '');
  if (rounds.scopes.length) {
    lines.push('| Run | Scope | Status | Rounds to PASS | Current round |', '| --- | --- | --- | --- | --- |');
    for (const row of rounds.scopes) lines.push(`| ${cell(row.issue ?? row.workflow)} | ${cell(row.scope)} | ${row.status}${row.waivedAfterFailStreak ? ' (after FAIL streak)' : ''} | ${row.roundsToPass ?? '-'} | ${row.currentRound} |`);
    lines.push('');
  }
  lines.push(`## 2. Demoted findings: ${met(demoted.met)}`, '', `Target: ${demoted.target}. Coverage: ${demoted.coverage} (${demoted.notRecorded} findings not recorded).`,
    `Demoted: ${demoted.denominator.demoted} of ${demoted.denominator.findings} findings (${counts(demoted.recorded.bySeverity)}). Recorded with severity and failure scenario: ${demoted.recorded.withSeverityAndScenario} (${met(demoted.recorded.met)}).`,
    `Decided: ${demoted.decided.statement ?? `${counts(demoted.decided.byFollowUp)} (${met(demoted.decided.met)})`}`, '');
  lines.push(`## 3. Escaped defects traced to demoted findings: ${escaped.traced}`, '', `${escaped.threshold}`, `Confirmed escaped defects: ${escaped.denominator.confirmed} of ${escaped.denominator.escapedDefects}; traced to a demoted finding: ${escaped.traced} (${escaped.tracedWithFollowUp} with a follow-up record). Coverage: ${escaped.coverage}.`, escaped.statement, '');
  lines.push(`## 4. Second opinion: ${met(secondOpinion.met)}`, '', `Target: ${secondOpinion.target}. Coverage: ${secondOpinion.coverage}. Reviewer rounds: ${secondOpinion.denominator.reviewerRounds}.`, '');
  if (secondOpinion.providers.length) {
    lines.push('| Provider | Rounds | UNAVAILABLE | Rate | Findings | Peer-unmatched classes (proxy) |', '| --- | --- | --- | --- | --- | --- |');
    for (const row of secondOpinion.providers) lines.push(`| ${cell(row.provider)} | ${row.rounds} | ${row.unavailable} | ${row.unavailableRate == null ? '-' : `${Math.round(row.unavailableRate * 1000) / 10}%`} | ${row.findings} | ${row.peerUnmatchedClasses} |`);
    lines.push('', secondOpinion.proxy, '');
  }
  lines.push('## Reviewers', '');
  if (reviewers.length) {
    lines.push('| Provider | Model | Results | Status | UNAVAILABLE reasons | Normalizations | Rejections | Findings by severity |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const row of reviewers) lines.push(`| ${cell(row.provider)} | ${cell(row.model)} | ${row.results} | ${cell(counts(row.byStatus))} | ${cell(counts(row.unavailableReasons))} | ${cell(counts(row.normalizations))} | ${cell(counts(row.rejections))} | ${cell(counts(row.findingsBySeverity))} |`);
  } else lines.push('No review results recorded.');
  lines.push('', (value.convergence ?? value).caveat);
  return `${lines.join('\n')}\n`;
}

// `metrics convergence` (AC12): the local reporting store's latest rows, or a
// fixed dataset, filtered to a cohort. Read-only; never grants authority.
export async function convergenceReport(input = {}, store) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['dataset', 'project', 'since', 'until'].includes(key)))
    throw new Error('Convergence accepts dataset, project, since and until');
  for (const key of Object.keys(input)) if (input[key] != null && (typeof input[key] !== 'string' || !input[key])) throw new Error(`Invalid convergence ${key}`);
  // A workspace path (the desktop's selected project) matches by its keyed identity.
  const projectIdentity = input.project?.startsWith('/') ? await store.identity(input.project).catch(() => null) : null;
  const rows = cohort(await reportingObservations(store, input.dataset), input, projectIdentity);
  return { format: CONVERGENCE_FORMAT, cohort: { source: input.dataset ? 'dataset' : 'local', ...(input.dataset ? { dataset: input.dataset } : {}),
    ...(input.project ? { project: input.project } : {}), ...(input.since ? { since: input.since } : {}), ...(input.until ? { until: input.until } : {}), observations: rows.length },
    convergence: convergence(rows) };
}
