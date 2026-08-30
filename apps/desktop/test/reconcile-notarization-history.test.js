import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginNotarizationSubmission,
  createNotarizationAttempt,
  markNotarizationSubmissionUncertain,
} from '../scripts/notarization-attempt.mjs';
import { reconcileFromAppleHistory } from '../scripts/reconcile-notarization-history.mjs';

const dates = [
  '2026-08-30T20:00:00.000Z',
  '2026-08-30T20:01:00.000Z',
  '2026-08-30T20:02:00.000Z',
  '2026-08-30T20:03:00.000Z',
];
const clock = (index) => () => new Date(dates[index]);

function uncertainAttempt() {
  let attempt = createNotarizationAttempt({
    attemptId: '11111111-1111-1111-1111-111111111111',
    sourceTag: 'v0.1.0-rc.9',
    sourceCommit: '1234567890abcdef1234567890abcdef12345678',
    version: '0.1.0-rc.9',
    artifact: {
      filename: 'GateReeve-0.1.0-rc.9-macos-universal.dmg',
      bytes: 12345,
      sha256: 'a'.repeat(64),
    },
    now: clock(0),
  });
  attempt = beginNotarizationSubmission(attempt, { now: clock(1) });
  return markNotarizationSubmissionUncertain(attempt, {
    reason: 'runner interrupted after upload',
    now: clock(2),
  });
}

function history(entries) {
  return Buffer.from(`${JSON.stringify({ history: entries })}\n`);
}

test('Apple history reconciliation recovers exactly one request without resubmission', () => {
  const reconciled = reconcileFromAppleHistory({
    attempt: uncertainAttempt(),
    historyBytes: history([{
      id: '22222222-2222-2222-2222-222222222222',
      name: 'GateReeve-0.1.0-rc.9-macos-universal.dmg',
      createdDate: '2026-08-30T20:01:30.000Z',
      status: 'In Progress',
    }]),
    now: clock(3),
  });
  assert.equal(reconciled.state, 'submitted');
  assert.equal(reconciled.requestId, '22222222-2222-2222-2222-222222222222');
  assert.equal(reconciled.reconciliation.result, 'found');
});
test('Apple history ambiguity and absence fail closed', () => {
  const attempt = uncertainAttempt();
  assert.throws(
    () => reconcileFromAppleHistory({ attempt, historyBytes: history([]) }),
    /0 candidate matches; no resubmission/u,
  );
  const entry = {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'GateReeve-0.1.0-rc.9-macos-universal.dmg',
    createdDate: '2026-08-30T20:01:30.000Z',
    status: 'Accepted',
  };
  assert.throws(
    () => reconcileFromAppleHistory({ attempt, historyBytes: history([
      entry,
      { ...entry, id: '33333333-3333-3333-3333-333333333333' },
    ]) }),
    /2 candidate matches; no resubmission/u,
  );
});
