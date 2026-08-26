import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';

function portablePath(path) {
  return path.split(sep).join('/');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function protocolFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`Protocol staging does not accept non-file entries: ${absolutePath}`);
      }
      const content = await readFile(absolutePath);
      files.push({
        path: portablePath(relative(root, absolutePath)),
        size: content.byteLength,
        sha256: createHash('sha256').update(content).digest('hex'),
      });
    }
  }
  await visit(root);
  return files;
}

function validateManifestName(manifestName) {
  if (
    typeof manifestName !== 'string'
    || manifestName.length === 0
    || manifestName.includes('/')
    || manifestName.includes('\\')
  ) {
    throw new Error('Protocol staging manifest name must be a plain file name');
  }
}

function validateIncludePaths(includePaths) {
  if (includePaths === null) return;
  if (!Array.isArray(includePaths) || includePaths.length === 0) {
    throw new Error('Protocol staging includePaths must be a nonempty array');
  }
  if (new Set(includePaths).size !== includePaths.length) {
    throw new Error('Protocol staging includePaths must not contain duplicates');
  }
  for (const path of includePaths) {
    if (
      typeof path !== 'string'
      || path.length === 0
      || path.includes('\\')
      || isAbsolute(path)
      || normalize(path) !== path
      || path.split('/').some((part) => part === '' || part === '.' || part === '..')
    ) {
      throw new Error(`Protocol staging include path is unsafe: ${path}`);
    }
  }
}

export async function stageProtocolResources({
  sourceRoot,
  destinationRoot,
  manifestName = 'cli-projection.json',
  includePaths = null,
}) {
  validateManifestName(manifestName);
  validateIncludePaths(includePaths);
  const source = resolve(sourceRoot);
  const destination = resolve(destinationRoot);
  const sourceProtocol = resolve(source, 'protocol');
  const sourceInfo = await stat(sourceProtocol);
  if (!sourceInfo.isDirectory()) throw new Error(`Protocol source is not a directory: ${sourceProtocol}`);

  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  if (includePaths === null) {
    await cp(source, destination, { recursive: true, force: false });
  } else {
    for (const path of includePaths) {
      const target = resolve(destination, path);
      await mkdir(dirname(target), { recursive: true });
      await cp(resolve(source, path), target, { recursive: true, force: false });
    }
  }

  const stagedProtocol = resolve(destination, 'protocol');
  const files = await protocolFiles(stagedProtocol);
  const protocolHash = createHash('sha256').update(stableJson(files)).digest('hex');
  const model = await readFile(resolve(stagedProtocol, 'model/workflow-model.json'));
  const manifest = {
    schemaVersion: 1,
    canonicalSource: 'plugin-src/shared/resources/protocol',
    protocolHash: `sha256:${protocolHash}`,
    modelSha256: createHash('sha256').update(model).digest('hex'),
    files,
  };
  await writeFile(resolve(destination, manifestName), stableJson(manifest));
  return manifest;
}
