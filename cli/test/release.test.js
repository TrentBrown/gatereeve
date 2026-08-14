import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { prepareRelease } from '../src/plugin/release.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const sourceRoot = resolve(repositoryRoot, 'plugin-src');

test('prepares a traceable release-candidate marketplace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workflow release '));
  const outputRoot = join(root, 'marketplace output');
  const result = await prepareRelease({
    sourceRoot,
    outputRoot,
    sourceTag: 'v0.1.0-rc.1',
    sourceCommit: 'abc123',
  });

  assert.equal(result.version, '0.1.0-rc.1');
  assert.equal(result.stable, false);
  const release = JSON.parse(await readFile(join(outputRoot, 'RELEASE.json'), 'utf8'));
  assert.equal(release.sourceTag, 'v0.1.0-rc.1');
  assert.equal(release.sourceCommit, 'abc123');
  for (const [platform, manifestPath] of [
    ['codex', '.codex-plugin/plugin.json'],
    ['claude', '.claude-plugin/plugin.json'],
  ]) {
    const packageRoot = join(
      outputRoot,
      'plugins',
      platform,
      'agentic-development-workflow'
    );
    const manifest = JSON.parse(await readFile(join(packageRoot, manifestPath), 'utf8'));
    const provenance = JSON.parse(
      await readFile(join(packageRoot, '.workflow-build/provenance.json'), 'utf8')
    );
    assert.equal(manifest.version, '0.1.0-rc.1');
    assert.equal(provenance.sourceTag, 'v0.1.0-rc.1');
    assert.equal(provenance.sourceCommit, 'abc123');
  }
});

test('requires complete Ubuntu evidence for stable publication', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workflow stable release '));
  await assert.rejects(
    prepareRelease({
      sourceRoot,
      outputRoot: join(root, 'missing evidence'),
      sourceTag: 'v0.1.0',
      sourceCommit: 'final123',
    }),
    /requires --ubuntu-rc-evidence/
  );

  const evidencePath = join(root, 'ubuntu-rc.json');
  await writeFile(
    evidencePath,
    `${JSON.stringify({
      schemaVersion: 1,
      status: 'passed',
      releaseCandidate: 'v0.1.0-rc.1',
      candidateSourceCommit: 'final123',
      ubuntu: { passed: true, version: '24.04' },
      platforms: {
        codex: { passed: true, transcript: 'evidence/codex.md' },
        claude: { passed: true, transcript: 'evidence/claude.md' },
      },
    })}\n`
  );
  const result = await prepareRelease({
    sourceRoot,
    outputRoot: join(root, 'stable'),
    sourceTag: 'v0.1.0',
    sourceCommit: 'final123',
    ubuntuRcEvidencePath: evidencePath,
  });
  assert.equal(result.stable, true);
  const release = JSON.parse(
    await readFile(join(root, 'stable/RELEASE.json'), 'utf8')
  );
  assert.equal(release.ubuntuRcEvidence.releaseCandidate, 'v0.1.0-rc.1');
});

test('rejects stable evidence for a different candidate commit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workflow mismatched evidence '));
  const evidencePath = join(root, 'ubuntu-rc.json');
  await writeFile(
    evidencePath,
    `${JSON.stringify({
      schemaVersion: 1,
      status: 'passed',
      releaseCandidate: 'v0.1.0-rc.1',
      candidateSourceCommit: 'different123',
      ubuntu: { passed: true, version: '24.04' },
      platforms: {
        codex: { passed: true, transcript: 'evidence/codex.md' },
        claude: { passed: true, transcript: 'evidence/claude.md' },
      },
    })}\n`
  );
  await assert.rejects(
    prepareRelease({
      sourceRoot,
      outputRoot: join(root, 'stable'),
      sourceTag: 'v0.1.0',
      sourceCommit: 'final123',
      ubuntuRcEvidencePath: evidencePath,
    }),
    /requires passing Ubuntu RC evidence/
  );
});

