import './helpers/private-scratch.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { planningFacts, planningReferences, validatePlanning, assertPlanningProof } from '../../plugin-src/shared/resources/protocol/current/planning.js';

const table = '# Spec\n## Failure model\nOne writer; others are refused.\n## Acceptance Criteria\n- **AC1.** Export the correct value.\n## Rubric\n| R1 | AC1 correctness | value is 42 | other value | unit test |\n';
const prose = '# Requirements\n## Failure model\nOne writer; others are refused.\n### AC1 — Export the correct value.\n### R1 — AC1 correctness\nPass: value is 42\nFail: other value\nEvidence: unit test\n';
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
  // Fact extraction shares the CommonMark fence rule (issue #143 sweep): a
  // sample criterion inside a four-backtick fence is not a definition.
  const sampled = planningFacts(table.replace('## Rubric', '````\n```\n- **AC9.** Sample only.\n```\n````\n## Rubric'));
  assert.deepEqual(sampled.acceptance.map(item => item.id), ['AC1']);
  assert.throws(() => planningFacts(table + '\n````\n```\n'), /Unclosed code fence/);
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

// Issue #143, spec AC3-AC5: the failure-model section and the unbounded-wording lint.
import { specificationRules, grandfatheredSpecification, PLANNING_POLICY } from '../../plugin-src/shared/resources/protocol/current/planning.js';
const MODEL = '## Failure model\nHandled: one writer. Outside it: refuse with an error.\n';
const spec = (model, criteria = '- **AC1.** Export the correct value.', rubric = '| R1 | AC1 correctness | value is 42 | other value | unit test |') =>
  `# Spec\n${model}## Acceptance Criteria\n${criteria}\n## Rubric\n${rubric}\n`;
