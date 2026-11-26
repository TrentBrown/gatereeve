import './helpers/private-scratch.js';
// PR B1 (spec AC3, AC5; D32, D33): reviewer verdicts separate substance from
// bookkeeping, findings carry severity, low never blocks, format repair is
// judged by substance identity, and every UNAVAILABLE carries a reason code.
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateVerdict, validateFormatRepair, findingLedger, reviewSchema, unavailableReason, UNAVAILABLE_REASONS, findingBlocks }
  from '../../plugin-src/shared/resources/protocol/current/execution.js';
import { pairedSeverities } from '../../plugin-src/shared/resources/protocol/current/boundary-review.js';
import { eligibleResidualRisk } from '../../plugin-src/shared/resources/protocol/current/autonomous.js';
import { ContractError } from '../../plugin-src/shared/resources/protocol/errors.js';
import { validateJsonSchema } from '../../plugin-src/shared/resources/protocol/json-schema.js';
import { validateReview as validatePlanningReview } from '../../plugin-src/shared/resources/protocol/current/delegation.js';

const candidate = { criteria: ['R1'], repositories: [{ alias: 'app', files: [{ path: 'app.js' }], baseFiles: [{ path: 'app.js' }], targetFiles: [] }] };
const finding = (id, { blocking = true, severity = 'high', ...rest } = {}) => ({ id, classId: `class-${id}`, classStatement: `Class of ${id}`,
  severity, failureScenario: `Trigger ${id} -> wrong output`, criterion: 'R1', path: 'app/app.js', evidence: `Evidence for ${id}`, blocking, ...rest });
const legacy = (id, blocking = true) => ({ id, classId: `class-${id}`, criterion: 'R1', path: 'app/app.js', evidence: `Evidence for ${id}`, blocking });
const disposition = (id, status = 'resolved') => ({ id, status, evidence: `Disposition evidence for ${id}` });
const pass = (fields = {}) => ({ gate: 'code', outcome: 'PASS', summary: 'No blocking defects remain.', criteria: [],
  coverage: { complete: true, paths: ['app/app.js'], interactions: ['app/app.js'], limitations: [] },
  findings: [], dispositions: [], historyAssessment: null, ...fields });
// Prior code history: O1 open and blocking (legacy, unrated), A1 advisory
// (non-blocking), C1 closed and reconsidered; U1 exists only inside an
// earlier UNAVAILABLE result; P1 is a peer-gate finding.
const history = [
  { reviewerResult: { gate: 'code', findings: [legacy('O1'), legacy('A1', false), legacy('C1')], dispositions: [] } },
  { reviewerResult: { gate: 'code', findings: [], dispositions: [disposition('C1')] } },
  { reviewerResult: { gate: 'code', outcome: 'UNAVAILABLE', findings: [], dispositions: [], unvalidatedFindings: [legacy('U1')] } },
  { reviewerResult: { gate: 'review', findings: [legacy('P1', false)], dispositions: [] } },
];
const reconsider = [{ gate: 'code', id: 'C1' }];
const validate = value => validateVerdict(value, ['code'], candidate, null, history, [], reconsider);

test('the ledger names exactly the dispositions required and every disclosed ID', () => {
  const ledger = findingLedger('code', history, [], reconsider);
  assert.deepEqual(ledger.dispositionsRequired, [
    { gate: 'code', id: 'C1', reason: 'reconsider', severity: 'unrated' },
    { gate: 'code', id: 'O1', reason: 'open', severity: 'unrated' },
  ]);
  assert.deepEqual([...ledger.disclosed].sort(), ['A1', 'C1', 'O1', 'P1', 'U1']);
  assert.deepEqual(ledger.eligibleAffected, ['C1', 'O1']);
});

test('the output schema is built per request with finding-ID enums', () => {
  const ledger = findingLedger('code', history, [], reconsider);
  const output = reviewSchema(['code'], ['R1'], { code: ledger });
  const verdict = output.properties.verdicts.items.anyOf[0];
  assert.deepEqual(verdict.properties.dispositions.items.properties.id.enum, ['A1', 'C1', 'O1', 'P1', 'U1']);
  assert.deepEqual(verdict.properties.historyAssessment.anyOf[1].properties.affected.items.enum, ['C1', 'O1']);
  assert.deepEqual(verdict.properties.findings.items.properties.severity.enum, ['high', 'medium', 'low']);
  for (const key of ['severity', 'failureScenario', 'classId', 'classStatement']) assert.ok(verdict.properties.findings.items.required.includes(key));
  // Without history there is nothing to enumerate: plain strings remain.
  const fresh = reviewSchema(['code'], ['R1'], { code: findingLedger('code', [], [], []) }).properties.verdicts.items.anyOf[0];
  assert.equal(fresh.properties.dispositions.items.properties.id.enum, undefined);
});

