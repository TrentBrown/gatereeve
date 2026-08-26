// @ts-check

import { execFile } from 'node:child_process';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

function source(status, detail, checkedAt) {
  return { status, detail, checkedAt };
}

function portable(path) {
  return path.split(sep).join('/');
}

function within(root, target) {
  const path = relative(resolve(root), resolve(target));
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function statusPaths(output) {
  const entries = output.split('\0').filter(Boolean);
  const paths = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const status = entry.slice(0, 2);
    const path = entry.slice(3);
    if (path) paths.push(path);
    if ((status[0] === 'R' || status[0] === 'C') && entries[index + 1]) {
      paths.push(entries[index + 1]);
      index += 1;
    }
  }
  return paths;
}

export function classifyWorktreeChanges(repositoryRoot, featureHome, porcelainOutput) {
  const featureRelative = within(repositoryRoot, featureHome)
    ? portable(relative(repositoryRoot, featureHome))
    : null;
  const paths = statusPaths(porcelainOutput).map(portable);
  const journalPath = featureRelative ? `${featureRelative}/events.jsonl` : null;
  const modelPath = featureRelative ? `${featureRelative}/workflow-model.lock.json` : null;
  const journalDirty = journalPath !== null && paths.includes(journalPath);
  const modelDirty = modelPath !== null && paths.includes(modelPath);
  return {
    journalDirty,
    modelDirty,
    sourceDirty: paths.some((path) => path !== journalPath && path !== modelPath),
    changedPathCount: paths.length,
  };
}

export async function observeGit(worktreePath, featureHome, {
  exec = execute,
  now = () => new Date(),
} = {}) {
  const checkedAt = now().toISOString();
  try {
    const rootResult = await exec('git', ['-C', worktreePath, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 10_000,
    });
    const repositoryRoot = rootResult.stdout.trim();
    const [branchResult, headResult, statusResult] = await Promise.all([
      exec('git', ['-C', repositoryRoot, 'branch', '--show-current'], {
        encoding: 'utf8', maxBuffer: 1024, timeout: 10_000,
      }),
      exec('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], {
        encoding: 'utf8', maxBuffer: 1024, timeout: 10_000,
      }),
      exec('git', ['-C', repositoryRoot, 'status', '--porcelain=v1', '-z', '--untracked-files=all'], {
        encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 15_000,
      }),
    ]);
    const branch = branchResult.stdout.trim();
    const head = headResult.stdout.trim();
    const worktree = classifyWorktreeChanges(repositoryRoot, featureHome, statusResult.stdout);
    return {
      source: source('current', `Git ${branch || 'detached'} at ${head.slice(0, 12)}`, checkedAt),
      facts: { worktree },
      repositoryRoot,
      branch,
      head,
    };
  } catch (error) {
    return {
      source: source('unavailable', error?.stderr?.trim() || error?.message || 'Git unavailable', checkedAt),
      facts: {},
      repositoryRoot: null,
      branch: null,
      head: null,
    };
  }
}
