// Review progress and retained reviewer activity (issue #147).
//
// Progress: while a reviewer runs, its stdout is appended as it arrives to
// `.gatereeve-current/progress/<job>.<provider>.jsonl` in the feature home,
// between a GateReeve header line and a trailer line. The file is scratch for
// the human's watch view: nothing reads it for proof, retention never depends
// on it, and it is never placed in a reviewer's view or packet.
//
// Retention: every launched attempt retains one `review-activity/1` object in
// `objects/` that references, as content-addressed objects, the exact prompt
// the adapter wrote to the provider's standard input, the instructions, the
// input packet, the output schema and the raw stdout stream. A review record
// references it from its `activity` field, never from `artifacts`, so
// `reviewerView` never copies it into a later reviewer's evidence.
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256Digest } from '../agent-workflow.js';
import { ContractError } from '../errors.js';
import { gate, requireThat } from './contracts.js';

export const PROGRESS_FORMAT = 'gatereeve.progress/1';
export const PROGRESS_TYPE = 'gatereeve.progress';
export const ACTIVITY_CONTRACT = 'review-activity/1';
// The record of a planning review attempt that ended after launch without a
// planning-review record; an artifact observation in the journal links it.
export const PLANNING_ATTEMPT_KIND = 'planning-review-attempt';
export const PROGRESS_DIRECTORY = '.gatereeve-current/progress';
export const PROGRESS_RETENTION_MS = 24 * 60 * 60 * 1000;
export const ACTIVITY_TEXT_LIMIT = 120;
// Attempts started within this window of the newest one are one launch, so
// both reviewers of a pair are listed together.
export const LAUNCH_WINDOW_MS = 60 * 1000;
const NAME_PART = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const FILE_NAME = /^([A-Za-z0-9][A-Za-z0-9_-]{0,127})\.([A-Za-z0-9][A-Za-z0-9_-]{0,127})\.jsonl$/u;
const FINAL_STATES = new Set(['progress unavailable']);
export const finalState = value => FINAL_STATES.has(value) || String(value).startsWith('done');

export function progressFileName(jobId, provider) {
  requireThat(NAME_PART.test(String(jobId)) && NAME_PART.test(String(provider)), 'Unsafe review progress file name');
  return `${jobId}.${provider}.jsonl`;
}

async function progressDirectory(home, create) {
  let current = home;
  for (const part of PROGRESS_DIRECTORY.split('/')) {
    current = join(current, part);
    if (create) await mkdir(current, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    let info;
    try { info = await lstat(current); }
    catch (error) { if (!create && error.code === 'ENOENT') return null; throw error; }
    requireThat(info.isDirectory() && !info.isSymbolicLink(), 'Unsafe review progress directory');
  }
  return current;
}
// A regular file, opened without following a link. A watcher reads a file that
// is still being appended to, so its size is read once and only that much.
async function readProgressFile(path, { tail = null } = {}) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    requireThat(info.isFile(), 'Review progress entry is not a regular file');
    const start = tail === null ? 0 : Math.max(0, info.size - tail);
    const buffer = Buffer.alloc(info.size - start);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, start + offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    return { text: buffer.subarray(0, offset).toString('utf8'), truncated: start > 0 };
  } finally { await handle.close(); }
}
function progressLine(value) { return `${JSON.stringify({ type: PROGRESS_TYPE, format: PROGRESS_FORMAT, ...value })}\n`; }
function controlFree(value) { return String(value).replace(/[\u0000-\u001f\u007f]+/gu, ' ').replace(/\s+/gu, ' ').trim(); }
export function boundedActivity(value) {
  const text = controlFree(value);
  return text.length > ACTIVITY_TEXT_LIMIT ? `${text.slice(0, ACTIVITY_TEXT_LIMIT - 1)}…` : text;
}

