// @ts-check

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { runHdiutilWithRetry, verifyDmgWithRetry } from './hdiutil-retry.mjs';
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
  const outputPath = resolve(options.outputPath);
  await mkdir(resolve(outputPath, '..'), { recursive: true });
  try {
    await run('/usr/bin/ditto', [
      resolve(options.applicationPath),
      resolve(sourceRoot, `${MACOS_PRODUCT.name}.app`),
    ]);
    await symlink('/Applications', resolve(sourceRoot, 'Applications'), 'dir');
    await runHdiutilWithRetry([
      'create',
      '-format',
      'UDZO',
      '-volname',
      MACOS_PRODUCT.volumeName,
      '-srcfolder',
      sourceRoot,
      outputPath,
    ], {
      run,
      beforeAttempt: () => rm(outputPath, { force: true }),
    });
    await verifyDmgWithRetry(outputPath, { run });
  } finally {
    await rm(sourceRoot, { recursive: true, force: true });
  }
  return outputPath;
}
