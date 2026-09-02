import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { readPrimaryPublicationReceipt } from '../scripts/read-primary-publication-receipt.js';

const dmgSha256 = 'a'.repeat(64);

function lifecycle(overrides = {}) {
  return {
    schemaVersion: 2,
    kind: 'gatereeve-coordinated-release',
    stages: [
      {
        stage: 'distribution-finalized',
        evidence: { candidates: { desktop: { artifact: { sha256: dmgSha256 } } } },
      },
      { stage: 'publication-approved', evidence: {} },
      { stage: 'published', evidence: {} },
    ],
    ...overrides,
  };
}

test('reads the exact public DMG identity from a published schema-v2 lifecycle', () => {
  const bytes = Buffer.from(`${JSON.stringify(lifecycle(), null, 2)}\n`);
  assert.deepEqual(readPrimaryPublicationReceipt(bytes), {
    recordSha256: createHash('sha256').update(bytes).digest('hex'),
    publicDmgSha256: dmgSha256,
  });
});

test('rejects the schema-v1 projection shape that caused the RC.11 state failure', () => {
  const bytes = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    kind: 'gatereeve-coordinated-release',
    candidates: { desktop: { artifact: { sha256: dmgSha256 } } },
  }));
  assert.throws(
    () => readPrimaryPublicationReceipt(bytes),
    /published schema-v2 lifecycle/,
  );
});

test('rejects an unpublished or ambiguous lifecycle receipt', () => {
  const unpublished = lifecycle({ stages: lifecycle().stages.slice(0, -1) });
  assert.throws(
    () => readPrimaryPublicationReceipt(Buffer.from(JSON.stringify(unpublished))),
    /published schema-v2 lifecycle/,
  );

  const duplicate = lifecycle();
  duplicate.stages.splice(1, 0, structuredClone(duplicate.stages[0]));
  assert.throws(
    () => readPrimaryPublicationReceipt(Buffer.from(JSON.stringify(duplicate))),
    /one distribution-finalized stage/,
  );
});

test('rejects a published lifecycle without an exact DMG digest', () => {
  const record = lifecycle();
  record.stages[0].evidence.candidates.desktop.artifact.sha256 = 'not-a-digest';
  assert.throws(
    () => readPrimaryPublicationReceipt(Buffer.from(JSON.stringify(record))),
    /no exact public DMG digest/,
  );
});
