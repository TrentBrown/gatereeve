import { basename, resolve } from 'node:path';
import { projectWorkflow } from '../../performance/workflow-projection.js';
import { observe } from '../../performance/observe.js';
import { checkIdentity } from './coverage.js';
import { protectedMerge, resumeDelivery } from './delivery.js';
import { observeReleaseConductor } from '../../release/release-conductor-observer.js';
import { workflowContextGuard } from '../context.js';
import { ContractError } from '../errors.js';
import { HIGH_CAPABILITY_PROFILE, validateEvaluatorCapability } from '../agent-workflow.js';
import { executionEnvironment, assertEnvironmentCurrent } from './environment.js';
import { patternInputs } from './pattern-inputs.js';
import { randomUUID } from 'node:crypto';
import { processIdentity } from '../../storage/scratch.js';
import { ID, CONTRACT, PHASES, GATES, MILESTONES, ENFORCEMENT, DIALS, LOWERING_REFUSED, DELEGATED_AUTHORITY, AUTONOMOUS_AUTHORITY, startDial, dialChange, automaticDial, requireThat, identity, digest,
  identifier, text, decision, gate, authority, decisionHas, waiverFor, waiverPolicyAllows, latestImplementation, currentAuthorityDecisions, currentDesignApproval, unattendedValue, normalizedDial, autonomyAlias, decisionQuestion } from './contracts.js';
import { CurrentStore } from './store.js';
import { requirements, sourceCandidate, assertSourceIsolation, checkCandidate, checkSource, contentIdentity, briefBased } from './evidence.js';
import { validatePlanning, assertPlanningProof, planningBinding } from './planning.js';
import { executeGates, reviewContract, coreEvidence, retainedContractQualifies } from './execution.js';
import { prepareMerge, merge, observeIntegration } from './actions.js';
import { captureStanding, applyStanding, standingValidity, standingReleaseRefusal, qualifyingDecisions, requireUnexpired } from './authorization.js';
import { publishReview, requirePublishedReview } from './publication.js';
import { selectReviewers, executeBoundaryReviews, boundaryReviews } from './boundary-review.js';
import { qualifyCi, isCiVerification } from './ci-qualification.js';
import { countRound, resetRounds, closeScope, recordRoundDecision, planningScope, roundStatus, HANDBACK_AT, ROUND_CHOICES } from './round-policy.js';
import { adjudicateReview, currentAdjudication, allowedRunOutcome } from './autonomous.js';
import { parkGoal, readyRecord, goalStatus, captureInterview, interviewDrift, agentDecisions, AGENT_DECISION_RULE } from './goal.js';
import { evaluateTripwires, describeHits, hitKey } from './tripwires.js';
import { isDelegated, isAutonomous, isGoal, hasRunAuthority, requireProtection, guardDelegatedAction, reviewPlanning, delegatedPlanningAuthority, assertBriefScopeUnchanged, briefScopeChanged, briefScope, applyDelegation, delegationStatus, briefLines } from './delegation.js';

import { sourcePreparation, ensurePins, releasePins } from './source-retention.js';
import { cleanupViews, viewStatus } from './source-views.js';
import { prepareWorkspace, workspaceInstruction, WORKSPACE_PREPARED } from './workspace.js';

const LIVE_PROOFS = Symbol('qualified live proof inputs');
const RETAINED_CLOSURE = Symbol('retained bytes verified in this observation');
const admissions = new WeakMap();
const lightRun = state => state.dials.rigor.value === 'light';
// The decisions log a full-rigor paired review reads as supporting input (execution.js).
const REVIEW_SUPPORT_DOCUMENTS = ['decisions.md'];
const GOAL_READY_STALE = new Set(['DECIDED', 'SPEC_VALIDATED', 'REVIEWERS_SELECTED', 'REVIEW_ROUND_STARTED', 'BOUNDARY_REVIEWED', 'REVIEW_ADJUDICATED', 'CANDIDATE', 'JOB_FINISHED', 'INTEGRATED', 'DIAL_SET']);
// A human stay-light decision covers the current tripwire hits only when every
// current hit was named in it; a new hit needs a new decision (spec AC4).
function stayLightCovers(state, hits) {
  const keys = hits.map(hitKey);
  return currentAuthorityDecisions(state).some(item => item.kind === 'stay-light' && keys.every(key => item.hits?.includes(key)));
}
// A light run's sole planning commitment. Its adequacy is the human's
// confirmation and the independent review's concern; only structure is checked.
// Headings inside fenced code blocks do not count.
function assertBrief(bytes) {
  const headings = briefLines(bytes).map(item => item.title).filter(Boolean);
  for (const section of ['goal', 'scope', 'findings']) requireThat(headings.some(heading => heading.startsWith(section)), `The brief needs a ${section} section (goal, scope and findings log)`);
}

// workflow.observe: bounded agent notes. They never grant authority. An
// escaped-defect note that links a fix to its origin run, candidate or PR
// records that link only on a human basis (spec AC8): `human-stated` when the
// human named the origin, `agent-proposed` when the agent proposed it and the
// human confirmed it. Either way the observed human instruction is the
// authority. An unconfirmed proposal is refused, so it is never stored.
const LINK_BASES = ['human-stated', 'agent-proposed'];
export function workflowObservation(input) {
  requireThat(input && typeof input === 'object' && !Array.isArray(input), 'Unsupported workflow observation');
  requireThat(Object.keys(input).every(key => ['kind','strategy','reason','outcome','findingId','fixId','links','limitation','linkBasis','authority'].includes(key)), 'Unsupported workflow observation');
  requireThat(['strategy','friction','escaped-defect','disposition','artifact'].includes(input.kind), 'Unsupported workflow observation kind');
  for (const [key,value] of Object.entries(input)) {
    if (key === 'authority') continue;
    if (key === 'links') requireThat(Array.isArray(value) && value.length <= 32 && value.every(item => typeof item === 'string' && item.length > 0 && item.length <= 1024), 'Invalid observation links');
    else requireThat(typeof value === 'string' && value.length > 0 && value.length <= 1024, 'Invalid observation value');
  }
  const origin = input.kind === 'escaped-defect' && input.links?.length > 0;
  requireThat(origin || (input.linkBasis === undefined && input.authority === undefined),
    'linkBasis and authority belong only to an escaped-defect note that links a fix to its origin');
  if (!origin) return input;
  requireThat(input.linkBasis !== undefined, 'An escaped-defect origin link needs linkBasis human-stated (the human named the origin) or agent-proposed (the human confirmed your proposal)');
  requireThat(LINK_BASES.includes(input.linkBasis), `Unknown escaped-defect link basis; use ${LINK_BASES.join(' or ')}`);
  requireThat(input.fixId !== undefined, 'An escaped-defect origin link names the fix (fixId) it links to the origin');
  requireThat(input.authority !== undefined, input.linkBasis === 'agent-proposed'
    ? 'Agent-proposed origin links are recorded only after the human confirms them: ask the human, then record the confirmation as authority. Unconfirmed proposals are not stored.'
    : 'A human-stated origin link needs the observed human statement as authority');
  return { ...input, authority: authority(input.authority) };
}

