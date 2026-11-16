import { requireThat } from './contracts.js';
import { checkCandidate, briefBased } from './evidence.js';
import { configuredGit } from './authorization.js';
import { gh, remoteName } from './actions.js';

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

// Latest review result that qualifies for the current candidate and reached a
// conclusion. UNAVAILABLE results carry no reviewer conclusion to present.
export async function currentReview(core, state, candidate) {
  const memo = new Map();
  for (const ref of [...state.results].reverse()) {
    let raw;
    try { raw = await core.store.json(ref); } catch { continue; }
    if (raw.gate !== 'review') continue;
    try {
      const result = await core.currentResult(ref, candidate, state, new Set(), memo);
      if (['PASS', 'FAIL'].includes(result.outcome)) return { ref, result, receipt: await core.store.json(result.receipt) };
    } catch { /* Stale or unqualified review cannot be presented as current. */ }
  }
  return null;
}
export function renderSummary({ candidateRef, candidate, pin, review }) {
  const { result, receipt, ref } = review;
  const evaluator = receipt.evaluator ?? {};
  const lines = [SUMMARY_START, '### GateReeve independent review', '',
    `- **Outcome:** ${result.outcome}`,
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
  const pr = JSON.parse(await run(path, ['pr', 'view', String(number), '--repo', ownerRepo, '--json', 'number,state,headRefOid,body']));
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
  requireThat(pr.headRefOid === target.pin.head, `PR head ${pr.headRefOid} differs from the reviewed candidate head ${target.pin.head}; push the reviewed head or prepare and review a new candidate`);
  const body = withSummary(pr.body, target.section);
  const changed = body !== normalize(pr.body);
  if (changed) {
    requireThat(body.length <= BODY_LIMIT, `The PR description with the review summary would exceed GitHub's ${BODY_LIMIT}-character limit; shorten the description`);
    await run(target.repository.path, ['pr', 'edit', String(input.number), '--repo', target.ownerRepo, '--body', body]);
    const published = await readPullRequest(core, target.repository.path, target.ownerRepo, input.number);
    requireThat(publishedSection(published.body) === target.section, 'Published review summary could not be verified on the PR');
  }
  return { repository: input.repository, number: input.number, ownerRepo: target.ownerRepo, head: target.pin.head,
    candidate: target.state.candidate, review: target.review.ref, outcome: target.review.result.outcome, changed, section: target.section };
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
