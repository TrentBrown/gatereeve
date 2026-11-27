// Tool identity for the base-result cache and the receipt (design §4): the
// wrapper itself, Habit Hooks and its plugins, and the analysers they run.
import { existsSync } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveTool, run } from './process.js';

// Bump when the comparison, neutralization or scoping rules change, so cached
// baselines from an earlier wrapper are never reused.
export const WRAPPER_VERSION = 'gatereeve-code-health/2';

const COMMANDS = ['eslint', 'ruff', 'knip', 'deptry'];
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

// Habit Hooks plugins are Python distributions installed beside habit-sensors;
// its own interpreter (from the script's shebang) reports their versions.
async function pluginVersions(sensors, env) {
  let interpreter = null;
  try {
    const line = await firstLine(sensors);
    if (line.startsWith('#!') && /python/.test(line)) interpreter = line.slice(2).trim().split(/\s+/);
  } catch {
    return null;
  }
  if (!interpreter) return null;
  const [command, ...args] = interpreter[0].endsWith('/env') ? interpreter.slice(1) : interpreter;
  const result = await run(command, [...args, '-I', '-c', PLUGIN_VERSIONS], { env, timeoutMs: 30000 });
  if (result.code !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
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