export function project(events) {
  requireThat(events[0]?.type === 'STARTED', 'Current run is not initialized');
  const first = events[0].payload;
  const state = { contract: CONTRACT, runId: events[0].runId, featureId: first.featureId,
    phase: 'DESIGNING', implementers: first.implementers, optionalGates: first.optionalGates,
    decisions: [], pendingDecisions: [], validationFailures: [], results: [], jobs: {}, actions: {}, expectations: {}, candidate: null, specValidation: null, integrated: null, integrations: {},
    sourcePreparations: [], sourcePreparationStatus: {}, sourceCleanup: null, ready: false, paused: false, eventCount: events.length,
    externalBlockers: [], externalBlocker: null, park: null, goalReady: null, interviewPin: null, tripwires: null, tripwireHistory: [], planningReviews: [], handBack: null, delegationBlocked: null,
    reviewerSelection: null, reviewRounds: [], boundaryReviewHistory: [], adjudications: [], reviewScopes: {}, reviewScopeHistory: [],
    // Workspace configuration observed or written at run start (spec AC6), or later by workspace.configure.
    workspace: first.workspace ? { ...first.workspace, at: events[0].recordedAt, event: events[0].hash } : null };
  state.dials = Object.fromEntries(Object.keys(DIALS).map(dial => [dial,
    { ...normalizedDial(first.dials?.[dial] ?? startDial(dial)), at: events[0].recordedAt, event: events[0].hash }]));
  state.dialHistory = Object.entries(state.dials).map(([dial, value]) => ({ dial, ...value }));
  for (const event of events.slice(1)) {
    const value = event.payload;
    switch (event.type) {
      // An asked question (decision.ask) only times the human's wait; the
      // recovery record for an interrupted decision is the unflagged form.
      case 'DECISION_PENDING': if (!value.asked) state.pendingDecisions.push({ ...value, event: event.hash }); break;
      case 'VALIDATION_FAILED': state.validationFailures.push(value); state.specValidation = null; break;
      case 'DECIDED':
        state.pendingDecisions = state.pendingDecisions.filter(item => item.operation.id !== value.requestId);
        // Only a human-approved amendment resets review rounds (spec AC6). A
        // light run amends by re-authorizing a changed brief.
        if (value.authority?.kind === 'human-confirmed' && (value.kind === 'amend' || (value.kind === 'authorize-implementation'
          && state.dials.rigor.value === 'light' && latestImplementation(state) && latestImplementation(state).subject !== value.subject))) resetRounds(state, event.hash);
        if (value.kind === 'review-rounds') recordRoundDecision(state, value, event.hash);
        state.decisions.push({ ...value, event: event.hash });
        if (value.interview?.hash && ['approve-design', 'amend'].includes(value.kind)) state.interviewPin = value.interview;
        // A hand-back stops for the human until a human decision is observed.
        if (value.authority?.kind === 'human-confirmed') state.handBack = null;
        if (value.kind === 'approve-design') state.phase = 'SPECIFYING';
        if (value.kind === 'authorize-implementation') state.phase = 'IMPLEMENTING';
        if (value.kind === 'amend') { state.phase = 'SPECIFYING'; state.specValidation = null; state.ready = false; }
        if (value.specValidation) state.specValidation = value.specValidation;
        if (decisionHas(value, 'authorize-implementation')) state.phase = 'IMPLEMENTING';
        break;
      case 'SPEC_VALIDATED': state.specValidation = value; if (['SPECIFYING', 'PLANNING'].includes(state.phase)) state.phase = 'PLANNING'; break;
      case 'REVIEWERS_SELECTED': state.reviewerSelection = { ...value, event: event.hash, at: event.recordedAt }; break;
      case 'REVIEW_ROUND_STARTED': state.reviewRounds.push({ ...value, event: event.hash, at: event.recordedAt }); break;
      case 'BOUNDARY_REVIEWED': state.boundaryReviewHistory.push({ ...value, event: event.hash, at: event.recordedAt });
        // A round in which no reviewer ran (every outcome refused) is not a
        // round (issue #140). Earlier events have no refused rows and count as before.
        if (value.roundPolicy && !(value.outcomes?.length && value.outcomes.every(row => row.status === 'refused')))
          countRound(state, value.roundPolicy.scope, value.roundPolicy.revision, { candidate: value.candidate, event: event.hash, at: event.recordedAt });
        break;
      case 'REVIEW_ADJUDICATED': state.adjudications.push({ ...value, event: event.hash, at: event.recordedAt }); break;
      case 'SOURCE_PREPARING': state.sourcePreparations.push(value); state.sourcePreparationStatus[value.id] = { status: 'preparing', reason: 'Preparation has not published a candidate; owned references are retained for retry.' }; break;
      case 'SOURCE_PREPARATION_FAILED': state.sourcePreparationStatus[value.id] = { status: 'retry-required', reason: value.reason }; break;
      case 'SOURCE_CLEANUP': state.sourceCleanup = value; break;
      case 'CANDIDATE': if (value.preparationId) state.sourcePreparationStatus[value.preparationId] = { status: 'published', reason: null }; state.candidate = value; state.goalReady = null; state.ready = false; state.integrated = null; state.integrations = {}; state.externalBlocker = null; state.tripwires = null; state.phase = 'IMPLEMENTING'; break;
      // Tripwire classification of a light candidate (spec AC4). Hits are facts;
      // dispositions are separate decisions or dial events.
      case 'TRIPWIRES_EVALUATED': { const recorded = { ...value, at: event.recordedAt, event: event.hash }; state.tripwireHistory.push(recorded); if (value.candidate?.hash === state.candidate?.hash) state.tripwires = recorded; break; }
      // Independent planning review; a delegated planning decision cites a PASS.
      case 'PLANNING_REVIEWED': state.planningReviews.push({ ...value, at: event.recordedAt, event: event.hash });
        if (value.roundPolicy) {
          const scope = planningScope(value.artifact);
          countRound(state, scope, value.subject, { event: event.hash, at: event.recordedAt });
          // A round counted at review start points at the completed review.
          const row = state.reviewScopes[scope]?.revisions.at(-1);
          if (row?.revision === value.subject) row.event = event.hash;
        }
        break;
      // The round of a review counted when it started (spec AC6).
      case 'ROUND_COUNTED': countRound(state, value.roundPolicy.scope, value.roundPolicy.revision, { ...(value.candidate ? { candidate: value.candidate } : {}), ...(value.documents ? { documents: value.documents } : {}), event: event.hash, at: event.recordedAt }); break;
      case 'READY': state.ready = true; break;
      case 'TRANSITION_RECORDED': state.transition = value; break;
      case 'ACTION_CLAIMED': state.actions[value.id] = { ...value, running: true }; break;
      case 'ACTION_RELEASED': if (state.actions[value.id]?.owner === value.owner) state.actions[value.id].running = false; break;
      case 'JOB_STARTED': state.jobs[value.jobId] = { ...value, sequence: event.sequence, finished: false }; break;
      case 'JOB_ABANDONED': state.jobs[value.jobId] = { ...state.jobs[value.jobId], abandoned: { reason: value.reason, sequence: event.sequence } }; break;
      case 'JOB_OUTCOME_READY': state.jobs[value.jobId] = { ...state.jobs[value.jobId], ready: value }; break;
      case 'JOB_FINISHED': state.jobs[value.jobId] = { ...state.jobs[value.jobId], ...value, finishedSequence: event.sequence, finished: true }; state.results.push(...value.results); break;
      case 'MILESTONE':
        if (value.name === 'acceptance') state.phase = 'ACCEPTING';
        if (value.name === 'completion') { state.phase = 'COMPLETE'; state.sourceCleanup = { status: 'pending', errors: [{ reason: 'Completion recorded; owned source reference release has not been reconciled.' }] }; }
        break;
      case 'INTEGRATED': state.integrated = value; state.integrations[value.repository] = value; state.externalBlocker = null; state.phase = 'INTEGRATED';
        closeScope(state, 'slice', 'integrated', event.hash); break; // The next slice PR is a new review scope.
      // A hosting rule refused an authorized merge. Reported, never a gate failure.
      case 'MERGE_BLOCKED': { const blocked = { ...value, at: event.recordedAt, event: event.hash }; state.externalBlockers.push(blocked); state.externalBlocker = blocked;
        // Fail closed: a blocker under delegation ends that delegation's authority
        // even if recording the hand-back itself failed.
        if (state.dials.autonomy.value === 'delegated') state.delegationBlocked = state.dials.autonomy.event;
        break; }
      case 'OBSERVATION': break; // Agent memory; never grants authority.
      case 'WORKSPACE_CONFIGURED': state.workspace = { ...value, at: event.recordedAt, event: event.hash }; break;
      case 'DIAL_SET': {
        const recorded = { ...normalizedDial(value), at: event.recordedAt, event: event.hash };
        state.dials[value.dial] = recorded; state.dialHistory.push(recorded);
        if (value.dial === 'autonomy' && recorded.value !== 'goal') state.park = null;
        if (value.dial === 'autonomy') { state.handBack = recorded.value === 'supervised' && unattendedValue(recorded.previous) && value.actor !== 'human' ? recorded : null; state.delegationBlocked = null; }
        // Raised rigor voids brief-bound authority: full planning starts again
        // so design approval, spec validation and authorization are reachable.
        if (value.dial === 'rigor' && value.previous === 'light' && !['DESIGNING', 'SPECIFYING', 'PLANNING'].includes(state.phase)) { state.phase = 'DESIGNING'; state.ready = false; }
        break;
      }
      case 'PAUSED': state.paused = true; break;
      case 'RESUMED': state.paused = false; state.park = null; break;
      case 'PARKED': state.park = { ...value, at: event.recordedAt, event: event.hash }; break;
      case 'GOAL_READY': state.goalReady = { ...value, at: event.recordedAt, event: event.hash }; break;
      default: throw new Error(`Unsupported current event: ${event.type}`);
    }
    // A published ready summary describes one review state; any later change
    // to reviews, evidence, decisions or dials needs a republish (spec AC2).
    if (GOAL_READY_STALE.has(event.type)) state.goalReady = null;
  }
  requireThat(PHASES.includes(state.phase), 'Invalid current phase');
  return state;
}
function enabled(state, at) {
  return GATES.filter(item => item.at === at && (!item.supplemental && (!item.optional || state.optionalGates.includes(item.id))));
}
// A delegated implementation authorization counts only while the delegation
// it cites is current. After any hand-back the supervised run stops until a
// human records implementation authority again.
function voidedDelegation(state, decision) {
  const kind = decision?.authority?.kind;
  return [DELEGATED_AUTHORITY, AUTONOMOUS_AUTHORITY].includes(kind)
    && (!(kind === AUTONOMOUS_AUTHORITY ? isAutonomous(state) : isDelegated(state))
      || state.dials.autonomy.event !== decision.authority.delegation?.event || Boolean(state.delegationBlocked));
}
function findDecision(state, kind, subject) {
  if (kind === 'authorize-implementation') {
    const latest = latestImplementation(state);
    return latest && decisionHas(latest, kind) && latest.subject === subject && !voidedDelegation(state, latest) ? latest : null;
  }
  return currentAuthorityDecisions(state).findLast(item => decisionHas(item, kind) && item.subject === subject);
}
// run.start input checks that need no state, run before anything is written.
export function validateStart(input) {
  requireThat(input && typeof input === 'object' && !Array.isArray(input), 'run.start input must be an object');
  if (input.runId !== undefined) identifier(input.runId, 'run');
  requireThat(Array.isArray(input.implementers) && input.implementers.length > 0, 'Identify the implementing contexts');
  input.implementers.forEach(value => text(value, 'Implementer context'));
  const optionalGates = input.optionalGates ?? [];
  requireThat(Array.isArray(optionalGates) && optionalGates.every(id => gate(id).optional), 'Only optional gates may be selected');
  const dials = Object.fromEntries(Object.keys(DIALS).map(dial => [dial, startDial(dial, input[dial])]));
  workspaceInstruction(input.workspace);
  return { optionalGates, dials };
}
export class CurrentCore {
  constructor(context, store, runtime = {}) {
    this.sourceContext = context;
    this.contextGuard = workflowContextGuard(context);
    this.store = store;
    this.runtime = runtime;
  }
  get context() {
    return { ...this.sourceContext, repositories: this.sourceContext.repositories.map(repository => ({
      ...repository, gitExecutable: this.runtime.gitExecutable ?? repository.gitExecutable ?? 'git',
    })) };
  }
  async assertContext() { await this.contextGuard(this.runtime.gitExecutable); }
  static async at(context, runtime = {}) {
    return new CurrentCore(context, await CurrentStore.at(context.featureHome, context.workspaceRoot), runtime);
  }
  async state() {
    const active = await this.store.active();
    requireThat(active, 'No current run; use run.start or run.resume-current. Old journals are retained, not replayed.');
    const events = await this.store.events(active.runId);
    const state = project(events);
    requireThat(state.featureId === this.context.featureId, 'Current feature identity changed');
    return { state, events };
  }
  async start(input, operation, replacement = null, { workspace = false, workspaceOperation = 'run.start' } = {}) {
    const { optionalGates, dials } = validateStart(input);
    identifier(input.runId, 'run');
    const active = replacement ? null : await this.store.active();
    requireThat(!active || active.runId === input.runId, 'A current run already exists; resume that run');
    // Delegating at start names this run (its runId) and needs the release
    // branch observed as protected, exactly as run.set-dial does (spec AC5).
    // It is observed before any workspace configuration is written, so the Git
    // fallback still cannot delegate at start.
    if (unattendedValue(dials.autonomy.value)) dials.autonomy = { ...dials.autonomy, runId: input.runId, protection: await requireProtection(this) };
    // Workspace configuration (spec AC6): decided and possibly written here,
    // unless the adapter already did so before creating the feature home.
    const prepared = workspace ? await this.prepareWorkspace(input.workspace, workspaceOperation, { createAllowed: !unattendedValue(dials.autonomy.value) }) : null;
    try {
      const recorded = prepared?.record ? await this.retainWorkspace(prepared) : null;
      // No legacy files are read or overwritten. STARTED is durable before activation.
      await this.store.append(input.runId, 0, 'STARTED', { featureId: this.context.featureId,
        implementers: [...new Set(input.implementers)], optionalGates: [...new Set(optionalGates)], dials, ...(replacement ? { priorActive: await this.store.put(replacement.bytes) } : {}),
        ...(recorded ? { workspace: recorded } : {}) }, operation);
    } catch (error) { await prepared?.rollback?.(); throw error; }
    if (replacement) await this.store.supersedeActive(input.runId, replacement);
    else await this.store.activate(input.runId);
    return this.inspect();
  }
  // The adapter's preparation for this request, or (for an embedder holding a
  // resolved context) a preparation that may not move the feature home.
  async prepareWorkspace(value, operation, options = {}) {
    const prepared = this[WORKSPACE_PREPARED] ?? await prepareWorkspace(this.sourceContext, value, this.runtime, { operation, fixedHome: this.store.home, ...options });
    if (prepared.context !== this.sourceContext) {
      requireThat(resolve(prepared.context.featureHome) === resolve(this.sourceContext.featureHome), 'The workspace configuration moved the feature home; run the operation again');
      this.sourceContext = prepared.context;
      this.contextGuard = workflowContextGuard(prepared.context);
    }
    return prepared;
  }
  // Retain the written (and any replaced) configuration bytes with the record.
  async retainWorkspace(prepared) {
    const record = { ...prepared.record };
    if (prepared.bytes) requireThat((await this.store.put(prepared.bytes)).hash === record.file.hash, 'Written workspace configuration changed');
    if (prepared.previousBytes) requireThat((await this.store.put(prepared.previousBytes)).hash === record.previous.file.hash, 'Replaced workspace configuration changed');
    return record;
  }
  // workspace.configure: the standalone write for an existing run without a
  // configuration, with the same rules as run.start (spec AC6).
  async configureWorkspace(input, operation) {
    const prepared = await this.prepareWorkspace(input, 'workspace.configure');
    const { state } = await this.state();
    if (!prepared.bytes) return { workspace: prepared.record, written: false, state };
    try {
      const record = await this.retainWorkspace(prepared);
      return { ...await this.append(state, 'WORKSPACE_CONFIGURED', record, operation), workspace: record, written: true };
    } catch (error) { await prepared.rollback?.(); throw error; }
  }
  async resume(input, operation) {
    let active = null, replacement = null;
    try {
      active = await this.store.active();
      if (active) { await this.store.events(active.runId, { repair: true }); await this.state(); }
    } catch {
      replacement = await this.store.activationHead();
      requireThat(replacement, 'No retained activation can be recovered');
      active = null;
    }
    // Workspace instructions belong to starting a fresh run; never drop one
    // silently when an existing run or retained activation is resumed.
    requireThat(input.workspace === undefined || (!active && !replacement), 'Workspace instructions apply only when resumption starts a fresh run; this resumes an existing run or retained activation');
    // With nothing to resume, resumption starts a fresh run: the run-start
    // workspace rules apply, including the different-feature check (AC6, NEW4).
    if (!active) await this.start(input, operation, replacement, { workspace: !replacement, workspaceOperation: 'run.resume-current' });
    else {
      const { state } = await this.state();
      requireThat(!input.runId || input.runId === state.runId, 'Another current run is already active');
      requireThat(identity(input.implementers) === identity(state.implementers), 'Resume must preserve the implementing contexts');
      // Dial choices apply only when resumption starts a run. Never drop a
      // differing choice silently on an already active run.
      for (const dial of Object.keys(DIALS)) {
        if (input[dial] === undefined || (dial === 'autonomy' ? autonomyAlias(input[dial]?.value) : input[dial]?.value) === state.dials[dial].value) continue;
        requireThat(!(dial === 'rigor' && input[dial]?.value === 'light'), LOWERING_REFUSED);
        requireThat(false, `The active run is already ${dial} ${state.dials[dial].value}; change it with run.set-dial`);
      }
      await this.reconcileCompletedJobs();
    }
    // Supplied approvals are observations of actual instructions, never inferred
    // from old journal semantics. Each durable step reconciles independently.
    const planning = input.planning ?? {};
    const childId = step => `resume_${identity({ run: input.runId ?? active.runId, step, planning }).slice(7)}`;
    if (planning.design) await this.execute({ operation: 'human.decide', operationId: childId('design'), input: { ...planning.design, kind: 'approve-design' } });
    const light = lightRun((await this.state()).state);
    if (!light && (planning.design || planning.implementation)) await this.execute({ operation: 'spec.validate', operationId: childId('spec') });
    if (planning.implementation) await this.execute({ operation: 'human.decide', operationId: childId('implementation'), input: { ...planning.implementation, kind: 'authorize-implementation' } });
    const transitioned = (await this.state()).state;
    if (!transitioned.transition) {
      const documents = {};
      for (const name of ['brief.md', 'interview.md', 'design.md', 'spec.md', 'plan.md', 'issues.md', 'tracker.md', 'scratchpad.md', 'decisions.md']) {
        try { documents[name] = await this.store.fingerprint(name); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      await this.append(transitioned, 'TRANSITION_RECORDED', { contract: CONTRACT,
        history: 'preserved without replay', documents,
        authority: transitioned.decisions.map(item => ({ event: item.event, kind: item.kind, subject: item.subject, authority: item.authority })),
        priorActivation: replacement ? { hash: replacement.hash } : null,
        evidence: replacement || !active ? { reused: [], refreshRequired: GATES.filter(item => !item.supplemental && (!item.optional || transitioned.optionalGates.includes(item.id))).map(item => item.id),
          reason: 'Historical proof lacks the current checker/environment contract. No new execution is inferred.' }
          : { retained: transitioned.results, reason: 'Same-contract evidence remains subject to normal applicability; resume does not rerun it.' } },
      { id: childId('transition'), hash: identity({ run: transitioned.runId, contract: CONTRACT }) });
    }
    return this.inspect();
  }
  obligations(state, at) { return enabled(state, at); }
  async commitments({ capture = true, state = null } = {}) {
    // Without a run (for example before resumption) the built-in rigor is full.
    const run = state ?? (await this.store.active() ? (await this.state()).state : null);
    if (run && lightRun(run)) {
      const docs = await requirements(this.store, ['brief.md'], { capture });
      const subject = identity({ contract: CONTRACT, featureId: this.context.featureId, rigor: 'light', brief: docs['brief.md'] });
      return { docs, subject: await this.authorizedBriefSubject(run, docs['brief.md'], subject) };
    }
    const docs = await requirements(this.store, ['design.md', 'spec.md', 'plan.md', 'issues.md'], { capture });
    return { docs, subject: identity({ contract: CONTRACT, featureId: this.context.featureId, design: docs['design.md'], spec: docs['spec.md'] }) };
  }
  // GitHub issue #145: the findings log of a light brief is meant to grow during
  // the run. While the brief differs from the last authorized brief only inside
  // its findings log, the commitment subject stays the authorized one, so routine
  // logging needs no new authorization. Any other change (goal, scope, preamble,
  // other sections) yields the fresh subject, which needs authorize-implementation.
  // Candidates still pin the exact brief bytes the reviewers assessed.
  async authorizedBriefSubject(state, ref, subject) {
    const authorized = latestImplementation(state);
    const previous = authorized && decisionHas(authorized, 'authorize-implementation') ? authorized.documents?.['brief.md'] : null;
    if (!previous || authorized.subject === subject || previous.hash === ref.hash) return subject;
    try {
      const current = await this.store.localBytes(ref.path);
      if (digest(current) !== ref.hash) return subject; // Changed while reading: fail closed.
      return briefScope(await this.store.get(previous)) === briefScope(current) ? authorized.subject : subject;
    } catch { return subject; } // An unreadable authorized brief never carries authority forward.
  }
  async pendingDecision(value, operation, expectedState = null) {
    const state = expectedState ?? (await this.state()).state;
    const prior = state.pendingDecisions.find(item => item.operation.id === operation.id);
    if (prior) {
      requireThat(prior.operation.hash === operation.hash && identity(prior.decision) === identity(value), 'Pending instruction changed; observe a new instruction for changed commitments');
      return state;
    }
    return (await this.append(state, 'DECISION_PENDING', { decision: value, operation }, { id: `pending_${operation.id}`, hash: operation.hash })).state;
  }
  async specProof(documents, operation, origin) {
    const proof = await validatePlanning((await this.store.get(documents['spec.md'])).toString());
    const reference = await this.store.putJson({ ...proof, runId: origin.runId, operation });
    if (!proof.passed) {
      const payload = { documents, proof: reference, outcome: Number.isInteger(proof.exitCode) ? 'FAIL' : 'UNAVAILABLE', operation };
      const error = new ContractError('Specification validation failed; instruction and diagnostics remain retained', {
        runId: origin.runId, operationId: operation.id, retainedArtifacts: [reference],
      });
      error.artifacts = [reference];
      let checked = origin;
      for (;;) {
        try {
          await this.append(checked, 'VALIDATION_FAILED', payload, { id: `failed_${identity(payload).slice(7)}`, hash: identity(payload) });
          break;
        } catch (cause) {
          // Only unrelated journal contention (for example a pause) may be
          // retried. New validation or replacement never loses its authority.
          let retry = false;
          if (cause.message === 'Concurrent update; inspect current state and retry the same operation') {
            try {
              const current = await this.state();
              const later = current.events.slice(origin.eventCount);
              const freshValidation = later.some(event => event.type === 'SPEC_VALIDATED'
                || event.type === 'DECIDED' && event.payload.specValidation);
              const commitments = await this.commitments({ capture: false, state: current.state });
              retry = current.state.runId === origin.runId && !freshValidation
                && identity(current.state.specValidation) === identity(origin.specValidation)
                && ['spec.md', 'design.md'].every(name => commitments.docs[name].hash === documents[name].hash)
                && current.state.eventCount > checked.eventCount;
              if (retry) checked = current.state;
            } catch { /* Retain the original failure without adopting unknown state. */ }
          }
          if (retry) continue;
          error.cause = cause;
          error.message += `; original validation state changed: ${cause.message}`;
          break;
        }
      }
      throw error;
    }
    return reference;
  }
  async decide(input, operation) {
    let value = decision(input);
    let { state } = await this.state();
    let admission = null;
    const delegated = [DELEGATED_AUTHORITY, AUTONOMOUS_AUTHORITY].includes(value.authority.kind);
    // Any amendment under delegation changes approved scope: hand back (AC5).
    const amendHandBack = value.kind === 'amend' && isDelegated(state);
    // A light brief changed outside its findings log is the light scope-changing
    // amendment. Whatever authority approves it, delegation hands back (AC5);
    // the delegated-evaluator path is refused below, a human one is recorded.
    let scopeHandBack = false;
    if (value.kind === 'approve-design') {
      requireThat(['DESIGNING', 'SPECIFYING', 'PLANNING'].includes(state.phase), 'Use an amendment to change approved delivery requirements');
      const doc = await this.store.capture('design.md');
      requireThat(doc.hash === value.subject, 'Design approval does not match current bytes');
      value.documents = { 'design.md': doc };
      value.interview = await this.store.capture('interview.md');
    } else if (value.kind === 'authorize-implementation' && lightRun(state)) {
      // Supervised light: the observed human instruction binds the current brief.
      // Re-authorizing a changed brief supersedes earlier authority and candidates.
      requireThat(!['INTEGRATED', 'COMPLETE'].includes(state.phase), 'Implementation authorization is outside the light run phase');
      const current = await this.commitments({ state });
      assertBrief(await this.store.get(current.docs['brief.md']));
      requireThat(value.subject === current.subject, 'Implementation authorization does not match the current brief');
      value.documents = current.docs;
      scopeHandBack = !delegated && isDelegated(state) && await briefScopeChanged(this, state, value.documents);
    } else if (value.kind === 'authorize-implementation') {
      const current = await this.commitments({ state });
      // After a hand-back the human re-authorizes the unchanged commitments in place.
      const reauthorize = ['IMPLEMENTING', 'ACCEPTING'].includes(state.phase) && voidedDelegation(state, latestImplementation(state));
      requireThat((state.phase === 'PLANNING' || reauthorize) && state.specValidation, 'Validate specification before implementation authorization');
      requireThat(currentDesignApproval(state, current.docs['design.md'].hash), 'Design approval is not current');
      requireThat(state.specValidation.spec.hash === current.docs['spec.md'].hash && state.specValidation.design.hash === current.docs['design.md'].hash,
        'Specification validation is not current');
      await assertPlanningProof(await this.store.json(state.specValidation.proof));
      requireThat(value.subject === current.subject, 'Implementation authorization does not match current commitments');
      value.documents = current.docs;
    } else if (value.kind === 'amend') {
      requireThat(!lightRun(state), 'A light run has no design or specification to amend; authorize the changed brief with authorize-implementation');
      const current = await this.commitments({ state });
      requireThat(value.subject === current.subject, 'Amendment must bind the new commitments');
      const previous = latestImplementation(state);
      requireThat(previous && input.previousSubject === previous.subject, 'Amendment must identify the prior authorized commitments');
      value.previousSubject = previous.subject;
      value.previousDocuments = previous.documents;
      value.documents = current.docs;
      // The instruction approves the named design delta; spec proof still needs refresh.
      value.approvedDesign = current.docs['design.md'];
      { const interview = await captureInterview(this.store); if (interview) value.interview = interview; }
      if (decisionHas(value, 'authorize-implementation')) {
        if (!delegated) state = await this.pendingDecision(value, operation, state);
        const proof = await this.specProof(current.docs, operation, state);
        for (const ref of Object.values(current.docs)) await this.store.currentBytes(ref);
        value.specValidation = { spec: current.docs['spec.md'], design: current.docs['design.md'], proof };
      }
    } else if (value.kind === 'stay-light') {
      // Supervised light only: the human keeps light rigor despite these exact
      // tripwire hits. Under delegation a hit escalates instead (spec AC4).
      requireThat(lightRun(state), 'Stay-light applies only to a light run; this run is already full rigor');
      requireThat(!hasRunAuthority(state), 'Under delegated autonomy a tripwire hit escalates the run to full; a stay-light decision is rejected');
      requireThat(state.candidate, 'Prepare a candidate before deciding on its tripwire hits');
      const evaluation = await evaluateTripwires(this.context, await checkCandidate(this.store, this.context, state.candidate));
      requireThat(evaluation.hits.length, 'The current candidate has no tripwire hits; there is nothing to decide');
      requireThat(value.subject === evaluation.subject, `Stay-light must bind the current tripwire hit set (subject ${evaluation.subject}); new hits need a new decision`);
      value.hits = [...new Set(evaluation.hits.map(hitKey))].sort();
      value.candidate = state.candidate;
    } else if (value.kind === 'review-rounds') {
      // Round 6 hand-back (spec AC6): the human continues or splits; amend and
      // waive are their own decisions. Never delegated or autonomous.
      requireThat(value.authority.kind === 'human-confirmed', 'A review-rounds decision needs an observed human instruction');
      requireThat(ROUND_CHOICES.includes(value.choice), `Choose ${ROUND_CHOICES.join(' or ')} (amend and waive are separate decisions)`);
      const scope = state.reviewScopes[value.reviewScope];
      requireThat(scope && scope.round >= HANDBACK_AT, `Review scope ${value.reviewScope} has not reached round ${HANDBACK_AT}`);
      const subject = value.reviewScope.startsWith('planning:') ? scope.revisions.at(-1).revision : state.candidate?.hash;
      requireThat(value.subject === subject, `A review-rounds decision binds the scope's current revision (subject ${subject})`);
    } else if (value.kind === 'authorize-standing') {
      value = await captureStanding(this, state, value);
    } else if (value.kind === 'revoke-standing') {
      requireThat(state.decisions.some(item => item.kind === 'authorize-standing' && item.event === value.subject), 'Revocation must name a recorded standing grant');
    } else {
      requireThat(state.candidate && value.subject === state.candidate.hash, 'Decision must bind the current candidate');
      const candidate = await checkCandidate(this.store, this.context, state.candidate);
      if (decisionHas(value, 'waive')) {
        value.candidate = state.candidate; value.applicability = contentIdentity(candidate); value.risks = {};
        const pending = state.pendingDecisions.find(item => item.operation.id === operation.id);
        const known = new Set();
        for (const id of value.gates) {
          value.risks[id] = pending ? pending.decision.risks[id] : await this.waiverRisk(state, candidate, id);
          if (id === 'review') {
            for (const reference of state.results) {
              const report = await this.store.json(reference);
              if (report.gate === 'review') for (const finding of report.findings ?? []) if (finding.blocking) known.add(finding.id);
            }
            continue;
          }
          for (const ref of [...state.results].reverse()) {
            const report = await this.store.json(ref); if (report.gate !== id) continue;
            for (const finding of report.findings ?? []) if (finding.blocking) known.add(finding.id);
            break;
          }
        }
        requireThat(pending || !value.findings || value.findings.every(id => known.has(id)), 'Finding exception must identify current blocking findings');
      }
      if (value.waiverBasis) await this.store.get(value.waiverBasis.evidence);
      if (value.kind === 'waive') for (const id of value.gates) requireThat(
        waiverPolicyAllows(state, id, value.subject, value.applicability, value.waiverBasis),
        `${id} requires a policy amendment or its permitted waiver basis`);
      state = await this.pendingDecision(value, operation, state);
      const proposed = { ...state, decisions: [...state.decisions, value] };
      if (decisionHas(value, 'accept')) {
        admission = await this.check('acceptance', proposed);
        requireThat(admission.allowed, `Required review proof is missing: ${admission.missing.join('; ')}`, { missing: admission.missing });
      }
      // GitHub issue #145: a waiver records what it waived as observed when the
      // human decided (outcome, reason and any waived coverage residual), so the
      // retained decision stays honest about the facts it accepted.
      if (decisionHas(value, 'waive')) {
        const observed = (admission ?? await this.check(value.gates.some(id => gate(id).at === 'completion') ? 'completion' : 'acceptance', proposed)).outcomes ?? [];
        value.observed = Object.fromEntries(value.gates.map(id => {
          const outcome = observed.find(item => item.id === id);
          return [id, outcome ? { outcome: outcome.outcome, reason: outcome.reason ?? null, waived: Boolean(outcome.exception),
            ...(outcome.waivedCoverage ? { waivedCoverage: outcome.waivedCoverage } : {}) } : { outcome: null, reason: 'not assessed by this milestone check', waived: false }];
        }));
      }
      if (decisionHas(value, 'authorize-merge')) {
        requireThat(findDecision(proposed, 'accept', value.subject), 'Human acceptance is required before merge authorization');
        requireThat(value.action && identity(value.action) === identity(await prepareMerge(this, value.action)), 'Merge authorization must bind the prepared action');
        // R9: the PR presents the current independent review before authorization.
        await requirePublishedReview(this, value.action);
      }
    }
    if (delegated) {
      // Delegated planning: cite the delegation and a qualifying independent
      // planning review PASS, then re-observe release-branch protection.
      value.authority = await delegatedPlanningAuthority(this, state, value);
      if (value.kind === 'authorize-implementation' && lightRun(state) && isDelegated(state)) await assertBriefScopeUnchanged(this, state, value.documents);
      await guardDelegatedAction(this, state, `delegated ${value.kind}`);
    }
    if (decisionHas(value, 'authorize-merge')) await checkCandidate(this.store, this.context, state.candidate);
    for (const ref of Object.values(value.documents ?? {})) await this.store.currentBytes(ref);
    if (admission) await this.assertLiveInputs({ ...state, decisions: [...state.decisions, value] }, 'acceptance', admission.liveInputs);
    else await this.assertContext();
    if (value.kind === 'authorize-standing') requireUnexpired(value);
    if (amendHandBack || scopeHandBack) {
      const change = automaticDial(state, 'autonomy', 'supervised', 'amend', amendHandBack
        ? 'A scope-changing amendment was recorded under delegated autonomy; stop for the human'
        : 'The brief changed outside its findings log and was re-authorized under delegated autonomy; a scope-changing amendment returns the run to supervised');
      state = (await this.append(state, 'DIAL_SET', change, { id: `handback_${identity({ operation: operation.id }).slice(7, 71)}`, hash: identity(change) })).state;
    }
    return this.append(state, 'DECIDED', { ...value, requestId: operation.id }, operation);
  }
  async validateSpec(operation) {
    const { state } = await this.state();
    const current = ['SPECIFYING', 'PLANNING'].includes(state.phase) ? null : await this.commitments({ state });
    requireThat(['SPECIFYING', 'PLANNING'].includes(state.phase) || (state.phase !== 'COMPLETE' && findDecision(state, 'authorize-implementation', current.subject)), 'Specification validation is not available without current planning or implementation authority');
    const docs = await requirements(this.store);
    const approval = currentDesignApproval(state, docs['design.md'].hash);
    requireThat(approval, 'Current design approval is required');
    const proof = await this.specProof(docs, operation, state);
    for (const ref of Object.values(docs)) await this.store.currentBytes(ref);
    return this.append(state, 'SPEC_VALIDATED', { spec: docs['spec.md'], design: docs['design.md'], proof }, operation);
  }
  async prepare(input, operation) {
    const { state } = await this.state();
    requireThat((await this.check('implementation')).allowed && state.phase !== 'COMPLETE', 'Current implementation authority is required');
    const current = await this.commitments({ state });
    // Spec AC13 (D33): the paired review reads these lifecycle documents; a
    // missing one fails here by name, not later as an unavailable review.
    if (!lightRun(state)) {
      const missing = [];
      for (const name of REVIEW_SUPPORT_DOCUMENTS) {
        try { await this.store.fingerprint(name); } catch (error) { if (error.code !== 'ENOENT') throw error; missing.push(name); }
      }
      requireThat(!missing.length, `Missing lifecycle document${missing.length > 1 ? 's' : ''} ${missing.join(', ')} in the feature folder; create ${missing.length > 1 ? 'them' : 'it'} (workflow-branch-bootstrap) before candidate.prepare`);
    }
    const authorization = findDecision(state, 'authorize-implementation', current.subject);
    const preparation = await sourcePreparation(this.store, this.context, input, state.runId, operation);
    const pendingId = `source_${preparation.id}`;
    const pending = (await this.state()).events.find(event => event.operation.id === pendingId);
    let preparedState = state;
    if (pending) requireThat(identity(pending.payload) === identity(preparation), 'Source preparation changed during retry');
    else preparedState = (await this.append(state, 'SOURCE_PREPARING', preparation, { id: pendingId, hash: identity(preparation) })).state;
    try {
      await ensurePins(this.context, preparation);
      const candidate = await sourceCandidate(this.store, this.context, input, { event: authorization.event, subject: authorization.subject, documents: authorization.documents }, preparation, { light: lightRun(state) });
      // A light candidate is classified before it is published (spec AC4); an
      // invalid tripwire configuration fails the preparation, never passes it.
      const tripwires = lightRun(state) ? await evaluateTripwires(this.context, candidate.value) : null;
      const published = await this.append(preparedState, 'CANDIDATE', { ...candidate.ref, preparationId: preparation.id }, operation);
      if (!tripwires) return published;
      const recorded = await this.recordTripwires(published.state, tripwires, 'candidate.prepare', operation.id);
      return { ...published, state: recorded.state, tripwires: { hits: tripwires.hits, subject: tripwires.subject, escalated: recorded.escalated } };
    } catch (error) {
      // Retain pins until this operation retries or the run completes. A second
      // process may still be preparing the same operation; never delete its pins.
      const currentState = (await this.state()).state;
      if (currentState.runId === state.runId && currentState.sourcePreparationStatus[preparation.id]?.status !== 'published') {
        const failure = { id: preparation.id, reason: `${error.message}; owned refs retained. Retry the same preparation operation and input to reconcile.` };
        await this.append(currentState, 'SOURCE_PREPARATION_FAILED', failure,
          { id: `source_failure_${randomUUID()}`, hash: identity(failure) });
      }
      throw error;
    }
  }
  async readiness(operation) {
    const { state } = await this.state();
    requireThat(state.candidate, 'Prepare a candidate first');
    await checkCandidate(this.store, this.context, state.candidate);
    requireThat((await this.check('implementation')).allowed, 'Current implementation authority is required');
    return this.append(state, 'READY', { candidate: state.candidate }, operation);
  }
  async inventory(state, candidate, memo = new Map()) {
    const inventory = [];
    const supplemental = new Set([...Object.values(state.jobs).flatMap(job => job.gates ?? []), ...state.decisions.flatMap(item => item.gates ?? [])]);
    const definitions = [...this.obligations(state, 'acceptance'), ...GATES.filter(item => item.supplemental && supplemental.has(item.id))];
    for (const definition of definitions.filter(item => item.id !== 'packet')) {
      if (definition.id === 'review') {
        try {
          const pair = await boundaryReviews(this, state, candidate, memo);
          inventory.push({ gate: 'review', reference: null, references: pair.members.map(member => member.ref), outcome: pair.outcome, pair: pair.identity,
            initialProof: pair.initialProof ? [pair.initialProof.baseline, ...pair.initialProof.reviews] : [] });
        } catch (error) { inventory.push({ gate: 'review', reference: null, outcome: 'UNAVAILABLE', reason: error.message }); }
        continue;
      }
      let reference = null, result = null;
      for (const ref of [...state.results].reverse()) {
        let raw;
        try { raw = await this.store.json(ref); } catch { continue; }
        if (raw.gate !== definition.id) continue;
        try { result = await this.currentResult(ref, candidate, state, new Set(), memo); reference = ref; break; }
        catch { /* Missing current proof is explicit; retained history is untouched. */ }
      }
      inventory.push({ gate: definition.id, reference, outcome: result?.outcome ?? 'UNAVAILABLE' });
    }
    return inventory;
  }
  async verificationCoverage(candidate, state, memo) {
    const required = new Set(), covered = new Map();
    for (const ref of state.results) {
      let result, inputs, prior;
      try { result = await this.store.json(ref); if (result.gate !== 'verification') continue; inputs = await this.store.json(result.input); prior = await this.store.json(inputs.candidate); }
      catch { continue; } // Lost historical inputs are reported, never treated as proof.
      if (prior.authorization.subject !== candidate.authorization.subject || !prior.criteria.some(id => candidate.criteria.includes(id))) continue;
      // Only executed checks establish durable coverage obligations. Malformed or
      // unstarted declarations retain diagnostics but cannot poison future coverage.
      let execution; try { execution = result.runner ? await this.store.json(result.runner) : null; } catch { continue; }
      const checks = (execution?.receipts ?? []).filter(check => candidate.repositories.some(repo => repo.alias === check.repository));
      const ids = checks.map(checkIdentity);
      // Completed checks establish coverage obligations, not mere job launches.
      for (const id of ids) required.add(id);
      try {
        await this.currentResult(ref, candidate, state, new Set(), memo, false);
        for (const id of ids) covered.set(id, result.outcome === 'PASS');
      } catch { /* Historical success cannot fill current coverage. */ }
    }
    const pairedReplacements = new Map();
    // Semantic supersession is established by an existing independent spec or
    // Judge result. A model-authored claim alone never satisfies coverage.
    for (const ref of [...state.results].reverse()) {
      let report, inputs;
      try {
        report = await this.store.json(ref);
        if (!['review', 'spec', 'judge'].includes(report.gate) || report.outcome !== 'PASS') continue;
        inputs = await this.store.json(report.input);
        if (!(inputs.coverageClaims ?? []).length) continue;
        await this.currentResult(ref, candidate, state, new Set(), memo, false);
      } catch { continue; }
      for (const claim of inputs.coverageClaims) {
        if (!report.coverageDecisions?.some(item => item.id === claim.id && item.outcome === 'PASS')) continue;
        if (claim.kind === 'check-replacement') {
          // Spec AC13 (D33): the declared replacement counts once both members
          // of one recorded paired boundary round (BOUNDARY_REVIEWED) accepted
          // it and its verification is still current and passing. A standalone
          // spec, judge or review decision, or reviews from different rounds,
          // are not enough.
          if (report.gate !== 'review') continue;
          const round = state.boundaryReviewHistory.find(entry => entry.outcomes?.some(outcome => outcome.results?.some(item => item.hash === ref.hash)));
          if (!round) continue;
          const provider = round.outcomes.find(outcome => outcome.results?.some(item => item.hash === ref.hash)).provider;
          try { if ((await this.currentResult(claim.verification, candidate, state, new Set(), memo, false)).outcome !== 'PASS') continue; }
          catch { continue; } // A stale replacement cannot cover prior behavior.
          const key = `${round.event}:${claim.verification.hash}:${checkIdentity(claim.replaces)}`;
          const entry = pairedReplacements.get(key) ?? pairedReplacements.set(key, { identity: checkIdentity(claim.replaces), providers: new Set(), required: round.outcomes.length }).get(key);
          entry.providers.add(provider);
          continue;
        }
        let applicable = true;
        for (const replacement of claim.replacements) {
          try { if ((await this.currentResult(replacement, candidate, state, new Set(), memo, false)).outcome !== 'PASS') applicable = false; }
          catch { applicable = false; }
        }
        if (!applicable) continue;
        for (const prior of claim.supersedes) {
          const original = await this.store.json(prior), runner = await this.store.json(original.runner);
          for (const check of runner.receipts) covered.set(checkIdentity(check), true);
        }
      }
    }
    for (const { identity: replaced, providers, required } of pairedReplacements.values()) if (providers.size >= 2 && providers.size === required) covered.set(replaced, true);
    requireThat([...required].every(id => covered.get(id) === true), 'Verification has uncovered prior behavior; rerun checks or qualify replacement coverage in the existing independent review');
  }
  async recordedResult(ref, state) {
    requireThat(state.results.some(item => item.hash === ref.hash), 'Result is not recorded in this run');
    const result = await this.store.json(ref), receipt = await this.store.json(result.receipt);
    const job = state.jobs[receipt.jobId], retained = job ? await this.store.job(receipt.jobId) : null;
    requireThat(job?.finished && job.input?.hash === result.input?.hash
      && job.results.some(item => item.hash === ref.hash)
      && retained?.runId === state.runId && retained.results.some(item => item.hash === ref.hash),
      'Result lacks its recorded execution and retained service outcome');
    requireThat(receipt.kind === 'execution' && receipt.role === gate(result.gate).role,
      'Execution receipt role differs from the gate');
    return { result, receipt };
  }
  async evidenceIdentity(ref, candidate, state, memo = new Map()) {
    const result = await this.currentResult(ref, candidate, state, new Set(), memo, false);
    if (gate(result.gate).role !== 'runner' || result.outcome !== 'PASS') return ref.hash;
    const input = await this.store.json(result.input), runner = await this.store.json(result.runner);
    // Preserve all substantive check facts, including output bytes. Only wrapper
    // identity and execution timestamps are irrelevant to this exact equivalence.
    return identity({ policy: 'runner-equivalence/1', gate: result.gate, source: contentIdentity(candidate),
      configuration: input.configuration, environment: input.environment,
      receipts: runner.receipts.map(({ startedAt, completedAt, ...check }) => check) });
  }
  async currentResult(ref, candidate, state, seen = new Set(), memo = new Map(), requireCoverage = true, historicalAncestry = false) {
    requireThat(!seen.has(ref.hash), 'Cyclic evidence references');
    const key = `qualified:${state.runId}:${state.eventCount}:${ref.hash}:${contentIdentity(candidate)}:${requireCoverage}:${historicalAncestry}`;
    if (!memo.has(key)) memo.set(key, this.qualifyResult(ref, candidate, state, seen, memo, requireCoverage, historicalAncestry));
    return memo.get(key);
  }
  async qualifyResult(ref, candidate, state, seen, memo, requireCoverage, historicalAncestry) {
    requireThat(!seen.has(ref.hash), 'Cyclic evidence references');
    seen.add(ref.hash);
    if (!memo.has(RETAINED_CLOSURE)) memo.set(RETAINED_CLOSURE, new Set());
    await this.store.closure(ref, memo.get(RETAINED_CLOSURE));
    const { result, receipt } = await this.recordedResult(ref, state);
    if (!historicalAncestry && result.outcome === 'PASS') {
      const started = state.jobs[receipt.jobId].sequence;
      for (const pending of Object.values(state.jobs)) if (!pending.finished && !pending.abandoned && pending.gates?.includes(result.gate)) {
        const known = await this.store.job(pending.jobId);
        requireThat(!known && !pending.ready && pending.sequence < started, 'Pending execution requires retained-outcome reconciliation or fresh proof after unknown work');
      }
    }
    requireThat(result.contract === CONTRACT && result.kind === 'result', 'Invalid current result');
    const definition = gate(result.gate);
    // Evidence loss is a barrier, not permission to fall back to an older PASS.
    // A fresh result after the barrier can recover without reconstructing bytes.
    const lossKey = `losses:${state.runId}:${state.eventCount}`;
    if (!memo.has(lossKey)) memo.set(lossKey, this.historyGaps(state, memo));
    const position = state.results.findLastIndex(item => item.hash === ref.hash);
    for (const gap of await memo.get(lossKey)) requireThat(
      gap.gate !== null && gap.gate !== result.gate || position > gap.position,
      'Historical evidence loss requires fresh proof for this gate');
    requireThat(result.runId === state.runId && result.featureId === state.featureId, 'Result belongs to another run');
    if (!historicalAncestry && result.outcome === 'PASS' && ['independent', 'assessment'].includes(definition.role)) {
      const barrierKey = `blocking-review:${state.eventCount}:${result.gate}:${contentIdentity(candidate)}`;
      if (!memo.has(barrierKey)) {
        const findings = new Map(); let barrier = -1;
        for (const [index, laterRef] of state.results.entries()) {
          let report; try { report = await this.store.json(laterRef); } catch { continue; }
          let reportRole; try { reportRole = gate(report.gate).role; } catch { continue; }
          if (!['independent', 'assessment'].includes(reportRole)) continue;
          let reportCandidate;
          try { reportCandidate = await this.store.json((await this.store.json(report.input)).candidate); } catch { /* Available finding facts still inform the barrier. */ }
          const scopeOverlaps = reportCandidate?.criteria.some(id => candidate.criteria.includes(id))
            && reportCandidate.repositories.some(repo => candidate.repositories.some(selected => identity(selected.identity) === identity(repo.identity)));
          for (const finding of report.findings ?? []) if (finding.blocking) findings.set(`${report.gate}:${finding.id}`, finding);
          const raised = [...(report.findings ?? []).filter(finding => finding.blocking),
            ...(report.dispositions ?? []).filter(item => item.status === 'present').map(item => findings.get(`${report.gate}:${item.id}`)).filter(Boolean)];
          const failedCriteria = (report.criteria ?? []).filter(row => row.outcome === 'FAIL');
          const supportedBlocker = raised.some(finding =>
            (candidate.criteria.includes(finding.criterion) || finding.criterion === `gate:${report.gate}`)
            && (candidate.repositories.some(repo => finding.path.startsWith(`${repo.alias}/`))
              || ['requirements/brief.md', 'requirements/spec.md', 'requirements/design.md', 'planning/plan.md', 'planning/issues.md',
                'planning/tracker.md', 'planning/scratchpad.md', 'planning/decisions.md'].includes(finding.path)));
          const failedScope = scopeOverlaps && failedCriteria.some(row => candidate.criteria.includes(row.id));
          // Code review may legitimately omit criterion rows. Its bound candidate
          // still scopes required coverage failures; transport UNAVAILABLE alone
          // does not revoke otherwise applicable independent proof.
          const unscoredFailure = report.outcome === 'FAIL' && scopeOverlaps
            && (!report.coverage?.complete || report.coverage.limitations?.length
              || failedCriteria.length === 0 && raised.length === 0);
          if (supportedBlocker || failedScope || unscoredFailure) {
            const recorded = Object.values(state.jobs).find(job => job.finished && job.results?.some(ref => ref.hash === laterRef.hash));
            barrier = Math.max(barrier, recorded?.finishedSequence ?? Number.MAX_SAFE_INTEGER);
          }
        }
        memo.set(barrierKey, barrier);
      }
      requireThat(state.jobs[receipt.jobId].sequence > memo.get(barrierKey), 'Newer blocking review requires fresh assessment started after its evidence; older PASS is historical support only');
    }
    requireThat(receipt.contract === CONTRACT && receipt.runId === state.runId && receipt.input === result.input.hash
      && receipt.gates.includes(result.gate), 'Execution receipt binding mismatch');
    if (definition.role === 'independent' && result.outcome !== 'UNAVAILABLE') requireThat(receipt.evaluator?.freshContext === true
      && receipt.evaluator.inheritedTurns === 0 && typeof receipt.evaluator.contextId === 'string'
      && !state.implementers.includes(receipt.evaluator.contextId), 'Independent evaluator is not qualified');
    const inputs = await this.store.json(result.input);
    requireThat(inputs.contract === CONTRACT && inputs.gates.includes(result.gate), 'Result input binding mismatch');
    if (result.gate === 'review' && isAutonomous(state)) requireThat(inputs.mandate
      && identity(inputs.mandate) === identity(state.dials.autonomy.mandate), 'Boundary review does not assess the current fixed mandate');
    // A goal run's boundary review must have assessed the current agent
    // decision entries (spec AC6): a review from before a raise to goal or
    // before a new agent entry no longer qualifies.
    if (result.gate === 'review' && isGoal(state)) {
      const decisionsKey = `agent-decisions:${this.context.featureHome}`;
      if (!memo.has(decisionsKey)) memo.set(decisionsKey, agentDecisions(this.context.featureHome));
      requireThat(identity(inputs.agentDecisions ?? null) === identity({ rule: AGENT_DECISION_RULE, entries: await memo.get(decisionsKey) }),
        'Boundary review did not assess the current agent decision entries; run the paired review again');
    }
    if (['independent', 'assessment'].includes(definition.role) && result.outcome !== 'UNAVAILABLE') {
      validateEvaluatorCapability(receipt.evaluator?.capabilityProfile, receipt.evaluator?.reasoningEffort);
      requireThat(identity(receipt.evaluator.capabilityProfile) === identity(HIGH_CAPABILITY_PROFILE)
        && receipt.evaluator.reasoningEffort === (inputs.configuration.reasoningEffort ?? 'high')
        && receipt.evaluator.provider === inputs.configuration.provider && receipt.evaluator.model === inputs.configuration.model,
      'Retained evaluator qualification differs from the requested proof');
    }
    requireThat(retainedContractQualifies(inputs, reviewContract(inputs.gates, candidate)), 'Evaluator rules or output contract changed');
    if (inputs.pattern) requireThat(identity(inputs.pattern) === identity(await patternInputs(this.store, this.context, candidate, { ...this.runtime.pythonGuardOptions, capture: false })), 'Pattern policy or trigger inputs changed');
    const evaluated = await checkCandidate(this.store, this.context, inputs.candidate, { live: false, memo });
    for (const artifact of result.artifacts ?? []) await this.store.get(artifact);
    for (const ref of inputs.support ?? []) await this.store.currentBytes(ref);
    const environmentKey = identity({ configuration: inputs.configuration, source: contentIdentity(candidate), runner: definition.role === 'runner' });
    // Qualification may share the operation's observation; guards re-observe.
    if (!memo.has(environmentKey)) memo.set(environmentKey, executionEnvironment(this.context, candidate, inputs.configuration, definition.role === 'runner', process.env));
    assertEnvironmentCurrent(inputs.environment, await memo.get(environmentKey));
    if (gate(result.gate).at === 'completion') requireThat(identity(inputs.integrations) === identity(state.integrations), 'Integration source changed');
    if (inputs.validUntil) requireThat(Date.now() <= Date.parse(inputs.validUntil), 'External evidence validity expired');
    if (result.gate === 'release' && result.outcome === 'PASS') await this.refreshRelease(result, candidate, state);
    if (result.mode === 'delta') {
      requireThat(definition.role === 'independent' && result.prior && result.coverage?.complete === true, 'Delta requires independent coverage and prior proof');
      const prior = await this.currentResult(result.prior, await this.store.json(result.priorCandidate), state, new Set(seen), memo, true, true);
      requireThat(prior.outcome === 'PASS' && prior.gate === result.gate, 'Delta prior proof is not passing evidence for this gate');
      if (result.gate === 'review') requireThat((await this.store.json(prior.input)).configuration.provider === inputs.configuration.provider,
        'A review delta cannot borrow the other provider perspective');
    }
    requireThat(contentIdentity(evaluated) === contentIdentity(candidate), 'Result is not applicable to current inputs');
    for (const dependency of inputs.consumed ?? []) await this.currentResult(dependency, candidate, state, new Set(seen), memo, requireCoverage);
    if (definition.role === 'runner' && result.outcome === 'PASS') {
      const runner = result.runner ? await this.store.json(result.runner) : null;
      requireThat(Array.isArray(inputs.configuration.checks) && (inputs.configuration.checks.length > 0 || runner?.validation?.kind === 'ci')
        && runner?.receipts?.length === inputs.configuration.checks.length
        && runner.receipts.every((item, index) => item.outcome === 'PASS' && item.exitCode === 0
          && identity({ repository: item.repository, command: item.command, args: item.args })
            === identity({ repository: inputs.configuration.checks[index].repository, command: inputs.configuration.checks[index].command, args: inputs.configuration.checks[index].args })),
        'Passing runner proof requires every declared check and actual successful receipts');
    }
    // Historical command coverage is qualified at the milestone, after the
    // independent review can assess replacements without a circular dependency.
    if (result.gate === 'retention') {
      // Retention is live integrity proof, not a permanent fact about an earlier
      // successful read. Later failed validations add obligations even when the
      // approved specification is subsequently restored byte-for-byte.
      requireThat(identity(result.retained?.validationFailures ?? null) === identity(state.validationFailures),
        'Failed specification evidence inventory changed; refresh retention proof');
      await this.store.closure([state.candidate, state.decisions, state.integrations, state.validationFailures]);
    }
    if (result.gate === 'packet') requireThat(identity(result.inventory) === identity(await this.inventory(state, candidate, memo)), 'Review packet inventory changed');
    memo.get(LIVE_PROOFS)?.set(identity({ ref, source: contentIdentity(candidate) }), { ref, candidate });
    return result;
  }
  async refreshRelease(result, candidate, state) {
    requireThat(result.observations?.length === candidate.repositories.length, 'Shared release observations are incomplete');
    for (const pin of candidate.repositories) {
      const previous = result.observations.find(item => item.repository === pin.alias)?.evidence?.sharedReceipt;
      requireThat(previous?.artifactId && previous.digest, 'Release evidence needs a current shared receipt');
      const repository = this.context.repositories.find(item => item.alias === pin.alias);
      const source = state.integrations[pin.alias]?.integrationSha;
      const refreshed = await (this.runtime.observeRelease ?? observeReleaseConductor)({ requestId: 'release-freshness',
        module: { id: 'gatereeve/release' }, input: { scope: 'FEATURE', inputFingerprint: result.input.hash,
          evidence: { repositoryRoot: repository.path, workspaceRoot: this.context.workspaceRoot,
            releaseArtifactId: previous.artifactId, mergeInputSha: source } } });
      requireThat(refreshed.outcome === 'PASS' && refreshed.observedInputFingerprint === result.input.hash
        && refreshed.evidence?.featureMergeInputSha === source
        && refreshed.evidence.sharedReceipt?.digest === previous.digest
        && refreshed.evidence.sharedReceipt?.stateSha256 === previous.stateSha256,
      'Shared release identity or mutable provider facts no longer qualify');
    }
  }
  async waiverRisk(state, candidate, id) {
    let inputs = { configuration: null, consumed: [], support: [] }, findings = [];
    for (const ref of [...state.results].reverse()) {
      const report = await this.store.json(ref); if (report.gate !== id) continue;
      await this.store.closure(ref); await this.recordedResult(ref, state);
      inputs = await this.store.json(report.input);
      findings = (report.findings ?? []).filter(item => item.blocking).map(item => identity(item)).sort(); break;
    }
    const gaps = await this.historyGaps(state);
    const scope = async (gateId, input, seen = new Set()) => {
      const dependencies = [];
      for (const ref of input.consumed ?? []) {
        requireThat(!seen.has(ref.hash), 'Cyclic exception evidence');
        await this.store.closure(ref);
        const { result } = await this.recordedResult(ref, state);
        dependencies.push({ reference: ref.hash, risk: await scope(result.gate, await this.store.json(result.input), new Set(seen).add(ref.hash)) });
      }
      const paths = new Set((input.support ?? []).map(ref => ref.path));
      for (const path of gateId === 'triage' ? ['scratchpad.md'] : gateId === 'reconcile' ? ['plan.md', 'issues.md', 'tracker.md'] : []) paths.add(path);
      const support = [];
      for (const path of [...paths].sort()) {
        try { support.push(await this.store.fingerprint(path)); }
        catch (error) { if (error.code !== 'ENOENT') throw error; support.push({ path, missing: true }); }
      }
      const validators = ['reconcile', 'triage'].includes(gateId) ? [await planningBinding()] : [];
      return identity({ validators, configuration: input.configuration, dependencies, support, rule: reviewContract([gateId], candidate),
        pattern: gateId === 'pattern' ? await patternInputs(this.store, this.context, candidate, { ...this.runtime.pythonGuardOptions, capture: false, allowMissing: true }) : null,
        externalValidity: !input.validUntil || Date.now() <= Date.parse(input.validUntil),
        integrations: gate(gateId).at === 'completion' ? state.integrations : null,
        historyGaps: gaps.filter(gap => gap.gate === null || gap.gate === gateId),
        environment: await executionEnvironment(this.context, candidate, input.configuration ?? {}, gate(gateId).role === 'runner', process.env) });
    };
    const reviews = [];
    if (id === 'review') for (const reference of state.results) {
      const report = await this.store.json(reference);
      if (report.gate !== 'review') continue;
      await this.store.closure(reference); await this.recordedResult(reference, state);
      reviews.push({ reference, execution: await scope(id, await this.store.json(report.input)), findings: report.findings ?? [] });
    }
    return identity({ findings, execution: await scope(id, inputs), ...(id === 'review' ? { selection: state.reviewerSelection?.event ?? null, reviews } : {}) });
  }
  async assertLiveInputs(state, name, liveInputs) {
    const admission = admissions.get(liveInputs);
    requireThat(admission, 'Missing in-process milestone input qualification');
    // Recheck the inputs of proofs already qualified above. Do not rerun gates
    // or the recursive history/coverage assessment. Each environment/closure is
    // freshly read once per final guard, never reused from earlier qualification.
    const environments = new Map(), retained = new Set(), patterns = new Map(), deadlines = [];
    await this.store.closure([state.decisions, state.specValidation], retained);
    if (state.specValidation && !lightRun(state)) await assertPlanningProof(await this.store.json(state.specValidation.proof));
    for (const { ref, candidate } of admission.proofs.values()) {
      await this.store.closure(ref, retained);
      const { result } = await this.recordedResult(ref, state);
      const inputs = await this.store.json(result.input), definition = gate(result.gate);
      if (result.gate === 'release') await this.refreshRelease(result, candidate, state);
      for (const support of inputs.support ?? []) await this.store.currentBytes(support);
      const environmentKey = identity({ configuration: inputs.configuration, source: contentIdentity(candidate), runner: definition.role === 'runner' });
      if (!environments.has(environmentKey)) environments.set(environmentKey,
        await executionEnvironment(this.context, candidate, inputs.configuration, definition.role === 'runner', process.env));
        assertEnvironmentCurrent(inputs.environment, environments.get(environmentKey), 'Execution environment changed during milestone validation');
      if (inputs.pattern) {
        const key = contentIdentity(candidate);
        if (!patterns.has(key)) patterns.set(key, await patternInputs(this.store, this.context, candidate, { ...this.runtime.pythonGuardOptions, capture: false }));
        requireThat(identity(inputs.pattern) === identity(patterns.get(key)), 'Pattern policy or trigger inputs changed during milestone validation');
      }
      if (inputs.validUntil) deadlines.push(Date.parse(inputs.validUntil));
    }
    if (admission.administrative.size) {
      const candidate = await this.store.json(state.candidate), memo = new Map();
      for (const [id, previous] of admission.administrative) {
        const current = await coreEvidence(this, state, candidate, id, [], memo);
        requireThat(identity(previous) === identity(current), `Administrative ${id} inputs changed during milestone validation`);
      }
    }
    if (admission.historyGaps) requireThat(identity(await this.historyGaps(state)) === admission.historyGaps,
      'Retained evidence availability changed during milestone validation');
    if (admission.adjudication) {
      const candidate = await this.store.json(state.candidate);
      const pair = await boundaryReviews(this, state, candidate);
      const current = await currentAdjudication(this, state, pair);
      requireThat(current?.event === admission.adjudication.event, 'Autonomous adjudication changed during milestone validation');
    }
    if (admission.exceptions.length) {
      const candidate = await this.store.json(state.candidate);
      for (const outcome of admission.exceptions) {
        let report = outcome.result ? await this.store.json(outcome.result) : null;
        if (outcome.id === 'review') {
          try {
            const pair = await boundaryReviews(this, state, candidate);
            report = { outcome: pair.outcome, findings: pair.members.flatMap(member => member.result.findings ?? []) };
          } catch { requireThat(!outcome.exception.findings, 'A finding-scoped exception cannot replace a missing reviewer'); }
        }
        const waiver = waiverFor(state, outcome.id, state.candidate.hash, contentIdentity(candidate),
          await this.waiverRisk(state, candidate, outcome.id), report);
        requireThat(waiver && identity(waiver) === identity(outcome.exception), 'Exception applicability changed during milestone validation');
        if (waiver.waiverBasis) await this.store.get(waiver.waiverBasis.evidence);
      }
    }
    requireThat(identity((await this.commitments({ capture: false, state })).docs) === liveInputs.commitments,
      'Commitment inputs changed during milestone validation');
    if (name !== 'implementation') await checkCandidate(this.store, this.context, state.candidate, { live: name !== 'completion' });
    await this.assertContext();
    admission.deadlines = deadlines;
    this.assertLiveDeadlines(liveInputs);
  }
  assertLiveDeadlines(liveInputs) {
    const admission = admissions.get(liveInputs);
    requireThat(admission?.deadlines?.every(deadline => Date.now() <= deadline), 'External evidence validity expired');
  }
  async check(name, proposedState = null, memo = new Map()) {
    return observe({category:'verification',label:'proof-qualification',worker:true,project:this.context.workspaceRoot,feature:this.context.featureId}, () => this.checkObserved(name,proposedState,memo));
  }
  async checkObserved(name, proposedState = null, memo = new Map()) {
    requireThat(MILESTONES.includes(name), 'Unknown milestone');
    const state = proposedState ?? (await this.state()).state;
    if (state.phase === 'COMPLETE' && name === 'completion') {
      const missing = [];
      try { await this.store.closure([state.candidate, state.decisions, state.results, state.integrations, state.validationFailures]); }
      catch (error) { missing.push(`Recorded completion evidence unavailable: ${error.message}`); }
      return { name, runId: state.runId, eventCount: state.eventCount, allowed: !missing.length, historical: true, missing, sourceCleanup: state.sourceCleanup };
    }
    memo = new Map(memo);
    const admission = { proofs: new Map(), administrative: new Map(), exceptions: [], historyGaps: null, adjudication: null };
    memo.set(LIVE_PROOFS, admission.proofs);
    const missing = [];
    if (state.paused) missing.push('feature is explicitly paused');
    if (state.phase === 'COMPLETE' && name !== 'completion') missing.push('feature is complete');
    let current;
    try {
      await this.assertContext();
      current = await this.commitments({ capture: false, state });
      if (!findDecision(state, 'authorize-implementation', current.subject)) missing.push('current implementation authorization');
      { const drift = await interviewDrift(this.store, state); if (drift) missing.push(drift); }
      // A light run's brief-bound authorization needs no specification validation.
      if (!lightRun(state) && (!state.specValidation || state.specValidation.spec.hash !== current.docs['spec.md'].hash
        || state.specValidation.design.hash !== current.docs['design.md'].hash)) missing.push('current specification validation');
      if (state.specValidation && !lightRun(state)) {
        try { await assertPlanningProof(await this.store.json(state.specValidation.proof)); }
        catch { missing.push('current trusted specification validator proof'); }
      }
    } catch (error) { missing.push(error.message); }
    try { await this.store.closure(state.decisions); } catch (error) { missing.push(`Retained decision closure: ${error.message}`); }
    const liveInputs = { commitments: current ? identity(current.docs) : null };
    admissions.set(liveInputs, admission);
    if (name === 'implementation') {
      if (current) try { await this.assertLiveInputs(state, name, liveInputs); } catch (error) { missing.push(error.message); }
      return { name, runId: state.runId, eventCount: state.eventCount, allowed: missing.length === 0, missing, subject: current?.subject ?? null, liveInputs };
    }
    let candidate;
    try {
      requireThat(state.candidate, 'current candidate');
      candidate = await checkCandidate(this.store, this.context, state.candidate, { live: name !== 'completion', memo });
      requireThat(candidate.authorization.subject === current?.subject, 'Candidate commitments differ from current authorized requirements');
      requireThat(candidate.authorization.event === findDecision(state, 'authorize-implementation', current?.subject)?.event,
        'Candidate implementation authorization was superseded');
    } catch (error) { missing.push(error.message); }
    if (name !== 'completion' && !state.ready) missing.push('candidate readiness declaration');
    // Light runs: tripwires are evaluated again at acceptance (and every later
    // milestone) from the pinned source, never from a recorded claim.
    let tripwires = null;
    if (candidate && lightRun(state)) {
      try {
        const key = `tripwires:${state.candidate.hash}`;
        if (!memo.has(key)) memo.set(key, evaluateTripwires(this.context, candidate));
        tripwires = await memo.get(key);
        if (tripwires.hits.length && hasRunAuthority(state)) missing.push(`tripwire: ${describeHits(tripwires.hits)}; under delegated autonomy a hit escalates the run to full rigor`);
        else if (tripwires.hits.length && !stayLightCovers(state, tripwires.hits)) missing.push(`tripwire: ${describeHits(tripwires.hits)}; escalate to full (run.set-dial rigor full) or record a human stay-light decision bound to these hits (subject ${tripwires.subject})`);
      } catch (error) { missing.push(`tripwire evaluation unavailable: ${error.message}`); }
    }
    const outcomes = [];
    let reviewPair = null;
    const selectedSupplemental = new Set([...Object.values(state.jobs).flatMap(job => job.gates ?? []), ...state.decisions.flatMap(item => item.gates ?? [])]);
    const definitions = [...enabled(state, 'acceptance'), ...(name === 'completion' ? enabled(state, 'completion') : []),
      ...GATES.filter(item => item.supplemental && selectedSupplemental.has(item.id))];
    for (const definition of definitions) {
      let accepted = null;
      let acceptedRef = null;
      let error = null;
      if (candidate && definition.role === 'core') {
        try {
          accepted = await coreEvidence(this, state, candidate, definition.id, [], memo);
          admission.administrative.set(definition.id, accepted);
        } catch (failure) { error = failure.message; }
      }
      if (candidate && definition.role !== 'core') for (const ref of [...state.results].reverse()) {
        try {
          const raw = await this.store.json(ref);
          if (raw.gate !== definition.id) continue;
          accepted = await this.currentResult(ref, candidate, state, new Set(), memo);
          acceptedRef = ref;
          break;
        } catch (failure) { error = failure.message; }
      }
      let waiver = null;
      if (candidate && state.decisions.some(item => decisionHas(item, 'waive') && item.gates.includes(definition.id))) {
        try { waiver = waiverFor(state, definition.id, state.candidate?.hash, contentIdentity(candidate),
          await this.waiverRisk(state, candidate, definition.id), accepted);
          if (waiver?.waiverBasis) await this.store.get(waiver.waiverBasis.evidence); }
        catch (failure) { waiver = null; error = `Exception scope is unavailable: ${failure.message}`; }
      }
      let pair = null;
      if (candidate && definition.id === 'review') {
        try { pair = reviewPair = await boundaryReviews(this, state, candidate, memo); accepted = { outcome: pair.outcome, summary: pair.summary, findings: pair.members.flatMap(member => member.result.findings ?? []) }; acceptedRef = null; }
        catch (failure) { accepted = null; acceptedRef = null; error = failure.message; }
        if ((!pair || pair.outcome === 'UNAVAILABLE') && waiver?.findings) waiver = null;
        else if (pair && state.decisions.some(item => decisionHas(item, 'waive') && item.gates.includes('review'))) {
          try { waiver = waiverFor(state, 'review', state.candidate.hash, contentIdentity(candidate), await this.waiverRisk(state, candidate, 'review'), accepted); }
          catch (failure) { waiver = null; error = failure.message; }
        }
      }
      let adjudication = null;
      if (pair?.outcome === 'FAIL' && isAutonomous(state)) {
        try { adjudication = await currentAdjudication(this, state, pair); admission.adjudication = adjudication; }
        catch (failure) { error = failure.message; }
      }
      const satisfied = accepted?.outcome === 'PASS' || waiver || adjudication;
      if (!satisfied && !definition.supplemental) missing.push(`${definition.id}: ${accepted?.outcome ?? error ?? 'missing evidence'}`);
      outcomes.push({ id: definition.id, required: !definition.supplemental, result: acceptedRef, ...(pair ? { reviews: pair.members.map(member => member.ref), reviewPair: pair.identity } : {}), ...(adjudication ? { adjudication } : {}), reason: accepted?.summary ?? error, outcome: accepted?.outcome ?? 'UNAVAILABLE', exception: waiver ?? null, satisfied: Boolean(satisfied), ...(definition.role === 'core' ? { administrative: accepted } : {}), ...(accepted?.provenance ? { provenance: accepted.provenance } : {}) });
    }
    // GitHub issue #145: the coverage and CI-scope checks below are verification
    // obligations. A current human waiver of verification covers them; each
    // waived residual stays on the verification outcome (and so in the
    // MILESTONE record) instead of disappearing. Without a waiver they block.
    const verificationOutcome = outcomes.find(item => item.id === 'verification');
    const verificationMissing = message => {
      if (verificationOutcome?.exception) (verificationOutcome.waivedCoverage ??= []).push(message);
      else missing.push(message);
    };
    if (candidate && verificationOutcome?.outcome === 'PASS') {
      try { await this.verificationCoverage(candidate, state, memo); } catch (error) { verificationMissing(error.message); }
    }
    // Spec AC9: the accepted Verification is the one the converged reviews
    // assessed, or a ci Verification qualified by the runner-role CI check
    // (no model call). Local evidence the reviews never assessed is not enough.
    const verified = outcomes.find(item => item.id === 'verification' && item.outcome === 'PASS' && item.result);
    // Reviews retained from an earlier contract keep their qualification (spec
    // AC11): these rules apply once a pair member ran under the round policy.
    // A review that ran under the round policy records roundPolicy in its own
    // input, whether it came from review.execute or an individual gate.execute.
    let currentContract = false;
    for (const member of reviewPair?.members ?? []) if (member.ref && member.result?.input) {
      try { if ((await this.store.json(member.result.input)).roundPolicy) currentContract = true; } catch { /* lost input: legacy */ }
    }
    if (candidate && verified && currentContract && reviewPair?.members.every(member => member.ref)) {
      try {
        const consumed = [...new Map((await Promise.all(reviewPair.members.map(async member => (await this.store.json(member.result.input)).consumed ?? [])))
          .flat().map(ref => [ref.hash, ref])).values()];
        // The same checks rerun on the same tree are the evidence the reviews assessed.
        const same = async ref => ref.hash === verified.result.hash
          || await this.evidenceIdentity(ref, candidate, state, memo).catch(() => null) === await this.evidenceIdentity(verified.result, candidate, state, memo);
        const assessed = (await Promise.all(reviewPair.members.map(async member => {
          for (const ref of (await this.store.json(member.result.input)).consumed ?? []) if (await same(ref)) return true;
          return false;
        }))).every(Boolean);
        if (!assessed && await isCiVerification(this, verified.result)) {
          verified.ciQualification = await qualifyCi(this, state, candidate, verified.result, consumed, memo);
          if (verified.ciQualification.outcome !== 'PASS') verificationMissing(`verification: ${verified.ciQualification.reason}`);
        } else if (!assessed) verificationMissing('verification: the latest Verification is local evidence the converged reviews did not assess; record a ci Verification for the exact candidate head or review the new evidence');
      } catch (error) { verificationMissing(`verification: ${error.message}`); }
    }
    // Spec AC9 with interview D35: acceptance of a candidate reviewed under this
    // contract, in a repository with hosted CI, needs a passing ci Verification
    // on the exact candidate head; local evidence alone never suffices there.
    const hostedCi = candidate?.repositories.some(repo => (repo.files ?? []).some(file => file.path.startsWith('.github/workflows/')));
    // Interview D35: hosted-CI repositories only; others keep the assessed alternative.
    if (candidate && verified && currentContract && hostedCi) {
      if (!await isCiVerification(this, verified.result)) verificationMissing('verification: this repository has hosted CI (.github/workflows); acceptance needs a passing ci Verification on the exact candidate head; local evidence alone never satisfies acceptance (interview D35)');
      else {
        const runs = (await this.store.json((await this.store.json(verified.result)).runner)).validation.runs;
        for (const run of runs) {
          const head = candidate.repositories.find(repo => repo.alias === run.alias)?.head;
          if (run.head !== head) verificationMissing(`verification: CI ran on ${run.head}, not the exact candidate head ${head}`);
        }
      }
    }
    if (['merge', 'completion'].includes(name)) {
      const acceptances = await qualifyingDecisions(this, state, 'accept', state.candidate?.hash, candidate);
      if (!acceptances.length) missing.push('current human acceptance');
      if (acceptances.length && acceptances.every(item => item.standingGrant || item.delegation)
        && outcomes.some(item => item.required !== false && !allowedRunOutcome(state, item))) missing.push('standing or delegated acceptance requires every required gate to PASS');
    }
    if (name === 'merge') {
      const authorizations = await qualifyingDecisions(this, state, 'authorize-merge', state.candidate?.hash, candidate);
      if (!authorizations.length) missing.push('explicit merge authorization');
      if (authorizations.length && authorizations.every(item => item.standingGrant || item.delegation)
        && outcomes.some(item => item.required !== false && !allowedRunOutcome(state, item))) missing.push('standing or delegated merge requires every required gate to PASS');
    }
    if (name === 'completion') {
      if (candidate?.scope !== 'FEATURE') missing.push('complete-feature review scope');
      for (const repository of candidate?.repositories ?? []) {
        const integration = state.integrations[repository.alias];
        if (!integration || integration.candidate.hash !== state.candidate.hash) missing.push(`observed integration: ${repository.alias}`);
        else try { await this.store.get(integration.receipt); } catch (error) { missing.push(error.message); }
      }
    }
    admission.exceptions = outcomes.filter(outcome => outcome.exception);
    const gaps = memo.get(`losses:${state.runId}:${state.eventCount}`);
    admission.historyGaps = gaps ? identity(await gaps) : null;
    // Proof/remote qualification may take time without changing the journal.
    // Re-read mutable inputs after it, and again at the actual passage write.
    if (current && candidate) try { await this.assertLiveInputs(state, name, liveInputs); } catch (error) { missing.push(error.message); }
    return { name, runId: state.runId, eventCount: state.eventCount, allowed: missing.length === 0, missing, candidate: state.candidate, outcomes, liveInputs,
      ...(tripwires ? { tripwires: { hits: tripwires.hits, subject: tripwires.subject, skipped: tripwires.skipped, coveredByStayLight: Boolean(tripwires.hits.length && stayLightCovers(state, tripwires.hits)) } } : {}) };
  }
  async pass(name, operation) {
    const prior = (await this.state()).state;
    if (name === 'completion' && prior.phase === 'COMPLETE') { requireThat((await this.check(name)).allowed, 'Recorded completion evidence is unavailable'); await this.cleanupSource(); return { state: (await this.state()).state, historical: true }; }
    requireThat(name !== 'merge', 'Merge must execute through a protected action adapter');
    // Delegated light: a hit found at acceptance escalates before the check.
    if (name === 'acceptance') await this.escalateOnTripwire('acceptance');
    const check = await this.check(name);
    requireThat(check.allowed, 'Milestone is blocked', check);
    const { state } = await this.state();
    requireThat(state.runId === check.runId && state.eventCount === check.eventCount, 'Feature state changed during milestone check; retry current state');
    requireThat(name !== 'acceptance' || ['IMPLEMENTING', 'ACCEPTING'].includes(state.phase), 'Acceptance passage is outside its phase');
    requireThat(name !== 'completion' || ['INTEGRATED', 'COMPLETE'].includes(state.phase), 'Completion requires observed integration');
    requireThat(name !== 'implementation' || state.phase === 'IMPLEMENTING', 'Implementation phase is not authorized');
    await this.assertLiveInputs(state, name, check.liveInputs);
    const recorded = await this.append(state, 'MILESTONE', { name, candidate: state.candidate, outcomes: check.outcomes ?? [] }, operation);
    if (name === 'completion') await this.cleanupSource();
    return recorded;
  }
  async historyGaps(state, memo = new Map()) {
    const gaps = [];
    if (!memo.has(RETAINED_CLOSURE)) memo.set(RETAINED_CLOSURE, new Set());
    for (const [position, ref] of state.results.entries()) {
      try {
        await this.store.closure(ref, memo.get(RETAINED_CLOSURE));
        const { result } = await this.recordedResult(ref, state);
        const source = await this.store.json((await this.store.json(result.input)).candidate);
        assertSourceIsolation(source, this.store.home);
        if (state.phase !== 'COMPLETE') {
          const key = `source:${(await this.store.json(result.input)).candidate.hash}`;
          if (!memo.has(key)) memo.set(key, checkSource(this.store, this.context, source));
          await memo.get(key);
        }
      }
      catch {
        let gate = null;
        try { gate = (await this.store.json(ref)).gate ?? null; } catch { /* Unknown gate affects all prior proof. */ }
        gaps.push({ resultHash: ref.hash, gate, position, reason: 'Historical evidence is unavailable, corrupt or no longer isolated; fresh proof after this gap is required.' });
      }
    }
    for (const failure of state.validationFailures) {
      try { await this.store.closure(failure, memo.get(RETAINED_CLOSURE)); }
      catch { gaps.push({ resultHash: failure.proof.hash, gate: 'spec-validation', position: -1,
        reason: 'Historical failed specification evidence is unavailable or corrupt; restore retained bytes before final retention.' }); }
    }
    return gaps;
  }
  async inspect() {
    const { state } = await this.state();
    let commitments = null;
    try { commitments = await this.commitments({ capture: false, state }); } catch { /* Missing docs are reported by milestone checks. */ }
    const memo = new Map();
    let candidate = null, candidateUnavailable = false;
    if (state.candidate && state.decisions.some(item => item.kind === 'authorize-standing')) {
      try { candidate = await checkCandidate(this.store, this.context, state.candidate, { live: false }); }
      catch { candidateUnavailable = true; }
    }
    const standingAuthorizations = await Promise.all(state.decisions.filter(item => item.kind === 'authorize-standing').map(async grant => ({
      grant: grant.event, scope: grant.scope, subject: grant.subject, authority: grant.authority,
      namesReleaseBranch: Boolean(standingReleaseRefusal(this, grant)),
      applications: state.decisions.filter(item => item.standingGrant === grant.event).map(item => ({
        event: item.event, subject: item.subject, actions: ['accept', ...(item.actions ?? [])], action: item.action ?? null,
      })),
      ...(state.phase === 'COMPLETE' ? { allowed: false, reason: 'Feature run is complete' }
        : candidateUnavailable ? { allowed: false, reason: 'Current candidate evidence is unavailable or invalid' }
          : await standingValidity(this, state, grant, candidate, null, { allowIntegratedTargets: true })),
    })));
    return { ...state, temporaryViews: await viewStatus(this.store), commitments, standingAuthorizations, delegation: delegationStatus(this, state),
      rounds: roundStatus(state, { light: lightRun(state), goal: isGoal(state) }), historyGaps: await this.historyGaps(state, memo), obligations: GATES.filter(item => !item.supplemental && (!item.optional || state.optionalGates.includes(item.id))),
      enforcement: ENFORCEMENT, ...await (async () => { const milestones = await Promise.all(MILESTONES.map(name => this.check(name, null, memo)));
        return { milestones, goal: goalStatus(state, milestones, isGoal(state) ? await agentDecisions(this.context.featureHome) : []) }; })() };
  }
  async coverageStatus() {
    const { state } = await this.state();
    if (!state.candidate) return { candidate: null, criteria: [], reason: 'No pinned candidate' };
    let candidate;
    try { candidate = await checkCandidate(this.store, this.context, state.candidate, { live: !['INTEGRATED', 'COMPLETE'].includes(state.phase) }); }
    catch (error) { return { candidate: state.candidate, criteria: [], reason: error.message }; }
    let pair;
    try { pair = await boundaryReviews(this, state, candidate); }
    catch (error) { return { candidate: state.candidate, criteria: candidate.criteria.map(id => ({ id, outcome: 'NOT YET', evidence: [] })), reason: error.message }; }
    const adjudication = await currentAdjudication(this, state, pair);
    return { candidate: state.candidate, reviewPair: pair.identity, ...(adjudication ? { adjudication: adjudication.event } : {}), criteria: candidate.criteria.map(id => {
      const rows = pair.members.map(member => ({ reference: member.ref, row: member.result.criteria?.find(row => row.id === id) }));
      const outcome = rows.some(item => item.row?.outcome === 'FAIL') ? 'FAIL'
        : pair.outcome === 'PASS' && rows.every(item => item.row?.outcome === 'PASS') ? 'PASS' : 'NOT YET';
      return { id, outcome, evidence: rows.filter(item => item.row).map(item => ({ result: item.reference, evidence: item.row.evidence })) };
    }), note: 'Derived from both independent perspectives. Autonomous adjudication, when present, is separate from their original criterion outcomes.' };
  }

  async append(state, type, payload, operation) {
    if (['CANDIDATE', 'READY'].includes(type)) await this.assertContext();
    const active = await this.store.active();
    requireThat(active.runId === state.runId, 'Active run changed');
    const event = await this.store.append(state.runId, state.eventCount, type, payload, operation);
    // Return the state produced by this event, never a later concurrent mutation.
    return { event, state: project((await this.store.events(state.runId)).slice(0, event.sequence)) };
  }
  async reconcileCompletedJobs() {
    let { state } = await this.state();
    for (const pending of Object.values(state.jobs)) {
      if (pending.finished || pending.abandoned) continue;
      let saved = await this.store.job(pending.jobId);
      if (pending.ready) {
        const ready = { runId: state.runId, operation: pending.ready.operation, results: pending.ready.results };
        requireThat(!saved || identity(saved) === identity(ready), 'Retained job conflicts with its durable outcome publication');
        if (!saved) { await this.store.saveJob(pending.jobId, ready); saved = ready; }
      }
      if (!saved) continue;
      requireThat(saved.runId === state.runId && saved.operation
        && identity({ run: state.runId, operation: saved.operation }).slice(7) === pending.jobId
        && Array.isArray(saved.results) && saved.results.length === pending.gates.length,
        'Retained execution outcome does not match its original job');
      for (const ref of saved.results) requireThat(ref?.format === 'json' && typeof ref.hash === 'string' && Number.isSafeInteger(ref.bytes), 'Invalid retained execution result reference');
      // Publishing these original references preserves historical truth. Missing
      // object bytes remain explicit gaps; they cannot become current PASS.
      const legacy = typeof saved.operation.id === 'string' && saved.operation.id.length > 128
        && ID.test(saved.operation.id.slice(0, 128)) && /^[a-zA-Z0-9_-]+$/u.test(saved.operation.id.slice(128));
      const completion = legacy ? { id: `legacy_finish_${pending.jobId}`, hash: saved.operation.hash } : saved.operation;
      const recorded = await this.append(state, 'JOB_FINISHED', {
        jobId: pending.jobId, results: saved.results, ...(legacy ? { originalOperation: saved.operation } : {}),
      }, completion);
      state = recorded.state;
    }
  }
  // Spec AC13 (D33): a runner or independent-assessment job whose owning
  // process is verifiably gone will never finish; abandoning it stops it from
  // invalidating proof recorded before it. Delivery jobs still need reconciliation.
  async abandonJob(input, operation) {
    requireThat(input && Object.keys(input).every(key => ['jobId', 'reason'].includes(key)), 'job.abandon accepts only jobId and reason');
    requireThat(typeof input.reason === 'string' && input.reason.trim().length > 0 && input.reason.length <= 4096, 'job.abandon needs a reason');
    await this.reconcileCompletedJobs();
    const { state } = await this.state();
    const job = state.jobs[input.jobId];
    requireThat(job, 'Unknown job');
    requireThat(!job.finished, 'The job already finished; its outcome is recorded');
    requireThat(!job.abandoned, 'The job is already abandoned');
    requireThat(job.gates.every(id => { const definition = gate(id); return definition.at === 'acceptance' && ['runner', 'independent', 'assessment'].includes(definition.role); }),
      'Delivery jobs cannot be abandoned; reconcile their retained outcome');
    requireThat(!job.ready && !await this.store.job(input.jobId), 'The job has a retained outcome; reconcile it instead');
    requireThat(job.owner, 'The job predates owner records; its process cannot be verified gone');
    const observed = await processIdentity(job.owner.processId);
    requireThat(observed !== job.owner.processStartedAt, 'The job\'s process is still running');
    return this.append(state, 'JOB_ABANDONED', { jobId: input.jobId, reason: input.reason, owner: job.owner, observedAt: new Date().toISOString() }, operation);
  }
  async setDial(input, operation) {
    const { state } = await this.state();
    requireThat(state.phase !== 'COMPLETE', 'Run dials cannot change after completion');
    const change = dialChange(state, input);
    if (change.dial === 'autonomy' && unattendedValue(change.value)) change.protection = await requireProtection(this);
    return this.append(state, 'DIAL_SET', change, operation);
  }
  // Classify the current light candidate. Under delegation a hit raises rigor to
  // full automatically (recorded, never a lowering). Returns true when escalated.
  async recordTripwires(state, evaluation, stage, operationId) {
    let current = state;
    const payload = { candidate: state.candidate, stage, ...evaluation };
    const recorded = state.tripwires;
    if (!(recorded && recorded.candidate.hash === state.candidate.hash && identity(recorded.hits) === identity(evaluation.hits)
      && identity(recorded.configurations) === identity(evaluation.configurations))) {
      current = (await this.append(current, 'TRIPWIRES_EVALUATED', payload, { id: `tripwires_${identity({ operationId, stage }).slice(7, 71)}`, hash: identity(payload) })).state;
    }
    if (!evaluation.hits.length || !hasRunAuthority(current) || !lightRun(current)) return { state: current, escalated: false };
    const change = automaticDial(current, 'rigor', 'full', 'tripwire', `Tripwire escalation under delegated autonomy: ${describeHits(evaluation.hits)}`, { tripwires: evaluation.subject });
    current = (await this.append(current, 'DIAL_SET', change, { id: `escalate_${identity({ operationId, stage }).slice(7, 71)}`, hash: identity(change) })).state;
    return { state: current, escalated: true };
  }
  async escalateOnTripwire(label) {
    const { state } = await this.state();
    if (!lightRun(state) || !hasRunAuthority(state) || !state.candidate) return false;
    const evaluation = await evaluateTripwires(this.context, await this.store.json(state.candidate));
    if (!evaluation.hits.length) return false;
    return (await this.recordTripwires(state, evaluation, label, `${label.replace(/[^a-zA-Z0-9_-]/gu, '-')}_${randomUUID()}`)).escalated;
  }
  async cleanupSource() {
    const { state } = await this.state();
    if (state.phase !== 'COMPLETE' || state.sourceCleanup?.status === 'released') return;
    const pending = Object.values(state.jobs).some(job => !job.finished && !job.abandoned);
    const result = pending ? { status: 'pending', errors: [{ reason: 'Active or unresolved jobs still own source references' }] }
      : await releasePins(this.context, state.sourcePreparations);
    if (identity(result) !== identity(state.sourceCleanup)) await this.append((await this.state()).state, 'SOURCE_CLEANUP', result,
      { id: `cleanup_${randomUUID()}`, hash: identity(result) });
  }
  async execute(request) {
    const operation = typeof request?.operation === 'string' ? request.operation : 'unknown';
    if (['database.inspect','database.history'].includes(operation)) return this.executeObserved(request);
    const label = operation === 'human.decide' ? request.input?.kind
      : operation === 'milestone.pass' ? `milestone:${request.input?.name}` : operation;
    const category = operation.startsWith('merge.') || operation.startsWith('integration.') || ['review.publish', 'delegation.apply'].includes(operation) ? 'delivery'
      : operation === 'planning.review' ? 'review'
      : operation === 'candidate.prepare' ? 'setup' : 'operation';
    const activeRun = (await this.store.active().catch(()=>null))?.runId ?? request.input?.runId;
    return observe({ project: this.context.workspaceRoot, feature: this.context.featureId, workflow: activeRun ? `${this.store.home}:${activeRun}` : undefined,
      display: {project:basename(this.context.workspaceRoot),issue:this.context.featureId,contract:CONTRACT,
        ...(operation==='gate.execute'?{check:request.input.gates?.join(',')??'unknown',validator:request.input.gates?.some(id=>['independent','assessment'].includes(gate(id).role))?'agentic':'deterministic',
          ...(request.input.configuration?.model?{model:request.input.configuration.model}:{}),...(request.input.configuration?.provider?{provider:request.input.configuration.provider}:{})}:{} )},
      label, category, command: operation, worker: false }, async () => {
      try { return await this.executeObserved(request); }
      finally { if (!['status','snapshot','database.inspect','database.history','milestone.check','coverage.status'].includes(operation)) await projectWorkflow(this); }
    });
  }
  async executeObserved(request) {
    const input = request.input ?? {};
    const operation = { id: identifier(request.operationId ?? randomUUID(), 'operation'), hash: identity({ operation: request.operation, input }) };
    const mutating = !['status', 'snapshot', 'database.inspect', 'database.history', 'milestone.check', 'coverage.status'].includes(request.operation);
    if (mutating) { await this.assertContext(); await this.store.activationHead({ repair: true }); }
    if (request.operation === 'database.inspect') return this.store.inspect();
    if (request.operation === 'database.history') return this.store.history(input);
    if (request.operation === 'run.resume-current') return this.resume(input, operation);
    // Restore exact retained copies and record completed original jobs before
    // current candidate/phase preflight; neither action invents a passed check.
    const active = await this.store.active();
    if (active) {
      if (mutating) { await this.store.events(active.runId, { repair: true }); await this.reconcileCompletedJobs(); await observe({category:'setup',label:'review-view-cleanup',worker:true}, async () => cleanupViews(this.store, (await this.state()).state)); await this.cleanupSource(); }
      const existing = (await this.store.events(active.runId)).find(event => event.operation.id === operation.id);
      if (existing) {
        requireThat(existing.operation.hash === operation.hash, 'Operation identity reused for different input');
        return { event: existing, state: project(await this.store.events(active.runId)) };
      }
    }
    switch (request.operation) {
      case 'run.start': return this.start(input, operation, null, { workspace: true });
      case 'workspace.configure': return this.configureWorkspace(input, operation);
      case 'run.set-dial': return this.setDial(input, operation);
      case 'status': case 'snapshot': return this.inspect();
      case 'coverage.status': requireThat(!Object.keys(input).length, 'Coverage status accepts no asserted outcomes'); return this.coverageStatus();
      case 'human.decide': return this.decide(input, operation);
      case 'authorization.apply': return applyStanding(this, input, operation);
      case 'delegation.apply': return applyDelegation(this, input, operation);
      case 'planning.review': return reviewPlanning(this, input, operation);
      case 'review.select': return selectReviewers(this, input, operation);
      case 'review.execute': return executeBoundaryReviews(this, input, operation);
      case 'review.adjudicate': return adjudicateReview(this, input, operation);
      case 'spec.validate': return this.validateSpec(operation);
      case 'candidate.prepare': return this.prepare(input, operation);
      case 'candidate.ready': return this.readiness(operation);
      case 'job.abandon': return this.abandonJob(input, operation);
      case 'decision.ask': {
        const question = decisionQuestion(input);
        const { state } = await this.state();
        return this.append(state, 'DECISION_PENDING', question, operation);
      }
      case 'workflow.observe': {
        const note = workflowObservation(input);
        const { state } = await this.state();
        return this.append(state, 'OBSERVATION', note, operation);
      }
      case 'gate.execute': return executeGates(this, input, operation);
      case 'milestone.check': return this.check(input.name);
      case 'milestone.pass': return this.pass(input.name, operation);
      case 'merge.prepare': return prepareMerge(this, input);
      case 'review.publish': {
        const published = await publishReview(this, input);
        const { state } = await this.state();
        const ready = readyRecord(state, { scope: published.scope }, published, published.observed ?? {}, isGoal(state) ? await agentDecisions(this.context.featureHome) : []);
        if (ready && JSON.stringify(state.goalReady && { ...state.goalReady, at: undefined, event: undefined }) !== JSON.stringify({ ...ready, at: undefined, event: undefined }))
          await this.append(state, 'GOAL_READY', ready, { id: `${operation.id}-goal-ready`, hash: identity(ready) });
        return published;
      }
      case 'goal.park': {
        const { observePullRequest } = await import('./publication.js');
        return parkGoal(this, input, operation, observePullRequest);
      }
      case 'merge.execute': return protectedMerge(this, input, operation);
      case 'delivery.resume':
        try { return await resumeDelivery(this, input, operation); }
        catch (error) {
          if (error.code === 'EXTERNAL_BLOCKER') return { status: 'external-blocker', reason: error.message, nextAction: 'human', blocker: error.details };
          return { status: 'needs-attention', reason: error.message, nextAction: 'inspect-and-resume' };
        }
      case 'integration.observe':
        requireThat(input.hostedChecks === undefined, 'Hosted check observations come only from the protected merge');
        return observeIntegration(this, input, operation);
      case 'run.pause': case 'run.continue': {
        authority(input.authority);
        const { state } = await this.state();
        return this.append(state, request.operation === 'run.pause' ? 'PAUSED' : 'RESUMED', { authority: input.authority }, operation);
      }
      default: throw new Error(`Unsupported current operation: ${request.operation}`);
    }
  }
}
