// Explicit real-tool smoke, invoked with pinned external pnpm and Vitest paths.
// It mutates only its own disposable workspace; no application checkout is used.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { withScratch, scratchEnvironment } from '../../plugin-src/shared/resources/storage/scratch.js';
import { join } from 'node:path';
import { executionEnvironment, assertEnvironmentCurrent } from '../../plugin-src/shared/resources/protocol/current/environment.js';

const [pnpm, vitest] = process.argv.slice(2);
assert.ok(pnpm && vitest, 'Supply pinned pnpm executable and Vitest entrypoint');
const exec = promisify(execFile);
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
await withScratch({ purpose: 'runner-tool-smoke' }, async scratch => {
  const root = scratch.path;
  await mkdir(join(root, 'node_modules'));
  await mkdir(join(root, 'app/node_modules'), { recursive: true });
  await writeFile(join(root, 'pnpm-workspace.yaml'), "packages:\n  - app\n");
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'runner-workspace-smoke', private: true }));
  await writeFile(join(root, 'app/package.json'), JSON.stringify({ name: 'runner-bookkeeping-smoke', private: true,
    scripts: { test: `${quote(process.execPath)} ${quote(vitest)} run --globals --root .` } }));
  await writeFile(join(root, 'app/sum.test.js'), "test('real Vitest assertion', () => expect(1 + 1).toBe(2));\n");
  const environment = await scratchEnvironment(scratch); delete environment.CI;
  const run = () => exec(pnpm, ['--filter', 'runner-bookkeeping-smoke', 'test'], { cwd: root, env: environment, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  await run(); // Establish semantic install/workspace records and compiled caches.
  const context = { repositories: [{ alias: 'fixture', path: root }] }, candidate = { repositories: [{ alias: 'fixture' }] };
  const configuration = { checks: [], externalRuntimeInputs: { fixture: [] } };
  const before = await executionEnvironment(context, candidate, configuration, true, environment);
  const result = await run();
  const after = await executionEnvironment(context, candidate, configuration, true, environment);
  assertEnvironmentCurrent(before, after);
  const files = await readdir(root, { recursive: true });
  assert.ok(files.some(path => /^app\/node_modules\/\.vite\/vitest\/[a-f0-9]{40}\/results\.json$/u.test(path)), 'Real Vitest results cache was produced');
  assert.ok(files.some(path => path.startsWith('node_modules/.pnpm-task-run-state-v1/')), 'Real pnpm task state was produced');
  console.log(JSON.stringify({ outcome: 'PASS', policy: after.fingerprintPolicy.id,
    pnpmVersion: (await exec(pnpm, ['--version'])).stdout.trim(), generatedState: files.filter(path => /results\.json$|\.finished$|latest\.json$/u.test(path)),
    testOutput: result.stdout.trim() }));
});
