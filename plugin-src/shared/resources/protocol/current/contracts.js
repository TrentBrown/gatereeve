import { createHash } from 'node:crypto';
import { ContractError } from '../errors.js';

export const CONTRACT = 'gatereeve/current/3';
export const PHASES = ['DESIGNING', 'SPECIFYING', 'PLANNING', 'IMPLEMENTING', 'ACCEPTING', 'INTEGRATED', 'COMPLETE'];
export const MILESTONES = ['implementation', 'acceptance', 'merge', 'completion'];
export const HASH = /^sha256:[a-f0-9]{64}$/u;
export const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u;

export function requireThat(condition, message, details = null) {
  if (!condition) throw new ContractError(message, details);
}
export function object(value, label) {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value;
}
export function text(value, label) {
  requireThat(typeof value === 'string' && value.trim().length > 0, `${label} must be nonempty text`);
  return value;
}
export function identifier(value, label = 'identity') {
  requireThat(typeof value === 'string' && ID.test(value), `Invalid ${label}`);
  return value;
}
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  requireThat(value !== undefined && (typeof value !== 'number' || Number.isFinite(value)), 'Non-JSON contract value');
  return JSON.stringify(value);
}
export function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
export const identity = value => digest(canonical(value));

// These are proof contracts, not edges in an execution graph. Generated facts
// still need verified evidence; optional assessments do not disable other gates.
export const GATES = Object.freeze([
  { id: 'context', label: 'Pinned source and requirements', role: 'core', at: 'acceptance', waivable: false },
  { id: 'reconcile', label: 'Record reconciliation', role: 'core', at: 'acceptance', waivable: false },
  { id: 'verification', label: 'Build, test and runtime verification', role: 'runner', at: 'acceptance', waivable: true },
  { id: 'spec', label: 'Specification acceptance', rule: 'Score every selected approved rubric criterion against actual Verification and source evidence. PASS only when all required behavior and boundary-feasible evidence are satisfied.', role: 'independent', at: 'acceptance', waivable: true },
  { id: 'pattern', label: 'Pattern review', rule: 'Use the supplied resolved active rules and deterministic triggers. Evaluate every triggered rule, decide agentic triggers with rationale, and report rule IDs/source hashes. Unresolved manual reviews and blocker failures prevent PASS. An existing empty rule scope is a visible warning, never claimed as meaningful pattern coverage.', role: 'assessment', at: 'acceptance', waivable: true },
  { id: 'judge', label: 'Independent compliance judgment', rule: 'Independently assess every selected rubric row, scope creep, contradictions and gaps. Inspect bound Verification receipts; do not assume test success proves reachable behavior. Code/spec verdicts do not replace this judgment.', role: 'independent', at: 'acceptance', waivable: true },
  { id: 'code', label: 'Code review', rule: 'Inspect the actual base/head change, surrounding reachable behavior and cross-repository interactions for supported correctness, security and regression defects. Cite current source and approved requirements. Unrelated pre-existing issues and speculative advice are nonblocking.', role: 'independent', at: 'acceptance', waivable: true },
  { id: 'triage', label: 'Decision triage', role: 'core', at: 'acceptance', waivable: false },
  { id: 'explanation', label: 'Human review explanation', rule: 'Produce a self-contained human-readable explanation in summary of the concrete problem, resulting behavior, main implementation choices, actual verification and remaining limitations. Reviewers must be able to inspect the exact change from this retained artifact.', role: 'assessment', at: 'acceptance', waivable: false },
  { id: 'packet', label: 'Review packet integrity', role: 'core', at: 'acceptance', waivable: false },
  { id: 'finalization', label: 'Required release and finalization obligations', role: 'runner', at: 'completion', waivable: true },
  { id: 'release', label: 'Required release observation', role: 'observation', at: 'completion', waivable: true },
  { id: 'retention', label: 'Local record retention', role: 'core', at: 'completion', waivable: false },
  { id: 'whiteboard', label: 'Whiteboard assessment', rule: 'Independently challenge the design and implementation against failure modes, data flow, edge cases, integration assumptions, operational behavior and alternatives. State concrete challenges and evidence-backed answers in summary. Unsupported defenses or uncovered required behavior prevent PASS.', role: 'independent', at: 'acceptance', waivable: true, waiverPolicy: 'non-behavioral-only', optional: true },
]);

