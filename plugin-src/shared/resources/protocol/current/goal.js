// Goal autonomy (spec AC2, AC3): autonomous authority plus unattended
// attendance rules. A goal run never asks the human; it ends either at a ready,
// unmerged final PR or parked behind a PR that lists its blockers. The terminal
// state is computed from recorded events only, so status never needs the host.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { requireThat, text, identity } from './contracts.js';
import { isGoal } from './delegation.js';

// The one provenance-tagged decision record (spec AC6): entries marked
// "Answered by: agent" in these feature documents, identified by file+heading.
export const DECISION_FILES = Object.freeze(['interview.md', 'scratchpad.md', 'decisions.md']);
const ANSWERED_BY = /^\s*(?:[-*]\s*)?\*\*Answered by:\*\*\s*`?(human|agent)`?/imu;
export function parseDecisionEntries(file, markdown) {
  const entries = [];
  let current = null;
  for (const line of markdown.split(/\r?\n/u)) {
    const heading = /^(#{2,4})\s+(.+?)\s*$/u.exec(line);
    if (heading) { if (current) entries.push(current); current = { file, heading: heading[2], lines: [] }; continue; }
    if (current) current.lines.push(line);
  }
  if (current) entries.push(current);
  return entries.map(entry => ({ file: entry.file, heading: entry.heading, answeredBy: ANSWERED_BY.exec(entry.lines.join('\n'))?.[1]?.toLowerCase() ?? null,
    body: entry.lines.join('\n').trim() })).filter(entry => entry.answeredBy);
}
export async function agentDecisions(featureHome) {
  const found = [];
  for (const file of DECISION_FILES) {
    let markdown;
    try { markdown = await readFile(join(featureHome, file), 'utf8'); } catch { continue; }
    found.push(...parseDecisionEntries(file, markdown).filter(entry => entry.answeredBy === 'agent'));
  }
  return found;
}
export const AGENT_DECISION_RULE = 'This is a goal run: the human was not asked. Assess every supplied agent-answered decision entry against the fixed mandate '
  + 'and the approved requirements. An entry that contradicts the mandate, exceeds its scope or makes an irreversible choice the human would need to make is blocking.';

// interview.md pinned at the latest approve-design or amendment (spec AC6, A3);
// a goal grant never re-pins, so drift since approval stays visible.
export async function captureInterview(store) {
  try { return await store.capture('interview.md'); } catch { return null; }
}
export async function interviewDrift(store, state) {
  if (!isGoal(state) || !state.interviewPin) return null;
  let current = null;
  try { current = (await store.fingerprint('interview.md')).hash; } catch { /* A removed record differs from its pin. */ }
  return current === state.interviewPin.hash ? null
    : 'interview.md changed since its latest approval (approve-design or amendment); record an amendment that pins the current record';
}

export const GOAL_TERMINALS = Object.freeze(['ready-pr', 'parked']);

// The condition GateReeve hands to the harness-native goal evaluator (Claude
// Code set_goal, Codex create_goal) and to the Stop-hook fallback.
export function goalCondition(state) {
  return `GateReeve status for run ${state.runId} reports goal.terminal "ready-pr" (a ready, unmerged final PR with acceptance qualified and the review summary published) `
    + 'or "parked" (an open PR lists the recorded blockers and the agent asked the human through the question tool).';
}

function prReference(value) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => ['repository', 'number'].includes(key)), 'A park names its PR as {repository, number}');
  text(value.repository, 'Parked PR repository');
  requireThat(Number.isSafeInteger(value.number) && value.number > 0, 'Parked PR number must be a positive integer');
  return { repository: value.repository, number: value.number };
}
function textList(value, label) {
  requireThat(Array.isArray(value) && value.length > 0, `${label} must be a non-empty list`);
  return value.map(item => text(item, label));
}

// Operation goal.park: the agent records that it advanced as far as it can and
// a PR (draft allowed) lists the blockers. Only a human run.continue clears it.
export async function parkGoal(core, input, operation, readPullRequest) {
  requireThat(input && Object.keys(input).every(key => ['pr', 'blockers', 'evidence'].includes(key)), 'Unsupported goal park field');
  const pr = prReference(input.pr);
  const blockers = textList(input.blockers, 'Park blocker');
  const evidence = textList(input.evidence, 'Park evidence');
  const { state } = await core.state();
  requireThat(isGoal(state), `goal.park applies only to a goal run; this run is ${state.dials.autonomy.value}`);
  requireThat(!state.park, 'The run is already parked; a human run.continue resumes it');
  const observed = await readPullRequest(core, pr);
  requireThat(observed.state === 'OPEN', `PR #${pr.number} must be open to carry a park (it is ${observed.state})`);
  requireThat(observed.isDraft === true, `PR #${pr.number} must be a draft to carry a park`);
  const missing = blockers.filter(blocker => !String(observed.body ?? '').includes(blocker));
  requireThat(!missing.length, `PR #${pr.number} description must list every blocker; missing: ${missing.join('; ')}`);
  return core.append(state, 'PARKED', { pr: { ...pr, head: observed.headRefOid, isDraft: Boolean(observed.isDraft) }, blockers, evidence }, operation);
}

// Recorded by review.publish when a goal run's final FEATURE candidate summary
// is published on an open, unmerged PR (an open draft is GateReeve's default
// delivery state, spec A2) whose head is the candidate head.
export const decisionsIdentity = decisions => identity(decisions.map(({ file, heading, body }) => ({ file, heading, body })));
export function readyRecord(state, candidate, publication, pr, decisions = []) {
  if (!isGoal(state) || candidate.scope !== 'FEATURE') return null;
  if (pr.state !== 'OPEN' || pr.headRefOid !== publication.head) return null;
  return { candidate: state.candidate.hash, repository: publication.repository, number: publication.number, head: publication.head, review: publication.review,
    decisions: decisionsIdentity(decisions) };
}

export function goalStatus(state, milestones = [], decisions = []) {
  if (!isGoal(state)) return null;
  const condition = goalCondition(state);
  const listed = decisions.map(({ file, heading }) => ({ file, heading }));
  if (state.park) return { condition, terminal: 'parked', decisions: listed, reason: `Parked behind PR #${state.park.pr.number}: ${state.park.blockers.join('; ')}`, park: state.park };
  const ready = state.goalReady;
  const acceptance = milestones.find(item => item.name === 'acceptance');
  const decisionsCurrent = ready && ready.decisions === decisionsIdentity(decisions);
  if (ready && state.candidate?.hash === ready.candidate && acceptance?.allowed && decisionsCurrent)
    return { condition, terminal: 'ready-pr', decisions: listed, reason: `PR #${ready.number} is ready: acceptance qualifies and the current review summary is published on head ${ready.head}. Its release merge needs the per-PR human instruction.`, ready };
  const reason = !state.candidate ? 'No candidate is pinned yet'
    : !ready || ready.candidate !== state.candidate.hash ? 'The final FEATURE candidate summary is not yet published on an open PR for the current review state'
      : !acceptance?.allowed ? 'The acceptance milestone does not qualify for the current candidate'
        : 'Agent decision entries changed since the summary was published; run review.publish again';
  return { condition, terminal: null, reason, decisions: listed };
}
