import { withScratch, scratchEnvironment } from '../storage/scratch.js';
import { spawn } from 'node:child_process';
import { accessSync, constants as fsConstants, readdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

import { delimiter, isAbsolute, join } from 'node:path';

import { sha256Digest, AGENT_WORKFLOW_PROTOCOL_VERSION, validateEvaluatorCapability } from './agent-workflow.js';
import { ContractError } from './errors.js';

const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_PROMPT_CHARACTERS = 512 * 1024;

function iso(value) {
  return value instanceof Date ? value.toISOString() : value;
}

// Idle-stop automation (for example Fleet) treats a held systemd idle
// inhibitor as "kept awake". A reviewer waits on the model API for long quiet
// stretches inside one tool call, so it declares itself with a lock tied to its
// own process: released on exit or crash, visible to every local user.
export const IDLE_INHIBITOR_WHY_LIMIT = 120;
export function idleInhibitorWhy({ provider, stage, feature }) {
  const role = stage === 'review' ? 'boundary' : String(stage ?? 'agent').replace(/-review$/u, '');
  const text = `${provider} ${role} review: ${feature}`.replace(/[\u0000-\u001f\u007f]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  return text.slice(0, IDLE_INHIBITOR_WHY_LIMIT);
}
function findExecutable(name, pathValue) {
  for (const directory of String(pathValue ?? '').split(delimiter)) {
    if (!directory || !isAbsolute(directory)) continue;
    const candidate = join(directory, name);
    try { accessSync(candidate, fsConstants.X_OK); return candidate; } catch { /* next */ }
  }
  return null;
}
function inhibitorArgs(why) {
  return ['--what=idle', '--mode=block', '--who=GateReeve', `--why=${why}`];
}
function probeIdleInhibitor(inhibitor, why) {
  // A refused lock (no logind, policy denial) must not look like a reviewer
  // failure: take and release it once with a no-op before the real launch.
  return new Promise(resolve => {
    let child;
    try { child = spawn(inhibitor, [...inhibitorArgs(why), 'true'], { stdio: 'ignore' }); }
    catch { resolve(false); return; }
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(false); }, 10_000);
    child.on('error', () => { clearTimeout(timer); resolve(false); });
    child.on('close', code => { clearTimeout(timer); resolve(code === 0); });
  });
}
export const systemIdleInhibitor = Object.freeze({
  platform: () => process.platform,
  resolve: () => findExecutable('systemd-inhibit', process.env.PATH),
  probe: probeIdleInhibitor,
});
// The launch to use: wrapped in `systemd-inhibit` on Linux when it is present
// and grants the lock, otherwise exactly the requested command.
export async function idleInhibitedLaunch(executable, args, idleLock, inhibitor = systemIdleInhibitor) {
  const unwrapped = { executable, args, idleInhibitor: false };
  if (!idleLock?.why || inhibitor.platform() !== 'linux') return unwrapped;
  const wrapper = inhibitor.resolve();
  if (!wrapper || !(await inhibitor.probe(wrapper, idleLock.why))) return unwrapped;
  return { executable: wrapper, args: [...inhibitorArgs(idleLock.why), executable, ...args], idleInhibitor: true };
}

