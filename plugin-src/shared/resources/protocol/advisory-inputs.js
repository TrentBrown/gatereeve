import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { advisoryAssert } from './advisory-contract.js';
import { fingerprint } from './fingerprint.js';
const exec = promisify(execFile);
const git = async (root, args) =>
  (
    await exec('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 12 * 1024 * 1024,
    })
  ).stdout;
const canonicalJournals = new Set(['workflow-model.lock.json', 'events.jsonl']);
const kinds = new Set([
  'workflow-judge',
  'review-view-audit',
  'gatereeve-agent-workflow-receipt',
  'validated-feature-recovery',
  'whole-feature-judge-waiver',
  'feature-verification',
  'feature-spec-evaluation',
  'feature-retention',
  'workflow-model-migration-impact',
  'slice-advisory-readiness',
  'slice-advisory-review',
  'slice-advisory-claim',
  'slice-advisory-proceed',
]);
function typedRecord(value) {
  if (value?.kind === 'workflow-judge') {
    return (
      value.schemaVersion === 1 &&
      ['PASS', 'FAIL'].includes(value.outcome) &&
      /^[0-9a-f]{40}$/u.test(value.source?.headSha ?? '') &&
      value.files?.result?.path === 'judge-result.json' &&
      value.files?.receipt?.path === 'judge-receipt.json'
    );
  }
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (kinds.has(value.kind) ||
      (value.schemaVersion === 1 &&
        value.ok === true &&
        typeof value.operation === 'string' &&
        /^(?:feature|advisory)\./u.test(value.operation)) ||
      (value.schemaVersion === 1 &&
        value.mergeVerification?.status === 'verified' &&
        typeof value.reviewedHeadSha === 'string') ||
      (value.schemaVersion === 1 &&
        value.pullRequest &&
        typeof value.evaluatedSourceSha === 'string' &&
        typeof value.mergeBaseSha === 'string') ||
      (value.schemaVersion === 2 &&
        /^pr-\d+$/u.test(value.packetId ?? '') &&
        value.gates) ||
      (value.schemaVersion === 1 &&
        ['PASS', 'FAIL'].includes(value.verdict) &&
        Array.isArray(value.criteria)) ||
      (value.schemaVersion === 1 &&
        ['valid', 'synchronized', 'verified'].includes(value.status) &&
        (value.evaluatedSourceSha || value.integrationSha)))
  );
}
// Known workflow data may change without affecting advisory review. Bind opaque
// historical data conservatively; new/changed ambiguous configuration-shaped
// files in record namespaces require reconciliation instead of path-label reuse.
export async function opaqueAdvisoryInputIdentity(root, compact) {
  const changed = new Set(
    (
      await git(root, [
        'diff',
        '--name-only',
        '-z',
        compact.change.source.baseSha + '..' + compact.change.source.headSha,
      ])
    )
      .split('\0')
      .filter(Boolean)
  );
  const opaque = [];
  for (const path of compact.excludedPaths.filter((p) =>
    /\.(?:json|yaml|yml|toml|ini|cfg)$/u.test(p)
  )) {
    if (canonicalJournals.has(path.split('/').at(-1))) continue;
    let sha = compact.change.source.headSha;
    let entry = (await git(root, ['ls-tree', sha, '--', path])).trim();
    if (!entry) {
      sha = compact.change.source.baseSha;
      entry = (await git(root, ['ls-tree', sha, '--', path])).trim();
      if (!entry) continue;
    }
    let recognized = false;
    const size = Number(
      (await git(root, ['cat-file', '-s', sha + ':' + path])).trim()
    );
    if (path.endsWith('.json') && size <= 128 * 1024) {
      try {
        recognized = typedRecord(
          JSON.parse(await git(root, ['show', sha + ':' + path]))
        );
      } catch {
        /* Opaque data is not implicitly authoritative workflow evidence. */
      }
    }
    if (recognized) continue;
    advisoryAssert(
      !changed.has(path),
      'changed ambiguous record-space data requires classification: ' + path
    );
    opaque.push({ path, entry });
  }
  return fingerprint(opaque);
}
