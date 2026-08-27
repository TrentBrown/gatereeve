import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, lstat, mkdtemp, readFile, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { createMacosDmg } from '../scripts/create-macos-dmg.mjs';
import { generateMacosIcon } from '../scripts/generate-macos-icon.mjs';
import {
  dmgFilename,
  electronPackagerOptions,
  ICONSET_ENTRIES,
  MACOS_PRODUCT,
  REQUIRED_ASAR_PATHS,
} from '../scripts/macos-package-contract.mjs';
import { stageDesktopSource } from '../scripts/package-macos.mjs';

const desktopRoot = resolve(import.meta.dirname, '..');

test('Rolling Vale is the pinned, square production icon source', async () => {
  const source = await readFile(resolve(desktopRoot, MACOS_PRODUCT.iconSource));
  assert.equal(createHash('sha256').update(source).digest('hex'), MACOS_PRODUCT.iconSha256);
  assert.equal(source.subarray(1, 4).toString(), 'PNG');
  assert.equal(source.readUInt32BE(16), 1254);
  assert.equal(source.readUInt32BE(20), 1254);
});

test('macOS identity and universal packager options are permanent', () => {
  const options = electronPackagerOptions({
    stageRoot: '/stage',
    outputRoot: '/output',
    iconPath: '/GateReeve.icns',
    version: '0.1.0',
  });
  assert.equal(options.name, 'GateReeve');
  assert.equal(options.appBundleId, 'com.trentbrown.gatereeve.desktop');
  assert.equal(options.arch, 'universal');
  assert.equal(options.asar, true);
  assert.equal(options.osxSign.identity, '-');
  assert.equal(dmgFilename('0.1.0-rc.1'), 'GateReeve-0.1.0-rc.1-macos-universal.dmg');
  assert.throws(() => dmgFilename('../bad'));
});

test('icon generation creates every standard macOS iconset size', async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), 'gatereeve-icon-test-'));
  const calls = [];
  try {
    const result = await generateMacosIcon({
      sourcePath: '/source.png',
      outputRoot,
      platform: 'darwin',
      run: async (file, args) => { calls.push([file, args]); },
    });
    assert.equal(calls.length, ICONSET_ENTRIES.length + 1);
    for (const [index, [filename, size]] of ICONSET_ENTRIES.entries()) {
      assert.equal(calls[index][0], '/usr/bin/sips');
      assert.ok(calls[index][1].includes(String(size)));
      assert.ok(calls[index][1].at(-1).endsWith(filename));
    }
    assert.equal(calls.at(-1)[0], '/usr/bin/iconutil');
    assert.ok(result.icnsPath.endsWith('GateReeve.icns'));
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test('Desktop staging contains only self-contained runtime resources', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'gatereeve-stage-test-'));
  const stageRoot = resolve(temporaryRoot, 'stage');
  try {
    await stageDesktopSource({ desktopRoot, stageRoot, version: '0.1.0' });
    const metadata = JSON.parse(await readFile(resolve(stageRoot, 'package.json'), 'utf8'));
    assert.equal(metadata.productName, MACOS_PRODUCT.name);
    assert.equal(metadata.dependencies, undefined);
    for (const path of REQUIRED_ASAR_PATHS) {
      await access(resolve(stageRoot, path.slice(1)));
    }
    for (const excluded of ['scripts', 'test', 'visual', 'node_modules']) {
      await assert.rejects(access(resolve(stageRoot, excluded)), /ENOENT/u);
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('DMG composition adds a conventional Applications shortcut', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'gatereeve-dmg-test-'));
  let inspected = false;
  try {
    await createMacosDmg({
      applicationPath: resolve(temporaryRoot, 'input', 'GateReeve.app'),
      outputPath: resolve(temporaryRoot, 'out', 'GateReeve.dmg'),
      platform: 'darwin',
      async run(file, args) {
        if (file === '/usr/bin/hdiutil' && args[0] === 'create') {
          const sourceRoot = args[args.indexOf('-srcfolder') + 1];
          const link = resolve(sourceRoot, 'Applications');
          assert.equal((await lstat(link)).isSymbolicLink(), true);
          assert.equal(await readlink(link), '/Applications');
          inspected = true;
        }
      },
    });
    assert.equal(inspected, true);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
