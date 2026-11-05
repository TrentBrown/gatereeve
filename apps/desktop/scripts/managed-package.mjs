import { copyFile, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { withInstallerBuild } from '../../../plugin-src/shared/resources/storage/installers.js';
import { withScratch } from '../../../plugin-src/shared/resources/storage/scratch.js';

// Default local packaging retains only the installer. Generated application
// copies are intermediate outputs, not installed apps or release recovery data.
export async function managedPackage({ version, produce, root, scratchRoot }) {
  const cached = await withInstallerBuild({ version, ...(root ? { root } : {}) }, entry =>
    withScratch({ purpose: 'local-installer-package', ...(scratchRoot ? { root: scratchRoot } : {}) }, async scratch => {
      const result = await produce(join(scratch.path, 'package'));
      await copyFile(result.dmgPath, entry.dmgPath, constants.COPYFILE_EXCL);
      return { ...result, applicationPath: null, dmgPath: entry.dmgPath };
    }));
  return { ...cached.value, installerId: cached.id, installerRoot: cached.root, installerCleanup: cached.cleanup };
}

export function usesManagedInstaller(options = {}, environment = process.env) {
  return !options.outputRoot && !options.signingIdentity && !environment.CI && !environment.GITHUB_ACTIONS;
}
