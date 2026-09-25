#!/usr/bin/env node

import { resolve } from 'node:path';

import {
  createClaudeCodeAgentAdapter,
  createCodexAgentAdapter,
} from '../resources/protocol/index.js';

const [provider, model, repository = process.cwd()] = process.argv.slice(2);
if (!['codex', 'claude-code'].includes(provider) || !model) {
  throw new Error('Usage: provider-adapter-smoke.js <codex|claude-code> <model> [repository]');
}

const digest = `sha256:${'a'.repeat(64)}`;
const repositoryPath = resolve(repository);
const request = {
  schemaVersion: 1,
  protocolVersion: 1,
  runId: 'provider-smoke',
  attemptId: 'provider-smoke',
  module: { id: 'gatereeve/provider-smoke', version: '1.0.0', digest },
  stage: { id: 'smoke', role: 'Isolation smoke' },
  instructions: 'Return an object with ok set to true and note set to fresh isolated structured context. Do not inspect files.',
  input: { purpose: 'provider adapter smoke' },
  snapshotDigest: digest,
  repositoryPath,
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'note'],
    properties: { ok: { type: 'boolean' }, note: { type: 'string' } },
  },
  policy: {
    repositoryAccess: 'read-only-pinned',
    networkAccess: 'denied',
    scratch: 'disposable',
    isolation: { freshContext: true, inheritedTurns: 0 },
  },
  capabilityProfile: { id: 'high-capability-v1', minimumReasoning: 'high' },
  timeoutSeconds: 120,
};
const adapter = provider === 'codex'
  ? createCodexAgentAdapter({ model, reasoningEffort: 'high' })
  : createClaudeCodeAgentAdapter({ model, reasoningEffort: 'high' });
const result = await adapter.runStage(request);
process.stdout.write(`${JSON.stringify({
  provider,
  output: result.output,
  contextId: result.receipt.provider.contextId,
  isolation: result.receipt.isolation,
  policy: result.receipt.policy,
}, null, 2)}\n`);
