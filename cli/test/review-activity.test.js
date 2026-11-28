import './helpers/private-scratch.js';
// Review progress visibility and reviewer activity retention (issue #147).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepared } from './helpers/paired-review-fixture.js';
import { PROGRESS, promptInput, progressFiles, readProgress, streamingAdapters, treeText } from './helpers/streaming-review-fixture.js';
import {
  ACTIVITY_CONTRACT, LAUNCH_WINDOW_MS, PROGRESS_TYPE, activityRecordRef, boundedActivity, pruneProgress, reconstructReview, reviewProgress,
  streamLines, summarizeProgress,
} from '../../plugin-src/shared/resources/protocol/current/review-activity.js';
import { providerPrompt } from '../../plugin-src/shared/resources/protocol/local-agent-adapters.js';
import { readCurrent } from '../../plugin-src/shared/resources/protocol/current/adapter.js';

const resultOf = async (f, event) => Promise.all(event.payload.outcomes.flatMap(row => row.results ?? []).map(async ref => ({ ref, result: await f.core.store.json(ref) })));
const objectsOf = async f => readdir(join(f.home, '.gatereeve-current/objects'));
const reviewJob = configuration => ({ gates: ['review'], configuration: { ...configuration, reasoningEffort: 'high' } });

test('R3/R4: a paired round retains each attempt\'s activity and rebuilds from the run store alone', async t => {
  const f = await prepared(t, 'full');
  const seen = streamingAdapters(f);
  const { event } = await f.request('review.execute', {}, 'round-1');
  const results = await resultOf(f, event);
  assert.equal(results.length, 2);
  for (const { ref, result } of results) {
    assert.equal(result.outcome, 'PASS', result.summary);
    assert.ok(result.activity, 'the result references its activity');
    assert.ok(!result.artifacts.some(item => item.hash === result.activity.hash), 'activity is never an artifact');
    const activity = await f.core.store.json(result.activity);
    const provider = activity.provider;
    assert.equal(activity.contract, ACTIVITY_CONTRACT);
    assert.equal(activity.stage, 'review');
    assert.equal(activity.promptBytes, Buffer.byteLength(seen.prompts[provider]));
    assert.equal(activity.eventBytes, Buffer.byteLength(seen.streams[provider]));
    // All five referenced objects live in objects/ under their content hash.
    const objects = await objectsOf(f);
    for (const name of ['prompt', 'instructions', 'input', 'schema', 'events']) assert.ok(objects.includes(activity[name].hash.slice(7)), `${name} is in objects/`);
  }
  // Remove everything except the database and objects/: progress files and
  // reviewer views are gone, and the reviews still rebuild.
  await rm(join(f.home, PROGRESS), { recursive: true, force: true });
  for (const name of await readdir(join(f.home, '.gatereeve-current'))) {
    if (name !== 'objects' && !name.startsWith('workflow.sqlite')) await rm(join(f.home, '.gatereeve-current', name), { recursive: true, force: true });
  }
  for (const { ref, result } of results) {
    const rebuilt = await reconstructReview(f.core.store, ref);
    const provider = rebuilt.activity.provider;
    assert.equal(rebuilt.prompt, seen.prompts[provider], 'the exact sent prompt');
    assert.equal(rebuilt.stream, seen.streams[provider], 'the exact captured stream');
    assert.equal(rebuilt.prompt, providerPrompt({ instructions: rebuilt.instructions, outputSchema: rebuilt.schema, input: rebuilt.input }), 'the prompt equals the one built from the retained parts');
    assert.deepEqual(rebuilt.input, promptInput(seen.prompts[provider]));
    assert.deepEqual(rebuilt.output, await f.core.store.json(result.artifacts[1]));
    assert.deepEqual(rebuilt.events, seen.streams[provider].trim().split('\n').map(line => JSON.parse(line)));
    assert.deepEqual(rebuilt.unparsed, []);
    assert.deepEqual(rebuilt.digests, { checked: true, instructions: true, input: true, output: true });
    // The same reader through the protocol read operation.
    const read = await readCurrent(f.context, 'activity', ref.hash, f.core.runtime);
    assert.equal(read.data.stream, rebuilt.stream);
  }
});

