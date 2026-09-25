import { randomUUID } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';

import { runAgentWorkflow } from './agent-workflow-runtime.js';
import { sha256Digest } from './agent-workflow.js';
import { publishAgentWorkflowArtifacts } from './artifact-publisher.js';
import { ContractError } from './errors.js';
import { gateInputFingerprint } from './fingerprint.js';
import { validateJsonSchema } from './json-schema.js';
import { buildPinnedChangeInput, createPinnedRepositorySnapshot } from './pinned-snapshot.js';

function contextRange(module, attempt, context) {
  const scope = module.boundary?.evaluationScope?.[attempt.scope];
  if (!['SLICE', 'FEATURE'].includes(scope)) {
    throw new ContractError(`Agent workflow has no evaluation scope for ${attempt.scope}`);
  }
  const headSha = context.evaluatedSourceSha ?? context.diffHeadSha ?? context.headSha;
  const sliceBaseSha = context.mergeBaseSha ?? context.sliceBaseSha ?? context.baseSha ?? context.diffBaseSha;
  const baseSha = scope === 'FEATURE'
    ? context.featureBaseSha
    : context.mergeBaseSha ?? context.diffBaseSha ?? context.baseSha;
  if (typeof baseSha !== 'string' || typeof headSha !== 'string') {
    throw new ContractError(`Pinned ${scope} range is unavailable from the boundary context`);
  }
  if (scope === 'FEATURE' && typeof sliceBaseSha !== 'string') {
    throw new ContractError('Pinned feature range lacks its final slice base');
  }
  return { scope, baseSha, headSha, sliceBaseSha: scope === 'FEATURE' ? sliceBaseSha : null };
}

function evidencePath(featureHome, artifactRoot, path) {
  const feature = resolve(featureHome);
  const target = resolve(artifactRoot, path);
  if (target !== feature && !target.startsWith(`${feature}${sep}`)) {
    throw new ContractError('Agent workflow artifacts must be published inside the feature record');
  }
  return relative(feature, target).split(sep).join('/');
}

function externalizePatches(change) {
  const value = structuredClone(change);
  const evidenceFiles = {};
  for (const [field, filename] of [['patch', 'feature.patch'], ['slicePatch', 'slice.patch']]) {
    const content = value[field];
    if (typeof content !== 'string') continue;
    const path = `.gatereeve-agent-evidence/${filename}`;
    evidenceFiles[path] = content;
    value[field] = {
      kind: 'snapshot-file',
      path,
      hash: sha256Digest(content),
      bytes: Buffer.byteLength(content, 'utf8'),
    };
  }
  return { value, evidenceFiles };
}

