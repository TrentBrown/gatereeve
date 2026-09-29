import { createHash } from 'node:crypto';

const SHA256 = /^sha256:[0-9a-f]{64}$/u;

function digest(value) {
  const content = typeof value === 'string' || Buffer.isBuffer(value)
    ? value
    : `${JSON.stringify(value)}\n`;
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function fail(message) {
  throw new Error(`Judge artifact invalid: ${message}`);
}

export function validateJudgeBundle({ manifest, result, markdown, receipt }) {
  if (manifest?.schemaVersion !== 1 || manifest.kind !== 'workflow-judge') fail('manifest kind or version is unsupported');
  if (!['PASS', 'FAIL'].includes(manifest.outcome) || manifest.outcome !== result?.verdict) fail('manifest verdict mismatch');
  if (result.schemaVersion !== 1 || !Array.isArray(result.criteria) || result.criteria.length === 0) fail('structured result is incomplete');
  if (result.criteria.some((criterion) => !['PASS', 'FAIL'].includes(criterion.result))) fail('criterion result is invalid');
  const checks = [result.scopeCheck, result.gapCheck, result.contradictionCheck];
  if (checks.some((check) => !['PASS', 'FAIL'].includes(check?.result))) fail('independent check result is invalid');
  const expected = [...result.criteria, ...checks].every((item) => item.result === 'PASS') ? 'PASS' : 'FAIL';
  if (result.verdict !== expected) fail('overall verdict contradicts criterion results');
  if (result.markdown !== markdown || typeof markdown !== 'string' || markdown.trim() === '') fail('Markdown report mismatch');
  for (const [field, path, value] of [
    ['result', 'judge-result.json', result],
    ['markdown', 'judge.md', markdown],
    ['receipt', 'judge-receipt.json', receipt],
  ]) {
    const binding = manifest.files?.[field];
    if (binding?.path !== path || !SHA256.test(binding.sha256) || binding.sha256 !== digest(value)) {
      fail(`${field} binding mismatch`);
    }
  }
  if (
    receipt?.stage !== 'judge'
    || receipt?.isolation?.freshContext !== true
    || receipt?.isolation?.inheritedTurns !== 0
    || receipt?.policy?.repositoryAccess !== 'read-only-pinned'
    || receipt?.policy?.networkAccess !== 'denied'
  ) fail('receipt does not prove isolated read-only execution');
  return manifest;
}

export function judgeDigest(value) {
  return digest(value);
}

export function createJudgeBundle({ module, input, outputs, receipts }) {
  const result = outputs?.judge;
  const receipt = receipts?.find((item) => item.stage === 'judge') ?? null;
  const markdown = result?.markdown ?? '';
  const manifest = {
    schemaVersion: 1,
    kind: 'workflow-judge',
    module: { id: module.id, version: module.version, digest: module.digest },
    source: input?.source ?? null,
    outcome: result?.verdict,
    summary: result?.summary ?? 'Judge artifact validation failed.',
    files: {
      result: { path: 'judge-result.json', sha256: digest(result ?? null) },
      markdown: { path: 'judge.md', sha256: digest(markdown) },
      receipt: { path: 'judge-receipt.json', sha256: digest(receipt) },
    },
  };
  validateJudgeBundle({ manifest, result, markdown, receipt });
  return {
    outcome: manifest.outcome,
    summary: manifest.summary,
    manifest,
    files: {
      'judge.json': manifest,
      'judge-result.json': result,
      'judge-receipt.json': receipt,
      'judge.md': markdown,
    },
  };
}
