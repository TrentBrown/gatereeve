import './helpers/private-scratch.js';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, chmod } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { MAX_ARGUMENT_BYTES, assertArgumentSizes, codexShellEnvironmentArgs } from '../../plugin-src/shared/resources/protocol/local-agent-adapters.js';
import {
  createClaudeCodeAgentAdapter,
  createCodexAgentAdapter,
  parseClaudeStructuredOutput,
  parseCodexContextId,
  runAgentProcess,
  validateAgentWorkflowReceipt,
  validateAgentWorkflowStageResult,
} from '../../plugin-src/shared/resources/protocol/index.js';

const digest = (character) => `sha256:${character.repeat(64)}`;

function request() {
  return {
    schemaVersion: 1,
    protocolVersion: '2.1.0',
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
      repositoryAccess: 'read-only', networkAccess: 'deny', scratch: 'isolated',
      isolation: { freshContext: true, inheritedTurns: 0 },
    },
    capabilityProfile: { id: 'high-capability-v1', minimumReasoning: 'high' },
    timeoutSeconds: 300,
  };
}

test('only Linux Codex adds the fixed distro helper path to the scrubbed shell', () => {
  const scrubbed = ['--config', 'shell_environment_policy.inherit="none"'];
  assert.deepEqual(codexShellEnvironmentArgs('linux'), [
    ...scrubbed, '--config', 'shell_environment_policy.set.PATH="/usr/bin:/bin"',
  ]);
  assert.deepEqual(codexShellEnvironmentArgs('darwin'), scrubbed);
  assert.deepEqual(codexShellEnvironmentArgs('win32'), scrubbed);
});

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
        stdout: '{"type":"thread.started","thread_id":"codex-context-1"}\n{"type":"turn.completed","usage":{"input_tokens":12,"cached_input_tokens":5,"output_tokens":7}}\n', stderr: '',
        startedAt: new Date('2026-09-24T12:00:00Z'),
        completedAt: new Date('2026-09-24T12:01:00Z'),
      };
    },
  });
  const result = await adapter.runStage(request());
  assert.equal(result.output.verdict, 'PASS');
  assert.equal(validateAgentWorkflowReceipt(result.receipt), result.receipt);
  assert.equal(validateAgentWorkflowStageResult(result), result);
  assert.equal(result.receipt.provider.contextId, 'codex-context-1');
  assert.deepEqual(result.receipt.metrics, { tokens: { input: 12, output: 7, cachedInput: 5, cacheCreation: null }, cost: null });
  assert.match(calls[0].options.env.TMPDIR, /gatereeve.*runs.*codex-evaluator/);
  assert.equal(calls[0].options.env.TEMP, calls[0].options.env.TMPDIR);
  assert(calls[0].args.includes('--ephemeral'));
  assert(calls[0].args.includes('--skip-git-repo-check'));
  assert(calls[0].args.includes('read-only'));
  assert(calls[0].args.includes('--output-schema'));
  const shellArgs = codexShellEnvironmentArgs();
  const shellStart = calls[0].args.indexOf(shellArgs[1]) - 1;
  assert.deepEqual(calls[0].args.slice(shellStart, shellStart + shellArgs.length), shellArgs);
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
          usage: { input_tokens: 20, output_tokens: 9, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 }, total_cost_usd: 0.03,
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
  assert.equal(validateAgentWorkflowStageResult(result), result);
  assert.equal(result.receipt.provider.contextId, 'claude-context-1');
  assert.deepEqual(result.receipt.metrics, { tokens: { input: 20, output: 9, cachedInput: 3, cacheCreation: 4 }, cost: 0.03 });
  assert.match(calls[0].options.env.TMPDIR, /gatereeve.*runs.*claude-evaluator/);
  assert(calls[0].args.includes('--agents'));
  assert(calls[0].args.includes('--agent'));
  assert(calls[0].args.includes('--restricted'));
  assert(calls[0].args.includes('--no-session-persistence'));
  assert.equal(calls[0].args[calls[0].args.indexOf('--mcp-config') + 1], '{"mcpServers":{}}');
  assert(!calls[0].args.includes('--resume'));
  assert(!calls[0].args.includes('--continue'));
});

