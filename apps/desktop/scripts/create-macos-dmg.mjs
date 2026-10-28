// @ts-check

import { execFile } from 'node:child_process';
import { mkdir, rm, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { runHdiutilWithRetry, verifyDmgWithRetry } from './hdiutil-retry.mjs';
import { MACOS_PRODUCT } from './macos-package-contract.mjs';
import { withScratch } from '../../../plugin-src/shared/resources/storage/scratch.js';

const execFileAsync = promisify(execFile);

/**
 * @param {{applicationPath: string, outputPath: string, platform?: NodeJS.Platform, run?: (file: string, args: string[]) => Promise<unknown>}} options
 */
export async function createMacosDmg(options) {
  if ((options.platform ?? process.platform) !== 'darwin') {
    throw new Error('GateReeve DMG creation requires macOS.');
  }
  const run = options.run ?? ((file, args) => execFileAsync(file, args));
  const outputPath = resolve(options.outputPath);
  await mkdir(resolve(outputPath, '..'), { recursive: true });
  await withScratch({ purpose: 'dmg-staging' }, async ({ path: sourceRoot }) => {
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
  });
  return outputPath;
}
