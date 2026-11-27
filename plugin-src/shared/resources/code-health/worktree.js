// Temporary worktrees for the base and head runs. The user's checkout is never
// modified: the base receives the head's governed files, both sides get the
// project's tool environments linked in, and inline suppressions are
// neutralized so they affect neither side (design C1.2, C1.4).
import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { git } from './process.js';

const JS = /\.(?:[cm]?[jt]sx?)$/;
const PY = /\.pyi?$/;
const MARK = 'gatereeve-neutralized';

// Line-preserving: each directive keyword becomes an inert marker, so line
// numbers (and therefore every other finding) are unchanged.
export function neutralize(path, text) {
  if (JS.test(path)) {
    return text
      .replace(/(\/\/|\/\*)(\s*)eslint-(disable|enable)/g, `$1$2${MARK}-$3`)
      .replace(/\/\*(\s*)eslint(\s)/g, `/*$1${MARK}$2`);
  }
  if (PY.test(path)) {
    return text
      .replace(/#(\s*)(?:ruff|flake8)(\s*):(\s*)noqa/gi, `#$1${MARK}`)
      .replace(/#(\s*)noqa\b/gi, `#$1${MARK}`);
  }
  return text;
}

const LINKED = ['node_modules', '.venv', 'venv'];

// Package-local installs (a monorepo's cli/node_modules) are linked too: every
// directory with a tracked package.json gets its node_modules.
async function environmentLinks(root) {
  const tracked = (await git(root, ['ls-files', '-z', '--', 'package.json', '*/package.json', '*/*/package.json'])).split('\0').filter(Boolean);
  const nested = tracked.map(path => dirname(path)).filter(directory => directory !== '.').map(directory => join(directory, 'node_modules'));
  return [...LINKED, ...nested].filter(path => existsSync(join(root, path)));
}

// Every write must land inside the temporary worktree: never through a
// tracked symlink or a linked environment into the user's files.
async function inside(worktree, path) {
  const base = await realpath(worktree);
  let parent;
  try {
    parent = await realpath(dirname(path));
  } catch {
    return false;
  }
  return parent === base || parent.startsWith(base + sep);
}

async function isSymlink(path) {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch {
    return false;
  }
}

export class Worktrees {
  constructor(root, { scratch = tmpdir() } = {}) {
    this.root = root;
    this.scratch = scratch;
    this.paths = [];
  }

  async add(commit, label) {
    await mkdir(this.scratch, { recursive: true });
    const parent = await mkdtemp(join(this.scratch, `gatereeve-code-health-${label}-`));
    const path = join(parent, 'tree');
    this.paths.push(parent);
    await git(this.root, ['worktree', 'add', '--detach', '--quiet', path, commit]);
    for (const name of await environmentLinks(this.root)) {
      const target = join(path, name);
      if (!existsSync(target) && await inside(path, target)) await symlink(join(this.root, name), target);
    }
    return path;
  }

  // Make the base worktree's governed files exactly the head's. Each target is
  // unlinked first, so an existing symlink is replaced, never written through;
  // a governed symlink at the head is recreated as a symlink.
  async overlay(path, headCommit, baseHashes, headHashes) {
    for (const file of new Set([...Object.keys(baseHashes), ...Object.keys(headHashes)])) {
      const target = join(path, file);
      await mkdir(dirname(target), { recursive: true });
      if (!await inside(path, target)) throw new Error(`Refusing to write outside the temporary worktree: ${file}`);
      await rm(target, { force: true });
      if (!(file in headHashes)) continue;
      const entry = (await git(this.root, ['ls-tree', headCommit, '--', file])).split('\t')[0].split(' ');
      const content = await git(this.root, ['show', `${headCommit}:${file}`]);
      if (entry[0] === '120000') await symlink(content, target);
      else await writeFile(target, content);
    }
  }

  async neutralize(path, files) {
    for (const file of files) {
      const absolute = join(path, file);
      if (!existsSync(absolute) || await isSymlink(absolute) || !await inside(path, absolute)) continue;
      const text = await readFile(absolute, 'utf8');
      const rewritten = neutralize(file, text);
      if (rewritten !== text) await writeFile(absolute, rewritten);
    }
  }

  async cleanup() {
    for (const parent of this.paths.splice(0)) {
      await git(this.root, ['worktree', 'remove', '--force', join(parent, 'tree')]).catch(() => {});
      await rm(parent, { recursive: true, force: true });
    }
    await git(this.root, ['worktree', 'prune']).catch(() => {});
  }
}
