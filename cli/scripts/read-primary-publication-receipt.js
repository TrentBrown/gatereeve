import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const SHA256 = /^[a-f0-9]{64}$/u;

export function readPrimaryPublicationReceipt(bytes) {
  const record = JSON.parse(bytes);
  if (
    record?.schemaVersion !== 2
    || record.kind !== 'gatereeve-coordinated-release'
    || !Array.isArray(record.stages)
    || record.stages.at(-1)?.stage !== 'published'
  ) {
    throw new Error('Primary publication result must be a published schema-v2 lifecycle');
  }
  const finalized = record.stages.filter(
    (entry) => entry?.stage === 'distribution-finalized',
  );
  if (finalized.length !== 1) {
    throw new Error('Primary publication result must contain one distribution-finalized stage');
  }
  const publicDmgSha256 = finalized[0].evidence?.candidates?.desktop?.artifact?.sha256;
  if (!SHA256.test(publicDmgSha256 ?? '')) {
    throw new Error('Primary publication result has no exact public DMG digest');
  }
  return {
    recordSha256: createHash('sha256').update(bytes).digest('hex'),
    publicDmgSha256,
  };
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: read-primary-publication-receipt.js <release-record.json>');
  const receipt = readPrimaryPublicationReceipt(await readFile(path));
  process.stdout.write(`record_sha256=${receipt.recordSha256}\n`);
  process.stdout.write(`public_dmg_sha256=${receipt.publicDmgSha256}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
