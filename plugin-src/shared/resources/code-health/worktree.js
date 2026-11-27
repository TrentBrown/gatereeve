// Temporary worktrees for the base and head runs. The user's checkout is never
// modified: the base receives the head's governed files, both sides get the
// project's tool environments linked in, and inline suppressions are
// neutralized so they affect neither side (design C1.2, C1.4).
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
      .replace(/#(\s*)ruff(\s*):(\s*)noqa/gi, `#$1${MARK}`)
      .replace(/#(\s*)noqa\b/gi, `#$1${MARK}`);
  }
  return text;
}

const LINKED = ['node_modules', '.venv', 'venv'];

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
    for (const name of LINKED) {
      const source = join(this.root, name);
      if (existsSync(source) && !existsSync(join(path, name))) await symlink(source, join(path, name));
    }
    return path;
  }

  // Make the base worktree's governed files exactly the head's.
  async overlay(path, headCommit, baseHashes, headHashes) {
    for (const file of Object.keys(baseHashes)) {
      if (!(file in headHashes)) await rm(join(path, file), { force: true });
    }
    for (const file of Object.keys(headHashes)) {
      const content = await git(this.root, ['show', `${headCommit}:${file}`]);
      await mkdir(dirname(join(path, file)), { recursive: true });
      await writeFile(join(path, file), content);
    }
  }

  async neutralize(path, files) {
    for (const file of files) {
      const absolute = join(path, file);
      if (!existsSync(absolute)) continue;
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
