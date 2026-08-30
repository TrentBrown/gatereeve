import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertAppleSigningConfiguration,
  assertAppleTrustEvidence,
  coordinatedTrustFromEvidence,
  parseCodesignFacts,
} from '../scripts/apple-trust-contract.mjs';
import { assertNotarizationAttempt } from '../scripts/notarization-attempt.mjs';
import { notarizeMacos } from '../scripts/notarize-macos.mjs';

const identity = 'Developer ID Application: Trent Brown (ABCDEFGHIJ)';
const signatureOutput = [
  `Authority=${identity}`,
  'TeamIdentifier=ABCDEFGHIJ',
  'Timestamp=2026-08-27T20:00:00Z',
  'CodeDirectory v=20500 size=123 flags=0x10000(runtime) hashes=1+7 location=embedded',
].join('\n');

test('Apple signing configuration requires a team-scoped Developer ID identity', () => {
  assert.deepEqual(assertAppleSigningConfiguration({
    identity,
    teamId: 'ABCDEFGHIJ',
    keyId: 'KLMNOPQRST',
    issuerId: '12345678-1234-1234-1234-1234567890ab',
  }), {
    identity,
    teamId: 'ABCDEFGHIJ',
    keyId: 'KLMNOPQRST',
    issuerId: '12345678-1234-1234-1234-1234567890ab',
  });
  assert.throws(() => assertAppleSigningConfiguration({
    identity: 'Apple Development: Trent Brown (ABCDEFGHIJ)',
    teamId: 'ABCDEFGHIJ',
    keyId: 'KLMNOPQRST',
    issuerId: '12345678-1234-1234-1234-1234567890ab',
  }), /Developer ID identity/u);
});

test('codesign facts require Developer ID, hardened runtime, and a secure timestamp', () => {
  assert.deepEqual(parseCodesignFacts(signatureOutput), {
    identity,
    teamId: 'ABCDEFGHIJ',
    hardenedRuntime: true,
    secureTimestamp: true,
  });
  assert.throws(() => parseCodesignFacts(signatureOutput.replace('(runtime)', '')), /runtime/u);
  assert.equal(
    parseCodesignFacts(signatureOutput.replace('(runtime)', ''), { requireRuntime: false })
      .hardenedRuntime,
    false,
  );
  assert.throws(() => parseCodesignFacts(signatureOutput.replace(/^Timestamp=.*$/mu, '')), /timestamp/u);
});

