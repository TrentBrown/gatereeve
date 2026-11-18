import { identity, requireThat } from './contracts.js';
import { reviewerSelection, modelProvider } from './reviewer-selection.js';
import { executeGates } from './execution.js';

export async function selectReviewers(core, input, operation) {
  const { state } = await core.state();
  requireThat(!state.paused && ['IMPLEMENTING', 'ACCEPTING'].includes(state.phase), 'Select reviewers within the authorized implementation phase');
  requireThat((await core.check('implementation')).allowed, 'Current implementation authorization is required');
  const selection = reviewerSelection(input);
  if (state.reviewerSelection) {
    requireThat(input.previous === state.reviewerSelection.event, 'Replacing reviewers must identify the current selection');
    requireThat(state.dials.autonomy.value === 'autonomous' || !state.reviewerSelection.selection.instruction || input.instruction,
      'Replacing user-pinned reviewers needs explicit developer direction outside autonomous mode');
  } else requireThat(!input.previous, 'No previous reviewer selection exists');
  return core.append(state, 'REVIEWERS_SELECTED', { selection }, operation);
}

// Each perspective is an ordinary independently qualified result. A pair is
// derived from both perspectives, never from an implementer-authored PASS.
export async function boundaryReviews(core, state, candidate, memo = new Map(), { allowIncomplete = false } = {}) {
  const selected = state.reviewerSelection;
  requireThat(selected?.selection?.reviewers?.length === 2, 'Two boundary reviewers must be selected (review.select)');
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
        const material = new Map((result.findings ?? []).filter(finding => finding.blocking).map(finding => [finding.id, finding]));
        const present = (result.dispositions ?? []).filter(disposition => disposition.status === 'present' && !material.has(disposition.id));
        if (present.length) {
          const key = `review-findings:${state.runId}:${state.eventCount}`;
          if (!memo.has(key)) memo.set(key, (async () => {
            const known = new Map();
            for (const reference of state.results) {
              let report; try { report = await core.store.json(reference); } catch { continue; }
              if (report.gate === 'review') for (const finding of report.findings ?? []) known.set(finding.id, finding);
            }
            return known;
          })());
          const known = await memo.get(key);
          for (const disposition of present) {
            const original = known.get(disposition.id);
            requireThat(original, 'A present finding needs retained identity and current reviewer evidence');
            if (original.blocking) material.set(disposition.id, { ...original, evidence: disposition.evidence });
          }
        }
        found = { ref, result, receipt, reviewer, qualification, materialFindings: [...material.values()] };
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
  const contexts = members.map(member => member.receipt.evaluator?.contextId).filter(Boolean);
  requireThat(new Set(contexts).size === contexts.length, 'Boundary reviewers must use separate fresh contexts');
  const outcome = members.some(member => member.result.outcome === 'FAIL') ? 'FAIL'
    : members.every(member => member.result.outcome === 'PASS' && !member.qualification) ? 'PASS' : 'UNAVAILABLE';
  return { selection: selected, members, outcome, identity: identity({ selection: selected.event, results: members.map(member => member.ref?.hash ?? null) }),
    summary: members.map(member => `${member.reviewer.modelProvider}: ${member.result.outcome}: ${member.result.summary}`).join('\n') };
}

export async function executeBoundaryReviews(core, input, operation) {
  requireThat(input && Object.keys(input).every(key => ['consumed', 'history', 'claims', 'coverageClaims', 'prior', 'configuration'].includes(key)), 'Unsupported boundary review input');
  const baseline = await core.state();
  const { state } = baseline;
  const selected = state.reviewerSelection;
  requireThat(selected?.selection?.reviewers?.length === 2, 'Select two available reviewers with review.select first');
  const priors = input.prior ?? {};
  requireThat(Object.keys(priors).every(provider => selected.selection.reviewers.some(row => row.provider === provider)), 'Delta prior names an unselected provider');
  const configuration = input.configuration ?? {};
  requireThat(!['provider', 'model', 'reasoningEffort', 'reviewerSelection'].some(key => Object.hasOwn(configuration, key)), 'Review identities come from the recorded selection');
  const outcomes = await Promise.allSettled(selected.selection.reviewers.map((reviewer, slot) => {
    const { modelProvider: family, reason, ...execution } = reviewer;
    const request = { gates: ['review'], configuration: { ...configuration, ...execution, reviewerSelection: selected.event },
      ...Object.fromEntries(['consumed', 'history', 'claims', 'coverageClaims'].filter(key => input[key] !== undefined).map(key => [key, input[key]])),
      ...(priors[reviewer.provider] ? { prior: priors[reviewer.provider] } : {}) };
    return executeGates(core, request, { id: `review_${identity([operation.id, slot]).slice(7)}`, hash: identity({ operation, request }) }, baseline);
  }));
  const current = (await core.state()).state;
  requireThat(current.candidate?.hash === state.candidate?.hash && current.reviewerSelection?.event === selected.event,
    'Candidate or reviewer selection changed during boundary execution; results remain retained');
  return core.append(current, 'BOUNDARY_REVIEWED', { candidate: state.candidate, selection: selected.event,
    outcomes: outcomes.map((outcome, slot) => ({ provider: selected.selection.reviewers[slot].provider,
      ...(outcome.status === 'fulfilled' ? { status: 'completed', results: outcome.value.event?.payload.results ?? outcome.value.results ?? [] }
        : { status: 'unavailable', reason: outcome.reason?.message ?? String(outcome.reason) }) })) }, operation);
}
