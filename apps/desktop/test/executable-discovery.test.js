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
      homeDirectory: '/Users/tester',
    }),
    [
      '/usr/bin/git',
      '/opt/homebrew/bin/git',
      '/usr/local/bin/git',
      '/Users/tester/.local/bin/git',
      '/Users/tester/.npm-global/bin/git',
      '/Users/tester/.volta/bin/git',
      '/Users/tester/.local/share/mise/shims/git',
      '/Users/tester/.fnm/current/bin/git',
      '/Applications/Codex.app/Contents/Resources/git',
      '/custom/bin/git',
    ],
  );
});

test('Finder-compatible discovery checks only the bounded NVM version root after fixed paths', async () => {
  const probed = [];
  const result = await discoverDesktopExecutables({
    environment: { PATH: '' },
    platform: 'darwin',
    homeDirectory: '/Users/tester',
    async readDirectory(path) {
      assert.equal(path, '/Users/tester/.nvm/versions/node');
      return [
        { name: 'v22.12.0', isDirectory: () => true },
        { name: 'v24.1.0', isDirectory: () => true },
      ];
    },
    async probe(path) {
      probed.push(path);
      return path === '/Users/tester/.nvm/versions/node/v24.1.0/bin/git';
    },
  });
  assert.equal(result.git, '/Users/tester/.nvm/versions/node/v24.1.0/bin/git');
  assert.equal(result.gh, null);
  assert.equal(probed.some((path) => path.includes('/Users/tester/Documents')), false);
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
