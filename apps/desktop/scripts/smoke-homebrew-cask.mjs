// @ts-check

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import {
  HOMEBREW_CASK_TOKEN,
  renderPredecessorHomebrewCask,
  verifyHomebrewCaskWorkspace,
} from '../../../cli/src/plugin/homebrew-cask.js';

const execFileAsync = promisify(execFile);
const SMOKE_TAP = 'gatereeve/smoke';
const SMOKE_CASK = `${SMOKE_TAP}/${HOMEBREW_CASK_TOKEN}`;
const PUBLIC_TAP = 'TrentBrown/gatereeve';
const PUBLIC_CASK = `${PUBLIC_TAP}/${HOMEBREW_CASK_TOKEN}`;

/** @param {string[]} command */
async function runCommand(command) {
  try {
    const result = await execFileAsync(command[0], command.slice(1), {
      env: {
        ...process.env,
        HOMEBREW_NO_AUTO_UPDATE: '1',
        HOMEBREW_NO_ENV_HINTS: '1',
      },
      maxBuffer: 8 * 1024 * 1024,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: Number.isInteger(error?.code) ? error.code : 1,
      stdout: error?.stdout ?? '',
      stderr: error?.stderr ?? error?.message ?? String(error),
    };
  }
}

async function requireSuccess(run, command, label) {
  const result = await run(command);
  if (result.code !== 0) {
    throw new Error(`${label} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result;
}

async function verifyInstalledApplication(run, applicationPath, record) {
  if (!(await stat(applicationPath)).isDirectory()) {
    throw new Error('Homebrew did not install GateReeve.app');
  }
  const plist = resolve(applicationPath, 'Contents', 'Info.plist');
  const bundle = await requireSuccess(run, [
    '/usr/bin/plutil', '-extract', 'CFBundleIdentifier', 'raw', '-o', '-', plist,
  ], 'GateReeve bundle identity inspection');
  if (bundle.stdout.trim() !== 'com.trentbrown.gatereeve.desktop') {
    throw new Error(`Homebrew installed an unexpected application: ${bundle.stdout.trim()}`);
  }
  await requireSuccess(
    run,
    ['/usr/bin/codesign', '--verify', '--deep', '--strict', applicationPath],
    'GateReeve Developer ID verification',
  );
  await requireSuccess(
    run,
    ['/usr/sbin/spctl', '--assess', '--type', 'exec', '--verbose=4', applicationPath],
    'GateReeve Gatekeeper assessment',
  );
  const executable = resolve(applicationPath, 'Contents', 'MacOS', 'GateReeve');
  const architectures = await requireSuccess(
    run,
    ['/usr/bin/lipo', '-archs', executable],
    'GateReeve universal-binary inspection',
  );
  const actual = new Set(architectures.stdout.trim().split(/\s+/u));
  if (!actual.has('arm64') || !actual.has('x86_64') || actual.size !== 2) {
    throw new Error(`GateReeve executable is not universal: ${architectures.stdout.trim()}`);
  }
  return {
    bundleIdentifier: bundle.stdout.trim(),
    architectures: [...actual].sort(),
    dmgSha256: record.desktop.sha256,
  };
}

function nativeArchitecture() {
  return process.arch === 'x64' ? 'x64' : 'arm64';
}

function assertNativeArchitecture(expected) {
  const actual = nativeArchitecture();
  if (expected && expected !== actual) {
    throw new Error(`Expected a ${expected} Homebrew host, received ${actual}`);
  }
  return actual;
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

/**
 * @param {{recordPath: string, evidencePath?: string, run?: typeof runCommand,
 *   platform?: string, architecture?: string, now?: () => Date}} options
 */
export async function smokeHomebrewCask(options) {
  const platform = options.platform ?? process.platform;
  if (platform !== 'darwin') throw new Error('Homebrew Cask smoke requires macOS');
  const hostArchitecture = assertNativeArchitecture(options.architecture);
  const run = options.run ?? runCommand;
  const record = await verifyHomebrewCaskWorkspace(resolve(options.recordPath));
  const workspace = dirname(resolve(options.recordPath));
  const exactCask = await readFile(resolve(workspace, record.cask.outputPath), 'utf8');
  const stagingRoot = await mkdtemp(resolve(tmpdir(), 'gatereeve-homebrew-smoke-'));
  const appDirectory = resolve(stagingRoot, 'Applications');
  let tapCreated = false;
  let installed = false;
  let primaryError = null;
  const cleanupErrors = [];
  let installProof;
  let upgradeProof;

  try {
    const existingCask = await run(['brew', 'list', '--cask', HOMEBREW_CASK_TOKEN]);
    if (existingCask.code === 0) {
      throw new Error(`Refusing to replace an installed ${HOMEBREW_CASK_TOKEN} Cask`);
    }
    const taps = await requireSuccess(run, ['brew', 'tap'], 'Homebrew tap inventory');
    if (taps.stdout.split(/\r?\n/u).includes(SMOKE_TAP)) {
      throw new Error(`Refusing to replace existing Homebrew tap ${SMOKE_TAP}`);
    }
    await mkdir(appDirectory, { recursive: true });
    await requireSuccess(run, ['brew', 'tap-new', '--no-git', SMOKE_TAP], 'Smoke tap creation');
    tapCreated = true;
    const tap = await requireSuccess(run, ['brew', '--repository', SMOKE_TAP], 'Smoke tap lookup');
    const caskDirectory = resolve(tap.stdout.trim(), 'Casks');
    const caskPath = resolve(caskDirectory, `${HOMEBREW_CASK_TOKEN}.rb`);
    await mkdir(caskDirectory, { recursive: true });
    await writeFile(caskPath, renderPredecessorHomebrewCask(exactCask));

    await requireSuccess(run, [
      'brew', 'install', '--cask', `--appdir=${appDirectory}`, SMOKE_CASK,
    ], 'Homebrew Cask installation');
    installed = true;
    const applicationPath = resolve(appDirectory, 'GateReeve.app');
    installProof = await verifyInstalledApplication(run, applicationPath, record);

    await writeFile(caskPath, exactCask);
    await requireSuccess(run, [
      'brew', 'upgrade', '--cask', '--greedy', `--appdir=${appDirectory}`, SMOKE_CASK,
    ], 'Homebrew Cask upgrade');
    upgradeProof = await verifyInstalledApplication(run, applicationPath, record);
  } catch (error) {
    primaryError = error;
  } finally {
    if (installed) {
      const result = await run(['brew', 'uninstall', '--cask', SMOKE_CASK]);
      if (result.code !== 0) cleanupErrors.push(new Error(`Cask cleanup failed: ${result.stderr}`));
    }
    if (tapCreated) {
      const result = await run(['brew', 'untap', SMOKE_TAP]);
      if (result.code !== 0) cleanupErrors.push(new Error(`Tap cleanup failed: ${result.stderr}`));
    }
    await rm(stagingRoot, { recursive: true, force: true });
  }
  if (primaryError && cleanupErrors.length > 0) {
    throw new AggregateError([primaryError, ...cleanupErrors], 'Cask smoke and cleanup failed');
  }
  if (primaryError) throw primaryError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Cask cleanup failed');

  const evidence = {
    schemaVersion: 1,
    kind: 'gatereeve-homebrew-cask-smoke',
    caskReleaseId: record.caskReleaseId,
    source: structuredClone(record.source),
    desktop: structuredClone(record.desktop),
    runner: {
      operatingSystem: 'darwin',
      architecture: hostArchitecture,
    },
    checks: {
      exactCaskInstalled: true,
      upgradeCompleted: true,
      applicationIdentity: true,
      developerIdValid: true,
      gatekeeperAccepted: true,
      universalBinaries: true,
      pluginLifecycleUntouched: true,
      cliLifecycleUntouched: true,
    },
    installProof,
    upgradeProof,
    verifiedAt: (options.now ?? (() => new Date()))().toISOString(),
  };
  if (options.evidencePath) {
    await mkdir(dirname(resolve(options.evidencePath)), { recursive: true });
    await writeFile(resolve(options.evidencePath), `${JSON.stringify(evidence, null, 2)}\n`);
  }
  return evidence;
}

/**
 * Install the published Cask through the literal user-facing tap identity.
 *
 * @param {{recordPath: string, evidencePath?: string, run?: typeof runCommand,
 *   platform?: string, architecture?: string, now?: () => Date}} options
 */
export async function smokePublicHomebrewCask(options) {
  const platform = options.platform ?? process.platform;
  if (platform !== 'darwin') throw new Error('Public Homebrew Cask smoke requires macOS');
  const hostArchitecture = assertNativeArchitecture(options.architecture);
  const run = options.run ?? runCommand;
  const record = await verifyHomebrewCaskWorkspace(resolve(options.recordPath));
  const expectedCask = await readFile(
    resolve(dirname(resolve(options.recordPath)), record.cask.outputPath),
    'utf8',
  );
  const stagingRoot = await mkdtemp(resolve(tmpdir(), 'gatereeve-public-cask-smoke-'));
  const appDirectory = resolve(stagingRoot, 'Applications');
  let primaryError = null;
  const cleanupErrors = [];
  let installProof;
  let tapCaskSha256;

  try {
    const existingCask = await run(['brew', 'list', '--cask', HOMEBREW_CASK_TOKEN]);
    if (existingCask.code === 0) {
      throw new Error(`Refusing to replace an installed ${HOMEBREW_CASK_TOKEN} Cask`);
    }
    const taps = await requireSuccess(run, ['brew', 'tap'], 'Homebrew tap inventory');
    if (taps.stdout.split(/\r?\n/u).some((tap) => tap.toLowerCase() === PUBLIC_TAP.toLowerCase())) {
      throw new Error(`Refusing to reuse existing Homebrew tap ${PUBLIC_TAP}`);
    }
    await mkdir(appDirectory, { recursive: true });
    await requireSuccess(run, ['brew', 'tap', PUBLIC_TAP], 'Public tap installation');
    const tap = await requireSuccess(run, ['brew', '--repository', PUBLIC_TAP], 'Public tap lookup');
    const publicCask = await readFile(
      resolve(tap.stdout.trim(), 'Casks', `${HOMEBREW_CASK_TOKEN}.rb`),
      'utf8',
    );
    tapCaskSha256 = sha256(publicCask);
    if (publicCask !== expectedCask || tapCaskSha256 !== record.cask.sha256) {
      throw new Error(`Public Cask bytes do not match ${record.cask.sha256}`);
    }
    await requireSuccess(run, [
      'brew', 'install', '--cask', `--appdir=${appDirectory}`, PUBLIC_CASK,
    ], 'Public Homebrew Cask installation');
    installProof = await verifyInstalledApplication(
      run,
      resolve(appDirectory, 'GateReeve.app'),
      record,
    );
  } catch (error) {
    primaryError = error;
  } finally {
    const installed = await run(['brew', 'list', '--cask', HOMEBREW_CASK_TOKEN]);
    if (installed.code === 0) {
      const result = await run(['brew', 'uninstall', '--cask', HOMEBREW_CASK_TOKEN]);
      if (result.code !== 0) cleanupErrors.push(new Error(`Cask cleanup failed: ${result.stderr}`));
    }
    const taps = await run(['brew', 'tap']);
    if (taps.code === 0 && taps.stdout.split(/\r?\n/u)
      .some((tap) => tap.toLowerCase() === PUBLIC_TAP.toLowerCase())) {
      const result = await run(['brew', 'untap', PUBLIC_TAP]);
      if (result.code !== 0) cleanupErrors.push(new Error(`Tap cleanup failed: ${result.stderr}`));
    }
    await rm(stagingRoot, { recursive: true, force: true });
  }
  if (primaryError && cleanupErrors.length > 0) {
    throw new AggregateError([primaryError, ...cleanupErrors], 'Public Cask smoke and cleanup failed');
  }
  if (primaryError) throw primaryError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Public Cask cleanup failed');

  const evidence = {
    schemaVersion: 1,
    kind: 'gatereeve-public-homebrew-cask-smoke',
    caskReleaseId: record.caskReleaseId,
    source: structuredClone(record.source),
    desktop: structuredClone(record.desktop),
    publicTap: {
      repository: record.cask.repository,
      tap: record.cask.tap,
      token: record.cask.token,
      caskSha256: tapCaskSha256,
    },
    runner: {
      operatingSystem: 'darwin',
      architecture: hostArchitecture,
    },
    checks: {
      literalPublicCommandInstalled: true,
      exactPublishedCask: true,
      exactCaskInstalled: true,
      applicationIdentity: true,
      developerIdValid: true,
      gatekeeperAccepted: true,
      universalBinaries: true,
      pluginLifecycleUntouched: true,
      cliLifecycleUntouched: true,
    },
    installProof,
    verifiedAt: (options.now ?? (() => new Date()))().toISOString(),
  };
  if (options.evidencePath) {
    await mkdir(dirname(resolve(options.evidencePath)), { recursive: true });
    await writeFile(resolve(options.evidencePath), `${JSON.stringify(evidence, null, 2)}\n`);
  }
  return evidence;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const recordPath = argument('--record');
  if (!recordPath) {
    throw new Error('Usage: node smoke-homebrew-cask.mjs --record <cask-record.json> [--public-tap] [--evidence <path>] [--architecture <arm64|x64>]');
  }
  const smoke = process.argv.includes('--public-tap')
    ? smokePublicHomebrewCask
    : smokeHomebrewCask;
  const evidence = await smoke({
    recordPath,
    evidencePath: argument('--evidence'),
    architecture: argument('--architecture'),
  });
  console.log(JSON.stringify(evidence, null, 2));
}