// Remove finished progress files whose trailer is older than 24 hours. A file
// without a trailer is kept: its attempt may still be running.
export async function pruneProgress(home, now = Date.now()) {
  const directory = await progressDirectory(home, false);
  if (!directory) return [];
  const removed = [];
  for (const name of await readdir(directory)) {
    if (!FILE_NAME.test(name)) continue;
    const path = join(directory, name);
    try {
      const { text } = await readProgressFile(path, { tail: 64 * 1024 });
      const lines = text.split('\n');
      lines.pop(); // the part after the final newline is incomplete
      const last = lines.length ? JSON.parse(lines.at(-1)) : null;
      const ended = last?.type === PROGRESS_TYPE && last.event === 'end' ? Date.parse(last.endedAt) : NaN;
      if (Number.isFinite(ended) && now - ended > PROGRESS_RETENTION_MS) { await unlink(path); removed.push(name); }
    } catch { /* unreadable or not a trailer: kept */ }
  }
  return removed;
}

// One launched reviewer attempt: its live progress file and its retained
// activity. Progress writes are best effort and never throw; a failure stops
// further writes for the attempt. Retention reads only what this object
// captured from the adapter, never the progress file.
export class ReviewCapture {
  constructor(store, { runId, featureId = null, jobId, provider, model, stage, now = () => new Date() }) {
    this.store = store;
    this.meta = { runId, featureId, jobId, provider, model, stage };
    this.now = now;
    this.file = progressFileName(jobId, provider);
    this.prompt = null;
    this.request = null;
    this.chunks = [];
    this.eventBytes = 0;
    this.handle = null;
    this.queue = Promise.resolve();
    this.lastByte = null;
    this.progressError = null;
    this.startedAt = null;
  }
  hooks() {
    return { onPrompt: text => { this.prompt = String(text); }, onOutput: chunk => this.output(chunk) };
  }
  setRequest({ instructions, input, outputSchema }) { this.request = { instructions, input, outputSchema }; }
  async start() {
    this.startedAt = this.now().toISOString();
    try {
      await pruneProgress(this.store.home, this.now().getTime()).catch(() => []);
      const directory = await progressDirectory(this.store.home, true);
      this.handle = await open(join(directory, this.file), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
      this.write(Buffer.from(progressLine({ event: 'start', jobId: this.meta.jobId, provider: this.meta.provider, model: this.meta.model,
        stage: this.meta.stage, startedAt: this.startedAt })));
    } catch (error) { this.progressError ??= error; }
  }
  output(chunk) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    if (!bytes.length) return;
    this.chunks.push(bytes);
    this.eventBytes += bytes.length;
    this.write(bytes);
  }
  write(bytes) {
    if (!this.handle || this.progressError) return;
    this.lastByte = bytes[bytes.length - 1];
    const handle = this.handle;
    this.queue = this.queue.then(async () => { if (!this.progressError) await handle.write(bytes); }).catch(error => { this.progressError ??= error; });
  }
  // A GateReeve line always starts on its own line, even after stdout that
  // ended without a newline.
  marker(value) {
    const prefix = this.lastByte !== null && this.lastByte !== 0x0a ? '\n' : '';
    this.write(Buffer.from(`${prefix}${progressLine(value)}`));
  }
  // The provider process has ended; GateReeve is checking the verdict.
  exited() { this.marker({ event: 'exited', at: this.now().toISOString() }); }
  async finish({ outcome }) {
    this.marker({ event: 'end', state: 'done', outcome: String(outcome), endedAt: this.now().toISOString() });
    await this.queue;
    if (this.handle) { await this.handle.close().catch(error => { this.progressError ??= error; }); this.handle = null; }
    return { file: this.file, written: !this.progressError };
  }
  // The `review-activity/1` object for this attempt. `receipt` and `output`
  // are the adapter receipt and output already retained, when the attempt got
  // that far.
  async retain({ receipt = null, output = null } = {}) {
    const store = this.store;
    const text = async value => value == null ? null : { ...await store.put(Buffer.from(value, 'utf8')), format: 'text' };
    // The packet and schema are data: their nested hashes are not references
    // this record vouches for, so they are not traversed as typed JSON. They
    // keep the key order the prompt was built with.
    const data = async value => value === undefined ? null : { ...await store.put(Buffer.from(JSON.stringify(value), 'utf8')), format: 'json-data' };
    const stream = Buffer.concat(this.chunks);
    const activity = { contract: ACTIVITY_CONTRACT, kind: 'review-activity', ...this.meta,
      prompt: await text(this.prompt),
      instructions: await text(this.request?.instructions),
      input: await data(this.request?.input),
      schema: await data(this.request?.outputSchema),
      events: { ...await store.put(stream), format: 'jsonl' },
      promptBytes: this.prompt == null ? null : Buffer.byteLength(this.prompt),
      eventBytes: stream.length,
      receipt, output,
      startedAt: this.startedAt, retainedAt: this.now().toISOString() };
    return store.putJson(activity);
  }
}

