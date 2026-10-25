import assert from 'node:assert/strict';
import test from 'node:test';

import {
  discoverCompatibleGitExecutable,
  discoverCompatiblePythonExecutable,
  discoverDesktopExecutables,
  discoverExecutables,
  executableCandidates,
} from '../main/executable-discovery.js';

test('compatible Python discovery skips an older Apple candidate', async () => {
  const result = await discoverCompatiblePythonExecutable({
    environment: { PATH: '/usr/bin:/opt/homebrew/bin' },
    platform: 'darwin',
    homeDirectory: '/Users/tester',
    async readDirectory() { return []; },
    async probe(path) {
      return path === '/usr/bin/python3' || path === '/opt/homebrew/bin/python3';
    },
    async run(path) {
      return { stdout: path.startsWith('/usr/bin') ? 'Python 3.9.6' : 'Python 3.13.1', stderr: '' };
    },
  });
  assert.equal(result, '/opt/homebrew/bin/python3');
});

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
    async run() { return { stdout: 'git version 2.53.0' }; },
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
    async run() { return { stdout: 'git version 2.53.0' }; },
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

test('Git discovery skips Apple Git without the no-fetch capability', async () => {
  const calls = [];
  const result = await discoverDesktopExecutables({
    environment: { PATH: '/usr/bin:/opt/homebrew/bin' },
    platform: 'darwin', homeDirectory: '/Users/tester',
    async readDirectory() { return []; },
    async probe(path) { return path === '/usr/bin/git' || path === '/opt/homebrew/bin/git'; },
    async run(path, args) {
      calls.push([path, ...args]);
      if (path === '/usr/bin/git') throw new Error('unknown option: --no-lazy-fetch');
      return { stdout: 'git version 2.53.0' };
    },
  });
  assert.equal(result.git, '/opt/homebrew/bin/git');
  assert.deepEqual(calls, [
    ['/usr/bin/git', '--no-lazy-fetch', '--version'],
    ['/opt/homebrew/bin/git', '--no-lazy-fetch', '--version'],
  ]);
});

test('Git discovery fails closed when only unsupported candidates exist', async () => {
  const result = await discoverCompatibleGitExecutable({
    environment: { PATH: '/usr/bin' }, platform: 'linux',
    async probe() { return true; },
    async run() { throw new Error('unknown option: --no-lazy-fetch'); },
  });
  assert.equal(result, null);
});

test('an unsupported explicit Git override does not fall back to another installation', async () => {
  const probed = [];
  const result = await discoverCompatibleGitExecutable({
    environment: { PATH: '/opt/homebrew/bin', GATEREEVE_GIT_PATH: '/managed/git' },
    platform: 'darwin',
    async probe(path) { probed.push(path); return true; },
    async run() { throw new Error('unknown option: --no-lazy-fetch'); },
  });
  assert.equal(result, null);
  assert.deepEqual(probed, ['/managed/git']);
});

test('multi-candidate discovery retains bounded deterministic order', async () => {
  const probed = [];
  const result = await discoverExecutables('python3', {
    environment: { PATH: '/custom/bin:/usr/bin' },
    platform: 'darwin',
    homeDirectory: '/Users/tester',
    async readDirectory() { return []; },
    async probe(path) {
      probed.push(path);
      return path === '/usr/bin/python3' || path === '/opt/homebrew/bin/python3';
    },
  });
  assert.deepEqual(result, ['/usr/bin/python3', '/opt/homebrew/bin/python3']);
  assert.equal(probed.includes('/custom/bin/python3'), true);
  assert.equal(probed.some((path) => path.includes('/Users/tester/Documents')), false);
});

test('multi-candidate discovery treats an explicit override as the entire search', async () => {
  const probed = [];
  const result = await discoverExecutables('python3', {
    environment: {
      GATEREEVE_PYTHON3_PATH: '/managed/python3',
      PATH: '/ignored',
    },
    platform: 'darwin',
    async probe(path) { probed.push(path); return true; },
  });
  assert.deepEqual(result, ['/managed/python3']);
  assert.deepEqual(probed, ['/managed/python3']);
});
