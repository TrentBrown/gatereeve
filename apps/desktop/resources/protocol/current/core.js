import { executionEnvironment } from './environment.js';
import { patternInputs } from './pattern-inputs.js';
import { randomUUID } from 'node:crypto';
import { CONTRACT, PHASES, GATES, MILESTONES, ENFORCEMENT, requireThat, identity,
  identifier, text, decision, gate, authority, decisionHas, waiverFor } from './contracts.js';
import { CurrentStore } from './store.js';
import { requirements, sourceCandidate, checkCandidate, contentIdentity } from './evidence.js';
import { runTrustedPythonGuard } from '../python-guards.js';
import { executeGates, reviewContract } from './execution.js';
import { prepareMerge, merge, observeIntegration } from './actions.js';

export function project(events) {
  requireThat(events[0]?.type === 'STARTED', 'Current run is not initialized');
  const first = events[0].payload;
  const state = { contract: CONTRACT, runId: events[0].runId, featureId: first.featureId,
    phase: 'DESIGNING', implementers: first.implementers, optionalGates: first.optionalGates,
    decisions: [], pendingDecisions: [], validationFailures: [], results: [], expectations: {}, candidate: null, specValidation: null, integrated: null, integrations: {},
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
      case 'SPEC_VALIDATED': state.specValidation = value; state.phase = 'PLANNING'; break;
      case 'CANDIDATE': state.candidate = value; state.ready = false; state.integrated = null; state.integrations = {}; state.phase = 'IMPLEMENTING'; break;
      case 'READY': state.ready = true; break;
      case 'RESULT': state.results.push(value); break;
      case 'JOB_STARTED': break;
      case 'JOB_FINISHED': state.results.push(...value.results); break;
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
    this.context = context;
    this.store = store;
    this.runtime = runtime;
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
      if (active) await this.state();
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
  async specProof(documents, operation) {
    const proof = await runTrustedPythonGuard('spec.validation.current', [this.store.home]);
    const reference = await this.store.putJson(proof);
    if (!proof.passed) {
      const payload = { documents, proof: reference, outcome: Number.isInteger(proof.exitCode) ? 'FAIL' : 'UNAVAILABLE', operation };
      const { state } = await this.state();
      await this.append(state, 'VALIDATION_FAILED', payload, { id: `failed_${identity(payload).slice(7)}`, hash: identity(payload) });
      const error = new Error('Specification validation failed; instruction and diagnostics remain retained');
      error.artifacts = [reference];
      throw error;
    }
    return reference;
  }
  async decide(input, operation) {
    const value = decision(input);
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
        const proof = await this.specProof(current.docs, operation);
        for (const ref of Object.values(current.docs)) await this.store.currentBytes(ref);
        value.specValidation = { spec: current.docs['spec.md'], design: current.docs['design.md'], proof };
      }
    } else {
      requireThat(state.candidate && value.subject === state.candidate.hash, 'Decision must bind the current candidate');
      const candidate = await checkCandidate(this.store, this.context, state.candidate);
      if (decisionHas(value, 'waive')) { value.candidate = state.candidate; value.applicability = contentIdentity(candidate); }
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
    requireThat(['SPECIFYING', 'PLANNING'].includes(state.phase), 'Specification validation is not available in this phase');
    const docs = await requirements(this.store);
    const approval = findDecision(state, 'approve-design', docs['design.md'].hash)
      ?? state.decisions.findLast(item => item.kind === 'amend' && item.approvedDesign?.hash === docs['design.md'].hash);
    requireThat(approval, 'Current design approval is required');
    const proof = await this.specProof(docs, operation);
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
  async currentResult(ref, candidate, state, seen = new Set(), memo = new Map(), requireCoverage = true) {
    requireThat(!seen.has(ref.hash), 'Cyclic evidence references');
    seen.add(ref.hash);
    await this.store.closure(ref);
    const result = await this.store.json(ref);
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
    const receipt = await this.store.json(result.receipt);
    requireThat(receipt.contract === CONTRACT && receipt.runId === state.runId && receipt.input === result.input.hash
      && receipt.gates.includes(result.gate), 'Execution receipt binding mismatch');
    if (definition.role === 'independent' && result.outcome !== 'UNAVAILABLE') requireThat(receipt.evaluator?.freshContext === true
      && receipt.evaluator.inheritedTurns === 0 && typeof receipt.evaluator.contextId === 'string'
      && !state.implementers.includes(receipt.evaluator.contextId), 'Independent evaluator is not qualified');
    const inputs = await this.store.json(result.input);
    requireThat(inputs.contract === CONTRACT && inputs.gates.includes(result.gate), 'Result input binding mismatch');
    requireThat(inputs.reviewContract === reviewContract(inputs.gates), 'Evaluator rules or output contract changed');
    if (inputs.pattern) requireThat(identity(inputs.pattern) === identity(await patternInputs(this.store, this.context, candidate, { capture: false })), 'Pattern policy or trigger inputs changed');
    const evaluated = await checkCandidate(this.store, this.context, inputs.candidate, { live: false });
    for (const artifact of result.artifacts ?? []) await this.store.get(artifact);
    for (const ref of inputs.support ?? []) await this.store.currentBytes(ref);
    const environmentKey = identity({ configuration: inputs.configuration, source: contentIdentity(candidate), runner: definition.role === 'runner' });
    if (!memo.has(environmentKey)) memo.set(environmentKey, executionEnvironment(this.context, candidate, inputs.configuration, definition.role === 'runner'));
    requireThat(identity(inputs.environment) === identity(await memo.get(environmentKey)), 'Execution environment changed');
    if (gate(result.gate).at === 'completion') requireThat(identity(inputs.integrations) === identity(state.integrations), 'Integration source changed');
    if (inputs.validUntil) requireThat(Date.now() <= Date.parse(inputs.validUntil), 'External evidence validity expired');
    if (result.mode === 'delta') {
      requireThat(definition.role === 'independent' && result.prior && result.coverage?.complete === true, 'Delta requires independent coverage and prior proof');
      const prior = await this.currentResult(result.prior, await this.store.json(result.priorCandidate), state, new Set(seen), memo);
      requireThat(prior.outcome === 'PASS' && prior.gate === result.gate, 'Delta prior proof is not passing evidence for this gate');
    }
    requireThat(contentIdentity(evaluated) === contentIdentity(candidate), 'Result is not applicable to current inputs');
    for (const dependency of inputs.consumed ?? []) await this.currentResult(dependency, candidate, state, new Set(seen), memo, requireCoverage);
    if (result.gate === 'verification' && result.outcome === 'PASS' && requireCoverage) await this.verificationCoverage(candidate, state, memo);
    if (result.gate === 'packet') requireThat(identity(result.inventory) === identity(await this.inventory(state, candidate, memo)), 'Review packet inventory changed');
    return result;
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
      if (state.specValidation) await this.store.get(state.specValidation.proof);
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
      const waiver = waiverFor(state, definition.id, state.candidate?.hash, candidate ? contentIdentity(candidate) : null);
      const satisfied = accepted?.outcome === 'PASS' || waiver;
      if (!satisfied) missing.push(`${definition.id}: ${accepted?.outcome ?? error ?? 'missing evidence'}`);
      outcomes.push({ id: definition.id, result: acceptedRef, reason: accepted?.summary ?? error, outcome: accepted?.outcome ?? 'UNAVAILABLE', exception: waiver ?? null, satisfied: Boolean(satisfied) });
    }
    if (['merge', 'completion'].includes(name) && !findDecision(state, 'accept', state.candidate?.hash)) missing.push('current human acceptance');
    if (name === 'merge' && !findDecision(state, 'authorize-merge', state.candidate?.hash)) missing.push('explicit merge authorization');
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
      try { await this.store.closure(ref); }
      catch {
        let gate = null;
        try { gate = (await this.store.json(ref)).gate ?? null; } catch { /* Unknown gate affects all prior proof. */ }
        gaps.push({ resultHash: ref.hash, gate, position, reason: 'Historical evidence is unavailable or corrupt; fresh proof after this loss is required.' });
      }
    }
    return gaps;
  }
  async inspect() {
    const { state } = await this.state();
    let commitments = null;
    try { commitments = await this.commitments({ capture: false }); } catch { /* Missing docs are reported by milestone checks. */ }
    const memo = new Map();
    return { ...state, commitments, historyGaps: await this.historyGaps(state), obligations: GATES.filter(item => !item.optional || state.optionalGates.includes(item.id)),
      enforcement: ENFORCEMENT, milestones: await Promise.all(MILESTONES.map(name => this.check(name, null, memo))) };
  }
  async append(state, type, payload, operation) {
    const active = await this.store.active();
    requireThat(active.runId === state.runId, 'Active run changed');
    const event = await this.store.append(state.runId, state.eventCount, type, payload, operation);
    // Return the state produced by this event, never a later concurrent mutation.
    return { event, state: project((await this.store.events(state.runId)).slice(0, event.sequence)) };
  }
  async execute(request) {
    const input = request.input ?? {};
    const operation = { id: request.operationId ?? randomUUID(), hash: identity({ operation: request.operation, input }) };
    if (request.operation === 'run.resume-current') return this.resume(input, operation);
    // Reconcile an already committed request before checking changed phase guards.
    const active = await this.store.active();
    if (active) {
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
