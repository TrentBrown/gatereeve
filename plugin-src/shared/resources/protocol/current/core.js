import { ContractError } from '../errors.js';
import { HIGH_CAPABILITY_PROFILE, validateEvaluatorCapability } from '../agent-workflow.js';
import { executionEnvironment } from './environment.js';
import { patternInputs } from './pattern-inputs.js';
import { randomUUID } from 'node:crypto';
import { CONTRACT, PHASES, GATES, MILESTONES, ENFORCEMENT, requireThat, identity,
  identifier, text, decision, gate, authority, decisionHas, waiverFor } from './contracts.js';
import { CurrentStore } from './store.js';
import { requirements, sourceCandidate, assertSourceIsolation, checkCandidate, contentIdentity } from './evidence.js';
import { runTrustedPythonGuard, assertTrustedPythonProof, trustedPythonBinding } from '../python-guards.js';
import { executeGates, reviewContract } from './execution.js';
import { prepareMerge, merge, observeIntegration } from './actions.js';
import { captureStanding, applyStanding, standingValidity, qualifyingDecisions } from './authorization.js';

export function project(events) {
  requireThat(events[0]?.type === 'STARTED', 'Current run is not initialized');
  const first = events[0].payload;
  const state = { contract: CONTRACT, runId: events[0].runId, featureId: first.featureId,
    phase: 'DESIGNING', implementers: first.implementers, optionalGates: first.optionalGates,
    decisions: [], pendingDecisions: [], validationFailures: [], results: [], jobs: {}, expectations: {}, candidate: null, specValidation: null, integrated: null, integrations: {},
    ready: false, paused: false, eventCount: events.length };
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
      case 'CANDIDATE': state.candidate = value; state.ready = false; state.integrated = null; state.integrations = {}; state.phase = 'IMPLEMENTING'; break;
      case 'READY': state.ready = true; break;
      case 'JOB_STARTED': state.jobs[value.jobId] = { ...value, sequence: event.sequence, finished: false }; break;
      case 'JOB_OUTCOME_READY': state.jobs[value.jobId] = { ...state.jobs[value.jobId], ready: value }; break;
      case 'JOB_FINISHED': state.jobs[value.jobId] = { ...state.jobs[value.jobId], ...value, finishedSequence: event.sequence, finished: true }; state.results.push(...value.results); break;
      case 'MILESTONE':
        if (value.name === 'acceptance') state.phase = 'ACCEPTING';
        if (value.name === 'completion') state.phase = 'COMPLETE';
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
  return state.decisions.findLast(item => decisionHas(item, kind) && item.subject === subject);
}
export class CurrentCore {
  constructor(context, store, runtime = {}) {
    this.sourceContext = context;
    this.store = store;
    this.runtime = runtime;
  }
  get context() {
    return { ...this.sourceContext, repositories: this.sourceContext.repositories.map(repository => ({
      ...repository, gitExecutable: this.runtime.gitExecutable ?? repository.gitExecutable ?? 'git',
    })) };
  }
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
    const proof = await runTrustedPythonGuard('spec.validation.current', [this.store.home], this.runtime.pythonGuardOptions);
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
    if (value.kind === 'approve-design') {
      requireThat(['DESIGNING', 'SPECIFYING', 'PLANNING'].includes(state.phase), 'Use an amendment to change approved delivery requirements');
      const doc = await this.store.capture('design.md');
      requireThat(doc.hash === value.subject, 'Design approval does not match current bytes');
      value.documents = { 'design.md': doc };
      value.interview = await this.store.capture('interview.md');
    } else if (value.kind === 'authorize-implementation') {
      const current = await this.commitments();
      requireThat(state.phase === 'PLANNING' && state.specValidation, 'Validate specification before implementation authorization');
      requireThat(findDecision(state, 'approve-design', current.docs['design.md'].hash) || state.decisions.findLast(item => item.kind === 'amend' && item.approvedDesign?.hash === current.docs['design.md'].hash), 'Design approval is not current');
      requireThat(state.specValidation.spec.hash === current.docs['spec.md'].hash && state.specValidation.design.hash === current.docs['design.md'].hash,
        'Specification validation is not current');
      await assertTrustedPythonProof(await this.store.json(state.specValidation.proof), this.runtime.pythonGuardOptions);
      requireThat(value.subject === current.subject, 'Implementation authorization does not match current commitments');
      value.documents = current.docs;
    } else if (value.kind === 'amend') {
      const current = await this.commitments();
      requireThat(value.subject === current.subject, 'Amendment must bind the new commitments');
      const previous = state.decisions.findLast(item => item.documents && decisionHas(item, 'authorize-implementation'));
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
      if (value.kind === 'waive') for (const id of value.gates) requireThat(gate(id).waivable || state.decisions.some(item => item.kind === 'policy-amend' && item.subject === value.subject && item.gates.includes(id)), `${id} requires a policy amendment, not a waiver`);
      state = await this.pendingDecision(value, operation, state);
      const proposed = { ...state, decisions: [...state.decisions, value] };
      if (decisionHas(value, 'accept')) requireThat((await this.check('acceptance', proposed)).allowed, 'Required review proof is missing');
      if (decisionHas(value, 'authorize-merge')) {
        requireThat(findDecision(proposed, 'accept', value.subject), 'Human acceptance is required before merge authorization');
        requireThat(value.action && identity(value.action) === identity(await prepareMerge(this, value.action)), 'Merge authorization must bind the prepared action');
      }
    }
    return this.append(state, 'DECIDED', { ...value, requestId: operation.id }, operation);
  }
  async validateSpec(operation) {
    const { state } = await this.state();
    const current = await this.commitments();
    requireThat(['SPECIFYING', 'PLANNING'].includes(state.phase) || (state.phase !== 'COMPLETE' && findDecision(state, 'authorize-implementation', current.subject)), 'Specification validation is not available without current planning or implementation authority');
    const docs = await requirements(this.store);
    const approval = findDecision(state, 'approve-design', docs['design.md'].hash)
      ?? state.decisions.findLast(item => item.kind === 'amend' && item.approvedDesign?.hash === docs['design.md'].hash);
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
    const candidate = await sourceCandidate(this.store, this.context, input, { event: authorization.event, subject: authorization.subject, documents: authorization.documents });
    return this.append(state, 'CANDIDATE', candidate.ref, operation);
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
      const ids = checks.map(({ repository, command, args }) => identity({ repository, command, args }));
      // Completed checks establish coverage obligations, not mere job launches.
      for (const id of ids) required.add(id);
      try {
        await this.currentResult(ref, candidate, state, new Set(), memo, false);
        for (const id of ids) covered.set(id, result.outcome === 'PASS');
      } catch { /* Historical success cannot fill current coverage. */ }
    }
    requireThat([...required].every(id => covered.get(id) === true), 'Verification has uncovered previously declared checks; run them on current inputs or obtain a scoped exception');
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
  async currentResult(ref, candidate, state, seen = new Set(), memo = new Map(), requireCoverage = true, historicalAncestry = false) {
    requireThat(!seen.has(ref.hash), 'Cyclic evidence references');
    seen.add(ref.hash);
    await this.store.closure(ref);
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
    if (!memo.has(lossKey)) memo.set(lossKey, this.historyGaps(state));
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
            && candidate.repositories.some(repo => finding.path.startsWith(`${repo.alias}/`)));
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
    const evaluated = await checkCandidate(this.store, this.context, inputs.candidate, { live: false });
    for (const artifact of result.artifacts ?? []) await this.store.get(artifact);
    if (result.gate === 'reconcile' && result.outcome === 'PASS') {
      requireThat(result.proofs?.length === 2, 'Reconciliation lacks trusted validator proofs');
      const proofs = await Promise.all(result.proofs.map(ref => this.store.json(ref)));
      requireThat(identity(proofs.map(proof => proof.guardId).sort()) === identity(['issues.validation.current', 'tracker.validation.current']), 'Reconciliation validator proof identity differs');
      for (const proof of proofs) await assertTrustedPythonProof(proof, this.runtime.pythonGuardOptions);
    }
    for (const ref of inputs.support ?? []) await this.store.currentBytes(ref);
    const environmentKey = identity({ configuration: inputs.configuration, source: contentIdentity(candidate), runner: definition.role === 'runner' });
    if (!memo.has(environmentKey)) memo.set(environmentKey, executionEnvironment(this.context, candidate, inputs.configuration, definition.role === 'runner'));
    requireThat(identity(inputs.environment) === identity(await memo.get(environmentKey)), 'Execution environment changed');
    if (gate(result.gate).at === 'completion') requireThat(identity(inputs.integrations) === identity(state.integrations), 'Integration source changed');
    if (inputs.validUntil) requireThat(Date.now() <= Date.parse(inputs.validUntil), 'External evidence validity expired');
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
    if (result.gate === 'verification' && result.outcome === 'PASS' && requireCoverage) await this.verificationCoverage(candidate, state, memo);
    if (result.gate === 'retention') {
      // Retention is live integrity proof, not a permanent fact about an earlier
      // successful read. Later failed validations add obligations even when the
      // approved specification is subsequently restored byte-for-byte.
      requireThat(identity(result.retained?.validationFailures ?? null) === identity(state.validationFailures),
        'Failed specification evidence inventory changed; refresh retention proof');
      await this.store.closure([state.candidate, state.decisions, state.integrations, state.validationFailures]);
    }
    if (result.gate === 'packet') requireThat(identity(result.inventory) === identity(await this.inventory(state, candidate, memo)), 'Review packet inventory changed');
    return result;
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
      const validators = [];
      if (gateId === 'reconcile') for (const guardId of ['issues.validation.current', 'tracker.validation.current']) {
        try { validators.push(await trustedPythonBinding(guardId, this.runtime.pythonGuardOptions)); }
        catch (error) { validators.push({ guardId, unavailable: error.message }); }
      }
      return identity({ validators, configuration: input.configuration, dependencies, support, rule: reviewContract([gateId]),
        pattern: gateId === 'pattern' ? await patternInputs(this.store, this.context, candidate, { ...this.runtime.pythonGuardOptions, capture: false, allowMissing: true }) : null,
        externalValidity: !input.validUntil || Date.now() <= Date.parse(input.validUntil),
        integrations: gate(gateId).at === 'completion' ? state.integrations : null,
        historyGaps: gaps.filter(gap => gap.gate === null || gap.gate === gateId),
        environment: await executionEnvironment(this.context, candidate, input.configuration ?? {}, gate(gateId).role === 'runner') });
    };
    return identity({ findings, execution: await scope(id, inputs) });
  }
  async check(name, proposedState = null, memo = new Map()) {
    requireThat(MILESTONES.includes(name), 'Unknown milestone');
    const state = proposedState ?? (await this.state()).state;
    const missing = [];
    if (state.paused) missing.push('feature is explicitly paused');
    if (state.phase === 'COMPLETE' && name !== 'completion') missing.push('feature is complete');
    let current;
    try {
      current = await this.commitments({ capture: false });
      if (!findDecision(state, 'authorize-implementation', current.subject)) missing.push('current implementation authorization');
      if (!state.specValidation || state.specValidation.spec.hash !== current.docs['spec.md'].hash
        || state.specValidation.design.hash !== current.docs['design.md'].hash) missing.push('current specification validation');
      if (state.specValidation) {
        try { await assertTrustedPythonProof(await this.store.json(state.specValidation.proof), this.runtime.pythonGuardOptions); }
        catch { missing.push('current trusted specification validator proof'); }
      }
    } catch (error) { missing.push(error.message); }
    try { await this.store.closure(state.decisions); } catch (error) { missing.push(`Retained decision closure: ${error.message}`); }
    if (name === 'implementation') return { name, runId: state.runId, eventCount: state.eventCount, allowed: missing.length === 0, missing, subject: current?.subject ?? null };
    let candidate;
    try {
      requireThat(state.candidate, 'current candidate');
      candidate = await checkCandidate(this.store, this.context, state.candidate, { live: name !== 'completion' });
      requireThat(candidate.authorization.subject === current?.subject, 'Candidate commitments differ from current authorized requirements');
    } catch (error) { missing.push(error.message); }
    if (name !== 'completion' && !state.ready) missing.push('candidate readiness declaration');
    const outcomes = [];
    const definitions = [...enabled(state, 'acceptance'), ...(name === 'completion' ? enabled(state, 'completion') : [])];
    for (const definition of definitions) {
      let accepted = null;
      let acceptedRef = null;
      let error = null;
      if (candidate) for (const ref of [...state.results].reverse()) {
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
          await this.waiverRisk(state, candidate, definition.id), accepted); }
        catch (failure) { error = `Exception scope is unavailable: ${failure.message}`; }
      }
      const satisfied = accepted?.outcome === 'PASS' || waiver;
      if (!satisfied) missing.push(`${definition.id}: ${accepted?.outcome ?? error ?? 'missing evidence'}`);
      outcomes.push({ id: definition.id, result: acceptedRef, reason: accepted?.summary ?? error, outcome: accepted?.outcome ?? 'UNAVAILABLE', exception: waiver ?? null, satisfied: Boolean(satisfied) });
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
    return { name, runId: state.runId, eventCount: state.eventCount, allowed: missing.length === 0, missing, candidate: state.candidate, outcomes };
  }
  async pass(name, operation) {
    requireThat(name !== 'merge', 'Merge must execute through a protected action adapter');
    const check = await this.check(name);
    requireThat(check.allowed, 'Milestone is blocked', check);
    const { state } = await this.state();
    requireThat(state.runId === check.runId && state.eventCount === check.eventCount, 'Feature state changed during milestone check; retry current state');
    requireThat(name !== 'acceptance' || ['IMPLEMENTING', 'ACCEPTING'].includes(state.phase), 'Acceptance passage is outside its phase');
    requireThat(name !== 'completion' || ['INTEGRATED', 'COMPLETE'].includes(state.phase), 'Completion requires observed integration');
    requireThat(name !== 'implementation' || state.phase === 'IMPLEMENTING', 'Implementation phase is not authorized');
    return this.append(state, 'MILESTONE', { name, candidate: state.candidate }, operation);
  }
  async historyGaps(state) {
    const gaps = [];
    for (const [position, ref] of state.results.entries()) {
      try {
        await this.store.closure(ref);
        const { result } = await this.recordedResult(ref, state);
        assertSourceIsolation(await this.store.json((await this.store.json(result.input)).candidate), this.store.home);
      }
      catch {
        let gate = null;
        try { gate = (await this.store.json(ref)).gate ?? null; } catch { /* Unknown gate affects all prior proof. */ }
        gaps.push({ resultHash: ref.hash, gate, position, reason: 'Historical evidence is unavailable, corrupt or no longer isolated; fresh proof after this gap is required.' });
      }
    }
    for (const failure of state.validationFailures) {
      try { await this.store.closure(failure); }
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
    return { ...state, commitments, standingAuthorizations, historyGaps: await this.historyGaps(state), obligations: GATES.filter(item => !item.optional || state.optionalGates.includes(item.id)),
      enforcement: ENFORCEMENT, milestones: await Promise.all(MILESTONES.map(name => this.check(name, null, memo))) };
  }
  async append(state, type, payload, operation) {
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
  async execute(request) {
    const input = request.input ?? {};
    const operation = { id: request.operationId ?? randomUUID(), hash: identity({ operation: request.operation, input }) };
    const mutating = !['status', 'snapshot', 'milestone.check'].includes(request.operation);
    if (mutating) await this.store.activationHead({ repair: true });
    if (request.operation === 'run.resume-current') return this.resume(input, operation);
    // Restore exact retained copies and record completed original jobs before
    // current candidate/phase preflight; neither action invents a passed check.
    const active = await this.store.active();
    if (active) {
      if (mutating) { await this.store.events(active.runId, { repair: true }); await this.reconcileCompletedJobs(); }
      const existing = (await this.store.events(active.runId)).find(event => event.operation.id === operation.id);
      if (existing) {
        requireThat(existing.operation.hash === operation.hash, 'Operation identity reused for different input');
        return { event: existing, state: project(await this.store.events(active.runId)) };
      }
    }
    switch (request.operation) {
      case 'run.start': return this.start(input, operation);
      case 'status': case 'snapshot': return this.inspect();
      case 'human.decide': return this.decide(input, operation);
      case 'authorization.apply': return applyStanding(this, input, operation);
      case 'spec.validate': return this.validateSpec(operation);
      case 'candidate.prepare': return this.prepare(input, operation);
      case 'candidate.ready': return this.readiness(operation);
      case 'gate.execute': return executeGates(this, input, operation);
      case 'milestone.check': return this.check(input.name);
      case 'milestone.pass': return this.pass(input.name, operation);
      case 'merge.prepare': return prepareMerge(this, input);
      case 'merge.execute': return merge(this, input, operation);
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
