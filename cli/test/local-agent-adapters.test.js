import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createClaudeCodeAgentAdapter,
  createCodexAgentAdapter,
  parseClaudeStructuredOutput,
  parseCodexContextId,
  validateAgentWorkflowReceipt,
} from '../../plugin-src/shared/resources/protocol/index.js';

const digest = (character) => `sha256:${character.repeat(64)}`;

function request() {
  return {
    schemaVersion: 1,
    protocolVersion: 1,
    runId: 'run-1',
    attemptId: 'attempt-1',
    module: { id: 'example/review', version: '1.0.0', digest: digest('a') },
    stage: { id: 'review', role: 'Reviewer' },
    instructions: 'Review the pinned evidence.',
    input: { diff: 'pinned' },
    snapshotDigest: digest('b'),
    repositoryPath: '/repository',
    outputSchema: { type: 'object', required: ['verdict'] },
    policy: {
      repositoryAccess: 'read-only-pinned', networkAccess: 'denied', scratch: 'disposable',
      isolation: { freshContext: true, inheritedTurns: 0 },
    },
    capabilityProfile: { id: 'high-capability-v1', minimumReasoning: 'high' },
    timeoutSeconds: 300,
  };
}

test('Codex adapter launches a fresh ephemeral read-only structured run', async () => {
  const calls = [];
  const adapter = createCodexAgentAdapter({
    model: 'gpt-test',
    runner: async (executable, args, options) => {
      calls.push({ executable, args, options });
      const outputPath = args[args.indexOf('--output-last-message') + 1];
      await writeFile(outputPath, '{"verdict":"PASS"}\n');
      return {
        code: 0, signal: null,
        stdout: '{"type":"thread.started","thread_id":"codex-context-1"}\n', stderr: '',
        startedAt: new Date('2026-09-24T12:00:00Z'),
        completedAt: new Date('2026-09-24T12:01:00Z'),
      };
    },
  });
  const result = await adapter.runStage(request());
  assert.equal(result.output.verdict, 'PASS');
  assert.equal(validateAgentWorkflowReceipt(result.receipt), result.receipt);
  assert.equal(result.receipt.provider.contextId, 'codex-context-1');
  assert(calls[0].args.includes('--ephemeral'));
  assert(calls[0].args.includes('--skip-git-repo-check'));
  assert(calls[0].args.includes('read-only'));
  assert(calls[0].args.includes('--output-schema'));
  assert(calls[0].args.includes('shell_environment_policy.inherit="none"'));
  assert(!calls[0].args.includes('resume'));
});

test('Claude Code adapter launches a non-persistent restricted custom agent', async () => {
  const calls = [];
  const adapter = createClaudeCodeAgentAdapter({
    model: 'claude-test',
    runner: async (executable, args, options) => {
      calls.push({ executable, args, options });
      return {
        code: 0, signal: null,
        stdout: JSON.stringify({
          session_id: 'claude-context-1',
          structured_output: { verdict: 'PASS' },
        }),
        stderr: '',
        startedAt: new Date('2026-09-24T12:00:00Z'),
        completedAt: new Date('2026-09-24T12:01:00Z'),
      };
    },
  });
  const result = await adapter.runStage(request());
  assert.equal(result.output.verdict, 'PASS');
  assert.equal(validateAgentWorkflowReceipt(result.receipt), result.receipt);
  assert.equal(result.receipt.provider.contextId, 'claude-context-1');
  assert(calls[0].args.includes('--agents'));
  assert(calls[0].args.includes('--agent'));
  assert(calls[0].args.includes('--restricted'));
  assert(calls[0].args.includes('--no-session-persistence'));
  assert.equal(calls[0].args[calls[0].args.indexOf('--mcp-config') + 1], '{"mcpServers":{}}');
  assert(!calls[0].args.includes('--resume'));
  assert(!calls[0].args.includes('--continue'));
});

test('adapter parsers require structured output and opaque context IDs', () => {
  assert.deepEqual(parseClaudeStructuredOutput(JSON.stringify({
    session_id: 'session-1', result: '{"ok":true}',
  })), { contextId: 'session-1', output: { ok: true } });
  assert.equal(
    parseCodexContextId('{"type":"thread.started","thread_id":"thread-1"}\n'),
    'thread-1'
  );
  assert.throws(() => parseCodexContextId('{"type":"turn.completed"}\n'), /fresh context ID/);
});
