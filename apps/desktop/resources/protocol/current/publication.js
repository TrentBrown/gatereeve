import { requireThat, latestImplementation, currentDesignApproval } from './contracts.js';
import { checkCandidate, briefBased } from './evidence.js';
import { configuredGit } from './authorization.js';
import { gh, remoteName } from './actions.js';
import { boundaryReviews } from './boundary-review.js';
import { currentAdjudication } from './autonomous.js';
import { finalHandoff } from './final-handoff.js';

// The independent review summary is published into a delimited section of the
// PR description (spec AC6/R9). The section is rendered deterministically from
// the current qualifying review result for the candidate head, so verification
// compares the published bytes with a fresh rendering.
export const SUMMARY_START = '<!-- gatereeve:review-summary:start -->';
export const SUMMARY_END = '<!-- gatereeve:review-summary:end -->';
const BODY_LIMIT = 65536; // GitHub's PR description limit in characters.

const occurrences = (text, marker) => text.split(marker).length - 1;
const normalize = text => String(text ?? '').replace(/\r\n/gu, '\n');
// Model-authored text cannot forge or close the delimited section.
const inline = value => normalize(value).replace(/<!--/gu, '&lt;!--').replace(/-->/gu, '--&gt;').replace(/\s+/gu, ' ').trim();
const block = value => normalize(value).replace(/<!--/gu, '&lt;!--').replace(/-->/gu, '--&gt;').trim();

