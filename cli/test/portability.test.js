import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { lintPortability } from '../src/plugin/portability.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');

test('lints the canonical repository plugin sources', async () => {
  const result = await lintPortability(resolve(repositoryRoot, 'plugin-src'));
  assert.equal(result.existingSkillCount, 27);
  assert(result.fileCount > 50);
});

test('rejects personal paths before inventory validation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workflow portability '));
  await mkdir(join(root, 'shared/skills/example'), { recursive: true });
  await writeFile(
    join(root, 'shared/skills/example/SKILL.md'),
    'Read /Users/example/private/file.md\n'
  );

  await assert.rejects(lintPortability(root), /personal macOS home path/);
});

test('rejects root escapes and native platform markers in shared source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workflow portability '));
  await mkdir(join(root, 'shared/skills/example'), { recursive: true });
  await writeFile(
    join(root, 'shared/skills/example/SKILL.md'),
    'Run ../outside.py through ${PLUGIN_ROOT}.\n'
  );

  await assert.rejects(lintPortability(root), /plugin-root escape/);
});

test('rejects symlinks in canonical package sources', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workflow portability '));
  await mkdir(join(root, 'shared/skills/example'), { recursive: true });
  await writeFile(join(root, 'outside.md'), 'outside\n');
  await symlink(join(root, 'outside.md'), join(root, 'shared/skills/example/SKILL.md'));

  await assert.rejects(lintPortability(root), /must not contain symlinks/);
});