test('R4: reconstruction fails clearly for a missing or corrupt object and a record without activity', async t => {
  const f = await prepared(t, 'full');
  streamingAdapters(f);
  const { event } = await f.request('review.execute', {}, 'round-1');
  const [{ ref, result }] = await resultOf(f, event);
  const activity = await f.core.store.json(result.activity);
  const verification = (await f.core.state()).state.results[0];
  await assert.rejects(readCurrent(f.context, 'activity', verification.hash, f.core.runtime), /no retained activity/);
  await rm(join(f.home, '.gatereeve-current/objects', activity.events.hash.slice(7)));
  await assert.rejects(reconstructReview(f.core.store, ref), new RegExp(`object events \\(${activity.events.hash}\\) is missing or fails its integrity check`));
  await writeFile(join(f.home, '.gatereeve-current/objects', activity.prompt.hash.slice(7)), 'tampered');
  await assert.rejects(reconstructReview(f.core.store, ref), /object (prompt|events)/);
});

test('R3: failed attempts after launch retain their activity; a pre-launch refusal retains none', async t => {
  const f = await prepared(t, 'full');
  for (const mode of ['rejected', 'malformed', 'provider-failure', 'timeout', 'limit']) {
    const seen = streamingAdapters(f, { mode });
    const { event } = await f.request('gate.execute', reviewJob({ provider: 'claude-code', model: 'fixture' }), `individual-${mode}`);
    const [ref] = event.payload.results;
    const result = await f.core.store.json(ref);
    assert.equal(result.outcome, 'UNAVAILABLE', `${mode}: ${result.summary}`);
    assert.ok(result.activity, `${mode} retains activity`);
    const rebuilt = await reconstructReview(f.core.store, ref);
    assert.equal(rebuilt.prompt, seen.prompts['claude-code'], mode);
    assert.equal(rebuilt.stream, seen.streams['claude-code'], mode);
    const files = await progressFiles(f.home);
    const trailer = (await readProgress(f.home, files.find(name => name.startsWith(event.payload.jobId)))).trim().split('\n').at(-1);
    assert.deepEqual(JSON.parse(trailer).outcome, 'UNAVAILABLE', mode);
  }
  streamingAdapters(f, { mode: 'refused' });
  const { event } = await f.request('gate.execute', reviewJob({ provider: 'codex', model: 'fixture' }), 'individual-refused');
  const refused = await f.core.store.json(event.payload.results[0]);
  assert.equal(refused.outcome, 'UNAVAILABLE');
  assert.equal(refused.reviewerLaunched, false);
  assert.equal(refused.activity, undefined, 'no activity before launch');
});

test('R2/R5: progress streams while the reviewer runs, and never reaches a peer reviewer or a later round', async t => {
  const f = await prepared(t, 'full');
  const midRun = {};
  const seen = streamingAdapters(f, {
    during: async (provider, options) => {
      // Wait for this attempt's own progress file to hold its stream.
      const deadline = Date.now() + 5000;
      let text = '';
      while (Date.now() < deadline) {
        const name = (await progressFiles(f.home)).find(item => item.endsWith(`.${provider}.jsonl`));
        text = name ? await readProgress(f.home, name) : '';
        if (text.includes(seen.streams[provider])) break;
        await new Promise(done => setTimeout(done, 20));
      }
      midRun[provider] = { text, progress: await reviewProgress(f.core) };
      // The peer's live progress never appears in this reviewer's view.
      const peer = provider === 'codex' ? 'claude-code' : 'codex';
      const view = await treeText(options.cwd);
      for (const file of view) assert.ok(!seen.sentinels[peer] || !file.text.includes(seen.sentinels[peer]), `peer progress leaked into ${file.path}`);
    },
  });
  const { event } = await f.request('review.execute', {}, 'round-1');
  for (const provider of ['codex', 'claude-code']) {
    const lines = midRun[provider].text.split('\n');
    const header = JSON.parse(lines[0]);
    assert.equal(header.type, PROGRESS_TYPE);
    assert.equal(header.event, 'start');
    assert.equal(header.provider, provider);
    assert.equal(header.stage, 'review');
    assert.ok(midRun[provider].text.includes(seen.streams[provider]), 'stdout is in the file before the reviewer exits');
    const row = midRun[provider].progress.attempts.find(item => item.provider === provider);
    assert.equal(row.state, 'self-validating');
    assert.equal(row.filesRead, 1);
    assert.equal(row.filesReadBasis, provider === 'codex' ? 'commands' : 'Read paths');
    assert.ok(row.tokens);
  }
  const first = await resultOf(f, event);
  const sentinels = Object.values(seen.sentinels);
  const retained = [];
  for (const { result } of first) {
    const activity = await f.core.store.json(result.activity);
    retained.push(result.activity.hash, ...['prompt', 'instructions', 'input', 'schema', 'events'].map(name => activity[name].hash));
  }
  // A later reviewer receives the earlier round as history: its view holds the
  // earlier results, but no activity object and no progress bytes.
  const later = streamingAdapters(f, {
    during: async (provider, options) => {
      const view = await treeText(options.cwd);
      for (const file of view) {
        for (const sentinel of sentinels) assert.ok(!file.text.includes(sentinel), `earlier activity leaked into ${file.path}`);
        assert.ok(!retained.some(hash => file.path.endsWith(hash.slice(7))), `activity object copied into ${file.path}`);
      }
    },
  });
  await f.request('gate.execute', { ...reviewJob({ provider: 'codex', model: 'fixture' }), history: first.map(item => item.ref) }, 'later');
  for (const sentinel of sentinels) assert.ok(!later.prompts.codex.includes(sentinel), 'no earlier activity in the later packet');
});