// Review machinery fix (S8, approved 2026-11-17): the prompt travels on stdin,
// so packets above Linux's 128 KiB per-argument limit no longer fail with E2BIG.
test('Claude Code adapter passes the prompt on standard input, never in argv, including above 128 KiB', async () => {
  const calls = [];
  const adapter = createClaudeCodeAgentAdapter({
    model: 'claude-test',
    runner: async (executable, args, options) => {
      calls.push({ executable, args, options });
      return { code: 0, signal: null, stdout: JSON.stringify({ session_id: 'claude-context-2', structured_output: { verdict: 'PASS' } }), stderr: '',
        startedAt: new Date('2026-09-24T12:00:00Z'), completedAt: new Date('2026-09-24T12:01:00Z') };
    },
  });
  const large = { ...request(), input: { diff: 'x'.repeat(200 * 1024) } };
  const result = await adapter.runStage(large);
  assert.equal(result.output.verdict, 'PASS');
  const [{ args, options }] = calls;
  assert.ok(options.input.length > 200 * 1024, 'the prompt is on standard input');
  assert.ok(options.input.includes('Review the pinned evidence.') && options.input.includes('x'.repeat(1024)));
  assert.ok(args.every(arg => !String(arg).includes('x'.repeat(1024)) && Buffer.byteLength(String(arg)) < MAX_ARGUMENT_BYTES), 'no argv element carries the prompt or exceeds the limit');
  assert.ok(!args.some(arg => String(arg).includes('<gatereeve-output-schema>')));
  assert.deepEqual(args.slice(-4), ['--output-format', 'json', '--input-format', 'text']);
  // The bounded prompt limit still applies on stdin.
  await assert.rejects(adapter.runStage({ ...request(), input: { diff: 'x'.repeat(600 * 1024) } }), /exceeds the bounded 524288-character provider limit/);
  assert.equal(calls.length, 1);
  // Any other oversized argument fails clearly before spawning.
  assert.throws(() => assertArgumentSizes(['--print', 'y'.repeat(MAX_ARGUMENT_BYTES)]), /per-argument limit; pass large text on standard input/);
  assert.doesNotThrow(() => assertArgumentSizes(['--print', 'y'.repeat(MAX_ARGUMENT_BYTES - 1)]));
});

test('a real child process receives a prompt above 128 KiB on standard input', async () => {
  const prompt = 'p'.repeat(300 * 1024);
  const result = await runAgentProcess(process.execPath, ['-e', 'let n=0;process.stdin.on("data",c=>n+=c.length).on("end",()=>process.stdout.write(String(n)))'],
    { cwd: process.cwd(), input: prompt, timeoutSeconds: 30 });
  assert.equal(result.stdout, String(prompt.length));
});

