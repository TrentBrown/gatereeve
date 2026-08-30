// @ts-check

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  assertNotarizationAttempt,
  reconcileNotarizationSubmission,
} from './notarization-attempt.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}
async function writeJsonAtomically(path, value) {
  const resolved = resolve(path);
  await mkdir(dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, resolved);
  } finally {
    await rm(temporary, { force: true });
  }
}

/**
 * Reconcile only a uniquely matching Apple history entry. An empty history is
 * deliberately not treated as proof of absence because the service response
 * does not assert exhaustive coverage of the candidate's submission window.
 * @param {{attempt: unknown, historyBytes: Buffer, now?: () => Date}} options
 */
export function reconcileFromAppleHistory({ attempt: input, historyBytes, now = () => new Date() }) {
  const attempt = assertNotarizationAttempt(input);
  if (!['submitting', 'submission-uncertain'].includes(attempt.state)) {
    throw new Error('Apple history reconciliation requires an uncertain submission');
  }
  let history;
  try {
    history = JSON.parse(historyBytes.toString('utf8'));
  } catch {
    throw new Error('Apple notarization history is not valid JSON');
  }
  if (!Array.isArray(history?.history)) {
    throw new Error('Apple notarization history does not contain a history array');
  }
  const submissionStartedAt = Date.parse(
    attempt.history.findLast((entry) => entry.state === 'submitting')?.recordedAt ?? '',
  );
  const matches = history.history.filter((entry) => (
    entry?.name === attempt.candidate.artifact.filename
    && Number.isFinite(Date.parse(entry.createdDate))
    && Date.parse(entry.createdDate) >= submissionStartedAt
  ));
  if (matches.length !== 1) {
    throw new Error(`Apple history reconciliation found ${matches.length} candidate matches; no resubmission is authorized`);
  }
  const match = matches[0];
  return reconcileNotarizationSubmission(attempt, {
    matches: [{ requestId: match.id, status: match.status }],
    evidenceSha256: createHash('sha256').update(historyBytes).digest('hex'),
    now,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const attemptPath = argument('--attempt');
  const historyPath = argument('--history');
  if (!attemptPath || !historyPath) {
    throw new Error('Usage: reconcile-notarization-history --attempt <json> --history <json>');
  }
  const resolvedAttempt = resolve(attemptPath);
  const [attempt, historyBytes] = await Promise.all([
    readFile(resolvedAttempt, 'utf8').then(JSON.parse),
    readFile(resolve(historyPath)),
  ]);
  const reconciled = reconcileFromAppleHistory({ attempt, historyBytes });
  await writeJsonAtomically(resolvedAttempt, reconciled);
  process.stdout.write(`${JSON.stringify(reconciled, null, 2)}\n`);
}