test('R2: the trailer starts its own line, and pruning removes only finished files older than 24 hours', async t => {
  const f = await prepared(t, 'full');
  streamingAdapters(f, { trailingNewline: false });
  const { event } = await f.request('gate.execute', reviewJob({ provider: 'codex', model: 'fixture' }), 'no-newline');
  const name = (await progressFiles(f.home)).find(item => item.startsWith(event.payload.jobId));
  const lines = (await readProgress(f.home, name)).split('\n');
  assert.equal(lines.at(-1), '', 'the file ends with a newline');
  const trailer = JSON.parse(lines.at(-2));
  assert.equal(trailer.event, 'end');
  assert.equal(JSON.parse(lines.at(-3)).event, 'exited');
  assert.ok(lines.at(-4).startsWith('{"type":"turn.completed"'), 'the unterminated stdout line is kept whole');
  // Pruning.
  const directory = join(f.home, PROGRESS);
  const line = value => `${JSON.stringify({ type: PROGRESS_TYPE, ...value })}\n`;
  const old = new Date(Date.now() - 25 * 3600 * 1000).toISOString(), recent = new Date().toISOString();
  await writeFile(join(directory, 'old.codex.jsonl'), line({ event: 'start', startedAt: old }) + line({ event: 'end', state: 'done', outcome: 'PASS', endedAt: old }));
  await writeFile(join(directory, 'recent.codex.jsonl'), line({ event: 'start', startedAt: recent }) + line({ event: 'end', state: 'done', outcome: 'PASS', endedAt: recent }));
  await writeFile(join(directory, 'running.codex.jsonl'), line({ event: 'start', startedAt: old }) + '{"type":"thread.started"}\n');
  const ancient = new Date(Date.now() - 48 * 3600 * 1000);
  await utimes(join(directory, 'running.codex.jsonl'), ancient, ancient);
  assert.deepEqual(await pruneProgress(f.home), ['old.codex.jsonl']);
  assert.ok((await readdir(directory)).includes('running.codex.jsonl'));
  assert.ok((await readdir(directory)).includes('recent.codex.jsonl'));
});

