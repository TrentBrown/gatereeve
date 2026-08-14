import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const publisher = resolve(repositoryRoot, 'ci/publish-marketplace.sh');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

test('publication failure preserves the previous marketplace ref', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workflow publication '));
  const remote = join(root, 'remote.git');
  const seed = join(root, 'seed');
  const release = join(root, 'release');
  git(['init', '--bare', remote], root);
  await mkdir(seed);
  git(['init', '--initial-branch=marketplace'], seed);
  git(['config', 'user.name', 'Test'], seed);
  git(['config', 'user.email', 'test@example.invalid'], seed);
  await writeFile(join(seed, 'previous-release.txt'), 'previous');
  git(['add', '--all'], seed);
  git(['commit', '-m', 'previous'], seed);
  git(['remote', 'add', 'origin', remote], seed);
  git(['push', 'origin', 'marketplace'], seed);

  await mkdir(release);
  await writeFile(
    join(release, 'RELEASE.json'),
    '{"version":"0.1.0-rc.1"}\n'
  );

  const failed = spawnSync(
    'bash',
    [publisher, release, remote, 'v0.1.0-rc.1'],
    {
      encoding: 'utf8',
      env: { ...process.env, WORKFLOW_PUBLISH_FAIL_BEFORE_PUSH: '1' },
    }
  );
  assert.notEqual(failed.status, 0);

  const afterFailure = join(root, 'after-failure');
  git(['clone', '--branch', 'marketplace', remote, afterFailure], root);
  assert.equal(
    await readFile(join(afterFailure, 'previous-release.txt'), 'utf8'),
    'previous'
  );

  execFileSync('bash', [publisher, release, remote, 'v0.1.0-rc.1'], {
    encoding: 'utf8',
  });
  const afterSuccess = join(root, 'after-success');
  git(['clone', '--branch', 'marketplace', remote, afterSuccess], root);
  assert.equal(
    JSON.parse(await readFile(join(afterSuccess, 'RELEASE.json'), 'utf8')).version,
    '0.1.0-rc.1'
  );
  await assert.rejects(readFile(join(afterSuccess, 'previous-release.txt')), /ENOENT/);
});
