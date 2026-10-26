import { mkdir, open, readFile, lstat, link, rm } from 'node:fs/promises';
import { createHmac, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { requireThat } from './contracts.js';

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;
export const ENVIRONMENT_POLICY = 'controlled-environment/1';

// Resolve once for launch. Observations resolve the same declaration against
// current host inputs; arbitrary agent/session variables never enter the child.
export function runnerEnvironment(configuration = {}, inherited = process.env) {
  const profile = configuration.environment ?? {};
  requireThat(profile && typeof profile === 'object' && !Array.isArray(profile), 'Environment profile must be an object');
  requireThat(Object.keys(profile).every(key => ['inherit', 'publicValues', 'required'].includes(key)), 'Use inherit for private settings or publicValues for deliberately public literals; unknown environment profile field');
  const environment = { PATH: inherited.PATH ?? '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' };
  for (const name of ['HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'COMSPEC', 'PATHEXT']) {
    if (inherited[name] !== undefined) environment[name] = inherited[name];
  }
  for (const key of ['inherit', 'required']) requireThat(Array.isArray(profile[key] ?? [])
    && (profile[key] ?? []).every(name => typeof name === 'string' && NAME.test(name)), `Environment ${key} must name variables`);
  for (const name of profile.inherit ?? []) if (inherited[name] !== undefined) environment[name] = inherited[name];
  const values = profile.publicValues ?? {};
  requireThat(values && typeof values === 'object' && !Array.isArray(values), 'Environment values must be an object');
  for (const [name, value] of Object.entries(values)) {
    requireThat(NAME.test(name) && typeof value === 'string' && !value.includes('\0'), 'Invalid environment setting');
    environment[name] = value;
  }
  for (const name of profile.required ?? []) requireThat(typeof environment[name] === 'string' && environment[name].length > 0,
    `Required environment setting is missing: ${name}`);
  return Object.freeze(environment);
}

async function comparisonKey(context) {
  const home = context.featureHome ?? context.repositories[0]?.path;
  requireThat(home, 'Environment comparison requires a local feature or repository home');
  const directory = join(home, '.gatereeve-current');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  requireThat(!(await lstat(directory)).isSymbolicLink(), 'Unsafe environment key directory');
  const path = join(directory, 'runner-comparison.key');
  try {
    await lstat(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const pending = join(directory, `runner-key-${randomBytes(16).toString('hex')}.pending`);
    const file = await open(pending, 'wx', 0o600);
    try {
      await file.writeFile(randomBytes(32)); await file.sync(); await file.close();
      // Publish complete bytes atomically. A concurrent observer uses the winner.
      try { await link(pending, path); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    } finally { await file.close(); await rm(pending, { force: true }); }
  }
  const info = await lstat(path);
  requireThat(info.isFile() && !info.isSymbolicLink() && (info.mode & 0o077) === 0, 'Environment key must be a private regular file');
  const key = await readFile(path);
  requireThat(key.length === 32, 'Environment comparison key is unavailable or invalid');
  return key;
}

export async function environmentIdentity(context, environment) {
  const key = await comparisonKey(context);
  const sign = value => createHmac('sha256', key).update(value).digest('hex');
  return { policy: ENVIRONMENT_POLICY, keyId: sign('gatereeve-environment-key'),
    variables: Object.fromEntries(Object.keys(environment).sort().map(name => [name, sign(JSON.stringify([name, environment[name]]))])) };
}
