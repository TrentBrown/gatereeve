import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NOTARIZATION_POLL_INTERVAL_SECONDS,
  NOTARIZATION_POLLS_PER_SESSION,
  assertNotarizationAttempt,
  beginNotarizationPolling,
  beginNotarizationSubmission,
  createNotarizationAttempt,
  markNotarizationSubmissionUncertain,
  reconcileNotarizationSubmission,
  recordNotarizationPoll,
  recordNotarizationSubmission,
  supersedeNotarizationAttempt,
} from '../scripts/notarization-attempt.mjs';

const candidate = Object.freeze({
  sourceTag: 'v0.1.0-rc.9',
  sourceCommit: '1234567890abcdef1234567890abcdef12345678',
  version: '0.1.0-rc.9',
  artifact: {
    filename: 'GateReeve-0.1.0-rc.9-macos-universal.dmg',
    bytes: 12345,
    sha256: 'a'.repeat(64),
  },
});
const requestId = 'abcdef12-1234-1234-1234-1234567890ab';

function at(second) {
  return () => new Date(`2026-08-30T18:00:${String(second).padStart(2, '0')}.000Z`);
}

test('attempt records request identity before bounded polling and acceptance', () => {
  let attempt = createNotarizationAttempt({
    attemptId: '12345678-1234-1234-1234-1234567890ab',
    ...candidate,
    now: at(0),
  });
  assert.equal(attempt.state, 'prepared');
  assert.equal(attempt.requestId, null);
  assert.equal(attempt.history[0].state, 'prepared');
  assert.equal(NOTARIZATION_POLL_INTERVAL_SECONDS, 30);
  assert.equal(NOTARIZATION_POLLS_PER_SESSION, 60);

  attempt = beginNotarizationSubmission(attempt, { now: at(1) });
  assert.equal(attempt.state, 'submitting');
  attempt = recordNotarizationSubmission(attempt, { requestId, now: at(1) });
  assert.equal(attempt.requestId, requestId);
  attempt = beginNotarizationPolling(attempt, {
    sessionId: '11111111-1111-1111-1111-111111111111',
    now: at(2),
  });
  attempt = recordNotarizationPoll(attempt, {
    sessionId: '11111111-1111-1111-1111-111111111111',
    status: 'Accepted',
    now: at(3),
  });
  assert.equal(attempt.state, 'accepted');
  assert.equal(attempt.requestId, requestId);
  assert.equal(assertNotarizationAttempt(attempt), attempt);
});

test('each polling session times out after exactly 60 polls and recovery reuses the request', () => {
  let attempt = createNotarizationAttempt({
    attemptId: '12345678-1234-1234-1234-1234567890ab',
    ...candidate,
    now: at(0),
  });
  attempt = beginNotarizationSubmission(attempt, { now: at(1) });
  attempt = recordNotarizationSubmission(attempt, { requestId, now: at(1) });
  attempt = beginNotarizationPolling(attempt, {
    sessionId: '11111111-1111-1111-1111-111111111111',
    now: at(2),
  });
  for (let poll = 1; poll <= NOTARIZATION_POLLS_PER_SESSION; poll += 1) {
    attempt = recordNotarizationPoll(attempt, {
      sessionId: '11111111-1111-1111-1111-111111111111',
      status: 'In Progress',
      now: () => new Date(1_777_000_000_000 + poll * 30_000),
    });
  }
  assert.equal(attempt.state, 'timed-out');
  assert.equal(attempt.pollingSessions[0].polls, 60);
  assert.equal(attempt.pollingSessions[0].state, 'timed-out');
  const alteredCounter = structuredClone(attempt);
  alteredCounter.pollingSessions[0].polls = 1;
  assert.throws(
    () => assertNotarizationAttempt(alteredCounter),
    /does not match attempt history/u,
  );
  assert.throws(
    () => recordNotarizationSubmission(attempt, { requestId, now: at(4) }),
    /already has an Apple request/u,
  );

  attempt = beginNotarizationPolling(attempt, {
    sessionId: '22222222-2222-2222-2222-222222222222',
    now: at(5),
  });
  attempt = recordNotarizationPoll(attempt, {
    sessionId: '22222222-2222-2222-2222-222222222222',
    status: 'Accepted',
    now: at(6),
  });
  assert.equal(attempt.state, 'accepted');
  assert.equal(attempt.requestId, requestId);
  assert.equal(attempt.pollingSessions.length, 2);
});

