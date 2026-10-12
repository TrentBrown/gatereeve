import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import {
  advisoryAssert,
  advisoryReference,
  MAX_ADVISORY_BYTES,
  validateAdvisoryRecord,
  validateAdvisoryReadiness,
  underlyingFindingKey,
} from './advisory-contract.js';
import { fingerprint } from './fingerprint.js';

export const advisoryHash = (bytes) =>
  'sha256:' + createHash('sha256').update(bytes).digest('hex');
export async function advisoryFile(
  home,
  ref,
  { json = false, text = false } = {}
) {
  advisoryReference(ref);
  const root = await realpath(home);
  let target = root;
  for (const part of ref.path.split('/')) {
    target = resolve(target, part);
    advisoryAssert(
      !(await lstat(target)).isSymbolicLink(),
      'evidence cannot traverse symlinks'
    );
  }
  advisoryAssert(
    target.startsWith(root + sep) && (await lstat(target)).isFile(),
    'evidence is not a contained regular file'
  );
  const digest = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(target)) {
    digest.update(chunk);
    bytes += chunk.length;
  }
  advisoryAssert(
    bytes > 0 && ref.hash === 'sha256:' + digest.digest('hex'),
    'evidence bytes changed or are empty'
  );
  if (!json && !text) return { sourcePath: target, hash: ref.hash, bytes };
  advisoryAssert(
    bytes <= MAX_ADVISORY_BYTES,
    'structured advisory evidence exceeds compact record budget'
  );
  const content = await readFile(target);
  advisoryAssert(
    advisoryHash(content) === ref.hash,
    'evidence changed while reading'
  );
  return json ? JSON.parse(content) : content.toString('utf8');
}
export async function immutableAdvisoryJSON(home, path, value) {
  advisoryReference({ path, hash: 'sha256:' + '0'.repeat(64) });
  const bytes = JSON.stringify(value, null, 2) + '\n';
  advisoryAssert(
    Buffer.byteLength(bytes) <= MAX_ADVISORY_BYTES,
    'compact record budget exceeded'
  );
  let target = await realpath(home);
  const parts = path.split('/');
  for (const part of parts.slice(0, -1)) {
    target = resolve(target, part);
    try {
      await mkdir(target);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    advisoryAssert(
      (await lstat(target)).isDirectory() &&
        !(await lstat(target)).isSymbolicLink(),
      'record parent is unsafe'
    );
  }
  await writeFile(resolve(target, parts.at(-1)), bytes, {
    flag: 'wx',
    mode: 0o600,
  });
  return { path, hash: advisoryHash(bytes) };
}
export async function existingAdvisoryJSON(home, path) {
  try {
    advisoryReference({ path, hash: 'sha256:' + '0'.repeat(64) });
    let target = await realpath(home);
    for (const part of path.split('/')) {
      target = resolve(target, part);
      advisoryAssert(
        !(await lstat(target)).isSymbolicLink(),
        'record paths cannot traverse symlinks'
      );
    }
    const info = await lstat(target);
    advisoryAssert(
      info.isFile() && info.size > 0 && info.size <= MAX_ADVISORY_BYTES,
      'record is not a bounded regular JSON file'
    );
    const bytes = await readFile(target);
    const ref = { path, hash: advisoryHash(bytes) };
    return {
      value: await advisoryFile(home, ref, { json: true }),
      reference: ref,
    };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
export async function advisoryHistory(
  home,
  sliceId,
  { omitReadinessId = null } = {}
) {
  const root = resolve(home, 'advisory');
  let names = [];
  try {
    names = await readdir(root);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const records = [],
    declarations = [];
  for (const name of names.sort()) {
    const metadata = await lstat(resolve(root, name));
    advisoryAssert(
      metadata.isDirectory() && !metadata.isSymbolicLink(),
      'advisory history contains an unsafe entry'
    );
    const ready = await existingAdvisoryJSON(
      home,
      'advisory/' + name + '/readiness.json'
    );
    if (!ready || ready.value.sliceId !== sliceId || name === omitReadinessId)
      continue;
    validateAdvisoryReadiness(ready.value);
    advisoryAssert(
      ready.value.readinessId === name,
      'readiness history binding is invalid'
    );
    declarations.push(ready.value);
    const review = await existingAdvisoryJSON(
      home,
      'advisory/' + name + '/review.json'
    );
    if (!review) continue;
    validateAdvisoryRecord(review.value, ready.value);
    advisoryAssert(
      review.value.requestIdentity === ready.value.requestIdentity &&
        review.value.readiness.hash === ready.reference.hash &&
        review.value.readiness.path === ready.reference.path &&
        review.value.inputIdentity === ready.value.inputIdentity,
      'review history differs from its readiness declaration'
    );
    await validateAdvisoryReuse(home, review.value);
    records.push({
      ...review.value,
      reference: review.reference,
      declaration: ready.value,
    });
  }
  const findings = records
    .filter((r) => r.outcome === 'FINDINGS')
    .flatMap((r) =>
      r.result.findings.map((f, i) => ({
        id: 'advisory:' + r.readinessId + ':' + i,
        underlyingKey: underlyingFindingKey(f),
        source: { kind: 'advisory', reference: r.reference },
        ...f,
      }))
    );
  declarations.sort(
    (a, b) =>
      a.declaredAt.localeCompare(b.declaredAt) ||
      a.readinessId.localeCompare(b.readinessId)
  );
  return { records, declarations, findings };
}

export async function validateAdvisoryReuse(home, record, seen = new Set()) {
  if (!record.reusedFrom) return [];
  advisoryAssert(
    !seen.has(record.reusedFrom.path) && seen.size < 100,
    'reused review provenance contains a cycle or excessive chain'
  );
  seen.add(record.reusedFrom.path);
  const original = await advisoryFile(home, record.reusedFrom, { json: true });
  const ready = await advisoryFile(home, original.readiness, { json: true });
  validateAdvisoryRecord(original, ready);
  advisoryAssert(
    original.outcome === 'READY_FOR_FORMAL_REVIEW' &&
      original.inputIdentity === record.inputIdentity &&
      fingerprint(original.result) === fingerprint(record.result) &&
      fingerprint(original.receipts) === fingerprint(record.receipts) &&
      fingerprint(original.reviewedSource ?? original.source) ===
        fingerprint(record.reviewedSource),
    'reused review differs from its original reviewed inputs'
  );
  return [
    record.reusedFrom,
    original.readiness,
    ...(await validateAdvisoryReuse(home, original, seen)),
  ];
}