async function evidenceFile(repositoryRoot, featureHome, reference) {
  if (
    reference === null
    || typeof reference !== 'object'
    || typeof reference.path !== 'string'
    || reference.path === ''
    || !/^sha256:[0-9a-f]{64}$/u.test(reference.hash ?? '')
    || reference.path.includes('\\')
    || reference.path.split('/').some((part) => part === '..')
  ) throw new ContractError('Dependency gate evidence reference is invalid');
  const root = await realpath(repositoryRoot);
  const candidates = reference.path.startsWith('/')
    ? [resolve(reference.path)]
    : [resolve(repositoryRoot, reference.path), resolve(featureHome, reference.path)];
  for (const candidate of candidates) {
    try {
      const [canonical, metadata] = await Promise.all([realpath(candidate), lstat(candidate)]);
      if (!metadata.isFile() || metadata.isSymbolicLink()) continue;
      if (canonical !== root && !canonical.startsWith(`${root}${sep}`)) continue;
      const content = await readFile(canonical, 'utf8');
      if (sha256Digest(content) !== reference.hash) continue;
      return { content, filename: basename(canonical) };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  throw new ContractError(`Dependency gate evidence is unavailable or changed: ${reference.path}`);
}

async function externalizeDependencyEvidence({ repositoryRoot, featureHome, prepared }) {
  const value = {};
  const evidenceFiles = {};
  for (const gateId of prepared.target.dependsOn ?? []) {
    const gate = prepared.attempt.gates?.find((item) => item.id === gateId);
    if (!gate) throw new ContractError(`Dependency gate ${gateId} is unavailable`);
    const file = gate.evidence
      ? await evidenceFile(repositoryRoot, featureHome, gate.evidence)
      : ['WAIVED', 'NOT_APPLICABLE'].includes(gate.outcome)
        ? {
            content: `${JSON.stringify({
              schemaVersion: 1,
              gateId,
              outcome: gate.outcome,
              eventId: gate.recordedEventId,
              reason: gate.reason,
            }, null, 2)}\n`,
            filename: 'disposition.json',
          }
        : null;
    if (file === null) throw new ContractError(`Dependency gate ${gateId} lacks evidence`);
    const safeGateId = gateId.replace(/[^A-Za-z0-9._-]/gu, '-');
    const path = `.gatereeve-agent-evidence/gates/${safeGateId}/${file.filename}`;
    evidenceFiles[path] = file.content;
    const hash = sha256Digest(file.content);
    value[gateId] = {
      outcome: gate.outcome,
      eventId: gate.recordedEventId,
      kind: 'snapshot-file',
      path,
      hash,
      bytes: Buffer.byteLength(file.content, 'utf8'),
    };
  }
  return { value, evidenceFiles };
}

export async function executeAgentWorkflowGate({
  repositoryRoot,
  featureHome,
  artifactRoot,
  modelHash,
  module,
  prepared,
  adapter,
  resources,
  recordOutcome,
  createSnapshot = createPinnedRepositorySnapshot,
  buildChangeInput = buildPinnedChangeInput,
  publishArtifacts = publishAgentWorkflowArtifacts,
  createId = randomUUID,
}) {
  if (module?.run?.kind !== 'agent-workflow') throw new ContractError('An agent-workflow module is required');
  if (!prepared?.attempt || !prepared?.target || !prepared?.inputs) {
    throw new ContractError('A current eligible protocol preparation is required');
  }
  if (prepared.target.id !== module.boundary?.gateId || prepared.attempt.id === undefined) {
    throw new ContractError('Prepared gate does not match the agent-workflow module');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(prepared.attempt.id)) {
    throw new ContractError('Prepared attempt ID is unsafe for artifact publication');
  }
  if (typeof resources?.loadResource !== 'function' || typeof resources?.loadEvaluator !== 'function') {
    throw new ContractError('Agent workflow resource access is unavailable');
  }
  if (typeof recordOutcome !== 'function') throw new ContractError('Protocol outcome recorder is unavailable');

  const range = contextRange(module, prepared.attempt, prepared.inputs.context ?? prepared.attempt.context ?? {});
  const inputFingerprint = gateInputFingerprint({
    modelHash,
    attemptId: prepared.attempt.id,
    gateId: prepared.target.id,
    inputs: prepared.inputs,
  });
  const change = await buildChangeInput({
    repositoryRoot,
    baseSha: range.baseSha,
    headSha: range.headSha,
    scope: range.scope,
    sliceBaseSha: range.sliceBaseSha,
    featureHome,
  });
  const externalized = externalizePatches(change);
  const dependencyEvidence = await externalizeDependencyEvidence({
    repositoryRoot, featureHome, prepared,
  });
  const input = {
    schemaVersion: 1,
    source: {
      attemptId: prepared.attempt.id,
      boundaryScope: prepared.attempt.scope,
      scope: range.scope,
      baseSha: range.baseSha,
      headSha: range.headSha,
      sliceBaseSha: range.sliceBaseSha ?? range.baseSha,
      inputFingerprint,
    },
    boundary: structuredClone(prepared.inputs),
    change: externalized.value,
    dependencyEvidence: dependencyEvidence.value,
  };
  const snapshot = await createSnapshot({
    repositoryRoot,
    headSha: range.headSha,
    evidenceFiles: {
      ...externalized.evidenceFiles,
      ...dependencyEvidence.evidenceFiles,
    },
  });
  const attemptArtifactRoot = join(artifactRoot, 'attempts', prepared.attempt.id);
  try {
    const evaluator = await resources.loadEvaluator({
      pluginId: module.run.resourcePlugin,
      ...module.run.evaluator,
    });
    const result = await runAgentWorkflow({
      module,
      attemptId: prepared.attempt.id,
      runId: `agent-workflow-${createId()}`,
      snapshotDigest: snapshot.digest,
      repositoryPath: snapshot.repositoryPath,
      input,
      adapter,
      loadResource: resources.loadResource,
      validateOutput: async (reference, value) => {
        const schema = JSON.parse(await resources.loadResource(reference));
        return validateJsonSchema(schema, value, { label: reference.path });
      },
      evaluate: async ({ module: evaluatedModule, input: evaluatedInput, outputs, receipts, repositoryPath }) => (
        evaluator({ module: evaluatedModule, input: evaluatedInput, outputs, receipts, repositoryPath })
      ),
      publishArtifacts: async ({ module: evaluatedModule, evaluation }) => publishArtifacts({
        artifactRoot: attemptArtifactRoot,
        module: evaluatedModule,
        files: evaluation.files,
      }),
    });
    if (result.status !== 'completed') return { ...result, inputFingerprint };
    const root = result.artifacts.find((artifact) => artifact.path === module.run.evidenceRoot);
    if (!root) throw new ContractError('Agent workflow did not publish its evidence root');
    const evidence = {
      path: evidencePath(featureHome, attemptArtifactRoot, root.path),
      hash: root.hash,
    };
    const recorded = await recordOutcome({
      outcome: result.outcome,
      evidence,
      reason: result.outcome === 'FAIL' ? 'Agent workflow reported a governed failure.' : null,
    });
    return { ...result, inputFingerprint, evidence, recorded };
  } finally {
    await snapshot.cleanup();
  }
}