// The latest review result that qualifies for the current candidate, whatever
// its outcome: the same selection the acceptance gate makes. A newer
// UNAVAILABLE result is published as UNAVAILABLE; an older PASS or FAIL is
// never presented in its place.
export async function currentReview(core, state, candidate) {
  let pair;
  try { pair = await boundaryReviews(core, state, candidate, new Map(), { allowIncomplete: true }); }
  catch { return null; }
  const adjudication = pair.members.every(member => member.ref) ? await currentAdjudication(core, state, pair) : null;
  const active = [latestImplementation(state), candidate.requirements?.['design.md'] ? currentDesignApproval(state, candidate.requirements['design.md'].hash) : null];
  const planningJudgments = [...new Map(active.filter(item => item?.authority?.basis === 'autonomous-judgment').map(item => [item.event, item])).values()];
  const ref = await core.store.putJson({ kind: 'boundary-review-summary', candidate: state.candidate,
    pair: pair.identity, selection: pair.selection, reviews: pair.members.map(member => member.ref), initialProof: pair.initialProof, outcome: pair.outcome, adjudication, planningJudgments });
  return { ref, pair, adjudication, planningJudgments, result: { outcome: pair.outcome, summary: pair.summary }, receipt: {} };
}
const OUTCOME_NOTE = {
  PASS: '',
  FAIL: '',
  UNAVAILABLE: ' (the latest independent review reached no conclusion; this is not a PASS, and no earlier result is shown in its place)',
};
export function renderSummary({ candidateRef, candidate, pin, review }) {
  if (review.pair) {
    const { pair, adjudication } = review;
    const lines = [SUMMARY_START, '### GateReeve independent reviews', '',
      `- **Outcome:** ${pair.outcome}${adjudication ? ' — autonomous adjudication accepts the documented residual risk; original reviewer verdicts are preserved' : ''}`,
      `- **Reviewed head:** \`${pin.alias}\` \`${pin.head}\` (base \`${pin.base}\`, target \`${pin.target}\`)`,
      `- **Candidate:** \`${candidateRef.hash}\` (${candidate.scope}; ${briefBased(candidate) ? 'light rigor, brief basis' : 'full rigor, rubric basis'})`,
      `- **Selection:** ${inline(pair.selection.selection.reason)}`];
    for (const entry of pair.selection.selection.preferenceEvidence ?? []) {
      for (const skipped of entry.skipped) lines.push(`- **${inline(entry.provider)} preference skipped:** ${inline(skipped.model)} — ${inline(skipped.reason)}`);
      if (entry.basis === 'agent-judgment') lines.push(`- **${inline(entry.provider)} fallback:** ${inline(entry.reason)}`);
    }
    for (const member of pair.members) {
      lines.push('', `**${inline(member.reviewer.modelProvider)} — ${inline(member.reviewer.model)} (${inline(member.reviewer.reasoningEffort)} effort): ${member.result.outcome}**`,
        `- **Evidence:** ${member.ref ? `\`${member.ref.hash}\`` : 'UNAVAILABLE — no current receipt'}`,
        `- **Fresh context:** ${member.receipt.evaluator?.contextId ? `\`${inline(member.receipt.evaluator.contextId)}\`` : 'UNAVAILABLE'}`,
        block(member.result.summary));
      for (const dimension of member.result.dimensions ?? []) lines.push(`- ${inline(dimension.name)}: ${inline(dimension.outcome)} — ${inline(dimension.evidence)}`);
      for (const criterion of member.result.criteria ?? []) lines.push(`- ${inline(criterion.id)}: ${inline(criterion.outcome)} — ${inline(criterion.evidence)}`);
      if (member.result.mandateAssessment) lines.push(`- **Mandate assessment:** ${inline(member.result.mandateAssessment.outcome)} — ${inline(member.result.mandateAssessment.evidence)}`);
      for (const finding of member.result.findings ?? []) lines.push(`- ${finding.blocking ? 'Blocking' : 'Nonblocking'} \`${inline(finding.id)}\` (${inline(finding.criterion)}, \`${inline(finding.path)}\`): ${inline(finding.evidence)}`);
      for (const disposition of member.result.dispositions ?? []) lines.push(`- Finding \`${inline(disposition.id)}\`: ${inline(disposition.status)} — ${inline(disposition.evidence)}`);
      if (member.unreconciledFindings?.length) lines.push(`- **Unreconciled prior findings:** ${member.unreconciledFindings.map(inline).join(', ')}`);
      if (member.incompleteDelta) lines.push('- **Incomplete delta:** changed-path or interaction coverage is missing.');
      if (member.qualification) lines.push(`- **Qualification limit:** ${inline(member.qualification)}`);
    }
    if (adjudication) {
      lines.push('', '**Autonomous adjudication**', block(adjudication.reason));
      if (adjudication.stopReason) lines.push(`- **Iteration stopping reason:** ${inline(adjudication.stopReason)}`);
      if (adjudication.mandateRebuttal) {
        lines.push(`- **Agent mandate rebuttal:** ${inline(adjudication.mandateRebuttal.goalEvidence)}`);
        for (const constraint of adjudication.mandateRebuttal.constraints) lines.push(`- Fixed constraint ${constraint.index}: ${inline(constraint.evidence)}`);
      }
      for (const disposition of adjudication.dispositions) lines.push(`- \`${inline(disposition.findingId)}\` ${inline(disposition.outcome)}: ${inline(disposition.reason)} Evidence: ${inline(disposition.evidence)} Residual risk: ${inline(disposition.residualRisk)}`);
    }
    for (const decision of review.planningJudgments ?? []) {
      lines.push('', '**Autonomous planning judgment**', `- **Original independent planning outcome:** ${inline(decision.authority.evaluation.outcome)}`,
        block(decision.authority.evaluation.summary), block(decision.authority.judgment.reason));
      for (const finding of decision.authority.evaluation.findings ?? []) lines.push(`- Original finding \`${inline(finding.id)}\`: ${inline(finding.evidence)}`);
      for (const disposition of decision.authority.judgment.dispositions) lines.push(`- \`${inline(disposition.findingId)}\` ${inline(disposition.outcome)}: ${inline(disposition.reason)} Evidence: ${inline(disposition.evidence)} Residual risk: ${inline(disposition.residualRisk)}`);
      if (decision.authority.judgment.stopReason) lines.push(`- **Planning iteration stopping reason:** ${inline(decision.authority.judgment.stopReason)}`);
    }
    lines.push('', '_Published from both retained independent perspectives and any separately recorded adjudication._', SUMMARY_END);
    return lines.join('\n');
  }
  const { result, receipt, ref } = review;
  const evaluator = receipt.evaluator ?? {};
  const lines = [SUMMARY_START, '### GateReeve independent review', '',
    `- **Outcome:** ${result.outcome}${OUTCOME_NOTE[result.outcome] ?? ''}`,
    `- **Reviewed head:** \`${pin.alias}\` \`${pin.head}\` (base \`${pin.base}\`, target \`${pin.target}\`)`,
    `- **Candidate:** \`${candidateRef.hash}\` (${candidate.scope}; ${briefBased(candidate) ? 'light rigor, brief basis' : 'full rigor, rubric basis'}; criteria ${candidate.criteria.join(', ')})`,
    `- **Review result:** \`${ref.hash}\``,
    `- **Evaluator:** ${inline(evaluator.provider ?? 'unknown')} ${inline(evaluator.model ?? 'unknown')}, fresh context \`${inline(evaluator.contextId ?? 'unknown')}\``,
    '', block(result.summary || 'No summary was recorded.')];
  if (result.criteria?.length) {
    lines.push('', '**Criteria**');
    for (const row of result.criteria) lines.push(`- ${inline(row.id)}: ${inline(row.outcome)}: ${inline(row.evidence)}`);
  }
  if (result.dimensions?.length) {
    lines.push('', '**Dimensions**');
    for (const row of result.dimensions) lines.push(`- ${inline(row.name)}: ${inline(row.outcome)}: ${inline(row.evidence)}`);
  }
  lines.push('', '**Findings**');
  if (!result.findings?.length) lines.push('- None reported.');
  for (const finding of result.findings ?? []) lines.push(`- ${finding.blocking ? 'Blocking' : 'Nonblocking'} \`${inline(finding.id)}\` (${inline(finding.criterion)}, \`${inline(finding.path)}\`): ${inline(finding.evidence)}`);
  lines.push('', '_Published by GateReeve from the retained review result; edits inside this section are replaced._', SUMMARY_END);
  return lines.join('\n');
}
export function publishedSection(body) {
  const text = normalize(body);
  if (!occurrences(text, SUMMARY_START) && !occurrences(text, SUMMARY_END)) return null;
  requireThat(occurrences(text, SUMMARY_START) === 1 && occurrences(text, SUMMARY_END) === 1
    && text.indexOf(SUMMARY_START) < text.indexOf(SUMMARY_END),
  'The PR description has repeated or unbalanced GateReeve review-summary markers; remove the damaged section and publish again');
  return text.slice(text.indexOf(SUMMARY_START), text.indexOf(SUMMARY_END) + SUMMARY_END.length);
}
// Replace the delimited section in place, or append it. Text outside is kept.
export function withSummary(body, section) {
  const text = normalize(body);
  const existing = publishedSection(text);
  if (existing !== null) return text.replace(existing, () => section);
  return text.trim() ? `${text.trimEnd()}\n\n${section}\n` : `${section}\n`;
}
async function reviewTarget(core, input) {
  const { state } = await core.state();
  requireThat(state.candidate, 'Prepare a candidate before publishing its review summary');
  const candidate = await checkCandidate(core.store, core.context, state.candidate);
  const pin = candidate.repositories.find(item => item.alias === input.repository);
  const repository = core.context.repositories.find(item => item.alias === input.repository);
  requireThat(pin && repository && Number.isSafeInteger(input.number) && input.number > 0, 'Select a pinned repository and PR number');
  const ownerRepo = remoteName(await configuredGit(core)(repository.path, ['config', '--get', `remote.${repository.remote ?? 'origin'}.url`]));
  const review = await currentReview(core, state, candidate);
  requireThat(review, 'No current independent review result for this candidate head; run the review gate on the current candidate before publishing or requesting merge authorization');
  return { state, candidate, pin, repository, ownerRepo, review,
    section: renderSummary({ candidateRef: state.candidate, candidate, pin, review }) };
}
async function readPullRequest(core, path, ownerRepo, number) {
  const run = core.runtime.gh ?? gh;
  const pr = JSON.parse(await run(path, ['pr', 'view', String(number), '--repo', ownerRepo, '--json', 'number,state,headRefName,headRefOid,isCrossRepository,body']));
  requireThat(pr.number === number, 'Selected PR has changed identity');
  return pr;
}
// Operation review.publish: write the current summary into the PR description.
export async function publishReview(core, input) {
  requireThat(input && Object.keys(input).every(key => ['repository', 'number'].includes(key)), 'Unsupported review publication field');
  await core.assertContext();
  const target = await reviewTarget(core, input);
  const run = core.runtime.gh ?? gh;
  const pr = await readPullRequest(core, target.repository.path, target.ownerRepo, input.number);
  requireThat(pr.state !== 'MERGED', 'Selected PR is already merged');
  if (pr.state === 'CLOSED' && pr.headRefOid !== target.pin.head && pr.isCrossRepository === false) {
    // GitHub freezes a closed PR's last displayed head. Qualify the currently
    // pushed source branch separately before offering its local review packet.
    const git = configuredGit(core), path = target.repository.path;
    const branch = (await git(path, ['branch', '--show-current'])).trim();
    if (branch && pr.headRefName === branch) {
      const ref = `refs/heads/${branch}`;
      const remote = target.repository.remote ?? 'origin';
      const tip = (await git(path, ['ls-remote', '--refs', remote, ref])).trim();
      if (tip === `${target.pin.head}\t${ref}`) {
        const handoff = await finalHandoff(core, target);
        if (handoff) return { repository: input.repository, number: input.number, ownerRepo: target.ownerRepo,
          head: target.pin.head, candidate: target.state.candidate, review: target.review.ref,
          outcome: target.review.result.outcome, changed: false, handoff,
          publicationPending: 'Closed PR still displays its previous head. Publish the hosted summary when GitHub observes the reviewed head.' };
      }
    }
  }
  requireThat(pr.headRefOid === target.pin.head, `PR head ${pr.headRefOid} differs from the reviewed candidate head ${target.pin.head}; push the reviewed head or prepare and review a new candidate`);
  const handoff = await finalHandoff(core, target);
  const body = withSummary(pr.body, target.section);
  const changed = body !== normalize(pr.body);
  if (changed) {
    requireThat(body.length <= BODY_LIMIT, `The PR description with the review summary would exceed GitHub's ${BODY_LIMIT}-character limit; shorten the description`);
    await run(target.repository.path, ['pr', 'edit', String(input.number), '--repo', target.ownerRepo, '--body', body]);
    const published = await readPullRequest(core, target.repository.path, target.ownerRepo, input.number);
    requireThat(publishedSection(published.body) === target.section, 'Published review summary could not be verified on the PR');
  }
  return { repository: input.repository, number: input.number, ownerRepo: target.ownerRepo, head: target.pin.head,
    candidate: target.state.candidate, review: target.review.ref, outcome: target.review.result.outcome, ...(handoff ? { handoff } : {}), changed, section: target.section };
}
// Merge authorization (human or standing) and protected merge require the PR to
// carry the current summary for the exact prepared head.
export async function requirePublishedReview(core, action) {
  const target = await reviewTarget(core, { repository: action.repository, number: action.number });
  requireThat(target.ownerRepo === action.ownerRepo && target.pin.head === action.head, 'Prepared merge action differs from the current candidate');
  const pr = await readPullRequest(core, target.repository.path, action.ownerRepo, action.number);
  requireThat(pr.headRefOid === action.head, 'PR head differs from the prepared merge action');
  requireThat(publishedSection(pr.body) === target.section,
    `PR #${action.number} does not carry the current independent review summary for head ${action.head}; run review.publish for this PR before requesting merge authorization`);
  return { review: target.review.ref };
}
