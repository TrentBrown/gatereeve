import './helpers/private-scratch.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  checkReviewOutput, checkReviewVerdicts, findingLedger, reviewSchema, selfValidationContext, selfValidationLaunch,
  NOT_ASSESSED, SELF_VALIDATION_CONTEXT_PATH, VERDICT_SCHEMA,
} from '../../plugin-src/shared/resources/protocol/current/execution.js';
import { MAX_REQUEST_BYTES, TOOL } from '../../plugin-src/shared/resources/protocol/current/verdict-check-server.js';
import { boundaryReviews } from '../../plugin-src/shared/resources/protocol/current/boundary-review.js';
import { sha256Digest } from '../../plugin-src/shared/resources/protocol/agent-workflow.js';
import { prepared, pairedAdapters } from './helpers/paired-review-fixture.js';

// A candidate and verdict shaped like the review execution's (issue #142).
const candidate = { criteria: ['R1'], requirements: { 'spec.md': { hash: 'x' } },
  repositories: [{ alias: 'app', files: [{ path: 'app.js', mode: '100644' }], baseFiles: [{ path: 'app.js', mode: '100644' }], targetFiles: [] }] };
const dimensions = outcome => ['code', 'requirements', 'evidence', 'scope', 'findings'].map(name => ({ name, outcome, evidence: 'Fixture evidence' }));
const verdict = (overrides = {}) => ({ gate: 'review', outcome: 'PASS', summary: 'Fixture review', dimensions: dimensions('PASS'),
  coverage: { complete: true, paths: ['app/app.js'], interactions: ['app/app.js'], limitations: [] },
  findings: [], dispositions: [], criteria: [{ id: 'R1', outcome: 'PASS', evidence: 'app/app.js exports 42' }], historyAssessment: null,
  mandateAssessment: null, coverageDecisions: [], ...overrides });
const blocking = (id, overrides = {}) => ({ id, classId: 'constant', classStatement: 'Fixture defect class', severity: 'high',
  failureScenario: 'Fixture input -> wrong observable output', criterion: 'R1', path: 'app/app.js', evidence: 'The fixture exports 41.', blocking: true, ...overrides });
// An earlier result of the paired reviewer, with its recorded finding provenance.
const raised = (provider, finding) => ({ reviewerResult: { gate: 'review', outcome: 'FAIL', findings: [finding], dispositions: [],
  findingProvenance: [{ id: finding.id, originalId: finding.id.split('/').at(-1), provider, model: 'fixture' }] } });
const context = (overrides = {}) => ({ gates: ['review'], candidate, changes: null, history: [], claims: [], reconsiderClosures: [], replacements: [],
  mandate: false, repair: null, provider: 'codex', model: 'fixture', reviewerSelection: 'sha256:selection', ...overrides });

// What the execution records: its verdicts, or the whole output rejected.
function executed(output, value) {
  try { return { verdicts: checkReviewVerdicts(output.verdicts, value) }; }
  catch (error) { return { error: error.message }; }
}

test('R1: the tool and the execution accept the same verdicts and report the same first error', () => {
  const cases = [
    { name: 'valid PASS', output: { verdicts: [verdict()] } },
    { name: 'missing summary', output: { verdicts: [(({ summary, ...rest }) => rest)(verdict())] } },
    { name: 'PASS with a blocking finding', output: { verdicts: [verdict({ findings: [blocking('B1')] })] } },
    { name: 'criterion not PASS', output: { verdicts: [verdict({ criteria: [{ id: 'R1', outcome: 'FAIL', evidence: 'no' }] })] } },
    { name: 'unknown property', output: { verdicts: [{ ...verdict(), extra: true }] } },
    { name: 'unrequested gate', output: { verdicts: [verdict({ gate: 'code' })] } },
    { name: 'own finding without a disposition', value: context({ history: [raised('codex', blocking('codex/B2'))] }), output: { verdicts: [verdict()] } },
  ];
  for (const item of cases) {
    const value = item.value ?? context();
    const tool = checkReviewOutput(item.output, value);
    const run = executed(item.output, value);
    if (run.error) {
      assert.equal(tool.valid, false, item.name);
      assert.equal(tool.error, run.error, item.name);
      continue;
    }
    assert.equal(tool.verdicts.length, run.verdicts.length, item.name);
    for (const [index, row] of tool.verdicts.entries()) {
      const recorded = run.verdicts[index];
      assert.equal(row.valid, !recorded.invalidVerdictContract, item.name);
      assert.equal(row.error, recorded.invalidVerdictContract ? recorded.summary : null, item.name);
      assert.equal(row.recordedOutcome, recorded.invalidVerdictContract ? null : recorded.outcome, item.name);
      assert.deepEqual(row.corrections, (recorded.normalized ?? []).map(entry => entry.rule), item.name);
    }
  }
  // The recorded outcome and corrections the tool reports.
  const corrected = checkReviewOutput({ verdicts: [verdict({ findings: [blocking('B1')] })] }, context());
  assert.equal(corrected.verdicts[0].recordedOutcome, 'FAIL');
  assert.deepEqual(corrected.verdicts[0].corrections, ['pass-with-blocking-finding']);
  assert.equal(checkReviewOutput({ verdicts: [(({ summary, ...rest }) => rest)(verdict())] }, context()).verdicts[0].error, 'review.summary is required');
  assert.equal(checkReviewOutput({ verdicts: 'none' }, context()).error, 'Invalid verdict envelope: verdicts must be an array');
});