// Split a stream into complete lines that parse as JSON (`events`) and every
// other non-empty line (`unparsed`, 1-based line numbers). A final line
// without a newline is an incomplete write and is always unparsed.
export function streamLines(text) {
  const parts = String(text).split('\n');
  const tail = parts.pop();
  const events = [], unparsed = [];
  parts.forEach((line, index) => {
    const value = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (!value.trim()) return;
    try { events.push(JSON.parse(value)); } catch { unparsed.push({ line: index + 1, text: value }); }
  });
  if (tail && tail.trim()) unparsed.push({ line: parts.length + 1, text: tail });
  return { events, unparsed };
}

// Rebuild a finished review from the run store alone (spec AC4).
export async function reconstructReview(store, recordRef) {
  const load = async (name, ref) => {
    if (ref == null) return null;
    try { return await store.get(ref); }
    catch { throw new ContractError(`Retained review activity object ${name} (${ref?.hash ?? 'invalid reference'}) is missing or fails its integrity check`); }
  };
  const record = JSON.parse((await load('record', recordRef)).toString('utf8'));
  requireThat(record.activity, 'This review record has no retained activity');
  const activity = JSON.parse((await load('activity', record.activity)).toString('utf8'));
  requireThat(activity.contract === ACTIVITY_CONTRACT && activity.kind === 'review-activity', 'The referenced object is not a review-activity record');
  const asText = bytes => bytes === null ? null : bytes.toString('utf8');
  const asJson = bytes => bytes === null ? null : JSON.parse(bytes.toString('utf8'));
  const prompt = asText(await load('prompt', activity.prompt));
  const instructions = asText(await load('instructions', activity.instructions));
  const input = asJson(await load('input', activity.input));
  const schema = asJson(await load('schema', activity.schema));
  const stream = asText(await load('events', activity.events));
  const receipt = asJson(await load('receipt', activity.receipt));
  const output = asJson(await load('output', activity.output));
  let digests = { checked: false };
  if (receipt) {
    const checks = { instructions: instructions !== null && sha256Digest(instructions) === receipt.digests?.instructions,
      input: input !== null && sha256Digest(input) === receipt.digests?.input,
      output: output !== null && sha256Digest(output) === receipt.digests?.output };
    for (const [name, ok] of Object.entries(checks)) requireThat(ok, `Retained review ${name} differs from its receipt digest`);
    digests = { checked: true, ...checks };
  }
  return { record: { hash: recordRef.hash, kind: record.kind }, activity: { contract: activity.contract, runId: activity.runId, featureId: activity.featureId,
    jobId: activity.jobId, provider: activity.provider, model: activity.model, stage: activity.stage, promptBytes: activity.promptBytes, eventBytes: activity.eventBytes,
    startedAt: activity.startedAt, retainedAt: activity.retainedAt },
  prompt, instructions, input, schema, output, stream, ...streamLines(stream ?? ''), digests };
}

