import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const execute = promisify(execFile);

// Test-only parallelism: each case belongs to exactly one fresh process. Keep
// ordinary name-filtered invocations native so focused regression runs work.
export function isolatedTests(url, { shards = 4 } = {}) {
  if (process.execArgv.some(arg => /^--test-(?:name-pattern|skip-pattern|only)(?:=|$)/u.test(arg))) return test;
  assert.ok(Number.isSafeInteger(shards) && shards > 0);
  const path = fileURLToPath(url), selection = process.env.GATEREEVE_TEST_SHARD;
  let registered = 0;
  if (selection) {
    const choice = JSON.parse(selection);
    assert.ok(choice.path === path && choice.shards === shards && Number.isInteger(choice.index)
      && choice.index >= 0 && choice.index < shards, 'Invalid isolated test shard');
    return (...args) => { if (registered++ % shards === choice.index) return test(...args); };
  }
  test('core fixtures in isolated process groups', async t => {
    const outcomes = await Promise.allSettled(Array.from({ length: shards }, async (_, index) => {
      const env = { ...process.env, GATEREEVE_TEST_SHARD: JSON.stringify({ path, index, shards }) };
      delete env.NODE_TEST_CONTEXT;
      try {
        const result = await execute(process.execPath, ['--test', '--test-reporter=tap', path], { env, signal: t.signal, maxBuffer: 16 * 1024 * 1024 });
        return { index, ...result };
      } catch (error) {
        process.stdout.write(error.stdout ?? ''); process.stderr.write(error.stderr ?? ''); throw error;
      }
    }));
    for (const outcome of outcomes) if (outcome.status === 'fulfilled') {
      const { index, stdout, stderr } = outcome.value;
      process.stdout.write(`\nShard ${index + 1}/${shards}\n${stdout}`); process.stderr.write(stderr);
      assert.equal(Number(/^# tests (\d+)$/mu.exec(stdout)?.[1]), Math.max(0, Math.ceil((registered - index) / shards)), 'Shard must report every assigned case');
    }
    const failed = outcomes.filter(item => item.status === 'rejected');
    if (failed.length) throw new AggregateError(failed.map(item => item.reason), 'Isolated test groups failed');
    process.stdout.write(`Registered ${registered} cases across ${shards} disjoint groups.\n`);
  });
  return () => { registered++; };
}
