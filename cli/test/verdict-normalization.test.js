import './helpers/private-scratch.js';
// Issue #141: GateReeve corrects a verdict automatically only where the answer
// follows from the verdict itself, records each correction with its rule, and
// sends meaning-changing gaps to the repair turn with the field path. The
// fixtures are shaped like the retained cases in the tally (interview.md,
// "Evidence base"), anonymized; malformed JSON is synthetic because raw
// provider output was not retained.
import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile } from 'node:fs/promises';
import { validateVerdict, validateFormatRepair, stripUnknown, VERDICT_SCHEMA, rejectionRule, findingLedger }
  from '../../plugin-src/shared/resources/protocol/current/execution.js';
import { jsonObjectCandidates } from '../../plugin-src/shared/resources/protocol/local-agent-adapters.js';
import { createClaudeCodeAgentAdapter, createCodexAgentAdapter, parseClaudeStructuredOutput, validateAgentWorkflowStageResult }
  from '../../plugin-src/shared/resources/protocol/index.js';
import { validateJsonSchema } from '../../plugin-src/shared/resources/protocol/json-schema.js';

const candidate = { criteria: ['R1'], repositories: [{ alias: 'app', files: [{ path: 'app.js' }], baseFiles: [{ path: 'app.js' }], targetFiles: [] }] };
const finding = (id, { blocking = true, severity = 'high', ...rest } = {}) => ({ id, classId: `class-${id}`, classStatement: `Class of ${id}`,
  severity, failureScenario: `Trigger ${id} -> wrong output`, criterion: 'R1', path: 'app/app.js', evidence: `Evidence for ${id}`, blocking, ...rest });
const disposition = (id, status = 'resolved') => ({ id, status, evidence: `Disposition evidence for ${id}` });
const dimensions = outcome => ['code', 'requirements', 'evidence', 'scope', 'findings'].map(name => ({ name, outcome, evidence: 'Checked.' }));
const review = (fields = {}) => ({ gate: 'review', outcome: 'PASS', summary: 'No blocking defects remain.', mandateAssessment: null,
  coverage: { complete: true, paths: ['app/app.js'], interactions: ['app/app.js'], limitations: [] },
  criteria: [{ id: 'R1', outcome: 'PASS', evidence: 'Checked.' }], dimensions: dimensions('PASS'),
  findings: [], dispositions: [], historyAssessment: null, coverageDecisions: [], ...fields });
// Earlier review history: B1 blocking (high), M1 advisory (non-blocking),
// L1 marked blocking but rated low, U1 an earlier-contract (unrated) blocking finding.
const history = [{ reviewerResult: { gate: 'review', dispositions: [], findings: [
  finding('B1'), finding('M1', { blocking: false, severity: 'medium' }), finding('L1', { severity: 'low' }),
  { id: 'U1', classId: 'class-U1', criterion: 'R1', path: 'app/app.js', evidence: 'Legacy.', blocking: true }] } }];
const claim = id => ({ findingId: id, claim: `Left ${id} unchanged on purpose.` });
const check = (verdict, claims = []) => validateVerdict(verdict, ['review'], candidate, null, history, claims, []);
const rules = result => (result.normalized ?? []).map(row => row.rule);

// --- Tally class: "PASS contradicts a present blocking finding" -------------
test('tally: a PASS reporting a blocking finding is recorded as FAIL', () => {
  const result = check(review({ findings: [finding('N1')] }));
  assert.equal(result.outcome, 'FAIL');
  assert.deepEqual(result.normalized, [{ rule: 'pass-with-blocking-finding', field: 'outcome', id: 'N1', original: { outcome: 'PASS' } }]);
});
test('tally: a PASS marking an earlier blocking finding present is recorded as FAIL, rated or unrated', () => {
  for (const id of ['B1', 'U1']) {
    const result = check(review({ dispositions: [disposition('B1', id === 'B1' ? 'present' : 'resolved'), disposition('U1', id === 'U1' ? 'present' : 'resolved')] }));
    assert.equal(result.outcome, 'FAIL', id);
    assert.deepEqual(result.normalized, [{ rule: 'pass-with-blocking-finding', field: 'outcome', id, original: { outcome: 'PASS' } }]);
  }
});
test('a PASS whose only blocking findings are low stays PASS, current or earlier', () => {
  const current = check(review({ findings: [finding('N2', { severity: 'low' })], dispositions: [disposition('B1'), disposition('U1')] }));
  assert.equal(current.outcome, 'PASS');
  assert.deepEqual(rules(current), ['low-never-blocks']);
  const earlier = check(review({ dispositions: [disposition('B1'), disposition('U1'), disposition('L1', 'present')] }));
  assert.equal(earlier.outcome, 'PASS');
  assert.deepEqual(rules(earlier), []);
});

