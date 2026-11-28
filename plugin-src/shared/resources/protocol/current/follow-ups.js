import { createHash } from 'node:crypto';
import { lstat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { hostname } from 'node:os';
import { basename, join } from 'node:path';
import { authority as humanAuthority, requireThat, object, text, autonomousValue, identity } from './contracts.js';
import { scheduledBlocking, severityOf } from './round-policy.js';
import { sweptClassRegression } from './sweep-records.js';
import { configuredGit } from './authorization.js';

// Follow-up records (issue #148, spec AC1-AC9). A review finding that did not
// block, or a non-review origin's pre-existing condition, is tracked to a
// decision before Completion. Review follow-ups are derived on read from the
// run's retained review results (no reviewer-path writes); non-review origins
// append FOLLOW_UP_RECORDED events; decisions are FOLLOW_UP_DECIDED events.
// The record extends the #144 claim/sweep vocabulary (findingId, classId,
// class). A follow-up is not a waiver: a waiver records how a gate was closed,
// a follow-up records a decision on a finding that never (or no longer) blocked.
export const FOLLOW_UP_FORMAT = 'follow-up/1';
export const FOLLOW_UP_STATUSES = Object.freeze(['undecided', 'accepted-risk', 'new-work', 'rejected', 'fixed']);
export const DECISION_STATUS = Object.freeze({ 'accept-risk': 'accepted-risk', 'new-work': 'new-work', reject: 'rejected' });
export const POLICY_DEFAULT = 'policy-default';
export const ORIGIN_KINDS = Object.freeze(['review', 'dependency-scan']);
export const MAX_DECIDED = 512;
export const FOLLOW_UPS_FILE = 'follow-ups.md';
const SCAN_SEVERITIES = Object.freeze(['low', 'medium', 'high', 'critical']);
const SCAN_FIELDS = Object.freeze(['repository', 'manifest', 'vulnId', 'package', 'version', 'severity', 'title']);
const DECIDE_FIELDS = Object.freeze(['followUps', 'select', 'decision', 'defaults', 'reason', 'authority', 'pr']);
const SELECT_FIELDS = Object.freeze(['status', 'severity', 'origin']);

const sha256 = value => createHash('sha256').update(value).digest('hex');
export const followUpId = dedupKey => `fu-${sha256(dedupKey).slice(0, 12)}`;
export const followUpMarker = dedupKey => `gatereeve-follow-up:${sha256(dedupKey)}`;

// Whether a finding blocked when this report raised it: the round schedule
// with the report's recorded round, regression paths and sweep records (#144);
// with no recorded round, the reviewer's flag where low never blocks. The
// metrics projection uses the same rule (workflow-projection.js).
export function raisedBlocking(finding, policy, sweepRecords) {
  const round = Number.isSafeInteger(policy?.round) ? policy.round : null;
  const records = Array.isArray(sweepRecords?.records) ? sweepRecords.records : [];
  const regression = (Array.isArray(policy?.regressionPaths) && typeof finding?.path === 'string' && policy.regressionPaths.includes(finding.path))
    || (round !== null && sweptClassRegression(records, finding, round));
  return scheduledBlocking(finding, { round, regression });
}
export function followUpReason(finding) {
  return severityOf(finding) === 'low' ? 'low' : !finding.blocking ? 'reviewer-non-blocking' : 'demoted';
}
// Default decisions (interview D1.3, D2): low accepts the risk, medium is new
// work, a pre-existing condition is new work at every severity, and a review
// high has no default.
export function defaultDecision(record) {
  if (record.origin?.preExisting) return 'new-work';
  if (record.finding.severity === 'low') return 'accept-risk';
  if (record.finding.severity === 'medium') return 'new-work';
  return null;
}
// An open high blocks the release merge and parks a goal run; a pre-existing
// condition never counts (interview D2).
export const openHigh = record => record.status === 'undecided' && !record.origin?.preExisting && ['high', 'critical'].includes(record.finding.severity);

const roundKey = (input, hash) => input?.roundPolicy?.revision
  ? `round:${input.roundPolicy.scope}:${input.roundPolicy.epoch ?? 0}:${input.roundPolicy.round}:${input.roundPolicy.revision}`
  : input?.reviewRound ?? hash;
function repositoryOf(repositories, path, candidate) {
  const match = repositories.find(repository => typeof path === 'string' && path.startsWith(`${repository.alias}/`));
  return match?.alias ?? candidate?.repositories?.[0]?.alias ?? repositories[0]?.alias ?? null;
}

// Review follow-ups from the run's retained review results, in journal order.
// Rounds are judged together like review-findings.js: within a round each
// provider's latest report is its perspective; a finding is resolved only when
// no perspective of that round still marks it present or re-reports it.
async function reviewRecords(core, events) {
  const reports = [], unavailable = [];
  // An unreadable result counts as unavailable unless its job is known not to
  // be a review (a lost verification result holds no follow-up).
  const gates = new Map(events.filter(event => event.type === 'JOB_STARTED').map(event => [event.payload.jobId, event.payload.gates]));
  for (const [index, event] of events.entries()) {
    if (event.type !== 'JOB_FINISHED') continue;
    const jobGates = gates.get(event.payload.jobId);
    for (const ref of event.payload.results ?? []) {
      let report;
      try { report = await core.store.json(ref); }
      catch (error) { if (!Array.isArray(jobGates) || jobGates.includes('review')) unavailable.push(`result ${ref.hash}: ${error.message}`); continue; }
      if (report?.gate !== 'review') continue;
      let input = null, candidate = null;
      try { input = await core.store.json(report.input); } catch (error) { unavailable.push(`review input of ${ref.hash}: ${error.message}`); continue; }
      try { candidate = input.candidate ? await core.store.json(input.candidate) : null; } catch { /* first configured repository */ }
      reports.push({ ref, report, input, candidate, sequence: index });
    }
  }
  return { records: deriveReviewRecords(core.context.repositories, reports), unavailable };
}
// Pure derivation over retained review reports `{ref, report, input,
// candidate, sequence}` in journal order (exported for tests of earlier
// contracts' results).
export function deriveReviewRecords(repositories, reports) {
  reports = reports.map(item => ({ ...item, key: roundKey(item.input, item.ref.hash), provider: item.input?.configuration?.provider ?? item.ref.hash }));
  // Pass 1, in journal order: each finding's first raise (origin) and latest
  // report, and each round's perspectives (a provider's latest report). A
  // report's own first raise of an ID is not a re-report.
  const rows = new Map(), rounds = new Map();
  for (const item of reports) {
    const round = rounds.get(item.key) ?? { sequence: item.sequence, perspectives: new Map() };
    round.sequence = Math.max(round.sequence, item.sequence);
    const present = new Set(), resolved = new Set();
    for (const finding of item.report.findings ?? []) {
      if (!['high', 'medium', 'low'].includes(finding?.severity)) continue;
      const blocked = raisedBlocking(finding, item.input.roundPolicy, item.input.sweepRecords);
      const known = rows.get(finding.id);
      if (known) { if (known.origin !== item) present.add(finding.id); Object.assign(known, { latest: finding, blocked }); continue; }
      rows.set(finding.id, { origin: item, first: finding, latest: finding, blocked, fixed: false, reopenedAt: -1 });
    }
    for (const disposition of item.report.dispositions ?? []) {
      if (disposition.status === 'present') present.add(disposition.id);
      if (disposition.status === 'resolved') resolved.add(disposition.id);
    }
    round.perspectives.set(item.provider, { present, resolved });
    rounds.set(item.key, round);
  }
  // Pass 2, round by round: present in any perspective keeps (or reopens) a
  // finding; otherwise a resolved disposition makes it fixed.
  for (const round of [...rounds.values()].sort((a, b) => a.sequence - b.sequence)) {
    const perspectives = [...round.perspectives.values()];
    for (const [id, row] of rows) {
      if (perspectives.some(item => item.present.has(id))) { if (row.fixed) Object.assign(row, { fixed: false, reopenedAt: round.sequence }); }
      else if (perspectives.some(item => item.resolved.has(id))) row.fixed = true;
    }
  }
  const records = [];
  for (const [id, row] of rows) {
    if (row.blocked) continue;
    const { origin, first, latest } = row;
    const dedupKey = `review:${origin.ref.hash}:${id}`;
    records.push({ format: FOLLOW_UP_FORMAT, id: followUpId(dedupKey), dedupKey, repository: repositoryOf(repositories, first.path, origin.candidate),
      origin: { kind: 'review', result: origin.ref.hash, findingId: id, provider: origin.input.configuration?.provider ?? null, model: origin.input.configuration?.model ?? null,
        reviewScope: origin.input.roundPolicy?.scope ?? null, round: Number.isSafeInteger(origin.input.roundPolicy?.round) ? origin.input.roundPolicy.round : null },
      finding: { findingId: id, classId: first.classId ?? null, class: first.classStatement ?? null, criterion: first.criterion ?? null, path: first.path ?? null,
        severity: severityOf(latest), failureScenario: latest.failureScenario ?? first.failureScenario ?? null },
      reason: followUpReason(latest), fixed: row.fixed, reopenedAt: row.reopenedAt, recordedAt: origin.sequence });
  }
  return records;
}

function recordedRecords(events) {
  const records = new Map();
  for (const [index, event] of events.entries()) if (event.type === 'FOLLOW_UP_RECORDED' && !records.has(event.payload.id))
    records.set(event.payload.id, { ...event.payload, fixed: false, reopenedAt: -1, recordedAt: index });
  return [...records.values()];
}
function decisionsOf(events) {
  const decisions = new Map();
  for (const [index, event] of events.entries()) if (event.type === 'FOLLOW_UP_DECIDED')
    for (const row of event.payload.decisions ?? []) {
      const list = decisions.get(row.id) ?? [];
      list.push({ ...row, authorityKind: event.payload.authority?.kind, reason: event.payload.reason, event: event.hash, at: event.recordedAt, sequence: index });
      decisions.set(row.id, list);
    }
  return decisions;
}
// The current decision: the latest human-confirmed one, else the latest
// policy default, among decisions recorded after the latest reopening.
export function currentDecision(list = [], reopenedAt = -1) {
  const valid = list.filter(row => row.sequence > reopenedAt);
  return valid.findLast(row => row.authorityKind === 'human-confirmed') ?? valid.findLast(row => row.authorityKind === POLICY_DEFAULT) ?? null;
}

// Every follow-up of the run with its current status. `unavailable` lists
// retained review records that could not be read: their follow-ups are
// unknown, never decided.
export async function followUpRecords(core, events = null) {
  events ??= (await core.state()).events;
  const review = await reviewRecords(core, events);
  const decisions = decisionsOf(events);
  const records = [...review.records, ...recordedRecords(events)].map(record => {
    const decision = currentDecision(decisions.get(record.id), record.reopenedAt);
    const status = record.fixed ? 'fixed' : decision ? DECISION_STATUS[decision.decision] : 'undecided';
    const { fixed, reopenedAt, recordedAt, ...rest } = record;
    return { ...rest, status, decision: decision && !record.fixed ? { decision: decision.decision, authorityKind: decision.authorityKind, reason: decision.reason,
      tracking: decision.tracking ?? null, event: decision.event, at: decision.at } : null, reopened: reopenedAt >= 0 };
  });
  return { records, unavailable: review.unavailable };
}

const tally = (rows, key) => rows.reduce((counts, row) => ({ ...counts, [key(row)]: (counts[key(row)] ?? 0) + 1 }), {});
export function followUpSummary({ records, unavailable }) {
  const undecided = records.filter(record => record.status === 'undecided');
  const high = records.filter(openHigh);
  const next = unavailable.length ? `Restore the unreadable review records before Completion: ${unavailable.join('; ')}`
    : high.length ? `Open high follow-up(s) ${high.map(record => record.id).join(', ')} need a human decision (no default); they block the release merge and park a goal run`
      : undecided.length ? `Decide ${undecided.length} follow-up(s) with followup.decide (defaults: true applies the policy defaults) before Completion` : null;
  return { format: FOLLOW_UP_FORMAT, records, unavailable, counts: { byStatus: tally(records, row => row.status), bySeverity: tally(records, row => row.finding.severity) },
    undecided: undecided.map(record => record.id), openHigh: high.map(record => record.id),
    defaults: records.filter(record => record.decision?.authorityKind === POLICY_DEFAULT).map(record => ({ id: record.id, decision: record.decision.decision, event: record.decision.event })),
    next };
}

// Non-review origins (spec AC2): a gate records pre-existing conditions. Only
// `dependency-scan` exists today; its gate is not built yet.
export async function recordFollowUps(core, input) {
  object(input, 'Follow-up input');
  requireThat(Object.keys(input).every(key => ['origin', 'findings'].includes(key)), 'Follow-up input has exactly origin and findings');
  object(input.origin, 'origin');
  requireThat(Object.keys(input.origin).every(key => key === 'kind'), 'origin has exactly kind');
  requireThat(input.origin.kind === 'dependency-scan', `origin.kind must be dependency-scan; review follow-ups are derived from review results`);
  requireThat(Array.isArray(input.findings) && input.findings.length >= 1 && input.findings.length <= MAX_DECIDED, `findings must list 1 to ${MAX_DECIDED} findings`);
  const prepared = input.findings.map((finding, index) => {
    const at = `findings[${index}]`;
    object(finding, at);
    const unknown = Object.keys(finding).find(key => !SCAN_FIELDS.includes(key));
    requireThat(unknown === undefined, `${at}.${unknown} is not allowed; a dependency-scan finding has exactly ${SCAN_FIELDS.join(', ')}`);
    for (const key of SCAN_FIELDS) requireThat(typeof finding[key] === 'string' && finding[key].trim() && finding[key].length <= 1024, `${at}.${key} must be nonempty text of at most 1024 characters`);
    requireThat(SCAN_SEVERITIES.includes(finding.severity), `${at}.severity must be ${SCAN_SEVERITIES.join(', ')}`);
    requireThat(core.context.repositories.some(repository => repository.alias === finding.repository), `${at}.repository must be a configured repository alias`);
    const dedupKey = `dependency-scan:${finding.repository}:${finding.manifest}:${finding.vulnId}:${finding.package}@${finding.version}`;
    return { format: FOLLOW_UP_FORMAT, id: followUpId(dedupKey), dedupKey, repository: finding.repository,
      origin: { kind: 'dependency-scan', ...Object.fromEntries(SCAN_FIELDS.map(key => [key, finding[key]])), preExisting: true },
      finding: { findingId: null, classId: null, class: finding.title, criterion: null, path: finding.manifest, severity: finding.severity, failureScenario: null },
      reason: 'pre-existing' };
  });
  let { state, events } = await core.state();
  const seen = new Set(events.filter(event => event.type === 'FOLLOW_UP_RECORDED').map(event => event.payload.id));
  for (const record of prepared) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    ({ state } = await core.append(state, 'FOLLOW_UP_RECORDED', record, { id: `follow-up-${record.id}`, hash: identity(record) }));
  }
  return prepared.map(record => record.id);
}

