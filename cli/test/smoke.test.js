import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  installedSkillNames,
  prepareLocalMarketplace,
  runNativeInstallSmoke,
  selectCompatiblePython,
} from '../src/plugin/smoke.js';

async function writeJson(path, value) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'workflow smoke '));
  const sourceRoot = join(root, 'source');
  const distRoot = join(root, 'dist');
  const workspace = join(root, 'workspace');
  const expectedSkills = ['alpha', 'beta'];

  await writeJson(join(sourceRoot, 'catalogs/codex/marketplace.json'), {
    name: 'quality-code',
    plugins: [
      {
        name: 'agentic-development-workflow',
        source: {
          source: 'local',
          path: './plugins/codex/agentic-development-workflow',
        },
      },
    ],
  });
  await writeJson(join(sourceRoot, 'catalogs/claude/marketplace.json'), {
    name: 'quality-code',
    plugins: [
      {
        name: 'agentic-development-workflow',
        source: './plugins/claude/agentic-development-workflow',
      },
    ],
  });

  for (const platform of ['codex', 'claude']) {
    for (const skill of expectedSkills) {
      const skillRoot = join(distRoot, platform, 'skills', skill);
      await mkdir(skillRoot, { recursive: true });
      await writeFile(join(skillRoot, 'SKILL.md'), `---\nname: ${skill}\n---\n`);
    }
    await mkdir(join(distRoot, platform, 'resources/scripts'), { recursive: true });
  }

  return { root, sourceRoot, distRoot, workspace, expectedSkills };
}

test('assembles native marketplace layout from generated packages', async () => {
  const fixture = await createFixture();
  const marketplaceRoot = await prepareLocalMarketplace({
    sourceRoot: fixture.sourceRoot,
    distRoot: fixture.distRoot,
    marketplaceRoot: join(fixture.root, 'marketplace'),
  });

  const codexCatalog = JSON.parse(
    await readFile(join(marketplaceRoot, '.agents/plugins/marketplace.json'), 'utf8')
  );
  const claudeCatalog = JSON.parse(
    await readFile(join(marketplaceRoot, '.claude-plugin/marketplace.json'), 'utf8')
  );
  assert.equal(codexCatalog.name, 'quality-code');
  assert.equal(claudeCatalog.name, 'quality-code');
  assert.deepEqual(
    await installedSkillNames(
      join(marketplaceRoot, 'plugins/codex/agentic-development-workflow')
    ),
    fixture.expectedSkills
  );
});

test('verifies native manager installation, discovery, setup, and doctor', async () => {
  const fixture = await createFixture();
  let marketplaceRoot;
  const calls = [];
  const runner = (executable, args, { env }) => {
    calls.push({ executable, args, env });
    if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'add') {
      marketplaceRoot = args[3];
      return executable === 'codex' ? '{}\n' : 'Marketplace added\n';
    }
    if (executable === 'codex' && args[0] === 'plugin' && args[1] === 'add') {
      return '{}\n';
    }
    if (executable === 'claude' && args[0] === 'plugin' && args[1] === 'install') {
      return 'Installed\n';
    }
    if (executable === 'codex' && args[0] === 'plugin' && args[1] === 'list') {
      return JSON.stringify({
        installed: [
          {
            pluginId: 'agentic-development-workflow@quality-code',
            version: '0.1.0',
            installed: true,
            enabled: true,
            source: {
              path: join(
                marketplaceRoot,
                'plugins/codex/agentic-development-workflow'
              ),
            },
          },
        ],
      });
    }
    if (executable === 'claude' && args[0] === 'plugin' && args[1] === 'list') {
      return JSON.stringify([
        {
          id: 'agentic-development-workflow@quality-code',
          version: '0.1.0',
          enabled: true,
          installPath: join(
            marketplaceRoot,
            'plugins/claude/agentic-development-workflow'
          ),
        },
      ]);
    }
    if (executable === 'python3' && args[0].endsWith('workflow_setup.py')) {
      return JSON.stringify({ profile: 'quality-code', branchPrefix: 'smoke-' });
    }
    if (executable === 'python3' && args[0].endsWith('workflow_doctor.py')) {
      return JSON.stringify({
        ready: true,
        checks: [{ id: 'activation-observed', status: 'pass' }],
      });
    }
    throw new Error(`Unexpected command: ${executable} ${args.join(' ')}`);
  };

  const result = await runNativeInstallSmoke({
    sourceRoot: fixture.sourceRoot,
    distRoot: fixture.distRoot,
    workspace: fixture.workspace,
    version: '0.1.0',
    expectedSkills: fixture.expectedSkills,
    environment: { HOME: '/real-home', PATH: '/test/bin' },
    runner,
    pythonExecutable: 'python3',
  });

  assert.equal(result.activationEvidence, 'structural-simulation');
  assert.deepEqual(
    result.platforms.map((item) => [item.platform, item.skillCount, item.doctor.ready]),
    [
      ['codex', 2, true],
      ['claude', 2, true],
    ]
  );
  assert.ok(calls.some((item) => item.env.CODEX_HOME));
  assert.ok(calls.some((item) => item.env.CLAUDE_CONFIG_DIR));
  assert.ok(calls.every((item) => item.env.HOME === '/real-home'));
});

test('selects a compatible python later on PATH', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workflow python '));
  const oldRoot = join(root, 'old');
  const newRoot = join(root, 'new');
  const oldPython = join(oldRoot, 'python3');
  const newPython = join(newRoot, 'python3');
  await mkdir(oldRoot);
  await mkdir(newRoot);
  await writeFile(oldPython, 'fixture');
  await writeFile(newPython, 'fixture');
  await chmod(oldPython, 0o755);
  await chmod(newPython, 0o755);

  const selected = await selectCompatiblePython(
    { PATH: `${oldRoot}:${newRoot}` },
    (executable) => (executable === oldPython ? 'Python 3.9.6\n' : 'Python 3.10.12\n')
  );
  assert.equal(selected, newPython);
});

test('refuses to reuse a nonempty smoke workspace', async () => {
  const fixture = await createFixture();
  await mkdir(fixture.workspace, { recursive: true });
  await writeFile(join(fixture.workspace, 'keep.txt'), 'do not overwrite');

  await assert.rejects(
    runNativeInstallSmoke({
      sourceRoot: fixture.sourceRoot,
      distRoot: fixture.distRoot,
      workspace: fixture.workspace,
      version: '0.1.0',
      expectedSkills: fixture.expectedSkills,
      environment: { PATH: '/test/bin' },
      runner: () => '{}',
      pythonExecutable: 'python3',
    }),
    /Smoke workspace must be empty/
  );
  assert.equal(await readFile(join(fixture.workspace, 'keep.txt'), 'utf8'), 'do not overwrite');
});
