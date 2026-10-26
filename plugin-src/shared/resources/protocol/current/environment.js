import { access, lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { release, version } from 'node:os';
import { digest, identity, requireThat } from './contracts.js';

export const RUNNER_FINGERPRINT_POLICY = Object.freeze({
  id: 'runner-inputs/2',
  bookkeeping: Object.freeze([
    'node_modules/.vite/vitest/<40 lowercase hex>/results.json',
    'node_modules/.pnpm-task-run-state-v1/latest.json',
    'node_modules/.pnpm-task-run-state-v1/<64 lowercase hex>.<hex>-<pid>-<ordinal>.{jsonl,published,finished}',
    'node_modules/.pnpm-workspace-state-v1.json: normalize numeric lastValidatedTimestamp only',
  ]),
  explicitFiles: 'exact',
});
const OMIT_BOOKKEEPING = Symbol('bookkeeping');
const portable = path => path.split(sep).join('/');
const taskRoot = /\/node_modules\/\.pnpm-task-run-state-v1$/u;
function bookkeepingContainer(path) {
  const name = portable(path);
  return taskRoot.test(name) || /\/node_modules\/\.vite(?:\/vitest(?:\/[a-f0-9]{40})?)?$/u.test(name);
}
async function fileValue(path, info, exact) {
  const name = portable(path);
  const eligible = !exact && info.isFile() && !(info.mode & 0o111);
  if (eligible && (/\/node_modules\/\.vite\/vitest\/[a-f0-9]{40}\/results\.json$/u.test(name)
    || /\/node_modules\/\.pnpm-task-run-state-v1\/(?:latest\.json|[a-f0-9]{64}\.[a-f0-9]+-\d+-\d+\.(?:jsonl|published|finished))$/u.test(name))) return OMIT_BOOKKEEPING;
  const bytes = await readFile(path);
  if (eligible && /\/node_modules\/\.pnpm-workspace-state-v1\.json$/u.test(name) && bytes.length <= 1024 * 1024) {
    try {
      const state = JSON.parse(bytes.toString('utf8'));
      if (state && typeof state === 'object' && !Array.isArray(state)
        && Number.isSafeInteger(state.lastValidatedTimestamp) && state.lastValidatedTimestamp >= 0) {
        delete state.lastValidatedTimestamp;
        return { mode: info.mode & 0o777, hash: identity(state), normalization: 'pnpm-workspace-timestamp-v1' };
      }
    } catch { /* Malformed or unfamiliar state remains an exact byte input. */ }
  }
  return { mode: info.mode & 0o777, hash: digest(bytes) };
}

// Environment values are hashed together, never persisted in clear text.
// Local and external dependency bytes are bound as assumptions, not copied into the review packet.
async function tree(path, root, seen = new Set(), managedStore = null, exact = true) {
  let info;
  try { info = await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const actual = await realpath(path);
  const local = relative(root, actual);
  requireThat(local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local), 'Runtime input escapes its declared root');
  requireThat(!managedStore || !within(managedStore, actual), 'Runtime input cannot depend on its own evidence store');
  if (seen.has(actual)) return { cycle: local };
  const next = new Set(seen).add(actual);
  if (info.isSymbolicLink()) return { target: local, value: await tree(actual, root, seen, managedStore) };
  if (info.isFile()) return fileValue(path, info, exact);
  requireThat(info.isDirectory(), 'Runtime input must be a regular file or directory');
  const names = (await readdir(actual)).sort();
  const entries = [];
  for (const name of names) {
    if (join(actual, name) === managedStore) continue;
    const value = await tree(join(actual, name), root, next, managedStore, false);
    if (value !== OMIT_BOOKKEEPING) entries.push([name, value]);
  }
  if (!exact && !entries.length && bookkeepingContainer(path)) return OMIT_BOOKKEEPING;
  return identity(entries);
}
export async function executable(command, cwd, environment) {
  const choices = isAbsolute(command) || command.includes('/') ? [resolve(cwd, command)]
    : (environment.PATH ?? '').split(delimiter).map(part => resolve(part || cwd, command));
  for (const path of choices) {
    try {
      await access(path, constants.X_OK);
      const actual = await realpath(path);
      return { selectedPath: path, path: actual, mode: (await lstat(actual)).mode & 0o777, hash: digest(await readFile(actual)) };
    } catch (error) { if (!['ENOENT', 'EACCES', 'ENOTDIR'].includes(error.code)) throw error; }
  }
  return { unavailable: command };
}
function within(root, path) {
  const child = relative(root, path);
  return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}
async function packageRoot(path) {
  let parent = dirname(path);
  while (parent !== dirname(parent)) {
    try { if ((await lstat(join(parent, 'package.json'))).isFile()) return parent; }
    catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
    parent = dirname(parent);
  }
  return null;
}
// Declarations are scope commitments, not an inference that arbitrary program
// dependencies can be discovered from filenames. Only hashes leave the host.
async function externalClosure(root, checks, declared, environment, managedStore) {
  requireThat(Array.isArray(declared) && declared.every(path => typeof path === 'string' && isAbsolute(path)),
    'Runner requires explicit externalRuntimeInputs for each checked repository (an empty list declares no additional external inputs)');
  const scopes = new Map(), launches = [], arguments_ = [], exactExecutables = new Set(), privateScopes = new Set();
  const addScope = async (path, privateInput = false) => {
    if (privateInput && !scopes.has(path)) privateScopes.add(path);
    let actual = null;
    try { actual = await realpath(path); } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
    scopes.set(path, actual);
    return actual;
  };
  for (const path of [...new Set(declared)].sort()) await addScope(path);
  const covered = path => within(root, path) || [...scopes.values()].some(scope => scope && within(scope, path));
  const requireScriptScope = async (path, privateInput = false) => {
    if (covered(path)) return;
    const owner = await packageRoot(path);
    requireThat(owner, 'External script or argument has no bound package; declare its dependency root in externalRuntimeInputs');
    await addScope(owner, privateInput);
  };
  const bindArguments = async (args, privateInput = false) => {
    requireThat(Array.isArray(args) && args.every(arg => typeof arg === 'string'), 'Check arguments must be strings');
    const moduleFlags = new Set(['-r', '--require', '--import', '--loader', '--experimental-loader']);
    let moduleArgument = false, opaqueArgument = false;
    for (const arg of args) {
      if (opaqueArgument) { opaqueArgument = false; continue; }
      if (['-e', '--eval', '-c', '-p', '--print'].includes(arg)) { opaqueArgument = true; continue; }
      if (moduleFlags.has(arg)) { moduleArgument = true; continue; }
      const equal = arg.startsWith('-') ? arg.indexOf('=') : -1;
      const compact = /^-r.+/u.test(arg);
      const flag = equal > 0 ? arg.slice(0, equal) : compact ? '-r' : null;
      let value = equal > 0 ? arg.slice(equal + 1) : compact ? arg.slice(2) : arg;
      const requiresFile = moduleArgument || moduleFlags.has(flag);
      moduleArgument = false;
      requireThat(value || !requiresFile, 'Module preload is missing its file argument');
      if (!value) continue;
      if (value.startsWith('file:')) value = fileURLToPath(value);
      if (value.startsWith('-') && equal < 0 && !compact) continue;
      const selectedPath = resolve(root, value);
      let actual;
      try { actual = await realpath(selectedPath); }
      catch (error) {
        if (!['ENOENT', 'ENOTDIR', 'ENAMETOOLONG'].includes(error.code)) throw error;
        requireThat(!requiresFile, 'Module preload must name a resolvable file; resolve its dependency scope explicitly');
        if (isAbsolute(value) || /^\.{1,2}[\\/]/u.test(value)) arguments_.push({ selectedPath, missing: true, privateInput });
        continue;
      }
      if (!within(root, actual)) await requireScriptScope(actual, privateInput);
      arguments_.push({ selectedPath, path: actual, privateInput });
    }
    requireThat(!moduleArgument, 'Module preload is missing its file argument');
  };
  const visit = async (command, seen = new Set()) => {
    const item = await executable(command, root, environment);
    requireThat(!item.unavailable, `Runner executable is unavailable: ${command}`);
    requireThat(!seen.has(item.path), 'Cyclic shebang interpreter chain');
    exactExecutables.add(item.path); launches.push(item);
    const bytes = await readFile(item.path);
    if (bytes.subarray(0, 2).toString() !== '#!') return;
    await requireScriptScope(item.path);
    const line = bytes.toString('utf8', 2, Math.min(bytes.length, 4096)).split(/\r?\n/u)[0].trim();
    // Unsupported shell quoting/env options require a real wrapper with a bound
    // interpreter; guessing their meaning could silently omit the real runtime.
    requireThat(line && !/["'\\]/u.test(line), 'Unsupported shebang syntax; use an explicit bound interpreter');
    const parts = line.split(/\s+/u), interpreter = parts.shift();
    const next = new Set(seen).add(item.path);
    if (basename(interpreter) === 'env') {
      const env = await executable(interpreter, root, environment);
      requireThat(!env.unavailable, 'Shebang env executable is unavailable');
      exactExecutables.add(env.path); launches.push(env);
      if (parts[0] === '-S') parts.shift();
      requireThat(parts.length && !parts[0].startsWith('-') && !parts[0].includes('='), 'Unsupported env shebang; use an explicit bound interpreter');
      await bindArguments(parts.slice(1));
      await visit(parts[0], next);
    } else { await bindArguments(parts); await visit(interpreter, next); }
  };
  for (const check of checks) {
    await visit(check.command);
    if (Array.isArray(check.args) && check.args.every(arg => typeof arg === 'string')) await bindArguments(check.args);
    else arguments_.push({ invalidArguments: identity(check.args ?? null) });
    // commands() retains the actual malformed-check diagnostic and any checks
    // already executed. This explicit invalid identity can never yield PASS.
  }
  // Only documented loader variables are interpreted. Never scan arbitrary
  // environment values for paths or persist these values in clear text.
  if (environment.NODE_OPTIONS) {
    requireThat(!/["'\\]/u.test(environment.NODE_OPTIONS), 'Unsupported NODE_OPTIONS quoting; use explicit arguments and declared runtime inputs');
    await bindArguments(environment.NODE_OPTIONS.trim().split(/\s+/u), true);
  }
  for (const name of ['NODE_PATH', 'PYTHONPATH', 'DYLD_LIBRARY_PATH', 'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES', 'LD_PRELOAD']) {
    if (!environment[name]) continue;
    const paths = name === 'LD_PRELOAD' ? environment[name].split(/[\s:]+/u) : environment[name].split(delimiter);
    for (const path of paths) await addScope(resolve(root, path || '.'), true);
  }
  const allowed = [root, ...[...scopes.values()].filter(Boolean), ...exactExecutables];
  const capture = async (path, seen = new Set(), exact = true) => {
    let info, actual;
    try { info = await lstat(path); actual = await realpath(path); }
    catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) return { missing: true }; throw error; }
    requireThat(!managedStore || !within(managedStore, actual), 'Runtime input cannot depend on its own evidence store');
    requireThat(allowed.some(scope => within(scope, actual)), 'External runtime symlink escapes declared inputs; declare its target');
    if (seen.has(actual)) return { cycle: actual };
    if (info.isSymbolicLink()) return { target: actual, value: await capture(actual, seen) };
    if (info.isFile()) return fileValue(path, info, exact);
    requireThat(info.isDirectory(), 'External runtime input must be a regular file or directory');
    const next = new Set(seen).add(actual), entries = [];
    for (const name of (await readdir(actual)).sort()) {
      if (join(actual, name) === managedStore) continue;
      const value = await capture(join(actual, name), next, false);
      if (value !== OMIT_BOOKKEEPING) entries.push([name, value]);
    }
    if (!exact && !entries.length && bookkeepingContainer(path)) return OMIT_BOOKKEEPING;
    return { mode: info.mode & 0o777, hash: identity(entries) };
  };
  for (const argument of arguments_) if (argument.path) argument.value = await capture(argument.selectedPath);
  const inputs = [];
  for (const [path, actual] of [...scopes].sort(([a], [b]) => a.localeCompare(b))) {
    const input = { path, actual, value: await capture(path) };
    inputs.push(privateScopes.has(path) ? { loaderInput: identity(input) } : input);
  }
  return { launches, arguments: arguments_.map(({ privateInput, ...input }) => privateInput ? { loaderInput: identity(input) } : input), inputs };
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
  const base = { platform: process.platform, arch: process.arch, osRelease: release(), osVersion: version() };
  const inputs = [], executables = [];
  const managedStore = context.featureHome ? resolve(context.featureHome, '.gatereeve-current') : null;
  for (const pin of candidate.repositories) {
    const repo = context.repositories.find(item => item.alias === pin.alias);
    const root = await realpath(repo.path);
    const declared = configuration.runtimeInputs?.[pin.alias] ?? [];
    requireThat(Array.isArray(declared) && declared.every(path => typeof path === 'string'), 'Runtime inputs must be repository-relative paths');
    for (const path of [...new Set(['node_modules', '.venv', ...await dependencyInputs(root), ...declared])].sort()) {
      requireThat(!isAbsolute(path) && !path.split(/[\\/]/u).includes('..'), 'Unsafe runtime input path');
      try { inputs.push({ repository: pin.alias, path, value: await tree(join(root, path), root, new Set(), managedStore) }); }
      catch (error) { error.message += ` (input ${pin.alias}:${path})`; throw error; }
    }
    const checks = (configuration.checks ?? []).filter(check => check.repository === pin.alias);
    if (checks.length) {
      try { executables.push({ repository: pin.alias, closure: await externalClosure(root, checks, configuration.externalRuntimeInputs?.[pin.alias], environment, managedStore) }); }
      catch (error) { error.message += ` (external inputs for ${pin.alias})`; throw error; }
    }
  }
  return { fingerprintPolicy: RUNNER_FINGERPRINT_POLICY, ...base, inheritedEnvironment: identity(environment), inputs, executables };
}

export function environmentChanges(before, after) {
  const changes = [];
  const equal = (a, b) => identity(a ?? null) === identity(b ?? null);
  if (!equal(before.fingerprintPolicy, after.fingerprintPolicy)) changes.push({ kind: 'fingerprint-policy' });
  for (const key of ['platform', 'arch', 'osRelease', 'osVersion']) if (!equal(before[key], after[key])) changes.push({ kind: key });
  if (!equal(before.inheritedEnvironment, after.inheritedEnvironment)) changes.push({ kind: 'inherited-environment' });
  const compare = (a, b, key, describe) => {
    const left = new Map((a ?? []).map(item => [key(item), item]));
    const right = new Map((b ?? []).map(item => [key(item), item]));
    for (const id of [...new Set([...left.keys(), ...right.keys()])].sort()) {
      if (!equal(left.get(id), right.get(id))) describe(left.get(id), right.get(id));
    }
  };
  compare(before.inputs, after.inputs, item => `${item.repository}:${item.path}`, (a, b) => {
    const item = b ?? a; changes.push({ kind: 'runtime-input', repository: item.repository, path: item.path });
  });
  compare(before.executables, after.executables, item => item.repository, (a, b) => {
    const repository = (b ?? a).repository, start = changes.length;
    compare(a?.closure.inputs, b?.closure.inputs, item => item.path ?? 'private-loader-input', (left, right) => {
      const item = right ?? left;
      changes.push(item.path ? { kind: 'external-input', repository, path: item.path } : { kind: 'loader-input', repository });
    });
    // Arguments may contain private loader identities. Report their category,
    // never the loader/environment value or its private resolved path.
    if (!equal(a?.closure.arguments, b?.closure.arguments)) changes.push({ kind: 'argument-or-loader-input', repository });
    compare(a?.closure.launches, b?.closure.launches, item => item.selectedPath, (left, right) => {
      changes.push({ kind: 'executable', repository, path: (right ?? left).selectedPath });
    });
    if (changes.length === start) changes.push({ kind: 'external-inputs', repository });
  });
  if (!changes.length && identity(before) !== identity(after)) changes.push({ kind: 'runner-manifest' });
  return changes;
}
export function assertEnvironmentCurrent(before, after, message = 'Execution environment changed') {
  if (identity(before) === identity(after)) return;
  const changedInputs = environmentChanges(before, after);
  const labels = changedInputs.map(item => `${item.repository ? `${item.repository}:` : ''}${item.path ?? item.kind}`);
  const error = new Error(`${message}: ${labels.slice(0, 12).join(', ')}${labels.length > 12 ? ` (+${labels.length - 12} more)` : ''}`);
  error.changedInputs = changedInputs;
  throw error;
}
