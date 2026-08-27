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
      sourceTag: 'v0.1.0-rc.7',
      sourceCommit: '1234567890abcdef1234567890abcdef12345678',
      version: '0.1.0-rc.7',
      identity,
      teamId: 'ABCDEFGHIJ',
      notaryKeyPath: keyPath,
      notaryKeyId: 'KLMNOPQRST',
      notaryIssuerId: '12345678-1234-1234-1234-1234567890ab',
      async run(executable, arguments_) {
        calls.push([executable, arguments_]);
        if (arguments_.includes('notarytool')) {
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
    const commands = calls.map(([executable, arguments_]) => [executable, ...arguments_]);
    assert(commands.some((command) => command.includes('notarytool')));
    assert(commands.some((command) => command.includes('staple')));
    assert(commands.some((command) => command.includes('validate')));
    assert(commands.some((command) => command[0] === '/usr/sbin/spctl'));
    assert.equal(coordinatedTrustFromEvidence(evidence).evidence.length, 4);
  } finally {
    await rm(root, { recursive: true, force: true });
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
