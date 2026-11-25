import { identity, requireThat, autonomousValue } from './contracts.js';
import { reviewerSelection, modelProvider } from './reviewer-selection.js';
import { executeGates, changedPaths, findingSeverity, severityRank } from './execution.js';
import { contentIdentity } from './evidence.js';
import { findingObligations, retainedReviewScope } from './review-findings.js';
import { boundaryScope, scheduledRound, currentRevision, assertRoundOpen, scheduledBlocking, roundHandBack, roundDecision, NARROW_FROM, ROUND_POLICY } from './round-policy.js';
import { isGoal } from './delegation.js';

// The schedule for the current revision of its scope (spec AC6). Regressions
// of the previous fix are new findings on paths that fix changed.
// Paths each counted revision changed relative to the revision of the round
// before it, keyed by that revision's candidate hash. A finding is a
// regression of the previous fix when it is on such a path in the round it was
// raised, and it keeps that status in later rounds until it is resolved.
async function regressionPathsByCandidate(core, state, scope) {
  const revisions = state.reviewScopes?.[scope]?.revisions ?? [], paths = new Map();
  for (const [index, row] of revisions.entries()) {
    const before = revisions[index - 1];
    if (!row.candidate || !before?.candidate) continue;
    try { paths.set(row.candidate.hash, new Set(changedPaths(await core.store.json(before.candidate), await core.store.json(row.candidate)))); }
    catch { /* An unreadable revision gives no regression evidence; such findings read as non-regressions. */ }
  }
  return paths;
}
async function roundSchedule(core, state, candidate) {
  // Only the scope's latest revision keeps its counted round. Any other
  // revision, never counted or restored from an earlier round, is reviewed as
  // the next round, so retained proof of an earlier revision cannot qualify
  // past the round 6 hand-back. Null only with no round under this policy.
  const scope = boundaryScope(candidate), round = scheduledRound(state, scope, contentIdentity(candidate));
  const byCandidate = round !== null && round >= NARROW_FROM ? await regressionPathsByCandidate(core, state, scope) : new Map();
  const revisions = state.reviewScopes?.[scope]?.revisions ?? [];
  const current = currentRevision(state, scope, contentIdentity(candidate)) ? revisions.at(-1)?.candidate?.hash : null;
  let regressionPaths = byCandidate.get(current) ?? new Set();
  // An uncounted revision's regressions are measured against the last counted one.
  if (!current && round !== null && round >= NARROW_FROM && revisions.at(-1)?.candidate) {
    try { regressionPaths = new Set(changedPaths(await core.store.json(revisions.at(-1).candidate), candidate)); } catch { /* no regression evidence */ }
  }
  return { scope, round, regressionPaths, handBack: roundHandBack(state, scope, round, isGoal(state)),
    // `origin` is the candidate hash of the review that raised a prior finding.
    blocks: (finding, prior, origin) => scheduledBlocking(finding, { round,
      regression: prior ? Boolean(origin && byCandidate.get(origin)?.has(finding.path)) : regressionPaths.has(finding.path) }) };
}
// Spec AC9: the Verification a round consumes needs at least one runner receipt
// executed on the candidate tree. Consumed proof is already qualified as current
// for this candidate's content, so its receipts ran on this tree.
async function consumedReceipts(core, inputs) {
  let count = 0;
  for (const ref of inputs.consumed ?? []) {
    try {
      const report = await core.store.json(ref);
      if (report.gate !== 'verification' || !report.runner) continue;
      count += ((await core.store.json(report.runner)).receipts ?? []).filter(item => item.outcome === 'PASS').length;
    } catch { /* Unreadable proof contributes no receipt. */ }
  }
  return count;
}

async function initialPeerReport(core, ref, selected, candidate) {
  const report = await core.store.json(ref);
  if (report.gate !== 'review') return false;
  const scope = await retainedReviewScope(core, report);
  if (!scope || scope.reviewerSelection === selected.event) return true;
  return selected.selection.reviewers.some(row => row.provider === scope.provider && row.model === scope.model)
    && scope.contentIdentity === contentIdentity(candidate);
}