test('a disclosed but not required affected ID is normalized, never rejected', () => {
  // A1 (non-blocking prior), U1 (only inside an UNAVAILABLE result) and P1 (peer gate).
  const result = validate(pass({ dispositions: [disposition('O1'), disposition('C1')],
    historyAssessment: { affected: ['C1', 'A1', 'U1', 'P1'], carryForwardReason: '' } }));
  assert.equal(result.outcome, 'PASS');
  assert.deepEqual(result.historyAssessment.affected, ['C1']);
  assert.deepEqual(result.normalized.map(row => [row.rule, row.id]),
    [['affected-not-required', 'A1'], ['affected-not-required', 'U1'], ['affected-not-required', 'P1']]);
  // Outside an assessed list (here a FAIL), even an undisclosed ID is only dropped.
  const failed = validate(pass({ outcome: 'FAIL', findings: [finding('F1')], historyAssessment: { affected: ['Z9'], carryForwardReason: '' } }));
  assert.deepEqual(failed.historyAssessment.affected, []);
  assert.deepEqual(failed.normalized.map(row => row.rule), ['affected-not-disclosed']);
  // In a PASS reconsidering closures, an ID disclosed nowhere stays a contract error.
  assert.throws(() => validate(pass({ dispositions: [disposition('O1'), disposition('C1')],
    historyAssessment: { affected: ['C1', 'Z9'], carryForwardReason: '' } })), /Z9 is not disclosed/);
  const review = pass({ gate: 'review', criteria: [{ id: 'R1', outcome: 'PASS', evidence: 'Checked.' }],
    dimensions: ['code', 'requirements', 'evidence', 'scope', 'findings'].map(name => ({ name, outcome: 'PASS', evidence: 'Checked.' })),
    dispositions: [disposition('Z9')] });
  assert.throws(() => validateVerdict(review, ['review'], candidate, null, history, [], []), /must name a finding disclosed/);
});

test('substantive contradictions remain contract errors', () => {
  const carried = { affected: [], carryForwardReason: 'C1 untouched.' };
  assert.throws(() => validate(pass({ dispositions: [disposition('O1', 'present')], historyAssessment: carried })), /PASS contradicts a present blocking finding/);
  assert.throws(() => validate(pass({ dispositions: [], historyAssessment: carried })), /Missing supported disposition for O1/);
});

test('a present historical finding now rated low takes a disposition that no longer blocks', () => {
  const result = validate(pass({ dispositions: [disposition('O1', 'present-low')], historyAssessment: { affected: [], carryForwardReason: 'C1 untouched.' } }));
  assert.equal(result.outcome, 'PASS');
  // The next round no longer treats it as open.
  const next = findingLedger('code', [...history, { reviewerResult: result }], [], []);
  assert.equal(next.prior.get('O1').open, false);
  assert.deepEqual(next.dispositionsRequired, []);
});

test('findings need severity, failure scenario and class; low never blocks', () => {
  for (const key of ['severity', 'failureScenario', 'classStatement', 'classId']) {
    const row = finding('N1'); delete row[key];
    assert.throws(() => validateVerdict(pass({ outcome: 'FAIL', findings: [row] }), ['code'], candidate, null, [], []), /severity|Finding/);
  }
  assert.throws(() => validateVerdict(pass({ outcome: 'FAIL', findings: [finding('N1', { severity: 'critical' })] }), ['code'], candidate, null, [], []), /severity/);
  const low = validateVerdict(pass({ findings: [finding('L1', { severity: 'low', blocking: true })] }), ['code'], candidate, null, [], []);
  assert.equal(low.outcome, 'PASS');
  assert.equal(low.findings[0].blocking, false);
  assert.equal(low.findings[0].severity, 'low');
  assert.deepEqual(low.normalized, [{ rule: 'low-never-blocks', field: 'findings.blocking', id: 'L1' }]);
  // Earlier-contract findings read as unrated and block exactly as recorded (AC11).
  assert.equal(findingBlocks(legacy('X')), true);
  assert.equal(findingBlocks(finding('Y', { severity: 'low' })), false);
});

