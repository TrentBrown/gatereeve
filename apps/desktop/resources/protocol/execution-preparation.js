import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readFeatureRecord } from './feature.js';
import { projectRecord } from './projection.js';
import { runTrustedPythonGuard } from './python-guards.js';

export async function verifyBoundaryContextCurrent({
  context,
  repositoryRoot,
  gitExecutable = 'git',
  ghExecutable = 'gh',
  pythonExecutable = 'python3',
  runGuard = runTrustedPythonGuard,
  temporaryDirectory = tmpdir(),
  createId = randomUUID,
}) {
  const contextPath = join(temporaryDirectory, `gatereeve-boundary-${createId()}.json`);
  await writeFile(contextPath, `${JSON.stringify(context, null, 2)}\n`, {
    encoding: 'utf8', mode: 0o600, flag: 'wx',
  });
  try {
    const compact = context?.schemaVersion !== 1 || typeof context?.pullRequest !== 'object';
    const result = await runGuard(
      'boundary.context.current',
      compact
        ? [
            'check-boundary-current', '--cwd', repositoryRoot,
            '--context', contextPath,
            '--git-executable', gitExecutable,
            '--gh-executable', ghExecutable,
          ]
        : ['check-current', '--context', contextPath, '--git-executable', gitExecutable, '--gh-executable', ghExecutable],
      { cwd: repositoryRoot, pythonExecutable },
    );
    if (!result.passed || !result.data) {
      throw new Error(result.stderr || 'Cannot verify that the pinned boundary context is current.');
    }
    return result.data;
  } finally {
    await unlink(contextPath).catch(() => {});
  }
}

export async function prepareBoundaryModuleExecution({
  featureHome,
  repositoryRoot,
  attemptId,
  gateId,
  module = null,
  readRecord = readFeatureRecord,
  project = projectRecord,
  verifyCurrent = verifyBoundaryContextCurrent,
}) {
  const record = await readRecord(featureHome);
  const initialProjection = project(record);
  const initialAttempt = initialProjection.boundaryAttempts.find((item) => item.id === attemptId);
  if (!initialAttempt || initialAttempt.state !== 'ACTIVE' || !initialAttempt.context) {
    throw new Error('The selected boundary attempt is not active or lacks pinned context.');
  }
  const initialTarget = initialAttempt.gates.find((gate) => gate.id === gateId);
  if (!initialTarget) throw new Error('The selected boundary module is unavailable.');
  if (module && (
    initialTarget.moduleId !== module.id
    || initialTarget.moduleVersion !== module.version
    || initialTarget.moduleDigest !== module.digest
  )) throw new Error('The selected module no longer matches the pinned boundary module.');

  const context = await verifyCurrent({ context: initialAttempt.context, repositoryRoot });
  const currentFingerprints = Object.fromEntries(initialAttempt.gates
    .filter((gate) => typeof gate.inputFingerprint === 'string')
    .map((gate) => [gate.id, gate.inputFingerprint]));
  const projection = project(record, { gateFingerprints: { [attemptId]: currentFingerprints } });
  const attempt = projection.boundaryAttempts.find((item) => item.id === attemptId);
  const target = attempt.gates.find((gate) => gate.id === gateId);
  if (!target.eligible) throw new Error('The selected boundary module is not eligible to run.');
  return {
    attempt,
    target,
    currentFingerprints,
    modelHash: record.modelLock.modelHash,
    inputs: {
      schemaVersion: 1,
      scope: attempt.scope,
      gate: {
        id: target.id,
        moduleId: target.moduleId ?? target.id,
        moduleVersion: target.moduleVersion ?? null,
        moduleDigest: target.moduleDigest ?? null,
      },
      context,
    },
  };
}
