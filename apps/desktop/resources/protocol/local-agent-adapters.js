import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sha256Digest } from './agent-workflow.js';
import { ContractError } from './errors.js';

const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_PROMPT_CHARACTERS = 512 * 1024;

function iso(value) {
  return value instanceof Date ? value.toISOString() : value;
}

export function runAgentProcess(executable, args, { cwd, input, env = process.env, timeoutSeconds }) {
  return new Promise((resolve, reject) => {
    const startedAt = new Date();
    const child = spawn(executable, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let size = 0;
    let timedOut = false;
    let killTimer = null;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 2_000);
    }, timeoutSeconds * 1000);
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_OUTPUT_BYTES) child.kill('SIGTERM');
      else stdout.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_OUTPUT_BYTES) child.kill('SIGTERM');
      else stderr.push(chunk);
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (killTimer !== null) clearTimeout(killTimer);
      const completedAt = new Date();
      if (timedOut) return reject(new Error(`${executable} timed out`));
      if (size > MAX_OUTPUT_BYTES) return reject(new Error(`${executable} exceeded the output limit`));
      const result = {
        code,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        startedAt,
        completedAt,
      };
      if (code !== 0 || signal !== null) {
        const diagnostic = [
          result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : null,
          result.stdout.trim() ? `stdout:\n${result.stdout.trim()}` : null,
        ].filter(Boolean).join('\n');
        return reject(new Error(
          `${executable} failed (${signal ?? code}): ${diagnostic}`
        ));
      }
      resolve(result);
    });
    child.stdin.end(input);
  });
}

function promptFor(request) {
  const prompt = [
    request.instructions.trim(),
    '',
    'Operate only on the supplied pinned evidence and the read-only repository view.',
    'Do not use network tools. Return only an object satisfying the supplied JSON Schema.',
    '',
    '<gatereeve-input>',
    JSON.stringify(request.input),
    '</gatereeve-input>',
  ].join('\n');
  if (prompt.length > MAX_PROMPT_CHARACTERS) {
    throw new ContractError(
      `Agent workflow prompt exceeds the bounded ${MAX_PROMPT_CHARACTERS}-character provider limit`
    );
  }
  return prompt;
}

function receiptFor(request, descriptor, output, contextId, method, processResult) {
  return {
    schemaVersion: 1,
    kind: 'gatereeve-agent-workflow-receipt',
    protocolVersion: request.protocolVersion,
    runId: request.runId,
    attemptId: request.attemptId,
    module: request.module,
    stage: request.stage.id,
    provider: {
      id: descriptor.provider,
      adapterVersion: descriptor.version,
      model: descriptor.model,
      reasoningEffort: descriptor.reasoningEffort,
      contextId,
    },
    isolation: { method, freshContext: true, inheritedTurns: 0 },
    policy: {
      repositoryAccess: request.policy.repositoryAccess,
      networkAccess: request.policy.networkAccess,
      scratch: request.policy.scratch,
    },
    startedAt: iso(processResult.startedAt),
    completedAt: iso(processResult.completedAt),
    status: 'completed',
    digests: {
      instructions: sha256Digest(request.instructions),
      input: sha256Digest(request.input),
      output: sha256Digest(output),
      snapshot: request.snapshotDigest,
    },
  };
}

function jsonLines(value) {
  return value.split(/\r?\n/u).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function parseObject(value, label) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ContractError(`${label} did not return a JSON object`);
  }
  return parsed;
}

export function parseClaudeStructuredOutput(stdout) {
  const envelope = parseObject(stdout, 'Claude Code');
  const output = envelope.structured_output ?? envelope.structuredOutput ?? envelope.result;
  return {
    output: parseObject(output, 'Claude Code structured output'),
    contextId: envelope.session_id ?? envelope.sessionId,
  };
}

export function parseCodexContextId(stdout) {
  const events = jsonLines(stdout);
  const started = events.find((event) => event.type === 'thread.started');
  const contextId = started?.thread_id ?? started?.threadId;
  if (typeof contextId !== 'string' || contextId === '') {
    throw new ContractError('Codex did not report a fresh context ID');
  }
  return contextId;
}

