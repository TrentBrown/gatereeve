// @ts-check

import { extractFile, listPackage } from '@electron/asar';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, readlink, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import {
  macosBundleVersion,
  MACOS_PRODUCT,
  REQUIRED_ASAR_PATHS,
} from './macos-package-contract.mjs';

const execFileAsync = promisify(execFile);

/** @param {string} file @param {string[]} args */
async function run(file, args) {
  return execFileAsync(file, args, { maxBuffer: 8 * 1024 * 1024 });
}

/** @param {string} plistPath @param {string} key */
async function plistValue(plistPath, key) {
  const { stdout } = await run('/usr/bin/plutil', [
    '-extract',
    key,
    'raw',
    '-o',
    '-',
    plistPath,
  ]);
  return stdout.trim();
}

/** @param {string} path */
async function requireUniversal(path) {
  const { stdout } = await run('/usr/bin/lipo', ['-archs', path]);
  const architectures = new Set(stdout.trim().split(/\s+/u));
  assert.deepEqual(
    [...architectures].sort(),
    ['arm64', 'x86_64'],
    `${path} must contain exactly the ARM64 and Intel slices`,
  );
}

/** @param {string} applicationPath @param {string} version */
export async function verifyApplication(applicationPath, version) {
  const contents = resolve(applicationPath, 'Contents');
  const infoPlist = resolve(contents, 'Info.plist');
  assert.equal(await plistValue(infoPlist, 'CFBundleIdentifier'), MACOS_PRODUCT.bundleIdentifier);
  assert.equal(await plistValue(infoPlist, 'CFBundleName'), MACOS_PRODUCT.name);
  assert.equal(await plistValue(infoPlist, 'CFBundleDisplayName'), MACOS_PRODUCT.name);
  assert.equal(
    await plistValue(infoPlist, 'CFBundleShortVersionString'),
    macosBundleVersion(version),
  );
  const iconFile = await plistValue(infoPlist, 'CFBundleIconFile');
  assert.ok(iconFile.endsWith('.icns'), 'The application must declare a macOS icon file.');
  assert.equal((await lstat(resolve(contents, 'Resources', iconFile))).isFile(), true);

  const executablePaths = [
    resolve(contents, 'MacOS', MACOS_PRODUCT.name),
    resolve(contents, 'Frameworks', 'Electron Framework.framework', 'Versions', 'A', 'Electron Framework'),
    ...['', ' (GPU)', ' (Plugin)', ' (Renderer)'].map((suffix) => resolve(
      contents,
      'Frameworks',
      `${MACOS_PRODUCT.name} Helper${suffix}.app`,
      'Contents',
      'MacOS',
      `${MACOS_PRODUCT.name} Helper${suffix}`,
    )),
  ];
  for (const path of executablePaths) await requireUniversal(path);

  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', applicationPath]);
  const signature = await run('/usr/bin/codesign', ['--display', '--verbose=4', applicationPath]);
  assert.match(signature.stderr, /Signature=adhoc/u);

  const asarPath = resolve(contents, 'Resources', 'app.asar');
  const asarEntries = new Set(listPackage(asarPath));
  for (const path of REQUIRED_ASAR_PATHS) {
    assert.equal(asarEntries.has(path), true, `Packaged application is missing ${path}`);
  }
  for (const path of asarEntries) {
    assert.doesNotMatch(path, /(?:^|\/)(?:node_modules|scripts|test|visual)(?:\/|$)/u);
    assert.doesNotMatch(path, /\.py$/u);
  }
  const packageMetadata = JSON.parse(extractFile(asarPath, 'package.json').toString('utf8'));
  const compatibility = JSON.parse(
    extractFile(asarPath, 'shared/setup-compatibility.json').toString('utf8'),
  );
  assert.equal(packageMetadata.version, version);
  assert.equal(compatibility.desktop.version, version);
  assert.equal(
    compatibility.testedPairs.some((pair) => (
      pair.desktopVersion === version
      && pair.pluginVersion === version
      && pair.state === 'matched'
    )),
    true,
    'Packaged Setup must recognize the coordinated Plugin/Desktop version',
  );
}

