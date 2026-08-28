// @ts-check

import { packager } from '@electron/packager';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { createMacosDmg } from './create-macos-dmg.mjs';
import { generateMacosIcon } from './generate-macos-icon.mjs';
import {
  dmgFilename,
  electronPackagerOptions,
  MACOS_PRODUCT,
  stagedPackage,
  STAGED_DIRECTORIES,
} from './macos-package-contract.mjs';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);

/** @param {string} path */
async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

/**
 * @param {{desktopRoot: string, stageRoot: string, version: string}} options
 */
export async function stageDesktopSource(options) {
  await rm(options.stageRoot, { recursive: true, force: true });
  await mkdir(options.stageRoot, { recursive: true });
  for (const directory of STAGED_DIRECTORIES) {
    await cp(
      resolve(options.desktopRoot, directory),
      resolve(options.stageRoot, directory),
      { recursive: true },
    );
  }
  const brandingRoot = resolve(options.stageRoot, 'assets', 'branding');
  await mkdir(brandingRoot, { recursive: true });
  await cp(
    resolve(options.desktopRoot, MACOS_PRODUCT.iconSource),
    resolve(options.stageRoot, MACOS_PRODUCT.iconSource),
  );
  await writeFile(
    resolve(options.stageRoot, 'package.json'),
    `${JSON.stringify(stagedPackage(options.version), null, 2)}\n`,
  );
  const compatibilityPath = resolve(options.stageRoot, 'shared', 'setup-compatibility.json');
  const compatibility = JSON.parse(await readFile(compatibilityPath, 'utf8'));
  compatibility.desktop.version = options.version;
  compatibility.testedPairs = [{
    desktopVersion: options.version,
    pluginVersion: options.version,
    state: 'matched',
    evidence: `coordinated-release-${options.version}`,
  }];
  await writeFile(compatibilityPath, `${JSON.stringify(compatibility, null, 2)}\n`);
  return resolve(options.stageRoot);
}

/**
 * @param {{desktopRoot?: string, outputRoot?: string, platform?: NodeJS.Platform,
 *   version?: string, signingIdentity?: string, keychain?: string,
 *   run?: (file: string, arguments_: string[]) => Promise<unknown>}} [options]
 */
export async function packageMacos(options = {}) {
  if ((options.platform ?? process.platform) !== 'darwin') {
    throw new Error('GateReeve Desktop packaging requires macOS.');
  }
  const sourceRoot = resolve(options.desktopRoot ?? desktopRoot);
  const outputRoot = resolve(options.outputRoot ?? resolve(sourceRoot, 'dist', 'macos'));
  const metadata = JSON.parse(await readFile(resolve(sourceRoot, 'package.json'), 'utf8'));
  const version = String(options.version ?? metadata.version);
  dmgFilename(version);
  if (metadata.productName !== MACOS_PRODUCT.name) {
    throw new Error(`Desktop productName must be ${MACOS_PRODUCT.name}.`);
  }
  const sourceIcon = resolve(sourceRoot, MACOS_PRODUCT.iconSource);
  if (await sha256(sourceIcon) !== MACOS_PRODUCT.iconSha256) {
    throw new Error('Approved Rolling Vale icon digest does not match the packaging contract.');
  }
  const stageRoot = resolve(outputRoot, 'stage');
  const applicationOutput = resolve(outputRoot, 'application');
  const brandingOutput = resolve(outputRoot, 'branding');
  await rm(applicationOutput, { recursive: true, force: true });
  await stageDesktopSource({ desktopRoot: sourceRoot, stageRoot, version });
  const { icnsPath } = await generateMacosIcon({
    sourcePath: sourceIcon,
    outputRoot: brandingOutput,
  });
  const paths = await packager(electronPackagerOptions({
    stageRoot,
    outputRoot: applicationOutput,
    iconPath: icnsPath,
    version,
    signingIdentity: options.signingIdentity,
    keychain: options.keychain,
  }));
  if (paths.length !== 1 || paths[0] === undefined) {
    throw new Error(`Desktop packager returned ${paths.length} output paths.`);
  }
  const applicationPath = resolve(paths[0], `${MACOS_PRODUCT.name}.app`);
  const outputPath = resolve(outputRoot, dmgFilename(version));
  await createMacosDmg({ applicationPath, outputPath });
  if (options.signingIdentity) {
    const run = options.run ?? ((file, arguments_) => execFileAsync(file, arguments_));
    await run('/usr/bin/codesign', [
      '--force',
      '--timestamp',
      '--sign',
      options.signingIdentity,
      ...(options.keychain ? ['--keychain', options.keychain] : []),
      outputPath,
    ]);
    await run('/usr/bin/codesign', ['--verify', '--strict', '--verbose=4', outputPath]);
  }
  return Object.freeze({
    applicationPath,
    dmgPath: outputPath,
    dmgBytes: (await stat(outputPath)).size,
    dmgSha256: await sha256(outputPath),
    version,
  });
}

/**
 * @param {Readonly<Record<string, unknown>>} result
 * @param {{resultFile?: string, output?: Pick<NodeJS.WriteStream, 'write'>}} [options]
 */
export async function emitPackageResult(result, options = {}) {
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (options.resultFile) {
    const resultPath = resolve(options.resultFile);
    await mkdir(dirname(resultPath), { recursive: true });
    await writeFile(resultPath, serialized);
    return resultPath;
  }
  (options.output ?? process.stdout).write(serialized);
  return undefined;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const versionIndex = process.argv.indexOf('--version');
  const version = versionIndex === -1 ? undefined : process.argv[versionIndex + 1];
  if (versionIndex !== -1 && !version) {
    throw new Error('--version requires a coordinated release version');
  }
  const signingIdentityIndex = process.argv.indexOf('--signing-identity');
  const signingIdentity = signingIdentityIndex === -1
    ? undefined
    : process.argv[signingIdentityIndex + 1];
  const keychainIndex = process.argv.indexOf('--keychain');
  const keychain = keychainIndex === -1 ? undefined : process.argv[keychainIndex + 1];
  const resultFileIndex = process.argv.indexOf('--result-file');
  const resultFile = resultFileIndex === -1 ? undefined : process.argv[resultFileIndex + 1];
  if (signingIdentityIndex !== -1 && !signingIdentity) {
    throw new Error('--signing-identity requires a Developer ID Application identity');
  }
  if (keychainIndex !== -1 && !keychain) throw new Error('--keychain requires a path');
  if (resultFileIndex !== -1 && !resultFile) throw new Error('--result-file requires a path');
  if (keychain && !signingIdentity) throw new Error('--keychain requires --signing-identity');
  await emitPackageResult(await packageMacos({
    version,
    signingIdentity,
    keychain,
  }), { resultFile });
}
