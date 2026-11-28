// Tool identity for the base-result cache and the receipt (design §4): the
// wrapper itself, Habit Hooks and its plugins, and the analysers they run.
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdtemp, open, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { parseToml, resolveTool, run } from './process.js';
import { readCommitted } from './scope.js';
import { environmentLinks } from './worktree.js';

// Bump when the comparison, neutralization or scoping rules change, so cached
// baselines from an earlier wrapper are never reused.
export const WRAPPER_VERSION = 'gatereeve-code-health/6';

const COMMANDS = ['eslint', 'ruff', 'knip', 'deptry', 'jscpd'];
const PACKAGES = ['typescript', 'typescript-eslint', '@typescript-eslint/parser', '@typescript-eslint/eslint-plugin', 'ts-morph'];
const PLUGIN_VERSIONS = 'import importlib.metadata as m, json\nprint(json.dumps({d.metadata["Name"]: d.version for d in m.distributions() if (d.metadata["Name"] or "").lower().startswith("habit-hooks")}, sort_keys=True))';

async function firstLine(path) {
  const handle = await open(path, 'r');
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(512), 0, 512, 0);
    return buffer.subarray(0, bytesRead).toString('utf8').split('\n')[0];
  } finally {
    await handle.close();
  }
}

// The Python that runs habit-sensors: GATEREEVE_HABIT_PYTHON, the script's
// python shebang, or the interpreter installed beside it (a venv or pipx
// launcher that is not itself a Python script).
async function habitPython(sensors, env) {
  if (env.GATEREEVE_HABIT_PYTHON) return [env.GATEREEVE_HABIT_PYTHON];
  try {
    const line = await firstLine(sensors);
    if (line.startsWith('#!') && /python/.test(line)) {
      const interpreter = line.slice(2).trim().split(/\s+/);
      return interpreter[0].endsWith('/env') ? interpreter.slice(1) : interpreter;
    }
  } catch {
    return null;
  }
  for (const name of ['python3', 'python']) {
    const sibling = join(dirname(sensors), name);
    if (existsSync(sibling)) return [sibling];
  }
  return null;
}

