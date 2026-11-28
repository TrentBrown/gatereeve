import './helpers/private-scratch.js';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, chmod } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { MAX_ARGUMENT_BYTES, MAX_OUTPUT_BYTES, assertArgumentSizes, codexShellEnvironmentArgs, claudeResultEnvelope, providerDiagnostic } from '../../plugin-src/shared/resources/protocol/local-agent-adapters.js';
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

// Claude Code's stream-json output (issue #147): events, then the result
// envelope as its last event.
const claudeStream = envelope => `${JSON.stringify({ type: 'system', subtype: 'init', session_id: envelope.session_id })}\n${JSON.stringify({ type: 'result', subtype: 'success', ...envelope })}\n`;

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
        stdout: claudeStream({
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
      return { code: 0, signal: null, stdout: claudeStream({ session_id: 'claude-context-2', structured_output: { verdict: 'PASS' } }), stderr: '',
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
  assert.deepEqual(args.slice(-5), ['--output-format', 'stream-json', '--verbose', '--input-format', 'text']);
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
test('both local adapters advertise spawn reporting and forward onSpawn to their runner', async () => {
  const onSpawn = async () => {};
  for (const [create, output] of [
    [createCodexAgentAdapter, async (args) => { await writeFile(args[args.indexOf('--output-last-message') + 1], '{"verdict":"PASS"}\n'); return '{"type":"thread.started","thread_id":"codex-context-1"}\n'; }],
    [createClaudeCodeAgentAdapter, async () => claudeStream({ session_id: 'claude-context-1', structured_output: { verdict: 'PASS' } })],
  ]) {
    const received = [];
    const adapter = create({ model: 'model-test', runner: async (executable, args, options) => {
      received.push(options.onSpawn);
      return { code: 0, signal: null, stdout: await output(args), stderr: '', startedAt: new Date(), completedAt: new Date() };
    } });
    assert.equal(adapter.reportsSpawn, true);
    await adapter.runStage(request(), { onSpawn });
    await adapter.runStage(request());
    assert.deepEqual(received, [onSpawn, undefined]);
  }
});

// Issue #142: GateReeve's read-only validate_verdict tool is the only
// addition; every existing restriction stays exactly as it was.
const selfValidation = { server: 'gatereeve', tool: 'validate_verdict', command: '/usr/local/bin/node',
  args: ['--permission', '--allow-fs-read=/resources/', '--allow-fs-read=/view/validation/context.json', '/resources/protocol/current/verdict-check-server.js', '/view/validation/context.json'],
  env: { GATEREEVE_METRICS: 'off' } };
async function launchArgs(create, value) {
  const calls = [];
  const adapter = create({ model: 'fixture', runner: async (executable, args) => {
    calls.push(args);
    const outputPath = args.includes('--output-last-message') ? args[args.indexOf('--output-last-message') + 1] : null;
    if (outputPath) await writeFile(outputPath, '{"verdict":"PASS"}\n');
    return { code: 0, signal: null, stderr: '', startedAt: new Date('2026-11-26T00:00:00Z'), completedAt: new Date('2026-11-26T00:01:00Z'),
      stdout: outputPath ? '{"type":"thread.started","thread_id":"codex-context"}\n' : claudeStream({ session_id: 'claude-context', structured_output: { verdict: 'PASS' } }) };
  } });
  assert.equal(adapter.selfValidation, true);
  const result = await adapter.runStage(value);
  assert.equal(validateAgentWorkflowReceipt(result.receipt), result.receipt);
  return { args: calls[0], receipt: result.receipt };
}
test('Claude Code offers only the validate_verdict tool and keeps its restrictions', async () => {
  const without = await launchArgs(createClaudeCodeAgentAdapter, request());
  const offered = await launchArgs(createClaudeCodeAgentAdapter, { ...request(), selfValidation });
  assert.equal(without.receipt.isolation.selfValidation, false);
  assert.equal(offered.receipt.isolation.selfValidation, true);
  const value = (args, flag) => args[args.indexOf(flag) + 1];
  for (const args of [without.args, offered.args]) {
    assert(args.includes('--restricted'));
    assert(args.includes('--strict-mcp-config'));
    assert.equal(value(args, '--tools'), 'Read,Glob,Grep');
    assert.equal(value(args, '--permission-mode'), 'dontAsk');
  }
  assert.equal(value(without.args, '--mcp-config'), '{"mcpServers":{}}');
  assert(!without.args.includes('--allowedTools'));
  assert.deepEqual(JSON.parse(value(offered.args, '--mcp-config')), { mcpServers: { gatereeve: { type: 'stdio', command: selfValidation.command, args: selfValidation.args, env: selfValidation.env } } });
  assert.equal(value(offered.args, '--allowedTools'), 'mcp__gatereeve__validate_verdict');
  const agents = args => JSON.parse(value(args, '--agents'))['gatereeve-stage'].tools;
  assert.deepEqual(agents(without.args), ['Read', 'Glob', 'Grep']);
  assert.deepEqual(agents(offered.args), ['Read', 'Glob', 'Grep', 'mcp__gatereeve__validate_verdict']);
  // Apart from those three, the argument lists are identical.
  const strip = args => {
    const copy = [...args];
    copy[copy.indexOf('--mcp-config') + 1] = '<mcp>'; copy[copy.indexOf('--agents') + 1] = '<agents>';
    const allowed = copy.indexOf('--allowedTools');
    if (allowed !== -1) copy.splice(allowed, 2);
    return copy;
  };
  assert.deepEqual(strip(offered.args), strip(without.args));
});
test('Codex offers only the gatereeve MCP server and keeps its read-only sandbox', async () => {
  const without = await launchArgs(createCodexAgentAdapter, request());
  const offered = await launchArgs(createCodexAgentAdapter, { ...request(), selfValidation });
  assert.equal(without.receipt.isolation.selfValidation, false);
  assert.equal(offered.receipt.isolation.selfValidation, true);
  for (const args of [without.args, offered.args]) assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
  // Scratch paths differ per run; compare everything else.
  const normal = args => args.map((arg, index) => ['--output-schema', '--output-last-message'].includes(args[index - 1]) ? '<scratch>' : arg);
  const added = [
    '--config', `mcp_servers.gatereeve.command=${JSON.stringify(selfValidation.command)}`,
    '--config', `mcp_servers.gatereeve.args=${JSON.stringify(selfValidation.args)}`,
    '--config', 'mcp_servers.gatereeve.env={GATEREEVE_METRICS="off"}',
  ];
  const at = offered.args.indexOf(added[1]) - 1;
  assert.deepEqual(offered.args.slice(at, at + added.length), added);
  assert.deepEqual(normal([...offered.args.slice(0, at), ...offered.args.slice(at + added.length)]), normal(without.args));
});
test('both adapters refuse a malformed self-validation launch before starting a process', async () => {
  for (const create of [createCodexAgentAdapter, createClaudeCodeAgentAdapter]) {
    const adapter = create({ model: 'fixture', runner: () => assert.fail('launched') });
    for (const launch of [{ ...selfValidation, command: 'node' }, { ...selfValidation, server: 'bad server' }, { ...selfValidation, args: [1] }, { ...selfValidation, env: { 'bad-key': 'x' } }]) {
      await assert.rejects(adapter.runStage({ ...request(), selfValidation: launch }), /self-validation launch/u);
    }
  }
});

// Issue #147: the output limit equals the run store's 64 MiB object limit,
// and output up to the limit reaches onOutput, including the part of the
// chunk that crosses it.
test('R7: runAgentProcess keeps stdout up to 64 MiB through onOutput, then fails as over the limit', async () => {
  assert.equal(MAX_OUTPUT_BYTES, 64 * 1024 * 1024);
  let seen = 0, last = null;
  const script = `const chunk = Buffer.alloc(3 * 1024 * 1024 + 7, 97); let left = ${MAX_OUTPUT_BYTES + 5 * 1024 * 1024};
    const pump = () => { while (left > 0) { const part = chunk.subarray(0, Math.min(chunk.length, left)); left -= part.length; if (!process.stdout.write(part)) return process.stdout.once('drain', pump); } };
    pump();`;
  await assert.rejects(runAgentProcess(process.execPath, ['-e', script], { cwd: process.cwd(), input: '', timeoutSeconds: 120,
    onOutput: chunk => { seen += chunk.length; last = chunk; } }), /exceeded the output limit/);
  assert.equal(seen, MAX_OUTPUT_BYTES, 'every byte up to the limit was delivered, and none beyond it');
  assert.ok(last.length > 0);
});

test('R1: a stream with no result event is malformed output', () => {
  assert.throws(() => claudeResultEnvelope('{"type":"system","subtype":"init"}\n{"type":"assistant","message":{}}\n'), error => error.providerFailure?.category === 'malformed-output');
  const envelope = claudeResultEnvelope('{"type":"result","session_id":"a","result":"one"}\n{"type":"result","session_id":"b","structured_output":{"v":1}}\n');
  assert.equal(envelope.session_id, 'b', 'the last result event is the envelope');
});

test('a failed streaming reviewer is classified from its error and result events, never from what it read', async t => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-classify-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fake = async (lines, code) => {
    const path = join(root, `claude-${Math.random().toString(16).slice(2)}`);
    await writeFile(path, `#!${process.execPath}\nprocess.stdin.resume(); process.stdin.on('end', () => { process.stdout.write(${JSON.stringify(lines.map(line => JSON.stringify(line)).join('\n') + '\n')}); process.exit(${code}); });\n`);
    await chmod(path, 0o755);
    return createClaudeCodeAgentAdapter({ executable: path, model: 'claude-test', runner: (executable, args, options) => runAgentProcess(executable, args, { ...options, cwd: root }) });
  };
  // The transcript mentions rate limits, credit and authentication (a rate
  // limit event and a source file the reviewer read); the failure itself is not.
  const read = { type: 'user', message: { content: [{ type: 'tool_result', content: 'credit balance; authentication required; HTTP 503; timed out' }] } };
  const plain = await fake([{ type: 'rate_limit_event', rate_limit_info: {} }, read, { type: 'result', subtype: 'error_during_execution', is_error: true, result: 'Agent crashed' }], 1);
  await assert.rejects(plain.runStage(request()), error => error.providerFailure?.category === 'configuration-or-execution');
  const transient = await fake([read, { type: 'result', subtype: 'error', is_error: true, api_error_status: 529, result: 'API Error: 503 Service Unavailable' }], 1);
  await assert.rejects(transient.runStage(request()), error => error.providerFailure?.category === 'transient-service-failure');
  assert.equal(providerDiagnostic('not json\n{"type":"item.completed","item":{"aggregated_output":"credit balance"}}\n{"type":"error","message":"boom"}'),
    'not json\n{"type":"error","message":"boom"}');
});
