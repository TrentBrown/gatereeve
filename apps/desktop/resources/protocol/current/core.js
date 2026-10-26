import { checkIdentity } from './coverage.js';
import { protectedMerge, resumeDelivery } from './delivery.js';
import { observeReleaseConductor } from '../../release/release-conductor-observer.js';
import { workflowContextGuard } from '../context.js';
import { ContractError } from '../errors.js';
import { HIGH_CAPABILITY_PROFILE, validateEvaluatorCapability } from '../agent-workflow.js';
import { executionEnvironment, assertEnvironmentCurrent, restoreComparisonIndexes, releaseComparisonIndexes } from './environment.js';
import { patternInputs } from './pattern-inputs.js';
import { randomUUID } from 'node:crypto';
import { CONTRACT, PHASES, GATES, MILESTONES, ENFORCEMENT, requireThat, identity,
  identifier, text, decision, gate, authority, decisionHas, waiverFor, waiverPolicyAllows, latestImplementation, currentAuthorityDecisions, currentDesignApproval } from './contracts.js';
import { CurrentStore } from './store.js';
import { requirements, sourceCandidate, assertSourceIsolation, checkCandidate, checkSource, contentIdentity } from './evidence.js';
import { validatePlanning, assertPlanningProof, planningBinding } from './planning.js';
import { executeGates, reviewContract, coreEvidence } from './execution.js';
import { prepareMerge, merge, observeIntegration } from './actions.js';
import { captureStanding, applyStanding, standingValidity, qualifyingDecisions, requireUnexpired } from './authorization.js';

import { sourcePreparation, ensurePins, releasePins } from './source-retention.js';
import { cleanupViews, viewStatus } from './source-views.js';

const LIVE_PROOFS = Symbol('qualified live proof inputs');
const RETAINED_CLOSURE = Symbol('retained bytes verified in this observation');
const admissions = new WeakMap();

