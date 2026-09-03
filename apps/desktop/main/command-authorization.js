// @ts-check

import { execFile as execFileCallback } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

import { validateModuleDefinition } from '../resources/protocol/modules.js';

export const COMMAND_AUTHORIZATION_SCHEMA_VERSION = 1;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const executeFile = promisify(execFileCallback);

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function stableDigest(value) {
  return sha256(`${JSON.stringify(stable(value), null, 2)}\n`);
}

function inside(root, path) {
  return path === root || path.startsWith(`${root}${sep}`);
}

async function actualFileDigest(path, repositoryRoot, { allowOutside = false } = {}) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`Command input ${path} must be a regular file, not a symlink.`);
  }
  const canonical = await realpath(path);
  if (!allowOutside && !inside(repositoryRoot, canonical)) {
    throw new Error(`Command input ${path} escapes the repository.`);
  }
  return sha256(await readFile(canonical));
}

export async function resolveGitCommonDirectory(repositoryRoot, {
  gitExecutable = 'git',
  execFile = executeFile,
} = {}) {
  if (!isAbsolute(repositoryRoot)) throw new TypeError('Repository root must be absolute.');
  const { stdout } = await execFile(
    gitExecutable,
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    { cwd: repositoryRoot, encoding: 'utf8', timeout: 5_000, windowsHide: true },
  );
  const path = stdout.trim();
  if (!isAbsolute(path)) throw new Error('Git did not return an absolute common directory.');
  return realpath(path);
}

function commandEntrypoint(repositoryRoot, run) {
  if (isAbsolute(run.executable)) return { path: run.executable, allowOutside: true };
  if (run.executable.includes('/')) return { path: resolve(repositoryRoot, run.executable), allowOutside: false };
  const script = run.args.find((arg) => (
    typeof arg === 'string'
    && (arg.startsWith('./') || arg.includes('/'))
    && !isAbsolute(arg)
    && !arg.split('/').includes('..')
  ));
  return script ? { path: resolve(repositoryRoot, script), allowOutside: false } : null;
}

function requireCommandModule(module) {
  validateModuleDefinition(module);
  if (module.run?.kind !== 'command') throw new TypeError('A command module is required.');
  return module.run;
}

export async function inspectCommandAuthorization(repositoryRootValue, module, {
  commonDirectory = resolveGitCommonDirectory,
} = {}) {
  const repositoryRoot = await realpath(repositoryRootValue);
  const run = requireCommandModule(module);
  const gitCommonDirectory = await commonDirectory(repositoryRoot);
  const observedSupportFiles = [];
  const changedInputs = [];
  for (const file of run.supportFiles ?? []) {
    const actualDigest = await actualFileDigest(resolve(repositoryRoot, file.path), repositoryRoot);
    observedSupportFiles.push({ path: file.path, declaredDigest: file.digest, actualDigest });
    if (actualDigest !== file.digest) changedInputs.push(file.path);
  }
  let observedEntrypointDigest = null;
  let persistentEligible = typeof run.entrypointDigest === 'string';
  const entrypoint = commandEntrypoint(repositoryRoot, run);
  if (run.entrypointDigest) {
    if (entrypoint === null) {
      persistentEligible = false;
      changedInputs.push('entrypoint (not directly inspectable)');
    } else {
      observedEntrypointDigest = await actualFileDigest(
        entrypoint.path,
        repositoryRoot,
        { allowOutside: entrypoint.allowOutside },
      );
      if (observedEntrypointDigest !== run.entrypointDigest) changedInputs.push('entrypoint');
    }
  }
  if (changedInputs.length > 0) persistentEligible = false;
  const components = {
    repositoryIdentity: sha256(gitCommonDirectory),
    moduleId: module.id,
    moduleVersion: module.version,
    manifestDigest: module.digest,
    executable: run.executable,
    args: [...run.args],
    workingDirectory: run.workingDirectory,
    entrypointDigest: observedEntrypointDigest,
    supportFiles: observedSupportFiles.map(({ path, actualDigest }) => ({ path, digest: actualDigest })),
  };
  return Object.freeze({
    schemaVersion: COMMAND_AUTHORIZATION_SCHEMA_VERSION,
    commandDigest: stableDigest(components),
    components,
    persistentEligible,
    changedInputs,
    display: {
      executable: run.executable,
      args: [...run.args],
      workingDirectory: run.workingDirectory,
      effects: [...run.effects],
      timeoutSeconds: run.timeoutSeconds,
      authority: [
        'Runs without a sandbox using your filesystem and process permissions.',
        'May read credential files, use the network, invoke PATH tools, dependencies, or downloaded code.',
        'Authorization verifies only the declared direct inputs shown here; it is not complete provenance.',
      ],
    },
  });
}

