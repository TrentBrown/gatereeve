import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { prepareRelease } from '../src/plugin/release.js';
import {
  bundleMarketplaceRelease,
  CommandExecutionError,
  listReleases,
  publishRelease,
  verifyMarketplaceRelease,
  watchRelease,
} from '../src/plugin/release-operations.js';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '../..');
const sourceRoot = resolve(repositoryRoot, 'plugin-src');

async function git(directory, ...args) {
  return execFileAsync('git', ['-C', directory, ...args], { encoding: 'utf8' });
}

async function createGitFixture() {
  const root = await mkdtemp(join(tmpdir(), 'workflow release operations '));
  const remote = join(root, 'remote.git');
  const source = join(root, 'source');
  await execFileAsync('git', ['init', '--bare', remote]);
  await execFileAsync('git', ['init', '--initial-branch=main', source]);
  await git(source, 'config', 'user.name', 'Release Test');
  await git(source, 'config', 'user.email', 'release@example.invalid');
  await git(source, 'config', 'core.hooksPath', '/dev/null');
  await writeFile(join(source, 'README.md'), 'release fixture\n');
  await writeFile(
    join(source, 'INSTALL.md'),
    '# Install\n\ncodex plugin marketplace add "$MARKETPLACE_ROOT"\n' +
      'claude plugin marketplace add "$MARKETPLACE_ROOT" --scope user\n' +
      'Run workflow-doctor.\n'
  );
  await writeFile(
    join(source, 'USER-GUIDE.md'),
    '# Use the workflow\n\nBegin with Grill Me.\n'
  );
  await git(source, 'add', 'README.md', 'INSTALL.md', 'USER-GUIDE.md');
  await git(source, 'commit', '-m', 'Initial release source');
  await git(source, 'remote', 'add', 'origin', remote);
  await git(source, 'push', '-u', 'origin', 'main');
  const sourceCommit = (await git(source, 'rev-parse', 'HEAD')).stdout.trim();
  return { root, remote, source, sourceCommit };
}

async function publishMarketplaceFixture(fixture, tag) {
  await git(fixture.source, 'tag', '-a', tag, '-m', `Release ${tag}`);
  await git(fixture.source, 'push', 'origin', `refs/tags/${tag}`);

  const releaseRoot = join(fixture.root, 'marketplace');
  await prepareRelease({
    sourceRoot,
    outputRoot: releaseRoot,
    sourceTag: tag,
    sourceCommit: fixture.sourceCommit,
  });
  await git(releaseRoot, 'init', '--initial-branch=marketplace');
  await git(releaseRoot, 'config', 'user.name', 'Release Test');
  await git(releaseRoot, 'config', 'user.email', 'release@example.invalid');
  await git(releaseRoot, 'config', 'core.hooksPath', '/dev/null');
  await git(releaseRoot, 'add', '--all');
  await git(releaseRoot, 'commit', '-m', `Publish ${tag}`);
  await git(releaseRoot, 'remote', 'add', 'origin', fixture.remote);
  await git(releaseRoot, 'push', '--force', 'origin', 'HEAD:marketplace');
  return releaseRoot;
}

function result(stdout = '', status = 0, stderr = '') {
  return { stdout, stderr, status };
}

test('publish dry-run is nonmutating and confirmed publish pushes only the tag', async () => {
  const fixture = await createGitFixture();
  let validationCount = 0;
  const tag = 'v0.1.0-rc.7';
  const dryRun = await publishRelease({
    repositoryRoot: fixture.source,
    tag,
    dryRun: true,
    yes: true,
    wait: false,
    verify: false,
    validate: async () => {
      validationCount += 1;
      return { ready: true };
    },
  });
  assert.equal(dryRun.published, false);
  assert.equal(dryRun.sourceCommit, fixture.sourceCommit);
  assert.equal(validationCount, 1);
  assert.equal(
    (await execFileAsync('git', ['ls-remote', '--tags', fixture.remote, `refs/tags/${tag}`]))
      .stdout,
    ''
  );

  const published = await publishRelease({
    repositoryRoot: fixture.source,
    tag,
    yes: true,
    wait: false,
    verify: false,
    validate: async () => ({ ready: true }),
  });
  assert.equal(published.published, true);
  assert.equal(published.run, null);
  const remoteTag = await execFileAsync(
    'git',
    ['ls-remote', '--tags', fixture.remote, `refs/tags/${tag}^{}`],
    { encoding: 'utf8' }
  );
  assert.match(remoteTag.stdout, new RegExp(`^${fixture.sourceCommit}\\s`));

  await assert.rejects(
    publishRelease({
      repositoryRoot: fixture.source,
      tag,
      dryRun: true,
      yes: true,
      wait: false,
      verify: false,
      validate: async () => ({ ready: true }),
    }),
    /already exists/
  );
});

