import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { buildTrustedReleaseLifecycleV2 } from '../src/plugin/trusted-release-lifecycle-v2.js';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const repository = argument('--repository');
const tag = argument('--tag');
const sourceCommit = argument('--source-commit');
const pluginRoot = argument('--plugin-root');
const appleTrustPath = argument('--apple-trust');
const nativeAggregatePath = argument('--native-aggregate');
const outputPath = argument('--output');
if (!repository || !tag || !sourceCommit || !pluginRoot || !appleTrustPath
  || !nativeAggregatePath || !outputPath) {
  throw new Error('Usage: build-trusted-release-lifecycle --repository <url> --tag <tag> --source-commit <sha> --plugin-root <dir> --apple-trust <json> --native-aggregate <json> --output <json>');
}
const [appleTrust, nativeAggregate] = await Promise.all(
  [appleTrustPath, nativeAggregatePath].map(async (path) => (
    JSON.parse(await readFile(resolve(path), 'utf8'))
  )),
);
const record = await buildTrustedReleaseLifecycleV2({
  source: { repository, tag, commit: sourceCommit },
  pluginRoot,
  appleTrust,
  nativeAggregate,
});
const resolvedOutput = resolve(outputPath);
await mkdir(dirname(resolvedOutput), { recursive: true });
await writeFile(resolvedOutput, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