test('uncertain submission fails closed until Apple history proves found or absent', () => {
  const prepared = createNotarizationAttempt({
    attemptId: '12345678-1234-1234-1234-1234567890ab',
    ...candidate,
    now: at(0),
  });
  const submitting = beginNotarizationSubmission(prepared, { now: at(1) });
  const uncertain = markNotarizationSubmissionUncertain(submitting, {
    reason: 'runner ended before notarytool output was retained',
    now: at(1),
  });
  assert.equal(uncertain.state, 'submission-uncertain');
  assert.throws(
    () => recordNotarizationSubmission(uncertain, { requestId, now: at(2) }),
    /must be reconciled/u,
  );

  const absent = reconcileNotarizationSubmission(uncertain, {
    matches: [],
    evidenceSha256: 'b'.repeat(64),
    now: at(3),
  });
  assert.equal(absent.state, 'prepared');
  assert.equal(absent.reconciliation.result, 'absent');
  assert.doesNotThrow(() => beginNotarizationSubmission(absent, { now: at(4) }));

  const interrupted = reconcileNotarizationSubmission(submitting, {
    matches: [{ requestId, status: 'In Progress' }],
    evidenceSha256: 'e'.repeat(64),
    now: at(3),
  });
  assert.equal(interrupted.state, 'submitted');
  assert.equal(interrupted.requestId, requestId);

  const found = reconcileNotarizationSubmission(uncertain, {
    matches: [{ requestId, status: 'In Progress' }],
    evidenceSha256: 'c'.repeat(64),
    now: at(3),
  });
  assert.equal(found.state, 'submitted');
  assert.equal(found.requestId, requestId);
  assert.throws(
    () => reconcileNotarizationSubmission(uncertain, {
      matches: [
        { requestId, status: 'In Progress' },
        { requestId: 'ffffffff-1234-1234-1234-1234567890ab', status: 'Accepted' },
      ],
      evidenceSha256: 'd'.repeat(64),
      now: at(3),
    }),
    /exactly zero or one matching request/u,
  );
});

test('attempt validation rejects candidate identity drift and Apple rejection is terminal', () => {
  let attempt = createNotarizationAttempt({
    attemptId: '12345678-1234-1234-1234-1234567890ab',
    ...candidate,
    now: at(0),
  });
  const altered = structuredClone(attempt);
  altered.candidate.artifact.sha256 = 'f'.repeat(64);
  assert.throws(() => assertNotarizationAttempt(altered), /candidate identity digest/u);

  attempt = beginNotarizationSubmission(attempt, { now: at(1) });
  attempt = recordNotarizationSubmission(attempt, { requestId, now: at(1) });
  attempt = beginNotarizationPolling(attempt, {
    sessionId: '11111111-1111-1111-1111-111111111111',
    now: at(2),
  });
  attempt = recordNotarizationPoll(attempt, {
    sessionId: '11111111-1111-1111-1111-111111111111',
    status: 'Invalid',
    diagnostic: 'The binary is not signed.',
    now: at(3),
  });
  assert.equal(attempt.state, 'rejected');
  assert.throws(
    () => beginNotarizationPolling(attempt, {
      sessionId: '22222222-2222-2222-2222-222222222222',
      now: at(4),
    }),
    /cannot poll a rejected attempt/iu,
  );
});

test('supersession preserves the old attempt and requires a fresh candidate version', () => {
  let attempt = createNotarizationAttempt({
    attemptId: '12345678-1234-1234-1234-1234567890ab',
    ...candidate,
    now: at(0),
  });
  attempt = beginNotarizationSubmission(attempt, { now: at(1) });
  attempt = recordNotarizationSubmission(attempt, { requestId, now: at(2) });
  attempt = beginNotarizationPolling(attempt, {
    sessionId: '11111111-1111-1111-1111-111111111111',
    now: at(3),
  });
  assert.throws(
    () => supersedeNotarizationAttempt(attempt, {
      replacementAttemptId: '22222222-2222-2222-2222-222222222222',
      replacement: {
        sourceTag: candidate.sourceTag,
        sourceCommit: candidate.sourceCommit,
        version: candidate.version,
      },
      reason: 'changed bytes require a fresh RC',
      now: at(4),
    }),
    /fresh version identity/u,
  );
  const superseded = supersedeNotarizationAttempt(attempt, {
    replacementAttemptId: '22222222-2222-2222-2222-222222222222',
    replacement: {
      sourceTag: 'v0.1.0-rc.10',
      sourceCommit: candidate.sourceCommit,
      version: '0.1.0-rc.10',
    },
    reason: 'changed bytes require a fresh RC',
    now: at(4),
  });
  assert.equal(superseded.state, 'superseded');
  assert.equal(superseded.requestId, requestId);
  assert.equal(superseded.pollingSessions[0].state, 'superseded');
  assert.equal(superseded.supersession.version, '0.1.0-rc.10');
  assert.equal(assertNotarizationAttempt(superseded), superseded);
});
