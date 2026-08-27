import assert from 'node:assert/strict';
import test from 'node:test';

import {
  discoverDesktopExecutables,
  executableCandidates,
} from '../main/executable-discovery.js';

test('Finder-compatible discovery checks fixed macOS and explicit PATH locations', () => {
  assert.deepEqual(
    executableCandidates('git', {
      environment: { PATH: '/custom/bin:/usr/bin' },
      platform: 'darwin',
    }),
    [
      '/usr/bin/git',
      '/opt/homebrew/bin/git',
      '/usr/local/bin/git',
      '/custom/bin/git',
    ],
  );
});

test('explicit executable overrides are narrow and fail closed', async () => {
  const probed = [];
  const result = await discoverDesktopExecutables({
    environment: {
      GATEREEVE_GIT_PATH: '/managed/git',
      GATEREEVE_GH_PATH: '/managed/missing-gh',
      PATH: '/ignored',
    },
    platform: 'darwin',
    async probe(path) {
      probed.push(path);
      return path === '/managed/git';
    },
  });
  assert.deepEqual(result, { git: '/managed/git', gh: null });
  assert.deepEqual(probed, ['/managed/git', '/managed/missing-gh']);
});
