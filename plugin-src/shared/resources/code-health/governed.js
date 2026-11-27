// Governed configuration: the files that decide what the check sees. Any
// difference between the merge base and the head needs a human approval
// bound to the exact change (design D5, C1.6).
import { createHash } from 'node:crypto';
import { git, globMatcher, parseToml, Unavailable } from './process.js';
import { readCommitted, SETTINGS_PATH } from './scope.js';

export const DEFAULT_GOVERNED = Object.freeze([
  '.habit-hooks/**',
  '**/eslint.config.{js,mjs,cjs,ts,mts,cts}',
  '**/.eslintrc',
  '**/.eslintrc.*',
  '**/tsconfig.json',
  '**/tsconfig.*.json',
  '**/jsconfig.json',
  '**/ruff.toml',
  '**/.ruff.toml',
  '**/knip.json',
  '**/.knip.json',
  '**/knip.config.*',
]);

// Only the lint tables of pyproject.toml are governed, so an ordinary
// dependency change does not need a code-health approval.
export const PYPROJECT_TABLES = Object.freeze([['tool', 'ruff'], ['tool', 'habit-hooks']]);

const IGNORED = /(^|\/)(node_modules|\.venv|venv|\.git)\//;

export const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export const identity = value => sha256(canonical(value));

async function treeBlobs(root, commit) {
  const output = await git(root, ['ls-tree', '-r', '-z', commit]);
  const blobs = new Map();
  for (const entry of output.split('\0').filter(Boolean)) {
    const tab = entry.indexOf('\t');
    const [, type, object] = entry.slice(0, tab).split(' ');
    if (type === 'blob') blobs.set(entry.slice(tab + 1), object);
  }
  return blobs;
}

async function extraGlobs(root, commit) {
  const text = await readCommitted(root, commit, SETTINGS_PATH);
  if (text === null) return [];
  let settings;
  try {
    settings = JSON.parse(text);
  } catch {
    throw new Unavailable('invalid-config', `${SETTINGS_PATH} at ${commit.slice(0, 12)} is not valid JSON`);
  }
  const globs = settings.governedPaths ?? [];
  if (!Array.isArray(globs) || !globs.every(glob => typeof glob === 'string' && glob.length > 0)) {
    throw new Unavailable('invalid-config', `${SETTINGS_PATH} governedPaths must be an array of glob strings`);
  }
  return globs;
}

function pick(object, path) {
  return path.reduce((value, key) => (value && typeof value === 'object' ? value[key] : undefined), object) ?? null;
}

async function pyprojectHash(root, object, options) {
  const text = await git(root, ['cat-file', 'blob', object]);
  let parsed;
  try {
    parsed = await parseToml(text, options);
  } catch (error) {
    if (error instanceof Unavailable && error.cause === 'invalid-config') return sha256(text);
    throw error;
  }
  return identity(PYPROJECT_TABLES.map(path => [path.join('.'), pick(parsed, path)]));
}

async function governedHashes(root, commit, matchers, options) {
  const hashes = {};
  for (const [path, object] of await treeBlobs(root, commit)) {
    if (IGNORED.test(path)) continue;
    if (/(^|\/)pyproject\.toml$/.test(path)) {
      hashes[path] = await pyprojectHash(root, object, options);
    } else if (matchers.some(match => match(path))) {
      hashes[path] = `git:${object}`;
    }
  }
  return hashes;
}

// The governed-change subject names exactly which governed files differ, and
// how. Approving it approves that change and nothing else.
export async function governedChange(root, mergeBase, head, options) {
  const globs = [...new Set([...DEFAULT_GOVERNED, ...await extraGlobs(root, mergeBase), ...await extraGlobs(root, head)])];
  const matchers = globs.map(globMatcher);
  const base = await governedHashes(root, mergeBase, matchers, options);
  const current = await governedHashes(root, head, matchers, options);
  const changes = [...new Set([...Object.keys(base), ...Object.keys(current)])]
    .sort()
    .filter(path => base[path] !== current[path])
    .map(path => ({ path, base: base[path] ?? null, head: current[path] ?? null }));
  return {
    globs,
    hashes: current,
    baseHashes: base,
    changes,
    subject: changes.length ? identity({ policy: 'code-health-governed/1', changes }) : null,
  };
}