// Issue text (spec AC5, A1): repository-relative fields only; free text is
// redacted of local paths, the workspace, host and run identity, other
// repositories and the repository's followUpRedactions terms.
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
export function redactor(core, state, repository, ownName = null) {
  const exact = [core.context.featureHome, core.context.workspaceRoot, ...core.context.repositories.map(item => item.path), state.runId]
    .filter(value => typeof value === 'string' && value.length > 1).sort((a, b) => b.length - a.length);
  const folder = basename(core.context.workspaceRoot ?? '');
  const words = [hostname(), hostname().split('.')[0], ...(folder && folder.toLowerCase() !== String(ownName ?? '').toLowerCase() ? [folder] : []),
    ...core.context.repositories.filter(item => item.alias !== repository).map(item => item.alias),
    ...(core.context.repositories.find(item => item.alias === repository)?.followUpRedactions ?? [])]
    .filter(value => typeof value === 'string' && value.trim().length > 1);
  const redact = value => {
    let result = String(value ?? '');
    for (const item of exact) result = result.split(item).join('<path>');
    // Every absolute or home path, one segment included (/srv): conservative,
    // since a repository-relative path never starts with a separator.
    result = result.replace(/(?<![\w.-])(?:~|[A-Za-z]:)?[\\/][^\s'"`<>()[\]]+/gu, '<path>');
    for (const word of words) result = result.replace(new RegExp(`(?<![\\w])${escape(word)}(?![\\w])`, 'giu'), '<redacted>');
    return result;
  };
  return redact;
}
// How a public surface hosted in `host` (a repository alias, or null) refers
// to a filed issue: `#N` in its own repository (GitHub links it and it names
// nothing); otherwise the URL, unless the URL contains a name listed in a
// followUpRedactions setting, which is withheld (the link would name it).
export function issueReference(core, tracking, host) {
  if (tracking?.kind === 'seed') return 'seed for the next feature';
  if (tracking?.kind !== 'issue') return null;
  if (host && tracking.repository === host) return `#${tracking.number}`;
  const listed = core.context.repositories.flatMap(item => item.followUpRedactions ?? []);
  const named = listed.some(term => new RegExp(`(?<![A-Za-z0-9])${escape(term)}(?![A-Za-z0-9])`, 'iu').test(String(tracking.url ?? '')));
  return named ? `issue #${tracking.number} (repository name withheld)` : tracking.url;
}
// The repository holding the committed follow-ups.md, if a configured one does.
export function featureHomeRepository(core) {
  return core.context.repositories.find(item => typeof item.path === 'string' && core.context.featureHome.startsWith(`${item.path}/`))?.alias ?? null;
}
// One redactor per follow-up repository, for every public surface: filed
// issues, the PR summary and the committed follow-ups.md.
export async function publicRedaction(core, state) {
  const cache = new Map();
  return async record => {
    if (!cache.has(record.repository)) cache.set(record.repository, redactor(core, state, record.repository, (await ownerRepo(core, record.repository))?.split('/')[1] ?? null));
    return cache.get(record.repository);
  };
}
// The record's free text, redacted for a public surface.
export async function redactedRecords(core, state, records, host = null) {
  const redactFor = await publicRedaction(core, state);
  return Promise.all(records.map(async record => {
    const redact = await redactFor(record), clean = value => typeof value === 'string' ? redact(value) : value;
    // Every free-text field, the repository alias included (an alias can be
    // a client name listed in followUpRedactions).
    return { ...record, repository: clean(record.repository), dedupKey: clean(record.dedupKey), origin: Object.fromEntries(Object.entries(record.origin).map(([key, value]) => [key, clean(value)])),
      finding: Object.fromEntries(Object.entries(record.finding).map(([key, value]) => [key, clean(value)])),
      // The issue URL keeps its form; a listed client or project name in it
      // (a repository named after a client) is replaced.
      decision: record.decision ? { ...record.decision, reason: clean(record.decision.reason),
        // Public surfaces print only `reference` (issueReference), never the raw URL.
        tracking: record.decision.tracking ? { kind: record.decision.tracking.kind, reused: record.decision.tracking.reused,
          reference: issueReference(core, record.decision.tracking, host) } : null } : null };
  }));
}
function issueText(record, redact, pr) {
  const line = value => redact(value).replace(/\s+/gu, ' ').trim();
  const local = typeof record.finding.path === 'string' && record.finding.path.startsWith(`${record.repository}/`) ? record.finding.path.slice(record.repository.length + 1) : record.finding.path;
  const subject = line(record.finding.class ?? record.origin.title ?? record.finding.findingId ?? 'follow-up');
  const title = `Follow-up (${record.finding.severity}): ${subject}`.slice(0, 200);
  const origin = record.origin.kind === 'review'
    ? `review by ${line(record.origin.provider ?? 'unknown')} ${line(record.origin.model ?? '')}`.trim() + (record.origin.round ? `, round ${record.origin.round}` : '') + (record.origin.reviewScope ? ` (${line(record.origin.reviewScope)})` : '')
    : `${record.origin.kind}: ${line(record.origin.vulnId)} in ${line(record.origin.package)}@${line(record.origin.version)} (pre-existing on the base branch)`;
  const body = ['GateReeve recorded this follow-up as new work.', '',
    `- **Severity:** ${record.finding.severity}`, `- **Origin:** ${origin}`, `- **Why it did not block:** ${record.reason}`,
    ...(record.finding.criterion ? [`- **Criterion:** ${line(record.finding.criterion)}`] : []),
    ...(local ? [`- **Path:** \`${line(local)}\``] : []),
    ...(record.finding.failureScenario ? ['', '**Failure scenario**', '', `> ${line(record.finding.failureScenario)}`] : []),
    ...(pr ? ['', `Raised in the review of #${pr}.`] : []),
    '', `<!-- ${followUpMarker(record.dedupKey)} -->`];
  return { title, body: body.join('\n') };
}
async function ownerRepo(core, alias) {
  const repository = core.context.repositories.find(item => item.alias === alias);
  if (!repository) return null;
  try {
    const url = (await configuredGit(core)(repository.path, ['config', '--get', `remote.${repository.remote ?? 'origin'}.url`])).trim();
    return /^(?:git@github\.com:|https:\/\/github\.com\/)([^/]+\/[^/]+?)(?:\.git)?$/u.exec(url)?.[1] ?? null;
  } catch { return null; }
}
async function fileIssue(core, state, record, pr, gh) {
  const repository = core.context.repositories.find(item => item.alias === record.repository);
  const target = await ownerRepo(core, record.repository);
  if (!target) return { kind: 'seed', repository: record.repository };
  const marker = followUpMarker(record.dedupKey);
  // Search finds older issues; the newest open issues cover one created
  // moments ago that the search index has not seen yet (a retry after a lost
  // response).
  const find = async args => JSON.parse(await gh(repository.path, ['issue', 'list', '--repo', target, '--state', 'open', ...args, '--json', 'number,url,body']) || '[]')
    .find(issue => String(issue.body ?? '').includes(marker));
  const existing = await find(['--search', `"${marker}" in:body`, '--limit', '20']) ?? await find(['--limit', '100']);
  if (existing) return { kind: 'issue', repository: record.repository, number: existing.number, url: existing.url, reused: true };
  const { title, body } = issueText(record, redactor(core, state, record.repository, target.split('/')[1]), pr);
  const url = (await gh(repository.path, ['issue', 'create', '--repo', target, '--title', title, '--body', body])).trim().split(/\s+/u).at(-1);
  const number = Number(/\/issues\/(\d+)$/u.exec(url)?.[1]);
  requireThat(Number.isSafeInteger(number), `Issue filing for ${record.id} returned no issue URL`);
  return { kind: 'issue', repository: record.repository, number, url, reused: false };
}
export { issueText };

function decideAuthority(state, input) {
  object(input.authority, 'authority');
  if (input.authority.kind === 'human-confirmed') return humanAuthority(input.authority);
  requireThat(input.authority.kind === POLICY_DEFAULT, 'authority.kind must be human-confirmed or policy-default');
  requireThat(Object.keys(input.authority).every(key => ['kind', 'instruction', 'context', 'messageId', 'conversationId'].includes(key)), 'Unsupported policy-default authority field');
  requireThat(input.defaults === true, 'policy-default authority applies only the defaults (defaults: true)');
  const cited = input.authority.instruction !== undefined || input.authority.context !== undefined;
  if (cited || !autonomousValue(state.dials.autonomy.value)) {
    text(input.authority.instruction, 'policy-default authority.instruction (the human\'s "accept the defaults" answer)');
    text(input.authority.context, 'policy-default authority.context');
  }
  return structuredClone(input.authority);
}

// Operation followup.decide (spec AC3-AC5).
export async function decideFollowUps(core, input, operation, gh) {
  object(input, 'followup.decide input');
  const unknown = Object.keys(input).find(key => !DECIDE_FIELDS.includes(key));
  requireThat(unknown === undefined, `followup.decide.${unknown} is not allowed; the input has ${DECIDE_FIELDS.join(', ')}`);
  requireThat((input.followUps === undefined) !== (input.select === undefined), 'Name follow-ups with exactly one of followUps or select');
  requireThat((input.decision === undefined) !== (input.defaults === undefined), 'Give exactly one of decision or defaults: true');
  if (input.defaults !== undefined) requireThat(input.defaults === true, 'defaults must be true');
  if (input.decision !== undefined) requireThat(Object.hasOwn(DECISION_STATUS, input.decision), `decision must be ${Object.keys(DECISION_STATUS).join(', ')}`);
  text(input.reason, 'reason');
  if (input.pr !== undefined) requireThat(Number.isSafeInteger(input.pr) && input.pr > 0, 'pr must be a positive PR number');
  const { state, events } = await core.state();
  const authority = decideAuthority(state, input);
  const { records } = await followUpRecords(core, events);
  let targets;
  if (input.followUps !== undefined) {
    requireThat(Array.isArray(input.followUps) && input.followUps.length >= 1 && input.followUps.length <= MAX_DECIDED, `followUps must list 1 to ${MAX_DECIDED} IDs`);
    targets = [...new Set(input.followUps)].map(id => { const record = records.find(row => row.id === id); requireThat(record, `Unknown follow-up ${id}`); return record; });
  } else {
    object(input.select, 'select');
    const keys = Object.keys(input.select);
    requireThat(keys.length >= 1 && keys.every(key => SELECT_FIELDS.includes(key)), `select needs at least one of ${SELECT_FIELDS.join(', ')} and nothing else`);
    targets = records.filter(record => (input.select.status === undefined || record.status === input.select.status)
      && (input.select.severity === undefined || record.finding.severity === input.select.severity)
      && (input.select.origin === undefined || record.origin.kind === input.select.origin));
    requireThat(targets.length, 'select matches no follow-up');
  }
  const decided = [], skipped = [];
  for (const record of targets) {
    if (record.status === 'fixed') { skipped.push({ id: record.id, reason: 'fixed' }); continue; }
    if (authority.kind === POLICY_DEFAULT && record.decision?.authorityKind === 'human-confirmed') { skipped.push({ id: record.id, reason: 'human-decided' }); continue; }
    if (input.defaults && record.status !== 'undecided') { skipped.push({ id: record.id, reason: 'decided' }); continue; }
    const decision = input.decision ?? defaultDecision(record);
    if (!decision) { skipped.push({ id: record.id, reason: 'no-default' }); continue; }
    decided.push({ record, decision });
  }
  if (!decided.length) return { decided: [], skipped, event: null };
  // File every new-work issue before writing: a failure records nothing, and a
  // retry reuses created issues through their marker.
  const run = gh ?? core.runtime.gh ?? (await import('./actions.js')).gh;
  const rows = [];
  for (const { record, decision } of decided) {
    let tracking = null;
    if (decision === 'new-work') {
      try { tracking = await fileIssue(core, state, record, input.pr, run); }
      catch (error) { throw new Error(`Filing follow-up ${record.id} as new work failed; nothing was recorded: ${error.message}`); }
    }
    rows.push({ id: record.id, decision, ...(tracking ? { tracking } : {}) });
  }
  const payload = { authority, reason: input.reason, decisions: rows, ...(input.pr ? { pr: input.pr } : {}) };
  const recorded = await core.append(state, 'FOLLOW_UP_DECIDED', payload, operation);
  // The decision is recorded; a failed regeneration of the view is reported,
  // and followup.render retries it.
  const rendered = await renderFollowUps(core).catch(error => ({ error: `follow-ups.md was not regenerated: ${error.message}; run followup.render` }));
  return { decided: rows, skipped, event: recorded.event, rendered };
}

// follow-ups.md (spec AC7): generated, never hand-edited.
const cell = value => String(value ?? '').replace(/\s+/gu, ' ').trim();
function renderRecord(record) {
  const origin = record.origin.kind === 'review'
    ? `review ${cell(record.origin.provider)} ${cell(record.origin.model)}${record.origin.round ? `, round ${record.origin.round}` : ''}${record.origin.reviewScope ? ` (${cell(record.origin.reviewScope)})` : ''}, finding \`${cell(record.origin.findingId)}\``
    : `${record.origin.kind} ${cell(record.origin.vulnId)} ${cell(record.origin.package)}@${cell(record.origin.version)} in \`${cell(record.origin.manifest)}\` (pre-existing)`;
  const lines = [`### \`${record.id}\` (${record.finding.severity}): ${cell(record.finding.class) || 'unclassified'}`, '',
    `- **Repository:** \`${cell(record.repository)}\``, `- **Origin:** ${origin}`, `- **Why it did not block:** ${record.reason}`,
    ...(record.finding.path ? [`- **Path:** \`${cell(record.finding.path)}\``] : []),
    `- **Failure scenario:** ${cell(record.finding.failureScenario) || 'none recorded'}`];
  if (record.decision) {
    const tracking = record.decision.tracking?.reference ? ` (${record.decision.tracking.reference}${record.decision.tracking.reused ? ', reused' : ''})` : '';
    lines.push(`- **Decision:** ${record.decision.decision} by ${record.decision.authorityKind}${tracking}: ${cell(record.decision.reason)}`);
  }
  if (record.reopened && record.status === 'undecided') lines.push('- **Reopened:** a later review reported it again after it was fixed.');
  return lines.join('\n');
}
// The title carries no feature ID: a branch name can name a client, and this
// file is committed.
export function followUpsMarkdown(summary) {
  const { records } = summary, incomplete = summary.unavailable.length > 0;
  const empty = incomplete ? 'None known (the list is incomplete).' : 'None.';
  const section = (title, rows) => [`## ${title}`, '', ...(rows.length ? rows.map(renderRecord).flatMap(text => [text, '']) : [empty, ''])];
  const counts = Object.entries(summary.counts.byStatus).map(([key, count]) => `${count} ${key}`).join(', ');
  return ['# Follow-ups', '', '<!-- Generated by GateReeve from the run\'s workflow records. Do not edit: changes are overwritten. Decide follow-ups with followup.decide. -->', '',
    incomplete ? `${records.length} known follow-up(s)${counts ? `: ${counts}` : ''}; the list is incomplete.` : `${records.length} follow-up(s): ${counts || 'none'}.`, '',
    // A count only: read errors can name local store paths (gatereeve status has the detail).
    ...(summary.unavailable.length ? [`**Unavailable:** ${summary.unavailable.length} unreadable review record(s); their follow-ups are unknown until restored (see gatereeve status).`, ''] : []),
    ...section('Undecided', records.filter(row => row.status === 'undecided')),
    ...section('Decided', records.filter(row => ['accepted-risk', 'new-work', 'rejected'].includes(row.status))),
    ...section('Fixed', records.filter(row => row.status === 'fixed')),
    ...section('Seeds for the next feature', records.filter(row => row.decision?.tracking?.kind === 'seed'))].join('\n').trimEnd() + '\n';
}
export async function renderFollowUps(core) {
  const { state, events } = await core.state();
  const found = await followUpRecords(core, events);
  const summary = followUpSummary({ ...found, records: await redactedRecords(core, state, found.records, featureHomeRepository(core)) });
  const path = join(core.context.featureHome, FOLLOW_UPS_FILE);
  try { requireThat(!(await lstat(path)).isSymbolicLink(), `${FOLLOW_UPS_FILE} must not be a symbolic link`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o644);
  try { await handle.writeFile(followUpsMarkdown(summary)); } finally { await handle.close(); }
  return { path, count: summary.records.length, undecided: summary.undecided };
}

// The PR summary section (spec AC8): every follow-up, accepted lows included.
export function followUpLines(summary, inline = cell) {
  const lines = ['', '**Follow-ups**'];
  if (summary.unavailable.length) lines.push(`- **Unavailable:** ${summary.unavailable.length} unreadable review record(s); their follow-ups are unknown and Completion refuses until they are restored.`);
  if (!summary.records.length) { if (!summary.unavailable.length) lines.push('- This run has no follow-ups.'); return lines; }
  for (const record of summary.records) {
    const tracking = record.decision?.tracking?.reference ? ` — ${record.decision.tracking.reference}` : '';
    lines.push(`- \`${record.id}\` ${record.finding.severity} ${record.status}${record.decision ? ` (${record.decision.authorityKind})` : ''}: ${inline(record.finding.class ?? record.origin.kind)}${tracking}`);
  }
  return lines;
}
