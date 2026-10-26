import assert from 'node:assert/strict';
import test from 'node:test';
import { runCheckProcess } from '../../plugin-src/shared/resources/protocol/current/execution.js';

const check = script => ({ command: process.execPath, args: ['-e', script] });
test('effective timeout is visible, per-check overrides runner limit, and zero disables it', async () => {
  const normal = await runCheckProcess(check(''), {}, process.cwd(), process.env);
  assert.equal(normal.outcome, 'PASS'); assert.equal(normal.timeoutMs, 600000);
  const override = await runCheckProcess({ ...check('setTimeout(()=>{},50)'), timeoutMs: 2000 }, { timeoutMs: 1 }, process.cwd(), process.env);
  assert.equal(override.outcome, 'PASS'); assert.equal(override.timeoutMs, 2000);
  const disabled = await runCheckProcess({ ...check('setTimeout(()=>{},50)'), timeoutMs: 0 }, { timeoutMs: 1 }, process.cwd(), process.env);
  assert.equal(disabled.outcome, 'PASS'); assert.equal(disabled.timeoutMs, 0);
});
test('actual timeout is distinguished from a nonzero exit and a failed launch', async () => {
  const timed = await runCheckProcess(check('setInterval(()=>{},1000)'), { timeoutMs: 100 }, process.cwd(), process.env);
  assert.equal(timed.outcome, 'UNAVAILABLE'); assert.equal(timed.exitCode, null);
  assert.deepEqual(timed.termination, { kind: 'timeout', reason: 'Timed out after 100 ms', timeoutMs: 100 });
  const failed = await runCheckProcess(check('process.exit(7)'), {}, process.cwd(), process.env);
  assert.equal(failed.outcome, 'FAIL'); assert.equal(failed.exitCode, 7); assert.equal(failed.termination.kind, 'exit');
  const missing = await runCheckProcess({ command: '/nonexistent/gatereeve-runner-test', args: [] }, {}, process.cwd(), process.env);
  assert.equal(missing.outcome, 'UNAVAILABLE'); assert.equal(missing.termination.kind, 'process-error');
  assert.equal(missing.termination.code, 'ENOENT');
});
for (const timeoutMs of [-1, 1.5, '100', 2147483648]) test(`invalid timeout rejects: ${timeoutMs}`, async () => {
  await assert.rejects(runCheckProcess({ ...check(''), timeoutMs }, {}, process.cwd(), process.env), /timeoutMs must be an integer/);
});
