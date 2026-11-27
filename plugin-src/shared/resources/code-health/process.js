// Process, glob and TOML helpers for the code-health wrapper. Every external
// process goes through one runner so tests can substitute fake executables
// and so a missing tool is reported as data rather than thrown.
import { spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { delimiter, join } from 'node:path';

export class Unavailable extends Error {
  constructor(cause, message, details = {}) {
    super(message);
    this.cause = cause;
    this.details = details;
  }
}

export function run(command, args, { cwd, env = process.env, input, timeoutMs = 600000 } = {}) {
  return new Promise(resolve => {
    let child;
    try {
      child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ code: null, stdout: '', stderr: String(error.message), error });
      return;
    }
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', error => {
      clearTimeout(timer);
      resolve({ code: null, stdout: '', stderr: String(error.message), error });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        code,
        signal,
        timedOut: signal === 'SIGKILL',
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? '');
  });
}

export async function git(cwd, args, options = {}) {
  const result = await run('git', args, { cwd, ...options });
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim() || result.code}`);
  }
  return result.stdout;
}

async function executable(path) {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Resolve a tool the way Habit Hooks does: the project's own environments
// first, then PATH. An explicit override (flag or environment) wins.
export async function resolveTool(name, { root, override, env = process.env } = {}) {
  if (override) return (await executable(override)) ? override : null;
  const local = root ? [join(root, '.venv', 'bin', name), join(root, 'venv', 'bin', name), join(root, 'node_modules', '.bin', name)] : [];
  const onPath = (env.PATH ?? '').split(delimiter).filter(Boolean).map(directory => join(directory, name));
  for (const candidate of [...local, ...onPath]) if (await executable(candidate)) return candidate;
  return null;
}

const TOML_TO_JSON = 'import json,sys,tomllib\nprint(json.dumps(tomllib.loads(sys.stdin.read())))';

// Habit Hooks needs Python 3.11+, so a Python with tomllib is present wherever
// it can run; parsing through it avoids a second TOML implementation.
export async function parseToml(text, { python = process.env.GATEREEVE_PYTHON || 'python3' } = {}) {
  const result = await run(python, ['-I', '-c', TOML_TO_JSON], { input: text, timeoutMs: 30000 });
  if (result.code !== 0) {
    if (result.error) throw new Unavailable('missing-tool', `Python 3.11+ (${python}) is required to read Habit Hooks TOML configuration`);
    throw new Unavailable('invalid-config', `TOML could not be parsed: ${result.stderr.trim().split('\n').at(-1)}`);
  }
  return JSON.parse(result.stdout);
}

function tomlKey(key) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

function tomlValue(value) {
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(', ')}]`;
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') {
    return `{ ${Object.entries(value).map(([key, item]) => `${tomlKey(key)} = ${tomlValue(item)}`).join(', ')} }`;
  }
  throw new Error(`Unsupported TOML value: ${value}`);
}

const isTable = value => value && typeof value === 'object' && !Array.isArray(value);

// Serialize parsed configuration back to TOML: scalars and arrays first, then
// one [table] section per nested object, recursively.
function tomlBlocks(object, prefix) {
  const lines = [];
  const tables = [];
  for (const [key, value] of Object.entries(object)) {
    if (isTable(value)) tables.push([key, value]);
    else lines.push(`${tomlKey(key)} = ${tomlValue(value)}`);
  }
  const header = prefix.length && (lines.length || tables.length === 0) ? [`[${prefix.map(tomlKey).join('.')}]`] : [];
  const blocks = header.length || lines.length ? [[...header, ...lines].join('\n')] : [];
  for (const [key, value] of tables) blocks.push(...tomlBlocks(value, [...prefix, key]));
  return blocks;
}

export function stringifyToml(object) {
  return `${tomlBlocks(object, []).join('\n\n')}\n`;
}

function globSource(pattern) {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*' && pattern[index + 1] === '*') {
      const slash = pattern[index + 2] === '/';
      source += slash ? '(?:.*/)?' : '.*';
      index += slash ? 2 : 1;
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else if (char === '{') {
      const end = pattern.indexOf('}', index);
      if (end === -1) source += '\\{';
      else {
        source += `(?:${pattern.slice(index + 1, end).split(',').map(globSource).join('|')})`;
        index = end;
      }
    } else source += char.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return source;
}

export function globMatcher(pattern) {
  const regex = new RegExp(`^${globSource(pattern)}$`);
  return path => regex.test(path);
}

// Habit Hooks `files` semantics: positive globs select, `!` globs exclude.
// No positive glob means every path is selected.
export function selector(globs = []) {
  const positive = globs.filter(glob => !glob.startsWith('!')).map(globMatcher);
  const negative = globs.filter(glob => glob.startsWith('!')).map(glob => globMatcher(glob.slice(1)));
  return path => (positive.length === 0 || positive.some(match => match(path))) && !negative.some(match => match(path));
}
