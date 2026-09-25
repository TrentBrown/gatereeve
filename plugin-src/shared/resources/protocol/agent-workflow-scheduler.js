import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import { executeAgentWorkflowGate } from './agent-workflow-service.js';
import { prepareBoundaryModuleExecution } from './execution-preparation.js';
import { readFeatureRecord } from './feature.js';
import { projectRecord } from './projection.js';
import { recordGateOutcome } from './boundary.js';

function safeSegment(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)) {
    throw new Error(`Unsafe agent workflow path segment: ${value}`);
  }
  return value;
}

function moduleFromAttempt(record, attempt, target) {
  const start = record.events.find((event) => (
    event.type === 'BOUNDARY_STARTED' && event.payload?.attemptId === attempt.id
  ));
  const graph = start?.payload?.moduleGraph ?? record.modelLock.model.moduleGraph;
  const module = graph?.modules.find((item) => (
    item.id === target.moduleId
    && item.version === target.moduleVersion
    && item.digest === target.moduleDigest
  ));
  if (!module) throw new Error(`Pinned module definition is unavailable: ${target.moduleId}`);
  return module;
}

function activeBoundaryAttempt(projection, requestedAttemptId = null) {
  if (requestedAttemptId !== null) {
    return projection.boundaryAttempts.find((attempt) => attempt.id === requestedAttemptId) ?? null;
  }
  const slice = projection.slices.find((item) => item.id === projection.activeSliceId);
  return projection.boundaryAttempts.find((attempt) => attempt.id === slice?.activeAttemptId) ?? null;
}

function defaultArtifactRoot(featureHome, attempt) {
  const number = attempt.context?.pullRequest?.number ?? attempt.context?.pullRequest;
  if (Number.isSafeInteger(number) && number > 0) return resolve(featureHome, `pr-${number}`);
  return resolve(featureHome, 'runtime', 'agent-workflows', safeSegment(attempt.id));
}

export async function runEligibleAgentWorkflowGates({
  repositoryRoot,
  featureHome,
  attemptId = null,
  artifactRoot = null,
  adapter,
  resources,
  actorLabel = 'GateReeve agent-workflow',
  readRecord = readFeatureRecord,
  project = projectRecord,
  prepare = prepareBoundaryModuleExecution,
  execute = executeAgentWorkflowGate,
  record = recordGateOutcome,
  createId = randomUUID,
}) {
  const results = [];
  const attempted = new Set();
  let resolvedAttemptId = attemptId;
  while (true) {
    const featureRecord = await readRecord(featureHome);
    const initialProjection = project(featureRecord);
    const initialAttempt = activeBoundaryAttempt(initialProjection, attemptId);
    if (!initialAttempt || initialAttempt.state !== 'ACTIVE') {
      if (results.length === 0) throw new Error('No active boundary attempt is available.');
      break;
    }
    const currentFingerprints = Object.fromEntries(initialAttempt.gates
      .filter((gate) => typeof gate.inputFingerprint === 'string')
      .map((gate) => [gate.id, gate.inputFingerprint]));
    const projection = project(featureRecord, {
      gateFingerprints: { [initialAttempt.id]: currentFingerprints },
    });
    const attempt = activeBoundaryAttempt(projection, attemptId);
    resolvedAttemptId = attempt.id;
    const target = attempt.gates.find((gate) => (
      gate.eligible
      && gate.outcome === 'UNSET'
      && !attempted.has(gate.id)
      && moduleFromAttempt(featureRecord, attempt, gate).run?.kind === 'agent-workflow'
    ));
    if (!target) break;
    attempted.add(target.id);
    const module = moduleFromAttempt(featureRecord, attempt, target);
    const prepared = await prepare({
      featureHome, repositoryRoot, attemptId: attempt.id, gateId: target.id, module,
    });
    const outputRoot = artifactRoot === null
      ? defaultArtifactRoot(featureHome, attempt)
      : resolve(artifactRoot);
    const result = await execute({
      repositoryRoot,
      featureHome,
      artifactRoot: outputRoot,
      modelHash: prepared.modelHash,
      module,
      prepared,
      adapter,
      resources,
      createId,
      recordOutcome: async ({ outcome, evidence, reason }) => {
        const current = await prepare({
          featureHome, repositoryRoot, attemptId: attempt.id, gateId: target.id, module,
        });
        if (JSON.stringify(current.inputs) !== JSON.stringify(prepared.inputs)) {
          throw new Error('Agent workflow inputs changed before outcome recording.');
        }
        return record(featureHome, {
          attemptId: attempt.id,
          gateId: target.id,
          outcome,
          inputs: current.inputs,
          currentFingerprints: current.currentFingerprints,
          evidence,
          reason,
          actor: { kind: 'agent', label: actorLabel },
          eventId: `evt-agent-workflow-${createId()}`,
        });
      },
    });
    results.push({ gateId: target.id, moduleId: module.id, ...result });
    if (result.status !== 'completed') break;
  }
  return { schemaVersion: 1, attemptId: resolvedAttemptId, results };
}