// Linux process table helpers for ending a wrapped reviewer: the start time
// guards a recorded PID against reuse before the delayed SIGKILL.
function processStat(pid) {
  try {
    const text = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = text.slice(text.lastIndexOf(')') + 2).split(' ');
    return { parent: Number(fields[1]), started: fields[19] };
  } catch { return null; }
}
export function processDescendants(root) {
  if (process.platform !== 'linux' || !root) return [];
  let entries;
  try { entries = readdirSync('/proc'); } catch { return []; }
  const children = new Map();
  for (const name of entries) {
    if (!/^\d+$/u.test(name)) continue;
    const stat = processStat(name);
    if (!stat) continue;
    if (!children.has(stat.parent)) children.set(stat.parent, []);
    children.get(stat.parent).push({ pid: Number(name), started: stat.started });
  }
  const found = [];
  const queue = [root];
  while (queue.length) {
    for (const item of children.get(queue.shift()) ?? []) { found.push(item); queue.push(item.pid); }
  }
  return found;
}
// Node sets the tracked child's exit fields in the same event-loop turn that
// reaps it, so while both are null its PID has not been released. A recorded
// descendant is a root only while its start time still matches.
export function escalationRoots(child, recorded, stat = processStat) {
  const live = child.exitCode === null && child.signalCode === null ? [child.pid] : [];
  return [...live, ...recorded.filter(item => stat(item.pid)?.started === item.started).map(item => item.pid)];
}
function killIfSame({ pid, started }) {
  if (processStat(pid)?.started !== started) return;
  try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
}

export async function runAgentProcess(executable, args, { cwd, input, env = process.env, timeoutSeconds, idleLock = null, inhibitor = systemIdleInhibitor }) {
  const launch = await idleInhibitedLaunch(executable, args, idleLock, inhibitor);
  assertArgumentSizes(launch.args);
  return new Promise((resolve, reject) => {
    const startedAt = new Date();
    // The launch stays in the evaluator's process group, so an interrupt,
    // hangup or cancellation of the evaluator still reaches the reviewer.
    const child = spawn(launch.executable, launch.args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Ending the run: SIGTERM, then SIGKILL two seconds later. Behind
    // systemd-inhibit the tracked child is the wrapper, which forwards only
    // SIGTERM and may exit (or close its streams) first, so the wrapper's
    // descendants are recorded before the first signal. The SIGKILL then
    // goes to them and to anything they or the wrapper started since, and it
    // still fires after the wrapper closes: closed streams do not mean the
    // recorded reviewer has exited.
    let killTimer = null;
    let recorded = [];
    const terminate = () => {
      if (killTimer !== null) return;
      recorded = launch.idleInhibitor ? processDescendants(child.pid) : [];
      child.kill('SIGTERM');
      killTimer = setTimeout(() => {
        const seen = new Set(recorded.map(item => item.pid));
        const targets = [...recorded];
        // Walk only roots that are still the recorded process: an exited
        // wrapper's or reviewer's PID may already belong to another process.
        for (const root of escalationRoots(child, recorded)) {
          for (const item of processDescendants(root)) if (!seen.has(item.pid)) { seen.add(item.pid); targets.push(item); }
        }
        child.kill('SIGKILL');
        for (const item of targets) killIfSame(item);
      }, 2_000);
    };
    const stdout = [];
    const stderr = [];
    let size = 0;
    // A provider that exits before reading a large prompt makes the pending
    // stdin write fail (EPIPE, or a destroyed stream). Unhandled, that 'error'
    // event would terminate the evaluator host before the failure could be
    // retained; it is recorded here and the process outcome decides at close.
    let stdinError = null;
    child.stdin.on('error', (error) => { stdinError ??= error; });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutSeconds * 1000);
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_OUTPUT_BYTES) terminate();
      else stdout.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_OUTPUT_BYTES) terminate();
      else stderr.push(chunk);
    });
    child.on('error', reject);
    child.on('close', (code, exitSignal) => {
      clearTimeout(timer);
      if (killTimer !== null && recorded.length === 0) clearTimeout(killTimer);
      const completedAt = new Date();
      if (timedOut) return reject(Object.assign(new Error(`${executable} timed out`), {code:'AGENT_PROVIDER_TIMEOUT'}));
      if (size > MAX_OUTPUT_BYTES) return reject(new Error(`${executable} exceeded the output limit`));
      const result = {
        code,
        signal: exitSignal,
        idleInhibitor: launch.idleInhibitor,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        startedAt,
        completedAt,
      };
      if (code !== 0 || exitSignal !== null) {
        const diagnostic = `${result.stderr}\n${result.stdout}`;
        const transient = /rate.?limit|\b429\b|\b50[234]\b|temporar(?:y|ily)|connection reset|timed out/iu.test(diagnostic);
        const category = /credit balance|insufficient credit/iu.test(diagnostic) ? 'credit-unavailable'
          : /model.*not supported|unsupported.*model/iu.test(diagnostic) ? 'unsupported-model'
          : /unauthorized|authentication|auth required|invalid.api.key/iu.test(diagnostic) ? 'authentication'
          : transient ? 'transient-service-failure' : 'configuration-or-execution';
        return reject(Object.assign(new Error(`Evaluator unavailable: ${category}; check the provider configuration before retrying.`), {
          code: transient ? 'AGENT_PROVIDER_TRANSIENT' : 'AGENT_PROVIDER_CONFIGURATION',
          providerFailure: { category, exitCode: code, signal: exitSignal, startedAt: iso(startedAt), completedAt: iso(completedAt) },
        }));
      }
      // Exit 0 without the complete prompt delivered is not a trustworthy run.
      if (stdinError) {
        return reject(Object.assign(new Error('Evaluator unavailable: configuration-or-execution; the provider did not accept the complete prompt on standard input.'), {
          code: 'AGENT_PROVIDER_CONFIGURATION',
          providerFailure: { category: 'configuration-or-execution', exitCode: code, signal: exitSignal, stdin: stdinError.code ?? 'error', startedAt: iso(startedAt), completedAt: iso(completedAt) },
        }));
      }
      resolve(result);
    });
    child.stdin.end(input);
  });
}

