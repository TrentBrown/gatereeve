// @ts-check

import { createHash } from 'node:crypto';

export const NOTARIZATION_POLL_INTERVAL_SECONDS = 30;
export const NOTARIZATION_POLLS_PER_SESSION = 60;

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const COMMIT = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const STATES = new Set([
  'prepared',
  'submitting',
  'submission-uncertain',
  'submitted',
  'polling',
  'timed-out',
  'accepted',
  'rejected',
  'superseded',
]);
const ALLOWED_TRANSITIONS = Object.freeze({
  prepared: new Set(['submitting', 'superseded']),
  submitting: new Set(['submission-uncertain', 'prepared', 'submitted', 'accepted', 'rejected', 'superseded']),
  'submission-uncertain': new Set(['prepared', 'submitted', 'accepted', 'rejected', 'superseded']),
  submitted: new Set(['polling', 'superseded']),
  polling: new Set(['polling', 'timed-out', 'accepted', 'rejected', 'superseded']),
  'timed-out': new Set(['polling', 'superseded']),
  accepted: new Set(['superseded']),
  rejected: new Set(['superseded']),
  superseded: new Set(),
});

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireTimestamp(value, label) {
  requireString(value, label);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
  return value;
}

function candidateIdentity(candidate) {
  return {
    sourceTag: candidate.sourceTag,
    sourceCommit: candidate.sourceCommit,
    version: candidate.version,
    artifact: candidate.artifact,
  };
}

function assertCandidate(candidate) {
  if (
    typeof candidate?.sourceTag !== 'string'
    || candidate.sourceTag === ''
    || !COMMIT.test(candidate.sourceCommit ?? '')
    || typeof candidate.version !== 'string'
    || !VERSION.test(candidate.version)
    || candidate.sourceTag !== `v${candidate.version}`
    || typeof candidate.artifact?.filename !== 'string'
    || candidate.artifact.filename === ''
    || candidate.artifact.filename.includes('/')
    || candidate.artifact.filename.includes('\\')
    || !Number.isSafeInteger(candidate.artifact.bytes)
    || candidate.artifact.bytes < 1
    || !SHA256.test(candidate.artifact.sha256 ?? '')
    || candidate.identitySha256 !== digest(candidateIdentity(candidate))
  ) {
    throw new Error('Notarization candidate identity digest is invalid');
  }
  return candidate;
}

function eventDigest(attempt, event) {
  return digest({
    attemptId: attempt.attemptId,
    candidateSha256: attempt.candidate.identitySha256,
    sequence: event.sequence,
    state: event.state,
    recordedAt: event.recordedAt,
    detail: event.detail,
    previousEventSha256: event.previousEventSha256,
  });
}

function appendEvent(attempt, state, detail, now) {
  const event = {
    sequence: attempt.history.length + 1,
    state,
    recordedAt: now().toISOString(),
    detail: structuredClone(detail),
    previousEventSha256: attempt.history.at(-1)?.eventSha256 ?? null,
  };
  event.eventSha256 = eventDigest(attempt, event);
  attempt.history.push(event);
  attempt.state = state;
  attempt.updatedAt = event.recordedAt;
  return attempt;
}

function transitioned(original, mutate, state, detail, now) {
  assertNotarizationAttempt(original);
  const next = structuredClone(original);
  mutate(next);
  appendEvent(next, state, detail, now);
  return assertNotarizationAttempt(next);
}

export function createNotarizationAttempt({
  attemptId,
  sourceTag,
  sourceCommit,
  version,
  artifact,
  now = () => new Date(),
}) {
  if (!UUID.test(attemptId ?? '')) throw new Error('Notarization attempt ID must be a UUID');
  const createdAtDate = now();
  const createdAt = createdAtDate.toISOString();
  const candidate = {
    sourceTag,
    sourceCommit,
    version,
    artifact: structuredClone(artifact),
  };
  candidate.identitySha256 = digest(candidateIdentity(candidate));
  assertCandidate(candidate);
  const attempt = {
    schemaVersion: 1,
    kind: 'gatereeve-notarization-attempt',
    attemptId,
    candidate,
    state: 'prepared',
    requestId: null,
    reconciliation: null,
    supersession: null,
    pollingPolicy: {
      intervalSeconds: NOTARIZATION_POLL_INTERVAL_SECONDS,
      pollsPerSession: NOTARIZATION_POLLS_PER_SESSION,
    },
    pollingSessions: [],
    history: [],
    createdAt,
    updatedAt: createdAt,
  };
  appendEvent(
    attempt,
    'prepared',
    { candidateSha256: candidate.identitySha256 },
    () => createdAtDate,
  );
  attempt.createdAt = createdAt;
  return assertNotarizationAttempt(attempt);
}