// --- Tally class: "Missing supported disposition" for claimed advisory findings
test('tally: present for a claimed non-blocking earlier finding is accepted and recorded', () => {
  for (const id of ['M1', 'L1']) {
    const result = check(review({ dispositions: [disposition('B1'), disposition('U1'), disposition(id, 'present')] }), [claim(id)]);
    assert.equal(result.outcome, 'PASS', id);
    assert.deepEqual(result.normalized, [{ rule: 'present-non-blocking', field: 'dispositions[2]', id }]);
  }
});

// --- Tally class: "A review disposition must name a finding disclosed" ------
test('tally: an undisclosed review disposition is dropped and recorded', () => {
  const result = check(review({ dispositions: [disposition('B1'), disposition('Z9', 'resolved'), disposition('U1')] }));
  assert.equal(result.outcome, 'PASS');
  assert.deepEqual(result.dispositions.map(row => row.id), ['B1', 'U1']);
  assert.deepEqual(result.normalized, [{ rule: 'disposition-not-disclosed', field: 'dispositions[1]', id: 'Z9' }]);
});

// --- Tally class: "<field> is not allowed" -----------------------------------
test('tally: unknown properties are stripped at every level and recorded with their paths', () => {
  const raw = review({ criteria_note_placeholder_removed: null, findings: [{ ...finding('N3', { blocking: false, severity: 'medium' }), note: 'x' }],
    coverage: { ...review().coverage, extra: true }, dispositions: [{ ...disposition('B1'), confidence: 'high' }, disposition('U1')],
    criteria: [{ id: 'R1', outcome: 'PASS', evidence: 'Checked.', weight: 1 }], historyAssessment: { affected: [], carryForwardReason: 'x', why: 'y' } });
  assert.throws(() => validateJsonSchema(VERDICT_SCHEMA, raw, { label: 'review' }), /is not allowed/);
  const shape = [];
  const stripped = stripUnknown(VERDICT_SCHEMA, raw, 'review', shape);
  assert.doesNotThrow(() => validateJsonSchema(VERDICT_SCHEMA, stripped, { label: 'review' }));
  assert.deepEqual(shape.map(row => [row.rule, row.field]), [
    ['unknown-property', 'review.coverage.extra'],
    ['unknown-property', 'review.criteria[0].weight'],
    ['unknown-property', 'review.findings[0].note'],
    ['unknown-property', 'review.dispositions[0].confidence'],
    ['unknown-property', 'review.historyAssessment.why'],
    ['unknown-property', 'review.criteria_note_placeholder_removed'],
  ]);
  assert.equal(check(stripped).outcome, 'PASS');
});
test('a missing required field is not stripped and reaches repair with its path', () => {
  const raw = review({ outcome: 'FAIL', findings: [finding('N4')] });
  delete raw.findings[0].blocking;
  const shape = [];
  const stripped = stripUnknown(VERDICT_SCHEMA, raw, 'review', shape);
  assert.deepEqual(shape, []);
  assert.throws(() => validateJsonSchema(VERDICT_SCHEMA, stripped, { label: 'review' }), error => {
    assert.equal(error.message, 'review.findings[0].blocking is required');
    assert.equal(rejectionRule(error.message), 'schema-required');
    return true;
  });
});

