// @ts-check

import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { ICONSET_ENTRIES } from './macos-package-contract.mjs';

const execFileAsync = promisify(execFile);

/**
 * @param {{sourcePath: string, outputRoot: string, platform?: NodeJS.Platform, run?: (file: string, args: string[]) => Promise<unknown>}} options
 */
export async function generateMacosIcon(options) {
  if ((options.platform ?? process.platform) !== 'darwin') {
    throw new Error('GateReeve macOS icon generation requires macOS.');
  }
  const run = options.run ?? ((file, args) => execFileAsync(file, args));
  const iconsetPath = resolve(options.outputRoot, 'GateReeve.iconset');
  const icnsPath = resolve(options.outputRoot, 'GateReeve.icns');
  await rm(iconsetPath, { recursive: true, force: true });
  await rm(icnsPath, { force: true });
  await mkdir(iconsetPath, { recursive: true });
  for (const [filename, size] of ICONSET_ENTRIES) {
    await run('/usr/bin/sips', [
      '--resampleHeightWidth',
      String(size),
      String(size),
      resolve(options.sourcePath),
      '--out',
      resolve(iconsetPath, filename),
    ]);
  }
  await run('/usr/bin/iconutil', [
    '--convert',
    'icns',
    '--output',
    icnsPath,
    iconsetPath,
  ]);
  return Object.freeze({ iconsetPath, icnsPath });
}
