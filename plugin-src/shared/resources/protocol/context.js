import { execFile } from 'node:child_process';
import { readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { promisify } from 'node:util';

import { ProtocolError } from './errors.js';

const executeFile = promisify(execFile);
const CONFIG_NAME = '.agentic-workflow.json';
const SCHEMA_VERSION = 1;
const IDENTIFIER = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/u;
const OBJECT_ID = /^[0-9a-fA-F]{40,64}$/u;

function expandUser(path, environment) {
  if (path === '~') return environment.HOME ?? homedir();
  if (path.startsWith(`~${sep}`)) {
    return resolve(environment.HOME ?? homedir(), path.slice(2));
  }
  return path;
}

async function info(path) {
  try {
    return await stat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function canonicalStart(path, environment) {
  const absolute = resolve(expandUser(path, environment));
  const pathInfo = await info(absolute);
  const directory = pathInfo?.isFile() ? dirname(await realpath(absolute)) : absolute;
  return (await info(directory)) === null ? directory : realpath(directory);
}

function isWithin(path, parent) {
  const local = relative(parent, path);
  return local === '' || (!local.startsWith(`..${sep}`) && local !== '..' && !isAbsolute(local));
}

function validateIdentifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new Error(
      `${label} must be a nonempty portable slug containing only letters, ` +
      'numbers, dots, underscores, and hyphens'
    );
  }
  if (value === '.' || value === '..' || value.includes('..') || value.endsWith('.lock')) {
    throw new Error(`${label} is not a safe Git-compatible slug: ${value}`);
  }
  return value;
}

export function validateFeatureId(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('featureId must be a nonempty Git-compatible name');
  }
  if (/\s|[\u0000-\u001f]/u.test(value)) {
    throw new Error('featureId must not contain whitespace or control characters');
  }
  const invalidFragments = ['..', '//', '@{', '\\', '~', '^', ':', '?', '*', '['];
  if (
    value.startsWith('/')
    || value.startsWith('.')
    || value.startsWith('-')
    || value.endsWith('/')
    || value.endsWith('.')
    || invalidFragments.some((fragment) => value.includes(fragment))
    || value.split('/').some((part) => part.startsWith('.') || part.endsWith('.lock'))
  ) {
    throw new Error(`featureId is not a safe Git-compatible name: ${value}`);
  }
  return value;
}

function validateBranchName(value, label) {
  try {
    return validateFeatureId(value);
  } catch (error) {
    throw new Error(`${label} is invalid: ${error.message}`, { cause: error });
  }
}

