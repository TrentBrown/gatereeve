import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

import { validateDeployedRelease } from './release-version.js';

export const PLUGIN_CANDIDATE_INTEGRITY_SCHEMA_VERSION = 1;
export const PLUGIN_CANDIDATE_INTEGRITY_KIND = 'gatereeve-plugin-candidate-integrity';

const MARKETPLACE_ID = 'quality-code';
const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function portablePath(root, path) {
  return relative(root, path).split(sep).join('/');
}

function assertSafeRelativePath(path, label = 'Plugin candidate path') {
  if (
    typeof path !== 'string'
    || path === ''
    || path.startsWith('/')
    || path.includes('\\')
    || path.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) throw new Error(`${label} is unsafe: ${path}`);
  return path;
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is missing or invalid`, { cause: error });
  }
}

async function readOptionalJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function hasSessionStartHook(hooks) {
  const groups = hooks?.hooks?.SessionStart;
  const handlers = groups?.[0]?.hooks;
  return (
    Array.isArray(groups)
    && groups.length === 1
    && Array.isArray(handlers)
    && handlers.length === 1
    && handlers[0]?.type === 'command'
    && typeof handlers[0]?.command === 'string'
    && handlers[0].command.length > 0
  );
}

async function validateSharedFiles(packageRoot, inventory, platform) {
  if (
    inventory?.schemaVersion !== 1
    || !Array.isArray(inventory.files)
    || inventory.files.length === 0
  ) throw new Error(`${platform} shared-file inventory is empty or malformed`);
  const paths = new Set();
  for (const item of inventory.files) {
    assertSafeRelativePath(item?.path, `${platform} shared-file path`);
    if (
      item.type !== 'file'
      || !Number.isSafeInteger(item.size)
      || item.size < 0
      || !SHA256.test(item.sha256 ?? '')
      || paths.has(item.path)
    ) throw new Error(`${platform} shared-file inventory contains an invalid or duplicate entry`);
    paths.add(item.path);
    const path = resolve(packageRoot, item.path);
    if (!path.startsWith(`${packageRoot}${sep}`)) {
      throw new Error(`${platform} shared-file path escapes the package root`);
    }
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`${platform} shared-file entry is not a regular file: ${item.path}`);
    }
    const contents = await readFile(path);
    if (contents.length !== item.size || sha256(contents) !== item.sha256) {
      throw new Error(`${platform} shared-file identity differs: ${item.path}`);
    }
  }
}

export async function assertPluginCandidateSemantics({
  pluginRoot,
  sourceTag,
  sourceCommit,
}) {
  const root = resolve(pluginRoot);
  const releaseMetadata = await readJson(resolve(root, 'RELEASE.json'), 'Plugin RELEASE.json');
  const release = validateDeployedRelease(releaseMetadata);
  if (
    release.tag !== sourceTag
    || release.version !== sourceTag.slice(1)
    || release.sourceCommit !== sourceCommit
  ) throw new Error('Plugin candidate does not match the exact tag and source commit');

  const codexCatalog = await readJson(
    resolve(root, '.agents/plugins/marketplace.json'),
    'Codex marketplace catalog',
  );
  const claudeCatalog = await readJson(
    resolve(root, '.claude-plugin/marketplace.json'),
    'Claude marketplace catalog',
  );
  const codexIds = codexCatalog.plugins?.map((plugin) => plugin.name);
  const claudeIds = claudeCatalog.plugins?.map((plugin) => plugin.name);
  if (
    codexCatalog.name !== MARKETPLACE_ID
    || claudeCatalog.name !== MARKETPLACE_ID
    || !Array.isArray(codexIds)
    || codexIds.length === 0
    || JSON.stringify(codexIds) !== JSON.stringify(claudeIds)
  ) throw new Error('Plugin marketplace catalogs are inconsistent');
  if (Array.isArray(releaseMetadata.plugins) && JSON.stringify(releaseMetadata.plugins) !== JSON.stringify(codexIds)) {
    throw new Error('Plugin release metadata differs from the marketplace catalogs');
  }

  for (const pluginId of codexIds) {
    const codexEntry = codexCatalog.plugins.find((plugin) => plugin.name === pluginId);
    const claudeEntry = claudeCatalog.plugins.find((plugin) => plugin.name === pluginId);
    if (
      codexEntry?.source?.path !== `./plugins/codex/${pluginId}`
      || claudeEntry?.source !== `./plugins/claude/${pluginId}`
    ) throw new Error(`Plugin marketplace sources are inconsistent for ${pluginId}`);

    const inventories = [];
    for (const platform of ['codex', 'claude']) {
      const packageRoot = resolve(root, 'plugins', platform, pluginId);
      const manifest = await readJson(
        resolve(
          packageRoot,
          platform === 'codex' ? '.codex-plugin/plugin.json' : '.claude-plugin/plugin.json',
        ),
        `${platform} ${pluginId} package manifest`,
      );
      const hooks = await readOptionalJson(resolve(packageRoot, 'hooks/hooks.json'));
      const provenance = await readJson(
        resolve(packageRoot, '.workflow-build/provenance.json'),
        `${platform} ${pluginId} build provenance`,
      );
      const inventory = await readJson(
        resolve(packageRoot, '.workflow-build/shared-files.json'),
        `${platform} ${pluginId} shared-file inventory`,
      );
      if (
        manifest.name !== pluginId
        || manifest.version !== sourceTag.slice(1)
        || manifest.skills !== './skills/'
      ) throw new Error(`${platform} ${pluginId} package manifest identity or version differs`);
      if (pluginId === 'agentic-development-workflow' && !hasSessionStartHook(hooks)) {
        throw new Error(`${platform} ${pluginId} SessionStart hook is invalid`);
      }
      if (
        provenance.platform !== platform
        || provenance.version !== sourceTag.slice(1)
        || provenance.sourceTag !== sourceTag
        || provenance.sourceCommit !== sourceCommit
      ) throw new Error(`${platform} ${pluginId} build provenance differs from the candidate`);
      await validateSharedFiles(packageRoot, inventory, `${platform} ${pluginId}`);
      inventories.push(inventory);
    }
    if (JSON.stringify(inventories[0]) !== JSON.stringify(inventories[1])) {
      throw new Error(`Codex and Claude shared-file inventories differ for ${pluginId}`);
    }
  }
  return release;
}

export async function inventoryPluginCandidate(pluginRoot) {
  const root = resolve(pluginRoot);
  const rootMetadata = await lstat(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error(`Plugin candidate root is not a real directory: ${root}`);
  }
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Plugin candidate must not contain symbolic links: ${path}`);
      }
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const relativePath = assertSafeRelativePath(portablePath(root, path));
        const details = await stat(path);
        files.push({
          path: relativePath,
          bytes: details.size,
          sha256: sha256(await readFile(path)),
        });
      } else throw new Error(`Plugin candidate contains an unsupported entry: ${path}`);
    }
  }
  await visit(root);
  if (files.length === 0) throw new Error('Plugin candidate is empty');
  files.sort((left, right) => compareText(left.path, right.path));
  return files;
}

