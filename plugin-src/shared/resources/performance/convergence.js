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

// Review-scope instances (AC6). A scope name is reused: the next slice PR, a
// split part or the rounds after an amendment start a new instance whose
// counter restarts at round 1 (round-policy.js). Rows of one workflow and
// scope are split at each `ROUND_COUNTED` of round 1.
const boundaryRow = row => BOUNDARY_SCOPES.includes(row.reviewScope) && Number.isSafeInteger(row.round);
const ORDER = { ROUND_COUNTED: 0, 'boundary-reviewer': 1, BOUNDARY_REVIEWED: 1, REVIEW_ADJUDICATED: 2 };
export function scopeInstances(rows) {
  const groups = new Map();
  for (const row of rows.filter(row => ORDER[row.check] !== undefined && boundaryRow(row))) {
    const key = `${row.workflow ?? ''}\u0000${row.reviewScope}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const instances = [];
  for (const group of groups.values()) {
    group.sort((a, b) => time(a) - time(b) || ORDER[a.check] - ORDER[b.check]);
    let current = null;
    for (const row of group) {
      if (!current || (row.check === 'ROUND_COUNTED' && row.round === 1 && current.rows.length)) {
        current = { workflow: row.workflow ?? null, issue: row.issue ?? null, scope: row.reviewScope, instance: instances.filter(item => item.workflow === (row.workflow ?? null) && item.scope === row.reviewScope).length + 1, rows: [] };
        instances.push(current);
      }
      current.rows.push(row);
    }
  }
  for (const instance of instances) instance.rounds = roundOutcomes(instance.rows);
  return instances;
}
// Each provider's final reviewer row per round: the latest attempt that
// launched a reviewer (a reused or refused attempt never hides one that ran),
// as boundary-review.js chooses an outcome row; re-reviews of one revision
// share the round, so they count once.
function roundOutcomes(rows) {
  const rounds = new Map();
  for (const row of rows.filter(row => row.check === 'boundary-reviewer')) {
    if (!rounds.has(row.round)) rounds.set(row.round, new Map());
    const providers = rounds.get(row.round), provider = row.provider ?? NOT_RECORDED, previous = providers.get(provider);
    if (!previous || row.reviewerStatus !== 'refused' || previous.reviewerStatus === 'refused') providers.set(provider, row);
  }
  // A round PASSes only when one recorded pair had every reviewer complete
  // with PASS: completed reviewers of separate pair events (for example a
  // reused result beside a later retry) never combine into a PASS no pair
  // recorded (AC6).
  const pairOf = row => row.id.replace(/:reviewer:\d+$/u, '');
  return new Map([...rounds].map(([round, providers]) => {
    const finals = [...providers.values()], completed = finals.filter(row => row.reviewerStatus === 'completed');
    const members = new Map();
    for (const row of rows.filter(item => item.check === 'boundary-reviewer' && item.round === round)) members.set(pairOf(row), [...(members.get(pairOf(row)) ?? []), row]);
    const passingPair = [...members.values()].some(pair => pair.every(row => row.reviewerStatus === 'completed' && row.outcome === 'PASS'));
    const outcome = passingPair ? 'PASS' : completed.some(row => row.outcome === 'FAIL') ? 'FAIL' : 'UNAVAILABLE';
    return [round, { outcome, finals, at: Math.max(...rows.filter(row => row.round === round && row.check === 'boundary-reviewer').map(time)) }];
  }));
}

// Review results projected before these fields carry no reviewer status
// (every current review result has one); they are not recorded (AC11).
const legacyResults = rows => rows.filter(row => row.kind === 'artifact' && row.check === 'review' && row.reviewerStatus == null).length;

// Measure 1 (AC6): rounds to PASS per workflow and boundary scope instance.
export function roundsMeasure(rows) {
  const pairs = rows.filter(row => row.check === 'BOUNDARY_REVIEWED');
  const counted = rows.filter(row => row.check === 'ROUND_COUNTED');
  const adjudicated = rows.filter(row => row.check === 'REVIEW_ADJUDICATED');
  // A pair with its scope but no round launched no reviewer on a counted
  // revision, so it is not a round (round-policy.js); rows without the scope
  // were projected before these fields.
  const notRecorded = [...pairs, ...counted].filter(row => row.reviewScope == null).length + adjudicated.filter(row => row.reviewScope == null || row.round == null).length
    + legacyResults(rows)
    // A counted reviewer outcome whose status was not recorded leaves the pair's outcome unknown.
    + rows.filter(row => row.check === 'boundary-reviewer' && Number.isSafeInteger(row.round) && row.reviewerStatus == null).length;
  const uncountedPairs = pairs.filter(row => row.reviewScope != null && row.round == null).length;
  const instances = scopeInstances(rows);
  for (const instance of instances) {
    const passes = [...instance.rounds].filter(([, round]) => round.outcome === 'PASS').map(([n]) => n);
    const adjudications = instance.rows.filter(row => row.check === 'REVIEW_ADJUDICATED').map(row => row.round);
    instance.passedRound = passes.length || adjudications.length ? Math.min(...passes, ...adjudications) : null;
    instance.currentRound = Math.max(0, ...instance.rows.map(row => row.round));
  }
  // A review waiver closes the scope instance of the workflow's latest
  // reviewed round before it, and only when that instance never passed; it is
  // a waive after a FAIL streak when that round FAILed.
  const afterFail = [], waived = new Set();
  for (const waiver of rows.filter(waives)) {
    let latest = null;
    for (const instance of instances.filter(item => item.workflow === (waiver.workflow ?? null)))
      for (const [round, value] of instance.rounds) if (value.at <= time(waiver) && (!latest || value.at > latest.value.at)) latest = { instance, round, value };
    if (!latest || latest.instance.passedRound != null) continue;
    waived.add(latest.instance);
    if (latest.value.outcome === 'FAIL') afterFail.push({ workflow: waiver.workflow ?? null, scope: latest.instance.scope, instance: latest.instance.instance, round: latest.round, at: waiver.observedAt });
  }
  const list = instances.map(instance => ({ workflow: instance.workflow, issue: instance.issue, scope: instance.scope, instance: instance.instance,
    status: instance.passedRound != null ? 'passed' : waived.has(instance) ? 'waived' : 'open', roundsToPass: instance.passedRound, currentRound: instance.currentRound,
    reviewedRounds: instance.rounds.size, waivedAfterFailStreak: afterFail.some(row => row.workflow === instance.workflow && row.scope === instance.scope && row.instance === instance.instance) }))
    .sort((a, b) => compare(`${a.workflow}${a.scope}${a.instance}`, `${b.workflow}${b.scope}${b.instance}`));
  const passed = list.filter(row => row.status === 'passed'), open = list.filter(row => row.status === 'open'), closed = list.filter(row => row.status === 'waived');
  // Open scopes count their current round as a lower bound; they can only raise the median.
  const value = median([...passed.map(row => row.roundsToPass), ...open.map(row => row.currentRound)]);
  let met;
  if (notRecorded) met = null;
  else if ((value != null && value > ROUNDS_TARGET) || afterFail.length) met = false;
  else if (open.length || !passed.length) met = null;
  else met = true;
  return { target: `median rounds to PASS <= ${ROUNDS_TARGET} and no waive after a FAIL streak`, denominator: { scopes: list.length, passed: passed.length, open: open.length, waived: closed.length },
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
  const traced = [], linkedFindings = new Set(), followedUp = new Set();
  // Every review finding projected before these fields is not recorded (AC11),
  // whether or not a defect links to it: its demotion status is unknown.
  const notRecorded = reviewFindings(rows).filter(row => row.demoted == null).length;
  let unmatched = 0;
  for (const defect of confirmed) {
    const linked = defect.links.map(link => FINDING_LINK.exec(link)).filter(Boolean).map(([, hash, id]) => findings.get(`${hash}\u0000${id}`));
    if (linked.some(row => row === undefined)) unmatched++;
    const demoted = linked.filter(row => row?.demoted === true);
    for (const row of demoted) { linkedFindings.add(row.id); if (row.followUp != null) followedUp.add(row.id); }
    if (demoted.length) traced.push({ fixId: defect.fixId ?? null, findings: demoted.length, withFollowUp: demoted.filter(row => row.followUp != null).length });
  }
  return { target: 'escaped defects traced to demoted findings are counted (no threshold)', denominator: { escapedDefects: defects.length, confirmed: confirmed.length },
    // Distinct linked demoted findings, and how many of them have a follow-up record (AC8).
    traced: traced.length, tracedFindings: linkedFindings.size, tracedWithFollowUp: followedUp.size, defects: traced, unmatchedFindingLinks: unmatched,
    statement: escapedDefectStatement(defects.length, confirmed.length), threshold: 'D6 sets no threshold for this measure: it is counted, not passed, so met is always null.',
    notRecorded, coverage: coverage(notRecorded), met: null };
}

// Measure 4 (AC9): each provider's final outcome per reviewed round (re-reviews
// of one revision and retries share the round and count once).
export function secondOpinionMeasure(rows) {
  const all = rows.filter(row => row.check === 'boundary-reviewer');
  let notRecorded = rows.filter(row => row.check === 'BOUNDARY_REVIEWED' && row.reviewScope == null).length + legacyResults(rows);
  const byResult = new Map();
  for (const row of reviewFindings(rows)) byResult.set(row.reference, [...(byResult.get(row.reference) ?? []), row]);
  const providers = new Map();
  let reviewerRounds = 0;
  for (const instance of scopeInstances(rows)) for (const { finals } of instance.rounds.values()) {
    const own = row => row.reviewerStatus === 'completed' ? byResult.get(row.reference) ?? [] : [];
    for (const row of finals) {
      // A final outcome without a recorded status is not recorded, never
      // counted as UNAVAILABLE or available.
      if (row.reviewerStatus == null) { notRecorded++; continue; }
      const provider = row.provider ?? NOT_RECORDED;
      if (!providers.has(provider)) providers.set(provider, { provider, rounds: 0, unavailable: 0, findings: 0, peerUnmatchedClasses: 0, models: new Set() });
      const entry = providers.get(provider);
      entry.rounds++; reviewerRounds++; if (row.model) entry.models.add(row.model);
      // A provider that did not complete its round (failed, rejected, unable to
      // assess or never launched) was unavailable for that round.
      if (row.reviewerStatus !== 'completed' || row.outcome === 'UNAVAILABLE') entry.unavailable++;
      entry.findings += own(row).length;
      const peerClasses = new Set(finals.filter(peer => peer !== row).flatMap(peer => own(peer).map(finding => finding.classId)).filter(Boolean));
      entry.peerUnmatchedClasses += new Set(own(row).map(finding => finding.classId).filter(id => id && !peerClasses.has(id))).size;
    }
  }
  const list = [...providers.values()].sort((a, b) => compare(a.provider, b.provider))
    .map(({ models, ...row }) => ({ ...row, models: [...models].sort(), unavailableRate: row.rounds ? row.unavailable / row.rounds : null }));
  let met;
  if (notRecorded || !list.length) met = null;
  else met = list.every(row => row.unavailableRate < UNAVAILABLE_TARGET && row.findings > 0);
  return { target: `every reviewer provider's UNAVAILABLE rate < ${UNAVAILABLE_TARGET * 100}% and it reports findings of its own`,
    denominator: { reviewerRounds, providers: list.length }, uncountedReviewerRows: all.filter(row => !Number.isSafeInteger(row.round)).length, providers: list,
    proxy: 'peerUnmatchedClasses counts class IDs the peer did not use in the same round. Class IDs are reviewer slugs, so this does not establish distinct defects and never affects met.',
    notRecorded, coverage: coverage(notRecorded), met };
}

