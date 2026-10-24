import { access, lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { digest, identity, requireThat } from './contracts.js';

// Environment values are hashed together, never persisted in clear text. Local
// dependency bytes are bound as assumptions, not copied into the review packet.
async function tree(path, root, seen = new Set()) {
  let info;
  try { info = await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const actual = await realpath(path);
  const local = relative(root, actual);
  requireThat(local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local), 'Runtime input escapes its declared root');
  if (seen.has(actual)) return { cycle: local };
  const next = new Set(seen).add(actual);
  if (info.isSymbolicLink()) return { target: local, value: await tree(actual, root, seen) };
  if (info.isFile()) return { mode: info.mode & 0o777, hash: digest(await readFile(actual)) };
  requireThat(info.isDirectory(), 'Runtime input must be a regular file or directory');
  const names = (await readdir(actual)).sort();
  const entries = [];
  for (const name of names) entries.push([name, await tree(join(actual, name), root, next)]);
  return identity(entries);
}
export async function executable(command, cwd, environment) {
  const choices = isAbsolute(command) || command.includes('/') ? [resolve(cwd, command)]
    : (environment.PATH ?? '').split(delimiter).map(part => resolve(part || cwd, command));
  for (const path of choices) {
    try {
      await access(path, constants.X_OK);
      const actual = await realpath(path);
      return { path: actual, hash: digest(await readFile(actual)) };
    } catch (error) { if (!['ENOENT', 'EACCES', 'ENOTDIR'].includes(error.code)) throw error; }
  }
  return { unavailable: command };
}
async function dependencyInputs(root, directory = '', seen = new Set()) {
  const current = join(root, directory);
  const actual = await realpath(current);
  if (seen.has(actual)) return [];
  seen.add(actual);
  const result = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (['node_modules', '.venv'].includes(entry.name)) result.push(path);
    else if (entry.isDirectory() && !['.git', '.gatereeve-current', '.checkpoints', '.handoffs'].includes(entry.name)) {
      result.push(...await dependencyInputs(root, path, seen));
    }
  }
  return result;
}
export async function executionEnvironment(context, candidate, configuration, runner, inherited = process.env) {
  if (!runner) return { kind: 'pinned-review-inputs' };
  const environment = Object.fromEntries(Object.keys(inherited).sort().map(key => [key, inherited[key]]));
  const base = { platform: process.platform, arch: process.arch };
  const inputs = [], executables = [];
  for (const pin of candidate.repositories) {
    const repo = context.repositories.find(item => item.alias === pin.alias);
    const root = await realpath(repo.path);
    const declared = configuration.runtimeInputs?.[pin.alias] ?? [];
    requireThat(Array.isArray(declared) && declared.every(path => typeof path === 'string'), 'Runtime inputs must be repository-relative paths');
    for (const path of [...new Set(['node_modules', '.venv', ...await dependencyInputs(root), ...declared])].sort()) {
      requireThat(!isAbsolute(path) && !path.split(/[\\/]/u).includes('..'), 'Unsafe runtime input path');
      inputs.push({ repository: pin.alias, path, value: await tree(join(root, path), root) });
    }
    for (const check of configuration.checks ?? []) if (check.repository === pin.alias) executables.push(await executable(check.command, root, environment));
  }
  return { ...base, inheritedEnvironment: identity(environment), inputs, executables };
}