// The provider rejects longer prompts before any model call. Callers that
// shape bounded inputs measure against the same text with promptCharacters().
export const MAX_PROMPT_CHARACTERS_LIMIT = MAX_PROMPT_CHARACTERS;
export function promptCharacters(request) { return promptText(request).length; }
// Linux limits each argv element to MAX_ARG_STRLEN (32 pages, 128 KiB). Large
// text belongs on standard input; anything else that large fails clearly here
// instead of as spawn E2BIG.
export const MAX_ARGUMENT_BYTES = 128 * 1024;
export function assertArgumentSizes(args) {
  for (const arg of args) {
    if (Buffer.byteLength(String(arg)) >= MAX_ARGUMENT_BYTES) {
      throw new ContractError(`An agent command-line argument exceeds the ${MAX_ARGUMENT_BYTES}-byte per-argument limit; pass large text on standard input`);
    }
  }
}
function promptFor(request) {
  const prompt = promptText(request);
  if (prompt.length > MAX_PROMPT_CHARACTERS) {
    throw new ContractError(
      `Agent workflow prompt exceeds the bounded ${MAX_PROMPT_CHARACTERS}-character provider limit`
    );
  }
  return prompt;
}
function promptText(request) {
  return [
    request.instructions.trim(),
    '',
    'Operate only on the supplied pinned evidence and the read-only repository view.',
    'Do not use network tools. Return only an object satisfying the supplied JSON Schema.',
    '',
    '<gatereeve-output-schema>',
    JSON.stringify(request.outputSchema),
    '</gatereeve-output-schema>',
    '',
    '<gatereeve-input>',
    JSON.stringify(request.input),
    '</gatereeve-input>',
  ].join('\n');
}