async function initialRound(core, state, selected, memo) {
  const key = `initial-round:${state.runId}:${state.eventCount}:${selected.event}`;
  if (!memo.has(key)) memo.set(key, (async () => {
    for (const round of state.boundaryReviewHistory) {
      if (round.selection !== selected.event || !round.round || round.outcomes.length !== 2) continue;
      const started = state.reviewRounds.find(event => event.event === round.round);
      if (!started || started.selection !== selected.event) continue;
      const members = [];
      for (const reviewer of selected.selection.reviewers) {
        const outcome = round.outcomes.find(row => row.provider === reviewer.provider);
        const ref = outcome?.results?.[0];
        if (outcome?.status !== 'completed' || !ref) break;
        try {
          await core.store.closure(ref);
          const { result, receipt } = await core.recordedResult(ref, state);
          const input = await core.store.json(result.input);
          if (result.gate !== 'review' || !['PASS', 'FAIL'].includes(result.outcome) || result.unvalidatedVerdict
            || input.reviewRound !== round.round || input.candidate.hash !== started.candidate.hash
            || input.configuration.reviewerSelection !== selected.event || input.configuration.provider !== reviewer.provider
            || input.configuration.model !== reviewer.model || receipt.evaluator?.reasoningEffort !== reviewer.reasoningEffort
            || receipt.evaluator?.freshContext !== true || receipt.evaluator.inheritedTurns !== 0
            || state.implementers.includes(receipt.evaluator.contextId)
            || modelProvider(receipt.evaluator.provider) !== reviewer.modelProvider) break;
          const candidate = await core.store.json(input.candidate);
          let exposed = false;
          for (const previous of input.history ?? []) if (await initialPeerReport(core, previous, selected, candidate)) { exposed = true; break; }
          if (exposed) break;
          members.push({ input, receipt, ref });
        } catch { break; }
      }
      if (members.length === 2 && members[0].receipt.evaluator.contextId !== members[1].receipt.evaluator.contextId
        && identity(members[0].input.consumed) === identity(members[1].input.consumed)
        && identity(members[0].input.history) === identity(members[1].input.history)) {
        try { await core.store.closure(started.baseline); }
        catch { continue; } // Lost context is no proof; a fresh round may replace it.
        return { event: round.round, baseline: started.baseline, reviews: members.map(member => member.ref) };
      }
    }
    return null;
  })());
  return memo.get(key);
}


// When the paired reviewers rate the same finding class differently, the
// higher rating is the qualifying one (AC3, D8). Keyed by classId.
export function pairedSeverities(members) {
  const classes = new Map();
  for (const member of members) for (const finding of member.result?.findings ?? []) {
    if (typeof finding?.classId !== 'string') continue;
    const severity = findingSeverity(finding);
    const row = classes.get(finding.classId) ?? { classId: finding.classId, severity, ratings: [] };
    row.ratings.push({ provider: member.reviewer.provider, findingId: finding.id, severity });
    if (severityRank(severity) > severityRank(row.severity)) row.severity = severity;
    classes.set(finding.classId, row);
  }
  return [...classes.values()].map(row => ({ ...row, disagreement: new Set(row.ratings.map(item => item.severity)).size > 1 }));
}

export async function selectReviewers(core, input, operation) {
  const { state } = await core.state();
  requireThat(!state.paused && ['IMPLEMENTING', 'ACCEPTING'].includes(state.phase), 'Select reviewers within the authorized implementation phase');
  requireThat((await core.check('implementation')).allowed, 'Current implementation authorization is required');
  const selection = reviewerSelection(input, core.context.repository?.reviewerPreferences);
  if (state.reviewerSelection) {
    requireThat(input.previous === state.reviewerSelection.event, 'Replacing reviewers must identify the current selection');
    requireThat(autonomousValue(state.dials.autonomy.value) || !state.reviewerSelection.selection.instruction || input.instruction,
      'Replacing user-pinned reviewers needs explicit developer direction outside autonomous mode');
  } else requireThat(!input.previous, 'No previous reviewer selection exists');
  return core.append(state, 'REVIEWERS_SELECTED', { selection }, operation);
}