export function project(events) {
  requireThat(events[0]?.type === 'STARTED', 'Current run is not initialized');
  const first = events[0].payload;
  const state = { contract: CONTRACT, runId: events[0].runId, featureId: first.featureId,
    phase: 'DESIGNING', implementers: first.implementers, optionalGates: first.optionalGates,
    decisions: [], pendingDecisions: [], validationFailures: [], results: [], jobs: {}, actions: {}, expectations: {}, candidate: null, specValidation: null, integrated: null, integrations: {},
    sourcePreparations: [], sourcePreparationStatus: {}, sourceCleanup: null, ready: false, paused: false, eventCount: events.length };
  for (const event of events.slice(1)) {
    const value = event.payload;
    switch (event.type) {
      case 'DECISION_PENDING': state.pendingDecisions.push({ ...value, event: event.hash }); break;
      case 'VALIDATION_FAILED': state.validationFailures.push(value); state.specValidation = null; break;
      case 'DECIDED':
        state.pendingDecisions = state.pendingDecisions.filter(item => item.operation.id !== value.requestId);
        state.decisions.push({ ...value, event: event.hash });
        if (value.kind === 'approve-design') state.phase = 'SPECIFYING';
        if (value.kind === 'authorize-implementation') state.phase = 'IMPLEMENTING';
        if (value.kind === 'amend') { state.phase = 'SPECIFYING'; state.specValidation = null; state.ready = false; }
        if (value.specValidation) state.specValidation = value.specValidation;
        if (decisionHas(value, 'authorize-implementation')) state.phase = 'IMPLEMENTING';
        break;
      case 'SPEC_VALIDATED': state.specValidation = value; if (['SPECIFYING', 'PLANNING'].includes(state.phase)) state.phase = 'PLANNING'; break;
      case 'SOURCE_PREPARING': state.sourcePreparations.push(value); state.sourcePreparationStatus[value.id] = { status: 'preparing', reason: 'Preparation has not published a candidate; owned references are retained for retry.' }; break;
      case 'SOURCE_PREPARATION_FAILED': state.sourcePreparationStatus[value.id] = { status: 'retry-required', reason: value.reason }; break;
      case 'SOURCE_CLEANUP': state.sourceCleanup = value; break;
      case 'CANDIDATE': if (value.preparationId) state.sourcePreparationStatus[value.preparationId] = { status: 'published', reason: null }; state.candidate = value; state.ready = false; state.integrated = null; state.integrations = {}; state.phase = 'IMPLEMENTING'; break;
      case 'READY': state.ready = true; break;
      case 'TRANSITION_RECORDED': state.transition = value; break;
      case 'ACTION_CLAIMED': state.actions[value.id] = { ...value, running: true }; break;
      case 'ACTION_RELEASED': if (state.actions[value.id]?.owner === value.owner) state.actions[value.id].running = false; break;
      case 'JOB_STARTED': state.jobs[value.jobId] = { ...value, sequence: event.sequence, finished: false }; break;
      case 'JOB_OUTCOME_READY': state.jobs[value.jobId] = { ...state.jobs[value.jobId], ready: value }; break;
      case 'JOB_FINISHED': state.jobs[value.jobId] = { ...state.jobs[value.jobId], ...value, finishedSequence: event.sequence, finished: true }; state.results.push(...value.results); break;
      case 'MILESTONE':
        if (value.name === 'acceptance') state.phase = 'ACCEPTING';
        if (value.name === 'completion') { state.phase = 'COMPLETE'; state.sourceCleanup = { status: 'pending', errors: [{ reason: 'Completion recorded; owned source reference release has not been reconciled.' }] }; }
        break;
      case 'INTEGRATED': state.integrated = value; state.integrations[value.repository] = value; state.phase = 'INTEGRATED'; break;
      case 'PAUSED': state.paused = true; break;
      case 'RESUMED': state.paused = false; break;
      default: throw new Error(`Unsupported current event: ${event.type}`);
    }
  }
  requireThat(PHASES.includes(state.phase), 'Invalid current phase');
  return state;
}
function enabled(state, at) {
  return GATES.filter(item => item.at === at && (!item.optional || state.optionalGates.includes(item.id)));
}
function findDecision(state, kind, subject) {
  if (kind === 'authorize-implementation') {
    const latest = latestImplementation(state);
    return latest && decisionHas(latest, kind) && latest.subject === subject ? latest : null;
  }
  return currentAuthorityDecisions(state).findLast(item => decisionHas(item, kind) && item.subject === subject);
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
  async start(input, operation, replacement = null) {
    identifier(input.runId, 'run');
    requireThat(Array.isArray(input.implementers) && input.implementers.length > 0, 'Identify the implementing contexts');
    input.implementers.forEach(value => text(value, 'Implementer context'));
    const optionalGates = input.optionalGates ?? [];
    requireThat(Array.isArray(optionalGates) && optionalGates.every(id => gate(id).optional), 'Only optional gates may be selected');
    const active = replacement ? null : await this.store.active();
    requireThat(!active || active.runId === input.runId, 'A current run already exists; resume that run');
    // No legacy files are read or overwritten. STARTED is durable before activation.
    await this.store.append(input.runId, 0, 'STARTED', { featureId: this.context.featureId,
      implementers: [...new Set(input.implementers)], optionalGates: [...new Set(optionalGates)], ...(replacement ? { priorActive: await this.store.put(replacement.bytes) } : {}) }, operation);
    if (replacement) await this.store.supersedeActive(input.runId, replacement);
    else await this.store.activate(input.runId);
    return this.inspect();
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
    if (!active) await this.start(input, operation, replacement);
    else {
      const { state } = await this.state();
      requireThat(!input.runId || input.runId === state.runId, 'Another current run is already active');
      requireThat(identity(input.implementers) === identity(state.implementers), 'Resume must preserve the implementing contexts');
      await this.reconcileCompletedJobs();
    }
    // Supplied approvals are observations of actual instructions, never inferred
    // from old journal semantics. Each durable step reconciles independently.
    const planning = input.planning ?? {};
    const childId = step => `resume_${identity({ run: input.runId ?? active.runId, step, planning }).slice(7)}`;
    if (planning.design) await this.execute({ operation: 'human.decide', operationId: childId('design'), input: { ...planning.design, kind: 'approve-design' } });
    if (planning.design || planning.implementation) await this.execute({ operation: 'spec.validate', operationId: childId('spec') });
    if (planning.implementation) await this.execute({ operation: 'human.decide', operationId: childId('implementation'), input: { ...planning.implementation, kind: 'authorize-implementation' } });
    const transitioned = (await this.state()).state;
    if (!transitioned.transition) {
      const documents = {};
      for (const name of ['interview.md', 'design.md', 'spec.md', 'plan.md', 'issues.md', 'tracker.md', 'scratchpad.md', 'decisions.md']) {
        try { documents[name] = await this.store.fingerprint(name); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      await this.append(transitioned, 'TRANSITION_RECORDED', { contract: CONTRACT,
        history: 'preserved without replay', documents,
        authority: transitioned.decisions.map(item => ({ event: item.event, kind: item.kind, subject: item.subject, authority: item.authority })),
        priorActivation: replacement ? { hash: replacement.hash } : null,
        evidence: replacement || !active ? { reused: [], refreshRequired: GATES.filter(item => !item.optional || transitioned.optionalGates.includes(item.id)).map(item => item.id),
          reason: 'Historical proof lacks the current checker/environment contract. No new execution is inferred.' }
          : { retained: transitioned.results, reason: 'Same-contract evidence remains subject to normal applicability; resume does not rerun it.' } },
      { id: childId('transition'), hash: identity({ run: transitioned.runId, contract: CONTRACT }) });
    }
    return this.inspect();
  }
  obligations(state, at) { return enabled(state, at); }
  async commitments({ capture = true } = {}) {
    const docs = await requirements(this.store, ['design.md', 'spec.md', 'plan.md', 'issues.md'], { capture });
    return { docs, subject: identity({ contract: CONTRACT, featureId: this.context.featureId, design: docs['design.md'], spec: docs['spec.md'] }) };
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
              const commitments = await this.commitments({ capture: false });
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
    if (value.kind === 'approve-design') {
      requireThat(['DESIGNING', 'SPECIFYING', 'PLANNING'].includes(state.phase), 'Use an amendment to change approved delivery requirements');
      const doc = await this.store.capture('design.md');
      requireThat(doc.hash === value.subject, 'Design approval does not match current bytes');
      value.documents = { 'design.md': doc };
      value.interview = await this.store.capture('interview.md');
    } else if (value.kind === 'authorize-implementation') {
      const current = await this.commitments();
      requireThat(state.phase === 'PLANNING' && state.specValidation, 'Validate specification before implementation authorization');
      requireThat(currentDesignApproval(state, current.docs['design.md'].hash), 'Design approval is not current');
      requireThat(state.specValidation.spec.hash === current.docs['spec.md'].hash && state.specValidation.design.hash === current.docs['design.md'].hash,
        'Specification validation is not current');
      await assertPlanningProof(await this.store.json(state.specValidation.proof));
      requireThat(value.subject === current.subject, 'Implementation authorization does not match current commitments');
      value.documents = current.docs;
    } else if (value.kind === 'amend') {
      const current = await this.commitments();
      requireThat(value.subject === current.subject, 'Amendment must bind the new commitments');
      const previous = latestImplementation(state);
      requireThat(previous && input.previousSubject === previous.subject, 'Amendment must identify the prior authorized commitments');
      value.previousSubject = previous.subject;
      value.previousDocuments = previous.documents;
      value.documents = current.docs;
      // The instruction approves the named design delta; spec proof still needs refresh.
      value.approvedDesign = current.docs['design.md'];
      if (decisionHas(value, 'authorize-implementation')) {
        state = await this.pendingDecision(value, operation, state);
        const proof = await this.specProof(current.docs, operation, state);
        for (const ref of Object.values(current.docs)) await this.store.currentBytes(ref);
        value.specValidation = { spec: current.docs['spec.md'], design: current.docs['design.md'], proof };
      }
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
        requireThat(admission.allowed, 'Required review proof is missing');
      }
      if (decisionHas(value, 'authorize-merge')) {
        requireThat(findDecision(proposed, 'accept', value.subject), 'Human acceptance is required before merge authorization');
        requireThat(value.action && identity(value.action) === identity(await prepareMerge(this, value.action)), 'Merge authorization must bind the prepared action');
      }
    }
    if (decisionHas(value, 'authorize-merge')) await checkCandidate(this.store, this.context, state.candidate);
    for (const ref of Object.values(value.documents ?? {})) await this.store.currentBytes(ref);
    if (admission) await this.assertLiveInputs({ ...state, decisions: [...state.decisions, value] }, 'acceptance', admission.liveInputs);
    else await this.assertContext();
    if (value.kind === 'authorize-standing') requireUnexpired(value);
    return this.append(state, 'DECIDED', { ...value, requestId: operation.id }, operation);
  }
  async validateSpec(operation) {
    const { state } = await this.state();
    const current = ['SPECIFYING', 'PLANNING'].includes(state.phase) ? null : await this.commitments();
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
    const current = await this.commitments();
    const authorization = findDecision(state, 'authorize-implementation', current.subject);
    const preparation = await sourcePreparation(this.store, this.context, input, state.runId, operation);
    const pendingId = `source_${preparation.id}`;
    const pending = (await this.state()).events.find(event => event.operation.id === pendingId);
    let preparedState = state;
    if (pending) requireThat(identity(pending.payload) === identity(preparation), 'Source preparation changed during retry');
    else preparedState = (await this.append(state, 'SOURCE_PREPARING', preparation, { id: pendingId, hash: identity(preparation) })).state;
    try {
      await ensurePins(this.context, preparation);
      const candidate = await sourceCandidate(this.store, this.context, input, { event: authorization.event, subject: authorization.subject, documents: authorization.documents }, preparation);
      return await this.append(preparedState, 'CANDIDATE', { ...candidate.ref, preparationId: preparation.id }, operation);
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
    for (const definition of this.obligations(state, 'acceptance').filter(item => item.id !== 'packet')) {
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
    // Semantic supersession is established by an existing independent spec or
    // Judge result. A model-authored claim alone never satisfies coverage.
    for (const ref of [...state.results].reverse()) {
      let report, inputs;
      try {
        report = await this.store.json(ref);
        if (!['spec', 'judge'].includes(report.gate) || report.outcome !== 'PASS') continue;
        inputs = await this.store.json(report.input);
        if (!(inputs.coverageClaims ?? []).length) continue;
        await this.currentResult(ref, candidate, state, new Set(), memo, false);
      } catch { continue; }
      for (const claim of inputs.coverageClaims) {
        if (!report.coverageDecisions?.some(item => item.id === claim.id && item.outcome === 'PASS')) continue;
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
      for (const pending of Object.values(state.jobs)) if (!pending.finished && pending.gates?.includes(result.gate)) {
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
              || ['requirements/spec.md', 'requirements/design.md', 'planning/plan.md', 'planning/issues.md',
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
    if (['independent', 'assessment'].includes(definition.role) && result.outcome !== 'UNAVAILABLE') {
      validateEvaluatorCapability(receipt.evaluator?.capabilityProfile, receipt.evaluator?.reasoningEffort);
      requireThat(identity(receipt.evaluator.capabilityProfile) === identity(HIGH_CAPABILITY_PROFILE)
        && receipt.evaluator.reasoningEffort === (inputs.configuration.reasoningEffort ?? 'high')
        && receipt.evaluator.provider === inputs.configuration.provider && receipt.evaluator.model === inputs.configuration.model,
      'Retained evaluator qualification differs from the requested proof');
    }
    requireThat(inputs.reviewContract === reviewContract(inputs.gates), 'Evaluator rules or output contract changed');
    if (inputs.pattern) requireThat(identity(inputs.pattern) === identity(await patternInputs(this.store, this.context, candidate, { ...this.runtime.pythonGuardOptions, capture: false })), 'Pattern policy or trigger inputs changed');
    const evaluated = await checkCandidate(this.store, this.context, inputs.candidate, { live: false, memo });
    for (const artifact of result.artifacts ?? []) await this.store.get(artifact);
    for (const ref of inputs.support ?? []) await this.store.currentBytes(ref);
    const environmentKey = identity({ configuration: inputs.configuration, source: contentIdentity(candidate), runner: definition.role === 'runner' });
    if (!memo.has(environmentKey)) memo.set(environmentKey, executionEnvironment(this.context, candidate, inputs.configuration, definition.role === 'runner', process.env, { retainDiagnostics: false }));
    await restoreComparisonIndexes(this.context, inputs.environment);
    assertEnvironmentCurrent(inputs.environment, await memo.get(environmentKey));
    if (gate(result.gate).at === 'completion') requireThat(identity(inputs.integrations) === identity(state.integrations), 'Integration source changed');
    if (inputs.validUntil) requireThat(Date.now() <= Date.parse(inputs.validUntil), 'External evidence validity expired');
    if (result.gate === 'release' && result.outcome === 'PASS') await this.refreshRelease(result, candidate, state);
    if (result.mode === 'delta') {
      requireThat(definition.role === 'independent' && result.prior && result.coverage?.complete === true, 'Delta requires independent coverage and prior proof');
      const prior = await this.currentResult(result.prior, await this.store.json(result.priorCandidate), state, new Set(seen), memo, true, true);
      requireThat(prior.outcome === 'PASS' && prior.gate === result.gate, 'Delta prior proof is not passing evidence for this gate');
    }
    requireThat(contentIdentity(evaluated) === contentIdentity(candidate), 'Result is not applicable to current inputs');
    for (const dependency of inputs.consumed ?? []) await this.currentResult(dependency, candidate, state, new Set(seen), memo, requireCoverage);
    if (definition.role === 'runner' && result.outcome === 'PASS') {
      const runner = result.runner ? await this.store.json(result.runner) : null;
      requireThat(Array.isArray(inputs.configuration.checks) && inputs.configuration.checks.length > 0
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
      return identity({ validators, configuration: input.configuration, dependencies, support, rule: reviewContract([gateId]),
        pattern: gateId === 'pattern' ? await patternInputs(this.store, this.context, candidate, { ...this.runtime.pythonGuardOptions, capture: false, allowMissing: true }) : null,
        externalValidity: !input.validUntil || Date.now() <= Date.parse(input.validUntil),
        integrations: gate(gateId).at === 'completion' ? state.integrations : null,
        historyGaps: gaps.filter(gap => gap.gate === null || gap.gate === gateId),
        environment: await executionEnvironment(this.context, candidate, input.configuration ?? {}, gate(gateId).role === 'runner') });
    };
    return identity({ findings, execution: await scope(id, inputs) });
  }
  async assertLiveInputs(state, name, liveInputs) {
    const admission = admissions.get(liveInputs);
    requireThat(admission, 'Missing in-process milestone input qualification');
    // Recheck the inputs of proofs already qualified above. Do not rerun gates
    // or the recursive history/coverage assessment. Each environment/closure is
    // freshly read once per final guard, never reused from earlier qualification.
    const environments = new Map(), retained = new Set(), patterns = new Map(), deadlines = [];
    await this.store.closure([state.decisions, state.specValidation], retained);
    if (state.specValidation) await assertPlanningProof(await this.store.json(state.specValidation.proof));
    for (const { ref, candidate } of admission.proofs.values()) {
      await this.store.closure(ref, retained);
      const { result } = await this.recordedResult(ref, state);
      const inputs = await this.store.json(result.input), definition = gate(result.gate);
      if (result.gate === 'release') await this.refreshRelease(result, candidate, state);
      for (const support of inputs.support ?? []) await this.store.currentBytes(support);
      const environmentKey = identity({ configuration: inputs.configuration, source: contentIdentity(candidate), runner: definition.role === 'runner' });
      if (!environments.has(environmentKey)) environments.set(environmentKey,
        await executionEnvironment(this.context, candidate, inputs.configuration, definition.role === 'runner', process.env, { retainDiagnostics: false }));
      await restoreComparisonIndexes(this.context, inputs.environment);
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
    if (admission.exceptions.length) {
      const candidate = await this.store.json(state.candidate);
      for (const outcome of admission.exceptions) {
        const waiver = waiverFor(state, outcome.id, state.candidate.hash, contentIdentity(candidate),
          await this.waiverRisk(state, candidate, outcome.id), outcome.result ? await this.store.json(outcome.result) : null);
        requireThat(waiver && identity(waiver) === identity(outcome.exception), 'Exception applicability changed during milestone validation');
        if (waiver.waiverBasis) await this.store.get(waiver.waiverBasis.evidence);
      }
    }
    requireThat(identity((await this.commitments({ capture: false })).docs) === liveInputs.commitments,
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
    requireThat(MILESTONES.includes(name), 'Unknown milestone');
    const state = proposedState ?? (await this.state()).state;
    if (state.phase === 'COMPLETE' && name === 'completion') {
      const missing = [];
      try { await this.store.closure([state.candidate, state.decisions, state.results, state.integrations, state.validationFailures]); }
      catch (error) { missing.push(`Recorded completion evidence unavailable: ${error.message}`); }
      return { name, runId: state.runId, eventCount: state.eventCount, allowed: !missing.length, historical: true, missing, sourceCleanup: state.sourceCleanup };
    }
    memo = new Map(memo);
    const admission = { proofs: new Map(), administrative: new Map(), exceptions: [], historyGaps: null };
    memo.set(LIVE_PROOFS, admission.proofs);
    const missing = [];
    if (state.paused) missing.push('feature is explicitly paused');
    if (state.phase === 'COMPLETE' && name !== 'completion') missing.push('feature is complete');
    let current;
    try {
      await this.assertContext();
      current = await this.commitments({ capture: false });
      if (!findDecision(state, 'authorize-implementation', current.subject)) missing.push('current implementation authorization');
      if (!state.specValidation || state.specValidation.spec.hash !== current.docs['spec.md'].hash
        || state.specValidation.design.hash !== current.docs['design.md'].hash) missing.push('current specification validation');
      if (state.specValidation) {
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
    const outcomes = [];
    const definitions = [...enabled(state, 'acceptance'), ...(name === 'completion' ? enabled(state, 'completion') : [])];
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
      const satisfied = accepted?.outcome === 'PASS' || waiver;
      if (!satisfied) missing.push(`${definition.id}: ${accepted?.outcome ?? error ?? 'missing evidence'}`);
      outcomes.push({ id: definition.id, result: acceptedRef, reason: accepted?.summary ?? error, outcome: accepted?.outcome ?? 'UNAVAILABLE', exception: waiver ?? null, satisfied: Boolean(satisfied), ...(definition.role === 'core' ? { administrative: accepted } : {}) });
    }
    if (candidate && outcomes.some(item => item.id === 'verification' && item.outcome === 'PASS')) {
      try { await this.verificationCoverage(candidate, state, memo); } catch (error) { missing.push(error.message); }
    }
    if (['merge', 'completion'].includes(name)) {
      const acceptances = await qualifyingDecisions(this, state, 'accept', state.candidate?.hash, candidate);
      if (!acceptances.length) missing.push('current human acceptance');
      if (acceptances.length && acceptances.every(item => item.standingGrant)
        && outcomes.some(item => item.outcome !== 'PASS')) missing.push('standing acceptance requires every required gate to PASS');
    }
    if (name === 'merge') {
      const authorizations = await qualifyingDecisions(this, state, 'authorize-merge', state.candidate?.hash, candidate);
      if (!authorizations.length) missing.push('explicit merge authorization');
      if (authorizations.length && authorizations.every(item => item.standingGrant)
        && outcomes.some(item => item.outcome !== 'PASS')) missing.push('standing merge requires every required gate to PASS');
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
    return { name, runId: state.runId, eventCount: state.eventCount, allowed: missing.length === 0, missing, candidate: state.candidate, outcomes, liveInputs };
  }
  async pass(name, operation) {
    const prior = (await this.state()).state;
    if (name === 'completion' && prior.phase === 'COMPLETE') { requireThat((await this.check(name)).allowed, 'Recorded completion evidence is unavailable'); await this.cleanupSource(); return { state: (await this.state()).state, historical: true }; }
    requireThat(name !== 'merge', 'Merge must execute through a protected action adapter');
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
    try { commitments = await this.commitments({ capture: false }); } catch { /* Missing docs are reported by milestone checks. */ }
    const memo = new Map();
    let candidate = null, candidateUnavailable = false;
    if (state.candidate && state.decisions.some(item => item.kind === 'authorize-standing')) {
      try { candidate = await checkCandidate(this.store, this.context, state.candidate, { live: false }); }
      catch { candidateUnavailable = true; }
    }
    const standingAuthorizations = await Promise.all(state.decisions.filter(item => item.kind === 'authorize-standing').map(async grant => ({
      grant: grant.event, scope: grant.scope, subject: grant.subject, authority: grant.authority,
      applications: state.decisions.filter(item => item.standingGrant === grant.event).map(item => ({
        event: item.event, subject: item.subject, actions: ['accept', ...(item.actions ?? [])], action: item.action ?? null,
      })),
      ...(state.phase === 'COMPLETE' ? { allowed: false, reason: 'Feature run is complete' }
        : candidateUnavailable ? { allowed: false, reason: 'Current candidate evidence is unavailable or invalid' }
          : await standingValidity(this, state, grant, candidate, null, { allowIntegratedTargets: true })),
    })));
    return { ...state, temporaryViews: await viewStatus(this.store), commitments, standingAuthorizations, historyGaps: await this.historyGaps(state, memo), obligations: GATES.filter(item => !item.optional || state.optionalGates.includes(item.id)),
      enforcement: ENFORCEMENT, milestones: await Promise.all(MILESTONES.map(name => this.check(name, null, memo))) };
  }
  async coverageStatus() {
    const { state } = await this.state();
    if (!state.candidate) return { candidate: null, criteria: [], reason: 'No pinned candidate' };
    let candidate;
    try { candidate = await checkCandidate(this.store, this.context, state.candidate, { live: !['INTEGRATED', 'COMPLETE'].includes(state.phase) }); }
    catch (error) { return { candidate: state.candidate, criteria: [], reason: error.message }; }
    const assessments = new Map(), memo = new Map();
    for (const ref of [...state.results].reverse()) {
      const report = await this.store.json(ref);
      if (!['spec', 'judge'].includes(report.gate) || assessments.has(report.gate)) continue;
      try { assessments.set(report.gate, { reference: ref, result: await this.currentResult(ref, candidate, state, new Set(), memo) }); }
      catch { /* Missing/stale assessment cannot assert coverage. */ }
    }
    return { candidate: state.candidate, criteria: candidate.criteria.map(id => {
      const rows = [...assessments.values()].map(item => ({ reference: item.reference, row: item.result.criteria?.find(row => row.id === id) }));
      const outcome = rows.some(item => item.row?.outcome === 'FAIL') ? 'FAIL'
        : rows.length === 2 && rows.every(item => item.row?.outcome === 'PASS') ? 'PASS' : 'NOT YET';
      return { id, outcome, evidence: rows.filter(item => item.row).map(item => ({ result: item.reference, evidence: item.row.evidence })) };
    }), note: 'Derived from applicable independent assessments. This observation creates no gate proof or passage.' };
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
      if (pending.finished) continue;
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
      const recorded = await this.append(state, 'JOB_FINISHED', { jobId: pending.jobId, results: saved.results }, saved.operation);
      state = recorded.state;
    }
  }
  async cleanupSource() {
    const { state } = await this.state();
    if (state.phase !== 'COMPLETE' || state.sourceCleanup?.status === 'released') return;
    const pending = Object.values(state.jobs).some(job => !job.finished);
    const result = pending ? { status: 'pending', errors: [{ reason: 'Active or unresolved jobs still own source references' }] }
      : await releasePins(this.context, state.sourcePreparations);
    if (!pending && result.status === 'released') {
      try { await releaseComparisonIndexes(this.context); }
      catch (error) { result.status = 'pending'; result.errors = [...(result.errors ?? []), { reason: `Diagnostic cleanup: ${error.message}` }]; }
    }
    if (identity(result) !== identity(state.sourceCleanup)) await this.append((await this.state()).state, 'SOURCE_CLEANUP', result,
      { id: `cleanup_${randomUUID()}`, hash: identity(result) });
  }
  async execute(request) {
    const input = request.input ?? {};
    const operation = { id: request.operationId ?? randomUUID(), hash: identity({ operation: request.operation, input }) };
    const mutating = !['status', 'snapshot', 'milestone.check', 'coverage.status'].includes(request.operation);
    if (mutating) { await this.assertContext(); await this.store.activationHead({ repair: true }); }
    if (request.operation === 'run.resume-current') return this.resume(input, operation);
    // Restore exact retained copies and record completed original jobs before
    // current candidate/phase preflight; neither action invents a passed check.
    const active = await this.store.active();
    if (active) {
      if (mutating) { await this.store.events(active.runId, { repair: true }); await this.reconcileCompletedJobs(); await cleanupViews(this.store, (await this.state()).state); await this.cleanupSource(); }
      const existing = (await this.store.events(active.runId)).find(event => event.operation.id === operation.id);
      if (existing) {
        requireThat(existing.operation.hash === operation.hash, 'Operation identity reused for different input');
        return { event: existing, state: project(await this.store.events(active.runId)) };
      }
    }
    switch (request.operation) {
      case 'run.start': return this.start(input, operation);
      case 'status': case 'snapshot': return this.inspect();
      case 'coverage.status': requireThat(!Object.keys(input).length, 'Coverage status accepts no asserted outcomes'); return this.coverageStatus();
      case 'human.decide': return this.decide(input, operation);
      case 'authorization.apply': return applyStanding(this, input, operation);
      case 'spec.validate': return this.validateSpec(operation);
      case 'candidate.prepare': return this.prepare(input, operation);
      case 'candidate.ready': return this.readiness(operation);
      case 'gate.execute': return executeGates(this, input, operation);
      case 'milestone.check': return this.check(input.name);
      case 'milestone.pass': return this.pass(input.name, operation);
      case 'merge.prepare': return prepareMerge(this, input);
      case 'merge.execute': return protectedMerge(this, input, operation);
      case 'delivery.resume':
        try { return await resumeDelivery(this, input, operation); }
        catch (error) { return { status: 'needs-attention', reason: error.message, nextAction: 'inspect-and-resume' }; }
      case 'integration.observe': return observeIntegration(this, input, operation);
      case 'run.pause': case 'run.continue': {
        authority(input.authority);
        const { state } = await this.state();
        return this.append(state, request.operation === 'run.pause' ? 'PAUSED' : 'RESUMED', { authority: input.authority }, operation);
      }
      default: throw new Error(`Unsupported current operation: ${request.operation}`);
    }
  }
}