// Habit Hooks plugins are Python distributions installed beside habit-sensors;
// its own interpreter reports their versions. Not -I, which hides user-site
// installs, and not -P, which Python 3.10 lacks: the working directory is a
// fresh empty temporary directory, so nothing can be imported from it.
async function habitQuery(sensors, env, script, ...argv) {
  const interpreter = await habitPython(sensors, env);
  if (!interpreter) return null;
  const [command, ...args] = interpreter;
  const cwd = await mkdtemp(join(tmpdir(), 'gatereeve-habit-python-'));
  try {
    const result = await run(command, [...args, '-c', script, ...argv], { cwd, env, timeoutMs: 60000 });
    return result.code === 0 ? JSON.parse(result.stdout) : null;
  } catch {
    return null;
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

export async function pluginVersions(sensors, env) {
  const parsed = await habitQuery(sensors, env, PLUGIN_VERSIONS);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
}

// For a plugin GateReeve has no sensor table for (a custom vendored or
// installed one), Habit Hooks itself says which of the tools the plugin
// declares cannot be reached: the detectors its own init reports.
const MISSING_DETECTORS = 'import json, sys\nfrom pathlib import Path\nfrom habit_hooks.config import declared_detectors\nfrom habit_hooks.missing_tools import missing_tools\nroot = Path(sys.argv[2])\nprint(json.dumps([{"name": d.name, "install": d.install} for d in missing_tools(declared_detectors(json.loads(sys.argv[1]), root), root)]))';

async function missingDetectors(sensors, env, plugins, root) {
  const parsed = await habitQuery(sensors, env, MISSING_DETECTORS, JSON.stringify(plugins), root);
  return Array.isArray(parsed) && parsed.every(item => item && typeof item.name === 'string') ? parsed : null;
}

async function packageVersion(directory, name) {
  const path = join(directory, name, 'package.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

// The node_modules directory holding an executable, if it is a package's bin
// (node_modules/.bin/x or node_modules/pkg/bin/x, possibly global).
async function enclosingModules(executable) {
  let path;
  try {
    path = await realpath(executable);
  } catch {
    return null;
  }
  const parts = path.split(sep);
  const index = parts.lastIndexOf('node_modules');
  return index > 0 ? parts.slice(0, index + 1).join(sep) : null;
}

// Every node_modules the analysers can load packages from: the root's, each
// package-local one the worktrees link, and the one holding each resolved
// command. A package's identity is its version in each place, so upgrading a
// package-local typescript-eslint changes the cache key (codex/F2, round 6).
async function moduleDirectories(root, executables) {
  const directories = new Set((await environmentLinks(root)).filter(name => name.endsWith('node_modules')).map(name => join(root, name)));
  for (const executable of executables) {
    const directory = await enclosingModules(executable);
    if (directory) directories.add(directory);
  }
  return [...directories].sort();
}

// What is installed in a node_modules: its package manager's record of the
// whole tree where there is one, and every top-level package's version, so
// any upgraded rule plugin changes the identity (round 7 codex/F2).
const TREE_RECORDS = ['.package-lock.json', '.modules.yaml', '.yarn-state.yml', '.yarn-integrity'];

async function installedTree(directory) {
  const hash = createHash('sha256');
  for (const record of TREE_RECORDS) {
    try {
      hash.update(`${record}\0`).update(await readFile(join(directory, record))).update('\0');
    } catch {}
  }
  let names = [];
  try {
    for (const entry of (await readdir(directory)).sort()) {
      if (entry.startsWith('.')) continue;
      if (entry.startsWith('@')) {
        try {
          names.push(...(await readdir(join(directory, entry))).sort().map(name => `${entry}/${name}`));
        } catch {}
      } else names.push(entry);
    }
  } catch {
    return null;
  }
  for (const name of names) hash.update(`${name}@${await packageVersion(directory, name)}\0`);
  return `sha256:${hash.digest('hex')}`;
}

const label = (root, directory) => {
  const path = relative(root, directory);
  return path.startsWith('..') ? directory : path.split(sep).join('/');
};

export async function toolVersions({ root, sensors, sensorsVersion, env }) {
  const versions = { wrapper: WRAPPER_VERSION, habitSensors: sensorsVersion, plugins: await pluginVersions(sensors, env) };
  const executables = [];
  for (const name of COMMANDS) {
    const executable = await resolveTool(name, { root, env });
    if (!executable) {
      versions[name] = null;
      continue;
    }
    executables.push(executable);
    const result = await run(executable, ['--version'], { cwd: root, env, timeoutMs: 30000 });
    versions[name] = result.code === 0 ? result.stdout.trim().split('\n')[0] : null;
  }
  const directories = await moduleDirectories(root, executables);
  for (const name of PACKAGES) {
    const found = {};
    for (const directory of directories) {
      const version = await packageVersion(directory, name);
      if (version !== null) found[label(root, directory)] = version;
    }
    versions[name] = Object.keys(found).length ? found : null;
  }
  versions.nodeModules = {};
  for (const directory of directories) versions.nodeModules[label(root, directory)] = await installedTree(directory);
  return versions;
}

// The tool each Habit Hooks 1.5.0 plugin sensor needs, and how to install it.
export const SENSOR_TOOLS = Object.freeze({
  typescript: [['eslint', 'node-module', 'eslint'], ['knip', 'node-module', 'knip'], ['comment', 'node-module', 'ts-morph']],
  python: [['ruff', 'command', 'ruff'], ['deptry', 'command', 'deptry']],
  generic: [['jscpd', 'command', 'jscpd']],
  gatereeve: [['ruff-s110', 'command', 'ruff']],
});
export const INSTALL = Object.freeze({
  eslint: 'npm install --save-dev eslint typescript typescript-eslint', knip: 'npm install --save-dev knip', 'ts-morph': 'npm install --save-dev ts-morph',
  ruff: 'pip install ruff', deptry: 'pip install deptry', jscpd: 'npm install --save-dev jscpd',
});

async function vendoredSensors(root, head, plugin) {
  const text = await readCommitted(root, head, `.habit-hooks/${plugin}/config.toml`);
  if (text === null) return null;
  try {
    const sensors = (await parseToml(text)).sensors ?? [];
    return Array.isArray(sensors) ? sensors : [];
  } catch {
    return [];
  }
}

// Every configured plugin and every enabled sensor's tool, checked before any
// run, so a missing piece is UNAVAILABLE even when nothing is in scope.
export async function missingTooling({ root, head, config, env, sensors }) {
  const missing = [];
  const installed = await pluginVersions(sensors, env);
  // Unknown plugin inventory is not "everything installed": the run cannot
  // prove its plugins, and cached baselines could not be keyed by them.
  if (!installed) missing.push('the Habit Hooks plugin inventory (could not find the Python that runs habit-sensors; set GATEREEVE_HABIT_PYTHON to it)');
  const tools = [], unknown = [];
  for (const plugin of config.plugins ?? []) {
    const vendored = await vendoredSensors(root, head, plugin);
    if (vendored === null && installed && !installed[`habit-hooks-${plugin}`]) missing.push(`Habit Hooks plugin ${plugin} (pip install habit-hooks-${plugin})`);
    if (SENSOR_TOOLS[plugin]) tools.push(...SENSOR_TOOLS[plugin].filter(([sensor]) => vendored === null || vendored.includes(sensor)));
    else unknown.push(plugin);
  }
  // A plugin without a GateReeve table is asked of Habit Hooks; an answer it
  // cannot give is UNAVAILABLE, never "nothing missing" (round 7 codex/F15).
  if (unknown.length && installed) {
    const absent = await missingDetectors(sensors, env, unknown, root);
    if (!absent) missing.push(`the tools declared by plugin ${unknown.join(', ')} (Habit Hooks could not report them)`);
    else for (const detector of absent) missing.push(`${detector.name}, declared by plugin ${unknown.join(', ')} (${detector.install ?? `install ${detector.name}`})`);
  }
  const seen = new Set();
  for (const [sensor, kind, tool] of tools) {
    if (config.sensors?.[sensor]?.disabled === true || seen.has(tool)) continue;
    seen.add(tool);
    // A node module may be a root dependency or only resolvable as a command
    // (.venv/bin, node_modules/.bin, PATH), as Habit Hooks accepts.
    const present = (kind === 'node-module' && existsSync(join(root, 'node_modules', tool, 'package.json')))
      || Boolean(await resolveTool(tool, { root, env }));
    if (!present) missing.push(`${tool}, needed by sensor ${sensor} (${INSTALL[tool] ?? `install ${tool}`})`);
  }
  return missing;
}