export function assertNotarizationAttempt(value) {
  if (
    value?.schemaVersion !== 1
    || value.kind !== 'gatereeve-notarization-attempt'
    || !UUID.test(value.attemptId ?? '')
    || !STATES.has(value.state)
    || value?.pollingPolicy?.intervalSeconds !== NOTARIZATION_POLL_INTERVAL_SECONDS
    || value.pollingPolicy.pollsPerSession !== NOTARIZATION_POLLS_PER_SESSION
  ) {
    throw new Error('Notarization attempt record is invalid');
  }
  assertCandidate(value.candidate);
  requireTimestamp(value.createdAt, 'Notarization attempt creation time');
  requireTimestamp(value.updatedAt, 'Notarization attempt update time');
  const requestStates = new Set(['submitted', 'polling', 'timed-out', 'accepted', 'rejected']);
  const hasRequestId = UUID.test(value.requestId ?? '');
  if (
    (requestStates.has(value.state) && !hasRequestId)
    || (!requestStates.has(value.state) && value.state !== 'superseded' && value.requestId !== null)
    || (value.state === 'superseded' && value.requestId !== null && !hasRequestId)
  ) {
    throw new Error('Notarization attempt request identity is inconsistent');
  }
  if (value.reconciliation !== null) {
    if (
      !['absent', 'found'].includes(value.reconciliation?.result)
      || !SHA256.test(value.reconciliation.evidenceSha256 ?? '')
    ) {
      throw new Error('Notarization reconciliation evidence is invalid');
    }
    requireTimestamp(value.reconciliation.reconciledAt, 'Notarization reconciliation time');
  }
  if (value.state === 'superseded') {
    if (
      !UUID.test(value?.supersession?.attemptId ?? '')
      || typeof value.supersession.sourceTag !== 'string'
      || value.supersession.sourceTag === ''
      || !COMMIT.test(value.supersession.sourceCommit ?? '')
      || typeof value.supersession.version !== 'string'
      || value.supersession.version === ''
      || typeof value.supersession.reason !== 'string'
      || value.supersession.reason === ''
      || (
        value.supersession.sourceTag === value.candidate.sourceTag
        && value.supersession.version === value.candidate.version
      )
    ) {
      throw new Error('Notarization attempt supersession is invalid');
    }
    requireTimestamp(value.supersession.supersededAt, 'Notarization supersession time');
  } else if (value.supersession !== null) {
    throw new Error('Active notarization attempt must not contain supersession evidence');
  }
  if (!Array.isArray(value.pollingSessions)) {
    throw new Error('Notarization polling sessions are invalid');
  }
  const sessionIds = new Set();
  let activeSessions = 0;
  for (const session of value.pollingSessions) {
    if (
      !UUID.test(session?.sessionId ?? '')
      || sessionIds.has(session.sessionId)
      || session.requestId !== value.requestId
      || !['active', 'timed-out', 'accepted', 'rejected', 'superseded'].includes(session.state)
      || !Number.isSafeInteger(session.polls)
      || session.polls < 0
      || session.polls > NOTARIZATION_POLLS_PER_SESSION
    ) {
      throw new Error('Notarization polling session is invalid');
    }
    sessionIds.add(session.sessionId);
    requireTimestamp(session.startedAt, 'Notarization polling start time');
    if (session.state === 'active') {
      activeSessions += 1;
      if (session.endedAt !== null) throw new Error('Active polling session has an end time');
    } else {
      requireTimestamp(session.endedAt, 'Notarization polling end time');
    }
  }
  if ((value.state === 'polling' ? 1 : 0) !== activeSessions) {
    throw new Error('Notarization polling activity is inconsistent');
  }
  if (!Array.isArray(value.history) || value.history.length < 1) {
    throw new Error('Notarization attempt history is missing');
  }
  let previousEventSha256 = null;
  value.history.forEach((event, index) => {
    if (
      event?.sequence !== index + 1
      || !STATES.has(event.state)
      || event.previousEventSha256 !== previousEventSha256
      || event.detail === null
      || typeof event.detail !== 'object'
      || Array.isArray(event.detail)
    ) {
      throw new Error('Notarization attempt history is invalid');
    }
    requireTimestamp(event.recordedAt, 'Notarization attempt event time');
    if (event.eventSha256 !== eventDigest(value, event)) {
      throw new Error('Notarization attempt history digest is invalid');
    }
    if (
      (index === 0 && event.state !== 'prepared')
      || (index > 0 && !ALLOWED_TRANSITIONS[value.history[index - 1].state].has(event.state))
    ) {
      throw new Error('Notarization attempt history transition is invalid');
    }
    previousEventSha256 = event.eventSha256;
  });
  if (
    value.history[0].recordedAt !== value.createdAt
    || value.history[0].detail.candidateSha256 !== value.candidate.identitySha256
  ) {
    throw new Error('Notarization attempt creation does not match history');
  }
  if (value.history.at(-1).state !== value.state) {
    throw new Error('Notarization attempt state does not match history');
  }
  if (value.history.at(-1).recordedAt !== value.updatedAt) {
    throw new Error('Notarization attempt update time does not match history');
  }
  const requestEvents = value.history.filter((event) => UUID.test(event.detail.requestId ?? ''));
  if (
    (hasRequestId && requestEvents.length < 1)
    || requestEvents.some((event) => event.detail.requestId !== value.requestId)
  ) {
    throw new Error('Notarization Apple request does not match attempt history');
  }
  const reconciliationEvents = value.history.filter(
    (event) => ['absent', 'found'].includes(event.detail.reconciliation),
  );
  if (value.reconciliation === null) {
    if (reconciliationEvents.length !== 0) {
      throw new Error('Notarization reconciliation summary does not match history');
    }
  } else {
    const event = reconciliationEvents.at(-1);
    if (
      event === undefined
      || event.detail.reconciliation !== value.reconciliation.result
      || event.detail.evidenceSha256 !== value.reconciliation.evidenceSha256
      || event.recordedAt !== value.reconciliation.reconciledAt
    ) {
      throw new Error('Notarization reconciliation summary does not match history');
    }
  }
  if (value.state === 'superseded') {
    const event = value.history.at(-1);
    if (
      event.detail.replacementAttemptId !== value.supersession.attemptId
      || event.detail.replacement?.sourceTag !== value.supersession.sourceTag
      || event.detail.replacement?.sourceCommit !== value.supersession.sourceCommit
      || event.detail.replacement?.version !== value.supersession.version
      || event.detail.reason !== value.supersession.reason
      || event.recordedAt !== value.supersession.supersededAt
    ) {
      throw new Error('Notarization supersession summary does not match history');
    }
  }
  for (const session of value.pollingSessions) {
    const starts = value.history.filter((event) => (
      event.state === 'polling'
      && event.detail.sessionId === session.sessionId
      && event.detail.requestId === session.requestId
      && event.detail.poll === undefined
    ));
    const polls = value.history.filter((event) => (
      event.detail.sessionId === session.sessionId
      && Number.isSafeInteger(event.detail.poll)
    ));
    if (
      starts.length !== 1
      || starts[0].recordedAt !== session.startedAt
      || polls.length !== session.polls
      || polls.some((event, index) => event.detail.poll !== index + 1)
    ) {
      throw new Error('Notarization polling session does not match attempt history');
    }
    if (session.state === 'active') {
      if (polls.length > 0 && polls.at(-1).state !== 'polling') {
        throw new Error('Active notarization polling session has terminal history');
      }
    } else if (session.state === 'superseded') {
      if (value.state !== 'superseded' || session.endedAt !== value.updatedAt) {
        throw new Error('Superseded polling session does not match attempt history');
      }
    } else if (polls.length < 1
      || polls.at(-1).state !== session.state
      || polls.at(-1).recordedAt !== session.endedAt) {
      throw new Error('Terminal notarization polling session does not match attempt history');
    }
  }
  return value;
}

