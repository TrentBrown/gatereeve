import './helpers/private-scratch.js';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, chmod, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  IDLE_INHIBITOR_WHY_LIMIT, MAX_ARGUMENT_BYTES, idleInhibitedLaunch, idleInhibitorWhy, runAgentProcess, systemIdleInhibitor,
} from '../../plugin-src/shared/resources/protocol/local-agent-adapters.js';
import { createCodexAgentAdapter, validateAgentWorkflowReceipt } from '../../plugin-src/shared/resources/protocol/index.js';

const fake = ({ platform = 'linux', path = '/usr/bin/systemd-inhibit', grant = true } = {}) => {
  const probes = [];
  return { probes, platform: () => platform, resolve: () => path, probe: async (wrapper, why) => { probes.push({ wrapper, why }); return grant; } };
};
const why = 'codex boundary review: tb-feature';

test('the idle-inhibitor reason is short, single-line and names provider, role and feature', () => {
  assert.equal(idleInhibitorWhy({ provider: 'codex', stage: 'review', feature: 'tb-feature' }), why);
  assert.equal(idleInhibitorWhy({ provider: 'claude-code', stage: 'planning-review', feature: 'tb-x' }), 'claude-code planning review: tb-x');
  const long = idleInhibitorWhy({ provider: 'codex', stage: 'review', feature: `a\nb\u0007${'x'.repeat(500)}` });
  assert.ok(long.length <= IDLE_INHIBITOR_WHY_LIMIT);
  assert.doesNotMatch(long, /[\u0000-\u001f\u007f]/u);
});

test('Linux with a granted lock wraps the exact reviewer command in systemd-inhibit', async () => {
  const inhibitor = fake();
  const launch = await idleInhibitedLaunch('codex', ['exec', '--json', '-'], { why }, inhibitor);
  assert.deepEqual(launch, { executable: '/usr/bin/systemd-inhibit', idleInhibitor: true,
    args: ['--what=idle', '--mode=block', '--who=GateReeve', `--why=${why}`, 'codex', 'exec', '--json', '-'] });
  assert.deepEqual(inhibitor.probes, [{ wrapper: '/usr/bin/systemd-inhibit', why }]);
});

test('without systemd-inhibit, off Linux, or when the lock is refused, the command is unchanged', async () => {
  const unchanged = { executable: 'codex', args: ['exec', '-'], idleInhibitor: false };
  assert.deepEqual(await idleInhibitedLaunch('codex', ['exec', '-'], { why }, fake({ path: null })), unchanged);
  assert.deepEqual(await idleInhibitedLaunch('codex', ['exec', '-'], { why }, fake({ platform: 'darwin' })), unchanged);
  assert.deepEqual(await idleInhibitedLaunch('codex', ['exec', '-'], { why }, fake({ grant: false })), unchanged);
  assert.deepEqual(await idleInhibitedLaunch('codex', ['exec', '-'], null, fake()), unchanged);
});