function descriptor({ id, provider, model, reasoningEffort, isolationMethod }) {
  return Object.freeze({
    schemaVersion: 1,
    id,
    version: '1.0.0',
    provider,
    model,
    reasoningEffort,
    capabilityProfiles: ['high-capability-v1'],
    isolationMethods: [isolationMethod],
  });
}

export function createCodexAgentAdapter({
  executable = 'codex',
  model,
  reasoningEffort = 'high',
  runner = runAgentProcess,
  environment = process.env,
} = {}) {
  if (typeof model !== 'string' || !model) throw new TypeError('Codex adapter requires an explicit model');
  const details = descriptor({
    id: 'codex/fresh-exec', provider: 'codex', model, reasoningEffort,
    isolationMethod: 'codex-ephemeral-exec',
  });
  return Object.freeze({
    async describe() { return structuredClone(details); },
    async runStage(request) {
      const scratch = await mkdtemp(join(tmpdir(), 'gatereeve-codex-stage-'));
      try {
        const schemaPath = join(scratch, 'output.schema.json');
        const outputPath = join(scratch, 'output.json');
        await writeFile(schemaPath, `${JSON.stringify(request.outputSchema, null, 2)}\n`, { mode: 0o600 });
        const processResult = await runner(executable, [
          'exec', '--ephemeral', '--ignore-user-config', '--ignore-rules',
          '--skip-git-repo-check', '--sandbox', 'read-only', '--model', model,
          '--config', `model_reasoning_effort="${reasoningEffort}"`,
          '--config', 'shell_environment_policy.inherit="none"',
          '--cd', request.repositoryPath,
          '--output-schema', schemaPath,
          '--output-last-message', outputPath,
          '--json', '-',
        ], {
          cwd: request.repositoryPath,
          input: promptFor(request),
          env: environment,
          timeoutSeconds: request.timeoutSeconds,
        });
        const output = parseObject(await readFile(outputPath, 'utf8'), 'Codex structured output');
        const contextId = parseCodexContextId(processResult.stdout);
        return {
          output,
          receipt: receiptFor(request, details, output, contextId, 'codex-ephemeral-exec', processResult),
        };
      } finally {
        await rm(scratch, { recursive: true, force: true });
      }
    },
  });
}

export function createClaudeCodeAgentAdapter({
  executable = 'claude',
  model,
  reasoningEffort = 'high',
  runner = runAgentProcess,
  environment = process.env,
} = {}) {
  if (typeof model !== 'string' || !model) throw new TypeError('Claude Code adapter requires an explicit model');
  const details = descriptor({
    id: 'claude-code/custom-agent', provider: 'claude-code', model, reasoningEffort,
    isolationMethod: 'claude-custom-agent',
  });
  return Object.freeze({
    async describe() { return structuredClone(details); },
    async runStage(request) {
      const agentName = 'gatereeve-stage';
      const agents = {
        [agentName]: {
          description: `GateReeve ${request.stage.role}`,
          prompt: request.instructions,
          tools: ['Read', 'Glob', 'Grep'],
        },
      };
      const processResult = await runner(executable, [
        '--print', '--restricted', '--permission-mode', 'dontAsk',
        '--permission-prompts', 'none', '--no-session-persistence',
        '--setting-sources', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
        '--disable-slash-commands', '--no-chrome',
        '--model', model, '--effort', reasoningEffort,
        '--agents', JSON.stringify(agents), '--agent', agentName,
        '--tools', 'Read,Glob,Grep', '--json-schema', JSON.stringify(request.outputSchema),
        '--output-format', 'json', promptFor(request),
      ], {
        cwd: request.repositoryPath,
        input: '',
        env: environment,
        timeoutSeconds: request.timeoutSeconds,
      });
      const parsed = parseClaudeStructuredOutput(processResult.stdout);
      if (typeof parsed.contextId !== 'string' || parsed.contextId === '') {
        throw new ContractError('Claude Code did not report a fresh context ID');
      }
      return {
        output: parsed.output,
        receipt: receiptFor(
          request, details, parsed.output, parsed.contextId, 'claude-custom-agent', processResult
        ),
      };
    },
  });
}
