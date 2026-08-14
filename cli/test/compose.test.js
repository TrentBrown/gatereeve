import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';

import { composePackages } from '../src/plugin/compose.js';

async function writeJson(path, value) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'workflow plugin build '));
  const sourceRoot = join(root, 'source with spaces');
  const distRoot = join(root, 'dist with spaces');

  await mkdir(join(sourceRoot, 'shared/skills/example'), { recursive: true });
  await mkdir(join(sourceRoot, 'shared/resources/scripts'), { recursive: true });
  await writeFile(
    join(sourceRoot, 'shared/skills/example/SKILL.md'),
    '---\nname: example\ndescription: Test skill.\n---\n'
  );
  await writeFile(
    join(sourceRoot, 'shared/resources/scripts/helper.py'),
    'print("ok")\n'
  );

  await writeJson(join(sourceRoot, 'codex/.codex-plugin/plugin.json'), {
    name: 'fixture-plugin',
    version: '0.0.0',
    description: 'fixture',
  });
  await writeJson(join(sourceRoot, 'claude/.claude-plugin/plugin.json'), {
    name: 'fixture-plugin',
    version: '0.0.0',
    description: 'fixture',
  });

  return { root, sourceRoot, distRoot };
}

async function fingerprintTree(root) {
  const files = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else {
        files.push(path);
      }
    }
  }

  await visit(root);
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(relative(root, file));
    hash.update(await readFile(file));
  }
  return hash.digest('hex');
}

test('composes both packages with matching shared content and provenance', async () => {
  const fixture = await createFixture();
  const result = await composePackages({
    sourceRoot: fixture.sourceRoot,
    distRoot: fixture.distRoot,
    version: '1.2.3',
    sourceCommit: 'abc123',
    sourceTag: 'v1.2.3',
  });

  assert.deepEqual(
    result.packages.map((item) => item.platform),
    ['codex', 'claude']
  );

  const codexSkill = await readFile(
    join(fixture.distRoot, 'codex/skills/example/SKILL.md'),
    'utf8'
  );
  const claudeSkill = await readFile(
    join(fixture.distRoot, 'claude/skills/example/SKILL.md'),
    'utf8'
  );
  assert.equal(codexSkill, claudeSkill);

  const codexManifest = JSON.parse(
    await readFile(
      join(fixture.distRoot, 'codex/.codex-plugin/plugin.json'),
      'utf8'
    )
  );
  const claudeManifest = JSON.parse(
    await readFile(
      join(fixture.distRoot, 'claude/.claude-plugin/plugin.json'),
      'utf8'
    )
  );
  assert.equal(codexManifest.version, '1.2.3');
  assert.equal(claudeManifest.version, '1.2.3');

  const codexShared = await readFile(
    join(fixture.distRoot, 'codex/.workflow-build/shared-files.json'),
    'utf8'
  );
  const claudeShared = await readFile(
    join(fixture.distRoot, 'claude/.workflow-build/shared-files.json'),
    'utf8'
  );
  assert.equal(codexShared, claudeShared);

  const provenance = JSON.parse(
    await readFile(
      join(fixture.distRoot, 'codex/.workflow-build/provenance.json'),
      'utf8'
    )
  );
  assert.deepEqual(provenance, {
    schemaVersion: 1,
    platform: 'codex',
    version: '1.2.3',
    sourceCommit: 'abc123',
    sourceTag: 'v1.2.3',
  });
});

test('removes stale package output before rebuilding', async () => {
  const fixture = await createFixture();
  await mkdir(join(fixture.distRoot, 'codex'), { recursive: true });
  await writeFile(join(fixture.distRoot, 'codex/stale.txt'), 'stale');

  await composePackages({
    sourceRoot: fixture.sourceRoot,
    distRoot: fixture.distRoot,
    platforms: ['codex'],
    version: '1.0.0',
    sourceCommit: 'abc123',
  });

  await assert.rejects(
    readFile(join(fixture.distRoot, 'codex/stale.txt')),
    /ENOENT/
  );
});

test('produces identical content for identical inputs', async () => {
  const fixture = await createFixture();
  const input = {
    sourceRoot: fixture.sourceRoot,
    distRoot: fixture.distRoot,
    version: '1.0.0',
    sourceCommit: 'abc123',
  };

  await composePackages(input);
  const first = await fingerprintTree(fixture.distRoot);
  await composePackages(input);
  const second = await fingerprintTree(fixture.distRoot);

  assert.equal(first, second);
});

test('rejects overlay paths that duplicate shared content', async () => {
  const fixture = await createFixture();
  await mkdir(join(fixture.sourceRoot, 'codex/skills/example'), {
    recursive: true,
  });
  await writeFile(
    join(fixture.sourceRoot, 'codex/skills/example/SKILL.md'),
    'duplicate'
  );

  await assert.rejects(
    composePackages({
      sourceRoot: fixture.sourceRoot,
      distRoot: fixture.distRoot,
      platforms: ['codex'],
      version: '1.0.0',
      sourceCommit: 'abc123',
    }),
    /overlay duplicates shared paths/
  );
});

test('rejects symlinks so generated packages remain self-contained', async () => {
  const fixture = await createFixture();
  await symlink(
    join(fixture.sourceRoot, 'shared/resources/scripts/helper.py'),
    join(fixture.sourceRoot, 'shared/resources/scripts/helper-link.py')
  );

  await assert.rejects(
    composePackages({
      sourceRoot: fixture.sourceRoot,
      distRoot: fixture.distRoot,
      platforms: ['claude'],
      version: '1.0.0',
      sourceCommit: 'abc123',
    }),
    /symlink found/
  );
});

test('rejects transient interpreter and operating-system files', async () => {
  const fixture = await createFixture();
  await mkdir(join(fixture.sourceRoot, 'shared/resources/scripts/__pycache__'));
  await writeFile(
    join(fixture.sourceRoot, 'shared/resources/scripts/__pycache__/helper.pyc'),
    'transient'
  );

  await assert.rejects(
    composePackages({
      sourceRoot: fixture.sourceRoot,
      distRoot: fixture.distRoot,
      platforms: ['codex'],
      version: '1.0.0',
      sourceCommit: 'abc123',
    }),
    /Transient file must not enter plugin sources/
  );
});

test('rejects invalid versions and unsupported platforms', async () => {
  const fixture = await createFixture();

  await assert.rejects(
    composePackages({
      sourceRoot: fixture.sourceRoot,
      distRoot: fixture.distRoot,
      platforms: ['codex'],
      version: 'latest',
      sourceCommit: 'abc123',
    }),
    /Invalid semantic version/
  );

  await assert.rejects(
    composePackages({
      sourceRoot: fixture.sourceRoot,
      distRoot: fixture.distRoot,
      platforms: ['cursor'],
      version: '1.0.0',
      sourceCommit: 'abc123',
    }),
    /Unsupported platform/
  );

  await assert.rejects(
    composePackages({
      sourceRoot: fixture.sourceRoot,
      distRoot: fixture.distRoot,
      platforms: ['codex', 'codex'],
      version: '1.0.0',
      sourceCommit: 'abc123',
    }),
    /must be unique/
  );
});

test('rejects platform manifests with different plugin identities', async () => {
  const fixture = await createFixture();
  await writeJson(join(fixture.sourceRoot, 'claude/.claude-plugin/plugin.json'), {
    name: 'different-plugin',
    version: '0.0.0',
  });

  await assert.rejects(
    composePackages({
      sourceRoot: fixture.sourceRoot,
      distRoot: fixture.distRoot,
      version: '1.0.0',
      sourceCommit: 'abc123',
    }),
    /must use one plugin identity/
  );
});
