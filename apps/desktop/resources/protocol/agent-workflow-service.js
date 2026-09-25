import { randomUUID } from 'node:crypto';
import { relative, resolve, sep } from 'node:path';

import { runAgentWorkflow } from './agent-workflow-runtime.js';
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
    change,
  };
  const snapshot = await createSnapshot({ repositoryRoot, headSha: range.headSha });
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
        artifactRoot,
        module: evaluatedModule,
        files: evaluation.files,
      }),
    });
    if (result.status !== 'completed') return { ...result, inputFingerprint };
    const root = result.artifacts.find((artifact) => artifact.path === module.run.evidenceRoot);
    if (!root) throw new ContractError('Agent workflow did not publish its evidence root');
    const evidence = {
      path: evidencePath(featureHome, artifactRoot, root.path),
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