function providerMetrics(usages, costs = []) {
  const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const sum = values => values.length && values.every(number) ? values.reduce((a, b) => a + b, 0) : null;
  const tokens = {
    input: sum(usages.map(value => value?.input_tokens)),
    output: sum(usages.map(value => value?.output_tokens)),
    cachedInput: sum(usages.map(value => value?.cached_input_tokens ?? value?.cache_read_input_tokens)),
    cacheCreation: sum(usages.map(value => value?.cache_creation_input_tokens)),
  };
  return { tokens: Object.values(tokens).some(value => value !== null) ? tokens : null, cost: sum(costs) };
}
function receiptFor(request, descriptor, output, contextId, method, processResult, metrics) {
  return {
    schemaVersion: 1,
    kind: 'gatereeve-agent-workflow-receipt',
    protocolVersion: request.protocolVersion,
    runId: request.runId,
    attemptId: request.attemptId,
    module: request.module,
    stage: request.stage.id,
    capabilityProfile: structuredClone(request.capabilityProfile),
    provider: {
      id: descriptor.provider,
      adapterVersion: descriptor.version,
      model: descriptor.model,
      reasoningEffort: descriptor.reasoningEffort,
      contextId,
    },
    isolation: { method, freshContext: true, inheritedTurns: 0, idleInhibitor: processResult.idleInhibitor === true },
    policy: {
      repositoryAccess: request.policy.repositoryAccess,
      networkAccess: request.policy.networkAccess,
      scratch: request.policy.scratch,
    },
    startedAt: iso(processResult.startedAt),
    completedAt: iso(processResult.completedAt),
    status: 'completed',
    metrics,
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
  // Some CLI versions put the schema result inside a single fenced JSON string.
  // Accept only an entire fenced object; callers still validate its full schema.
  const fenced = typeof value === 'string' ? /^\s*```(?:json)?\s*\n([\s\S]*?)\n```\s*$/u.exec(value) : null;
  let parsed;
  try { parsed = typeof value === 'string' ? JSON.parse(fenced ? fenced[1] : value) : value; }
  catch { throw Object.assign(new ContractError(`${label} returned malformed JSON; request a fresh structured response.`), {
    providerFailure: { category: 'malformed-output' },
  }); }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ContractError(`${label} did not return a JSON object`);
  }
  return parsed;
}

