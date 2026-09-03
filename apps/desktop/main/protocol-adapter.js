// @ts-check

import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { recordGateWaiver } from '../resources/protocol/boundary.js';
import { gateInputFingerprint } from '../resources/protocol/fingerprint.js';
import { readFeatureRecord } from '../resources/protocol/feature.js';
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
  randomId = randomUUID,
  temporaryDirectory = tmpdir(),
} = {}) {
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
      const record = await readRecord(featureHome);
      const projection = project(record);
      const attempt = projection.boundaryAttempts.find((item) => item.id === attemptId);
      if (!attempt || attempt.state !== 'ACTIVE' || !attempt.context) {
        throw new Error('The selected boundary attempt is not active or lacks pinned context.');
      }
      const target = attempt.gates.find((gate) => gate.id === gateId);
      if (!target?.waiverAllowed || target.locked) {
        throw new Error('The selected module cannot be waived.');
      }
      const contextPath = join(temporaryDirectory, `gatereeve-waiver-${randomId()}.json`);
      await writeFile(contextPath, `${JSON.stringify(attempt.context, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
      try {
        const result = await runGuard(
          'boundary.context.current',
          [
            'check-current',
            '--context', contextPath,
            '--git-executable', gitExecutable,
            '--gh-executable', ghExecutable,
          ],
          { cwd: repositoryRoot, pythonExecutable },
        );
        if (!result.passed || !result.data) {
          throw new Error(result.stderr || 'Cannot verify that the pinned boundary context is current.');
        }
        // A fresh PR-context check proves the pinned source did not move. Preserve
        // the exact recorded dependency fingerprints rather than inventing new
        // inputs for gates whose evidence was produced outside Desktop.
        const currentFingerprints = Object.fromEntries(attempt.gates
          .filter((gate) => typeof gate.inputFingerprint === 'string')
          .map((gate) => [gate.id, gate.inputFingerprint]));
        const inputs = {
          schemaVersion: 1,
          scope: attempt.scope,
          gate: {
            id: target.id,
            moduleId: target.moduleId ?? target.id,
            moduleVersion: target.moduleVersion ?? null,
            moduleDigest: target.moduleDigest ?? null,
          },
          context: result.data,
        };
        return recordWaiver(featureHome, {
          attemptId,
          gateId,
          inputs,
          currentFingerprints,
          reason: reason.trim(),
          actor: { kind: 'human-confirmed', label: confirmationLabel.trim() },
          eventId: `evt-desktop-waiver-${randomId()}`,
        });
      } finally {
        await unlink(contextPath).catch(() => {});
      }
    },
  });
}