// --- Tally class: malformed JSON with a prose preamble ------------------------
test('tally: exactly one JSON object inside prose is found; none or two are not', () => {
  const verdicts = { verdicts: [{ gate: 'review', outcome: 'PASS' }] };
  assert.deepEqual(jsonObjectCandidates(`Here is my review, as asked {see below}.\n${JSON.stringify(verdicts)}\nThanks, it's done.`), [verdicts]);
  assert.deepEqual(jsonObjectCandidates('No JSON at all, only {prose braces}.'), []);
  assert.equal(jsonObjectCandidates(`${JSON.stringify(verdicts)} and a draft ${JSON.stringify(verdicts)}`).length, 2);
  // Braces and quotes inside JSON strings do not split the object.
  const tricky = { verdicts: [{ summary: 'A "quoted" } brace and \\ backslash' }] };
  assert.deepEqual(jsonObjectCandidates(`Prose. ${JSON.stringify(tricky)}`), [tricky]);
});
test('the Claude parser unwraps one object only when asked to record it', () => {
  const output = { verdicts: [] };
  const stdout = JSON.stringify({ session_id: 'fresh', result: `I reviewed the change.\n${JSON.stringify(output)}\nDone.` });
  assert.deepEqual(parseClaudeStructuredOutput(stdout, { unwrap: true }).normalized, [{ rule: 'prose-unwrapped', field: 'output', id: null }]);
  assert.deepEqual(parseClaudeStructuredOutput(stdout, { unwrap: true }).output, output);
  assert.throws(() => parseClaudeStructuredOutput(stdout), error => error.providerFailure?.category === 'malformed-output');
  const two = JSON.stringify({ session_id: 'fresh', result: `${JSON.stringify(output)}\n${JSON.stringify(output)}` });
  assert.throws(() => parseClaudeStructuredOutput(two, { unwrap: true }), /2 JSON objects; expected exactly one/);
});

const stageRequest = () => ({ schemaVersion: 1, protocolVersion: '2.1.0', runId: 'run-1', attemptId: 'attempt-1',
  module: { id: 'example/review', version: '1.0.0', digest: `sha256:${'a'.repeat(64)}` }, stage: { id: 'review', role: 'Reviewer' },
  instructions: 'Review.', input: { diff: 'pinned' }, snapshotDigest: `sha256:${'b'.repeat(64)}`, repositoryPath: '/repository',
  outputSchema: { type: 'object' }, policy: { repositoryAccess: 'read-only', networkAccess: 'deny', scratch: 'isolated', isolation: { freshContext: true, inheritedTurns: 0 } },
  capabilityProfile: { id: 'high-capability-v1', minimumReasoning: 'high' }, timeoutSeconds: 300 });
const wrapped = `Sure. Here is the verdict:\n${JSON.stringify({ verdicts: [] })}\n`;
const adapters = {
  codex: () => createCodexAgentAdapter({ model: 'gpt-test', runner: async (_, args) => {
    await writeFile(args[args.indexOf('--output-last-message') + 1], wrapped);
    return { code: 0, signal: null, stdout: '{"type":"thread.started","thread_id":"fresh"}\n', stderr: '', startedAt: new Date(), completedAt: new Date() };
  } }),
  'claude-code': () => createClaudeCodeAgentAdapter({ model: 'claude-test', runner: async () => ({ code: 0, signal: null,
    stdout: JSON.stringify({ session_id: 'fresh', result: wrapped }), stderr: '', startedAt: new Date(), completedAt: new Date() }) }),
};
for (const [provider, create] of Object.entries(adapters)) test(`${provider}: prose-wrapped output is unwrapped through the hook; without it, malformed JSON`, async () => {
  const reported = [];
  const result = await create().runStage(stageRequest(), { onNormalized: rows => reported.push(...rows) });
  assert.deepEqual(result.output, { verdicts: [] });
  assert.deepEqual(reported, [{ rule: 'prose-unwrapped', field: 'output', id: null }]);
  assert.equal(validateAgentWorkflowStageResult(result), result, 'The stage-result shape is unchanged');
  // A caller without the hook (planning reviews, analysis) parses as before.
  await assert.rejects(create().runStage(stageRequest()), error => error.providerFailure?.category === 'malformed-output');
});