export function recordNotarizationSubmission(attempt, { requestId, now = () => new Date() }) {
  assertNotarizationAttempt(attempt);
  if (attempt.requestId !== null) throw new Error('Notarization attempt already has an Apple request');
  if (attempt.state === 'submission-uncertain') {
    throw new Error('Uncertain notarization submission must be reconciled before continuing');
  }
  if (attempt.state !== 'submitting') {
    throw new Error(`Cannot record notarization submission from ${attempt.state}`);
  }
  if (!UUID.test(requestId ?? '')) throw new Error('Apple notarization request ID must be a UUID');
  return transitioned(
    attempt,
    (next) => { next.requestId = requestId; },
    'submitted',
    { requestId },
    now,
  );
}

export function beginNotarizationSubmission(attempt, { now = () => new Date() } = {}) {
  assertNotarizationAttempt(attempt);
  if (attempt.state !== 'prepared' || attempt.requestId !== null) {
    throw new Error('Only a prepared notarization attempt can begin submission');
  }
  return transitioned(attempt, () => {}, 'submitting', {}, now);
}

export function markNotarizationSubmissionUncertain(
  attempt,
  { reason, now = () => new Date() },
) {
  assertNotarizationAttempt(attempt);
  if (attempt.state !== 'submitting' || attempt.requestId !== null) {
    throw new Error('Only an in-flight unrecorded submission can become uncertain');
  }
  requireString(reason, 'Submission uncertainty reason');
  return transitioned(attempt, () => {}, 'submission-uncertain', { reason }, now);
}