test('rejects malformed release-candidate evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workflow invalid evidence '));
  const evidencePath = join(root, 'ubuntu-rc.json');
  await writeFile(
    evidencePath,
    `${JSON.stringify({
      schemaVersion: 1,
      status: 'passed',
      releaseCandidate: 'v0.1.0-rc.not valid',
      candidateSourceCommit: 'final123',
      ubuntu: { passed: true, version: '24.04' },
      platforms: {
        codex: { passed: true, transcript: 'evidence/codex.md' },
        claude: { passed: true, transcript: 'evidence/claude.md' },
      },
    })}\n`
  );

  await assert.rejects(
    prepareRelease({
      sourceRoot,
      outputRoot: join(root, 'stable'),
      sourceTag: 'v0.1.0',
      sourceCommit: 'final123',
      ubuntuRcEvidencePath: evidencePath,
    }),
    /requires passing Ubuntu RC evidence/
  );
});

test('matches RC lineage for stable tags with build metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workflow build metadata '));
  const evidencePath = join(root, 'ubuntu-rc.json');
  await writeFile(
    evidencePath,
    `${JSON.stringify({
      schemaVersion: 1,
      status: 'passed',
      releaseCandidate: 'v0.1.0-rc.2',
      candidateSourceCommit: 'final123',
      ubuntu: { passed: true, version: '24.04' },
      platforms: {
        codex: { passed: true, transcript: 'evidence/codex.md' },
        claude: { passed: true, transcript: 'evidence/claude.md' },
      },
    })}\n`
  );

  const result = await prepareRelease({
    sourceRoot,
    outputRoot: join(root, 'stable'),
    sourceTag: 'v0.1.0+build.7',
    sourceCommit: 'final123',
    ubuntuRcEvidencePath: evidencePath,
  });
  assert.equal(result.version, '0.1.0+build.7');
  assert.equal(result.stable, true);
});

test('creates missing release output parents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workflow nested release '));
  const outputRoot = join(root, 'missing', 'parent', 'marketplace');
  await prepareRelease({
    sourceRoot,
    outputRoot,
    sourceTag: 'v0.1.0-rc.3',
    sourceCommit: 'abc123',
  });
  assert.equal(
    JSON.parse(await readFile(join(outputRoot, 'RELEASE.json'), 'utf8')).sourceTag,
    'v0.1.0-rc.3'
  );
});

test('rejects invalid tags and preserves existing output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workflow failed release '));
  const outputRoot = join(root, 'marketplace');
  await mkdir(outputRoot);
  await writeFile(join(outputRoot, 'previous-release.txt'), 'still valid');

  await assert.rejects(
    prepareRelease({
      sourceRoot,
      outputRoot,
      sourceTag: 'ordinary-push',
      sourceCommit: 'abc123',
    }),
    /Release tag must be semantic/
  );
  assert.equal(
    await readFile(join(outputRoot, 'previous-release.txt'), 'utf8'),
    'still valid'
  );

  await assert.rejects(
    prepareRelease({
      sourceRoot,
      outputRoot: join(root, 'leading-zero'),
      sourceTag: 'v01.0.0',
      sourceCommit: 'abc123',
    }),
    /Release tag must be semantic/
  );
});

test('refuses to merge a new release into previous output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workflow occupied release '));
  const outputRoot = join(root, 'marketplace');
  await mkdir(outputRoot);
  await writeFile(join(outputRoot, 'previous-release.txt'), 'still valid');

  await assert.rejects(
    prepareRelease({
      sourceRoot,
      outputRoot,
      sourceTag: 'v0.1.0-rc.2',
      sourceCommit: 'abc123',
    }),
    /Release output must be absent or empty/
  );
  assert.equal(
    await readFile(join(outputRoot, 'previous-release.txt'), 'utf8'),
    'still valid'
  );
});