test('R3: planning reviews retain activity; a failed attempt is linked from the journal', async t => {
  const f = await prepared(t, 'full');
  const seen = streamingAdapters(f);
  f.core.runtime.evaluator = f.core.runtime.evaluators['claude-code'];
  const reviewed = await f.request('planning.review', { artifact: 'spec', configuration: { provider: 'claude-code', model: 'fixture' } }, 'plan-1');
  const record = await f.core.store.json(reviewed.event.payload.result);
  assert.ok(record.activity);
  const rebuilt = await reconstructReview(f.core.store, reviewed.event.payload.result);
  assert.equal(rebuilt.prompt, seen.prompts['claude-code']);
  assert.equal(rebuilt.activity.stage, 'planning-review');
  assert.equal(rebuilt.digests.checked, true);
  assert.ok((await progressFiles(f.home)).includes('plan-1.claude-code.jsonl'));
  // A malformed planning answer fails the operation as before, and the
  // attempt's activity is retained and linked.
  const failing = streamingAdapters(f, { mode: 'malformed' });
  f.core.runtime.evaluator = f.core.runtime.evaluators['claude-code'];
  await assert.rejects(f.request('planning.review', { artifact: 'spec', configuration: { provider: 'claude-code', model: 'fixture' } }, 'plan-2'), /no result event/);
  const { state, events } = await f.core.state();
  assert.equal(state.planningReviews.length, 1, 'no planning-review record for the failure');
  const note = events.findLast(item => item.type === 'OBSERVATION');
  assert.equal(note.payload.kind, 'artifact');
  const ref = await activityRecordRef(f.core, note.payload.links[0]);
  const attempt = await reconstructReview(f.core.store, ref);
  assert.equal(attempt.record.kind, 'planning-review');
  assert.equal((await f.core.store.json(ref)).failedAttempt, true);
  assert.equal(attempt.stream, failing.streams['claude-code']);
  assert.equal(attempt.digests.checked, false);
  await assert.rejects(activityRecordRef(f.core, `sha256:${'0'.repeat(64)}`), /Unknown review record/);
});

test('R6: the watch lists attempts from the journal and progress files with bounded fields and final states', async t => {
  const f = await prepared(t, 'full');
  streamingAdapters(f);
  const { event } = await f.request('review.execute', {}, 'round-1');
  let watched = await reviewProgress(f.core);
  assert.equal(watched.attempts.length, 2, 'both reviewers of the newest launch');
  assert.ok(watched.final);
  for (const row of watched.attempts) {
    assert.equal(row.state, 'done: PASS');
    assert.equal(row.model, 'fixture');
    assert.ok(Number.isFinite(row.elapsedMs));
    assert.ok(row.activity.length <= 120);
  }
  // A journal job whose progress file is gone is shown, as progress unavailable.
  const [codexJob] = event.payload.outcomes.filter(row => row.provider === 'codex').map(row => row.jobId ?? null);
  const files = await progressFiles(f.home);
  const codexFile = files.find(name => name.endsWith('.codex.jsonl'));
  await rm(join(f.home, PROGRESS, codexFile));
  watched = await reviewProgress(f.core);
  const codexRow = watched.attempts.find(row => row.provider === 'codex');
  assert.equal(codexRow.state, 'progress unavailable');
  if (codexJob) assert.equal(codexRow.job, codexJob);
  // A newer planning attempt still running (no trailer) is the only listed row;
  // an incomplete final line and non-JSON lines change nothing.
  const header = JSON.stringify({ type: PROGRESS_TYPE, format: 'gatereeve.progress/1', event: 'start', jobId: 'plan-live', provider: 'claude-code', model: 'fixture', stage: 'planning-review', startedAt: new Date().toISOString() });
  const toolUse = JSON.stringify({ type: 'assistant', message: { id: 'm', content: [{ type: 'tool_use', name: 'Grep', input: { pattern: 'x'.repeat(300) } }] } });
  await writeFile(join(f.home, PROGRESS, 'plan-live.claude-code.jsonl'), `${header}\nnot json\n${toolUse}\n{"type":"assistant","message":{"id":"m2","content":[{"type":"tool_use","name":"Read","input":{"file_path":"a"}}`);
  watched = await reviewProgress(f.core);
  assert.deepEqual(watched.attempts.map(row => row.job), ['plan-live']);
  const live = watched.attempts[0];
  assert.equal(live.state, 'running');
  assert.equal(live.filesRead, 0, 'the incomplete Read line is ignored');
  assert.equal(live.activity.length, 120);
  assert.ok(live.activity.startsWith('Grep x'));
  assert.deepEqual(live.lines, { events: 1, unparsed: 1, unknown: 0 });
  assert.equal(watched.final, false);
  // A named job, and an unknown one.
  assert.equal((await reviewProgress(f.core, { job: codexRow.job })).attempts[0].state, 'progress unavailable');
  await assert.rejects(reviewProgress(f.core, { job: 'no-such-job' }), /No review attempt has ID no-such-job/);
});

