// @ts-check

import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
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
} = {}) {
  const override = environment[`GATEREEVE_${name.toUpperCase()}_PATH`];
  if (typeof override === 'string' && override.length > 0) {
    return [resolve(override)];
  }
  const pathDirectories = (environment.PATH ?? '')
    .split(delimiter)
    .filter(Boolean);
  const fixedDirectories = platform === 'darwin' ? FIXED_MACOS_DIRECTORIES : [];
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

export async function discoverExecutable(name, {
  probe = isExecutableFile,
  ...options
} = {}) {
  if (typeof name !== 'string' || name.length === 0 || isAbsolute(name)) {
    throw new TypeError('Executable discovery requires a bare executable name.');
  }
  for (const candidate of executableCandidates(name, options)) {
    if (await probe(candidate)) return candidate;
  }
  return null;
}

export async function discoverDesktopExecutables(options = {}) {
  const [git, gh] = await Promise.all([
    discoverExecutable('git', options),
    discoverExecutable('gh', options),
  ]);
  return Object.freeze({ git, gh });
}
