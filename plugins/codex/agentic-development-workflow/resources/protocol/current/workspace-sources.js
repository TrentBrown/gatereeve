import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { requireThat } from './contracts.js';

const portable = path => path.split(sep).join('/');
function matcher(pattern) {
  requireThat(typeof pattern === 'string' && pattern && !isAbsolute(pattern)
    && !pattern.split('/').includes('..') && !/[{}[\]\\]/u.test(pattern),
  'Unsupported workspace pattern; declare its source packages explicitly');
  const expression = pattern.replace(/^\.\//u, '').replace(/\/$/u, '').split('/').map(part => {
    if (part === '**') return '.*';
    return part.split('').map(char => char === '*' ? '[^/]*' : char === '?' ? '[^/]' : char.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('');
  }).join('/');
  return new RegExp(`^${expression}$`, 'u');
}

function pnpmPackages(text) {
  const lines = text.split(/\r?\n/u), result = [];
  const start = lines.findIndex(line => /^packages\s*:/u.test(line));
  if (start < 0) return result;
  const inline = lines[start].replace(/^packages\s*:/u, '').trim();
  if (inline && !inline.startsWith('#')) {
    requireThat(/^\[.*\]$/u.test(inline), 'Unsupported pnpm packages declaration; declare source packages explicitly');
    return inline.slice(1, -1).split(',').map(item => item.trim().replace(/^(['"])(.*)\1$/u, '$2')).filter(Boolean);
  }
  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || /^\s*#/u.test(line)) continue;
    if (/^\S/u.test(line)) break;
    const item = line.match(/^\s+-\s+(?:'([^']*)'|"([^"]*)"|([^#\s]+))\s*(?:#.*)?$/u);
    requireThat(item, 'Unsupported pnpm workspace entry; declare source packages explicitly');
    result.push(item[1] ?? item[2] ?? item[3]);
  }
  return result;
}

export async function workspaceSources(root, pin, declared = []) {
  requireThat(Array.isArray(declared) && declared.every(item => typeof item === 'string'), 'Workspace sources must be repository-relative package paths');
  const tracked = new Set((pin.files ?? []).map(item => item.path));
  const patterns = [];
  if (tracked.has('package.json')) {
    const config = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const entries = config.workspaces?.packages ?? config.workspaces ?? [];
    requireThat(Array.isArray(entries), 'Unsupported workspace configuration; declare source packages explicitly');
    patterns.push(...entries);
  }
  if (tracked.has('pnpm-workspace.yaml')) patterns.push(...pnpmPackages(await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8')));
  const include = patterns.filter(item => typeof item === 'string' && !item.startsWith('!')).map(matcher);
  const exclude = patterns.filter(item => typeof item === 'string' && item.startsWith('!')).map(item => matcher(item.slice(1)));
  requireThat(patterns.every(item => typeof item === 'string'), 'Workspace patterns must be strings');
  const selected = new Set([...tracked].filter(path => path.endsWith('/package.json'))
    .map(path => portable(dirname(path))).filter(path => include.some(rule => rule.test(path)) && !exclude.some(rule => rule.test(path))));
  for (const path of declared) {
    requireThat(path && !isAbsolute(path) && !path.split(/[\\/]/u).includes('..') && tracked.has(`${path}/package.json`),
      'Declared workspace source needs a package manifest in the selected candidate');
    selected.add(path);
  }
  const sources = new Map();
  for (const path of [...selected].sort()) {
    const actual = await realpath(join(root, path)), local = relative(root, actual);
    requireThat(local === path.split('/').join(sep) && !local.split(sep).includes('node_modules') && !local.split(sep).includes('.venv'),
      'Workspace source must resolve to its pinned repository package path');
    const manifest = JSON.parse(await readFile(join(actual, 'package.json'), 'utf8'));
    requireThat(typeof manifest.name === 'string' && manifest.name, 'Workspace package needs a name');
    sources.set(actual, { path: portable(local), name: manifest.name });
  }
  return sources;
}
