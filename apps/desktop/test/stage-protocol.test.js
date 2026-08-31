import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(desktopRoot, '../..');

test('Desktop stages the exact canonical protocol without a CLI runtime dependency', async () => {
  const manifest = JSON.parse(await readFile(
    resolve(desktopRoot, 'resources/desktop-projection.json'),
    'utf8',
  ));
  assert.equal(manifest.canonicalSource, 'plugin-src/shared/resources/protocol');
  assert.ok(manifest.files.length > 10);
  for (const entry of manifest.files) {
    const canonical = await readFile(resolve(
      repositoryRoot,
      'plugin-src/shared/resources/protocol',
      entry.path,
    ));
    const staged = await readFile(resolve(desktopRoot, 'resources/protocol', entry.path));
    assert.deepEqual(staged, canonical, entry.path);
  }
  const packageJson = JSON.parse(await readFile(resolve(desktopRoot, 'package.json'), 'utf8'));
  assert.deepEqual(packageJson.dependencies, {
    '@xterm/addon-fit': '0.11.0',
    '@xterm/xterm': '6.0.0',
    'node-pty': '1.2.0-beta.15',
  });
  assert.equal(Object.keys(packageJson.dependencies).some((name) => /cli|commander/iu.test(name)), false);
  await assert.rejects(access(resolve(desktopRoot, 'resources/scripts')), /ENOENT/);
  const contextSource = await readFile(
    resolve(desktopRoot, 'resources/protocol/context.js'),
    'utf8',
  );
  assert.doesNotMatch(contextSource, /python|workflow_context\.py/iu);
  const runtimeImports = await Promise.all([
    'main/index.js', 'main/protocol-adapter.js', 'preload/index.cjs',
  ].map((path) => readFile(resolve(desktopRoot, path), 'utf8')));
  assert.equal(runtimeImports.some((source) => source.includes('/cli/') || source.includes('qp-cli-core')), false);
});