async function scripts(t) {
  const dir = await mkdtemp(join(tmpdir(), 'gatereeve-idle-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  // A stand-in wrapper with systemd-inhibit's contract: drop its options, run the command.
  const wrapper = join(dir, 'systemd-inhibit');
  await writeFile(wrapper, '#!/bin/sh\nwhile [ "${1#--}" != "$1" ]; do shift; done\nexec "$@"\n');
  const reviewer = join(dir, 'reviewer');
  await writeFile(reviewer, `#!/bin/sh\necho $$ > "${join(dir, 'pid')}"\nread line\necho "got:$line"\n[ "$line" = sleep ] && exec sleep 30\nexit 7\n`);
  await chmod(wrapper, 0o755); await chmod(reviewer, 0o755);
  return { dir, wrapper, reviewer, inhibitor: { platform: () => 'linux', resolve: () => wrapper, probe: async () => true } };
}

test('a wrapped reviewer receives stdin and reports its own exit code and the inhibitor', async t => {
  const { reviewer, inhibitor } = await scripts(t);
  await assert.rejects(runAgentProcess(reviewer, [], { input: 'hello\n', timeoutSeconds: 10, idleLock: { why }, inhibitor }),
    error => error.providerFailure?.exitCode === 7);
  const { inhibitor: ok, dir } = await scripts(t);
  const passing = join(dir, 'ok');
  await writeFile(passing, '#!/bin/sh\nread line\necho "got:$line"\n'); await chmod(passing, 0o755);
  const result = await runAgentProcess(passing, [], { input: 'hello\n', timeoutSeconds: 10, idleLock: { why }, inhibitor: ok });
  assert.equal(result.stdout, 'got:hello\n');
  assert.equal(result.idleInhibitor, true);
  const plain = await runAgentProcess(passing, [], { input: 'plain\n', timeoutSeconds: 10 });
  assert.equal(plain.idleInhibitor, false);
});

test('the argument-size guard applies to the wrapped command', async t => {
  const { reviewer, inhibitor } = await scripts(t);
  await assert.rejects(runAgentProcess(reviewer, ['x'.repeat(MAX_ARGUMENT_BYTES)], { input: '', timeoutSeconds: 5, idleLock: { why }, inhibitor }),
    /per-argument limit/u);
});

// A killed process whose new parent never reaps it (PID 1 in many containers)
// stays a zombie: it has ended, but signal 0 still reaches it.
const alive = pid => {
  try { process.kill(pid, 0); } catch { return false; }
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3) !== 'Z';
  } catch { return process.platform === 'linux' ? false : true; }
};

test('a timeout terminates the wrapped reviewer process itself', async t => {
  const { dir, reviewer, inhibitor } = await scripts(t);
  await assert.rejects(runAgentProcess(reviewer, [], { input: 'sleep\n', timeoutSeconds: 1, idleLock: { why }, inhibitor }),
    error => error.code === 'AGENT_PROVIDER_TIMEOUT');
  const pid = Number((await readFile(join(dir, 'pid'), 'utf8')).trim());
  assert.equal(alive(pid), false);
});