test('format repair is judged by substance identity', () => {
  const original = pass({ outcome: 'FAIL', summary: 'One defect.', findings: [finding('F1')],
    criteria: [{ id: 'R1', outcome: 'FAIL', evidence: 'Defect in app.js' }],
    dispositions: [disposition('O1', 'present')], historyAssessment: { affected: ['O1', 'A1'], carryForwardReason: 'Others untouched.' } });
  const reworded = structuredClone(original);
  reworded.summary = 'One defect remains after the repair.';
  reworded.criteria[0].evidence = 'Defect in app/app.js, see F1';
  reworded.dispositions[0].evidence = 'Still present in app/app.js';
  reworded.historyAssessment = { affected: ['O1'], carryForwardReason: 'Remaining closures untouched.' };
  reworded.coverage.paths = ['app/app.js', 'app/other.js'];
  assert.doesNotThrow(() => validateFormatRepair(original, reworded, ['R1'], ['O1']));
  const changes = [
    value => { value.outcome = 'PASS'; },
    value => { value.findings[0].severity = 'medium'; },
    value => { value.findings[0].evidence = 'Different evidence'; },
    value => { value.criteria[0].outcome = 'PASS'; },
    value => { value.dispositions[0].status = 'resolved'; },
    value => { value.coverage.complete = false; },
    value => { value.historyAssessment.affected = []; },
    value => { value.findings = []; },
  ];
  for (const change of changes) {
    const changed = structuredClone(reworded); change(changed);
    assert.throws(() => validateFormatRepair(original, changed, ['R1'], ['O1']));
  }
  // A field the original omitted may be supplied by the repair.
  const omitted = structuredClone(original); delete omitted.findings[0].severity; delete omitted.findings[0].blocking;
  assert.doesNotThrow(() => validateFormatRepair(omitted, original, ['R1'], ['O1']));
});

test('paired reviewers rating one class differently resolve to the higher rating', () => {
  const member = (provider, severity) => ({ reviewer: { provider }, result: { findings: [finding(`${provider}/F`, { severity, classId: 'shared-class' })] } });
  const [row] = pairedSeverities([member('codex', 'low'), member('claude-code', 'medium')]);
  assert.equal(row.severity, 'medium');
  assert.equal(row.disagreement, true);
  assert.equal(pairedSeverities([member('codex', 'high'), member('claude-code', 'medium')])[0].severity, 'high');
});

test('every UNAVAILABLE cause maps to one reason code', () => {
  assert.equal(unavailableReason(Object.assign(new Error('x'), { invalidVerdictContract: true })), 'contract');
  assert.equal(unavailableReason(new ContractError('x')), 'contract');
  assert.equal(unavailableReason(Object.assign(new Error('x'), { providerFailure: { category: 'malformed-output' } })), 'malformed-json');
  assert.equal(unavailableReason(Object.assign(new Error('x'), { code: 'AGENT_PROVIDER_TIMEOUT' })), 'timeout');
  assert.equal(unavailableReason(Object.assign(new Error('x'), { providerFailure: { category: 'authentication' } })), 'provider-error');
  assert.equal(unavailableReason(new Error('disk full')), 'other');
  assert.deepEqual(UNAVAILABLE_REASONS, ['contract', 'malformed-json', 'provider-error', 'timeout', 'missing-evidence', 'other']);
});

// R3: every gate and rigor rejects a finding missing any of the four fields.
const brief = { criteria: ['brief'], requirements: { 'brief.md': {} }, repositories: candidate.repositories };
const dimensionRows = outcome => ['code', 'requirements', 'evidence', 'scope', 'findings'].map(name => ({ name, outcome, evidence: 'Checked.' }));
const gateVerdict = (gate, scope, findings, outcome = 'FAIL') => pass({ gate, outcome, findings,
  criteria: ['review', 'spec', 'judge'].includes(gate) ? scope.criteria.map(id => ({ id, outcome, evidence: 'Assessed.' })) : [],
  ...(gate === 'review' ? { dimensions: dimensionRows(outcome) } : {}) });
const forScope = (scope, row) => ({ ...row, criterion: scope.criteria[0] });
for (const [label, gate, scope] of [['code (full)', 'code', candidate], ['spec (full)', 'spec', candidate], ['judge (full)', 'judge', candidate],
  ['review (full)', 'review', candidate], ['review (light brief)', 'review', brief], ['code (light brief)', 'code', brief]]) {
  test(`${label} rejects a finding missing any severity, failure scenario or class field`, () => {
    const check = row => validateVerdict(gateVerdict(gate, scope, [row]), [gate], scope, null, [], []);
    assert.equal(check(forScope(scope, finding('N1'))).outcome, 'FAIL');
    for (const key of ['severity', 'failureScenario', 'classId', 'classStatement']) {
      const row = forScope(scope, finding('N1')); delete row[key];
      assert.throws(() => check(row), key === 'severity' ? /severity must be high, medium or low/ : new RegExp(`Finding ${key}`));
    }
  });
}