test('R6: the newest launch groups attempts started within 60 seconds', () => {
  assert.equal(LAUNCH_WINDOW_MS, 60_000);
  assert.equal(boundedActivity('a\nb'), 'a b');
  assert.equal(boundedActivity('y'.repeat(500)).length, 120);
});

test('R6: progress summaries count unknown events and read Codex and Claude activity', () => {
  const lines = [
    { type: PROGRESS_TYPE, event: 'start', provider: 'codex', startedAt: '2026-11-27T00:00:00Z' },
    { type: 'thread.started', thread_id: 'x' },
    { type: 'item.started', item: { id: 'c1', type: 'command_execution', command: 'rg answer' } },
    { type: 'item.started', item: { id: 'c2', type: 'command_execution', command: 'cat app.js' } },
    { type: 'brand.new.event' },
    { type: 'turn.completed', usage: { input_tokens: 4, output_tokens: 2 } },
    { type: PROGRESS_TYPE, event: 'exited', at: '2026-11-27T00:01:00Z' },
  ].map(value => JSON.stringify(value)).join('\n') + '\n';
  const summary = summarizeProgress(lines);
  assert.equal(summary.commands.size, 2);
  assert.equal(summary.unknown, 1);
  assert.equal(summary.activity, 'run: cat app.js');
  assert.deepEqual(summary.tokens, { input: 4, output: 2 });
  assert.ok(summary.exited);
  assert.deepEqual(streamLines('{"a":1}\nnope\n\n{"b":'), { events: [{ a: 1 }], unparsed: [{ line: 2, text: 'nope' }, { line: 4, text: '{"b":' }] });
});

test('R6: an unknown progress directory entry and an empty store list nothing', async t => {
  const f = await prepared(t, 'full');
  await mkdir(join(f.home, PROGRESS), { recursive: true });
  await writeFile(join(f.home, PROGRESS, 'README'), 'not a progress file');
  const watched = await reviewProgress(f.core);
  assert.deepEqual(watched.attempts.filter(row => row.provider !== 'unknown'), []);
});

