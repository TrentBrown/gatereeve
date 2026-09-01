import assert from 'node:assert/strict';
import { createPackageWithOptions } from '@electron/asar';
import { createHash } from 'node:crypto';
import { access, lstat, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises';
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
  RUNTIME_DEPENDENCIES,
  STAGED_RUNTIME_PACKAGES,
} from '../scripts/macos-package-contract.mjs';
import { emitPackageResult, stageDesktopSource } from '../scripts/package-macos.mjs';
import {
  detectRosettaTranslation,
  isApprovedRuntimePackagePath,
  requireMacosExecutionAuthority,
  writeVerificationEvidence,
} from '../scripts/verify-macos-package.mjs';

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
  assert.deepEqual(options.asar, { unpack: '**/node_modules/node-pty/prebuilds/**/*' });
  assert.deepEqual(options.osxUniversal, {
    mergeASARs: true,
    singleArchFiles: 'node_modules/node-pty/prebuilds/darwin-*/**/*',
  });
  assert.equal(options.osxSign.identity, '-');
  assert.equal(options.osxSign.optionsForFile().hardenedRuntime, false);
  const trusted = electronPackagerOptions({
    stageRoot: '/stage',
    outputRoot: '/output',
    iconPath: '/GateReeve.icns',
    version: '0.1.0-rc.1',
    signingIdentity: 'Developer ID Application: Trent Brown (ABCDEFGHIJ)',
    keychain: '/tmp/release.keychain-db',
  });
  assert.equal(trusted.osxSign.identityValidation, true);
  assert.equal(trusted.osxSign.keychain, '/tmp/release.keychain-db');
  assert.equal(trusted.osxSign.preAutoEntitlements, true);
  assert.equal(trusted.osxSign.optionsForFile().hardenedRuntime, true);
  assert.equal(trusted.osxSign.optionsForFile().timestamp, undefined);
  assert.equal(dmgFilename('0.1.0-rc.1'), 'GateReeve-0.1.0-rc.1-macos-universal.dmg');
  assert.equal(electronPackagerOptions({
    stageRoot: '/stage',
    outputRoot: '/output',
    iconPath: '/GateReeve.icns',
    version: '0.1.0-rc.1',
  }).appVersion, '0.1.0');
  assert.throws(() => dmgFilename('../bad'));
});

test('runtime package allowlist admits scoped parents but rejects unstaged siblings', () => {
  assert.equal(isApprovedRuntimePackagePath('/node_modules/@xterm'), true);
  assert.equal(isApprovedRuntimePackagePath('/node_modules/@xterm/xterm'), true);
  assert.equal(isApprovedRuntimePackagePath('/node_modules/@xterm/xterm/lib/xterm.mjs'), true);
  assert.equal(isApprovedRuntimePackagePath('/node_modules/@xterm/unapproved'), false);
  assert.equal(isApprovedRuntimePackagePath('/node_modules/node-pty/lib/index.js'), true);
  assert.equal(isApprovedRuntimePackagePath('/node_modules/electron'), false);
});

