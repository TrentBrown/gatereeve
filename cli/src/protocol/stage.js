import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

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

export async function stageProtocolResources({ sourceRoot, destinationRoot }) {
  const source = resolve(sourceRoot);
  const destination = resolve(destinationRoot);
  const sourceProtocol = resolve(source, 'protocol');
  const sourceInfo = await stat(sourceProtocol);
  if (!sourceInfo.isDirectory()) throw new Error(`Protocol source is not a directory: ${sourceProtocol}`);

  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true, force: false });

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
  await writeFile(resolve(destination, 'cli-projection.json'), stableJson(manifest));
  return manifest;
}
