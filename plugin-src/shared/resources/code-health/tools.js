// Tool identity for the base-result cache and the receipt (design §4): the
// wrapper itself, Habit Hooks and its plugins, and the analysers they run.
import { existsSync } from 'node:fs';
import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseToml, resolveTool, run } from './process.js';
import { readCommitted } from './scope.js';

// Bump when the comparison, neutralization or scoping rules change, so cached
// baselines from an earlier wrapper are never reused.
export const WRAPPER_VERSION = 'gatereeve-code-health/4';

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
// its own interpreter reports their versions. -P (not -I) keeps user-site
// installs visible while never importing from the working directory, which
// is a fresh temporary directory anyway.
export async function pluginVersions(sensors, env) {
  const interpreter = await habitPython(sensors, env);
  if (!interpreter) return null;
  const [command, ...args] = interpreter;
  const cwd = await mkdtemp(join(tmpdir(), 'gatereeve-habit-python-'));
  try {
    const result = await run(command, [...args, '-P', '-c', PLUGIN_VERSIONS], { cwd, env, timeoutMs: 30000 });
    if (result.code !== 0) return null;
    const parsed = JSON.parse(result.stdout);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function packageVersion(root, name) {
  const path = join(root, 'node_modules', name, 'package.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

export async function toolVersions({ root, sensors, sensorsVersion, env }) {
  const versions = { wrapper: WRAPPER_VERSION, habitSensors: sensorsVersion, plugins: await pluginVersions(sensors, env) };
  for (const name of COMMANDS) {
    const executable = await resolveTool(name, { root, env });
    if (!executable) {
      versions[name] = null;
      continue;
    }
    const result = await run(executable, ['--version'], { cwd: root, env, timeoutMs: 30000 });
    versions[name] = result.code === 0 ? result.stdout.trim().split('\n')[0] : null;
  }
  for (const name of PACKAGES) versions[name] = await packageVersion(root, name);
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
  const tools = [];
  for (const plugin of config.plugins ?? []) {
    const vendored = await vendoredSensors(root, head, plugin);
    if (vendored === null && installed && !installed[`habit-hooks-${plugin}`]) missing.push(`Habit Hooks plugin ${plugin} (pip install habit-hooks-${plugin})`);
    tools.push(...(SENSOR_TOOLS[plugin] ?? []).filter(([sensor]) => vendored === null || vendored.includes(sensor)));
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
