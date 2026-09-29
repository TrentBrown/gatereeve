import { createHash } from 'node:crypto';

import { ContractError } from './errors.js';

export const AGENT_WORKFLOW_PROTOCOL_VERSION = 1;
export const AGENT_WORKFLOW_RECEIPT_KIND = 'gatereeve-agent-workflow-receipt';

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const STATUSES = new Set(['completed', 'failed', 'cancelled', 'unavailable']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys, label) {
  if (!isObject(value)) throw new ContractError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new ContractError(`${label} has an invalid shape`);
  }
}

function nonempty(value, label, maximum = 4096) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > maximum) {
    throw new ContractError(`${label} must be a bounded nonempty string`);
  }
}

function timestamp(value, label) {
  nonempty(value, label, 128);
  if (Number.isNaN(Date.parse(value))) throw new ContractError(`${label} must be an ISO timestamp`);
}

export function sha256Digest(value) {
  const bytes = typeof value === 'string' || Buffer.isBuffer(value)
    ? value
    : `${JSON.stringify(value)}\n`;
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function validateAgentWorkflowReceipt(value) {
  exactKeys(
    value,
    [
      'schemaVersion', 'kind', 'protocolVersion', 'runId', 'attemptId', 'module',
      'stage', 'capabilityProfile', 'provider', 'isolation', 'policy', 'startedAt', 'completedAt',
      'status', 'digests',
    ],
    'Agent workflow receipt'
  );
  if (
    value.schemaVersion !== 1
    || value.kind !== AGENT_WORKFLOW_RECEIPT_KIND
    || value.protocolVersion !== AGENT_WORKFLOW_PROTOCOL_VERSION
  ) throw new ContractError('Agent workflow receipt version or kind is unsupported');
  nonempty(value.runId, 'Agent workflow receipt runId');
  nonempty(value.attemptId, 'Agent workflow receipt attemptId');

  exactKeys(value.module, ['id', 'version', 'digest'], 'Agent workflow receipt module');
  nonempty(value.module.id, 'Agent workflow receipt module id');
  nonempty(value.module.version, 'Agent workflow receipt module version');
  if (!SHA256.test(value.module.digest)) throw new ContractError('Agent workflow receipt module digest is invalid');
  nonempty(value.stage, 'Agent workflow receipt stage');

  exactKeys(
    value.capabilityProfile,
    ['id', 'minimumReasoning'],
    'Agent workflow receipt capability profile'
  );
  nonempty(value.capabilityProfile.id, 'Agent workflow receipt capability profile id');
  nonempty(
    value.capabilityProfile.minimumReasoning,
    'Agent workflow receipt capability profile minimum reasoning'
  );

  exactKeys(
    value.provider,
    ['id', 'adapterVersion', 'model', 'reasoningEffort', 'contextId'],
    'Agent workflow receipt provider'
  );
  for (const field of ['id', 'adapterVersion', 'model', 'reasoningEffort', 'contextId']) {
    nonempty(value.provider[field], `Agent workflow receipt provider ${field}`);
  }

  exactKeys(
    value.isolation,
    ['method', 'freshContext', 'inheritedTurns'],
    'Agent workflow receipt isolation'
  );
  nonempty(value.isolation.method, 'Agent workflow receipt isolation method');
  if (value.isolation.freshContext !== true || value.isolation.inheritedTurns !== 0) {
    throw new ContractError('Agent workflow receipt must attest a fresh context with zero inherited turns');
  }

  exactKeys(
    value.policy,
    ['repositoryAccess', 'networkAccess', 'scratch'],
    'Agent workflow receipt policy'
  );
  if (
    value.policy.repositoryAccess !== 'read-only-pinned'
    || value.policy.networkAccess !== 'denied'
    || value.policy.scratch !== 'disposable'
  ) throw new ContractError('Agent workflow receipt policy does not satisfy isolation requirements');

  timestamp(value.startedAt, 'Agent workflow receipt startedAt');
  timestamp(value.completedAt, 'Agent workflow receipt completedAt');
  if (Date.parse(value.completedAt) < Date.parse(value.startedAt)) {
    throw new ContractError('Agent workflow receipt completion precedes its start');
  }
  if (!STATUSES.has(value.status)) throw new ContractError('Agent workflow receipt status is invalid');

  exactKeys(
    value.digests,
    ['instructions', 'input', 'output', 'snapshot'],
    'Agent workflow receipt digests'
  );
  for (const [field, digest] of Object.entries(value.digests)) {
    if (!SHA256.test(digest)) throw new ContractError(`Agent workflow receipt ${field} digest is invalid`);
  }
  return value;
}

export function validateAgentWorkflowStageResult(value, receipt = null) {
  exactKeys(
    value,
    ['schemaVersion', 'protocolVersion', 'stageId', 'status', 'output', 'receipt'],
    'Agent workflow stage result'
  );
  if (value.schemaVersion !== 1 || value.protocolVersion !== AGENT_WORKFLOW_PROTOCOL_VERSION) {
    throw new ContractError('Agent workflow stage result version is unsupported');
  }
  nonempty(value.stageId, 'Agent workflow stage result stageId');
  if (!STATUSES.has(value.status)) throw new ContractError('Agent workflow stage result status is invalid');
  try {
    JSON.stringify(value.output);
  } catch {
    throw new ContractError('Agent workflow stage output must be JSON serializable');
  }
  validateAgentWorkflowReceipt(value.receipt);
  if (value.receipt.stage !== value.stageId || value.receipt.status !== value.status) {
    throw new ContractError('Agent workflow stage result differs from its receipt');
  }
  if (value.receipt.digests.output !== sha256Digest(value.output)) {
    throw new ContractError('Agent workflow stage output digest differs from its receipt');
  }
  if (receipt !== null && JSON.stringify(receipt) !== JSON.stringify(value.receipt)) {
    throw new ContractError('Agent workflow stage result receipt differs from the expected receipt');
  }
  return value;
}