export function gate(id) {
  const found = GATES.find(item => item.id === id);
  requireThat(found, `Unknown gate: ${id}`);
  return found;
}
export function authority(value) {
  object(value, 'Human authority');
  requireThat(value.kind === 'human-confirmed', 'An observed human instruction is required');
  text(value.instruction, 'Human instruction');
  text(value.context, 'Instruction context');
  if (value.messageId !== undefined) text(value.messageId, 'Message reference');
  if (value.conversationId !== undefined) text(value.conversationId, 'Conversation reference');
  return structuredClone(value);
}
export function decision(value) {
  object(value, 'Decision');
  requireThat(Object.keys(value).every(key => ['kind', 'subject', 'authority', 'reason', 'consequences', 'actions', 'gates', 'findings', 'action', 'previousSubject', 'scope', 'waiverBasis'].includes(key)), 'Unsupported decision field; scope must be explicit in the supported contract');
  requireThat(['approve-design', 'authorize-implementation', 'accept', 'waive', 'amend', 'policy-amend', 'authorize-merge', 'authorize-standing', 'revoke-standing'].includes(value.kind), 'Unknown decision kind');
  requireThat(value.scope === undefined || value.kind === 'authorize-standing', 'Scope is only supported on a standing grant');
  authority(value.authority);
  text(value.reason, 'Decision reason');
  text(value.consequences, 'Known consequences');
  requireThat(HASH.test(value.subject), 'Decision must name the exact subject identity');
  const actions = value.actions ?? [];
  requireThat(Array.isArray(actions) && new Set(actions).size === actions.length, 'Decision actions must be distinct');
  const allowed = { waive: ['accept', 'authorize-merge'], accept: ['authorize-merge'], amend: ['authorize-implementation'], 'policy-amend': ['waive', 'accept', 'authorize-merge'] };
  requireThat(actions.every(action => (allowed[value.kind] ?? []).includes(action)), 'Unsupported decision continuation');
  if (value.kind === 'waive' || value.kind === 'policy-amend') {
    requireThat(Array.isArray(value.gates) && value.gates.length > 0 && new Set(value.gates).size === value.gates.length, 'Waiver must name distinct gates');
    value.gates.forEach(gate);
    if (value.kind === 'policy-amend') requireThat(value.gates.every(id => ['reconcile', 'triage', 'explanation', 'whiteboard'].includes(id)), 'Policy amendment cannot waive integrity, factual truth or authority');
  }
  if (value.waiverBasis !== undefined) {
    requireThat(decisionHas(value, 'waive') && value.gates?.includes('whiteboard'), 'Waiver basis requires a Whiteboard exception');
    requireThat(nonBehavioralBasis(value.waiverBasis), 'Whiteboard requires an explicit non-behavioral classification and retained evidence');
  }
  if (value.findings !== undefined) {
    requireThat((value.kind === 'waive' || value.kind === 'policy-amend') && Array.isArray(value.findings)
      && value.findings.length > 0 && new Set(value.findings).size === value.findings.length,
      'Finding exceptions require distinct named findings');
    value.findings.forEach(id => text(id, 'Finding identity'));
  }
  return structuredClone(value);
}
export const decisionHas = (value, kind) => value.kind === kind || (value.actions ?? []).includes(kind);
// A commitment amendment supersedes previous permission even if bytes later
// return to their old values. Keep proof reuse separate from human authority.
export const latestImplementation = state => state.decisions.findLast(item => decisionHas(item, 'authorize-implementation') || item.kind === 'amend');
export function currentAuthorityDecisions(state) {
  const index = state.decisions.findLastIndex(item => decisionHas(item, 'authorize-implementation') || item.kind === 'amend');
  return state.decisions.slice(Math.max(0, index));
}
export function currentDesignApproval(state, subject) {
  const latest = state.decisions.findLast(item => item.kind === 'approve-design' || item.kind === 'amend');
  return (latest?.kind === 'amend' ? latest.approvedDesign?.hash : latest?.subject) === subject ? latest : null;
}
function nonBehavioralBasis(basis) {
  return basis?.classification === 'NON_BEHAVIORAL'
    && Object.keys(basis).every(key => ['classification', 'evidence'].includes(key))
    && HASH.test(basis.evidence?.hash) && Number.isSafeInteger(basis.evidence?.bytes) && basis.evidence.bytes >= 0;
}
export function waiverPolicyAllows(state, id, subject, applicability = null, basis = null) {
  const applies = item => item.subject === subject || (applicability && item.applicability === applicability);
  const amendment = currentAuthorityDecisions(state).some(item => item.kind === 'policy-amend' && applies(item) && item.gates.includes(id));
  return amendment || gate(id).waivable && (gate(id).waiverPolicy !== 'non-behavioral-only' || nonBehavioralBasis(basis));
}
export function waiverFor(state, id, subject, applicability = null, risk = null, result = null) {
  const applies = item => item.subject === subject || (applicability && item.applicability === applicability);
  return currentAuthorityDecisions(state).findLast(item => decisionHas(item, 'waive') && applies(item) && item.gates.includes(id)
    && waiverPolicyAllows(state, id, subject, applicability, item.waiverBasis)
    && risk !== null && item.risks?.[id] === risk
    && (!item.findings || result?.outcome === 'FAIL' && result.findings?.some(finding => finding.blocking)
      && result.findings.filter(finding => finding.blocking).every(finding => item.findings.includes(finding.id)))) ?? null;
}
const actions = Object.freeze({
  implementation: { mode: 'adapter-only', entry: 'human.decide / milestone.pass', checkedBy: 'current-core.test.js: implementation authorization and changed commitments' },
  acceptance: { mode: 'adapter-only', entry: 'milestone.pass', checkedBy: 'current-core.test.js: missing proof and scoped exceptions' },
  merge: { mode: 'adapter-only', entry: 'merge.execute', checkedBy: 'current-core.test.js: exact action, branch direction, drift and reclose' },
  completion: { mode: 'adapter-only', entry: 'milestone.pass', checkedBy: 'current-core.test.js: integration, release and retention' },
  directPullRequestMerge: { mode: 'configured-hook-unverified-host', handlerBehavior: 'deny-and-route', entry: 'PreToolUse direct gh pr merge', checkedBy: 'current-hook.test.js', limit: 'Handler and manifest subprocess tests only; native-host activation and actual interception are unverified. Recognized direct shell forms only; use the protected merge adapter for actual execution' },
  arbitraryShell: { mode: 'cooperative', interception: 'not-configured', reason: 'Indirect scripts, alternate clients and external commands are outside this hook coverage.' },
});
export const ENFORCEMENT = Object.freeze({
  core: 'milestone checks',
  codex: { sessionStart: 'guidance', actionHooks: 'PreToolUse: direct gh pr merge guard', protectedAdapters: 'required', actions, hostSmoke: 'packaged SessionStart and PreToolUse subprocess smoke; live plugin activation not asserted' },
  claude: { sessionStart: 'guidance', actionHooks: 'PreToolUse: direct gh pr merge guard', protectedAdapters: 'required', actions, hostSmoke: 'packaged SessionStart and PreToolUse subprocess smoke; live plugin activation not asserted' },
});
