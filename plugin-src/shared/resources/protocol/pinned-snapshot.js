import { execFile } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readdir, readlink, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

import { sha256Digest } from './agent-workflow.js';
import { ContractError } from './errors.js';

const execFileAsync = promisify(execFile);
const SHA = /^[0-9a-f]{40,64}$/u;
const MAX_PACKET_BYTES = 12 * 1024 * 1024;
const EVIDENCE_ROOT = '.gatereeve-agent-evidence';

async function defaultRunner(executable, args, options) {
  const result = await execFileAsync(executable, args, {
    ...options,
    encoding: 'utf8',
    maxBuffer: MAX_PACKET_BYTES,
  });
  return result.stdout;
}

function validateSha(value, label) {
  if (typeof value !== 'string' || !SHA.test(value)) {
    throw new ContractError(`${label} must be a full lowercase Git object ID`);
  }
  return value;
}

function safeRelativePath(value, label) {
  if (
    typeof value !== 'string'
    || value === ''
    || value.startsWith('/')
    || value.includes('\\')
    || value.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) throw new ContractError(`${label} must be a safe repository-relative path`);
  return value;
}

async function makeReadOnly(root, boundaryRoot = root) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) {
      const target = await readlink(path);
      const resolvedTarget = resolve(dirname(path), target);
      if (
        target.startsWith('/')
        || (resolvedTarget !== boundaryRoot && !resolvedTarget.startsWith(`${boundaryRoot}${sep}`))
      ) {
        throw new ContractError(`Pinned snapshot symlink escapes its root: ${path}`);
      }
      continue;
    }
    if (entry.isDirectory()) {
      await makeReadOnly(path, boundaryRoot);
      await chmod(path, 0o555);
    } else if (entry.isFile()) {
      const details = await stat(path);
      await chmod(path, details.mode & 0o111 ? 0o555 : 0o444);
    } else throw new ContractError(`Pinned snapshot contains an unsupported entry: ${path}`);
  }
  await chmod(root, 0o555);
}

async function makeWritable(root) {
  await chmod(root, 0o700).catch(() => {});
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) await makeWritable(path);
    else if (!entry.isSymbolicLink()) await chmod(path, 0o600).catch(() => {});
  }
}