// A small MCP client over the exact launch GateReeve gives an adapter.
async function server(launch, { extraArgs = [] } = {}) {
  const permission = launch.args.slice(0, launch.args.length - 2);
  const child = spawn(launch.command, [...permission, ...extraArgs, ...launch.args.slice(-2)], { env: { ...process.env, ...launch.env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '', stderr = '';
  const waiting = [];
  const lines = [];
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) !== -1) {
      const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
      if (waiting.length) waiting.shift()(message); else lines.push(message);
    }
  });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const next = () => lines.length ? Promise.resolve(lines.shift()) : new Promise(resolve => waiting.push(resolve));
  return {
    child,
    stderr: () => stderr,
    raw: async text => { child.stdin.write(text); return next(); },
    send: async message => { child.stdin.write(`${JSON.stringify(message)}\n`); return next(); },
    notify: message => child.stdin.write(`${JSON.stringify(message)}\n`),
    call: async (id, args) => {
      const reply = await (async () => { child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'validate_verdict', arguments: args } })}\n`); return next(); })();
      return { reply, report: JSON.parse(reply.result.content[0].text) };
    },
    close: () => new Promise(resolve => { child.on('close', resolve); child.stdin.end(); }),
  };
}
async function contextFile(t, value = context()) {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-verdict-check-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'context.json');
  await writeFile(path, JSON.stringify(selfValidationContext(value)));
  return { root, path };
}

test('R2: the server answers MCP requests read-only and keeps answering after bad input', async t => {
  const { root, path } = await contextFile(t);
  const launch = selfValidationLaunch(path);
  const before = await readdir(root);
  const client = await server(launch);
  const init = await client.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.equal(init.result.serverInfo.name, 'gatereeve');
  client.notify({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const listed = await client.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(listed.id, 2, 'A notification gets no response');
  assert.deepEqual(listed.result.tools.map(tool => tool.name), ['validate_verdict']);
  assert.deepEqual(listed.result.tools[0].annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  const valid = await client.call(3, { verdicts: [verdict()] });
  assert.equal(valid.reply.result.isError, false);
  assert.deepEqual(valid.report, { valid: true, error: null, verdicts: [{ gate: 'review', valid: true, error: null, recordedOutcome: 'PASS', corrections: [] }] });
  const invalid = await client.call(4, { verdicts: [verdict({ criteria: [{ id: 'R1', outcome: 'FAIL', evidence: 'no' }] })] });
  assert.equal(invalid.report.verdicts[0].valid, false);
  assert.match(invalid.report.verdicts[0].error, /^Assessment PASS contradicts criterion outcomes: criteria\[0\] \(R1\) is FAIL/u);
  const recorded = await client.call(5, { verdicts: [verdict({ findings: [blocking('B1')] })] });
  assert.equal(recorded.report.verdicts[0].recordedOutcome, 'FAIL');
  const envelope = await client.call(6, { verdict: [] });
  assert.deepEqual(envelope.report, { valid: false, error: 'Invalid verdict envelope: verdicts must be an array', verdicts: [] });
  assert.equal((await client.raw('{not json\n')).error.code, -32700);
  assert.equal((await client.raw(`${'x'.repeat(MAX_REQUEST_BYTES + 10)}\n`)).error.code, -32600);
  assert.equal((await client.send({ jsonrpc: '2.0', id: 7, method: 'resources/list' })).error.code, -32601);
  assert.equal((await client.send({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'other', arguments: {} } })).error.code, -32602);
  // Still answering after every bad input.
  assert.equal((await client.call(9, { verdicts: [verdict()] })).report.valid, true);
  await client.close();
  assert.deepEqual(await readdir(root), before, 'The server wrote nothing beside its context file');
  assert.equal(client.stderr(), '');
});

test('R2: the launch runs under the permission model with read access only', async t => {
  const { path } = await contextFile(t);
  const launch = selfValidationLaunch(path);
  const flags = launch.args.slice(0, launch.args.length - 2);
  assert.equal(flags[0], '--permission');
  assert.ok(flags.slice(1).every(flag => flag.startsWith('--allow-fs-read=')), JSON.stringify(flags));
  assert.ok(flags.some(flag => flag === `--allow-fs-read=${path}`));
  for (const allowance of ['--allow-fs-write', '--allow-child-process', '--allow-worker', '--allow-addons', '--allow-wasi']) {
    assert.ok(!launch.args.some(arg => arg.startsWith(allowance)), allowance);
  }
  assert.deepEqual(launch.env, { GATEREEVE_METRICS: 'off' });
  // A process started with these flags is refused a write and a spawn.
  const probe = spawnSync(launch.command, [...flags, '--input-type=module', '-e', `
    import { writeFileSync } from 'node:fs'; import { spawnSync } from 'node:child_process';
    const code = f => { try { f(); return 'allowed'; } catch (error) { return error.code; } };
    process.stdout.write(JSON.stringify({ write: code(() => writeFileSync(${JSON.stringify(join(tmpdir(), 'gatereeve-denied'))}, 'x')), spawn: code(() => spawnSync('true')) }));
  `], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(probe.stdout), { write: 'ERR_ACCESS_DENIED', spawn: 'ERR_ACCESS_DENIED' }, probe.stderr);
  // Electron's Node mode takes no permission flags; the desktop never runs reviews.
  const electron = selfValidationLaunch(path, { electron: true, execPath: '/Applications/Fixture.app/fixture' });
  assert.deepEqual(electron.args.slice(-2), launch.args.slice(-2));
  assert.equal(electron.args.length, 2);
  assert.deepEqual(electron.env, { GATEREEVE_METRICS: 'off', ELECTRON_RUN_AS_NODE: '1' });
});

test('R2: the server makes no network call while it answers', async t => {
  const { root, path } = await contextFile(t);
  const preload = join(root, 'no-network.mjs');
  await writeFile(preload, `
    import net from 'node:net'; import dgram from 'node:dgram'; import http from 'node:http'; import https from 'node:https'; import dns from 'node:dns'; import tls from 'node:tls';
    const deny = name => function () { process.stderr.write('GATEREEVE-NETWORK-ATTEMPT ' + name + '\\n'); throw new Error('network denied'); };
    for (const [owner, keys, name] of [[net, ['connect', 'createConnection', 'createServer'], 'net'], [net.Socket.prototype, ['connect'], 'socket'], [dgram, ['createSocket'], 'dgram'],
      [http, ['request', 'get', 'createServer'], 'http'], [https, ['request', 'get', 'createServer'], 'https'], [dns, ['lookup', 'resolve'], 'dns'], [tls, ['connect'], 'tls']]) for (const key of keys) owner[key] = deny(name + '.' + key);
    globalThis.fetch = deny('fetch');
  `);
  const client = await server(selfValidationLaunch(path), { extraArgs: [`--allow-fs-read=${preload}`, `--import=${pathToFileURL(preload).href}`] });
  await client.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  await client.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  await client.call(3, { verdicts: [verdict()] });
  await client.call(4, { verdicts: [verdict({ findings: [blocking('B1')] })] });
  await client.close();
  assert.doesNotMatch(client.stderr(), /GATEREEVE-NETWORK-ATTEMPT/u);
});

// Paired fixture adapters that can offer the tool (`selfValidation: true`)
// and record what each reviewer received.
function capableAdapters(f, behave) {
  pairedAdapters(f);
  const seen = [];
  for (const [provider, adapter] of Object.entries(f.core.runtime.evaluators)) {
    const run = adapter.runStage.bind(adapter);
    adapter.selfValidation = true;
    adapter.runStage = async request => {
      const contextPath = join(request.repositoryPath, SELF_VALIDATION_CONTEXT_PATH);
      let contextBytes = null;
      try { contextBytes = await readFile(contextPath, 'utf8'); } catch { /* not offered */ }
      seen.push({ provider, request, contextBytes });
      const result = await run(request);
      if (behave) await behave(provider, request, result);
      result.receipt.isolation.selfValidation = Boolean(request.selfValidation);
      result.receipt.digests.output = sha256Digest(result.output);
      return result;
    };
  }
  return seen;
}

test('R3: only an adapter that declares the capability gets the context file, packet field and launch', async t => {
  const f = await prepared(t, 'full');
  const seen = capableAdapters(f);
  delete f.core.runtime.evaluators['claude-code'].selfValidation;
  const done = await f.request('review.execute', {}, 'capability');
  assert.ok(done.event.payload.outcomes.every(row => row.status === 'completed'), JSON.stringify(done.event.payload.outcomes));
  const codex = seen.find(item => item.provider === 'codex'), claude = seen.find(item => item.provider === 'claude-code');
  assert.deepEqual(codex.request.input.selfValidation, { tool: 'validate_verdict', server: 'gatereeve' });
  assert.equal(codex.request.selfValidation.server, 'gatereeve');
  assert.equal(codex.request.selfValidation.args.at(-1), join(codex.request.repositoryPath, SELF_VALIDATION_CONTEXT_PATH));
  const written = JSON.parse(codex.contextBytes);
  assert.equal(written.contract, 'gatereeve-verdict-check/1');
  assert.deepEqual(written.context.gates, ['review']);
  assert.equal(written.context.provider, 'codex');
  assert.equal(claude.request.input.selfValidation, undefined);
  assert.equal(claude.request.selfValidation, undefined);
  assert.equal(claude.contextBytes, null);
  const results = await Promise.all(done.event.payload.outcomes.map(row => f.core.store.json(row.results[0])));
  assert.deepEqual(results.map(row => row.outcome), ['PASS', 'PASS']);
});

test('R4: a reviewer that self-validates and corrects is recorded in one attempt without a repair turn', async t => {
  const f = await prepared(t, 'full');
  const calls = [];
  const seen = capableAdapters(f, async (provider, request, result) => {
    // First a verdict without its summary; the tool names the field; the
    // reviewer restores it and checks again before returning.
    const good = structuredClone(result.output);
    const broken = structuredClone(good); delete broken.verdicts[0].summary;
    const client = await server(request.selfValidation);
    await client.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    const first = await client.call(2, broken);
    const second = await client.call(3, good);
    await client.close();
    calls.push({ provider, first: first.report, second: second.report });
    assert.equal(first.report.verdicts[0].error, 'review.summary is required');
    assert.equal(second.report.valid, true);
    result.output = good;
  });
  const done = await f.request('review.execute', {}, 'self-validated');
  assert.equal(calls.length, 2);
  assert.equal(seen.length, 2, 'No repair turn was needed');
  for (const row of done.event.payload.outcomes) {
    assert.equal(row.status, 'completed', JSON.stringify(row));
    assert.deepEqual(row.attempts.map(item => item.kind), ['initial']);
    const result = await f.core.store.json(row.results[0]);
    assert.equal(result.outcome, 'PASS');
  }
  const instructions = seen[0].request.instructions;
  assert.match(instructions, /When packet\.selfValidation is present, call its validate_verdict tool/u);
  assert.match(instructions, /Correct only what it reports, call it again, and return a verdict it accepts/u);
  const { state } = await f.core.state();
  assert.equal((await boundaryReviews(f.core, state, await f.core.store.json(state.candidate))).outcome, 'PASS');
});

test('R5: a PASS without a disposition for a peer finding records not-assessed and the finding stays open', () => {
  const peer = blocking('claude-code/P1');
  const history = [raised('claude-code', peer)];
  const [accepted] = checkReviewVerdicts([verdict()], context({ history }));
  assert.equal(accepted.outcome, 'PASS');
  assert.deepEqual(accepted.dispositions.map(row => [row.id, row.status]), [['claude-code/P1', NOT_ASSESSED]]);
  assert.match(accepted.dispositions[0].evidence, /^Recorded by GateReeve/u);
  assert.deepEqual(accepted.normalized.filter(row => row.rule === 'peer-not-assessed'), [{ rule: 'peer-not-assessed', field: 'dispositions', id: 'claude-code/P1' }]);
  // not-assessed closes nothing: the next ledger still requires it.
  const ledger = findingLedger('review', [...history, { reviewerResult: accepted }]);
  assert.ok(ledger.required.has('claude-code/P1'));
  // A claimed peer finding is treated the same way.
  const claimed = checkReviewVerdicts([verdict()], context({ history, claims: [{ findingId: 'claude-code/P1', claim: 'Fixed' }] }))[0];
  assert.equal(claimed.dispositions[0].status, NOT_ASSESSED);
  // Without a reviewer selection or provenance it is not known to be a peer's.
  assert.equal(checkReviewVerdicts([verdict()], context({ history, reviewerSelection: null }))[0].outcome, 'UNAVAILABLE');
  // The reviewer's own finding, a stated wrong status and an open finding
  // carried as unaffected still reach the repair turn.
  const own = checkReviewVerdicts([verdict()], context({ history: [raised('codex', blocking('codex/O1'))] }))[0];
  assert.equal(own.invalidVerdictContract, true);
  assert.match(own.summary, /^Missing supported disposition for codex\/O1/u);
  const wrong = checkReviewVerdicts([verdict({ dispositions: [{ id: 'claude-code/P1', status: 'present', evidence: 'Still there' }] })], context({ history }))[0];
  assert.equal(wrong.outcome, 'FAIL', 'A stated present disposition is the reviewer\'s own conclusion');
  const unaffected = checkReviewVerdicts([verdict({ dispositions: [{ id: 'claude-code/P1', status: 'unaffected', evidence: 'Unrelated' }] })], context({ history }))[0];
  assert.equal(unaffected.invalidVerdictContract, true);
  assert.match(unaffected.summary, /^Open finding claude-code\/P1 cannot be carried as unaffected: dispositions\[0\]/u);
  // Reviewers cannot select not-assessed.
  assert.ok(!VERDICT_SCHEMA.properties.dispositions.items.properties.status.enum.includes(NOT_ASSESSED));
  const schema = reviewSchema(['review'], ['R1']);
  assert.ok(!schema.properties.verdicts.items.anyOf[0].properties.dispositions.items.properties.status.enum.includes(NOT_ASSESSED));
  assert.equal(checkReviewVerdicts([verdict({ dispositions: [{ id: 'claude-code/P1', status: NOT_ASSESSED, evidence: 'x' }] })], context({ history }))[0].invalidVerdictContract, true);
});

test('R5: in a paired round the not-assessed member stays unreconciled for the peer finding', async t => {
  const f = await prepared(t, 'full');
  let round = 0;
  capableAdapters(f, async (provider, request, result) => {
    const verdict_ = result.output.verdicts[0];
    if (round === 1 && provider === 'claude-code') {
      verdict_.outcome = 'FAIL'; verdict_.dimensions.find(row => row.name === 'code').outcome = 'FAIL';
      verdict_.criteria[0].outcome = 'FAIL';
      verdict_.findings = [blocking('peer-1', { criterion: request.input.criteria[0] })];
    }
    // Round 2: the raising reviewer resolves its finding; codex says nothing.
    if (round === 2 && provider === 'claude-code') verdict_.dispositions = request.input.dispositionsRequired.map(row => ({ id: row.id, status: 'resolved', evidence: 'Fixed in current source.' }));
  });
  round = 1;
  const first = await f.request('review.execute', {}, 'peer-round-1');
  const claudeRef = first.event.payload.outcomes.find(row => row.provider === 'claude-code').results[0];
  assert.equal((await f.core.store.json(claudeRef)).findings[0].id, 'claude-code/peer-1');
  round = 2;
  const second = await f.request('review.execute', { history: [claudeRef] }, 'peer-round-2');
  const codexRow = second.event.payload.outcomes.find(row => row.provider === 'codex');
  assert.equal(codexRow.status, 'completed', JSON.stringify(codexRow));
  const codexResult = await f.core.store.json(codexRow.results[0]);
  assert.equal(codexResult.outcome, 'PASS');
  assert.deepEqual(codexResult.dispositions.map(row => [row.id, row.status]), [['claude-code/peer-1', NOT_ASSESSED]]);
  assert.ok(codexResult.normalized.some(row => row.rule === 'peer-not-assessed'));
  const { state } = await f.core.state();
  const pair = await boundaryReviews(f.core, state, await f.core.store.json(state.candidate));
  const member = pair.members.find(item => item.reviewer.provider === 'codex');
  assert.deepEqual(member.unreconciledFindings, ['claude-code/peer-1']);
  assert.notEqual(pair.outcome, 'PASS');
});

test('R9: PROTOCOL.md and the review guidance document the change', async () => {
  const resources = new URL('../../plugin-src/shared/resources/', import.meta.url);
  const protocol = await readFile(new URL('PROTOCOL.md', resources), 'utf8');
  for (const text of ['**Self-validation (issue #142).**', '`validate_verdict`', '`--permission`', 'ELECTRON_RUN_AS_NODE', '`isolation.selfValidation`',
    '| `peer-not-assessed` |', '`not-assessed`', '`transient-retry`', '`durationMs`', '### Complete review packets', 'protocol/DEFINITION-OF-DONE.md',
    '`After merge:`', '`afterMergeCriteria`', 'External links are never\nfetched']) assert.ok(protocol.includes(text), text);
  const guidance = await readFile(new URL('commands/pr-review.md', resources), 'utf8');
  for (const text of ['`not-assessed`', '`validate_verdict`', '`After merge:`']) assert.ok(guidance.includes(text), text);
});