export function pluginCandidateTreeSha256(files) {
  return sha256(stableJson(files));
}

export function assertPluginCandidateIntegrity(value) {
  if (
    value?.schemaVersion !== PLUGIN_CANDIDATE_INTEGRITY_SCHEMA_VERSION
    || value.kind !== PLUGIN_CANDIDATE_INTEGRITY_KIND
    || typeof value?.source?.tag !== 'string'
    || value.source.tag !== `v${value?.candidate?.version}`
    || !COMMIT.test(value.source.commit ?? '')
    || value.candidate.sourceCommit !== value.source.commit
    || !Number.isSafeInteger(value?.tree?.fileCount)
    || value.tree.fileCount < 1
    || !SHA256.test(value.tree.sha256 ?? '')
    || !Array.isArray(value.tree.files)
    || value.tree.files.length !== value.tree.fileCount
  ) throw new Error('Plugin candidate integrity manifest is invalid');
  let previous = null;
  for (const file of value.tree.files) {
    assertSafeRelativePath(file?.path);
    if (
      !Number.isSafeInteger(file.bytes)
      || file.bytes < 0
      || !SHA256.test(file.sha256 ?? '')
      || (previous !== null && compareText(previous, file.path) >= 0)
    ) throw new Error('Plugin candidate integrity file inventory is invalid or unsorted');
    previous = file.path;
  }
  if (pluginCandidateTreeSha256(value.tree.files) !== value.tree.sha256) {
    throw new Error('Plugin candidate integrity tree digest is invalid');
  }
  return value;
}

export async function createPluginCandidateIntegrity({
  pluginRoot,
  sourceTag,
  sourceCommit,
}) {
  if (!COMMIT.test(sourceCommit ?? '') || typeof sourceTag !== 'string') {
    throw new Error('Plugin candidate integrity requires an exact tag and full source commit');
  }
  await assertPluginCandidateSemantics({ pluginRoot, sourceTag, sourceCommit });
  const files = await inventoryPluginCandidate(pluginRoot);
  return assertPluginCandidateIntegrity({
    schemaVersion: PLUGIN_CANDIDATE_INTEGRITY_SCHEMA_VERSION,
    kind: PLUGIN_CANDIDATE_INTEGRITY_KIND,
    source: { tag: sourceTag, commit: sourceCommit },
    candidate: { version: sourceTag.slice(1), sourceCommit },
    tree: {
      fileCount: files.length,
      sha256: pluginCandidateTreeSha256(files),
      files,
    },
  });
}

export async function writePluginCandidateIntegrity({
  pluginRoot,
  integrityPath,
  sourceTag,
  sourceCommit,
}) {
  const root = resolve(pluginRoot);
  const path = resolve(integrityPath);
  if (path === root || path.startsWith(`${root}${sep}`)) {
    throw new Error('Plugin candidate integrity manifest must be outside the publishable tree');
  }
  const manifest = await createPluginCandidateIntegrity({ pluginRoot, sourceTag, sourceCommit });
  const content = stableJson(manifest);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, { flag: 'wx' });
  return {
    manifest,
    path,
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
  };
}

export async function verifyPluginCandidateIntegrity({
  pluginRoot,
  integrityPath,
  sourceTag,
  sourceCommit,
}) {
  const path = resolve(integrityPath);
  const content = await readFile(path);
  const manifest = assertPluginCandidateIntegrity(JSON.parse(content));
  if (
    manifest.source.tag !== sourceTag
    || manifest.source.commit !== sourceCommit
    || manifest.candidate.version !== sourceTag.slice(1)
  ) throw new Error('Plugin candidate integrity manifest identifies another release');
  const files = await inventoryPluginCandidate(pluginRoot);
  if (JSON.stringify(files) !== JSON.stringify(manifest.tree.files)) {
    throw new Error('Plugin candidate tree differs from its producer integrity manifest');
  }
  await assertPluginCandidateSemantics({ pluginRoot, sourceTag, sourceCommit });
  return {
    manifest,
    files,
    treeSha256: manifest.tree.sha256,
    manifestBytes: content.length,
    manifestSha256: sha256(content),
  };
}