// Live checks need a lock this host actually grants: a container can have
// systemd-inhibit installed without a reachable system bus.
const realWrapper = process.platform === 'linux' && systemIdleInhibitor.resolve();
const realInhibitor = Boolean(realWrapper) && await systemIdleInhibitor.probe(realWrapper, 'codex boundary review: probe');
test('on this Linux host the real lock is listed while a reviewer runs and released after it', { skip: !realInhibitor && 'systemd-inhibit unavailable or the lock is refused' }, async t => {
  const { dir } = await scripts(t);
  const slow = join(dir, 'slow');
  await writeFile(slow, '#!/bin/sh\nread line\nsleep 2\necho done\n'); await chmod(slow, 0o755);
  const marker = `codex boundary review: idle-test-${process.pid}`;
  const running = runAgentProcess(slow, [], { input: 'x\n', timeoutSeconds: 20, idleLock: { why: marker } });
  await new Promise(resolve => setTimeout(resolve, 1000));
  const listed = execFileSync('systemd-inhibit', ['--list', '--no-pager'], { encoding: 'utf8' });
  const result = await running;
  if (!result.idleInhibitor) return t.skip('lock refused on this host; unwrapped fallback used');
  assert.match(listed, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.match(listed, /GateReeve.*idle.*block|GateReeve[\s\S]*block/u);
  assert.doesNotMatch(execFileSync('systemd-inhibit', ['--list', '--no-pager'], { encoding: 'utf8' }), new RegExp(`idle-test-${process.pid}`, 'u'));
});

test('the reviewer receipt records whether an idle inhibitor was held', async () => {
  for (const held of [true, false]) {
    const adapter = createCodexAgentAdapter({ model: 'gpt-test', runner: async (executable, args, options) => {
      assert.match(options.idleLock.why, /^codex boundary review: tb-feature$/u);
      await writeFile(args[args.indexOf('--output-last-message') + 1], '{"verdict":"PASS"}\n');
      return { code: 0, signal: null, idleInhibitor: held, stdout: '{"type":"thread.started","thread_id":"t-1"}\n', stderr: '', startedAt: new Date(), completedAt: new Date() };
    } });
    const result = await adapter.runStage({
      schemaVersion: 1, protocolVersion: '2.1.0', runId: 'run-1', featureId: 'tb-feature', attemptId: 'attempt-1',
      module: { id: 'example/review', version: '1.0.0', digest: `sha256:${'a'.repeat(64)}` }, stage: { id: 'review', role: 'Reviewer' },
      instructions: 'Review.', input: {}, snapshotDigest: `sha256:${'b'.repeat(64)}`, repositoryPath: '/repository',
      outputSchema: { type: 'object' }, policy: { repositoryAccess: 'read-only', networkAccess: 'deny', scratch: 'isolated' },
      capabilityProfile: { id: 'high-capability-v1', minimumReasoning: 'high' }, timeoutSeconds: 300,
    });
    assert.equal(result.receipt.isolation.idleInhibitor, held);
    validateAgentWorkflowReceipt(result.receipt);
  }
});

test('on this Linux host a timeout through the real systemd-inhibit terminates the reviewer', { skip: !realInhibitor && 'systemd-inhibit unavailable or the lock is refused' }, async t => {
  const { dir, reviewer } = await scripts(t);
  await assert.rejects(runAgentProcess(reviewer, [], { input: 'sleep\n', timeoutSeconds: 1, idleLock: { why: `codex boundary review: timeout-${process.pid}` } }),
    error => error.code === 'AGENT_PROVIDER_TIMEOUT');
  const pid = Number((await readFile(join(dir, 'pid'), 'utf8')).trim());
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(alive(pid), false);
});

// A reviewer that ignores SIGTERM, behind a wrapper that is a separate process
// (as systemd-inhibit is): the forced kill must still reach the reviewer.
async function stubborn(t) {
  const base = await scripts(t);
  const reviewer = join(base.dir, 'stubborn');
  await writeFile(reviewer, `#!/bin/sh\ntrap '' TERM\necho $$ > "${join(base.dir, 'pid')}"\nread line\nwhile :; do sleep 1; done\n`);
  const wrapper = join(base.dir, 'forwarding-inhibit');
  await writeFile(wrapper, '#!/bin/sh\nwhile [ "${1#--}" != "$1" ]; do shift; done\n"$@" &\nchild=$!\ntrap \'kill -TERM $child; exit 143\' TERM\nwait $child\n');
  await chmod(reviewer, 0o755); await chmod(wrapper, 0o755);
  return { ...base, reviewer, inhibitor: { platform: () => 'linux', resolve: () => wrapper, probe: async () => true } };
}
const pidOf = async dir => Number((await readFile(join(dir, 'pid'), 'utf8')).trim());

test('a timeout kills a reviewer that ignores SIGTERM behind a separate wrapper process', async t => {
  const { dir, reviewer, inhibitor } = await stubborn(t);
  const started = Date.now();
  await assert.rejects(runAgentProcess(reviewer, [], { input: 'x\n', timeoutSeconds: 1, idleLock: { why }, inhibitor }),
    error => error.code === 'AGENT_PROVIDER_TIMEOUT');
  assert.ok(Date.now() - started < 8000, 'the forced kill ends the run without waiting for the reviewer');
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(alive(await pidOf(dir)), false);
});

test('on this Linux host a timeout through the real systemd-inhibit kills a reviewer that ignores SIGTERM', { skip: !realInhibitor && 'systemd-inhibit unavailable or the lock is refused' }, async t => {
  const { dir, reviewer } = await stubborn(t);
  const started = Date.now();
  await assert.rejects(runAgentProcess(reviewer, [], { input: 'x\n', timeoutSeconds: 1, idleLock: { why: `codex boundary review: stubborn-${process.pid}` } }),
    error => error.code === 'AGENT_PROVIDER_TIMEOUT');
  assert.ok(Date.now() - started < 8000);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(alive(await pidOf(dir)), false);
});

// Interrupting the evaluator (Ctrl+C reaches the terminal's foreground process
// group) must end the reviewer and release the lock, as it did before wrapping.
async function interruptEvaluator(t, { inhibitorPath = null, marker }) {
  const { dir } = await scripts(t);
  const reviewer = join(dir, 'waiting');
  await writeFile(reviewer, `#!/bin/sh\necho $$ > "${join(dir, 'pid')}"\nexec sleep 30\n`); await chmod(reviewer, 0o755);
  const evaluator = join(dir, 'evaluator.mjs');
  const adapters = new URL('../../plugin-src/shared/resources/protocol/local-agent-adapters.js', import.meta.url).href;
  await writeFile(evaluator, `import { runAgentProcess } from ${JSON.stringify(adapters)};
const path = ${JSON.stringify(inhibitorPath)};
const inhibitor = path ? { platform: () => 'linux', resolve: () => path, probe: async () => true } : undefined;
await runAgentProcess(${JSON.stringify(reviewer)}, [], { input: '', timeoutSeconds: 60, idleLock: { why: ${JSON.stringify(marker)} }, ...(inhibitor ? { inhibitor } : {}) });
`);
  const group = spawn(process.execPath, [evaluator], { detached: true, stdio: 'ignore' });
  const exited = new Promise(resolve => group.once('exit', (code, signal) => resolve(signal)));
  let pid = NaN;
  for (let i = 0; i < 100 && Number.isNaN(pid); i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    pid = Number((await readFile(join(dir, 'pid'), 'utf8').catch(() => '')).trim() || NaN);
  }
  assert.ok(alive(pid), 'the reviewer started');
  process.kill(-group.pid, 'SIGINT');
  assert.equal(await exited, 'SIGINT');
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(alive(pid), false, 'the interrupt reached the reviewer');
  return dir;
}

test('interrupting the evaluator ends a reviewer behind a separate wrapper process', async t => {
  const base = await scripts(t);
  const wrapper = join(base.dir, 'forwarding-inhibit');
  await writeFile(wrapper, '#!/bin/sh\nwhile [ "${1#--}" != "$1" ]; do shift; done\n"$@"\n'); await chmod(wrapper, 0o755);
  await interruptEvaluator(t, { inhibitorPath: wrapper, marker: why });
});

test('on this Linux host interrupting the evaluator ends the reviewer and releases the real lock', { skip: !realInhibitor && 'systemd-inhibit unavailable or the lock is refused' }, async t => {
  const marker = `codex boundary review: interrupt-${process.pid}`;
  await interruptEvaluator(t, { marker });
  assert.doesNotMatch(execFileSync('systemd-inhibit', ['--list', '--no-pager'], { encoding: 'utf8' }), new RegExp(`interrupt-${process.pid}`, 'u'));
});

test('a timeout still kills a wrapped reviewer that closes its streams on SIGTERM and then hangs', async t => {
  const base = await scripts(t);
  const reviewer = join(base.dir, 'closing');
  // On SIGTERM: drop stdout/stderr (so the wrapper's pipes close), ignore further TERMs, keep running.
  await writeFile(reviewer, `#!/bin/sh\necho $$ > "${join(base.dir, 'pid')}"\ntrap 'trap "" TERM; exec >/dev/null 2>&1' TERM\nread line\nwhile :; do sleep 0.2; done\n`);
  const wrapper = join(base.dir, 'exiting-inhibit');
  await writeFile(wrapper, '#!/bin/sh\nwhile [ "${1#--}" != "$1" ]; do shift; done\n"$@" &\nchild=$!\ntrap \'kill -TERM $child; exit 143\' TERM\nwait $child\n');
  await chmod(reviewer, 0o755); await chmod(wrapper, 0o755);
  const inhibitor = { platform: () => 'linux', resolve: () => wrapper, probe: async () => true };
  await assert.rejects(runAgentProcess(reviewer, [], { input: 'x\n', timeoutSeconds: 1, idleLock: { why }, inhibitor }),
    error => error.code === 'AGENT_PROVIDER_TIMEOUT');
  const pid = await pidOf(base.dir);
  await new Promise(resolve => setTimeout(resolve, 2500));
  assert.equal(alive(pid), false, 'the forced kill outlives the wrapper close');
});

// Issue #140: behind a wrapper, launch is reported only once the reviewer runs.
test('behind an idle-inhibitor wrapper, spawn is reported for the reviewer, never for the wrapper alone', async t => {
  const base = await scripts(t);
  const forwarding = join(base.dir, 'forwarding-inhibit');
  await writeFile(forwarding, '#!/bin/sh\nwhile [ "${1#--}" != "$1" ]; do shift; done\n"$@"\n'); await chmod(forwarding, 0o755);
  const slow = join(base.dir, 'slow-reviewer');
  await writeFile(slow, '#!/bin/sh\nread line\nsleep 0.5\necho "ran:$line"\n'); await chmod(slow, 0o755);
  let spawned = 0;
  const result = await runAgentProcess(slow, [], { input: 'x\n', timeoutSeconds: 10, idleLock: { why },
    inhibitor: { platform: () => 'linux', resolve: () => forwarding, probe: async () => true }, onSpawn: async () => { spawned++; } });
  assert.equal(result.stdout.trim(), 'ran:x');
  assert.equal(spawned, 1, 'The reviewer behind the wrapper was reported once');
  const refusing = join(base.dir, 'refusing-inhibit');
  await writeFile(refusing, '#!/bin/sh\necho "Failed to inhibit: access denied" >&2\nexit 1\n'); await chmod(refusing, 0o755);
  let wrapperOnly = 0;
  await assert.rejects(runAgentProcess(slow, [], { input: 'x\n', timeoutSeconds: 10, idleLock: { why },
    inhibitor: { platform: () => 'linux', resolve: () => refusing, probe: async () => true }, onSpawn: async () => { wrapperOnly++; } }));
  assert.equal(wrapperOnly, 0, 'A wrapper that never starts the reviewer is not a launch');
  // A reviewer that fails at once behind the wrapper still launched.
  const instant = join(base.dir, 'instant-reviewer');
  await writeFile(instant, '#!/bin/sh\necho "unknown flag" >&2\nexit 3\n'); await chmod(instant, 0o755);
  let fast = 0;
  await assert.rejects(runAgentProcess(instant, [], { input: '', timeoutSeconds: 10, idleLock: { why },
    inhibitor: { platform: () => 'linux', resolve: () => forwarding, probe: async () => true }, onSpawn: async () => { fast++; } }),
  error => error.providerFailure?.exitCode === 3);
  assert.equal(fast, 1, 'An instantly failing reviewer behind the wrapper is reported as launched');
  // A missing reviewer executable behind the wrapper never launched.
  let missing = 0;
  await assert.rejects(runAgentProcess(join(base.dir, 'no-such-reviewer'), [], { input: '', timeoutSeconds: 10, idleLock: { why },
    inhibitor: { platform: () => 'linux', resolve: () => forwarding, probe: async () => true }, onSpawn: async () => { missing++; } }),
  error => error.providerFailure?.exitCode === 127);
  assert.equal(missing, 0);
  // The launch marker never reaches the retained diagnostics.
  const noisy = join(base.dir, 'noisy-reviewer');
  await writeFile(noisy, '#!/bin/sh\nread line\necho "warning: $line" >&2\necho ok\n'); await chmod(noisy, 0o755);
  const quiet = await runAgentProcess(noisy, [], { input: 'x\n', timeoutSeconds: 10, idleLock: { why },
    inhibitor: { platform: () => 'linux', resolve: () => forwarding, probe: async () => true }, onSpawn: async () => {} });
  assert.equal(quiet.stderr, 'warning: x\n');
});
test('a failing spawn report surfaces as the run error and is never an unhandled rejection', async () => {
  const unhandled = [];
  const listener = reason => unhandled.push(reason);
  process.on('unhandledRejection', listener);
  try {
    await assert.rejects(runAgentProcess(process.execPath, ['-e', 'setTimeout(() => {}, 300)'], { input: '', timeoutSeconds: 10,
      onSpawn: async () => { throw new Error('Round count append failed'); } }), /Round count append failed/);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.deepEqual(unhandled, []);
  } finally { process.off('unhandledRejection', listener); }
});
