import assert from 'node:assert/strict';
import test from 'node:test';

import {
  sha256Digest,
  validateAgentWorkflowReceipt,
  validateAgentWorkflowStageResult,
} from '../../plugin-src/shared/resources/protocol/index.js';

const digest = (character) => `sha256:${character.repeat(64)}`;

function receipt(output, overrides = {}) {
  return {
    schemaVersion: 1,
    kind: 'gatereeve-agent-workflow-receipt',
    protocolVersion: 1,
    runId: 'run-1',
    attemptId: 'attempt-1',
    module: { id: 'example/review', version: '1.0.0', digest: digest('a') },
    stage: 'review',
    provider: {
      id: 'codex',
      adapterVersion: '1.0.0',
      model: 'configured-high-capability-model',
      reasoningEffort: 'high',
      contextId: 'opaque-context-1',
    },
    isolation: { method: 'fresh-subagent', freshContext: true, inheritedTurns: 0 },
    policy: {
      repositoryAccess: 'read-only-pinned',
      networkAccess: 'denied',
      scratch: 'disposable',
    },
    startedAt: '2026-09-24T12:00:00.000Z',
    completedAt: '2026-09-24T12:01:00.000Z',
    status: 'completed',
    digests: {
      instructions: digest('b'),
      input: digest('c'),
      output: sha256Digest(output),
      snapshot: digest('d'),
    },
    ...overrides,
  };
}

test('agent workflow receipts bind provider configuration, isolation policy, and stage output', () => {
  const output = { verdict: 'PASS', findings: [] };
  const value = receipt(output);
  assert.equal(validateAgentWorkflowReceipt(value), value);
  assert.equal(validateAgentWorkflowStageResult({
    schemaVersion: 1,
    protocolVersion: 1,
    stageId: 'review',
    status: 'completed',
    output,
    receipt: value,
  }).output.verdict, 'PASS');
});

test('agent workflow receipts reject inherited context and output substitution', () => {
  const output = { verdict: 'PASS' };
  const inherited = receipt(output, {
    isolation: { method: 'fork', freshContext: false, inheritedTurns: 8 },
  });
  assert.throws(() => validateAgentWorkflowReceipt(inherited), /zero inherited turns/);

  const value = receipt(output);
  assert.throws(() => validateAgentWorkflowStageResult({
    schemaVersion: 1,
    protocolVersion: 1,
    stageId: 'review',
    status: 'completed',
    output: { verdict: 'FAIL' },
    receipt: value,
  }), /output digest differs/);
});