// Each perspective is an ordinary independently qualified result. A pair is
// derived from both perspectives, never from an implementer-authored PASS.
export async function boundaryReviews(core, state, candidate, memo = new Map(), { allowIncomplete = false } = {}) {
  const selected = state.reviewerSelection;
  requireThat(selected?.selection?.reviewers?.length === 2, 'Two boundary reviewers must be selected (review.select)');
  const schedule = await roundSchedule(core, state, candidate);
  const members = [];
  for (const reviewer of selected.selection.reviewers) {
    let found = null;
    for (const ref of [...state.results].reverse()) {
      let report, inputs;
      try {
        report = await core.store.json(ref);
        if (report.gate !== 'review') continue;
        inputs = await core.store.json(report.input);
      } catch { continue; }
      if (inputs.configuration.reviewerSelection !== selected.event
        || inputs.configuration.provider !== reviewer.provider || inputs.configuration.model !== reviewer.model
        || (inputs.configuration.reasoningEffort ?? 'high') !== reviewer.reasoningEffort) continue;
      // Do not reach behind a current failure or unavailable assessment for
      // this perspective. A stale candidate may have older applicable proof.
      try {
        let result, qualification = null;
        try { result = await core.currentResult(ref, candidate, state, new Set(), memo); }
        catch (error) {
          if (!error.message.startsWith('Newer blocking review requires')) throw error;
          result = await core.currentResult(ref, candidate, state, new Set(), memo, true, true);
          qualification = error.message;
        }
        const receipt = await core.store.json(result.receipt);
        requireThat(result.outcome === 'UNAVAILABLE' || modelProvider(receipt.evaluator?.provider) === reviewer.modelProvider,
          'Reviewer model provider differs from the selected perspective');
        const obligations = await findingObligations(core, state, candidate, inputs, result, schedule.blocks);
        if (result.outcome === 'PASS' && obligations.unreconciledFindings.length) qualification ??= 'Prior withheld findings require follow-up reconciliation';
        // Rounds 4-5: a FAIL explained only by demoted findings stops blocking;
        // demoted findings stay visible on the member.
        const raised = [...(result.findings ?? []).filter(finding => finding.blocking),
          ...(result.dispositions ?? []).filter(row => row.status === 'present').map(row => obligations.knownFindings.get(row.id)).filter(finding => finding?.blocking)];
        const demoted = raised.filter(finding => !obligations.materialFindings.some(row => row.id === finding.id)).map(finding => finding.id);
        // Reviewers receive the round and band (packet.roundPolicy) and apply
        // it themselves. The mechanical demotion only corrects a blocking flag
        // the band no longer allows: it applies when the FAIL rests on demoted
        // findings alone, with every criterion, responsibility and coverage
        // decision passing. Any failed row keeps the reviewer's FAIL, so an
        // unrelated finding never excuses an independent failure.
        const demotedRows = raised.filter(finding => demoted.includes(finding.id));
        const explained = demotedRows.length > 0
          && ['criteria', 'dimensions', 'coverageDecisions'].every(key => (result[key] ?? []).every(row => row.outcome === 'PASS'));
        const outcome = result.outcome === 'FAIL' && schedule.round >= NARROW_FROM && explained && !obligations.materialFindings.length
          && !obligations.unreconciledFindings.length && result.coverage?.complete === true && !result.coverage.limitations?.length
          && (!result.mandateAssessment || result.mandateAssessment.outcome === 'PASS') ? 'PASS' : result.outcome;
        if (result.outcome !== 'UNAVAILABLE' && !await consumedReceipts(core, inputs)) qualification ??= 'The consumed Verification has no runner receipt on the candidate tree';
        if (schedule.handBack) qualification ??= schedule.handBack;
        const changes = result.mode === 'delta' ? changedPaths(await core.store.json(result.priorCandidate), candidate) : null;
        const incompleteDelta = Boolean(changes && (!changes.every(path => result.coverage.paths.includes(path)) || !result.coverage.interactions.length));
        found = { ref, result, receipt, reviewer, qualification, ...obligations, incompleteDelta, outcome, demotedFindings: [...new Set(demoted)] };
        break;
      } catch (error) {
        // Matching exact candidate results that fail qualification are a proof
        // gap, not permission to publish an earlier clean assessment.
        if (inputs.candidate.hash === state.candidate?.hash) throw error;
      }
    }
    if (!found && allowIncomplete) found = { ref: null, result: { gate: 'review', outcome: 'UNAVAILABLE', summary: 'No current native review receipt is available.', findings: [] }, receipt: {}, reviewer, qualification: 'missing' };
    requireThat(found, `Missing current boundary review from ${reviewer.modelProvider}`);
    members.push(found);
  }
  requireThat(new Set(members.map(member => member.reviewer.modelProvider)).size === 2, 'Boundary review needs distinct model providers');
  // Rounds 4-5: a concurrent peer FAIL that the schedule demotes to PASS is not
  // newer blocking evidence against this member's PASS. Only that exact peer
  // is excused: any other later review result keeps the qualification.
  if (schedule.round !== null && schedule.round >= NARROW_FROM) for (const member of members) {
    if (!member.ref || !member.qualification?.startsWith('Newer blocking review requires')) continue;
    const peer = members.find(other => other !== member && other.ref);
    if (!peer || peer.result.outcome !== 'FAIL' || peer.outcome !== 'PASS' || peer.qualification) continue;
    const position = ref => state.results.findIndex(item => item.hash === ref.hash);
    const later = state.results.slice(position(member.ref) + 1);
    let others = false;
    for (const ref of later) {
      if (ref.hash === peer.ref.hash) continue;
      try { if ((await core.store.json(ref)).gate === 'review') { others = true; break; } } catch { others = true; break; }
    }
    if (!others) member.qualification = null;
  }
  const contexts = members.map(member => member.receipt.evaluator?.contextId).filter(Boolean);
  requireThat(new Set(contexts).size === contexts.length, 'Boundary reviewers must use separate fresh contexts');
  const initial = await initialRound(core, state, selected, memo);
  requireThat(initial || allowIncomplete || state.boundaryReviewHistory.some(round => round.selection === selected.event && round.round),
    'A coordinated independent initial review round is required (review.execute); serial individual reviews cannot establish it');
  if (!initial) for (const member of members) member.qualification ??= 'Coordinated initial independence is not established';
  const effective = member => member.outcome ?? member.result.outcome;
  const outcome = members.some(member => effective(member) === 'FAIL') ? 'FAIL'
    : members.every(member => effective(member) === 'PASS' && !member.qualification) ? 'PASS' : 'UNAVAILABLE';
  const severities = pairedSeverities(members);
  return { selection: selected, members, outcome, severities, initialEstablished: Boolean(initial), initialProof: initial,
    round: { scope: schedule.scope, round: schedule.round, handBack: schedule.handBack, decision: roundDecision(state, schedule.scope) },
    identity: identity({ selection: selected.event, results: members.map(member => member.ref?.hash ?? null) }),
    summary: members.map(member => `${member.reviewer.modelProvider}: ${member.result.outcome}${effective(member) !== member.result.outcome ? ` (${effective(member)} under the round ${schedule.round} schedule; demoted: ${member.demotedFindings.join(', ')})` : ''}: ${member.result.summary}${member.unreconciledFindings?.length ? ` Unreconciled prior findings: ${member.unreconciledFindings.join(', ')}.` : ''}${member.incompleteDelta ? ' Changed-path or interaction coverage is incomplete.' : ''}`).join('\n') };
}

