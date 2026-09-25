import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createClaudeCodeAgentAdapter,
  createCodexAgentAdapter,
  parseClaudeStructuredOutput,
  parseCodexContextId,
  runAgentProcess,
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

test('provider adapters reject oversized prompts before launching a process', async () => {
  let launched = false;
  const adapter = createCodexAgentAdapter({
    model: 'gpt-test',
    runner: async () => { launched = true; },
  });
  await assert.rejects(
    adapter.runStage({ ...request(), input: { oversized: 'x'.repeat(513 * 1024) } }),
    /prompt exceeds the bounded/u
  );
  assert.equal(launched, false);
});

test('failed provider processes retain stdout errors alongside stderr warnings', async () => {
  await assert.rejects(
    runAgentProcess(process.execPath, [
      '-e',
      'process.stderr.write("warning\\n"); process.stdout.write("structured failure\\n"); process.exit(1);',
    ], { cwd: process.cwd(), input: '', timeoutSeconds: 5 }),
    (error) => {
      assert.match(error.message, /stderr:\nwarning/u);
      assert.match(error.message, /stdout:\nstructured failure/u);
      return true;
    }
  );
});

test('bundled provider output schemas type every constant', async () => {
  const paths = [
    'plugin-src/shared/resources/agent-workflows/judge/result.schema.json',
    'plugin-src/plugins/whiteboard-test/shared/resources/whiteboard-test/schemas/challenges.schema.json',
    'plugin-src/plugins/whiteboard-test/shared/resources/whiteboard-test/schemas/defense.schema.json',
  ];
  for (const path of paths) {
    const schema = JSON.parse(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'));
    const visit = (value) => {
      if (value === null || typeof value !== 'object') return;
      if (Object.hasOwn(value, 'const')) {
        assert.equal(typeof value.type, 'string', `${path} has an untyped const`);
      }
      for (const child of Object.values(value)) visit(child);
    };
    visit(schema);
  }
});