test('publish cancellation leaves the release tag absent', async () => {
  const fixture = await createGitFixture();
  const tag = 'v0.1.0-rc.8';
  const published = await publishRelease({
    repositoryRoot: fixture.source,
    tag,
    yes: false,
    wait: false,
    verify: false,
    validate: async () => ({ ready: true }),
    confirm: async () => false,
  });
  assert.equal(published.cancelled, true);
  assert.equal(
    (await execFileAsync('git', ['ls-remote', '--tags', fixture.remote, `refs/tags/${tag}`]))
      .stdout,
    ''
  );
});

test('publish composes tag, watch, and verification by default', async () => {
  const fixture = await createGitFixture();
  const tag = 'v0.1.0-rc.13';
  const calls = [];
  const published = await publishRelease({
    repositoryRoot: fixture.source,
    tag,
    yes: true,
    validate: async () => ({ ready: true }),
    watchDeployment: async (options) => {
      calls.push(['watch', options.tag]);
      return { databaseId: 13, status: 'completed', conclusion: 'success' };
    },
    verifyDeployment: async (options) => {
      calls.push(['verify', options.tag]);
      return { tag: options.tag, complete: true, checks: [] };
    },
  });
  assert.equal(published.published, true);
  assert.equal(published.run.conclusion, 'success');
  assert.equal(published.deployment.complete, true);
  assert.deepEqual(calls, [
    ['watch', tag],
    ['verify', tag],
  ]);
});

test('publish refuses a dirty or different release checkout', async () => {
  const fixture = await createGitFixture();
  await writeFile(join(fixture.source, 'untracked.txt'), 'not releasable\n');
  await assert.rejects(
    publishRelease({
      repositoryRoot: fixture.source,
      tag: 'v0.1.0-rc.11',
      dryRun: true,
      yes: true,
      wait: false,
      verify: false,
      validate: async () => ({ ready: true }),
    }),
    /not clean/
  );

  const topic = join(fixture.root, 'topic');
  await execFileAsync('git', ['clone', '--branch', 'main', fixture.remote, topic]);
  await git(topic, 'config', 'user.name', 'Release Test');
  await git(topic, 'config', 'user.email', 'release@example.invalid');
  await git(topic, 'config', 'core.hooksPath', '/dev/null');
  await git(topic, 'switch', '-c', 'tb-topic');
  await writeFile(join(topic, 'topic.txt'), 'topic change\n');
  await git(topic, 'add', 'topic.txt');
  await git(topic, 'commit', '-m', 'Topic change');
  await assert.rejects(
    publishRelease({
      repositoryRoot: topic,
      tag: 'v0.1.0-rc.12',
      dryRun: true,
      yes: true,
      wait: false,
      verify: false,
      validate: async () => ({ ready: true }),
    }),
    /checkout differs/
  );
});

test('promotion validates and tags the deployed historical commit in an isolated worktree', async () => {
  const fixture = await createGitFixture();
  await writeFile(join(fixture.source, 'README.md'), 'newer main contents\n');
  await git(fixture.source, 'add', 'README.md');
  await git(fixture.source, 'commit', '-m', 'Advance main after RC');
  await git(fixture.source, 'push', 'origin', 'main');
  const currentCommit = (await git(fixture.source, 'rev-parse', 'HEAD')).stdout.trim();
  let validationRoot = null;

  const published = await publishRelease({
    repositoryRoot: fixture.source,
    tag: 'v0.1.0',
    commit: fixture.sourceCommit,
    yes: true,
    wait: false,
    verify: false,
    requireHeadMatch: false,
    validate: async ({ repositoryRoot: checkout, sourceCommit }) => {
      validationRoot = checkout;
      assert.notEqual(checkout, fixture.source);
      assert.equal(sourceCommit, fixture.sourceCommit);
      assert.equal((await git(checkout, 'rev-parse', 'HEAD')).stdout.trim(), fixture.sourceCommit);
      assert.equal(await readFile(join(checkout, 'README.md'), 'utf8'), 'release fixture\n');
      return { ready: true };
    },
  });

  assert.equal(published.sourceCommit, fixture.sourceCommit);
  assert.equal((await git(fixture.source, 'rev-parse', 'HEAD')).stdout.trim(), currentCommit);
  const remoteTag = await execFileAsync(
    'git',
    ['ls-remote', '--tags', fixture.remote, 'refs/tags/v0.1.0^{}'],
    { encoding: 'utf8' }
  );
  assert.match(remoteTag.stdout, new RegExp(`^${fixture.sourceCommit}\\s`));
  assert(validationRoot);
  assert.equal((await git(fixture.source, 'worktree', 'list', '--porcelain')).stdout.match(/worktree /g)?.length, 1);
});

