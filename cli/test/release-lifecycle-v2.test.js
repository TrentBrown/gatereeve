import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertCoordinatedRelease,
  assertCoordinatedReleaseV1,
  readVersionedCoordinatedRelease,
} from '../src/plugin/coordinated-release.js';
import {
  RELEASE_STAGE_SEQUENCE_V2,
  advanceReleaseStageV2,
  assertMutableReleaseRecord,
  assertReleaseLifecycleV2,
  bindAppleArtifactV2,
  createReleaseLifecycleV2,
  dispatchReleaseRecordSchema,
} from '../src/plugin/release-lifecycle-v2.js';

const source = Object.freeze({
  repository: 'https://github.com/TrentBrown/gatereeve',
  commit: '1234567890abcdef1234567890abcdef12345678',
  tag: 'v0.1.0-rc.9',
});
const artifact = Object.freeze({
  filename: 'GateReeve-0.1.0-rc.9-macos-universal.dmg',
  bytes: 12345,
  sha256: 'a'.repeat(64),
});
const dates = [
  '2026-08-30T18:00:00.000Z',
  '2026-08-30T18:01:00.000Z',
  '2026-08-30T18:02:00.000Z',
  '2026-08-30T18:03:00.000Z',
  '2026-08-30T18:04:00.000Z',
  '2026-08-30T18:05:00.000Z',
  '2026-08-30T18:06:00.000Z',
  '2026-08-30T18:07:00.000Z',
  '2026-08-30T18:08:00.000Z',
  '2026-08-30T18:09:00.000Z',
  '2026-08-30T18:10:00.000Z',
  '2026-08-30T18:11:00.000Z',
  '2026-08-30T18:12:00.000Z',
];

function clock(index) {
  return () => new Date(dates[index]);
}

test('schema v2 advances through the exact GateReeve lifecycle prefix', () => {
  let record = createReleaseLifecycleV2({ source, now: clock(0) });
  assert.deepEqual(record.stages.map((entry) => entry.stage), ['source-pinned']);
  assert.equal(record.version, '0.1.0-rc.9');
  assert.equal(record.candidate.reservation.state, 'reserved');

  for (const [index, stage] of RELEASE_STAGE_SEQUENCE_V2.slice(1).entries()) {
    if (stage === 'trusted-universal-dmg-established') {
      record = bindAppleArtifactV2(record, artifact, clock(index + 1));
    }
    record = advanceReleaseStageV2(record, stage, {
      proof: `${stage}-proof`,
      ...(stage === 'trusted-universal-dmg-established' ? { artifact } : {}),
    }, clock(index + 1));
  }

  assert.equal(record.stages.at(-1).stage, 'published');
  assert.equal(record.stages.length, RELEASE_STAGE_SEQUENCE_V2.length);
  assert.equal(assertReleaseLifecycleV2(record), record);
  assert.equal(dispatchReleaseRecordSchema(record).mode, 'mutable-v2');
  assert.equal(assertCoordinatedRelease(record), record);
});

test('schema v2 rejects skipped, duplicate, unknown, and tampered stages', () => {
  const record = createReleaseLifecycleV2({ source, now: clock(0) });
  assert.throws(
    () => advanceReleaseStageV2(record, 'plugin-candidate-built', { proof: 'skip' }, clock(1)),
    /expected policy-resolved/u,
  );
  assert.throws(
    () => advanceReleaseStageV2(record, 'source-pinned', { proof: 'duplicate' }, clock(1)),
    /expected policy-resolved/u,
  );
  assert.throws(
    () => advanceReleaseStageV2(record, 'invented-stage', { proof: 'unknown' }, clock(1)),
    /unknown release stage/iu,
  );

  const tampered = structuredClone(record);
  tampered.stages[0].stage = 'policy-resolved';
  assert.throws(() => assertReleaseLifecycleV2(tampered), /ordered prefix/u);

  const sourceDrift = structuredClone(record);
  sourceDrift.source.repository = 'https://example.invalid/reinterpreted-history';
  assert.throws(() => assertReleaseLifecycleV2(sourceDrift), /stage digest|source-pinned/iu);

  const reservationDrift = structuredClone(record);
  reservationDrift.candidate.reservation.reservedAt = '2026-08-30T19:00:00.000Z';
  assert.throws(() => assertReleaseLifecycleV2(reservationDrift), /stage digest/u);
});

test('Apple-bound bytes are immutable and idempotent for the same identity', () => {
  let record = createReleaseLifecycleV2({ source, now: clock(0) });
  for (const [index, stage] of RELEASE_STAGE_SEQUENCE_V2.slice(1, 6).entries()) {
    record = advanceReleaseStageV2(record, stage, { proof: stage }, clock(index + 1));
  }
  const bound = bindAppleArtifactV2(record, artifact, clock(7));
  const repeated = bindAppleArtifactV2(bound, artifact, clock(8));
  assert.deepEqual(repeated.candidate.appleArtifact, bound.candidate.appleArtifact);
  const alteredBinding = structuredClone(bound);
  alteredBinding.candidate.appleArtifact.sha256 = 'c'.repeat(64);
  assert.throws(() => assertReleaseLifecycleV2(alteredBinding), /binding digest/u);
  assert.throws(
    () => bindAppleArtifactV2(bound, { ...artifact, sha256: 'b'.repeat(64) }, clock(8)),
    /candidate version is already bound/u,
  );
});

test('schema dispatch reads legacy v1 through an explicit validator but forbids mutation', () => {
  const legacy = { schemaVersion: 1, releaseId: 'gatereeve-v0.1.0-rc.2' };
  let inspected = false;
  const dispatched = dispatchReleaseRecordSchema(legacy, {
    assertLegacy(value) {
      inspected = value === legacy;
      return value;
    },
  });
  assert.equal(inspected, true);
  assert.equal(dispatched.mode, 'read-only-v1');
  assert.throws(() => assertMutableReleaseRecord(legacy), /schema-v1 records are read-only/u);
  assert.throws(
    () => dispatchReleaseRecordSchema({ schemaVersion: 3 }),
    /unsupported release record schema/iu,
  );
});

test('the published RC.2 schema-v1 fixture dispatches read-only without changing bytes', async () => {
  const fixture = fileURLToPath(new URL(
    '../../docs/issues/tb-gatereeve-desktop-dogfood-fixes/evidence/v0.1.0-rc.2/release-record.json',
    import.meta.url,
  ));
  const before = await readFile(fixture);
  const beforeSha256 = createHash('sha256').update(before).digest('hex');
  const inspected = await readVersionedCoordinatedRelease(fixture);
  assert.equal(inspected.mode, 'read-only-v1');
  assert.equal(inspected.record.state, 'published');
  assert.equal(assertCoordinatedReleaseV1(inspected.record), inspected.record);
  assert.throws(() => assertMutableReleaseRecord(inspected.record), /read-only/u);
  const after = await readFile(fixture);
  assert.equal(createHash('sha256').update(after).digest('hex'), beforeSha256);
  assert.deepEqual(after, before);
});