// --- Tally classes: repair turns ---------------------------------------------
const prior = findingLedger('review', history, [], []).prior;
test('tally: a repair may supply the disposition the original omitted; stated dispositions keep their status', () => {
  const original = review({ dispositions: [disposition('B1')] });
  const repaired = review({ dispositions: [disposition('B1'), disposition('U1')] });
  assert.doesNotThrow(() => validateFormatRepair(original, repaired, ['R1'], [], path => path, prior));
  const changed = review({ dispositions: [disposition('B1', 'unsupported'), disposition('U1')] });
  assert.throws(() => validateFormatRepair(original, changed, ['R1'], [], path => path, prior),
    /Substantive assessment changes are not format repair: dispositions changed for B1/);
  // The repaired verdict validates; GateReeve recorded no correction: the reviewer supplied it.
  assert.equal(check(repaired).outcome, 'PASS');
  assert.deepEqual(rules(check(repaired)), []);
});
test('tally: a repair may say FAIL where the original PASS showed the blocking finding', () => {
  const original = review({ findings: [finding('N5')], summary: 'Fine.' });
  const repaired = review({ outcome: 'FAIL', findings: [finding('N5')], criteria: [{ id: 'R1', outcome: 'FAIL', evidence: 'N5.' }], dimensions: dimensions('FAIL') });
  // Criterion outcomes are substance: this repair also changed them, so it is rejected.
  assert.throws(() => validateFormatRepair(original, repaired, ['R1'], [], path => path, prior), /criteria\[0\]/);
  const outcomeOnly = { ...structuredClone(original), outcome: 'FAIL' };
  assert.doesNotThrow(() => validateFormatRepair(original, outcomeOnly, ['R1'], [], path => path, prior));
  // A repair supplying `present` for an earlier blocking finding may also say FAIL.
  const omitted = review({ dispositions: [disposition('U1')] });
  const present = review({ outcome: 'FAIL', dispositions: [disposition('U1'), disposition('B1', 'present')] });
  assert.doesNotThrow(() => validateFormatRepair(omitted, present, ['R1'], [], path => path, prior));
  assert.equal(check(present).outcome, 'FAIL');
  // Any other outcome change stays substantive.
  const clean = review({ dispositions: [disposition('B1'), disposition('U1')] });
  assert.throws(() => validateFormatRepair(clean, { ...structuredClone(clean), outcome: 'FAIL' }, ['R1'], [], path => path, prior),
    /Verdict changes require substantive reassessment/);
  assert.throws(() => validateFormatRepair({ ...clean, outcome: 'FAIL' }, clean, ['R1'], [], path => path, prior),
    /Verdict changes require substantive reassessment/);
});

// --- Meaning goes to repair ---------------------------------------------------
test('meaning-changing gaps stay contract errors that name the field path', () => {
  const cases = [
    [() => check(review({ dispositions: [disposition('U1')] })), /^Missing supported disposition for B1: .*dispositions has no entry for it/u, 'missing-disposition'],
    [() => check(review({ dispositions: [disposition('B1', 'unaffected'), disposition('U1')] })),
      /^Open finding B1 cannot be carried as unaffected: dispositions\[0\]/u, 'open-carried-unaffected'],
    [() => check(review({ dispositions: [disposition('B1'), disposition('U1')], criteria: [{ id: 'R1', outcome: 'UNAVAILABLE', evidence: 'Post-merge.' }] })),
      /^Assessment PASS contradicts criterion outcomes: criteria\[0\] \(R1\) is UNAVAILABLE/u, 'pass-failed-criterion'],
    [() => check(review({ dispositions: [disposition('B1'), disposition('B1', 'present'), disposition('U1')] })),
      /^Duplicate disposition identity: dispositions\[1\] \(B1\) repeats dispositions\[0\]/u, 'duplicate-disposition'],
  ];
  for (const [run, message, rule] of cases) assert.throws(run, error => {
    assert.match(error.message, message);
    assert.equal(rejectionRule(error.message), rule);
    return true;
  });
});
test('every rejection rule this change names maps to a stable identifier', () => {
  assert.equal(rejectionRule('anything', 'malformed-json'), 'malformed-json');
  assert.equal(rejectionRule('Invalid verdict envelope: verdicts must be an array'), 'envelope');
  assert.equal(rejectionRule('review.findings[0].severity must be one of "high", "medium", "low"'), 'schema-invalid');
  assert.equal(rejectionRule('Finding must name source in scope: findings[0].path (F1) names "x"'), 'finding-path');
  assert.equal(rejectionRule('Format repair must preserve all original findings: findings has 0 entries'), 'repair-substance');
  assert.equal(rejectionRule('Something new'), 'other-contract');
});