/** @param {string} applicationPath @param {string} fixturePath */
export async function smokeApplication(applicationPath, fixturePath) {
  const userData = await mkdtemp(join(tmpdir(), 'gatereeve-smoke-user-data-'));
  try {
    const executable = resolve(applicationPath, 'Contents', 'MacOS', MACOS_PRODUCT.name);
    const environment = {
      ...process.env,
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      GATEREEVE_DESKTOP_SMOKE: '1',
      GATEREEVE_DESKTOP_SMOKE_WORKTREE: resolve(fixturePath),
      GATEREEVE_DESKTOP_SMOKE_USER_DATA: userData,
    };
    delete environment.ELECTRON_RUN_AS_NODE;
    delete environment.NODE_OPTIONS;
    const child = spawn(executable, [], {
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const result = await new Promise((finish, reject) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Packaged GateReeve smoke timed out after 60 seconds.'));
      }, 60_000);
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('exit', (code, signal) => {
        clearTimeout(timeout);
        finish({ code, signal });
      });
    });
    assert.deepEqual(
      result,
      { code: 0, signal: null },
      `Packaged GateReeve failed its governed-fixture smoke.\n${stderr || stdout}`,
    );
  } finally {
    await rm(userData, { recursive: true, force: true });
  }
}

/** @param {{dmgPath: string, fixturePath?: string, version: string}} options */
export async function verifyDmg(options) {
  if (process.platform !== 'darwin') {
    throw new Error('GateReeve DMG verification requires macOS.');
  }
  await run('/usr/bin/hdiutil', ['verify', resolve(options.dmgPath)]);
  const mountRoot = await mkdtemp(join(tmpdir(), 'gatereeve-dmg-mount-'));
  let attached = false;
  try {
    await run('/usr/bin/hdiutil', [
      'attach',
      '-readonly',
      '-nobrowse',
      '-mountpoint',
      mountRoot,
      resolve(options.dmgPath),
    ]);
    attached = true;
    const applicationsLink = resolve(mountRoot, 'Applications');
    assert.equal((await lstat(applicationsLink)).isSymbolicLink(), true);
    assert.equal(await readlink(applicationsLink), '/Applications');
    const applicationPath = resolve(mountRoot, `${MACOS_PRODUCT.name}.app`);
    await verifyApplication(applicationPath, options.version);
    if (options.fixturePath) await smokeApplication(applicationPath, options.fixturePath);
  } finally {
    if (attached) {
      await run('/usr/bin/hdiutil', ['detach', mountRoot]);
    }
    await rm(mountRoot, { recursive: true, force: true });
  }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

/**
 * @param {{dmgPath: string, evidencePath: string, fixturePath?: string,
 *   nativeArchitecture: string, sourceCommit: string, sourceTag: string,
 *   version: string}} options
 */
export async function writeVerificationEvidence(options) {
  assert.match(options.sourceCommit, /^[a-f0-9]{40}$/u);
  assert.match(options.sourceTag, /^v/u);
  assert.ok(['arm64', 'x64'].includes(options.nativeArchitecture));
  const content = await readFile(resolve(options.dmgPath));
  const details = await stat(resolve(options.dmgPath));
  const evidence = {
    schemaVersion: 1,
    kind: 'gatereeve-desktop-package-verification',
    sourceTag: options.sourceTag,
    sourceCommit: options.sourceCommit,
    version: options.version,
    artifact: {
      filename: basename(resolve(options.dmgPath)),
      bytes: details.size,
      sha256: createHash('sha256').update(content).digest('hex'),
    },
    runner: { operatingSystem: 'darwin', architecture: options.nativeArchitecture },
    checks: {
      dmgVerified: true,
      applicationIdentity: true,
      coordinatedVersion: true,
      universalBinaries: true,
      governedFixtureSmoke: Boolean(options.fixturePath),
    },
    trust: { status: 'development-ad-hoc' },
    verifiedAt: new Date().toISOString(),
  };
  await writeFile(resolve(options.evidencePath), `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dmgPath = argument('--dmg');
  const evidencePath = argument('--evidence');
  const fixturePath = argument('--fixture');
  const nativeArchitecture = argument('--native-architecture');
  const sourceCommit = argument('--source-commit');
  const sourceTag = argument('--source-tag');
  const version = argument('--version');
  if (!dmgPath || !version) {
    throw new Error('Usage: node verify-macos-package.mjs --dmg <path> --version <version> [--fixture <path>] [--native-architecture <arm64|x64>]');
  }
  if (nativeArchitecture && process.arch !== nativeArchitecture) {
    throw new Error(
      `Expected a ${nativeArchitecture} verification host, received ${process.arch}.`,
    );
  }
  await verifyDmg({ dmgPath, fixturePath, version });
  if (evidencePath) {
    if (!nativeArchitecture || !sourceCommit || !sourceTag) {
      throw new Error('--evidence requires --native-architecture, --source-commit, and --source-tag');
    }
    await writeVerificationEvidence({
      dmgPath,
      evidencePath,
      fixturePath,
      nativeArchitecture,
      sourceCommit,
      sourceTag,
      version,
    });
  }
  process.stdout.write(`Verified ${resolve(dmgPath)} on ${process.arch}.\n`);
}