export function reconcileNotarizationSubmission(
  attempt,
  { matches, evidenceSha256, now = () => new Date() },
) {
  assertNotarizationAttempt(attempt);
  if (!['submitting', 'submission-uncertain'].includes(attempt.state)) {
    throw new Error('Only an uncertain submission can be reconciled');
  }
  if (!Array.isArray(matches) || matches.length > 1) {
    throw new Error('Apple history must contain exactly zero or one matching request');
  }
  if (!SHA256.test(evidenceSha256 ?? '')) {
    throw new Error('Apple history reconciliation requires an evidence digest');
  }
  const reconciledDate = now();
  const reconciledAt = reconciledDate.toISOString();
  if (matches.length === 0) {
    return transitioned(
      attempt,
      (next) => {
        next.reconciliation = { result: 'absent', evidenceSha256, reconciledAt };
      },
      'prepared',
      { reconciliation: 'absent', evidenceSha256 },
      () => reconciledDate,
    );
  }
  const match = matches[0];
  if (!UUID.test(match?.requestId ?? '')) throw new Error('Reconciled Apple request ID is invalid');
  const normalized = normalizeStatus(match.status);
  const nextState = normalized === 'accepted'
    ? 'accepted'
    : normalized === 'rejected'
      ? 'rejected'
      : 'submitted';
  return transitioned(
    attempt,
    (next) => {
      next.requestId = match.requestId;
      next.reconciliation = { result: 'found', evidenceSha256, reconciledAt };
    },
    nextState,
    { reconciliation: 'found', evidenceSha256, requestId: match.requestId, status: match.status },
    () => reconciledDate,
  );
}

export function beginNotarizationPolling(
  attempt,
  { sessionId, now = () => new Date() },
) {
  assertNotarizationAttempt(attempt);
  if (attempt.state === 'rejected') throw new Error('Cannot poll a rejected attempt');
  if (attempt.state === 'accepted') throw new Error('Cannot poll an accepted attempt');
  if (!['submitted', 'timed-out'].includes(attempt.state)) {
    throw new Error(`Cannot begin notarization polling from ${attempt.state}`);
  }
  if (!UUID.test(sessionId ?? '')) throw new Error('Notarization polling session ID must be a UUID');
  if (attempt.pollingSessions.some((session) => session.sessionId === sessionId)) {
    throw new Error('Notarization polling session ID is already recorded');
  }
  const startedDate = now();
  const startedAt = startedDate.toISOString();
  return transitioned(
    attempt,
    (next) => {
      next.pollingSessions.push({
        sessionId,
        requestId: next.requestId,
        state: 'active',
        polls: 0,
        startedAt,
        endedAt: null,
      });
    },
    'polling',
    { sessionId, requestId: attempt.requestId },
    () => startedDate,
  );
}