function defaultState() {
  return { schemaVersion: COMMAND_AUTHORIZATION_SCHEMA_VERSION, grants: [] };
}

function normalizeState(value) {
  if (
    !value
    || typeof value !== 'object'
    || value.schemaVersion !== COMMAND_AUTHORIZATION_SCHEMA_VERSION
    || !Array.isArray(value.grants)
  ) return defaultState();
  const grants = value.grants.filter((grant) => (
    grant
    && typeof grant === 'object'
    && typeof grant.commandDigest === 'string'
    && SHA256.test(grant.commandDigest)
    && typeof grant.repositoryIdentity === 'string'
    && SHA256.test(grant.repositoryIdentity)
    && typeof grant.moduleId === 'string'
    && typeof grant.moduleVersion === 'string'
    && typeof grant.manifestDigest === 'string'
    && SHA256.test(grant.manifestDigest)
    && typeof grant.authorizedAt === 'string'
  )).map((grant) => ({
    commandDigest: grant.commandDigest,
    repositoryIdentity: grant.repositoryIdentity,
    moduleId: grant.moduleId,
    moduleVersion: grant.moduleVersion,
    manifestDigest: grant.manifestDigest,
    authorizedAt: grant.authorizedAt,
  }));
  return { schemaVersion: COMMAND_AUTHORIZATION_SCHEMA_VERSION, grants };
}

export function createCommandAuthorizationStore(userDataPath, {
  createId = randomUUID,
  now = () => new Date().toISOString(),
  gitExecutable = 'git',
  execFile = executeFile,
} = {}) {
  if (!isAbsolute(userDataPath)) throw new TypeError('User data path must be absolute.');
  const path = resolve(userDataPath, 'module-command-authorizations.json');
  let writeQueue = Promise.resolve();

  async function load() {
    try {
      return normalizeState(JSON.parse(await readFile(path, 'utf8')));
    } catch (error) {
      if (error?.code === 'ENOENT' || error instanceof SyntaxError) return defaultState();
      throw error;
    }
  }

  async function save(state) {
    const normalized = normalizeState(state);
    const write = writeQueue.then(async () => {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${createId()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, {
        encoding: 'utf8', mode: 0o600, flag: 'wx',
      });
      await rename(temporary, path);
      return normalized;
    });
    writeQueue = write.catch(() => {});
    return write;
  }

  return Object.freeze({
    path,
    inspect(repositoryRoot, module) {
      return inspectCommandAuthorization(repositoryRoot, module, {
        commonDirectory: (root) => resolveGitCommonDirectory(root, { gitExecutable, execFile }),
      });
    },
    async status(inspection) {
      const state = await load();
      const grant = state.grants.find((item) => item.commandDigest === inspection.commandDigest);
      const superseded = state.grants.filter((item) => (
        item.repositoryIdentity === inspection.components.repositoryIdentity
        && item.moduleId === inspection.components.moduleId
        && item.commandDigest !== inspection.commandDigest
      ));
      return Object.freeze({
        authorized: Boolean(grant) && inspection.persistentEligible,
        authorizedAt: grant?.authorizedAt ?? null,
        persistentEligible: inspection.persistentEligible,
        changedInputs: [...inspection.changedInputs],
        supersededCount: superseded.length,
      });
    },
    async grant(inspection) {
      if (!inspection.persistentEligible || inspection.changedInputs.length > 0) {
        throw new Error('Always allow is unavailable until every declared command input matches.');
      }
      const state = await load();
      const repositoryIdentity = inspection.components.repositoryIdentity;
      const moduleId = inspection.components.moduleId;
      const next = state.grants.filter((item) => !(
        item.repositoryIdentity === repositoryIdentity && item.moduleId === moduleId
      ));
      next.push({
        commandDigest: inspection.commandDigest,
        repositoryIdentity,
        moduleId,
        moduleVersion: inspection.components.moduleVersion,
        manifestDigest: inspection.components.manifestDigest,
        authorizedAt: now(),
      });
      await save({ schemaVersion: COMMAND_AUTHORIZATION_SCHEMA_VERSION, grants: next });
      return this.status(inspection);
    },
    async revoke(repositoryIdentity, moduleId) {
      const state = await load();
      await save({
        schemaVersion: COMMAND_AUTHORIZATION_SCHEMA_VERSION,
        grants: state.grants.filter((item) => !(
          item.repositoryIdentity === repositoryIdentity && item.moduleId === moduleId
        )),
      });
    },
  });
}
