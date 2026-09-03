// @ts-check

import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { recordGateOutcome, recordGateWaiver } from '../resources/protocol/boundary.js';
import { readFeatureRecord } from '../resources/protocol/feature.js';
import {
  completeFinalizedFeature,
  recordFinalizationOutcome,
  recordFinalizationWaiver,
  startFeatureFinalization,
} from '../resources/protocol/finalization.js';
import { readDetail, snapshot } from '../resources/protocol/observer.js';
import { resolveWorkflowContext } from '../resources/protocol/context.js';
import { projectRecord } from '../resources/protocol/projection.js';
import { runTrustedPythonGuard } from '../resources/protocol/python-guards.js';
import { validateDetail, validateSnapshot } from '../resources/protocol/snapshot.js';

function requireSuccess(result, operation) {
  if (!result?.ok) {
    const error = new Error(result?.error?.message ?? `${operation} failed`);
    error.code = result?.error?.code ?? 'PROTOCOL_ERROR';
    throw error;
  }
  return result.data;
}

export function createProtocolAdapter({
  gitExecutable = 'git',
  ghExecutable = 'gh',
  pythonExecutable = 'python3',
  readRecord = readFeatureRecord,
  project = projectRecord,
  runGuard = runTrustedPythonGuard,
  recordWaiver = recordGateWaiver,
  recordOutcome = recordGateOutcome,
  startFinalizationRecord = startFeatureFinalization,
  recordFinalizationResult = recordFinalizationOutcome,
  recordFinalizationRiskAcceptance = recordFinalizationWaiver,
  completeFinalizationRecord = completeFinalizedFeature,
  randomId = randomUUID,
  temporaryDirectory = tmpdir(),
} = {}) {
  async function currentBoundaryGate({
    featureHome,
    repositoryRoot,
    attemptId,
    gateId,
    module = null,
  }) {
    const record = await readRecord(featureHome);
    const projection = project(record);
    const attempt = projection.boundaryAttempts.find((item) => item.id === attemptId);
    if (!attempt || attempt.state !== 'ACTIVE' || !attempt.context) {
      throw new Error('The selected boundary attempt is not active or lacks pinned context.');
    }
    const target = attempt.gates.find((gate) => gate.id === gateId);
    if (!target) throw new Error('The selected boundary module is unavailable.');
    if (module && (
      target.moduleId !== module.id
      || target.moduleVersion !== module.version
      || target.moduleDigest !== module.digest
    )) {
      throw new Error('The selected module no longer matches the pinned boundary module.');
    }
    const contextPath = join(temporaryDirectory, `gatereeve-boundary-${randomId()}.json`);
    await writeFile(contextPath, `${JSON.stringify(attempt.context, null, 2)}\n`, {
      encoding: 'utf8', mode: 0o600, flag: 'wx',
    });
    try {
      const result = await runGuard(
        'boundary.context.current',
        [
          'check-current', '--context', contextPath,
          '--git-executable', gitExecutable, '--gh-executable', ghExecutable,
        ],
        { cwd: repositoryRoot, pythonExecutable },
      );
      if (!result.passed || !result.data) {
        throw new Error(result.stderr || 'Cannot verify that the pinned boundary context is current.');
      }
      const currentFingerprints = Object.fromEntries(attempt.gates
          .filter((gate) => typeof gate.inputFingerprint === 'string')
          .map((gate) => [gate.id, gate.inputFingerprint]));
      const currentProjection = project(record, {
        gateFingerprints: { [attemptId]: currentFingerprints },
      });
      const currentAttempt = currentProjection.boundaryAttempts.find((item) => item.id === attemptId);
      const currentTarget = currentAttempt.gates.find((gate) => gate.id === gateId);
      return {
        attempt: currentAttempt,
        target: currentTarget,
        currentFingerprints,
        inputs: {
          schemaVersion: 1,
          scope: attempt.scope,
          gate: {
            id: target.id,
            moduleId: target.moduleId ?? target.id,
            moduleVersion: target.moduleVersion ?? null,
            moduleDigest: target.moduleDigest ?? null,
          },
          context: result.data,
        },
      };
    } finally {
      await unlink(contextPath).catch(() => {});
    }
  }

  async function currentFinalizationModule({ featureHome, attemptId, gateId, module = null }) {
    const record = await readRecord(featureHome);
    const projection = project(record);
    const attempt = projection.finalizationAttempts.find((item) => item.id === attemptId);
    if (!attempt || attempt.state !== 'ACTIVE') {
      throw new Error('The selected finalization attempt is not active.');
    }
    const target = attempt.modules.find((item) => item.id === gateId);
    if (!target) throw new Error('The selected finalization module is unavailable.');
    if (module && (
      target.moduleId !== module.id
      || target.moduleVersion !== module.version
      || target.moduleDigest !== module.digest
    )) {
      throw new Error('The selected module no longer matches the pinned finalization module.');
    }
    return {
      attempt,
      target,
      inputs: {
        schemaVersion: 1,
        scope: 'FEATURE',
        mergeInputSha: attempt.mergeInputSha,
        module: {
          id: target.moduleId,
          version: target.moduleVersion,
          digest: target.moduleDigest,
        },
        dependencyEventIds: Object.fromEntries(target.dependsOn.map((id) => [
          id,
          attempt.modules.find((candidate) => candidate.id === id)?.recordedEventId ?? null,
        ])),
      },
    };
  }

  return Object.freeze({
    async resolve(worktreePath) {
      return resolveWorkflowContext({ cwd: worktreePath, gitExecutable });
    },

    async snapshot(featureHome, options = {}) {
      return validateSnapshot(requireSuccess(await snapshot(featureHome, options), 'snapshot'));
    },

    async read(featureHome, kind, id = null, options = {}) {
      return validateDetail(
        requireSuccess(await readDetail(featureHome, kind, id, options), 'read'),
      );
    },

    async waiveBoundaryGate({
      featureHome,
      repositoryRoot,
      attemptId,
      gateId,
      reason,
      confirmationLabel,
    }) {
      if (typeof reason !== 'string' || reason.trim().length === 0) {
        throw new TypeError('A nonempty waiver reason is required.');
      }
      if (typeof confirmationLabel !== 'string' || confirmationLabel.trim().length === 0) {
        throw new TypeError('Human confirmation is required.');
      }
      const prepared = await currentBoundaryGate({
        featureHome, repositoryRoot, attemptId, gateId,
      });
      const { attempt, target } = prepared;
      if (!target?.waiverAllowed || target.locked) {
        throw new Error('The selected module cannot be waived.');
      }
      return recordWaiver(featureHome, {
        attemptId,
        gateId,
        inputs: prepared.inputs,
        currentFingerprints: prepared.currentFingerprints,
        reason: reason.trim(),
        actor: { kind: 'human-confirmed', label: confirmationLabel.trim() },
        eventId: `evt-desktop-waiver-${randomId()}`,
      });
    },

    async startFinalization({ featureHome }) {
      const record = await readRecord(featureHome);
      const finalMerge = record.events.findLast((event) => (
        event.type === 'SLICE_MERGE_RECORDED' && event.payload?.featureFinal === true
      ));
      if (typeof finalMerge?.payload?.integrationSha !== 'string') {
        throw new Error('The recorded feature-final merge does not identify its integration commit.');
      }
      return startFinalizationRecord(featureHome, {
        attemptId: `finalization-${randomId()}`,
        mergeInputSha: finalMerge.payload.integrationSha,
        actor: { kind: 'agent', label: 'GateReeve Desktop' },
        eventId: `evt-desktop-finalization-start-${randomId()}`,
      });
    },

    async prepareFinalizationModule(options) {
      const prepared = await currentFinalizationModule(options);
      if (!prepared.target.eligible) {
        throw new Error('The selected finalization module is not eligible to run.');
      }
      return prepared;
    },

    async recordFinalizationModuleOutcome({
      featureHome, attemptId, gateId, module, outcome, evidence, reason = null, actor,
    }) {
      await currentFinalizationModule({ featureHome, attemptId, gateId, module });
      return recordFinalizationResult(featureHome, {
        attemptId,
        moduleId: gateId,
        outcome,
        evidence,
        reason,
        actor,
        eventId: `evt-desktop-finalization-module-${randomId()}`,
      });
    },

    async waiveFinalizationModule({
      featureHome, attemptId, gateId, reason, confirmationLabel,
    }) {
      await currentFinalizationModule({ featureHome, attemptId, gateId });
      return recordFinalizationRiskAcceptance(featureHome, {
        attemptId,
        moduleId: gateId,
        reason,
        actor: { kind: 'human-confirmed', label: confirmationLabel.trim() },
        eventId: `evt-desktop-finalization-waiver-${randomId()}`,
      });
    },

    async completeFinalization({ featureHome, attemptId, confirmationLabel }) {
      return completeFinalizationRecord(featureHome, {
        attemptId,
        actor: { kind: 'human-confirmed', label: confirmationLabel.trim() },
        eventId: `evt-desktop-finalization-complete-${randomId()}`,
      });
    },

    async prepareBoundaryModule(options) {
      const prepared = await currentBoundaryGate(options);
      if (!prepared.target.eligible) {
        throw new Error('The selected boundary module is not eligible to run.');
      }
      return prepared;
    },

    async recordBoundaryModuleOutcome({
      featureHome,
      repositoryRoot,
      attemptId,
      gateId,
      module,
      outcome,
      evidence,
      reason = null,
      actor,
    }) {
      const prepared = await currentBoundaryGate({
        featureHome, repositoryRoot, attemptId, gateId, module,
      });
      return recordOutcome(featureHome, {
        attemptId,
        gateId,
        outcome,
        inputs: prepared.inputs,
        currentFingerprints: prepared.currentFingerprints,
        evidence,
        reason,
        actor,
        eventId: `evt-desktop-module-${randomId()}`,
      });
    },
  });
}
