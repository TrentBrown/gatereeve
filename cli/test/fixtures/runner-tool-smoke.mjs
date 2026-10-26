// Preserve the explicit smoke entrypoint without treating missing external tools
// as a test failure when Node discovers every file beneath test/.
import test from 'node:test';
if (process.env.NODE_TEST_CONTEXT && process.argv.length === 2) {
  test('real-tool smoke requires explicitly pinned pnpm and Vitest', {
    skip: 'Run cli/scripts/runner-tool-smoke.mjs with both external tool paths',
  }, () => {});
} else {
  await import('../../scripts/runner-tool-smoke.mjs');
}