// The review records `read activity` accepts: review results, planning
// reviews and failed planning attempts linked from the journal.
export async function activityRecordRef(core, hash) {
  requireThat(typeof hash === 'string' && /^sha256:[a-f0-9]{64}$/u.test(hash), 'Name a review record by its sha256 identity');
  const { state, events } = await core.state();
  const known = state.results.find(item => item.hash === hash) ?? state.planningReviews.find(item => item.result?.hash === hash)?.result;
  if (known) return known;
  const linked = events.some(event => event.type === 'OBSERVATION' && event.payload?.kind === 'artifact' && event.payload.links?.includes(hash));
  requireThat(linked, 'Unknown review record; name a review result, planning review or linked planning attempt from this run');
  const bytes = await core.store.localBytes(`.gatereeve-current/objects/${hash.slice(7)}`).catch(() => {
    throw new ContractError(`Retained review activity object record (${hash}) is missing or fails its integrity check`);
  });
  const ref = { hash, bytes: bytes.length, format: 'json' };
  const record = JSON.parse((await core.store.get(ref)).toString('utf8'));
  requireThat(record.kind === PLANNING_ATTEMPT_KIND, 'The linked object is not a planning review attempt');
  return ref;
}

// Live summary of one progress file's text (spec AC6). Unknown events and
// non-JSON lines are counted and change nothing; the incomplete last line is
// ignored until it is complete.
export function summarizeProgress(text) {
  const parts = String(text).split('\n');
  parts.pop();
  const summary = { header: null, exited: null, trailer: null, events: 0, unparsed: 0, unknown: 0,
    files: new Set(), commands: new Set(), activity: null, selfValidating: false, tokens: null };
  const usages = new Map();
  let codexTokens = null, finalTokens = null;
  const tool = (label, validating) => { summary.activity = boundedActivity(label); summary.selfValidating = validating; };
  for (const line of parts) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { summary.unparsed++; continue; }
    if (!event || typeof event !== 'object') { summary.unknown++; continue; }
    if (event.type === PROGRESS_TYPE) {
      if (event.event === 'start') summary.header = event;
      else if (event.event === 'exited') summary.exited = event;
      else if (event.event === 'end') summary.trailer = event;
      continue;
    }
    summary.events++;
    // Claude Code stream-json.
    if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
      if (event.message.id && event.message.usage) usages.set(event.message.id, event.message.usage);
      for (const item of event.message.content) {
        if (item?.type !== 'tool_use') continue;
        const input = item.input ?? {};
        if (item.name === 'Read' && typeof input.file_path === 'string') summary.files.add(input.file_path);
        tool(`${item.name} ${input.file_path ?? input.pattern ?? input.path ?? ''}`, /(^|__)validate_verdict$/u.test(String(item.name)));
      }
      continue;
    }
    if (event.type === 'result' && event.usage) { finalTokens = event.usage; continue; }
    if (['user', 'system', 'rate_limit_event'].includes(event.type)) continue;
    // Codex exec --json.
    if ((event.type === 'item.started' || event.type === 'item.completed') && event.item) {
      const item = event.item;
      if (item.type === 'command_execution') {
        if (item.id) summary.commands.add(item.id);
        if (event.type === 'item.started') tool(`run: ${item.command ?? ''}`, false);
      } else if (item.type === 'mcp_tool_call') {
        if (event.type === 'item.started') tool(`${item.server ?? 'mcp'}.${item.tool ?? ''}`, item.tool === 'validate_verdict');
      } else if (!['reasoning', 'agent_message', 'file_change', 'todo_list', 'web_search'].includes(item.type)) summary.unknown++;
      continue;
    }
    if (event.type === 'turn.completed' && event.usage) {
      codexTokens = { input: (codexTokens?.input ?? 0) + (event.usage.input_tokens ?? 0), output: (codexTokens?.output ?? 0) + (event.usage.output_tokens ?? 0) };
      continue;
    }
    if (['thread.started', 'turn.started', 'turn.failed', 'error'].includes(event.type)) continue;
    summary.unknown++;
  }
  const claudeInput = usage => (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  if (finalTokens) summary.tokens = { input: claudeInput(finalTokens), output: finalTokens.output_tokens ?? 0 };
  else if (usages.size) summary.tokens = [...usages.values()].reduce((sum, usage) => ({ input: sum.input + claudeInput(usage), output: sum.output + (usage.output_tokens ?? 0) }), { input: 0, output: 0 });
  else if (codexTokens) summary.tokens = codexTokens;
  return summary;
}

