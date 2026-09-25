import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  buildPinnedChangeInput,
  createPinnedRepositorySnapshot,
} from '../../plugin-src/shared/resources/protocol/index.js';

const run = promisify(execFile);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-pinned-fixture-'));
  const repositoryRoot = join(root, 'repository');
  await mkdir(repositoryRoot);
  await run('git', ['init', '-q', '-b', 'tb-fixture', repositoryRoot]);
  await run('git', ['-C', repositoryRoot, 'config', 'user.name', 'GateReeve Test']);
  await run('git', ['-C', repositoryRoot, 'config', 'user.email', 'test@example.invalid']);
  await mkdir(join(repositoryRoot, 'docs/issues/feature'), { recursive: true });
  await writeFile(join(repositoryRoot, 'app.txt'), 'before\n');
  await writeFile(join(repositoryRoot, 'docs/issues/feature/spec.md'), '# Spec\n');
  await run('git', ['-C', repositoryRoot, 'add', '.']);
  await run('git', ['-C', repositoryRoot, 'commit', '-qm', 'base']);
  const baseSha = (await run('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'])).stdout.trim();
  await writeFile(join(repositoryRoot, 'app.txt'), 'after\n');
  await run('git', ['-C', repositoryRoot, 'add', '.']);
  await run('git', ['-C', repositoryRoot, 'commit', '-qm', 'head']);
  const headSha = (await run('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'])).stdout.trim();
  return { root, repositoryRoot, baseSha, headSha };
}

test('materializes the exact committed tree as disposable read-only snapshot data', async () => {
  const value = await fixture();
  const snapshot = await createPinnedRepositorySnapshot({
    repositoryRoot: value.repositoryRoot,
    headSha: value.headSha,
    scratchParent: value.root,
  });
  assert.equal(await readFile(join(snapshot.repositoryPath, 'app.txt'), 'utf8'), 'after\n');
  assert.equal((await stat(join(snapshot.repositoryPath, 'app.txt'))).mode & 0o222, 0);
  assert.match(snapshot.digest, /^sha256:[a-f0-9]{64}$/u);
  const path = snapshot.repositoryPath;
  await snapshot.cleanup();
  await assert.rejects(access(path), /ENOENT/);
});

test('builds slice and feature-final packets from explicit base and head objects', async () => {
  const value = await fixture();
  const slice = await buildPinnedChangeInput({
    repositoryRoot: value.repositoryRoot,
    baseSha: value.baseSha,
    headSha: value.headSha,
    scope: 'SLICE',
    featureHome: join(value.repositoryRoot, 'docs/issues/feature'),
  });
  assert.deepEqual(slice.changedFiles, ['app.txt']);
  assert.match(slice.patch, /\+after/u);
  assert.equal(slice.documents['spec.md'], '# Spec\n');

  const feature = await buildPinnedChangeInput({
    repositoryRoot: value.repositoryRoot,
    baseSha: value.baseSha,
    headSha: value.headSha,
    scope: 'FEATURE',
    sliceBaseSha: value.baseSha,
  });
  assert.equal(feature.source.sliceBaseSha, value.baseSha);
  assert.deepEqual(feature.sliceChangedFiles, ['app.txt']);
});
