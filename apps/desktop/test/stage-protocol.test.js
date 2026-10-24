import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(desktopRoot, '../..');

test('Desktop stages the exact protocol and trusted waiver guard without a CLI runtime dependency', async () => {
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
    linkedom: '0.18.12',
    'node-pty': '1.2.0-beta.15',
  });
  assert.equal(Object.keys(packageJson.dependencies).some((name) => /cli|commander/iu.test(name)), false);
  const canonicalScripts = resolve(repositoryRoot, 'plugin-src/shared/resources/scripts');
  const stagedScripts = resolve(desktopRoot, 'resources/scripts');
  const runtimeFiles = async root => (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => resolve(entry.parentPath, entry.name).slice(root.length + 1))
    .filter(path => !path.split('/').some(part => ['tests', '__pycache__'].includes(part))).sort();
  const trustedScripts = await runtimeFiles(canonicalScripts);
  assert.deepEqual(await runtimeFiles(stagedScripts), trustedScripts);
  for (const script of trustedScripts) {
    assert.deepEqual(await readFile(resolve(stagedScripts, script)), await readFile(resolve(canonicalScripts, script)), script);
  }
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