const REVIEWER_ROLES = new Set(['independent', 'assessment']);
function reviewerJob(job) {
  try { return Array.isArray(job.gates) && job.gates.some(id => REVIEWER_ROLES.has(gate(id).role)); } catch { return false; }
}
// One line per review attempt (spec AC6). An attempt is a review job the run
// journal records as started, or a progress file (planning reviews use their
// operation ID). Read-only.
export async function reviewProgress(core, { job = null } = {}, now = Date.now()) {
  requireThat(job === null || (typeof job === 'string' && NAME_PART.test(job)), 'Review progress job must be a job or operation ID');
  const store = core.store;
  const directory = await progressDirectory(store.home, false);
  const attempts = new Map();
  for (const name of directory ? await readdir(directory) : []) {
    const match = FILE_NAME.exec(name);
    if (!match) continue;
    let read;
    try { read = await readProgressFile(join(directory, name)); } catch { continue; }
    const summary = summarizeProgress(read.text);
    attempts.set(`${match[1]}.${match[2]}`, { jobId: match[1], provider: match[2], summary });
  }
  const { state, events } = await core.state();
  const journal = new Map();
  for (const event of events) if (event.type === 'JOB_STARTED') journal.set(event.payload.jobId, event.recordedAt);
  for (const [jobId, value] of Object.entries(state.jobs ?? {})) {
    if (!reviewerJob(value)) continue;
    const known = [...attempts.values()].some(item => item.jobId === jobId);
    if (known) { for (const item of attempts.values()) if (item.jobId === jobId) item.journal = value; continue; }
    let configuration = {};
    try { configuration = (await store.json(value.input)).configuration ?? {}; } catch { /* unreadable input: shown without model */ }
    attempts.set(`${jobId}.${configuration.provider ?? 'unknown'}`, { jobId, provider: configuration.provider ?? 'unknown', model: configuration.model ?? null,
      journal: value, journalStartedAt: journal.get(jobId) ?? null, summary: null });
  }
  const rows = [...attempts.values()].map(item => attemptRow(item, now));
  let selected;
  if (job !== null) {
    selected = rows.filter(row => row.job === job);
    requireThat(selected.length, `No review attempt has ID ${job}`);
  } else {
    selected = rows.filter(row => !finalState(row.state));
    if (!selected.length && rows.length) {
      const newest = Math.max(...rows.map(row => Date.parse(row.startedAt) || 0));
      selected = rows.filter(row => (Date.parse(row.startedAt) || 0) >= newest - LAUNCH_WINDOW_MS);
    }
  }
  selected.sort((a, b) => (Date.parse(a.startedAt) || 0) - (Date.parse(b.startedAt) || 0) || a.provider.localeCompare(b.provider));
  return { schemaVersion: 1, format: PROGRESS_FORMAT, observedAt: new Date(now).toISOString(), attempts: selected,
    final: selected.every(row => finalState(row.state)) };
}
function attemptRow(item, now) {
  const summary = item.summary;
  const header = summary?.header;
  const done = Boolean(item.journal?.finished || item.journal?.abandoned);
  let state;
  if (summary?.trailer) state = `done: ${summary.trailer.outcome}`;
  else if (done) state = 'progress unavailable';
  else if (!summary) state = 'starting';
  else if (summary.exited) state = 'finished, validating';
  else if (summary.selfValidating) state = 'self-validating';
  else state = 'running';
  const startedAt = header?.startedAt ?? item.journalStartedAt ?? null;
  const ended = summary?.trailer ? Date.parse(summary.trailer.endedAt) : null;
  const started = Date.parse(startedAt);
  const provider = header?.provider ?? item.provider;
  return { job: item.jobId, provider, model: header?.model ?? item.model ?? null, stage: header?.stage ?? null, startedAt,
    elapsedMs: Number.isFinite(started) ? Math.max(0, (Number.isFinite(ended) ? ended : now) - started) : null,
    filesRead: summary ? (provider === 'codex' ? summary.commands.size : summary.files.size) : 0,
    filesReadBasis: provider === 'codex' ? 'commands' : 'Read paths',
    activity: summary?.activity ?? null, tokens: summary?.tokens ?? null, state,
    lines: summary ? { events: summary.events, unparsed: summary.unparsed, unknown: summary.unknown } : null };
}
