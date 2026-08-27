// @ts-check

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { MACOS_PRODUCT } from './macos-package-contract.mjs';

const execFileAsync = promisify(execFile);

/**
 * @param {{applicationPath: string, outputPath: string, platform?: NodeJS.Platform, run?: (file: string, args: string[]) => Promise<unknown>}} options
 */
export async function createMacosDmg(options) {
  if ((options.platform ?? process.platform) !== 'darwin') {
    throw new Error('GateReeve DMG creation requires macOS.');
  }
  const run = options.run ?? ((file, args) => execFileAsync(file, args));
  const sourceRoot = await mkdtemp(join(tmpdir(), 'gatereeve-dmg-source-'));
  await mkdir(resolve(options.outputPath, '..'), { recursive: true });
  await rm(options.outputPath, { force: true });
  try {
    await run('/usr/bin/ditto', [
      resolve(options.applicationPath),
      resolve(sourceRoot, `${MACOS_PRODUCT.name}.app`),
    ]);
    await symlink('/Applications', resolve(sourceRoot, 'Applications'), 'dir');
    await run('/usr/bin/hdiutil', [
      'create',
      '-format',
      'UDZO',
      '-volname',
      MACOS_PRODUCT.volumeName,
      '-srcfolder',
      sourceRoot,
      resolve(options.outputPath),
    ]);
    await run('/usr/bin/hdiutil', ['verify', resolve(options.outputPath)]);
  } finally {
    await rm(sourceRoot, { recursive: true, force: true });
  }
  return resolve(options.outputPath);
}