test('release list joins tags, workflow runs, and deployed provenance', async () => {
  const tag = 'v0.1.0-rc.1';
  const sourceCommit = '274465dcbea886b59b9d9534bd58a58fe94d17e8';
  const calls = [];
  const runner = (executable, args) => {
    calls.push([executable, ...args]);
    if (executable === 'git') {
      return result(
        `tag-object\trefs/tags/${tag}\n${sourceCommit}\trefs/tags/${tag}^{}\n`
      );
    }
    if (args[0] === 'run' && args[1] === 'list') {
      return result(
        `${JSON.stringify([
          {
            databaseId: 29553221557,
            displayTitle: 'Release Conductor start v0.1.0-rc.1',
            headBranch: 'main',
            headSha: sourceCommit,
            status: 'completed',
            conclusion: 'success',
            createdAt: '2026-07-17T03:46:57Z',
            updatedAt: '2026-07-17T03:48:00Z',
            url: 'https://example.invalid/run/1',
          },
        ])}\n`
      );
    }
    if (args[0] === 'repo' && args[1] === 'view') {
      return result('TrentBrown/agentic-development-workflow\n');
    }
    if (args[0] === 'api') {
      return result(
        `${JSON.stringify({
          sourceTag: tag,
          sourceCommit,
          version: '0.1.0-rc.1',
        })}\n`
      );
    }
    throw new Error(`Unexpected command: ${executable} ${args.join(' ')}`);
  };

  const releases = await listReleases({
    repositoryRoot,
    runner,
    limit: 5,
  });
  assert.equal(releases.releases.length, 1);
  assert.equal(releases.releases[0].workflow, 'success');
  assert.equal(releases.releases[0].marketplace, 'complete');
  assert(calls.some((call) => call.includes('release-conductor.yml')));
});

test('watch selects a tagged run and preserves a failed watch status', async () => {
  const tag = 'v0.1.0-rc.9';
  const run = {
    databaseId: 42,
    displayTitle: 'Release Conductor start v0.1.0-rc.9',
    headBranch: 'main',
    headSha: 'abc123',
    status: 'in_progress',
    conclusion: null,
    url: 'https://example.invalid/run/42',
  };
  const runner = (executable, args) => {
    if (args[0] === 'run' && args[1] === 'list') {
      return result(`${JSON.stringify([run])}\n`);
    }
    if (args[0] === 'run' && args[1] === 'watch') {
      throw new CommandExecutionError('release workflow failed', { exitCode: 7 });
    }
    throw new Error(`Unexpected command: ${executable} ${args.join(' ')}`);
  };

  await assert.rejects(
    watchRelease({ repositoryRoot, runner, tag, json: true }),
    (error) => error.exitCode === 7
  );
});

test('marketplace verification accepts a complete tree and rejects version drift', async () => {
  const fixture = await createGitFixture();
  const tag = 'v0.1.0-rc.10';
  const releaseRoot = await publishMarketplaceFixture(fixture, tag);

  const complete = await verifyMarketplaceRelease({
    repositoryRoot: fixture.source,
    tag,
  });
  assert.equal(complete.complete, true);
  assert(complete.checks.every((item) => item.status === 'pass'));

  const manifestPath = join(
    releaseRoot,
    'plugins/claude/agentic-development-workflow/.claude-plugin/plugin.json'
  );
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.version = '9.9.9';
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await git(releaseRoot, 'add', manifestPath);
  await git(releaseRoot, 'commit', '-m', 'Corrupt Claude version');
  await git(releaseRoot, 'push', '--force', 'origin', 'HEAD:marketplace');

  const corrupt = await verifyMarketplaceRelease({
    repositoryRoot: fixture.source,
    tag,
  });
  assert.equal(corrupt.complete, false);
  assert.equal(
    corrupt.checks.find((item) => item.id === 'claude-package')?.status,
    'fail'
  );
});