test('a FAIL resting only on low findings is PASS only when nothing else fails', () => {
  const rows = outcome => ({ criteria: [{ id: 'R1', outcome, evidence: 'Assessed.' }], dimensions: dimensionRows(outcome) });
  const check = (findings, fields = {}, scopeHistory = []) => validateVerdict({ ...gateVerdict('review', candidate, findings), ...rows('PASS'), ...fields },
    ['review'], candidate, null, scopeHistory, []);
  // Low findings marked blocking or not, with everything else passing: PASS.
  for (const blocking of [true, false]) {
    const result = check([finding('L1', { severity: 'low', blocking })]);
    assert.equal(result.outcome, 'PASS', `blocking ${blocking}`);
    assert.ok(result.normalized.some(row => row.rule === 'low-only-fail'));
  }
  // An independent failure is never erased (round 2, Codex).
  for (const fields of [rows('FAIL'), { dimensions: dimensionRows('PASS').map(row => row.name === 'evidence' ? { ...row, outcome: 'FAIL' } : row) },
    { dimensions: dimensionRows('PASS').map(row => row.name === 'evidence' ? { ...row, outcome: 'UNAVAILABLE' } : row) },
    { coverageDecisions: [{ id: 'claim-1', outcome: 'FAIL', evidence: 'Replacement does not cover it.' }] },
    { coverage: { complete: false, paths: [], interactions: [], limitations: ['Uncovered'] } },
    { mandateAssessment: { outcome: 'FAIL', evidence: 'Out of mandate.' } }]) {
    const result = check([finding('L1', { severity: 'low' })], fields);
    assert.equal(result.outcome, 'FAIL');
    assert.ok(!(result.normalized ?? []).some(row => row.rule === 'low-only-fail'));
  }
  assert.equal(check([finding('L1', { severity: 'low' }), finding('M1', { severity: 'medium' })]).outcome, 'FAIL');
  // A prior blocking finding kept present plus a new low one: the reviewer's
  // FAIL stands, valid and adjudicable, instead of a contract error (round 2, Claude).
  const prior = [{ reviewerResult: { gate: 'review', findings: [legacy('O1')], dispositions: [] } }];
  const kept = check([finding('L1', { severity: 'low' })], { dispositions: [disposition('O1', 'present')] }, prior);
  assert.equal(kept.outcome, 'FAIL');
  // A FAIL with no low and no blocking finding stays the reviewer's FAIL.
  assert.equal(check([finding('A1', { severity: 'medium', blocking: false })]).outcome, 'FAIL');
});

test('an unrelated low finding never makes an independent failure adjudicable', () => {
  const low = finding('codex/L1', { severity: 'low', blocking: false });
  const member = (provider, outcome, criterion) => ({ ref: { hash: provider }, reviewer: { provider }, materialFindings: [], unreconciledFindings: [],
    result: { outcome, findings: outcome === 'FAIL' ? [low] : [], coverage: { complete: true, limitations: [] }, dimensions: dimensionRows('PASS'),
      criteria: [{ id: 'R1', outcome: criterion, evidence: 'Assessed.' }], mandateAssessment: { outcome: 'PASS', evidence: 'In mandate.' }, coverageDecisions: [] } });
  // R1 fails independently of the low advisory (round 3, both reviewers).
  assert.throws(() => eligibleResidualRisk({ initialEstablished: true, members: [member('codex', 'FAIL', 'FAIL'), member('claude-code', 'PASS', 'PASS')] }),
    /unexplained failed assessment/);
  // The low-only shape never reaches adjudication: the validator records it as PASS.
  const recorded = validateVerdict({ ...gateVerdict('review', candidate, [finding('L1', { severity: 'low', blocking: false })]),
    criteria: [{ id: 'R1', outcome: 'PASS', evidence: 'Assessed.' }], dimensions: dimensionRows('PASS') }, ['review'], candidate, null, [], []);
  assert.equal(recorded.outcome, 'PASS');
});

