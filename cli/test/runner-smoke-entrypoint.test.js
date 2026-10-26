import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const fixture = fileURLToPath(new URL('./fixtures/runner-tool-smoke.mjs', import.meta.url));

test('automatic discovery explicitly skips smoke requiring external tools', () => {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', fixture], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /# skipped 1/);
  assert.match(result.stdout, /SKIP Run cli\/scripts\/runner-tool-smoke/);
});

test('explicit smoke invocation still rejects missing tool arguments', () => {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [fixture], { encoding: 'utf8', env });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Supply pinned pnpm executable and Vitest entrypoint/);
});
