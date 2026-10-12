import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, lstat, mkdtemp, mkdir, readdir, readlink, realpath, rm, stat, writeFile } from 'node:fs/promises';
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
    const target = join(repositoryPath, path);
    await mkdir(dirname(target), { recursive: true });
    if (typeof content === 'string') {
      await writeFile(target, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      manifest[path] = { hash: sha256Digest(content), bytes: Buffer.byteLength(content, 'utf8') };
    } else if (content && typeof content.sourcePath === 'string'
      && /^sha256:[0-9a-f]{64}$/u.test(content.hash) && Number.isSafeInteger(content.bytes) && content.bytes >= 0) {
      const info = await lstat(content.sourcePath);
      if (!info.isFile() || info.isSymbolicLink()) throw new ContractError('Review evidence source must be a regular file');
      await copyFile(content.sourcePath, target, 1); // COPYFILE_EXCL
      const digest = createHash('sha256');
      let bytes = 0;
      for await (const chunk of createReadStream(target)) { digest.update(chunk); bytes += chunk.length; }
      const hash = `sha256:${digest.digest('hex')}`;
      if (hash !== content.hash || bytes !== content.bytes) throw new ContractError('Review evidence changed during materialization');
      manifest[path] = { hash, bytes };
    } else {
      throw new ContractError(`Pinned snapshot evidence ${path} must be text or a bound file`);
    }
  }
  return manifest;
}

function lines(value) {
  return value.split(/\r?\n/u).filter(Boolean);
}

async function git(runner, repositoryRoot, args) {
  return (await runner('git', ['-C', repositoryRoot, ...args], { cwd: repositoryRoot })).trim();
}

async function validateSourceView(repositoryPath, entries) {
  for (const entry of entries) {
    const path = join(repositoryPath, safeRelativePath(entry.path, 'Review source'));
    const info = await lstat(path);
    const symlink = entry.mode === '120000';
    if (symlink !== info.isSymbolicLink() || (!symlink && !info.isFile())) {
      throw new ContractError(`Review source type differs from Git: ${entry.path}`);
    }
    const target = symlink ? await readlink(path, { encoding: 'buffer' }) : null;
    const size = target?.length ?? info.size;
    const hash = createHash(entry.oid.length === 64 ? 'sha256' : 'sha1');
    hash.update(`blob ${size}\0`);
    if (target) hash.update(target);
    else for await (const chunk of createReadStream(path)) hash.update(chunk);
    if (hash.digest('hex') !== entry.oid
      || (!symlink && Boolean(info.mode & 0o111) !== (entry.mode === '100755'))) {
      throw new ContractError(`Review source content or mode differs from Git: ${entry.path}`);
    }
  }
}

export async function createPinnedRepositorySnapshot({
  repositoryRoot,
  headSha,
  evidenceFiles = {},
  runner = defaultRunner,
  scratchParent = tmpdir(),
  excludedPaths = [],
  reviewView = null,
  expectedEntries = null,
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
    if (reviewView) {
      if (!Array.isArray(expectedEntries)) throw new ContractError('Compact snapshot requires a bound source inventory');
      // An empty checkout/index prevents export-ignore/export-subst attributes
      // from changing review source. The shared object database is read-only;
      // remove the temporary Git directory before any agent gets its view.
      const objects = join(scratchRoot, 'objects');
      const template = join(scratchRoot, 'empty-template');
      await mkdir(template);
      const env = { ...process.env, GIT_ATTR_NOSYSTEM: '1' };
      await runner('git', ['-c', `init.templateDir=${template}`, 'clone', '-q', '--shared', '--no-checkout', root, objects], { cwd: scratchRoot, env });
      await runner('git', ['-c', 'core.attributesFile=/dev/null', '-C', objects, 'archive', '--worktree-attributes',
        '--format=tar', `--output=${archivePath}`, headSha], { cwd: scratchRoot, env });
      await rm(objects, { recursive: true, force: true });
      await rm(template, { recursive: true, force: true });
    } else {
      await runner('git', ['-C', root, 'archive', '--format=tar', `--output=${archivePath}`, headSha], { cwd: root });
    }
    await runner('tar', ['-xf', archivePath, '-C', repositoryPath], { cwd: scratchRoot });
    await rm(archivePath, { force: true });
    for (const rawPath of excludedPaths) {
      const path = safeRelativePath(rawPath, 'Review exclusion');
      // Tree entries are individual files, never recursive directory masks.
      await rm(join(repositoryPath, path), { force: true });
    }
    if (reviewView) await validateSourceView(repositoryPath, expectedEntries);
    const evidence = await materializeEvidenceFiles(repositoryPath, evidenceFiles);
    await makeReadOnly(repositoryPath);
    return {
      schemaVersion: 1,
      repositoryPath,
      headSha,
      treeSha,
      digest: sha256Digest({ headSha, treeSha, evidence, ...(reviewView ? { reviewView } : {}) }),
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
