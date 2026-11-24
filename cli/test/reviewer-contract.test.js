import './helpers/private-scratch.js';
// PR B1 (spec AC3, AC5; D32, D33): reviewer verdicts separate substance from
// bookkeeping, findings carry severity, low never blocks, format repair is
// judged by substance identity, and every UNAVAILABLE carries a reason code.
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateVerdict, validateFormatRepair, findingLedger, reviewSchema, unavailableReason, UNAVAILABLE_REASONS, findingBlocks }
  from '../../plugin-src/shared/resources/protocol/current/execution.js';
import { pairedSeverities } from '../../plugin-src/shared/resources/protocol/current/boundary-review.js';
import { ContractError } from '../../plugin-src/shared/resources/protocol/errors.js';

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
  // An ID disclosed nowhere stays a contract error.
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