export function parseClaudeStructuredOutput(stdout) {
  const envelope = parseObject(stdout, 'Claude Code');
  const structured = envelope.structured_output ?? envelope.structuredOutput;
  let output = structured ?? envelope.result;
  // Only the text fallback can contain a conversational wrapper. Reject
  // multiple fences so no competing verdict can be silently discarded.
  if (structured == null && typeof output === 'string') {
    const fences = output.match(/^[ \t]*```[^\r\n]*$/gmu);
    const block = /^[ \t]*```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*$/mu.exec(output);
    if (fences?.length === 2 && block) {
      const outside = output.slice(0, block.index) + '\n' + output.slice(block.index + block[0].length);
      if (!/^\s*[\[{]/mu.test(outside)) output = block[1];
    }
  }
  return {
    output: parseObject(output, 'Claude Code structured output'),
    contextId: envelope.session_id ?? envelope.sessionId,
    metrics: providerMetrics([envelope.usage], [envelope.total_cost_usd]),
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

export function codexShellEnvironmentArgs(platform = process.platform) {
  const args = ['--config', 'shell_environment_policy.inherit="none"'];
  // Linux Codex uses the command environment to discover distro Bubblewrap.
  // Keep those search paths fixed when the rest of the environment is scrubbed.
  if (platform === 'linux') args.push('--config', 'shell_environment_policy.set.PATH="/usr/bin:/bin"');
  return args;
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
      validateEvaluatorCapability(request.capabilityProfile, reasoningEffort);
      if (request.protocolVersion !== AGENT_WORKFLOW_PROTOCOL_VERSION || request.policy?.repositoryAccess !== 'read-only'
          || request.policy.networkAccess !== 'deny' || request.policy.scratch !== 'isolated') {
        throw new ContractError('Evaluator request must use the current receipt and isolation contract');
      }
      return withScratch({ purpose: 'codex-evaluator' }, async scratchRun => {
        const scratch = scratchRun.path;
        const schemaPath = join(scratch, 'output.schema.json');
        const outputPath = join(scratch, 'output.json');
        await writeFile(schemaPath, `${JSON.stringify(request.outputSchema, null, 2)}\n`, { mode: 0o600 });
        const processResult = await runner(executable, [
          'exec', '--ephemeral', '--ignore-user-config', '--ignore-rules',
          '--skip-git-repo-check', '--sandbox', 'read-only', '--model', model,
          '--config', `model_reasoning_effort="${reasoningEffort}"`,
          ...codexShellEnvironmentArgs(),
          '--cd', request.repositoryPath,
          '--output-schema', schemaPath,
          '--output-last-message', outputPath,
          '--json', '-',
        ], {
          cwd: request.repositoryPath,
          input: promptFor(request),
          env: await scratchEnvironment(scratchRun, environment),
          timeoutSeconds: request.timeoutSeconds,
          idleLock: { why: idleInhibitorWhy({ provider: 'codex', stage: request.stage.id, feature: request.featureId ?? request.runId }) },
        });
        const output = parseObject(await readFile(outputPath, 'utf8'), 'Codex structured output');
        const contextId = parseCodexContextId(processResult.stdout);
        return {
          schemaVersion: 1, protocolVersion: request.protocolVersion, stageId: request.stage.id, status: 'completed',
          output,
          receipt: receiptFor(request, details, output, contextId, 'codex-ephemeral-exec', processResult,
            providerMetrics(jsonLines(processResult.stdout).filter(event => event.type === 'turn.completed').map(event => event.usage))),
        };
  });
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
      validateEvaluatorCapability(request.capabilityProfile, reasoningEffort);
      if (request.protocolVersion !== AGENT_WORKFLOW_PROTOCOL_VERSION || request.policy?.repositoryAccess !== 'read-only'
          || request.policy.networkAccess !== 'deny' || request.policy.scratch !== 'isolated') {
        throw new ContractError('Evaluator request must use the current receipt and isolation contract');
      }
      return withScratch({ purpose: 'claude-evaluator' }, async scratchRun => {
      const agentName = 'gatereeve-stage';
      const agents = {
        [agentName]: {
          description: `GateReeve ${request.stage.role}`,
          prompt: request.instructions,
          tools: ['Read', 'Glob', 'Grep'],
        },
      };
      // The prompt goes on standard input (`--print` reads it there when no
      // prompt argument is given; `--input-format text` is the default, stated
      // explicitly). As one argv element it hit Linux's 128 KiB per-argument
      // limit (spawn E2BIG) well below the 512 KiB prompt bound.
      const args = [
        '--print', '--restricted', '--permission-mode', 'dontAsk',
        '--permission-prompts', 'none', '--no-session-persistence',
        '--setting-sources', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
        '--disable-slash-commands', '--no-chrome',
        '--model', model, '--effort', reasoningEffort,
        '--agents', JSON.stringify(agents), '--agent', agentName,
        '--tools', 'Read,Glob,Grep', '--json-schema', JSON.stringify(request.outputSchema),
        '--output-format', 'json', '--input-format', 'text',
      ];
      assertArgumentSizes(args);
      const processResult = await runner(executable, args, {
        cwd: request.repositoryPath,
        input: promptFor(request),
        env: await scratchEnvironment(scratchRun, environment),
        timeoutSeconds: request.timeoutSeconds,
        idleLock: { why: idleInhibitorWhy({ provider: 'claude-code', stage: request.stage.id, feature: request.featureId ?? request.runId }) },
      });
      const parsed = parseClaudeStructuredOutput(processResult.stdout);
      if (typeof parsed.contextId !== 'string' || parsed.contextId === '') {
        throw new ContractError('Claude Code did not report a fresh context ID');
      }
      return {
        schemaVersion: 1, protocolVersion: request.protocolVersion, stageId: request.stage.id, status: 'completed',
        output: parsed.output,
        receipt: receiptFor(
          request, details, parsed.output, parsed.contextId, 'claude-custom-agent', processResult, parsed.metrics
        ),
      };
      });
    },
  });
}