// Per provider and model (AC10): review results by status and reason, rule
// counts and findings by severity.
export function reviewerTable(rows) {
  const results = rows.filter(row => row.kind === 'artifact' && row.check === 'review');
  // Rule counts of review results only; a spec or verification result's rules
  // carry the same provider and model but are not reviewer outcomes.
  const reviewResults = new Set(results.map(row => row.reference));
  const rules = rows.filter(row => ['verdict-normalization', 'verdict-rejection'].includes(row.check) && reviewResults.has(row.reference));
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
    for (const row of rounds.scopes) lines.push(`| ${cell(row.issue ?? row.workflow)} | ${cell(row.scope)}${row.instance > 1 ? ` #${row.instance}` : ''} | ${row.status}${row.waivedAfterFailStreak ? ' (after FAIL streak)' : ''} | ${row.roundsToPass ?? '-'} | ${row.currentRound} |`);
    lines.push('');
  }
  lines.push(`## 2. Demoted findings: ${met(demoted.met)}`, '', `Target: ${demoted.target}. Coverage: ${demoted.coverage} (${demoted.notRecorded} findings not recorded).`,
    `Demoted: ${demoted.denominator.demoted} of ${demoted.denominator.findings} findings (${counts(demoted.recorded.bySeverity)}). Recorded with severity and failure scenario: ${demoted.recorded.withSeverityAndScenario} (${met(demoted.recorded.met)}).`,
    `Decided: ${demoted.decided.statement ?? `${counts(demoted.decided.byFollowUp)} (${met(demoted.decided.met)})`}`, '');
  lines.push(`## 3. Escaped defects traced to demoted findings: ${escaped.traced}`, '', `${escaped.threshold}`, `Confirmed escaped defects: ${escaped.denominator.confirmed} of ${escaped.denominator.escapedDefects}; traced to a demoted finding: ${escaped.traced} (${escaped.tracedFindings} linked demoted findings, ${escaped.tracedWithFollowUp} with a follow-up record). Coverage: ${escaped.coverage}.`, escaped.statement, '');
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