async function materializeEvidenceFiles(repositoryPath, evidenceFiles) {
  if (evidenceFiles === null || typeof evidenceFiles !== 'object' || Array.isArray(evidenceFiles)) {
    throw new ContractError('Pinned snapshot evidence files must be an object');
  }
  const evidenceRoot = join(repositoryPath, EVIDENCE_ROOT);
  try {
    await stat(evidenceRoot);
    throw new ContractError(`Pinned repository already contains reserved path ${EVIDENCE_ROOT}`);
  } catch (error) {
    if (error instanceof ContractError) throw error;
    if (error?.code !== 'ENOENT') throw error;
  }
  const manifest = {};
  for (const [rawPath, content] of Object.entries(evidenceFiles).sort(([left], [right]) => left.localeCompare(right))) {
    const path = safeRelativePath(rawPath, 'Pinned snapshot evidence path');
    if (!path.startsWith(`${EVIDENCE_ROOT}/`)) {
      throw new ContractError(`Pinned snapshot evidence must be beneath ${EVIDENCE_ROOT}`);
    }
    if (typeof content !== 'string') {
      throw new ContractError(`Pinned snapshot evidence ${path} must be text`);
    }
    const target = join(repositoryPath, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    manifest[path] = {
      hash: sha256Digest(content),
      bytes: Buffer.byteLength(content, 'utf8'),
    };
  }
  return manifest;
}

function lines(value) {
  return value.split(/\r?\n/u).filter(Boolean);
}

async function git(runner, repositoryRoot, args) {
  return (await runner('git', ['-C', repositoryRoot, ...args], { cwd: repositoryRoot })).trim();
}

export async function createPinnedRepositorySnapshot({
  repositoryRoot,
  headSha,
  evidenceFiles = {},
  runner = defaultRunner,
  scratchParent = tmpdir(),
}) {
  const root = await realpath(resolve(repositoryRoot));
  validateSha(headSha, 'Pinned head SHA');
  const topLevel = await realpath(resolve(await git(runner, root, ['rev-parse', '--show-toplevel'])));
  if (topLevel !== root) throw new ContractError('Pinned repository root must be the Git top level');
  const resolvedHead = await git(runner, root, ['rev-parse', `${headSha}^{commit}`]);
  if (resolvedHead !== headSha) throw new ContractError('Pinned head does not resolve to the exact requested commit');
  const treeSha = await git(runner, root, ['rev-parse', `${headSha}^{tree}`]);
  const scratchRoot = await mkdtemp(join(resolve(scratchParent), 'gatereeve-pinned-'));
  const repositoryPath = join(scratchRoot, 'repository');
  const archivePath = join(scratchRoot, 'snapshot.tar');
  await mkdir(repositoryPath);
  try {
    await runner('git', ['-C', root, 'archive', '--format=tar', `--output=${archivePath}`, headSha], { cwd: root });
    await runner('tar', ['-xf', archivePath, '-C', repositoryPath], { cwd: scratchRoot });
    await rm(archivePath, { force: true });
    const evidence = await materializeEvidenceFiles(repositoryPath, evidenceFiles);
    await makeReadOnly(repositoryPath);
    return {
      schemaVersion: 1,
      repositoryPath,
      headSha,
      treeSha,
      digest: sha256Digest({ headSha, treeSha, evidence }),
      evidence,
      async cleanup() {
        await makeWritable(scratchRoot);
        await rm(scratchRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await makeWritable(scratchRoot);
    await rm(scratchRoot, { recursive: true, force: true });
    throw error;
  }
}

async function showOptional(runner, repositoryRoot, sha, path) {
  try {
    return await runner('git', ['-C', repositoryRoot, 'show', `${sha}:${path}`], { cwd: repositoryRoot });
  } catch {
    return null;
  }
}

export async function buildPinnedChangeInput({
  repositoryRoot,
  baseSha,
  headSha,
  scope,
  sliceBaseSha = null,
  featureHome = null,
  runner = defaultRunner,
}) {
  const root = resolve(repositoryRoot);
  validateSha(baseSha, 'Pinned base SHA');
  validateSha(headSha, 'Pinned head SHA');
  if (!['SLICE', 'FEATURE'].includes(scope)) throw new ContractError('Pinned change scope is invalid');
  if (scope === 'FEATURE' && sliceBaseSha === null) {
    throw new ContractError('Feature-wide pinned input requires the final slice base SHA');
  }
  if (sliceBaseSha !== null) validateSha(sliceBaseSha, 'Pinned slice base SHA');
  for (const sha of [baseSha, headSha, ...(sliceBaseSha ? [sliceBaseSha] : [])]) {
    const resolved = await git(runner, root, ['rev-parse', `${sha}^{commit}`]);
    if (resolved !== sha) throw new ContractError(`Pinned Git object changed identity: ${sha}`);
  }
  const changedFiles = lines(await runner(
    'git', ['-C', root, 'diff', '--name-only', '--no-renames', `${baseSha}..${headSha}`], { cwd: root }
  ));
  const patch = await runner(
    'git', ['-C', root, 'diff', '--binary', '--no-ext-diff', '--no-renames', `${baseSha}..${headSha}`], { cwd: root }
  );
  const effectiveSliceBase = sliceBaseSha ?? baseSha;
  const sliceMatchesFeature = scope === 'FEATURE' && effectiveSliceBase === baseSha;
  const sliceChangedFiles = scope === 'FEATURE' && !sliceMatchesFeature
    ? lines(await runner(
        'git', ['-C', root, 'diff', '--name-only', '--no-renames', `${effectiveSliceBase}..${headSha}`], { cwd: root }
      ))
    : changedFiles;
  const slicePatch = scope === 'FEATURE' && !sliceMatchesFeature
    ? await runner(
        'git', ['-C', root, 'diff', '--binary', '--no-ext-diff', '--no-renames', `${effectiveSliceBase}..${headSha}`], { cwd: root }
      )
    : scope === 'FEATURE' ? null : patch;

  const documents = {};
  if (featureHome !== null) {
    const featurePath = resolve(featureHome);
    const relativeHome = relative(root, featurePath).split(sep).join('/');
    if (relativeHome.split('/')[0] === '..') {
      throw new ContractError('Feature home must be inside the selected repository');
    }
    for (const name of ['spec.md', 'design.md', 'plan.md', 'decisions.md']) {
      const path = safeRelativePath(`${relativeHome}/${name}`, `Feature document ${name}`);
      documents[name] = await showOptional(runner, root, headSha, path);
    }
  }
  const value = {
    schemaVersion: 1,
    scope,
    source: { baseSha, headSha, sliceBaseSha: effectiveSliceBase },
    changedFiles,
    patch,
    sliceChangedFiles,
    slicePatch,
    slicePatchSameAsFeature: sliceMatchesFeature,
    documents,
  };
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_PACKET_BYTES) {
    throw new ContractError('Pinned change packet exceeds the bounded input limit');
  }
  return value;
}