test('bundle creates a complete offline marketplace ZIP and checksum', async () => {
  const fixture = await createGitFixture();
  const tag = 'v0.1.0-rc.14';
  await publishMarketplaceFixture(fixture, tag);
  const outputDirectory = join(fixture.root, 'bundles');

  const bundle = await bundleMarketplaceRelease({
    repositoryRoot: fixture.source,
    tag,
    outputDirectory,
  });

  assert.equal(bundle.tag, tag);
  assert.equal(bundle.version, '0.1.0-rc.14');
  assert.equal(bundle.sourceCommit, fixture.sourceCommit);
  assert.match(bundle.sha256, /^[0-9a-f]{64}$/);
  assert.equal(
    await readFile(bundle.checksumPath, 'utf8'),
    `${bundle.sha256}  ${bundle.rootDirectory}.zip\n`
  );

  const listing = (
    await execFileAsync('unzip', ['-Z1', bundle.archivePath], { encoding: 'utf8' })
  ).stdout.split('\n');
  const root = `${bundle.rootDirectory}/`;
  for (const required of [
    `${root}INSTALL.md`,
    `${root}USER-GUIDE.md`,
    `${root}RELEASE.json`,
    `${root}.agents/plugins/marketplace.json`,
    `${root}.claude-plugin/marketplace.json`,
    `${root}plugins/codex/agentic-development-workflow/.codex-plugin/plugin.json`,
    `${root}plugins/claude/agentic-development-workflow/.claude-plugin/plugin.json`,
  ]) {
    assert(listing.includes(required), `missing archive entry: ${required}`);
  }
  assert(listing.filter(Boolean).every((path) => path.startsWith(root)));

  const guide = (
    await execFileAsync(
      'unzip',
      ['-p', bundle.archivePath, `${root}INSTALL.md`],
      { encoding: 'utf8' }
    )
  ).stdout;
  assert.match(guide, /codex plugin marketplace add "\$MARKETPLACE_ROOT"/);
  assert.match(guide, /claude plugin marketplace add "\$MARKETPLACE_ROOT"/);
  assert.match(guide, /workflow-doctor/);

  const userGuide = (
    await execFileAsync(
      'unzip',
      ['-p', bundle.archivePath, `${root}USER-GUIDE.md`],
      { encoding: 'utf8' }
    )
  ).stdout;
  assert.match(userGuide, /Begin with Grill Me/);

  await assert.rejects(
    bundleMarketplaceRelease({
      repositoryRoot: fixture.source,
      tag,
      outputDirectory,
    }),
    /already exists/
  );

  const replaced = await bundleMarketplaceRelease({
    repositoryRoot: fixture.source,
    tag,
    outputDirectory,
    force: true,
  });
  assert.equal(replaced.sha256, bundle.sha256);
});

test('bundle preserves output when marketplace verification fails', async () => {
  const fixture = await createGitFixture();
  const outputDirectory = join(fixture.root, 'failed bundle');
  await assert.rejects(
    bundleMarketplaceRelease({
      repositoryRoot: fixture.source,
      tag: 'v0.1.0-rc.15',
      outputDirectory,
      verifyDeployment: async () => ({
        tag: 'v0.1.0-rc.15',
        complete: false,
        checks: [{ id: 'test', status: 'fail', detail: 'fixture failure' }],
      }),
    }),
    /incomplete/
  );
  await assert.rejects(readFile(join(outputDirectory, 'anything.zip')), /ENOENT/);
});

test('release workflow exposes only conductor start and resume', async () => {
  const workflow = await readFile(
    resolve(repositoryRoot, '.github/workflows/release-conductor.yml'),
    'utf8'
  );
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /- start\n\s+- resume/);
  assert.match(workflow, /coordinated-release-prepare\.yml/);
  assert.match(workflow, /plugin release conductor discover/);
});