test('R9: the run folder ignores everything but its .gitignore, and an old .gitignore is upgraded on resume', async t => {
  const { mkdtemp, realpath, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { git } = await import('../../plugin-src/shared/resources/protocol/current/evidence.js');
  const { executeCurrentRequest, RUN_FOLDER_IGNORE } = await import('../../plugin-src/shared/resources/protocol/current/adapter.js');
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gatereeve-ignore-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await git(root, ['init', '-b', 'main']);
  await git(root, ['config', 'user.email', 'fixture@example.test']); await git(root, ['config', 'user.name', 'Fixture']); await git(root, ['config', 'commit.gpgsign', 'false']);
  await writeFile(join(root, 'app.js'), 'export const answer = 41;\n');
  await git(root, ['add', '-A']); await git(root, ['commit', '-m', 'fixture']);
  await git(root, ['checkout', '-b', 'feature-x']);
  const runtime = { entryPoints: { adapter: null, cli: null } };
  const run = async (operation, input) => {
    const result = await executeCurrentRequest({ operation, input, operationId: `${operation.replace(".", "-")}-${Date.now()}`, cwd: root }, runtime);
    assert.ok(result.ok, result.error?.message);
  };
  const ignoreFile = join(root, 'docs/issues/feature-x/.gatereeve-current/.gitignore');
  await run('run.start', { runId: 'run-ignore', implementers: ['implementer'] });
  const fresh = (await readFile(ignoreFile, 'utf8')).split('\n');
  for (const line of RUN_FOLDER_IGNORE) assert.ok(fresh.includes(line), `fresh .gitignore has ${line}`);
  // Retained objects, a key-like file and progress exist, yet only .gitignore is visible to git.
  await mkdir(join(root, 'docs/issues/feature-x/.gatereeve-current/progress'), { recursive: true });
  await writeFile(join(root, 'docs/issues/feature-x/.gatereeve-current/progress/x.codex.jsonl'), '{}\n');
  await writeFile(join(root, 'docs/issues/feature-x/.gatereeve-current/runner-comparison.key'), 'k');
  const visible = (await git(root, ['status', '--porcelain', '--untracked-files=all'])).split('\n').filter(line => line.includes('.gatereeve-current'));
  assert.deepEqual(visible, ['?? docs/issues/feature-x/.gatereeve-current/.gitignore']);
  // A run folder written before this change keeps its line and gains the two.
  await writeFile(ignoreFile, '/workflow.sqlite*\n# local note\n');
  await run('run.resume-current', { implementers: ['implementer'] });
  assert.equal(await readFile(ignoreFile, 'utf8'), '/workflow.sqlite*\n# local note\n/*\n!/.gitignore\n');
  await run('run.resume-current', { implementers: ['implementer'] });
  assert.equal(await readFile(ignoreFile, 'utf8'), '/workflow.sqlite*\n# local note\n/*\n!/.gitignore\n', 'no duplicate lines');
});

test('R4: reconstruction keeps a non-JSON line as unparsed and a final JSON line without a newline as an event', async t => {
  const f = await prepared(t, 'full');
  const seen = streamingAdapters(f, { noise: true, trailingNewline: false });
  const { event } = await f.request('gate.execute', reviewJob({ provider: 'codex', model: 'fixture' }), 'mixed');
  const rebuilt = await reconstructReview(f.core.store, event.payload.results[0]);
  assert.equal(rebuilt.stream, seen.streams.codex);
  assert.deepEqual(rebuilt.unparsed, [{ line: 2, text: 'provider warning: not JSON' }]);
  assert.equal(rebuilt.events.length, 5);
  assert.equal(rebuilt.events.at(-1).type, 'turn.completed', 'the unterminated final JSON line is an event');
});

test('R2/R6: a planning review refused before launch ends its progress file and retains no activity', async t => {
  const f = await prepared(t, 'full');
  streamingAdapters(f, { mode: 'refused' });
  f.core.runtime.evaluator = f.core.runtime.evaluators['claude-code'];
  await assert.rejects(f.request('planning.review', { artifact: 'spec', configuration: { provider: 'claude-code', model: 'fixture' } }, 'plan-refused'), /could not start/);
  const text = await readProgress(f.home, 'plan-refused.claude-code.jsonl');
  assert.equal(JSON.parse(text.trim().split('\n').at(-1)).event, 'end');
  const watched = await reviewProgress(f.core, { job: 'plan-refused' });
  assert.equal(watched.attempts[0].state, 'done: UNAVAILABLE');
  assert.ok(watched.final, '--follow would exit');
  const { events } = await f.core.state();
  assert.ok(!events.some(item => item.type === 'OBSERVATION'), 'no activity record for a refusal');
});

test('R6: a journal job whose header write failed is listed with its journal start time in the newest launch', async t => {
  const f = await prepared(t, 'full');
  streamingAdapters(f);
  await f.request('review.execute', {}, 'round-1');
  const name = (await progressFiles(f.home)).find(item => item.endsWith('.codex.jsonl'));
  await writeFile(join(f.home, PROGRESS, name), '');
  const watched = await reviewProgress(f.core);
  assert.equal(watched.attempts.length, 2, 'both reviewers of the pair');
  const codex = watched.attempts.find(row => row.provider === 'codex');
  assert.equal(codex.state, 'progress unavailable');
  assert.ok(Number.isFinite(Date.parse(codex.startedAt)), 'start time from the journal');
  assert.equal(codex.model, 'fixture', 'model from the journal job input');
});

test('R6: review.progress writes nothing', async t => {
  const f = await prepared(t, 'full');
  streamingAdapters(f);
  await f.request('review.execute', {}, 'round-1');
  const before = JSON.stringify(await treeText(join(f.home, '.gatereeve-current')));
  await reviewProgress(f.core);
  await readCurrent(f.context, 'events', null, f.core.runtime);
  assert.equal(JSON.stringify(await treeText(join(f.home, '.gatereeve-current'))), before);
});

test('R6: gatereeve review watch prints one snapshot, or redraws every 2 seconds until every attempt is final', async () => {
  const { watchReviews, WATCH_INTERVAL_MS, progressLines } = await import('../../cli/src/commands/current.js');
  assert.equal(WATCH_INTERVAL_MS, 2000);
  const row = state => ({ job: 'abcdef0123456789', provider: 'codex', model: 'gpt-test', elapsedMs: 65_000, filesRead: 3, filesReadBasis: 'commands', tokens: { input: 10, output: 2 }, activity: 'run: rg x', state });
  const snapshots = [{ attempts: [row('running')], final: false }, { attempts: [row('finished, validating')], final: false }, { attempts: [row('done: PASS')], final: true }];
  const make = () => { let i = 0; const calls = [];
    return { calls, request: async request => { calls.push(request); return { ok: true, data: snapshots[Math.min(i++, snapshots.length - 1)] }; } }; };
  // One snapshot.
  let fake = make(), out = [], sleeps = [];
  await watchReviews({ cwd: process.cwd() }, { request: fake.request, write: line => out.push(line), sleep: async ms => { sleeps.push(ms); }, clear: () => {} });
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].operation, 'review.progress');
  assert.deepEqual(out, ['codex gpt-test | job abcdef012345 | 1m05s | 3 commands | 10 in / 2 out tokens | last: run: rg x | running']);
  // --follow: redraws until final, waiting the rest of each 2-second interval.
  fake = make(); out = []; sleeps = [];
  const data = await watchReviews({ cwd: process.cwd(), follow: true, job: 'abc' }, { request: fake.request, write: line => out.push(line), sleep: async ms => { sleeps.push(ms); }, clear: () => {} });
  assert.equal(fake.calls.length, 3);
  assert.deepEqual(fake.calls[0].input, { job: 'abc' });
  assert.equal(sleeps.length, 2);
  for (const ms of sleeps) assert.ok(ms >= 1500 && ms <= 2000, `waits within 0.5 s of 2 s (${ms})`);
  assert.equal(data.final, true);
  assert.ok(out.at(-1).endsWith('done: PASS'));
  // --json --follow prints one JSON document per redraw.
  fake = make(); out = [];
  await watchReviews({ cwd: process.cwd(), follow: true, json: true }, { request: fake.request, write: line => out.push(line), sleep: async () => {}, clear: () => {} });
  assert.deepEqual(out.map(line => JSON.parse(line).final), [false, false, true]);
  assert.deepEqual(progressLines({ attempts: [] }), ['No review attempts recorded.']);
  // A refused request is reported and ends the watch.
  await assert.rejects(watchReviews({ cwd: process.cwd(), json: true }, { request: async () => ({ ok: false, error: { code: 'CONTRACT_INVALID', message: 'No review attempt has ID x' } }), write: () => {} }), /No review attempt has ID x/);
});

