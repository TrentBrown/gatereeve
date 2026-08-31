import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  inventoryPluginCandidate,
  pluginCandidateTreeSha256,
  verifyPluginCandidateIntegrity,
} from '../src/plugin/plugin-candidate-integrity.js';
import { writePluginCandidateFixture } from './helpers/plugin-candidate.js';

const source = {
  tag: 'v0.1.0-rc.9',
  commit: '1234567890abcdef1234567890abcdef12345678',
};

async function fixture() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'gatereeve-plugin-integrity-'));
  const pluginRoot = join(temporaryRoot, 'marketplace');
  const integrityPath = await writePluginCandidateFixture({ root: pluginRoot, source });
  return { temporaryRoot, pluginRoot, integrityPath };
}

async function verify(value) {
  return verifyPluginCandidateIntegrity({
    pluginRoot: value.pluginRoot,
    integrityPath: value.integrityPath,
    sourceTag: source.tag,
    sourceCommit: source.commit,
  });
}

async function withFixture(run) {
  const value = await fixture();
  try {
    await run(value);
  } finally {
    await rm(value.temporaryRoot, { recursive: true, force: true });
  }
}

test('producer integrity manifest verifies the complete Plugin candidate tree', async () => {
  await withFixture(async (value) => {
    const verified = await verify(value);
    assert.equal(verified.manifest.tree.fileCount, verified.files.length);
    assert.equal(verified.manifest.tree.sha256, pluginCandidateTreeSha256(verified.files));
    assert.match(verified.manifestSha256, /^[a-f0-9]{64}$/u);
  });
});

for (const mutation of [
  {
    name: 'a missing hidden file',
    apply: (value) => unlink(join(value.pluginRoot, '.agents/plugins/marketplace.json')),
  },
  {
    name: 'a missing visible file',
    apply: (value) => unlink(join(
      value.pluginRoot,
      'plugins/codex/agentic-development-workflow/resources/shared.txt',
    )),
  },
  {
    name: 'an unexpected extra file',
    apply: (value) => writeFile(join(value.pluginRoot, 'unexpected.txt'), 'unexpected\n'),
  },
  {
    name: 'a changed file byte',
    apply: (value) => writeFile(
      join(value.pluginRoot, 'plugins/claude/agentic-development-workflow/resources/shared.txt'),
      'changed fixture\n',
    ),
  },
]) {
  test(`verification rejects ${mutation.name}`, async () => {
    await withFixture(async (value) => {
      await mutation.apply(value);
      await assert.rejects(verify(value), /differs from its producer integrity manifest/u);
    });
  });
}

test('verification rejects a malformed integrity manifest', async () => {
  await withFixture(async (value) => {
    await writeFile(value.integrityPath, '{"schemaVersion":999}\n');
    await assert.rejects(verify(value), /integrity manifest is invalid/u);
  });
});

test('verification rejects an exact but semantically incomplete Plugin tree', async () => {
  await withFixture(async (value) => {
    await unlink(join(value.pluginRoot, '.agents/plugins/marketplace.json'));
    const files = await inventoryPluginCandidate(value.pluginRoot);
    const manifest = JSON.parse(await readFile(value.integrityPath, 'utf8'));
    manifest.tree = {
      fileCount: files.length,
      sha256: pluginCandidateTreeSha256(files),
      files,
    };
    await writeFile(value.integrityPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await assert.rejects(verify(value), /Codex marketplace catalog is missing or invalid/u);
  });
});

test('verification rejects symbolic links in the Plugin candidate tree', async () => {
  await withFixture(async (value) => {
    const target = join(value.temporaryRoot, 'outside.txt');
    const link = join(value.pluginRoot, 'linked.txt');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, 'outside\n');
    await symlink(target, link);
    await assert.rejects(verify(value), /must not contain symbolic links/u);
  });
});
