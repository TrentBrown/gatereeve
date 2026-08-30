import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { aggregateNativeTrustEvidenceV2 } from '../src/plugin/native-trust-evidence-v2.js';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const appleTrustPath = argument('--apple-trust');
const arm64Path = argument('--arm64');
const x64Path = argument('--x64');
const outputPath = argument('--output');
if (!appleTrustPath || !arm64Path || !x64Path || !outputPath) {
  throw new Error('Usage: aggregate-native-trust --apple-trust <json> --arm64 <json> --x64 <json> --output <json>');
}
const values = await Promise.all(
  [appleTrustPath, arm64Path, x64Path].map(async (path) => JSON.parse(await readFile(resolve(path), 'utf8'))),
);
const aggregate = aggregateNativeTrustEvidenceV2({ appleTrust: values[0], evidence: values.slice(1) });
await writeFile(resolve(outputPath), `${JSON.stringify(aggregate, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify(aggregate, null, 2)}\n`);