const rules = body => specificationRules(body, planningFacts(body));
test('the policy moved with the specification rules', () => { assert.equal(PLANNING_POLICY, 'planning-facts/2'); });
test('a spec needs a nonempty, resolved Failure model section (AC3)', async () => {
  assert.deepEqual(rules(spec(MODEL)), []);
  assert.deepEqual(rules(spec('## failure MODEL\nHandled conditions listed.\n')), [], 'heading matches case-insensitively');
  assert.match(rules(spec('')).join(), /needs a "## Failure model" section/u);
  assert.match(rules(spec('### Failure model\nNot level two.\n')).join(), /needs a "## Failure model" section/u);
  assert.match(rules(spec('```\n## Failure model\n```\n')).join(), /needs a "## Failure model" section/u, 'a heading inside a fence does not count');
  assert.match(rules(spec('## Failure model\n\n   \n')).join(), /Failure model section at line 2 is empty/u);
  assert.match(rules(spec('## Failure model\n```\nonly code\n```\n')).join(), /line 2 is empty/u, 'fenced content alone is empty');
  assert.match(rules(spec('## Failure model\nTODO: name the handled conditions.\n')).join(), /line 2 is unresolved \(TODO\)/u);
  assert.deepEqual(rules(spec('## Failure model\nOne writer.\n```\nTODO example in a fence\n```\n')), [], 'a TODO inside a fence is example text');
  // A longer fence is not closed by a shorter run, a different character or a run with an info string.
  const sample = '````\n```\n## Failure model\nSample only.\n```\n~~~~\n```js\n````\n';
  assert.match(rules(spec(sample)).join(), /needs a "## Failure model" section/u, 'a sample heading inside a four-backtick fence does not count');
  assert.deepEqual(rules(spec(sample + MODEL)), []);
  assert.deepEqual(rules(spec(MODEL, '- **AC1.** Export the value.\n````\n```\nalways any\n```\n````')), [], 'sample wording inside a longer fence is not linted');
  // The section ends at the next level-1 or level-2 heading, not a level-3 one.
  assert.deepEqual(rules(spec('## Failure model\n### Handled\n- one writer\n')), []);
  const failed = await validatePlanning(spec(''));
  assert.equal(failed.passed, false); assert.match(failed.diagnostic, /Failure model/u);
});
test('criteria with unbounded wording need a same-line bound (AC4)', () => {
  for (const word of ['always', 'Any', 'all cases', 'never fails', 'converges', 'ROBUST']) {
    const problems = rules(spec(MODEL, `- **AC1.** Export the value ${word} way.`));
    assert.equal(problems.length, 1, word); assert.match(problems[0], new RegExp(`line 5 \\(${word.toLowerCase()}\\)`, 'u'));
  }
  for (const bound of ['within the failure model', 'at most 3 tries', 'at least once', 'up to the limit', 'no more than the cap', 'within one run', 'for 2 runs']) {
    assert.deepEqual(rules(spec(MODEL, `- **AC1.** Any retry succeeds ${bound}.`)), [], bound);
  }
  // Requirement identifiers are not numerals; code spans and fences are not linted.
  assert.equal(rules(spec(MODEL, '- **AC1.** Any retry succeeds.')).length, 1);
  assert.equal(rules(spec(MODEL, undefined, '| R1 | AC1 any value | value is right | other | test |')).length, 1);
  assert.deepEqual(rules(spec(MODEL, '- **AC1.** The `any` option is exported.')), []);
  assert.deepEqual(rules(spec(MODEL, '- **AC1.** Export the value.\n```\nalways any\n```')), []);
  assert.deepEqual(rules(spec(MODEL, '- **AC1.** Export the value. Many companies anyway.')), [], 'whole words only');
  // Nested criterion lines are linted; text outside the two sections is not.
  assert.equal(rules(spec(MODEL, '- **AC1.** Export the value.\n  - It is always right.')).length, 1);
  assert.deepEqual(rules(`# Spec\n## Summary\nAlways robust, any case.\n${MODEL}## Acceptance Criteria\n- **AC1.** Export.\n## Rubric\n| R1 | AC1 | 42 | other | test |\n`), []);
  // One diagnostic lists every offending line.
  const problems = rules(spec(MODEL, '- **AC1.** Always export.\n- **AC2.** Export any value.', '| R1 | AC1 robust | right | other | test |\n| R2 | AC2 | right | other | test |'));
  assert.equal(problems.length, 1); assert.match(problems[0], /line 5 \(always\); line 6 \(any\); line 8 \(robust\)/u);
  // An alternative presentation without the headings lints its extracted lines.
  assert.equal(rules(`# Requirements\n${MODEL}### AC1 — Always export.\n### R1 — AC1 correctness\nPass: 42\nFail: other\nEvidence: test\n`).length, 1);
});
test('a grandfathered spec reports the rules as warnings; other specs fail (AC5)', async () => {
  const bad = spec('', '- **AC1.** Always export.');
  const warned = await validatePlanning(bad, { grandfathered: true });
  assert.equal(warned.passed, true); assert.equal(warned.grandfathered, true);
  assert.equal(warned.facts.warnings.filter(item => /^Grandfathered specification/u.test(item)).length, 2);
  assert.match(warned.facts.warnings.join(), /line 3 \(always\)/u);
  await assertPlanningProof(warned);
  const strict = await validatePlanning(bad);
  assert.equal(strict.passed, false); assert.equal(strict.grandfathered, undefined);
  assert.match(strict.diagnostic, /Failure model.*Unbounded wording.*line 3 \(always\)/u);
  // Grandfathering never hides a parse failure.
  assert.equal((await validatePlanning('no definitions', { grandfathered: true })).passed, false);
});
test('grandfathering follows exact spec bytes validated under an earlier policy (AC5)', async () => {
  const proofs = new Map([['old', { binding: { policy: 'planning-facts/1' }, passed: true }], ['oldFail', { binding: { policy: 'planning-facts/1' }, passed: false }],
    ['kept', { binding: { policy: PLANNING_POLICY }, grandfathered: true, passed: true }], ['new', { binding: { policy: PLANNING_POLICY }, passed: true }]]);
  const read = async ref => { if (!proofs.has(ref)) throw new Error('missing'); return proofs.get(ref); };
  const started = { type: 'STARTED', payload: { priorActive: 'sha256:prior' } };
  const validated = (hash, proof) => ({ type: 'SPEC_VALIDATED', payload: { spec: { hash }, proof } });
  const failed = (hash, proof) => ({ type: 'VALIDATION_FAILED', payload: { documents: { 'spec.md': { hash } }, proof } });
  const amended = (hash, proof) => ({ type: 'DECIDED', payload: { kind: 'amend', specValidation: { spec: { hash }, proof } } });
  assert.equal(await grandfatheredSpecification([started, validated('A', 'old')], 'A', read), true);
  assert.equal(await grandfatheredSpecification([started, failed('A', 'oldFail')], 'A', read), true, 'a failed earlier-policy validation counts');
  assert.equal(await grandfatheredSpecification([started, amended('A', 'old')], 'A', read), true, 'an amendment validation counts');
  assert.equal(await grandfatheredSpecification([started, validated('A', 'kept')], 'A', read), true, 'a grandfathered validation keeps its bytes grandfathered');
  assert.equal(await grandfatheredSpecification([started, validated('A', 'old')], 'B', read), false, 'a changed spec is held to the rules');
  assert.equal(await grandfatheredSpecification([started, validated('A', 'new')], 'A', read), false, 'a current-policy validation grandfathers nothing');
  assert.equal(await grandfatheredSpecification([started, validated('A', 'gone')], 'A', read), false, 'an unreadable proof grandfathers nothing');
  assert.equal(await grandfatheredSpecification([started], 'A', read), false, 'a resumed run without a record of its old spec is held to the rules');
});

test('the portable lint applies the rules as failures, or reports them on request (AC5)', async t => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-portable-lint-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const script = new URL('../../plugin-src/shared/resources/scripts/lint_spec.py', import.meta.url).pathname;
  const run = (...args) => spawnSync('python3', [script, root, ...args], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  await writeFile(join(root, 'spec.md'), spec(''));
  const strict = run();
  assert.equal(strict.status, 1); assert.match(strict.stderr, /FAIL: Specification needs a "## Failure model" section/u);
  const warned = run('--specification-rules=warn');
  assert.equal(warned.status, 0, warned.stderr); assert.match(warned.stdout, /Warning: Specification rule \(reported, not enforced\): Specification needs/u);
  assert.equal(run('--unknown').status, 1, 'an unsupported option is refused');
  await writeFile(join(root, 'spec.md'), spec(MODEL));
  assert.equal(run().status, 0);
  // A parse failure still fails in warn mode.
  await writeFile(join(root, 'spec.md'), '# Nothing to test\n');
  assert.equal(run('--specification-rules=warn').status, 1);
});