// S8 review round 2 (NEW5): a provider that exits before reading a large
// prompt must yield a controlled, classified failure, never an unhandled EPIPE.
test('an early-exiting child with a prompt above 128 KiB is a controlled failure, never an unhandled error', async () => {
  // In a separate process, exactly as the reviewer reproduced it: an unhandled
  // 'error' event would exit that process 1 before it prints the outcome.
  const adapterModule = new URL('../../plugin-src/shared/resources/protocol/local-agent-adapters.js', import.meta.url).href;
  const script = `import { runAgentProcess } from ${JSON.stringify(adapterModule)};
    try { await runAgentProcess(process.execPath, ['-e', 'process.exit(1)'], { cwd: process.cwd(), input: 'p'.repeat(300 * 1024), timeoutSeconds: 30 }); console.log('resolved'); }
    catch (error) { console.log(JSON.stringify({ code: error.code, category: error.providerFailure?.category, exitCode: error.providerFailure?.exitCode })); }`;
  const child = await new Promise(resolve => {
    const run = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    run.stdout.on('data', chunk => { stdout += chunk; }); run.stderr.on('data', chunk => { stderr += chunk; });
    run.on('close', code => resolve({ code, stdout, stderr }));
  });
  assert.equal(child.code, 0, child.stderr);
  assert.doesNotMatch(child.stderr, /Unhandled 'error' event|EPIPE/u);
  assert.deepEqual(JSON.parse(child.stdout.trim()), { code: 'AGENT_PROVIDER_CONFIGURATION', category: 'configuration-or-execution', exitCode: 1 });
  // A successful exit without reading the whole prompt is not a trustworthy run either.
  await assert.rejects(runAgentProcess(process.execPath, ['-e', 'process.exit(0)'], { cwd: process.cwd(), input: 'p'.repeat(300 * 1024), timeoutSeconds: 30 }), error => {
    assert.equal(error.code, 'AGENT_PROVIDER_CONFIGURATION'); assert.match(error.message, /did not accept the complete prompt/u);
    assert.equal(error.providerFailure.exitCode, 0); return true;
  });
});

test('both adapters turn an early provider exit with a large prompt into a classified provider failure', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'gatereeve-early-exit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const executable = join(directory, 'provider');
  await writeFile(executable, '#!/bin/sh\necho "invalid configuration" >&2\nexit 2\n');
  await chmod(executable, 0o755);
  const large = { ...request(), repositoryPath: directory, input: { diff: 'x'.repeat(200 * 1024) } };
  for (const create of [createClaudeCodeAgentAdapter, createCodexAgentAdapter]) {
    await assert.rejects(create({ model: 'fixture', executable }).runStage(large), error => {
      assert.equal(error.code, 'AGENT_PROVIDER_CONFIGURATION', create.name);
      assert.equal(error.providerFailure.category, 'configuration-or-execution', create.name);
      assert.equal(error.providerFailure.exitCode, 2, create.name);
      return true;
    });
  }
});

