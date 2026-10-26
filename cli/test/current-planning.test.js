import assert from 'node:assert/strict';
import test from 'node:test';
import { planningFacts, planningReferences, validatePlanning, assertPlanningProof } from '../../plugin-src/shared/resources/protocol/current/planning.js';

const table = '# Spec\n## Acceptance Criteria\n- **AC1.** Export the correct value.\n## Rubric\n| R1 | AC1 correctness | value is 42 | other value | unit test |\n';
const prose = '# Requirements\n### AC1 — Export the correct value.\n### R1 — AC1 correctness\nPass: value is 42\nFail: other value\nEvidence: unit test\n';
test('planning facts preserve identities and evidence across Markdown layouts', () => {
  const a = planningFacts(table), b = planningFacts(prose);
  for (const key of ['acceptance', 'criteria']) assert.deepEqual(a[key].map(({ line, ...item }) => item), b[key].map(({ line, ...item }) => item));
  assert.notEqual(a.source, b.source, 'Actual approved document identities remain distinct');
  assert.ok(b.warnings.length);
});
test('ambiguous and missing definitions are never silently omitted', () => {
  for (const body of [table + '| R1 | duplicate | yes | no | test |', table.replace('**AC1.** Export the correct value.', 'AC1'), table.replace(' | unit test |', ' | |'), table + '\n```']) {
    assert.throws(() => planningFacts(body));
  }
  assert.throws(() => planningFacts('# Nothing to test'), /needs acceptance/);
});
test('supporting tasks need no artificial criterion mapping but real references are validated', () => {
  const facts = planningFacts(table);
  assert.doesNotThrow(() => planningReferences({ 'issues.md': '# Investigate tool setup\nNo requirement claimed.' }, facts));
  assert.throws(() => planningReferences({ 'issues.md': 'Implements R9' }, facts), /unknown criterion/);
});
test('planning proof binds parser policy and failed extraction remains a failure', async () => {
  const proof = await validatePlanning(prose); await assertPlanningProof(proof);
  await assert.rejects(assertPlanningProof({ ...proof, binding: { ...proof.binding, parser: 'changed' } }), /stale/);
  const failed = await validatePlanning('no definitions');
  assert.equal(failed.passed, false); await assert.rejects(assertPlanningProof(failed));
});
