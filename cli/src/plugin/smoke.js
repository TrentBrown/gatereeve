import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { delimiter, dirname, resolve } from 'node:path';

const PLUGIN_ID = 'agentic-development-workflow';
const MARKETPLACE = 'quality-code';

async function writeJson(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function defaultRunner(executable, args, { env }) {
  try {
    return execFileSync(executable, args, {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = error.stderr?.toString().trim();
    const stdout = error.stdout?.toString().trim();
    const detail = [stderr, stdout].filter(Boolean).join('\n');
    throw new Error(
      `${executable} ${args.join(' ')} failed` + (detail ? `:\n${detail}` : '')
    );
  }
}

export async function selectCompatiblePython(environment, runner = defaultRunner) {
  const candidates = [];
  for (const directory of (environment.PATH ?? '').split(delimiter)) {
    if (!directory) continue;
    const candidate = resolve(directory, 'python3');
    if (candidates.includes(candidate)) continue;
    try {
      await access(candidate, constants.X_OK);
      candidates.push(candidate);
    } catch {
      // This PATH entry does not supply python3.
    }
  }

  for (const candidate of candidates) {
    try {
      const version = runner(candidate, ['--version'], { env: environment }).trim();
      const match = version.match(/Python\s+(\d+)\.(\d+)/);
      const major = Number(match?.[1]);
      const minor = Number(match?.[2]);
      if (match && (major > 3 || (major === 3 && minor >= 10))) {
        return candidate;
      }
    } catch {
      // Try the next executable on PATH.
    }
  }
  throw new Error('Python 3.10 or newer was not found on PATH');
}

export async function prepareLocalMarketplace({ sourceRoot, distRoot, marketplaceRoot }) {
  const root = resolve(marketplaceRoot);
  const codexCatalog = JSON.parse(
    await readFile(resolve(sourceRoot, 'catalogs/codex/marketplace.json'), 'utf8')
  );
  const claudeCatalog = JSON.parse(
    await readFile(resolve(sourceRoot, 'catalogs/claude/marketplace.json'), 'utf8')
  );

  await writeJson(resolve(root, '.agents/plugins/marketplace.json'), codexCatalog);
  await writeJson(resolve(root, '.claude-plugin/marketplace.json'), claudeCatalog);

  for (const [platform, catalog] of [
    ['codex', codexCatalog],
    ['claude', claudeCatalog],
  ]) {
    for (const plugin of catalog.plugins ?? []) {
      const catalogPath = platform === 'codex' ? plugin.source?.path : plugin.source;
      const expectedPath = `./plugins/${platform}/${plugin.name}`;
      if (catalogPath !== expectedPath) {
        throw new Error(
          `${platform} marketplace source for ${plugin.name} must be ${expectedPath}`
        );
      }
      const nestedSource = resolve(distRoot, platform, plugin.name);
      let packageSource = nestedSource;
      try {
        await access(nestedSource);
      } catch {
        if ((catalog.plugins ?? []).length !== 1) {
          throw new Error(`Built package is missing: ${nestedSource}`);
        }
        packageSource = resolve(distRoot, platform);
      }
      await cp(
        packageSource,
        resolve(root, 'plugins', platform, plugin.name),
        { recursive: true }
      );
    }
  }

  return root;
}

async function requireEmptyWorkspace(workspace) {
  try {
    const entries = await readdir(workspace);
    if (entries.length > 0) {
      throw new Error(`Smoke workspace must be empty: ${workspace}`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(workspace, { recursive: true });
  }
}

export async function installedSkillNames(pluginRoot) {
  const skillsRoot = resolve(pluginRoot, 'skills');
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const names = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await readFile(resolve(skillsRoot, entry.name, 'SKILL.md'), 'utf8');
      names.push(entry.name);
    } catch {
      // A directory without SKILL.md is not a discoverable skill.
    }
  }
  return names.sort();
}

function parseJson(output, label) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
}

export function findInstalledPackage(platform, payload, version, pluginId = PLUGIN_ID) {
  if (platform === 'codex') {
    const plugin = payload.installed?.find(
      (item) => item.pluginId === `${pluginId}@${MARKETPLACE}`
    );
    if (!plugin?.installed || !plugin.enabled || plugin.version !== version) {
      throw new Error(`Codex did not report enabled ${pluginId} ${version}`);
    }
    if (!plugin.source?.path) {
      throw new Error('Codex did not report the installed package source path');
    }
    return resolve(plugin.source.path);
  }

  const plugin = payload.find?.(
    (item) => item.id === `${pluginId}@${MARKETPLACE}`
  );
  if (!plugin?.enabled || plugin.version !== version) {
    throw new Error(`Claude Code did not report enabled ${pluginId} ${version}`);
  }
  if (!plugin.installPath) {
    throw new Error('Claude Code did not report the installed package path');
  }
  return resolve(plugin.installPath);
}

function runJson(runner, executable, args, env, label) {
  const output = runner(executable, args, { env });
  return parseJson(output, label);
}

async function verifyInstalledPlatform({
  platform,
  workspace,
  marketplaceRoot,
  version,
  plugins,
  baseEnvironment,
  runner,
  pythonExecutable,
}) {
  const profileRoot = resolve(workspace, `${platform}-home`);
  const doctorHome = resolve(workspace, `${platform}-doctor-home`);
  const gitConfig = resolve(workspace, `${platform}-gitconfig`);
  await mkdir(profileRoot, { recursive: true });
  await mkdir(doctorHome, { recursive: true });

  const platformEnvironment = {
    ...baseEnvironment,
    PATH: `${dirname(pythonExecutable)}${delimiter}${baseEnvironment.PATH ?? ''}`,
    GIT_CONFIG_GLOBAL: gitConfig,
    ...(platform === 'codex'
      ? { CODEX_HOME: profileRoot }
      : { CLAUDE_CONFIG_DIR: profileRoot }),
  };

  if (platform === 'codex') {
    runJson(
      runner,
      'codex',
      ['plugin', 'marketplace', 'add', marketplaceRoot, '--json'],
      platformEnvironment,
      'codex marketplace add'
    );
    for (const plugin of plugins) {
      runJson(
        runner,
        'codex',
        ['plugin', 'add', `${plugin.id}@${MARKETPLACE}`, '--json'],
        platformEnvironment,
        `codex plugin add ${plugin.id}`
      );
    }
  } else {
    runner(
      'claude',
      ['plugin', 'marketplace', 'add', marketplaceRoot, '--scope', 'user'],
      { env: platformEnvironment }
    );
    for (const plugin of plugins) {
      runner(
        'claude',
        ['plugin', 'install', `${plugin.id}@${MARKETPLACE}`, '--scope', 'user'],
        { env: platformEnvironment }
      );
    }
  }
  const installed = platform === 'codex'
    ? runJson(
      runner,
      'codex',
      ['plugin', 'list', '--json'],
      platformEnvironment,
      'codex plugin list'
    )
    : runJson(
      runner,
      'claude',
      ['plugin', 'list', '--json'],
      platformEnvironment,
      'claude plugin list'
    );

  const installedPlugins = [];
  for (const plugin of plugins) {
    const pluginRoot = findInstalledPackage(platform, installed, version, plugin.id);
    const skills = await installedSkillNames(pluginRoot);
    if (JSON.stringify(skills) !== JSON.stringify(plugin.expectedSkills)) {
      throw new Error(
        `${platform} ${plugin.id} skill inventory differs: expected ` +
          `${plugin.expectedSkills.length}, found ${skills.length}`
      );
    }
    installedPlugins.push({ id: plugin.id, pluginRoot, skillCount: skills.length });
  }

  const workflowPlugin = installedPlugins.find((plugin) => plugin.id === PLUGIN_ID);
  if (!workflowPlugin) throw new Error(`Smoke set must include ${PLUGIN_ID}`);
  const pluginRoot = workflowPlugin.pluginRoot;

  const scriptsRoot = resolve(pluginRoot, 'resources/scripts');
  const setup = runJson(
    runner,
    pythonExecutable,
    [
      resolve(scriptsRoot, 'workflow_setup.py'),
      '--plugin-root',
      pluginRoot,
      '--profile',
      'quality-code',
      '--branch-prefix',
      'smoke-',
      '--json',
    ],
    platformEnvironment,
    `${platform} workflow setup`
  );
  const doctor = runJson(
    runner,
    pythonExecutable,
    [
      resolve(scriptsRoot, 'workflow_doctor.py'),
      '--plugin-root',
      pluginRoot,
      '--home',
      doctorHome,
      '--activation-observed',
      '--json',
    ],
    platformEnvironment,
    `${platform} workflow doctor`
  );
  if (!doctor.ready) {
    const failed = doctor.checks
      .filter((item) => item.status === 'fail')
      .map((item) => item.id)
      .join(', ');
    throw new Error(`${platform} doctor failed: ${failed}`);
  }

  return {
    platform,
    profileRoot,
    pluginRoot,
    version,
    enabled: true,
    skillCount: installedPlugins.reduce((total, plugin) => total + plugin.skillCount, 0),
    plugins: installedPlugins,
    setup,
    doctor: { ready: true, checkCount: doctor.checks.length },
  };
}

export async function runNativeInstallSmoke({
  sourceRoot,
  distRoot,
  workspace,
  version,
  expectedSkills = null,
  plugins = null,
  environment = process.env,
  runner = defaultRunner,
  pythonExecutable,
}) {
  const root = resolve(workspace);
  await requireEmptyWorkspace(root);
  const marketplaceRoot = await prepareLocalMarketplace({
    sourceRoot,
    distRoot,
    marketplaceRoot: resolve(root, 'marketplace'),
  });
  const baseEnvironment = { ...environment };
  const selectedPython =
    pythonExecutable ?? (await selectCompatiblePython(baseEnvironment, runner));
  const smokePlugins = plugins ?? [{ id: PLUGIN_ID, expectedSkills }];
  if (smokePlugins.some((plugin) => !Array.isArray(plugin.expectedSkills))) {
    throw new Error('Every smoke plugin must declare its expected skill inventory');
  }
  const platforms = [];

  for (const platform of ['codex', 'claude']) {
    platforms.push(
      await verifyInstalledPlatform({
        platform,
        workspace: root,
        marketplaceRoot,
        version,
        plugins: smokePlugins,
        baseEnvironment,
        runner,
        pythonExecutable: selectedPython,
      })
    );
  }

  return {
    schemaVersion: 1,
    workspace: root,
    marketplaceRoot,
    activationEvidence: 'structural-simulation',
    pythonExecutable: selectedPython,
    note:
      'The doctor activation flag proves the expected session policy contract only; ' +
      'fresh-session implicit activation requires the authenticated manual procedure.',
    platforms,
  };
}
