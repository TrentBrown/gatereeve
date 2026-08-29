// @ts-check

import { constants } from 'node:fs';
import { access, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, resolve } from 'node:path';

const FIXED_MACOS_DIRECTORIES = Object.freeze([
  '/usr/bin',
  '/opt/homebrew/bin',
  '/usr/local/bin',
]);

function unique(values) {
  return [...new Set(values)];
}

export function executableCandidates(name, {
  environment = process.env,
  platform = process.platform,
  homeDirectory = homedir(),
} = {}) {
  const override = environment[`GATEREEVE_${name.toUpperCase()}_PATH`];
  if (typeof override === 'string' && override.length > 0) {
    return [resolve(override)];
  }
  const pathDirectories = (environment.PATH ?? '')
    .split(delimiter)
    .filter(Boolean);
  const fixedDirectories = platform === 'darwin' ? [
    ...FIXED_MACOS_DIRECTORIES,
    resolve(homeDirectory, '.local/bin'),
    resolve(homeDirectory, '.npm-global/bin'),
    resolve(homeDirectory, '.volta/bin'),
    resolve(homeDirectory, '.local/share/mise/shims'),
    resolve(homeDirectory, '.fnm/current/bin'),
    '/Applications/Codex.app/Contents/Resources',
  ] : [];
  return unique([...fixedDirectories, ...pathDirectories].map((directory) => resolve(
    directory,
    name
  )));
}

async function isExecutableFile(path) {
  try {
    await access(path, constants.X_OK);
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function requireExecutableName(name) {
  if (typeof name !== 'string' || name.length === 0 || isAbsolute(name)) {
    throw new TypeError('Executable discovery requires a bare executable name.');
  }
}

async function* matchingExecutables(name, {
  probe = isExecutableFile,
  readDirectory = readdir,
  ...options
} = {}) {
  requireExecutableName(name);
  for (const candidate of executableCandidates(name, options)) {
    if (await probe(candidate)) yield candidate;
  }
  const override = options.environment?.[`GATEREEVE_${name.toUpperCase()}_PATH`]
    ?? process.env[`GATEREEVE_${name.toUpperCase()}_PATH`];
  if (override || (options.platform ?? process.platform) !== 'darwin') return;
  const homeDirectory = options.homeDirectory ?? homedir();
  const nvmRoot = resolve(homeDirectory, '.nvm/versions/node');
  try {
    const versions = (await readDirectory(nvmRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
    for (const version of versions) {
      const candidate = resolve(nvmRoot, version, 'bin', name);
      if (await probe(candidate)) yield candidate;
    }
  } catch {
    // NVM is optional; absence narrows only this known user-level discovery path.
  }
}

export async function discoverExecutables(name, options = {}) {
  const matches = [];
  for await (const candidate of matchingExecutables(name, options)) matches.push(candidate);
  return matches;
}

export async function discoverExecutable(name, options = {}) {
  for await (const candidate of matchingExecutables(name, options)) return candidate;
  return null;
}

export async function discoverDesktopExecutables(options = {}) {
  const [git, gh] = await Promise.all([
    discoverExecutable('git', options),
    discoverExecutable('gh', options),
  ]);
  return Object.freeze({ git, gh });
}