function normalizeStatus(status) {
  if (status === 'Accepted') return 'accepted';
  if (status === 'Invalid' || status === 'Rejected') return 'rejected';
  if (status === 'In Progress' || status === 'Uploaded' || status === 'Processing') {
    return 'pending';
  }
  throw new Error(`Unsupported Apple notarization status: ${status ?? 'missing'}`);
}

export function recordNotarizationPoll(
  attempt,
  { sessionId, status, diagnostic = null, now = () => new Date() },
) {
  assertNotarizationAttempt(attempt);
  if (attempt.state !== 'polling') throw new Error(`Cannot record a poll from ${attempt.state}`);
  const sessionIndex = attempt.pollingSessions.findIndex(
    (session) => session.sessionId === sessionId,
  );
  if (sessionIndex === -1 || attempt.pollingSessions[sessionIndex].state !== 'active') {
    throw new Error('Notarization poll does not match the active session');
  }
  const normalized = normalizeStatus(status);
  const nextPolls = attempt.pollingSessions[sessionIndex].polls + 1;
  let nextState = 'polling';
  let sessionState = 'active';
  if (normalized === 'accepted') {
    nextState = 'accepted';
    sessionState = 'accepted';
  } else if (normalized === 'rejected') {
    nextState = 'rejected';
    sessionState = 'rejected';
  } else if (nextPolls >= NOTARIZATION_POLLS_PER_SESSION) {
    nextState = 'timed-out';
    sessionState = 'timed-out';
  }
  const recordedDate = now();
  const recordedAt = recordedDate.toISOString();
  return transitioned(
    attempt,
    (next) => {
      const session = next.pollingSessions[sessionIndex];
      session.polls = nextPolls;
      session.state = sessionState;
      if (sessionState !== 'active') session.endedAt = recordedAt;
    },
    nextState,
    {
      sessionId,
      requestId: attempt.requestId,
      poll: nextPolls,
      status,
      diagnostic,
    },
    () => recordedDate,
  );
}

export function supersedeNotarizationAttempt(
  attempt,
  { replacementAttemptId, replacement, reason, now = () => new Date() },
) {
  assertNotarizationAttempt(attempt);
  if (attempt.state === 'superseded') throw new Error('Notarization attempt is already superseded');
  if (!UUID.test(replacementAttemptId ?? '')) {
    throw new Error('Replacement notarization attempt ID must be a UUID');
  }
  if (
    typeof replacement?.sourceTag !== 'string'
    || replacement.sourceTag === ''
    || !COMMIT.test(replacement.sourceCommit ?? '')
    || typeof replacement.version !== 'string'
    || !VERSION.test(replacement.version)
    || replacement.sourceTag !== `v${replacement.version}`
    || (
      replacement.sourceTag === attempt.candidate.sourceTag
      && replacement.version === attempt.candidate.version
    )
  ) {
    throw new Error('Replacement notarization candidate must use a fresh version identity');
  }
  requireString(reason, 'Notarization supersession reason');
  const supersededDate = now();
  const supersededAt = supersededDate.toISOString();
  return transitioned(
    attempt,
    (next) => {
      const active = next.pollingSessions.find((session) => session.state === 'active');
      if (active !== undefined) {
        active.state = 'superseded';
        active.endedAt = supersededAt;
      }
      next.supersession = {
        attemptId: replacementAttemptId,
        sourceTag: replacement.sourceTag,
        sourceCommit: replacement.sourceCommit,
        version: replacement.version,
        reason,
        supersededAt,
      };
    },
    'superseded',
    {
      replacementAttemptId,
      replacement: structuredClone(replacement),
      reason,
    },
    () => supersededDate,
  );
}