test('a disposition cannot carry or change a severity', () => {
  const schemaFor = gate => reviewSchema([gate], ['R1']).properties.verdicts.items.anyOf[0];
  const verdict = { ...gateVerdict('code', candidate, [finding('F1')]), mandateAssessment: null, coverageDecisions: [] };
  assert.doesNotThrow(() => validateJsonSchema(schemaFor('code'), verdict, { label: 'code' }));
  for (const extra of [{ severity: 'low' }, { severity: 'high' }]) {
    assert.throws(() => validateJsonSchema(schemaFor('code'), { ...verdict, dispositions: [{ ...disposition('F1', 'present'), ...extra }] }, { label: 'code' }));
  }
});

test('planning reviews require the same finding fields; low never blocks', () => {
  const documents = { 'design.md': {} };
  const row = (id, fields = {}) => ({ id, document: 'requirements/design.md', evidence: `Evidence ${id}`, blocking: true, severity: 'high',
    failureScenario: `Trigger ${id} -> wrong plan`, classId: `class-${id}`, classStatement: `Class ${id}`, ...fields });
  const review = (findings, outcome = 'FAIL') => ({ outcome, summary: 'Planning assessment.', findings, mandateAssessment: null });
  assert.deepEqual(validatePlanningReview(review([row('P1')]), documents), []);
  for (const key of ['severity', 'failureScenario', 'classId', 'classStatement']) {
    const missing = row('P1'); delete missing[key];
    assert.throws(() => validatePlanningReview(review([missing]), documents), /Planning finding|severity/);
  }
  const low = review([row('L1', { severity: 'low' })]);
  assert.deepEqual(validatePlanningReview(low, documents).map(item => item.rule), ['low-never-blocks', 'low-only-fail']);
  assert.equal(low.outcome, 'PASS');
  assert.equal(low.findings[0].blocking, false);
  const quiet = review([row('L1', { severity: 'low', blocking: false })]);
  assert.deepEqual(validatePlanningReview(quiet, documents).map(item => item.rule), ['low-only-fail']);
  assert.equal(quiet.outcome, 'PASS');
  const mixed = review([row('L1', { severity: 'low' }), row('M1', { severity: 'medium' })]);
  validatePlanningReview(mixed, documents);
  assert.equal(mixed.outcome, 'FAIL');
});

