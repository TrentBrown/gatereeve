import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, chmod, readFile } from 'node:fs/promises';
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

const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('a timeout terminates the wrapped reviewer process itself', async t => {
  const { dir, reviewer, inhibitor } = await scripts(t);
  await assert.rejects(runAgentProcess(reviewer, [], { input: 'sleep\n', timeoutSeconds: 1, idleLock: { why }, inhibitor }),
    error => error.code === 'AGENT_PROVIDER_TIMEOUT');
  const pid = Number((await readFile(join(dir, 'pid'), 'utf8')).trim());
  assert.equal(alive(pid), false);
});

const realInhibitor = process.platform === 'linux' && systemIdleInhibitor.resolve();
test('on this Linux host the real lock is listed while a reviewer runs and released after it', { skip: !realInhibitor && 'systemd-inhibit unavailable' }, async t => {
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

test('on this Linux host a timeout through the real systemd-inhibit terminates the reviewer', { skip: !realInhibitor && 'systemd-inhibit unavailable' }, async t => {
  const { dir, reviewer } = await scripts(t);
  await assert.rejects(runAgentProcess(reviewer, [], { input: 'sleep\n', timeoutSeconds: 1, idleLock: { why: `codex boundary review: timeout-${process.pid}` } }),
    error => error.code === 'AGENT_PROVIDER_TIMEOUT');
  const pid = Number((await readFile(join(dir, 'pid'), 'utf8')).trim());
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(alive(pid), false);
});
