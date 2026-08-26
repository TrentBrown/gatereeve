import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, resolve, sep } from 'node:path';

const SUPPORTED_PLATFORMS = new Set(['codex', 'claude']);
const MANIFEST_PATHS = {
  codex: '.codex-plugin/plugin.json',
  claude: '.claude-plugin/plugin.json',
};
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function portablePath(path) {
  return path.split(sep).join('/');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function protocolSourceManifest(sharedFiles) {
  const prefix = 'resources/protocol/';
  const files = sharedFiles
    .filter((entry) => entry.path.startsWith(prefix))
    .map((entry) => ({
      path: entry.path.slice(prefix.length),
      size: entry.size,
      sha256: entry.sha256,
    }));

  if (files.length === 0) return null;
  const hash = createHash('sha256').update(stableJson(files)).digest('hex');
  return {
    schemaVersion: 1,
    sourcePath: 'resources/protocol',
    hash: `sha256:${hash}`,
    files,
  };
}

async function ensureDirectory(path, label) {
  let details;
  try {
    details = await stat(path);
  } catch {
    throw new Error(`${label} does not exist: ${path}`);
  }

  if (!details.isDirectory()) {
    throw new Error(`${label} is not a directory: ${path}`);
  }
}

async function inventoryTree(root) {
  const entries = [];

  async function visit(directory) {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));

    for (const child of children) {
      const absolutePath = join(directory, child.name);
      const path = portablePath(relative(root, absolutePath));

      if (
        child.name === '__pycache__' ||
        child.name === '.DS_Store' ||
        child.name.endsWith('.pyc')
      ) {
        throw new Error(`Transient file must not enter plugin sources: ${absolutePath}`);
      }

      if (child.isSymbolicLink()) {
        throw new Error(`Plugin sources must be self-contained; symlink found: ${absolutePath}`);
      }

      if (child.isDirectory()) {
        entries.push({ path, type: 'directory' });
        await visit(absolutePath);
        continue;
      }

      if (!child.isFile()) {
        throw new Error(`Unsupported plugin source entry: ${absolutePath}`);
      }

      const content = await readFile(absolutePath);
      entries.push({
        path,
        type: 'file',
        size: content.byteLength,
        sha256: createHash('sha256').update(content).digest('hex'),
      });
    }
  }

  await visit(root);
  return entries;
}

function rejectOverlayCollisions(sharedEntries, overlayEntries, platform) {
  const sharedPaths = new Set(sharedEntries.map((entry) => entry.path));
  const collisions = overlayEntries
    .filter((entry) => sharedPaths.has(entry.path))
    .map((entry) => entry.path);

  if (collisions.length > 0) {
    throw new Error(
      `${platform} overlay duplicates shared paths: ${collisions.join(', ')}`
    );
  }
}

async function readManifest(root, platform) {
  const manifestPath = resolve(root, MANIFEST_PATHS[platform]);
  let manifest;

  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read ${platform} manifest ${manifestPath}: ${detail}`);
  }

  if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
    throw new Error(`${platform} manifest must declare a non-empty name`);
  }

  return { manifest, manifestPath };
}

async function setManifestVersion(packageRoot, platform, version) {
  const { manifest, manifestPath } = await readManifest(packageRoot, platform);
  manifest.version = version;
  await writeFile(manifestPath, stableJson(manifest));
}

function validateInputs({ platforms, version, sourceCommit }) {
  if (!SEMVER.test(version)) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  if (!sourceCommit || !sourceCommit.trim()) {
    throw new Error('sourceCommit must be a non-empty string');
  }

  if (!Array.isArray(platforms) || platforms.length === 0) {
    throw new Error('At least one platform must be selected');
  }

  if (new Set(platforms).size !== platforms.length) {
    throw new Error('Selected platforms must be unique');
  }

  for (const platform of platforms) {
    if (!SUPPORTED_PLATFORMS.has(platform)) {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}

export async function composePackages({
  sourceRoot,
  distRoot,
  platforms = ['codex', 'claude'],
  version,
  sourceCommit,
  sourceTag = null,
}) {
  validateInputs({ platforms, version, sourceCommit });

  const normalizedSourceRoot = resolve(sourceRoot);
  const normalizedDistRoot = resolve(distRoot);
  const sharedRoot = resolve(normalizedSourceRoot, 'shared');

  await ensureDirectory(sharedRoot, 'Shared plugin source');
  const sharedEntries = await inventoryTree(sharedRoot);
  const sharedFiles = sharedEntries.filter((entry) => entry.type === 'file');
  const protocolSource = protocolSourceManifest(sharedFiles);

  const platformSources = [];
  for (const platform of platforms) {
    const overlayRoot = resolve(normalizedSourceRoot, platform);
    await ensureDirectory(overlayRoot, `${platform} plugin overlay`);
    const overlayEntries = await inventoryTree(overlayRoot);
    rejectOverlayCollisions(sharedEntries, overlayEntries, platform);
    const { manifest } = await readManifest(overlayRoot, platform);
    platformSources.push({ platform, overlayRoot, manifestName: manifest.name });
  }

  const manifestNames = new Set(platformSources.map((item) => item.manifestName));
  if (manifestNames.size !== 1) {
    throw new Error(
      `Platform manifests must use one plugin identity: ${[...manifestNames].join(', ')}`
    );
  }

  if (platforms.length === SUPPORTED_PLATFORMS.size) {
    await rm(normalizedDistRoot, { recursive: true, force: true });
  }
  await mkdir(normalizedDistRoot, { recursive: true });

  const packages = [];
  for (const { platform, overlayRoot, manifestName } of platformSources) {
    const outputPath = resolve(normalizedDistRoot, platform);

    await rm(outputPath, { recursive: true, force: true });
    await mkdir(outputPath, { recursive: true });
    await cp(sharedRoot, outputPath, { recursive: true, force: false });
    await cp(overlayRoot, outputPath, { recursive: true, force: false });
    await setManifestVersion(outputPath, platform, version);

    const buildDirectory = resolve(outputPath, '.workflow-build');
    await mkdir(buildDirectory, { recursive: true });
    await writeFile(
      resolve(buildDirectory, 'shared-files.json'),
      stableJson({ schemaVersion: 1, files: sharedFiles })
    );
    await writeFile(
      resolve(buildDirectory, 'provenance.json'),
      stableJson({
        schemaVersion: 1,
        platform,
        version,
        sourceCommit,
        sourceTag,
        ...(protocolSource ? { protocolHash: protocolSource.hash } : {}),
      })
    );
    if (protocolSource) {
      await writeFile(
        resolve(buildDirectory, 'protocol-source.json'),
        stableJson(protocolSource)
      );
    }

    const outputEntries = await inventoryTree(outputPath);
    packages.push({
      platform,
      pluginName: manifestName,
      outputPath,
      fileCount: outputEntries.filter((entry) => entry.type === 'file').length,
      sharedFileCount: sharedFiles.length,
    });
  }

  return {
    schemaVersion: 1,
    sourceRoot: normalizedSourceRoot,
    distRoot: normalizedDistRoot,
    version,
    sourceCommit,
    sourceTag,
    protocol: protocolSource,
    packages,
  };
}