test('notarization emits complete non-secret evidence for the exact disk image', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-apple-trust-'));
  const dmgPath = join(root, 'GateReeve-0.1.0-rc.7-macos-universal.dmg');
  const applicationPath = join(root, 'GateReeve.app');
  const evidencePath = join(root, 'apple-trust.json');
  const attemptPath = join(root, 'notarization-attempt.json');
  const keyPath = join(root, 'AuthKey_KLMNOPQRST.p8');
  const calls = [];
  try {
    await writeFile(dmgPath, 'signed disk image bytes\n');
    await writeFile(applicationPath, 'signed application fixture\n');
    await writeFile(keyPath, 'PRIVATE KEY MUST NOT ENTER EVIDENCE\n');
    const evidence = await notarizeMacos({
      applicationPath,
      dmgPath,
      evidencePath,
      attemptPath,
      attemptId: '11111111-1111-1111-1111-111111111111',
      pollingSessionId: '22222222-2222-2222-2222-222222222222',
      sourceTag: 'v0.1.0-rc.7',
      sourceCommit: '1234567890abcdef1234567890abcdef12345678',
      version: '0.1.0-rc.7',
      identity,
      teamId: 'ABCDEFGHIJ',
      notaryKeyPath: keyPath,
      notaryKeyId: 'KLMNOPQRST',
      notaryIssuerId: '12345678-1234-1234-1234-1234567890ab',
      async sleep() {},
      async run(executable, arguments_) {
        calls.push([executable, arguments_]);
        if (arguments_.includes('submit')) {
          const submitting = assertNotarizationAttempt(
            JSON.parse(await readFile(attemptPath, 'utf8')),
          );
          assert.equal(submitting.state, 'submitting');
          return {
            stdout: JSON.stringify({
              id: 'abcdef12-1234-1234-1234-1234567890ab',
            }),
            stderr: '',
          };
        }
        if (arguments_.includes('info')) {
          return {
            stdout: JSON.stringify({
              id: 'abcdef12-1234-1234-1234-1234567890ab',
              status: 'Accepted',
            }),
            stderr: '',
          };
        }
        if (executable === '/usr/bin/codesign' && arguments_[0] === '--display') {
          return {
            stdout: '',
            stderr: arguments_.at(-1) === dmgPath
              ? signatureOutput.replace('(runtime)', '')
              : signatureOutput,
          };
        }
        return { stdout: '', stderr: '' };
      },
    });
    assertAppleTrustEvidence(evidence, {
      sourceTag: 'v0.1.0-rc.7',
      sourceCommit: '1234567890abcdef1234567890abcdef12345678',
      version: '0.1.0-rc.7',
    });
    assert.equal(evidence.notarization.status, 'Accepted');
    assert.equal(evidence.staple.validated, true);
    assert.equal(evidence.gatekeeper.diskImage, 'accepted');
    assert.equal(JSON.stringify(evidence).includes('PRIVATE KEY'), false);
    assert.deepEqual(JSON.parse(await readFile(evidencePath, 'utf8')), evidence);
    const attempt = assertNotarizationAttempt(JSON.parse(await readFile(attemptPath, 'utf8')));
    assert.equal(attempt.state, 'accepted');
    assert.equal(attempt.requestId, 'abcdef12-1234-1234-1234-1234567890ab');
    const commands = calls.map(([executable, arguments_]) => [executable, ...arguments_]);
    const submission = commands.find((command) => command.includes('submit'));
    const poll = commands.find((command) => command.includes('info'));
    assert(submission);
    assert(poll);
    assert.equal(submission.includes('--wait'), false);
    assert(commands.indexOf(submission) < commands.indexOf(poll));
    assert(commands.some((command) => command.includes('staple')));
    assert(commands.some((command) => command.includes('validate')));
    assert(commands.some((command) => command[0] === '/usr/sbin/spctl'));
    assert.equal(coordinatedTrustFromEvidence(evidence).evidence.length, 4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('notarization timeout is durable and recovery polls the same request without resubmitting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-notarization-recovery-'));
  const dmgPath = join(root, 'GateReeve-0.1.0-rc.9-macos-universal.dmg');
  const applicationPath = join(root, 'GateReeve.app');
  const evidencePath = join(root, 'apple-trust.json');
  const attemptPath = join(root, 'notarization-attempt.json');
  const keyPath = join(root, 'AuthKey_KLMNOPQRST.p8');
  let submissions = 0;
  let accept = false;
  try {
    await writeFile(dmgPath, 'signed disk image bytes\n');
    await writeFile(applicationPath, 'signed application fixture\n');
    await writeFile(keyPath, 'PRIVATE KEY MUST NOT ENTER EVIDENCE\n');
    const base = {
      applicationPath,
      dmgPath,
      evidencePath,
      attemptPath,
      attemptId: '11111111-1111-1111-1111-111111111111',
      sourceTag: 'v0.1.0-rc.9',
      sourceCommit: '1234567890abcdef1234567890abcdef12345678',
      version: '0.1.0-rc.9',
      identity,
      teamId: 'ABCDEFGHIJ',
      notaryKeyPath: keyPath,
      notaryKeyId: 'KLMNOPQRST',
      notaryIssuerId: '12345678-1234-1234-1234-1234567890ab',
      async sleep() {},
      async run(executable, arguments_) {
        if (arguments_.includes('submit')) {
          submissions += 1;
          return {
            stdout: JSON.stringify({ id: 'abcdef12-1234-1234-1234-1234567890ab' }),
            stderr: '',
          };
        }
        if (arguments_.includes('info')) {
          return {
            stdout: JSON.stringify({
              id: 'abcdef12-1234-1234-1234-1234567890ab',
              status: accept ? 'Accepted' : 'In Progress',
            }),
            stderr: '',
          };
        }
        if (executable === '/usr/bin/codesign' && arguments_[0] === '--display') {
          return {
            stdout: '',
            stderr: arguments_.at(-1) === dmgPath
              ? signatureOutput.replace('(runtime)', '')
              : signatureOutput,
          };
        }
        return { stdout: '', stderr: '' };
      },
    };
    await assert.rejects(
      notarizeMacos({
        ...base,
        pollingSessionId: '22222222-2222-2222-2222-222222222222',
      }),
      /polling session timed out/u,
    );
    let attempt = assertNotarizationAttempt(JSON.parse(await readFile(attemptPath, 'utf8')));
    assert.equal(attempt.state, 'timed-out');
    assert.equal(attempt.pollingSessions[0].polls, 60);
    assert.equal(submissions, 1);

    accept = true;
    const evidence = await notarizeMacos({
      ...base,
      pollingSessionId: '33333333-3333-3333-3333-333333333333',
    });
    attempt = assertNotarizationAttempt(JSON.parse(await readFile(attemptPath, 'utf8')));
    assert.equal(attempt.state, 'accepted');
    assert.equal(attempt.pollingSessions.length, 2);
    assert.equal(submissions, 1);
    assert.equal(evidence.notarization.id, attempt.requestId);

    await writeFile(dmgPath, 'different signed disk image bytes\n');
    await assert.rejects(
      notarizeMacos({
        ...base,
        pollingSessionId: '44444444-4444-4444-4444-444444444444',
      }),
      /different source or exact disk image/u,
    );
    assert.equal(submissions, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('submission interruption persists uncertainty and refuses an automatic second submit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-notarization-uncertain-'));
  const dmgPath = join(root, 'GateReeve-0.1.0-rc.9-macos-universal.dmg');
  const applicationPath = join(root, 'GateReeve.app');
  const evidencePath = join(root, 'apple-trust.json');
  const attemptPath = join(root, 'notarization-attempt.json');
  const keyPath = join(root, 'AuthKey_KLMNOPQRST.p8');
  let submissions = 0;
  try {
    await writeFile(dmgPath, 'signed disk image bytes\n');
    await writeFile(applicationPath, 'signed application fixture\n');
    await writeFile(keyPath, 'PRIVATE KEY MUST NOT ENTER EVIDENCE\n');
    const options = {
      applicationPath,
      dmgPath,
      evidencePath,
      attemptPath,
      attemptId: '11111111-1111-1111-1111-111111111111',
      pollingSessionId: '22222222-2222-2222-2222-222222222222',
      sourceTag: 'v0.1.0-rc.9',
      sourceCommit: '1234567890abcdef1234567890abcdef12345678',
      version: '0.1.0-rc.9',
      identity,
      teamId: 'ABCDEFGHIJ',
      notaryKeyPath: keyPath,
      notaryKeyId: 'KLMNOPQRST',
      notaryIssuerId: '12345678-1234-1234-1234-1234567890ab',
      async sleep() {},
      async run(executable, arguments_) {
        if (arguments_.includes('submit')) {
          submissions += 1;
          throw new Error('runner transport ended');
        }
        if (executable === '/usr/bin/codesign' && arguments_[0] === '--display') {
          return {
            stdout: '',
            stderr: arguments_.at(-1) === dmgPath
              ? signatureOutput.replace('(runtime)', '')
              : signatureOutput,
          };
        }
        return { stdout: '', stderr: '' };
      },
    };
    await assert.rejects(notarizeMacos(options), /submission outcome is uncertain/u);
    const attempt = assertNotarizationAttempt(JSON.parse(await readFile(attemptPath, 'utf8')));
    assert.equal(attempt.state, 'submission-uncertain');
    await assert.rejects(notarizeMacos(options), /reconcile Apple history/u);
    assert.equal(submissions, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('malformed submission output and Apple rejection become durable fail-closed states', async (t) => {
  for (const scenario of [
    {
      name: 'malformed submission output',
      submission: { stdout: 'not-json', stderr: '' },
      expectedError: /submission outcome is uncertain/u,
      expectedState: 'submission-uncertain',
    },
    {
      name: 'Apple rejection',
      submission: {
        stdout: JSON.stringify({ id: 'abcdef12-1234-1234-1234-1234567890ab' }),
        stderr: '',
      },
      status: 'Invalid',
      expectedError: /rejected request/u,
      expectedState: 'rejected',
    },
    {
      name: 'status response without the recorded request ID',
      submission: {
        stdout: JSON.stringify({ id: 'abcdef12-1234-1234-1234-1234567890ab' }),
        stderr: '',
      },
      status: 'Accepted',
      omitInfoId: true,
      expectedError: /did not identify the recorded request ID/u,
      expectedState: 'polling',
    },
  ]) {
    await t.test(scenario.name, async () => {
      const root = await mkdtemp(join(tmpdir(), 'gatereeve-notarization-failure-'));
      const dmgPath = join(root, 'GateReeve-0.1.0-rc.11-macos-universal.dmg');
      const applicationPath = join(root, 'GateReeve.app');
      const attemptPath = join(root, 'notarization-attempt.json');
      const keyPath = join(root, 'AuthKey_KLMNOPQRST.p8');
      let submissions = 0;
      try {
        await writeFile(dmgPath, 'signed disk image bytes\n');
        await writeFile(applicationPath, 'signed application fixture\n');
        await writeFile(keyPath, 'PRIVATE KEY MUST NOT ENTER EVIDENCE\n');
        const options = {
          applicationPath,
          dmgPath,
          evidencePath: join(root, 'apple-trust.json'),
          attemptPath,
          attemptId: '11111111-1111-1111-1111-111111111111',
          pollingSessionId: '22222222-2222-2222-2222-222222222222',
          sourceTag: 'v0.1.0-rc.11',
          sourceCommit: '1234567890abcdef1234567890abcdef12345678',
          version: '0.1.0-rc.11',
          identity,
          teamId: 'ABCDEFGHIJ',
          notaryKeyPath: keyPath,
          notaryKeyId: 'KLMNOPQRST',
          notaryIssuerId: '12345678-1234-1234-1234-1234567890ab',
          async sleep() {},
          async run(executable, arguments_) {
            if (arguments_.includes('submit')) {
              submissions += 1;
              return scenario.submission;
            }
            if (arguments_.includes('info')) {
              return {
                stdout: JSON.stringify({
                  ...(scenario.omitInfoId
                    ? {}
                    : { id: 'abcdef12-1234-1234-1234-1234567890ab' }),
                  status: scenario.status,
                }),
                stderr: '',
              };
            }
            if (executable === '/usr/bin/codesign' && arguments_[0] === '--display') {
              return {
                stdout: '',
                stderr: arguments_.at(-1) === dmgPath
                  ? signatureOutput.replace('(runtime)', '')
                  : signatureOutput,
              };
            }
            return { stdout: '', stderr: '' };
          },
        };
        await assert.rejects(notarizeMacos(options), scenario.expectedError);
        const attempt = assertNotarizationAttempt(
          JSON.parse(await readFile(attemptPath, 'utf8')),
        );
        assert.equal(attempt.state, scenario.expectedState);
        await assert.rejects(notarizeMacos(options), scenario.expectedError);
        assert.equal(submissions, 1);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});

test('Apple trust evidence rejects an altered or incomplete candidate', async () => {
  const evidence = {
    schemaVersion: 1,
    kind: 'gatereeve-apple-trust',
    status: 'developer-id-notarized',
    sourceTag: 'v0.1.0-rc.7',
    sourceCommit: '1234567890abcdef1234567890abcdef12345678',
    version: '0.1.0-rc.7',
    artifact: {
      filename: 'GateReeve-0.1.0-rc.7-macos-universal.dmg',
      bytes: 123,
      sha256: 'a'.repeat(64),
    },
    signature: {
      identity,
      teamId: 'ABCDEFGHIJ',
      hardenedRuntime: true,
      secureTimestamp: true,
    },
    notarization: {
      id: 'abcdef12-1234-1234-1234-1234567890ab',
      status: 'Accepted',
    },
    staple: { validated: true },
    gatekeeper: { diskImage: 'accepted' },
    verifiedAt: '2026-08-27T20:00:00Z',
  };
  assertAppleTrustEvidence(evidence);
  assert.throws(
    () => assertAppleTrustEvidence(evidence, { sha256: 'b'.repeat(64) }),
    /artifact sha256/u,
  );
  evidence.signature.secureTimestamp = false;
  assert.throws(() => assertAppleTrustEvidence(evidence), /incomplete or invalid/u);
});