test('ASAR packaging unpacks node-pty native binaries and helper executables', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'gatereeve-asar-test-'));
  const sourceRoot = resolve(temporaryRoot, 'source');
  const prebuildRoot = resolve(sourceRoot, 'node_modules/node-pty/prebuilds/darwin-arm64');
  const asarPath = resolve(temporaryRoot, 'app.asar');
  try {
    await mkdir(prebuildRoot, { recursive: true });
    await writeFile(resolve(prebuildRoot, 'pty.node'), 'native-addon');
    await writeFile(resolve(prebuildRoot, 'spawn-helper'), 'helper');
    const options = electronPackagerOptions({
      stageRoot: sourceRoot,
      outputRoot: temporaryRoot,
      iconPath: '/GateReeve.icns',
      version: '0.1.0',
    });
    await createPackageWithOptions(sourceRoot, asarPath, options.asar);
    await access(resolve(`${asarPath}.unpacked`, 'node_modules/node-pty/prebuilds/darwin-arm64/pty.node'));
    await access(resolve(`${asarPath}.unpacked`, 'node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper'));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
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
    await stageDesktopSource({ desktopRoot, stageRoot, version: '0.1.0-rc.7' });
    const metadata = JSON.parse(await readFile(resolve(stageRoot, 'package.json'), 'utf8'));
    assert.equal(metadata.productName, MACOS_PRODUCT.name);
    assert.equal(metadata.version, '0.1.0-rc.7');
    assert.deepEqual(metadata.dependencies, RUNTIME_DEPENDENCIES);
    const compatibility = JSON.parse(await readFile(
      resolve(stageRoot, 'shared/setup-compatibility.json'),
      'utf8',
    ));
    assert.equal(compatibility.desktop.version, '0.1.0-rc.7');
    assert.deepEqual(compatibility.testedPairs, [{
      desktopVersion: '0.1.0-rc.7',
      pluginVersion: '0.1.0-rc.7',
      state: 'matched',
      evidence: 'coordinated-release-0.1.0-rc.7',
    }]);
    for (const path of REQUIRED_ASAR_PATHS) {
      await access(resolve(stageRoot, path.slice(1)));
    }
    for (const packageName of STAGED_RUNTIME_PACKAGES) {
      await access(resolve(stageRoot, 'node_modules', packageName, 'package.json'));
    }
    assert.equal(
      (await lstat(resolve(
        stageRoot,
        'node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper',
      ))).mode & 0o111,
      0o111,
    );
    for (const excluded of ['scripts', 'test', 'visual', 'node_modules/electron']) {
      await assert.rejects(access(resolve(stageRoot, excluded)), /ENOENT/u);
    }
    await assert.rejects(
      access(resolve(stageRoot, 'renderer/markdown-source.js')),
      /ENOENT/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('package results can use a dedicated machine-readable file', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'gatereeve-package-result-'));
  const resultPath = resolve(temporaryRoot, 'nested', 'trusted-package.json');
  const result = {
    applicationPath: '/output/GateReeve.app',
    dmgPath: '/output/GateReeve.dmg',
    version: '0.1.0-rc.3',
  };
  try {
    let resultOutput = '';
    assert.equal(await emitPackageResult(result, {
      resultFile: resultPath,
      output: { write: (value) => { resultOutput += value; } },
    }), resultPath);
    assert.equal(resultOutput, '');
    assert.deepEqual(JSON.parse(await readFile(resultPath, 'utf8')), result);

    let output = '';
    await emitPackageResult(result, { output: { write: (value) => { output += value; } } });
    assert.deepEqual(JSON.parse(output), result);
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

test('native package evidence binds the exact source and DMG bytes', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'gatereeve-package-evidence-'));
  try {
    const dmgPath = join(temporaryRoot, 'GateReeve-0.1.0-rc.7-macos-universal.dmg');
    const evidencePath = join(temporaryRoot, 'desktop-arm64.json');
    await writeFile(dmgPath, 'verified universal candidate\n');
    const evidence = await writeVerificationEvidence({
      dmgPath,
      evidencePath,
      fixturePath: '/governed-fixture',
      nativeArchitecture: 'arm64',
      sourceCommit: '1234567890abcdef1234567890abcdef12345678',
      sourceTag: 'v0.1.0-rc.7',
      version: '0.1.0-rc.7',
    });
    assert.equal(evidence.sourceTag, 'v0.1.0-rc.7');
    assert.equal(evidence.artifact.filename, 'GateReeve-0.1.0-rc.7-macos-universal.dmg');
    assert.match(evidence.artifact.sha256, /^[a-f0-9]{64}$/u);
    assert.equal(evidence.checks.governedFixtureSmoke, true);
    assert.deepEqual(JSON.parse(await readFile(evidencePath, 'utf8')), evidence);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('native authority detects and rejects Rosetta substitution evidence', async () => {
  assert.equal(await detectRosettaTranslation(async () => ({ stdout: '1\n' })), true);
  assert.equal(await detectRosettaTranslation(async () => ({ stdout: '0\n' })), false);
  assert.equal(await detectRosettaTranslation(async () => ({ stdout: '' })), false);
  await assert.rejects(
    detectRosettaTranslation(async () => ({ stdout: 'indeterminate\n' })),
    /Unable to establish native process authority/u,
  );
  await assert.rejects(
    detectRosettaTranslation(async () => { throw new Error('all probes failed'); }),
    /Unable to establish native process authority/u,
  );
  assert.equal(requireMacosExecutionAuthority({
    rosettaTranslated: false, allowRosettaTranslated: false, evidencePath: undefined,
  }), 'native');
  assert.equal(requireMacosExecutionAuthority({
    rosettaTranslated: true, allowRosettaTranslated: true, evidencePath: undefined,
  }), 'rosetta-translated');
  assert.throws(() => requireMacosExecutionAuthority({
    rosettaTranslated: true, allowRosettaTranslated: false, evidencePath: undefined,
  }), /not authoritative native Intel evidence/u);
  assert.throws(() => requireMacosExecutionAuthority({
    rosettaTranslated: true, allowRosettaTranslated: true, evidencePath: '/native.json',
  }), /cannot write authoritative native evidence/u);
  assert.throws(() => requireMacosExecutionAuthority({
    rosettaTranslated: false, allowRosettaTranslated: true, evidencePath: undefined,
  }), /only valid inside an x86_64 Rosetta process/u);
  await assert.rejects(writeVerificationEvidence({
    dmgPath: '/unreachable.dmg',
    evidencePath: '/unreachable.json',
    nativeArchitecture: 'x64',
    sourceCommit: '1234567890abcdef1234567890abcdef12345678',
    sourceTag: 'v0.1.0',
    version: '0.1.0',
    rosettaTranslated: true,
  }), /cannot write authoritative native evidence/u);
});
