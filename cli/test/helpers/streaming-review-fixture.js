// Real Codex and Claude Code adapters over a simulated provider process
// (issue #147). The runner streams provider-shaped events through onOutput
// as the real process runner does, so capture, progress and retention run
// end to end. Synthetic: no model is called.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClaudeCodeAgentAdapter, createCodexAgentAdapter } from '../../../plugin-src/shared/resources/protocol/local-agent-adapters.js';

export const PROGRESS = '.gatereeve-current/progress';
// The packet the adapter wrote into the prompt.
export const promptInput = prompt => JSON.parse(/<gatereeve-input>\n([\s\S]*)\n<\/gatereeve-input>/u.exec(prompt)[1]);
const dimensions = outcome => ['code', 'requirements', 'evidence', 'scope', 'findings'].map(name => ({ name, outcome, evidence: 'Fixture source and receipts' }));
export function verdictOutput(input, { outcome = 'PASS' } = {}) {
  if (input.artifact) return { outcome, summary: `Fixture ${input.artifact} review`, findings: [], mandateAssessment: input.mandate ? { outcome: 'PASS', evidence: 'Fixture mandate check' } : null };
  return { verdicts: input.gates.map(id => ({ gate: id, outcome, summary: 'Fixture assessment: the change exports 42.',
    ...(id === 'review' ? { dimensions: dimensions(outcome) } : {}),
    criteria: input.criteria.map(row => ({ id: row, outcome, evidence: 'app/app.js exports 42' })),
    coverage: { complete: true, paths: ['app/app.js'], interactions: ['app/app.js'], limitations: [] }, findings: [], dispositions: [], historyAssessment: null,
    ...(input.mandate ? { mandateAssessment: { outcome: 'PASS', evidence: 'Fixture mandate check' } } : {}), coverageDecisions: [] })) };
}
// Provider-shaped event lines. `sentinel` marks this attempt's stream so a
// test can look for its bytes anywhere else.
export function claudeEvents(output, sentinel, { result = true } = {}) {
  const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 };
  return [
    { type: 'system', subtype: 'init', session_id: 'claude-fresh', note: sentinel },
    { type: 'assistant', message: { id: 'm1', usage, content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'repositories/app/app.js' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: `export const answer = 42; // ${sentinel}` }] } },
    { type: 'assistant', message: { id: 'm2', usage, content: [{ type: 'tool_use', id: 't2', name: 'mcp__gatereeve__validate_verdict', input: {} }] } },
    ...(result ? [{ type: 'result', subtype: 'success', session_id: 'claude-fresh', structured_output: output, usage: { ...usage, output_tokens: 11 }, total_cost_usd: 0.01 }] : []),
  ].map(event => `${JSON.stringify(event)}\n`).join('');
}
export function codexEvents(sentinel) {
  return [
    { type: 'thread.started', thread_id: 'codex-fresh' },
    { type: 'item.started', item: { id: 'c1', type: 'command_execution', command: `sed -n 1,20p repositories/app/app.js # ${sentinel}` } },
    { type: 'item.completed', item: { id: 'c1', type: 'command_execution', command: 'sed -n 1,20p repositories/app/app.js', aggregated_output: sentinel } },
    { type: 'item.started', item: { id: 'v1', type: 'mcp_tool_call', server: 'gatereeve', tool: 'validate_verdict' } },
    { type: 'turn.completed', usage: { input_tokens: 30, output_tokens: 7 } },
  ].map(event => `${JSON.stringify(event)}\n`).join('');
}
// Split a stream so chunks cut through JSON lines.
export const chunks = text => { const bytes = Buffer.from(text); const size = Math.max(7, Math.ceil(bytes.length / 5)); const out = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.subarray(i, i + size)); return out; };

// Modes: pass | rejected | malformed | provider-failure | timeout | limit | refused.
// `during(provider, options)` runs after the stream is emitted, before exit.
export function streamingAdapters(f, { mode = {}, during = null, trailingNewline = true } = {}) {
  const seen = { prompts: {}, streams: {}, cwd: {}, sentinels: {} };
  let count = 0;
  const runnerFor = provider => async (executable, args, options) => {
    const modeOf = typeof mode === 'string' ? mode : mode[provider] ?? 'pass';
    if (modeOf === 'refused') throw Object.assign(new Error(`${executable} could not start`), { code: 'ENOENT' });
    await options.onSpawn?.();
    const input = promptInput(options.input);
    const sentinel = `SENTINEL-${provider}-${++count}-${Date.now()}`;
    let output = verdictOutput(input);
    if (modeOf === 'rejected') output = { verdicts: output.verdicts?.map(({ summary, ...rest }) => rest) ?? output };
    let stream = provider === 'claude-code' ? claudeEvents(output, sentinel, { result: modeOf !== 'malformed' }) : codexEvents(sentinel);
    if (!trailingNewline) stream = stream.slice(0, -1);
    seen.prompts[provider] = options.input; seen.streams[provider] = stream; seen.cwd[provider] = options.cwd; seen.sentinels[provider] = sentinel;
    for (const chunk of chunks(stream)) options.onOutput?.(chunk);
    if (during) await during(provider, options);
    if (modeOf === 'timeout') throw Object.assign(new Error(`${executable} timed out`), { code: 'AGENT_PROVIDER_TIMEOUT' });
    if (modeOf === 'limit') throw new Error(`${executable} exceeded the output limit`);
    if (modeOf === 'provider-failure') throw Object.assign(new Error('Evaluator unavailable: transient-service-failure; check the provider configuration before retrying.'), {
      code: 'AGENT_PROVIDER_TRANSIENT', providerFailure: { category: 'transient-service-failure', exitCode: 1, signal: null } });
    if (provider === 'codex') await writeFile(args[args.indexOf('--output-last-message') + 1], modeOf === 'malformed' ? 'not json' : JSON.stringify(output));
    return { code: 0, signal: null, idleInhibitor: false, stdout: stream, stderr: '', startedAt: new Date(), completedAt: new Date() };
  };
  f.core.runtime.evaluators = {
    codex: createCodexAgentAdapter({ model: 'fixture', runner: runnerFor('codex') }),
    'claude-code': createClaudeCodeAgentAdapter({ model: 'fixture', runner: runnerFor('claude-code') }),
  };
  return seen;
}

export async function progressFiles(home) {
  try { return (await readdir(join(home, PROGRESS))).filter(name => name.endsWith('.jsonl')).sort(); } catch { return []; }
}
export async function readProgress(home, name) { return readFile(join(home, PROGRESS, name), 'utf8'); }
// Every file under a directory, as path and text.
export async function treeText(root) {
  const out = [];
  const walk = async dir => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) out.push({ path, text: await readFile(path, 'utf8').catch(() => '') });
    }
  };
  await walk(root);
  return out;
}
