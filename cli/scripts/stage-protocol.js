import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(cliRoot, '../plugin-src/shared/resources');
const destination = resolve(cliRoot, 'resources');

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: false });

const model = await readFile(resolve(destination, 'protocol/model/workflow-model.json'));
const manifest = {
  schemaVersion: 1,
  canonicalSource: 'plugin-src/shared/resources/protocol',
  modelSha256: createHash('sha256').update(model).digest('hex'),
};
await writeFile(resolve(destination, 'cli-projection.json'), `${JSON.stringify(manifest, null, 2)}\n`);
