import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createJudgeBundle,
  judgeDigest,
  validateJudgeBundle,
} from '../../plugin-src/shared/resources/agent-workflows/judge/validator.js';

function bundle(results = ['PASS']) {
  const verdict = results.every((value) => value === 'PASS') ? 'PASS' : 'FAIL';
  const markdown = `## Judge Evaluation\n\n**Verdict:** ${verdict}\n\n` + 'Evidence-backed report. '.repeat(8);
  const result = {
    schemaVersion: 1,
    verdict,
    summary: 'Independent compliance evaluation.',
    criteria: results.map((value, index) => ({ id: `R${index + 1}`, title: `Criterion ${index + 1}`, result: value, evidence: [], explanation: 'Evidence.' })),
    scopeCheck: { result: 'PASS', explanation: 'No scope creep.', evidence: [] },
    gapCheck: { result: 'PASS', explanation: 'No coverage gap.', evidence: [] },
    contradictionCheck: { result: 'PASS', explanation: 'No contradiction.', evidence: [] },
    findings: [],
    markdown,
  };
  const receipt = {
    stage: 'judge',
    isolation: { freshContext: true, inheritedTurns: 0 },
    policy: { repositoryAccess: 'read-only-pinned', networkAccess: 'denied' },
  };
  return {
    result,
    markdown,
    receipt,
    manifest: {
      schemaVersion: 1,
      kind: 'workflow-judge',
      outcome: verdict,
      files: {
        result: { path: 'judge-result.json', sha256: judgeDigest(result) },
        markdown: { path: 'judge.md', sha256: judgeDigest(markdown) },
        receipt: { path: 'judge-receipt.json', sha256: judgeDigest(receipt) },
      },
    },
  };
}

test('Judge bundle binds an isolated receipt and preserves blocking FAIL semantics', () => {
  assert.equal(validateJudgeBundle(bundle()).outcome, 'PASS');
  assert.equal(validateJudgeBundle(bundle(['PASS', 'FAIL'])).outcome, 'FAIL');
});

test('Judge bundle rejects same-thread fallback and contradictory verdicts', () => {
  const sameThread = bundle();
  sameThread.receipt.isolation = { freshContext: false, inheritedTurns: 42 };
  assert.throws(() => validateJudgeBundle(sameThread), /receipt binding mismatch|does not prove/);

  const contradictory = bundle(['PASS', 'FAIL']);
  contradictory.result.verdict = 'PASS';
  contradictory.manifest.outcome = 'PASS';
  contradictory.manifest.files.result.sha256 = judgeDigest(contradictory.result);
  assert.throws(() => validateJudgeBundle(contradictory), /contradicts/);
});

test('Judge fails when an independent scope, gap, or contradiction check fails', () => {
  const value = bundle();
  value.result.gapCheck.result = 'FAIL';
  value.result.verdict = 'FAIL';
  value.manifest.outcome = 'FAIL';
  value.manifest.files.result.sha256 = judgeDigest(value.result);
  assert.equal(validateJudgeBundle(value).outcome, 'FAIL');
});

test('Judge bundle creation preserves the model verdict without remediation behavior', () => {
  const value = bundle(['PASS', 'FAIL']);
  const created = createJudgeBundle({
    module: { id: 'gatereeve/judge', version: '2.0.0', digest: `sha256:${'a'.repeat(64)}` },
    input: { source: { attemptId: 'attempt-1' } },
    outputs: { judge: value.result },
    receipts: [value.receipt],
  });
  assert.equal(created.outcome, 'FAIL');
  assert.equal(created.files['judge-result.json'].verdict, 'FAIL');
  assert.equal(Object.hasOwn(created, 'remediation'), false);
});
