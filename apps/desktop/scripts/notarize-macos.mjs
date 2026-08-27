// @ts-check

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import {
  APPLE_TRUST_STATUS,
  assertAppleSigningConfiguration,
  assertAppleTrustEvidence,
  parseCodesignFacts,
} from './apple-trust-contract.mjs';

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

/**
 * @param {{applicationPath: string, dmgPath: string, evidencePath: string, sourceTag: string,
 *   sourceCommit: string, version: string, identity: string, teamId: string,
 *   notaryKeyPath: string, notaryKeyId: string, notaryIssuerId: string,
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
    '--wait',
    '--output-format',
    'json',
  ]);
  const result = JSON.parse(submission.stdout ?? '{}');
  if (result.status !== 'Accepted' || typeof result.id !== 'string') {
    throw new Error(`Apple notarization did not accept the disk image (status=${result.status ?? 'unknown'})`);
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
    artifact: await fileIdentity(dmgPath),
    signature: signatureFacts,
    notarization: { id: result.id, status: result.status },
    staple: { validated: true },
    gatekeeper: { diskImage: 'accepted' },
    verifiedAt: new Date().toISOString(),
  };
  assertAppleTrustEvidence(evidence);
  await writeFile(resolve(options.evidencePath), `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const options = {
    applicationPath: argument('--application'),
    dmgPath: argument('--dmg'),
    evidencePath: argument('--evidence'),
    sourceTag: argument('--source-tag'),
    sourceCommit: argument('--source-commit'),
    version: argument('--version'),
    identity: argument('--identity'),
    teamId: argument('--team-id'),
    notaryKeyPath: argument('--notary-key'),
    notaryKeyId: argument('--notary-key-id'),
    notaryIssuerId: argument('--notary-issuer-id'),
  };
  if (Object.values(options).some((value) => !value)) {
    throw new Error('Notarization requires the DMG, evidence path, source identity, Developer ID identity, team ID, and team API key configuration');
  }
  process.stdout.write(`${JSON.stringify(await notarizeMacos(/** @type {any} */ (options)), null, 2)}\n`);
}