test('R4: gatereeve read activity rebuilds a review through the CLI', async t => {
  const { spawnSync } = await import('node:child_process');
  const f = await prepared(t, 'full');
  const seen = streamingAdapters(f);
  const { event } = await f.request('gate.execute', reviewJob({ provider: 'codex', model: 'fixture' }), 'cli-read');
  const [ref] = event.payload.results;
  // The fixture's workspace, as a configuration the CLI resolves from --cwd.
  await writeFile(join(f.root, '.agentic-workflow.json'), JSON.stringify({ schemaVersion: 1, featureId: 'feature',
    repositories: { app: { path: 'app', remote: 'origin', featureBaseSha: f.base, integrationBranch: f.integration, releaseBranch: f.release } } }));
  const cli = join(process.cwd(), 'cli/bin/workflow.js');
  const run = spawnSync(process.execPath, [cli, 'read', 'activity', ref.hash, '--cwd', f.root, '--json'], { encoding: 'utf8', env: { ...process.env, GATEREEVE_METRICS: 'off' } });
  const result = JSON.parse(run.stdout);
  assert.equal(result.ok, true, run.stdout + run.stderr);
  assert.equal(result.data.data.stream, seen.streams.codex);
  assert.equal(result.data.data.prompt, seen.prompts.codex);
  const missing = spawnSync(process.execPath, [cli, 'read', 'activity', `sha256:${'1'.repeat(64)}`, '--cwd', f.root, '--json'], { encoding: 'utf8', env: { ...process.env, GATEREEVE_METRICS: 'off' } });
  assert.match(JSON.parse(missing.stdout).error.message, /Unknown review record/);
});
