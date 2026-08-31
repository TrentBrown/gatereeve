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
  RUNTIME_DEPENDENCIES,
  STAGED_RUNTIME_PACKAGES,
} from './macos-package-contract.mjs';
import {
  appleTrustEvidenceSha256 as digestAppleTrustEvidence,
  assertAppleTrustEvidence,
  coordinatedTrustFromEvidence,
  parseCodesignFacts,
} from './apple-trust-contract.mjs';

const execFileAsync = promisify(execFile);

/** @param {string} file @param {string[]} args */
async function run(file, args) {
  return execFileAsync(file, args, { maxBuffer: 8 * 1024 * 1024 });
}

/** @param {(file: string, args: string[]) => Promise<{stdout?: string}>} [command] */
export async function detectRosettaTranslation(command = run) {
  try {
    const result = await command('/usr/sbin/sysctl', ['-in', 'sysctl.proc_translated']);
    const translated = result.stdout?.trim();
    if (translated === '1') return true;
    if (translated === '0' || translated === '') return false;
    throw new Error(`Unexpected sysctl.proc_translated value: ${translated ?? '<missing>'}`);
  } catch (error) {
    throw new Error('Unable to establish native process authority', { cause: error });
  }
}

export function requireMacosExecutionAuthority({
  rosettaTranslated,
  allowRosettaTranslated,
  evidencePath,
}) {
  if (rosettaTranslated && !allowRosettaTranslated) {
    throw new Error('Rosetta-translated execution is not authoritative native Intel evidence.');
  }
  if (allowRosettaTranslated && !rosettaTranslated) {
    throw new Error('--allow-rosetta-translated is only valid inside an x86_64 Rosetta process.');
  }
  if (rosettaTranslated && evidencePath) {
    throw new Error('Rosetta-translated verification cannot write authoritative native evidence.');
  }
  return rosettaTranslated ? 'rosetta-translated' : 'native';
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

/**
 * @param {string} applicationPath
 * @param {string} version
 * @param {any} [appleTrust]
 */
export async function verifyApplication(applicationPath, version, appleTrust) {
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
  if (appleTrust) {
    const facts = parseCodesignFacts(`${signature.stdout}${signature.stderr}`);
    assert.equal(facts.identity, appleTrust.signature.identity);
    assert.equal(facts.teamId, appleTrust.signature.teamId);
    await run('/usr/sbin/spctl', [
      '--assess',
      '--type',
      'exec',
      '--verbose=4',
      applicationPath,
    ]);
  } else {
    assert.match(signature.stderr, /Signature=adhoc/u);
  }

  const asarPath = resolve(contents, 'Resources', 'app.asar');
  const asarEntries = new Set(listPackage(asarPath));
  for (const path of REQUIRED_ASAR_PATHS) {
    assert.equal(asarEntries.has(path), true, `Packaged application is missing ${path}`);
  }
  for (const path of asarEntries) {
    if (path.startsWith('/node_modules/')) {
      assert.equal(
        STAGED_RUNTIME_PACKAGES.some((packageName) => (
          path === `/node_modules/${packageName}`
          || path.startsWith(`/node_modules/${packageName}/`)
        )),
        true,
        `Packaged application contains an unapproved runtime package path: ${path}`,
      );
    } else {
      assert.doesNotMatch(path, /^\/(?:scripts|test|visual)(?:\/|$)/u);
    }
    assert.doesNotMatch(path, /\.py$/u);
  }
  const packageMetadata = JSON.parse(extractFile(asarPath, 'package.json').toString('utf8'));
  const compatibility = JSON.parse(
    extractFile(asarPath, 'shared/setup-compatibility.json').toString('utf8'),
  );
  assert.equal(packageMetadata.version, version);
  assert.deepEqual(packageMetadata.dependencies, RUNTIME_DEPENDENCIES);
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
  const unpacked = resolve(contents, 'Resources', 'app.asar.unpacked', 'node_modules', 'node-pty');
  for (const [directory, architecture] of [
    ['darwin-arm64', 'arm64'],
    ['darwin-x64', 'x86_64'],
  ]) {
    const ptyPath = resolve(unpacked, 'prebuilds', directory, 'pty.node');
    const helperPath = resolve(unpacked, 'prebuilds', directory, 'spawn-helper');
    const ptyArchitectures = await run('/usr/bin/lipo', ['-archs', ptyPath]);
    const helperArchitectures = await run('/usr/bin/lipo', ['-archs', helperPath]);
    assert.match(ptyArchitectures.stdout, new RegExp(`(?:^|\\s)${architecture}(?:\\s|$)`, 'u'));
    assert.match(helperArchitectures.stdout, new RegExp(`(?:^|\\s)${architecture}(?:\\s|$)`, 'u'));
    assert.notEqual((await stat(helperPath)).mode & 0o111, 0, `${directory} spawn-helper is not executable`);
  }
  return appleTrust
    ? coordinatedTrustFromEvidence(appleTrust)
    : { status: 'development-ad-hoc', evidence: [] };
}

/**
 * @param {string} applicationPath
 * @param {string} fixturePath
 * @param {{rosettaTranslated?: boolean}} [options]
 */
export async function smokeApplication(applicationPath, fixturePath, options = {}) {
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
    const child = options.rosettaTranslated
      ? spawn('/usr/bin/arch', ['-x86_64', executable], {
        env: environment,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      : spawn(executable, [], {
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

/**
 * @param {{dmgPath: string, fixturePath?: string, version: string,
 *   trustEvidencePath?: string, sourceTag?: string, sourceCommit?: string,
 *   rosettaTranslated?: boolean}} options
 */
export async function verifyDmg(options) {
  if (process.platform !== 'darwin') {
    throw new Error('GateReeve DMG verification requires macOS.');
  }
  const dmgPath = resolve(options.dmgPath);
  let appleTrust = null;
  let appleTrustEvidenceSha256 = null;
  if (options.trustEvidencePath) {
    const content = await readFile(dmgPath);
    const trustContent = await readFile(resolve(options.trustEvidencePath));
    appleTrust = assertAppleTrustEvidence(
      JSON.parse(trustContent.toString('utf8')),
      {
        sourceTag: options.sourceTag,
        sourceCommit: options.sourceCommit,
        version: options.version,
        filename: basename(dmgPath),
        bytes: (await stat(dmgPath)).size,
        sha256: createHash('sha256').update(content).digest('hex'),
      },
    );
    appleTrustEvidenceSha256 = digestAppleTrustEvidence(appleTrust);
    await run('/usr/bin/codesign', ['--verify', '--strict', '--verbose=4', dmgPath]);
    const signature = await run('/usr/bin/codesign', ['--display', '--verbose=4', dmgPath]);
    const facts = parseCodesignFacts(
      `${signature.stdout}${signature.stderr}`,
      { requireRuntime: false },
    );
    assert.equal(facts.identity, appleTrust.signature.identity);
    assert.equal(facts.teamId, appleTrust.signature.teamId);
    await run('/usr/bin/xcrun', ['stapler', 'validate', '-v', dmgPath]);
    await run('/usr/sbin/spctl', [
      '--assess',
      '--type',
      'open',
      '--context',
      'context:primary-signature',
      '--verbose=4',
      dmgPath,
    ]);
  }
  await run('/usr/bin/hdiutil', ['verify', dmgPath]);
  const mountRoot = await mkdtemp(join(tmpdir(), 'gatereeve-dmg-mount-'));
  let attached = false;
  try {
    await run('/usr/bin/hdiutil', [
      'attach',
      '-readonly',
      '-nobrowse',
      '-mountpoint',
      mountRoot,
      dmgPath,
    ]);
    attached = true;
    const applicationsLink = resolve(mountRoot, 'Applications');
    assert.equal((await lstat(applicationsLink)).isSymbolicLink(), true);
    assert.equal(await readlink(applicationsLink), '/Applications');
    const applicationPath = resolve(mountRoot, `${MACOS_PRODUCT.name}.app`);
    const trust = await verifyApplication(applicationPath, options.version, appleTrust);
    if (options.fixturePath) await smokeApplication(applicationPath, options.fixturePath, {
      rosettaTranslated: options.rosettaTranslated,
    });
    return { trust, appleTrust, appleTrustEvidenceSha256 };
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
 *   version: string, trust?: any, appleTrust?: any,
 *   appleTrustEvidenceSha256?: string | null, rosettaTranslated?: boolean}} options
 */
export async function writeVerificationEvidence(options) {
  if (options.rosettaTranslated) {
    throw new Error('Rosetta-translated verification cannot write authoritative native evidence.');
  }
  assert.match(options.sourceCommit, /^[a-f0-9]{40}$/u);
  assert.match(options.sourceTag, /^v/u);
  assert.ok(['arm64', 'x64'].includes(options.nativeArchitecture));
  const content = await readFile(resolve(options.dmgPath));
  const details = await stat(resolve(options.dmgPath));
  const trusted = options.appleTrust ?? null;
  const evidence = trusted === null ? {
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
    trust: structuredClone(options.trust ?? { status: 'development-ad-hoc', evidence: [] }),
    verifiedAt: new Date().toISOString(),
  } : {
    schemaVersion: 2,
    kind: 'gatereeve-native-trust-verification',
    source: { tag: options.sourceTag, commit: options.sourceCommit },
    candidate: {
      id: `gatereeve-${options.sourceTag}`,
      version: options.version,
      sourceCommit: options.sourceCommit,
    },
    artifact: {
      filename: basename(resolve(options.dmgPath)),
      bytes: details.size,
      sha256: createHash('sha256').update(content).digest('hex'),
    },
    runner: {
      operatingSystem: 'darwin',
      architecture: options.nativeArchitecture,
      processArchitecture: process.arch,
      native: true,
      rosettaTranslated: options.rosettaTranslated ?? false,
    },
    checks: {
      dmgVerified: true,
      applicationIdentity: true,
      coordinatedVersion: true,
      universalBinaries: true,
      universalSlices: ['arm64', 'x86_64'],
      strictDeveloperIdSignature: true,
      hardenedRuntime: true,
      secureTimestamp: true,
      notarizationAccepted: true,
      stapleValidated: true,
      dmgGatekeeperAccepted: true,
      mountedApplicationGatekeeperAccepted: true,
      governedFixtureSmoke: Boolean(options.fixturePath),
    },
    notarization: {
      attemptId: trusted.notarization.attemptId,
      requestId: trusted.notarization.requestId,
      status: trusted.notarization.status,
    },
    trust: structuredClone(options.trust),
    appleTrustEvidenceSha256: options.appleTrustEvidenceSha256,
    verifiedAt: new Date().toISOString(),
  };
  await writeFile(
    resolve(options.evidencePath),
    `${JSON.stringify(evidence, null, 2)}\n`,
    trusted === null ? undefined : { flag: 'wx' },
  );
  return evidence;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dmgPath = argument('--dmg');
  const evidencePath = argument('--evidence');
  const fixturePath = argument('--fixture');
  const nativeArchitecture = argument('--native-architecture');
  const sourceCommit = argument('--source-commit');
  const sourceTag = argument('--source-tag');
  const trustEvidencePath = argument('--trust-evidence');
  const version = argument('--version');
  const allowRosettaTranslated = process.argv.includes('--allow-rosetta-translated');
  if (!dmgPath || !version) {
    throw new Error('Usage: node verify-macos-package.mjs --dmg <path> --version <version> [--fixture <path>] [--native-architecture <arm64|x64>] [--allow-rosetta-translated]');
  }
  if (nativeArchitecture && process.arch !== nativeArchitecture) {
    throw new Error(
      `Expected a ${nativeArchitecture} verification host, received ${process.arch}.`,
    );
  }
  const rosettaTranslated = await detectRosettaTranslation();
  requireMacosExecutionAuthority({ rosettaTranslated, allowRosettaTranslated, evidencePath });
  const verification = await verifyDmg({
    dmgPath,
    fixturePath,
    version,
    trustEvidencePath,
    sourceTag,
    sourceCommit,
    rosettaTranslated,
  });
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
      trust: verification.trust,
      appleTrust: verification.appleTrust,
      appleTrustEvidenceSha256: verification.appleTrustEvidenceSha256,
      rosettaTranslated,
      version,
    });
  }
  process.stdout.write(rosettaTranslated
    ? `Verified ${resolve(dmgPath)} through the x86_64 slice under Rosetta (translated evidence; not native Intel evidence).\n`
    : `Verified ${resolve(dmgPath)} natively on ${process.arch}.\n`);
}
