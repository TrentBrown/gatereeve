import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { recordGateOutcome, requestBoundaryHumanReview } from './boundary.js';
import { ContractError } from './errors.js';
import { prepareBoundaryModuleExecution, verifyBoundaryContextCurrent } from './execution-preparation.js';
import { readFeatureRecord } from './feature.js';
import { fingerprint, gateInputFingerprint } from './fingerprint.js';
import { projectRecord } from './projection.js';
import { recordSliceTransition } from './transitions.js';

const exec = promisify(execFile);
const bridge = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'boundary_retry.py');
const artifacts = { verification: 'verification.md', specEvaluation: 'spec-evaluation.md',
  judge: 'judge.md', codeReview: 'code-review.md', patternReview: 'pattern-review.md', explainDiff: 'explain-diff.html' };
const presentation = new Set(['explainDiff', 'packetValidation']);
const nonblocking = new Set(['PASS', 'WAIVED', 'NOT_APPLICABLE']);
const safeId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const hash = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

// This is an execution cursor, not workflow authority. Journal events and live
// PR/Git observations decide passage, including after an uncertain mutation.
async function save(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temporary, path); }
  finally { await unlink(temporary).catch(() => {}); }
}

async function load(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function claim(path) {
  try { const file = await open(path, 'wx', 0o600);
    await file.writeFile(JSON.stringify({ pid: process.pid, host: hostname() })); await file.close(); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const previous = await load(path);
    if (previous?.host !== hostname() || !Number.isInteger(previous.pid)) throw new ContractError('Retry lock requires operator reconciliation');
    try { process.kill(previous.pid, 0); }
    catch (failure) { if (failure.code === 'ESRCH') {
      await unlink(path); return claim(path);
    } throw failure; }
    throw new ContractError('Retry already running; reconcile the existing operation before replay');
  }
  return () => unlink(path);
}

export async function runBoundaryRetryBridge(request) {
  // No shell, arbitrary command, PR creation, ready/reopen, merge or waiver.
  const child = await new Promise((success, failure) => {
    const child = execFile('python3', [bridge], { cwd: request.repositoryRoot,
      env: { ...globalThis.process.env, PYTHONDONTWRITEBYTECODE: '1' }, maxBuffer: 10 * 1024 * 1024 },
    (error, stdout, stderr) => error ? failure(new ContractError(stderr.trim() || error.message)) : success(stdout));
    child.stdin.end(JSON.stringify(request));
  });
  return JSON.parse(child);
}

function inputsFor(state, gate, module) {
  return { schemaVersion: 1, scope: state.identity.scope,
    gate: { id: gate.id, moduleId: gate.moduleId ?? gate.id,
      moduleVersion: gate.moduleVersion ?? null, moduleDigest: gate.moduleDigest ?? null },
    context: state.executionContext,
    ...(module?.run?.reviewInput ? { criteria: state.criteria ?? null } : {}) };
}

async function evidenceBytes(home, path) {
  if (typeof path !== 'string' || isAbsolute(path) || path.split(/[\\/]/u).some(x => x === '..' || x === '')) {
    throw new ContractError('Retry evidence must be a safe feature-relative file');
  }
  const root = await realpath(home); const file = await realpath(resolve(root, path));
  if (relative(root, file).startsWith('..') || file !== resolve(root, path)) throw new ContractError('Retry evidence cannot escape or follow symlinks');
  return readFile(file);
}

async function currentAttempt(home, state) {
  const record = await readFeatureRecord(home);
  const raw = projectRecord(record);
  const attempt = raw.boundaryAttempts.find(x => x.id === state.attemptId);
  if (!attempt) return { record, projection: raw, attempt: null, fingerprints: {} };
  if (attempt.sliceId !== state.identity.sliceId || attempt.scope !== state.identity.scope
      || fingerprint(attempt.context) !== fingerprint(state.context) || attempt.modelHash !== state.identity.modelHash) throw new ContractError('Checkpoint conflicts with journal attempt; reconcile before replay');
  state.criteria = attempt.criteria ?? null;
  const modules = record.modelLock.model.moduleGraph?.modules ?? [];
  const fingerprints = {};
  for (const gate of attempt.gates) {
    const module = modules.find(x => x.boundary?.gateId === gate.id);
    fingerprints[gate.id] = gateInputFingerprint({ modelHash: state.identity.modelHash,
      attemptId: state.attemptId, gateId: gate.id, inputs: inputsFor(state, gate, module) });
    if (gate.evidence && hash(await evidenceBytes(home, gate.evidence.path)) !== gate.evidence.hash) {
      throw new ContractError(`Recorded ${gate.id} evidence changed; remediate and declare revised readiness`);
    }
  }
  const projection = projectRecord(record, { gateFingerprints: { [state.attemptId]: fingerprints } });
  return { record, projection, fingerprints, attempt: projection.boundaryAttempts.find(x => x.id === state.attemptId) };
}

// Presentation normally waits for substantive work. An explicit graph edge
// through presentation makes its descendants wait instead; never add a barrier.
function descendants(gates, id) {
  const found = new Set([id]);
  let changed = true;
  while (changed) { changed = false;
    for (const gate of gates) if (!found.has(gate.id) && gate.dependsOn.some(dep => found.has(dep))) {
      found.add(gate.id); changed = true;
    }
  }
  found.delete(id); return found;
}

function presentationReady(gates, id) {
  const later = descendants(gates, id);
  return gates.filter(gate => !presentation.has(gate.id) && !later.has(gate.id))
    .every(gate => nonblocking.has(gate.outcome) && gate.freshness === 'CURRENT');
}

function result(state, status, extra = {}) {
  return { schemaVersion: 1, status, retryId: state.identity.retryId, attemptId: state.attemptId,
    pullRequest: state.identity.pullRequest, progress: state.progress, ...extra };
}

/** One portable cursor, repeatedly invoked after implementer-owned readiness.
 * Skill/command/native runners perform substantive work, using the returned
 * exact preparation. The coordinator owns fresh identities, recording and
 * packet mechanics. It never supplies a substantive verdict itself. */
export async function retryBoundary(featureHome, input, dependencies = {}) {
  const bridgeRun = dependencies.bridge ?? runBoundaryRetryBridge;
  const verify = dependencies.verifyCurrent ?? verifyBoundaryContextCurrent;
  const { retryId, sliceId, readinessId, pullRequest, scope = 'SLICE', repositoryRoot,
    repositoryAlias, actor, action = 'advance' } = input;
  if (![retryId, sliceId].every(x => typeof x === 'string' && safeId.test(x))
      || !Number.isInteger(pullRequest) || pullRequest < 1 || !['SLICE', 'FEATURE_FINAL'].includes(scope)
      || !['advance', 'record', 'packet', 'finalize', 'status'].includes(action)
      || !['agent', 'human-confirmed'].includes(actor?.kind)) throw new ContractError('Invalid boundary retry request');
  const record = await readFeatureRecord(featureHome);
  const identity = { retryId, sliceId, readinessId: readinessId ?? null, pullRequest, scope,
    repositoryRoot: await realpath(repositoryRoot), repositoryAlias: repositoryAlias ?? null,
    featureId: record.events[0].featureId, modelHash: record.modelLock.modelHash };
  const gitDirectory = dependencies.checkpointDirectory ?? (await exec('git', ['-C', repositoryRoot,
    'rev-parse', '--absolute-git-dir'])).stdout.trim();
  const directory = join(gitDirectory, 'gatereeve-retries', fingerprint({ featureId: identity.featureId }).slice(7));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${retryId}.json`);
  if (action === 'status') {
    const state = await load(path);
    if (!state) return { schemaVersion: 1, status: 'NOT_STARTED', retryId };
    if (fingerprint(state.identity) !== fingerprint(identity)) throw new ContractError('Retry identity changed; use a fresh retry ID');
    const observed = await currentAttempt(featureHome, state);
    return result(state, 'OBSERVED', { state: observed.attempt?.state ?? null,
      gates: observed.attempt?.gates.map(x => ({ id: x.id, outcome: x.outcome, freshness: x.freshness })) ?? [] });
  }
  const release = await claim(`${path}.lock`);
  let state = null;
  try {
    state = await load(path);
    if (state && fingerprint(state.identity) !== fingerprint(identity)) throw new ContractError('Retry identity changed; use a fresh retry ID');
    if (!state) {
      if (action !== 'advance') throw new ContractError('Start a retry with advance before recording or finalizing');
      const projection = projectRecord(record);
      const slice = projection.slices.find(x => x.id === sliceId);
      if (projection.activeSliceId !== sliceId || slice?.state !== 'IMPLEMENTING'
          || slice.scope !== scope || projection.suspension.paused || projection.blockingChangeIds.length
          || !projection.implementationAuthorization.current) throw new ContractError('Retry requires the active authorized implementing slice; implementer must remediate and declare revised readiness first');
      state = { schemaVersion: 1, identity, attemptId: `retry-${retryId}`, progress: 'PREPARING_PR',
        context: null, executionContext: null, criteria: slice.rubricCriteria, preparation: null };
      if (projection.boundaryAttempts.some(x => x.id === state.attemptId)) throw new ContractError('Retry attempt ID already exists without its checkpoint; reconcile before starting');
      await save(path, state); // Before the possibly uncertain closure mutation.
    }
    if (!state.context) {
      const prepared = await bridgeRun({ ...identity, action: 'prepare' });
      state.context = prepared.context;
      state.packetId = prepared.packetId;
      if (typeof state.packetId !== 'string' || !/^pr-(?:[A-Za-z0-9._-]+-)?[1-9][0-9]*$/u.test(state.packetId)) throw new ContractError('Retry packet identity is invalid');
      if (state.context.pullRequest?.number !== pullRequest || state.context.repositoryRoot !== identity.repositoryRoot) throw new ContractError('Retry bridge returned the wrong PR or repository');
      state.progress = 'PR_PREPARED'; await save(path, state);
    }
    if (action !== 'finalize') {
      state.executionContext = await verify({ context: state.context, repositoryRoot });
      await save(path, state);
    }
    let observed = await currentAttempt(featureHome, state);
    if (!observed.attempt) {
      await recordSliceTransition(featureHome, 'begin-boundary', sliceId, { actor,
        eventId: `evt-retry-${retryId}-begin`, payload: { attemptId: state.attemptId, scope,
          context: state.context, readinessId, criteria: state.criteria } });
      await dependencies.afterMutation?.('begin-boundary');
      state.progress = 'BOUNDARY_STARTED'; await save(path, state);
      observed = await currentAttempt(featureHome, state);
    }
    if (observed.projection.suspension.paused || observed.projection.blockingChangeIds.length) throw new ContractError('Retry blocked by pause or unresolved changes');
    if (observed.attempt.state === 'HUMAN_REVIEW') {
      if (action !== 'finalize') return result(state, 'COMMIT_AND_PUSH_EVIDENCE', { reason: 'Commit/push the human-review journal event, then finalize to resolve the exact final head' });
      const verified = await bridgeRun({ ...identity, action: 'finalize', context: state.context,
        evidencePaths: evidencePaths(featureHome, repositoryRoot, state.packetId) });
      if (!observed.attempt.requiredCurrentAndNonblocking) throw new ContractError('Human-review evidence is no longer current');
      state.progress = 'FINAL_HEAD_VERIFIED'; await save(path, state);
      return result(state, 'AWAITING_HUMAN_REVIEW', { finalHeadSha: verified.synchronization.finalHeadSha });
    }
    if (observed.attempt.state !== 'ACTIVE') return result(state, 'REMEDIATION_REQUIRED', { reason: 'Implementer must fix, review defect class and declare revised readiness; use a new retry ID' });
    const failed = observed.attempt.gates.filter(x => x.outcome === 'FAIL' || x.freshness === 'STALE');
    if (failed.length) return result(state, 'REMEDIATION_REQUIRED', { gates: failed.map(x => x.id) });
    if (action === 'record') {
      const prepared = state.preparation;
      const gate = observed.attempt.gates.find(x => x.id === input.gateId);
      if (!prepared || gate?.id !== prepared.target.id) throw new ContractError('Prepare this gate through advance before recording');
      if (prepared.module?.run?.kind === 'agent-workflow') throw new ContractError('Native agent workflow must publish and record through its independent runtime; advance reconciles the result');
      const fp = gateInputFingerprint({ modelHash: identity.modelHash, attemptId: state.attemptId, gateId: gate.id, inputs: prepared.inputs });
      if (fp !== observed.fingerprints[gate.id] || fingerprint(prepared.dependencies) !== fingerprint(Object.fromEntries(gate.dependsOn.map(id => [id, observed.attempt.gates.find(x => x.id === id).recordedEventId])))) throw new ContractError('Prepared gate inputs or dependency events changed');
      const eventId = `evt-retry-${retryId}-${gate.id}`;
      const existing = observed.record.events.find(x => x.eventId === eventId);
      const evidence = input.outcome === 'NOT_APPLICABLE' ? null
        : { path: input.evidencePath, hash: hash(await evidenceBytes(featureHome, input.evidencePath)) };
      if (existing) {
        if (existing.payload.inputFingerprint !== fp || existing.payload.outcome !== input.outcome
            || fingerprint(existing.payload.evidence) !== fingerprint(evidence)) throw new ContractError('Uncertain gate result conflicts with recorded event; reconcile before replay');
      } else { await recordGateOutcome(featureHome, { attemptId: state.attemptId, gateId: gate.id,
        outcome: input.outcome, reason: input.reason ?? null, evidence, inputs: prepared.inputs,
        currentFingerprints: observed.fingerprints, expectedModelHash: identity.modelHash,
        expectedDependencyEventIds: prepared.dependencies, actor, eventId });
        await dependencies.afterMutation?.(`record:${gate.id}`); }
      state.progress = `RECORDED:${gate.id}`; await save(path, state);
      return result(state, 'RECORDED', { gateId: gate.id });
    }
    if (action === 'packet' || action === 'finalize') {
      const packetGate = observed.attempt.gates.find(x => x.id === 'packetValidation');
      const afterPacket = descendants(observed.attempt.gates, 'packetValidation');
      const beforePacket = observed.attempt.gates.filter(x => x.id !== 'packetValidation' && !afterPacket.has(x.id));
      if (beforePacket.some(x => !nonblocking.has(x.outcome) || x.freshness !== 'CURRENT')
          || (!nonblocking.has(packetGate.outcome) && !packetGate.eligible)) {
        throw new ContractError('All substantive and presentation prerequisites must be current before packet preparation');
      }
      if (action === 'packet') {
        const gate = observed.attempt.gates.find(x => x.id === 'packetValidation');
        const module = observed.record.modelLock.model.moduleGraph.modules.find(x => x.boundary?.gateId === gate.id);
        const packet = state.packetId;
        const gates = {};
        for (const [id, filename] of Object.entries(artifacts)) {
          const recorded = observed.attempt.gates.find(x => x.id === id);
          if (!recorded) continue; // Disabled checks have no artifact requirement.
          const disposition = recorded.outcome === 'WAIVED' ? 'waived' : recorded.outcome === 'NOT_APPLICABLE' ? 'not_applicable' : 'passed';
          const artifact = recorded.evidence?.path?.startsWith(`${packet}/`)
            ? recorded.evidence.path.slice(packet.length + 1).replace(/[^/]+$/u, filename)
            : `attempts/${state.attemptId}/${filename}`;
          gates[id] = { disposition, reason: disposition === 'passed' ? null : recorded.reason,
            evidence: disposition === 'not_applicable' ? null : { path: artifact, sha256: hash(await evidenceBytes(featureHome, `${packet}/${artifact}`)) } };
        }
        const modular = Object.keys(gates).length !== Object.keys(artifacts).length;
        const manifest = { schemaVersion: modular ? 4 : 2, ...(modular ? { attemptId: state.attemptId } : {}), scope: scope.toLowerCase().replace('_', '-'),
          featureId: identity.featureId, repositoryAlias: state.context.repositoryAlias, packetId: packet,
          pullRequest: state.context.pullRequest, mergeBaseSha: state.context.mergeBaseSha,
          evaluatedSourceSha: state.context.evaluatedSourceSha,
          featureBaseSha: scope === 'FEATURE_FINAL' ? state.context.featureBaseSha : null,
          applicability: Object.fromEntries(['specEvaluation', 'judge', 'patternReview'].filter(id => gates[id]).map(id => [id, gates[id].disposition !== 'not_applicable'])), gates };
        await mkdir(join(featureHome, packet), { recursive: true });
        await save(join(featureHome, packet, 'boundary.json'), manifest);
        state.packetPreparation = { inputs: inputsFor(state, gate, module),
          dependencies: Object.fromEntries(gate.dependsOn.map(id => [id, observed.attempt.gates.find(x => x.id === id).recordedEventId])) };
        state.progress = 'PACKET_PREPARED'; await save(path, state);
        return result(state, 'COMMIT_AND_PUSH_EVIDENCE', { packetPath: join(featureHome, packet, 'boundary.json'),
          evidencePaths: evidencePaths(featureHome, repositoryRoot, packet) });
      }
      if (!state.packetPreparation) throw new ContractError('Prepare packet before final synchronization');
      const packet = state.packetId;
      const verified = await bridgeRun({ ...identity, action: 'finalize', context: state.context,
        evidencePaths: evidencePaths(featureHome, repositoryRoot, packet) });
      const gate = observed.attempt.gates.find(x => x.id === 'packetValidation');
      if (fingerprint(state.packetPreparation.dependencies) !== fingerprint(Object.fromEntries(gate.dependsOn.map(id => [id, observed.attempt.gates.find(x => x.id === id).recordedEventId])))) throw new ContractError('Packet predecessor changed; prepare packet again');
      const output = `${packet}/attempts/${state.attemptId}/packet-validation-clean.json`;
      const outcomeId = `evt-retry-${retryId}-packetValidation`;
      if (!observed.record.events.some(x => x.eventId === outcomeId)) {
        await save(join(featureHome, output), verified);
        await recordGateOutcome(featureHome, { attemptId: state.attemptId, gateId: 'packetValidation',
          outcome: 'PASS', inputs: state.packetPreparation.inputs, currentFingerprints: observed.fingerprints,
          evidence: { path: output, hash: hash(await evidenceBytes(featureHome, output)) },
          expectedModelHash: identity.modelHash, expectedDependencyEventIds: state.packetPreparation.dependencies, actor, eventId: outcomeId });
        state.progress = 'PACKET_RECORDED'; await save(path, state);
        return result(state, 'COMMIT_AND_PUSH_EVIDENCE', { evidencePaths: evidencePaths(featureHome, repositoryRoot, packet) });
      }
      observed = await currentAttempt(featureHome, state);
      if (!observed.attempt.requiredCurrentAndNonblocking) return result(state, 'CONTINUE_GATES', {
        reason: 'Packet prerequisites are validated; run the remaining graph descendants before human review',
      });
      await requestBoundaryHumanReview(featureHome, { attemptId: state.attemptId,
        currentFingerprints: observed.fingerprints, actor, eventId: `evt-retry-${retryId}-human-review` });
      state.progress = 'HUMAN_REVIEW_REQUESTED'; await save(path, state);
      return result(state, 'COMMIT_AND_PUSH_EVIDENCE', { evidencePaths: evidencePaths(featureHome, repositoryRoot, packet),
        reason: 'Commit/push the human-review journal event, then finalize to resolve the exact final head' });
    }
    if (observed.attempt.requiredCurrentAndNonblocking) return result(state, 'FINALIZE_PACKET');
    const candidates = observed.attempt.gates.filter(x => x.eligible && x.outcome === 'UNSET'
      && (!presentation.has(x.id) || presentationReady(observed.attempt.gates, x.id)));
    candidates.sort((a, b) => (['codeReview', 'specEvaluation'].includes(a.id) ? -1 : 0)
      - (['codeReview', 'specEvaluation'].includes(b.id) ? -1 : 0));
    const target = candidates[0];
    if (!target) return result(state, 'BLOCKED', { gates: observed.attempt.gates.filter(x => !nonblocking.has(x.outcome)).map(x => ({ id: x.id, blockers: x.blockers })), reason: 'Resolve protocol prerequisites; presentation is deferred until substantive gates are clean' });
    if (target.id === 'packetValidation') return result(state, 'PREPARE_PACKET');
    const module = observed.record.modelLock.model.moduleGraph.modules.find(x => x.boundary?.gateId === target.id);
    const prepared = await prepareBoundaryModuleExecution({ featureHome, repositoryRoot, attemptId: state.attemptId,
      gateId: target.id, module, verifyCurrent: verify });
    state.preparation = { ...prepared, module,
      dependencies: Object.fromEntries(target.dependsOn.map(id => [id, observed.attempt.gates.find(x => x.id === id).recordedEventId])) };
    state.progress = `PREPARED:${target.id}`; await save(path, state);
    if (target.id === 'pinContext') {
      const output = `${state.packetId}/attempts/${state.attemptId}/context.json`;
      await mkdir(dirname(join(featureHome, output)), { recursive: true });
      await save(join(featureHome, output), state.context);
      await recordGateOutcome(featureHome, { attemptId: state.attemptId, gateId: target.id, outcome: 'PASS',
        inputs: prepared.inputs, currentFingerprints: observed.fingerprints,
        evidence: { path: output, hash: hash(await evidenceBytes(featureHome, output)) },
        actor, eventId: `evt-retry-${retryId}-pinContext` });
      state.progress = 'RECORDED:pinContext'; await save(path, state);
      return result(state, 'RECORDED', { gateId: target.id });
    }
    const gateContext = artifacts[target.id] ? await bridgeRun({ ...identity, action: 'gate',
      context: state.context, attemptId: state.attemptId, gateId: target.id }) : null;
    return result(state, 'RUN_GATE', { gateId: target.id, module, preparation: prepared, gateContext,
      evidenceDirectory: join(featureHome, state.packetId, 'attempts', state.attemptId) });
  } catch (error) {
    error.details = { ...(error.details ?? {}), retryId, attemptId: state?.attemptId ?? null,
      progress: state?.progress ?? 'NOT_STARTED', action,
      nextAction: 'Reconcile the journal and current PR; repair the reported blocker before replay. Changed inputs require implementer remediation/readiness and a fresh retry ID.' };
    throw error;
  } finally { await release(); }
}

function evidencePaths(home, root, packet) {
  return [join(home, packet), join(home, 'issues.md'), join(home, 'tracker.md'), join(home, 'events.jsonl')]
    .map(path => relative(root, path).split('\\').join('/'));
}
