// @ts-check

import { realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute } from 'node:path';

const DIAGNOSTIC_TITLES = Object.freeze({
  missing: 'Missing feature record',
  legacy: 'Legacy feature record',
  inconsistent: 'Inconsistent feature record',
  incompatible: 'Model-incompatible feature record',
  unreadable: 'Unreadable feature record',
});

async function canonicalDirectory(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) {
    throw new Error('Choose an absolute project directory.');
  }
  const canonical = await realpath(path);
  if (!(await stat(canonical)).isDirectory()) throw new Error('The selected project is not a directory.');
  return canonical;
}

function diagnosticFromSnapshot(selectedPath, featureHome, snapshot) {
  const classification = DIAGNOSTIC_TITLES[snapshot.mode] ? snapshot.mode : 'unreadable';
  const failedChecks = (snapshot.blockers ?? []).map((blocker) =>
    blocker.reason ?? blocker.message ?? blocker.type
  );
  return {
    classification,
    title: DIAGNOSTIC_TITLES[classification],
    message: failedChecks[0] ?? 'The selected directory is not a supported governed project.',
    selectedPath,
    featureHome,
    failedChecks,
    pinnedModel: snapshot.model?.pinned
      ? `${snapshot.model.pinned.id}@${snapshot.model.pinned.version}`
      : null,
    supportedModel: snapshot.model?.bundled
      ? `${snapshot.model.bundled.id}@${snapshot.model.bundled.version}`
      : null,
  };
}

function diagnosticFromError(selectedPath, featureHome, error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    classification: 'unreadable',
    title: DIAGNOSTIC_TITLES.unreadable,
    message,
    selectedPath,
    featureHome,
    failedChecks: [message],
    pinnedModel: null,
    supportedModel: null,
  };
}

function summary(path, featureHome, snapshot, diagnostic) {
  return {
    path,
    name: basename(path),
    status: diagnostic === null ? 'ready' : 'needs-attention',
    featureHome,
    featureId: snapshot?.featureId ?? null,
    workflowState: snapshot?.projection?.feature?.state ?? null,
    diagnostic,
  };
}

export async function inspectProject(path, { protocol, sources }) {
  let canonicalPath = path;
  let featureHome = null;
  try {
    canonicalPath = await canonicalDirectory(path);
    const context = await protocol.resolve(canonicalPath);
    featureHome = context.featureHome;
    const snapshot = await protocol.snapshot(featureHome, { facts: {}, sources });
    const diagnostic = snapshot.mode === 'governed'
      ? null
      : diagnosticFromSnapshot(canonicalPath, featureHome, snapshot);
    return {
      ready: diagnostic === null,
      project: summary(canonicalPath, featureHome, snapshot, diagnostic),
      snapshot,
    };
  } catch (error) {
    const diagnostic = diagnosticFromError(canonicalPath, featureHome, error);
    return {
      ready: false,
      project: summary(canonicalPath, featureHome, null, diagnostic),
      snapshot: null,
    };
  }
}