export async function executeBoundaryReviews(core, input, operation) {
  requireThat(input && Object.keys(input).every(key => ['consumed', 'history', 'claims', 'coverageClaims', 'prior', 'configuration'].includes(key)), 'Unsupported boundary review input');
  const currentView = await core.state();
  const { state } = currentView;
  const selected = state.reviewerSelection;
  requireThat(selected?.selection?.reviewers?.length === 2, 'Select two available reviewers with review.select first');
  const priors = input.prior ?? {};
  requireThat(Object.keys(priors).every(provider => selected.selection.reviewers.some(row => row.provider === provider)), 'Delta prior names an unselected provider');
  const configuration = input.configuration ?? {};
  requireThat(!['provider', 'model', 'reasoningEffort', 'reviewerSelection'].some(key => Object.hasOwn(configuration, key)), 'Review identities come from the recorded selection');
  const begin = { id: `round_${identity(operation.id).slice(7)}`, hash: identity({ operation }) };
  // Past round 6 a new revision is not reviewed until the human decides (AC6).
  const reviewed = await core.store.json(state.candidate);
  const roundPolicy = { policy: ROUND_POLICY, scope: boundaryScope(reviewed), revision: contentIdentity(reviewed) };
  assertRoundOpen(state, roundPolicy.scope, roundPolicy.revision, isGoal(state));
  const initialEstablished = Boolean(await initialRound(core, state, selected, new Map()));
  let round = currentView.events.find(event => event.operation.id === begin.id);
  if (!round) {
    let historyState = state;
    const withheld = [];
    if (!initialEstablished) {
      const candidate = await core.store.json(state.candidate), results = [];
      for (const ref of state.results) {
        let peer = false;
        try { peer = await initialPeerReport(core, ref, selected, candidate); } catch { /* Historical losses stay visible through normal history-gap handling. */ }
        (peer ? withheld : results).push(ref);
      }
      for (const ref of input.history ?? []) requireThat(!withheld.some(row => row.hash === ref.hash), 'Initial independence requires withholding peer reports, including explicit history');
      const peerFindings = new Set();
      for (const ref of withheld) for (const finding of (await core.store.json(ref)).findings ?? []) peerFindings.add(finding.id);
      requireThat(!(input.claims ?? []).some(claim => peerFindings.has(claim.findingId)) && !Object.keys(priors).length,
        'Peer-finding claims and per-provider deltas follow the independent initial round');
      historyState = { ...state, results };
    }
    // Context can contain historical losses. Retain its exact bytes without
    // promoting every old reference into a new mandatory proof dependency.
    const baseline = await core.store.put(JSON.stringify({ kind: 'boundary-review-baseline', state: historyState }));
    round = (await core.append(state, 'REVIEW_ROUND_STARTED', { baseline, withheld, candidate: state.candidate, selection: selected.event }, begin)).event;
  }
  requireThat(round.operation.hash === begin.hash && round.payload.candidate.hash === state.candidate?.hash
    && round.payload.selection === selected.event, 'The interrupted review round belongs to different inputs; select a new operation');
  const retained = await core.store.json(round.payload.baseline);
  requireThat(retained.kind === 'boundary-review-baseline' && retained.state.runId === state.runId, 'Invalid retained review baseline');
  const baseline = { state: retained.state, events: currentView.events, round: round.hash,
    initialEstablished };
  const outcomes = await Promise.allSettled(selected.selection.reviewers.map(async (reviewer, slot) => {
    const { modelProvider: _family, reason: _reason, ...execution } = reviewer;
    const request = { gates: ['review'], configuration: { ...configuration, ...execution, reviewerSelection: selected.event },
      ...Object.fromEntries(['consumed', 'history', 'claims', 'coverageClaims'].filter(key => input[key] !== undefined).map(key => [key, input[key]])),
      ...(priors[reviewer.provider] ? { prior: priors[reviewer.provider] } : {}) };
    const first = await executeGates(core, request,
      { id: `review_${identity([operation.id, slot]).slice(7)}`, hash: identity({ operation, request }) }, baseline);
    const reference = (first.event?.payload.results ?? first.results)?.[0];
    // Exactly one automatic repair turn per reviewer, either provider (AC5).
    // It reuses the round's baseline, so it is not a further round.
    if (!reference) return first;
    const verdict = await core.store.json(reference);
    if (!verdict.invalidVerdictContract) return first;
    const correction = verdict.unvalidatedVerdict ? { ...request, repair: reference } : request;
    const retry = { id: `review_retry_${identity([operation.id, slot]).slice(7)}`, hash: identity({ operation, correction }) };
    return executeGates(core, correction, retry, { ...baseline, events: (await core.state()).events });
  }));
  const current = (await core.state()).state;
  requireThat(current.candidate?.hash === state.candidate?.hash && current.reviewerSelection?.event === selected.event,
    'Candidate or reviewer selection changed during boundary execution; results remain retained');
  return core.append(current, 'BOUNDARY_REVIEWED', { candidate: state.candidate, selection: selected.event, round: round.hash, roundPolicy,
    outcomes: outcomes.map((outcome, slot) => ({ provider: selected.selection.reviewers[slot].provider,
      ...(outcome.status === 'fulfilled' ? { status: 'completed', results: outcome.value.event?.payload.results ?? outcome.value.results ?? [] }
        : { status: 'unavailable', reason: outcome.reason?.message ?? String(outcome.reason) }) })) }, operation);
}
