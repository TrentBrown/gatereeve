import { validateAgentWorkflowReceipt, sha256Digest } from './agent-workflow.js';
import { ContractError } from './errors.js';
import { validateModuleDefinition } from './modules.js';

const REASONING_RANK = new Map([
  ['high', 0],
  ['xhigh', 1],
  ['max', 2],
  ['ultra', 3],
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function frozen(value) {
  if (!isObject(value) && !Array.isArray(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) frozen(child);
  return value;
}

function failure(error, stageId = null) {
  return {
    schemaVersion: 1,
    status: 'unavailable',
    outcome: 'UNSET',
    stageId,
    artifacts: [],
    receipts: [],
    failure: {
      code: error?.code ?? 'AGENT_WORKFLOW_UNAVAILABLE',
      message: error?.message ?? String(error),
    },
  };
}

export function validateAgentWorkflowAdapterDescriptor(value) {
  if (
    !isObject(value)
    || value.schemaVersion !== 1
    || typeof value.id !== 'string'
    || typeof value.version !== 'string'
    || typeof value.provider !== 'string'
    || typeof value.model !== 'string'
    || !REASONING_RANK.has(value.reasoningEffort)
    || !Array.isArray(value.capabilityProfiles)
    || !value.capabilityProfiles.includes('high-capability-v1')
    || !Array.isArray(value.isolationMethods)
    || value.isolationMethods.length === 0
  ) throw new ContractError('Agent workflow adapter descriptor is invalid');
  return value;
}

function assertAdapterSatisfies(run, descriptor) {
  validateAgentWorkflowAdapterDescriptor(descriptor);
  if (!descriptor.capabilityProfiles.includes(run.capabilityProfile.id)) {
    throw new ContractError(`Adapter ${descriptor.id} does not support ${run.capabilityProfile.id}`);
  }
  if (
    REASONING_RANK.get(descriptor.reasoningEffort)
    < REASONING_RANK.get(run.capabilityProfile.minimumReasoning)
  ) throw new ContractError(`Adapter ${descriptor.id} silently downgrades reasoning effort`);
}

function validateReceiptBinding(receipt, expected) {
  validateAgentWorkflowReceipt(receipt);
  for (const [label, actual, value] of [
    ['run ID', receipt.runId, expected.runId],
    ['attempt ID', receipt.attemptId, expected.attemptId],
    ['module ID', receipt.module.id, expected.module.id],
    ['module version', receipt.module.version, expected.module.version],
    ['module digest', receipt.module.digest, expected.module.digest],
    ['stage', receipt.stage, expected.stage.id],
    ['capability profile ID', receipt.capabilityProfile.id, expected.module.run.capabilityProfile.id],
    [
      'capability profile minimum reasoning',
      receipt.capabilityProfile.minimumReasoning,
      expected.module.run.capabilityProfile.minimumReasoning,
    ],
    ['adapter provider', receipt.provider.id, expected.descriptor.provider],
    ['adapter version', receipt.provider.adapterVersion, expected.descriptor.version],
    ['model', receipt.provider.model, expected.descriptor.model],
    ['reasoning effort', receipt.provider.reasoningEffort, expected.descriptor.reasoningEffort],
    ['instruction digest', receipt.digests.instructions, expected.instructionsDigest],
    ['input digest', receipt.digests.input, expected.inputDigest],
    ['snapshot digest', receipt.digests.snapshot, expected.snapshotDigest],
  ]) {
    if (actual !== value) throw new ContractError(`Agent workflow receipt ${label} mismatch`);
  }
  if (!expected.descriptor.isolationMethods.includes(receipt.isolation.method)) {
    throw new ContractError('Agent workflow receipt uses an unapproved isolation method');
  }
  if (receipt.status !== 'completed') {
    throw new ContractError(`Agent workflow stage did not complete: ${receipt.status}`);
  }
}

export async function runAgentWorkflow({
  module,
  attemptId,
  runId,
  snapshotDigest,
  repositoryPath,
  input,
  adapter,
  loadResource,
  validateOutput,
  publishArtifacts,
  evaluate,
}) {
  try {
    validateModuleDefinition(module);
    if (module.run?.kind !== 'agent-workflow') {
      throw new ContractError('Module does not declare an agent workflow');
    }
    if (
      typeof attemptId !== 'string' || !attemptId
      || typeof runId !== 'string' || !runId
      || !/^sha256:[0-9a-f]{64}$/u.test(snapshotDigest ?? '')
      || typeof repositoryPath !== 'string' || !repositoryPath.startsWith('/')
    ) throw new ContractError('Agent workflow invocation identity is invalid');
    for (const dependency of ['describe', 'runStage']) {
      if (typeof adapter?.[dependency] !== 'function') {
        throw new ContractError(`Agent workflow adapter is missing ${dependency}`);
      }
    }
    for (const dependency of [loadResource, validateOutput, publishArtifacts, evaluate]) {
      if (typeof dependency !== 'function') throw new ContractError('Agent workflow runtime dependency is missing');
    }

    const descriptor = clone(await adapter.describe());
    assertAdapterSatisfies(module.run, descriptor);
    const initialInput = frozen(clone(input));
    const outputs = {};
    const receipts = [];

    for (const stage of module.run.stages) {
      let instructions;
      let outputSchema;
      try {
        instructions = await loadResource({ pluginId: module.run.resourcePlugin, path: stage.promptResource });
        outputSchema = JSON.parse(await loadResource({ pluginId: module.run.resourcePlugin, path: stage.outputSchema }));
      } catch (error) {
        return failure(error, stage.id);
      }
      if (typeof instructions !== 'string' || instructions.trim() === '') {
        return failure(new ContractError(`Agent workflow prompt is empty: ${stage.promptResource}`), stage.id);
      }
      const stageInput = frozen(clone({
        initial: initialInput,
        dependencies: Object.fromEntries(
          stage.dependsOn.map((dependency) => [dependency, outputs[dependency]])
        ),
      }));
      const instructionsDigest = sha256Digest(instructions);
      const inputDigest = sha256Digest(stageInput);
      try {
        await validateOutput(
          { pluginId: module.run.resourcePlugin, path: stage.inputSchema },
          stageInput
        );
      } catch (error) {
        return failure(error, stage.id);
      }
      let result;
      try {
        result = await adapter.runStage({
          schemaVersion: 1,
          protocolVersion: module.run.protocolVersion,
          runId,
          attemptId,
          module: { id: module.id, version: module.version, digest: module.digest },
          stage: clone(stage),
          instructions,
          input: stageInput,
          snapshotDigest,
          repositoryPath,
          outputSchema,
          policy: {
            repositoryAccess: module.run.repositoryAccess,
            networkAccess: module.run.networkAccess,
            scratch: 'disposable',
            isolation: clone(module.run.isolation),
          },
          capabilityProfile: clone(module.run.capabilityProfile),
          timeoutSeconds: module.run.timeoutSeconds,
        });
        if (!isObject(result) || !Object.hasOwn(result, 'output') || !result.receipt) {
          throw new ContractError('Agent workflow adapter returned an invalid stage result');
        }
        validateReceiptBinding(result.receipt, {
          runId,
          attemptId,
          module,
          stage,
          descriptor,
          instructionsDigest,
          inputDigest,
          snapshotDigest,
        });
        if (receipts.some((receipt) => receipt.provider.contextId === result.receipt.provider.contextId)) {
          throw new ContractError('Agent workflow stages reused a provider context');
        }
        if (result.receipt.digests.output !== sha256Digest(result.output)) {
          throw new ContractError('Agent workflow output differs from its receipt');
        }
        await validateOutput(
          { pluginId: module.run.resourcePlugin, path: stage.outputSchema },
          result.output
        );
      } catch (error) {
        const unavailable = failure(error, stage.id);
        unavailable.receipts = [...receipts];
        return unavailable;
      }
      outputs[stage.id] = frozen(clone(result.output));
      receipts.push(clone(result.receipt));
    }

    let evaluation;
    let artifacts;
    try {
      evaluation = await evaluate({
        module: clone(module), input: initialInput, outputs: clone(outputs),
        receipts: clone(receipts), repositoryPath,
      });
      if (!isObject(evaluation) || !['PASS', 'FAIL'].includes(evaluation.outcome)) {
        throw new ContractError('Agent workflow evaluator must return PASS or FAIL');
      }
      artifacts = await publishArtifacts({
        module: clone(module),
        input: initialInput,
        outputs: clone(outputs),
        receipts: clone(receipts),
        evaluation: clone(evaluation),
      });
      if (!Array.isArray(artifacts)) throw new ContractError('Agent workflow publisher must return artifact references');
      const published = new Set(artifacts.map((artifact) => artifact.path));
      for (const artifact of module.run.artifacts.filter((item) => item.required)) {
        if (!published.has(artifact.path)) throw new ContractError(`Required agent workflow artifact is missing: ${artifact.path}`);
      }
    } catch (error) {
      const unavailable = failure(error);
      unavailable.receipts = clone(receipts);
      return unavailable;
    }

    return {
      schemaVersion: 1,
      status: 'completed',
      outcome: evaluation.outcome,
      stageId: null,
      artifacts: clone(artifacts),
      receipts,
      failure: null,
    };
  } catch (error) {
    return failure(error);
  }
}