function requiredString(mapping, key, label) {
  const value = mapping[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label}.${key} must be a nonempty string`);
  }
  return value.trim();
}

function parseExternalTask(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('externalTask must be an object');
  }
  const taskId = value.id;
  const url = value.url;
  if (taskId !== undefined && taskId !== null && (
    typeof taskId !== 'string' || taskId.trim().length === 0
  )) {
    throw new Error('externalTask.id must be a nonempty string');
  }
  if (url !== undefined && url !== null && (
    typeof url !== 'string' || url.trim().length === 0
  )) {
    throw new Error('externalTask.url must be a nonempty string');
  }
  if ((taskId === undefined || taskId === null) && (url === undefined || url === null)) {
    throw new Error('externalTask must define id or url');
  }
  return {
    id: typeof taskId === 'string' ? taskId.trim() : null,
    url: typeof url === 'string' ? url.trim() : null,
  };
}

async function parseRepositories(value, workspaceRoot, environment) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).length === 0
  ) {
    throw new Error('repositories must be a nonempty object');
  }

  const repositories = [];
  const paths = new Map();
  for (const [rawAlias, rawRepository] of Object.entries(value)) {
    const alias = validateIdentifier(rawAlias, 'repository alias');
    if (
      rawRepository === null
      || typeof rawRepository !== 'object'
      || Array.isArray(rawRepository)
    ) {
      throw new Error(`repositories.${alias} must be an object`);
    }
    const rawPath = requiredString(rawRepository, 'path', `repositories.${alias}`);
    const expandedPath = expandUser(rawPath, environment);
    if (isAbsolute(expandedPath)) {
      throw new Error(`repositories.${alias}.path must be workspace-relative`);
    }
    const unresolvedPath = resolve(workspaceRoot, expandedPath);
    if (!isWithin(unresolvedPath, workspaceRoot)) {
      throw new Error(`repositories.${alias}.path escapes the workspace root`);
    }
    const pathInfo = await info(unresolvedPath);
    if (!pathInfo?.isDirectory()) {
      throw new Error(
        `repositories.${alias}.path does not identify an existing directory: ${unresolvedPath}`
      );
    }
    const path = await realpath(unresolvedPath);
    if (!isWithin(path, workspaceRoot)) {
      throw new Error(`repositories.${alias}.path escapes the workspace root`);
    }
    if (paths.has(path)) {
      throw new Error(
        `repositories.${alias} and repositories.${paths.get(path)} resolve to the same path`
      );
    }
    paths.set(path, alias);
    const remote = validateIdentifier(
      rawRepository.remote ?? 'origin',
      `repositories.${alias}.remote`
    );
    const integrationBranch = validateBranchName(
      requiredString(rawRepository, 'integrationBranch', `repositories.${alias}`),
      `repositories.${alias}.integrationBranch`
    );
    const rawFeatureBase = rawRepository.featureBaseSha;
    let featureBaseSha = null;
    if (rawFeatureBase !== undefined && rawFeatureBase !== null) {
      if (typeof rawFeatureBase !== 'string' || !OBJECT_ID.test(rawFeatureBase)) {
        throw new Error(
          `repositories.${alias}.featureBaseSha must be a full hexadecimal object ID`
        );
      }
      featureBaseSha = rawFeatureBase.toLowerCase();
    }
    repositories.push({
      alias,
      path,
      remote,
      integrationBranch,
      featureBaseSha,
    });
  }
  return repositories;
}

function selectRepository(repositories, start, repositoryAlias) {
  if (repositoryAlias !== null) {
    const repository = repositories.find((item) => item.alias === repositoryAlias);
    if (repository) return repository;
    const known = repositories.map((item) => item.alias).join(', ');
    throw new Error(
      `Unknown repository alias ${JSON.stringify(repositoryAlias)}; configured aliases: ${known}`
    );
  }
  if (repositories.length === 1) return repositories[0];

  const matches = repositories
    .filter((item) => isWithin(start, item.path))
    .sort((left, right) => right.path.split(sep).length - left.path.split(sep).length);
  if (matches.length === 0) {
    throw new Error(
      'Current path does not identify a configured repository; pass a repository alias'
    );
  }
  return matches[0];
}

async function findWorkspaceConfig(start) {
  let current = start;
  while (true) {
    const candidate = resolve(current, CONFIG_NAME);
    if ((await info(candidate))?.isFile()) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function runGit(args, cwd, { gitExecutable, environment, exec }) {
  if (typeof gitExecutable !== 'string' || gitExecutable.length === 0) {
    throw new Error('Git executable is unavailable for legacy workflow-context resolution');
  }
  try {
    const result = await exec(gitExecutable, ['-C', cwd, ...args], {
      encoding: 'utf8',
      env: { ...environment },
      maxBuffer: 10 * 1024 * 1024,
      timeout: 20_000,
    });
    return result.stdout.trim();
  } catch (error) {
    throw new Error(
      error?.stderr?.trim() || error?.stdout?.trim() || error?.message || 'Git command failed',
      { cause: error }
    );
  }
}

async function legacyContext(start, options) {
  const root = await realpath(await runGit(
    ['rev-parse', '--show-toplevel'],
    start,
    options
  ));
  const branch = await runGit(['branch', '--show-current'], root, options);
  if (branch.length === 0) {
    throw new Error(`Cannot derive legacy feature identity from detached HEAD in ${root}`);
  }
  const repository = {
    alias: 'repository',
    path: root,
    remote: 'origin',
    integrationBranch: '',
    featureBaseSha: null,
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    mode: 'legacy',
    workspaceRoot: root,
    configPath: null,
    featureId: branch,
    featureHome: resolve(root, 'docs', 'issues', branch),
    externalTask: null,
    multiRepository: false,
    repository,
    repositories: [repository],
  };
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read JSON file ${path}: ${error.message}`, { cause: error });
  }
}

export async function resolveWorkflowContext({
  cwd = process.cwd(),
  repository = null,
  gitExecutable = 'git',
  environment = process.env,
  exec = executeFile,
} = {}) {
  const requestedPath = resolve(expandUser(cwd, environment));
  try {
    const start = await canonicalStart(requestedPath, environment);
    const configPath = await findWorkspaceConfig(start);
    if (configPath === null) {
      return await legacyContext(start, { gitExecutable, environment, exec });
    }

    const raw = await readJson(configPath);
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`${configPath} must contain a JSON object`);
    }
    if (raw.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`${configPath} schemaVersion must be ${SCHEMA_VERSION}`);
    }
    const workspaceRoot = await realpath(dirname(configPath));
    const canonicalConfigPath = await realpath(configPath);
    const featureId = validateFeatureId(raw.featureId);
    const repositories = await parseRepositories(
      raw.repositories,
      workspaceRoot,
      environment
    );
    const selectedRepository = selectRepository(repositories, start, repository);
    return {
      schemaVersion: SCHEMA_VERSION,
      mode: 'configured',
      workspaceRoot,
      configPath: canonicalConfigPath,
      featureId,
      featureHome: resolve(workspaceRoot, 'docs', 'issues', featureId),
      externalTask: parseExternalTask(raw.externalTask),
      multiRepository: repositories.length > 1,
      repository: selectedRepository,
      repositories,
    };
  } catch (error) {
    if (error instanceof ProtocolError) throw error;
    throw new ProtocolError(
      'WORKFLOW_CONTEXT_ERROR',
      error?.message || 'Cannot resolve workflow context',
      { cwd: requestedPath, repository },
      { cause: error }
    );
  }
}
