import {
  conductorStateArtifactName,
  projectConductorStatus,
  validateConductorState,
  validateConductorStateChain,
} from './release-conductor-state.js';

function assertArtifact(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Release conductor artifact metadata must be an object');
  }
  if (!Number.isSafeInteger(value.id) || value.id < 1) {
    throw new Error('Release conductor artifact ID must be a positive integer');
  }
  if (typeof value.name !== 'string' || value.name.length === 0) {
    throw new Error('Release conductor artifact name must be nonempty');
  }
  if (typeof value.expired !== 'boolean') {
    throw new Error('Release conductor artifact expiry must be boolean');
  }
  const run = value.workflowRun;
  if (run === null || typeof run !== 'object' || Array.isArray(run)) {
    throw new Error('Release conductor artifact workflow run must be present');
  }
  for (const key of ['id', 'headSha', 'headBranch', 'event', 'path', 'conclusion']) {
    if (!(key in run)) throw new Error(`Release conductor artifact workflowRun.${key} is required`);
  }
  return value;
}

function conductorArtifactPrefix(tag) {
  return `gatereeve-${tag}-release-conductor-`;
}

function validateArtifactRun(artifact, state) {
  const run = artifact.workflowRun;
  if (String(run.id) !== state.run.id) {
    throw new Error(`Conductor artifact ${artifact.id} differs from its recorded run`);
  }
  if (run.event !== 'workflow_dispatch') {
    throw new Error(`Conductor artifact ${artifact.id} is not from workflow_dispatch`);
  }
  if (run.headBranch !== 'main') {
    throw new Error(`Conductor artifact ${artifact.id} is not from main`);
  }
  if (!/release-conductor\.yml$/u.test(run.path ?? '')) {
    throw new Error(`Conductor artifact ${artifact.id} is not from the Release Conductor`);
  }
  if (!['success', 'failure', 'cancelled'].includes(run.conclusion)) {
    throw new Error(`Conductor artifact ${artifact.id} run is not complete`);
  }
}

export async function discoverConductorState({
  tag,
  listArtifacts,
  readArtifactState,
  isAncestor,
}) {
  if (typeof listArtifacts !== 'function'
    || typeof readArtifactState !== 'function'
    || typeof isAncestor !== 'function') {
    throw new Error('Release conductor discovery requires injected GitHub readers');
  }
  const prefix = conductorArtifactPrefix(tag);
  const listed = await listArtifacts();
  if (!Array.isArray(listed)) throw new Error('GitHub artifact listing must be an array');
  const artifacts = listed.map(assertArtifact).filter((item) => item.name.startsWith(prefix));
  if (artifacts.length === 0) throw new Error(`No Release Conductor state exists for ${tag}`);
  const expired = artifacts.filter((item) => item.expired);
  if (expired.length > 0) {
    throw new Error(`Release Conductor state for ${tag} has expired artifact evidence`);
  }

  const entries = [];
  for (const artifact of artifacts) {
    const state = validateConductorState(await readArtifactState(artifact));
    if (state.release.tag !== tag) {
      throw new Error(`Conductor artifact ${artifact.id} differs from requested tag ${tag}`);
    }
    if (artifact.name !== conductorStateArtifactName(state)) {
      throw new Error(`Conductor artifact ${artifact.id} name differs from its state`);
    }
    validateArtifactRun(artifact, state);
    if (!await isAncestor(state.release.sourceCommit, artifact.workflowRun.headSha)) {
      throw new Error(`Conductor artifact ${artifact.id} workflow cannot contain its source commit`);
    }
    entries.push({ artifact, state });
  }

  const sequences = new Set();
  for (const { state } of entries) {
    if (sequences.has(state.sequence)) {
      throw new Error(`Release Conductor state for ${tag} has divergent sequence ${state.sequence}`);
    }
    sequences.add(state.sequence);
  }
  const chain = validateConductorStateChain(entries.map((entry) => entry.state));
  const bySequence = new Map(entries.map((entry) => [entry.state.sequence, entry.artifact]));
  return {
    tag,
    chain,
    latest: chain.at(-1),
    status: projectConductorStatus(chain),
    artifacts: chain.map((state) => ({ state, artifact: bySequence.get(state.sequence) })),
  };
}