test('adapter parsers require structured output and opaque context IDs', () => {
  assert.deepEqual(parseClaudeStructuredOutput(JSON.stringify({
    session_id: 'session-1', result: '{"ok":true}',
  })), { contextId: 'session-1', output: { ok: true }, metrics: { tokens: null, cost: null } });
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

test('failed provider processes expose structured categories without raw output', async () => {
  await assert.rejects(
    runAgentProcess(process.execPath, [
      '-e',
      'process.stderr.write("warning\\n"); process.stdout.write("structured failure\\n"); process.exit(1);',
    ], { cwd: process.cwd(), input: '', timeoutSeconds: 5 }),
    (error) => {
      assert.doesNotMatch(error.message, /warning|structured failure/u);
      assert.equal(error.providerFailure.category, 'configuration-or-execution');
      assert.equal(error.providerFailure.exitCode, 1);
      return true;
    }
  );
});

test('bundled provider output schemas type every constant', async () => {
  const paths = [
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


test('Claude structured output accepts one JSON fence in fallback text but rejects ambiguity and broken JSON', () => {
  const parse = result => parseClaudeStructuredOutput(JSON.stringify({ session_id: 'fresh', result }));
  assert.deepEqual(parse('```json\n{"ok":true}\n```').output, { ok: true });
  assert.deepEqual(parse('Explanation\n```json\n{"ok":true}\n```').output, { ok: true });
  assert.throws(() => parse('```json\n{"ok":true}\n```\n```json\n{"ok":false}\n```'));
  assert.throws(() => parse('```json\n{"ok":true}\n```\n{"ok":false}'));
  assert.throws(() => parse('```json\n{"ok":}\n```'));
});


test('successful providers with malformed JSON expose no raw response fragments', async () => {
  const sentinel = 'PRIVATE_PROVIDER_CONTEXT_SENTINEL';
  for (const stdout of [sentinel, JSON.stringify({ session_id: 'fresh', result: sentinel })]) {
    assert.throws(() => parseClaudeStructuredOutput(stdout), error => {
      assert.doesNotMatch(error.stack, /PRIVATE_PROVIDER_CONTEXT/);
      assert.equal(error.providerFailure.category, 'malformed-output');
      return true;
    });
  }
  const adapter = createCodexAgentAdapter({ model: 'test', runner: async (_, args) => {
    await writeFile(args[args.indexOf('--output-last-message') + 1], sentinel);
    return { stdout: '{"type":"thread.started","thread_id":"fresh"}\n' };
  } });
  await assert.rejects(adapter.runStage(request()), error => {
    assert.doesNotMatch(error.stack, /PRIVATE_PROVIDER_CONTEXT/);
    assert.equal(error.providerFailure.category, 'malformed-output');
    return true;
  });
});

test('both public adapters reject old receipt requests before launching a provider', async () => {
  for (const create of [createCodexAgentAdapter, createClaudeCodeAgentAdapter]) {
    const adapter = create({ model: 'fixture', runner: () => assert.fail('old request launched') });
    await assert.rejects(adapter.runStage({ ...request(), protocolVersion: 1 }), /current receipt and isolation contract/);
  }
});

test('both providers reject insufficient or unknown reasoning before starting a process', async () => {
  for (const factory of [createCodexAgentAdapter, createClaudeCodeAgentAdapter]) {
    for (const reasoningEffort of ['low', 'medium', 'unknown']) {
      let launched = false;
      const adapter = factory({ model: 'fixture', reasoningEffort, runner: async () => { launched = true; } });
      await assert.rejects(adapter.runStage(request()), /capability profile/);
      assert.equal(launched, false);
    }
  }
});

test('Codex usage totals remain unknown for incomplete fields across completed turns', async () => {
  for (const [usages, expected] of [
    [[{ input_tokens: 12, output_tokens: 7 }, undefined], null],
    [[{ input_tokens: 12, output_tokens: 7 }, { input_tokens: 0 }], { input: 12, output: null, cachedInput: null, cacheCreation: null }],
    [[{ input_tokens: 0, output_tokens: 0 }, { input_tokens: 0, output_tokens: 0 }], { input: 0, output: 0, cachedInput: null, cacheCreation: null }],
    [[undefined, undefined], null],
  ]) {
    const adapter = createCodexAgentAdapter({ model: 'fixture', runner: async (_, args) => {
      await writeFile(args[args.indexOf('--output-last-message') + 1], '{"verdict":"PASS"}');
      return { stdout: [{ type: 'thread.started', thread_id: 'fresh' }, ...usages.map(usage => ({ type: 'turn.completed', usage }))].map(JSON.stringify).join('\n'),
        stderr: '', startedAt: new Date(), completedAt: new Date() };
    } });
    const result = await adapter.runStage(request());
    assert.deepEqual(result.receipt.metrics, { tokens: expected, cost: null });
    validateAgentWorkflowStageResult(result);
  }
});

// Issue #140: the reviewer counts as launched only once its process spawns.
test('runAgentProcess reports the spawn of a started process and never of one that cannot start', async () => {
  let spawned = 0;
  const result = await runAgentProcess(process.execPath, ['-e', 'process.stdout.write("ok")'],
    { cwd: process.cwd(), input: '', timeoutSeconds: 30, onSpawn: async () => { spawned++; } });
  assert.equal(result.stdout, 'ok');
  assert.equal(spawned, 1);
  let missing = 0;
  await assert.rejects(runAgentProcess('/nonexistent/gatereeve-reviewer', [], { cwd: process.cwd(), input: '', timeoutSeconds: 30, onSpawn: async () => { missing++; } }));
  assert.equal(missing, 0, 'A process that never started is not reported as launched');
});
