// @ts-check

import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as sleepFor } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import {
  APPLE_TRUST_STATUS,
  assertAppleSigningConfiguration,
  assertAppleTrustEvidence,
  parseCodesignFacts,
} from './apple-trust-contract.mjs';
import {
  NOTARIZATION_POLL_INTERVAL_SECONDS,
  assertNotarizationAttempt,
  beginNotarizationPolling,
  beginNotarizationSubmission,
  createNotarizationAttempt,
  markNotarizationSubmissionUncertain,
  recordNotarizationPoll,
  recordNotarizationSubmission,
} from './notarization-attempt.mjs';

const execFileAsync = promisify(execFile);

/** @param {string} name */
function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** @param {string} path */
async function fileIdentity(path) {
  const content = await readFile(path);
  return {
    filename: basename(path),
    bytes: (await stat(path)).size,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

/** @param {string} executable @param {string[]} arguments_ */
async function defaultRun(executable, arguments_) {
  return execFileAsync(executable, arguments_, { maxBuffer: 8 * 1024 * 1024 });
}

/** @param {string} path @param {unknown} value */
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

/** @param {string} path */
async function readAttempt(path) {
  try {
    return assertNotarizationAttempt(JSON.parse(await readFile(resolve(path), 'utf8')));
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return null;
    throw error;
  }
}

/** @param {unknown} value @param {string} label */
function parseJsonObject(value, label) {
  try {
    const parsed = JSON.parse(typeof value === 'string' ? value : '');
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${label} did not return a JSON object`);
  }
}

/** @param {ReturnType<typeof assertNotarizationAttempt>} attempt @param {object} identity */
function assertCandidateIdentity(attempt, identity) {
  const candidate = attempt.candidate;
  if (
    candidate.sourceTag !== identity.sourceTag
    || candidate.sourceCommit !== identity.sourceCommit
    || candidate.version !== identity.version
    || candidate.artifact.filename !== identity.artifact.filename
    || candidate.artifact.bytes !== identity.artifact.bytes
    || candidate.artifact.sha256 !== identity.artifact.sha256
  ) {
    throw new Error('Notarization attempt is bound to a different source or exact disk image');
  }
}

/** @param {number} milliseconds */
async function defaultSleep(milliseconds) {
  await sleepFor(milliseconds);
}

/**
 * @param {{applicationPath: string, dmgPath: string, evidencePath: string, sourceTag: string,
 *   sourceCommit: string, version: string, identity: string, teamId: string,
 *   notaryKeyPath: string, notaryKeyId: string, notaryIssuerId: string,
 *   attemptPath?: string, attemptId?: string, pollingSessionId?: string,
 *   sleep?: (milliseconds: number) => Promise<void>, now?: () => Date,
 *   run?: (executable: string, arguments_: string[]) => Promise<{stdout?: string, stderr?: string}>}}
 *   options
 */
export async function notarizeMacos(options) {
  const configuration = assertAppleSigningConfiguration({
    identity: options.identity,
    teamId: options.teamId,
    keyId: options.notaryKeyId,
    issuerId: options.notaryIssuerId,
  });
  const dmgPath = resolve(options.dmgPath);
  const applicationPath = resolve(options.applicationPath);
  const run = options.run ?? defaultRun;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? (() => new Date());
  const attemptPath = resolve(
    options.attemptPath ?? join(dirname(resolve(options.evidencePath)), 'notarization-attempt.json'),
  );
  await run('/usr/bin/codesign', [
    '--verify',
    '--deep',
    '--strict',
    '--verbose=4',
    applicationPath,
  ]);
  const signature = await run('/usr/bin/codesign', [
    '--display',
    '--verbose=4',
    applicationPath,
  ]);
  const signatureFacts = parseCodesignFacts(`${signature.stdout ?? ''}${signature.stderr ?? ''}`);
  if (
    signatureFacts.identity !== configuration.identity
    || signatureFacts.teamId !== configuration.teamId
  ) {
    throw new Error('Signed application identity does not match the protected configuration');
  }
  await run('/usr/bin/codesign', ['--verify', '--strict', '--verbose=4', dmgPath]);
  const diskImageSignature = await run('/usr/bin/codesign', [
    '--display',
    '--verbose=4',
    dmgPath,
  ]);
  const diskImageFacts = parseCodesignFacts(
    `${diskImageSignature.stdout ?? ''}${diskImageSignature.stderr ?? ''}`,
    { requireRuntime: false },
  );
  if (
    diskImageFacts.identity !== configuration.identity
    || diskImageFacts.teamId !== configuration.teamId
    || diskImageFacts.secureTimestamp !== true
  ) {
    throw new Error('Signed disk image identity does not match the protected configuration');
  }
  const artifact = await fileIdentity(dmgPath);
  const candidateIdentity = {
    sourceTag: options.sourceTag,
    sourceCommit: options.sourceCommit,
    version: options.version,
    artifact,
  };
  let attempt = await readAttempt(attemptPath);
  if (attempt === null) {
    attempt = createNotarizationAttempt({
      attemptId: options.attemptId ?? randomUUID(),
      ...candidateIdentity,
      now,
    });
    await writeJsonAtomically(attemptPath, attempt);
  } else {
    assertCandidateIdentity(attempt, candidateIdentity);
  }
  if (attempt.state === 'submitting' || attempt.state === 'submission-uncertain') {
    throw new Error('Notarization submission outcome is uncertain; reconcile Apple history before retrying');
  }
  if (attempt.state === 'rejected') {
    throw new Error(`Apple notarization rejected request ${attempt.requestId}`);
  }
  if (attempt.state === 'prepared') {
    attempt = beginNotarizationSubmission(attempt, { now });
    await writeJsonAtomically(attemptPath, attempt);
    let requestId;
    try {
      const submission = await run('/usr/bin/xcrun', [
        'notarytool',
        'submit',
        dmgPath,
        '--key',
        resolve(options.notaryKeyPath),
        '--key-id',
        configuration.keyId,
        '--issuer',
        configuration.issuerId,
        '--output-format',
        'json',
      ]);
      const result = parseJsonObject(submission.stdout, 'Apple notarization submission');
      if (typeof result.id !== 'string') {
        throw new Error('Apple notarization submission did not return a request ID');
      }
      requestId = result.id;
    } catch (error) {
      attempt = markNotarizationSubmissionUncertain(attempt, {
        reason: error instanceof Error ? error.message : String(error),
        now,
      });
      await writeJsonAtomically(attemptPath, attempt);
      throw new Error('Apple notarization submission outcome is uncertain; reconcile Apple history before retrying', {
        cause: error,
      });
    }
    attempt = recordNotarizationSubmission(attempt, { requestId, now });
    await writeJsonAtomically(attemptPath, attempt);
  }
  if (attempt.state === 'submitted' || attempt.state === 'timed-out') {
    const sessionId = options.pollingSessionId ?? randomUUID();
    attempt = beginNotarizationPolling(attempt, { sessionId, now });
    await writeJsonAtomically(attemptPath, attempt);
  }
  if (attempt.state === 'polling') {
    const session = attempt.pollingSessions.find((value) => value.state === 'active');
    if (session === undefined) throw new Error('Notarization attempt has no active polling session');
    while (attempt.state === 'polling') {
      const response = await run('/usr/bin/xcrun', [
        'notarytool',
        'info',
        attempt.requestId,
        '--key',
        resolve(options.notaryKeyPath),
        '--key-id',
        configuration.keyId,
        '--issuer',
        configuration.issuerId,
        '--output-format',
        'json',
      ]);
      const result = parseJsonObject(response.stdout, 'Apple notarization status');
      if (result.id !== attempt.requestId) {
        throw new Error('Apple notarization status did not identify the recorded request ID');
      }
      attempt = recordNotarizationPoll(attempt, {
        sessionId: session.sessionId,
        status: result.status,
        diagnostic: typeof result.message === 'string' ? result.message : null,
        now,
      });
      await writeJsonAtomically(attemptPath, attempt);
      if (attempt.state === 'polling') {
        await sleep(NOTARIZATION_POLL_INTERVAL_SECONDS * 1000);
      }
    }
  }
  if (attempt.state === 'timed-out') {
    throw new Error(`Apple notarization polling session timed out for request ${attempt.requestId}`);
  }
  if (attempt.state === 'rejected') {
    throw new Error(`Apple notarization rejected request ${attempt.requestId}`);
  }
  if (attempt.state !== 'accepted' || attempt.requestId === null) {
    throw new Error(`Apple notarization attempt cannot establish trust from state ${attempt.state}`);
  }
  await run('/usr/bin/xcrun', ['stapler', 'staple', '-v', dmgPath]);
  await run('/usr/bin/xcrun', ['stapler', 'validate', '-v', dmgPath]);
  await run('/usr/sbin/spctl', [
    '--assess',
    '--type',
    'open',
    '--context',
    'context:primary-signature',
    '--verbose=4',
    dmgPath,
  ]);
  const evidence = {
    schemaVersion: 1,
    kind: 'gatereeve-apple-trust',
    status: APPLE_TRUST_STATUS,
    sourceTag: options.sourceTag,
    sourceCommit: options.sourceCommit,
    version: options.version,
    artifact,
    signature: signatureFacts,
    notarization: { id: attempt.requestId, status: 'Accepted' },
    staple: { validated: true },
    gatekeeper: { diskImage: 'accepted' },
    verifiedAt: now().toISOString(),
  };
  assertAppleTrustEvidence(evidence);
  await writeJsonAtomically(resolve(options.evidencePath), evidence);
  return evidence;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const options = {
    applicationPath: argument('--application'),
    dmgPath: argument('--dmg'),
    evidencePath: argument('--evidence'),
    attemptPath: argument('--attempt'),
    attemptId: argument('--attempt-id'),
    pollingSessionId: argument('--polling-session-id'),
    sourceTag: argument('--source-tag'),
    sourceCommit: argument('--source-commit'),
    version: argument('--version'),
    identity: argument('--identity'),
    teamId: argument('--team-id'),
    notaryKeyPath: argument('--notary-key'),
    notaryKeyId: argument('--notary-key-id'),
    notaryIssuerId: argument('--notary-issuer-id'),
  };
  const required = [
    options.applicationPath,
    options.dmgPath,
    options.evidencePath,
    options.sourceTag,
    options.sourceCommit,
    options.version,
    options.identity,
    options.teamId,
    options.notaryKeyPath,
    options.notaryKeyId,
    options.notaryIssuerId,
  ];
  if (required.some((value) => !value)) {
    throw new Error('Notarization requires the DMG, evidence path, source identity, Developer ID identity, team ID, and team API key configuration');
  }
  process.stdout.write(`${JSON.stringify(await notarizeMacos(/** @type {any} */ (options)), null, 2)}\n`);
}