// Issue #140: every touched rejection keeps its leading sentence and names the
// offending field path or finding/claim ID.
test('verdict rejections name the field path or finding ID', () => {
  const carried = { affected: [], carryForwardReason: 'C1 untouched.' };
  const cases = [
    [() => validate(pass({ dispositions: [disposition('C1'), disposition('O1', 'present')], historyAssessment: carried })),
      /PASS contradicts a present blocking finding: dispositions\[1\] \(O1\)/],
    [() => validate(pass({ dispositions: [disposition('C1')], historyAssessment: carried })),
      /Missing supported disposition for O1: a PASS needs a resolved, unsupported, unaffected or present-low disposition \(dispositions has no entry for it\)/],
    [() => validate(pass({ findings: [finding('F1', { path: 'app/missing.js', blocking: false })], dispositions: [disposition('O1'), disposition('C1')], historyAssessment: carried })),
      /Finding must name source in scope: findings\[0\]\.path \(F1\) names "app\/missing\.js"/],
    [() => validate(pass({ outcome: 'FAIL', findings: [finding('F1', { blocking: 'yes' })] })),
      /Finding must name source in scope: findings\[0\]\.blocking \(F1\) must be true or false/],
    [() => validate(pass({ outcome: 'FAIL', findings: [finding('F1'), finding('F2', { criterion: 'R7' })] })),
      /Blocking finding lacks approved criterion: findings\[1\]\.criterion \(F2\) is "R7"/],
    [() => validate(pass({ outcome: 'FAIL', findings: [finding('F1', { failureScenario: '' })] })),
      /Finding failureScenario must be nonempty text: findings\[0\]\.failureScenario \(F1\)/],
    [() => validate(pass({ dispositions: [disposition('O1'), disposition('C1')], historyAssessment: null })),
      /Reconsider affected closed findings and justify any carried closures: historyAssessment\.affected must list the affected IDs among C1/],
  ];
  for (const [run, message] of cases) assert.throws(run, message);
  const review = pass({ gate: 'review', criteria: [{ id: 'R1', outcome: 'PASS', evidence: 'Checked.' }], dimensions: dimensionRows('PASS'),
    dispositions: [disposition('Z9')] });
  assert.throws(() => validateVerdict(review, ['review'], candidate, null, history, [], []),
    /A review disposition must name a finding disclosed in supplied history, claims or current findings: dispositions\[0\] \(Z9\)/);
});
test('a claimed finding without a supported disposition says what the claim needs', () => {
  const claims = [{ findingId: 'A1', claim: 'Left unchanged on purpose: a product decision.' }];
  const verdict = pass({ dispositions: [disposition('O1'), disposition('C1'), disposition('A1', 'present')], historyAssessment: { affected: [], carryForwardReason: 'C1 untouched.' } });
  assert.throws(() => validateVerdict(verdict, ['code'], candidate, null, history, claims, reconsider),
    /Missing supported disposition for A1: your claim about A1 needs a resolved, unsupported, unaffected or present-low disposition \(dispositions\[2\] has status present\)/);
});
test('format repair rejections name the changed field or ID', () => {
  const original = pass({ outcome: 'FAIL', summary: 'One defect.', findings: [finding('F1')],
    criteria: [{ id: 'R1', outcome: 'FAIL', evidence: 'Defect' }], dispositions: [disposition('O1', 'present')],
    dimensions: dimensionRows('FAIL'), coverageDecisions: [{ id: 'K1', outcome: 'PASS', evidence: 'Covered.' }] });
  const cases = [
    [value => { value.outcome = 'PASS'; }, /Verdict changes require substantive reassessment, not format repair: gate\/outcome changed from code\/FAIL to code\/PASS/],
    [value => { value.mandateAssessment = { outcome: 'PASS', evidence: 'x' }; }, /Format repair must preserve mandate assessment: mandateAssessment changed/],
    [value => { value.findings = []; }, /Format repair must preserve all original findings: findings has 0 entries; the original had 1/],
    [value => { value.findings[0].severity = 'medium'; }, /Format repair must preserve finding identity, severity and evidence: findings\[0\] \(F1\)/],
    [value => { value.findings[0].id = 'F9'; }, /Format repair must preserve finding identity, severity and evidence: original findings\[0\] \(F1\) is missing/],
    [value => { value.findings[0].criterion = 'gate:code'; }, /Valid finding criterion cannot be reassigned by format repair: findings\[0\]\.criterion \(F1\) must stay R1/],
    [value => { value.criteria = []; }, /Format repair must retain every criterion assessment: criteria has 0 entries; the original had 1/],
    [value => { value.criteria[0].outcome = 'PASS'; }, /Format repair must preserve criterion outcomes and evidence: criteria\[0\] \(R1\) must keep outcome FAIL/],
    [value => { value.criteria[0].id = 'R2'; }, /Valid criterion cannot be reassigned by format repair: criteria\[0\]\.id must stay R1/],
    [value => { value.coverage.complete = false; }, /Substantive assessment changes are not format repair: coverage\.complete or coverage\.limitations changed/],
    [value => { value.dispositions[0].status = 'resolved'; }, /Substantive assessment changes are not format repair: dispositions changed for O1/],
    [value => { value.coverageDecisions[0].outcome = 'FAIL'; }, /Substantive assessment changes are not format repair: coverageDecisions changed for K1/],
    [value => { value.dimensions[0].outcome = 'PASS'; }, /Substantive assessment changes are not format repair: dimensions changed for code/],
  ];
  for (const [change, message] of cases) {
    const changed = structuredClone(original); change(changed);
    assert.throws(() => validateFormatRepair(original, changed, ['R1'], []), message);
  }
  const affected = pass({ outcome: 'FAIL', findings: [finding('F1')], historyAssessment: { affected: ['O1'], carryForwardReason: '' } });
  assert.throws(() => validateFormatRepair(affected, { ...structuredClone(affected), historyAssessment: { affected: [], carryForwardReason: '' } }, ['R1'], ['O1']),
    /Substantive assessment changes are not format repair: historyAssessment\.affected changed/);
});
test('a claimed blocking finding marked present on PASS uses the claim wording', () => {
  const claims = [{ findingId: 'O1', claim: 'Fixed in this revision.' }];
  const verdict = pass({ dispositions: [disposition('O1', 'present'), disposition('C1')], historyAssessment: { affected: [], carryForwardReason: 'C1 untouched.' } });
  assert.throws(() => validateVerdict(verdict, ['code'], candidate, null, history, claims, reconsider),
    /PASS contradicts a present blocking finding: dispositions\[0\] \(O1\) marks a blocking finding present; your claim about O1 needs a resolved, unsupported, unaffected or present-low disposition/);
});
