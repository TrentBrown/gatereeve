import './helpers/private-scratch.js';
// Review machinery fixes approved by Trent 2026-11-17 (S8): history-assessment
// validation of a PASS with reconsidered closures.
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateVerdict } from '../../plugin-src/shared/resources/protocol/current/execution.js';

const candidate = { criteria: ['R1'], repositories: [{ alias: 'app', files: [{ path: 'app.js' }], baseFiles: [{ path: 'app.js' }], targetFiles: [] }] };
const finding = (id, blocking = true) => ({ id, classId: `class-${id}`, criterion: 'R1', path: 'app/app.js', evidence: `Evidence for ${id}`, blocking });
const disposition = (id, status = 'resolved') => ({ id, status, evidence: `Disposition evidence for ${id}` });
// Prior code-gate history: C1 and C2 were closed (resolved), O1 is still open,
// K1 was closed but the implementer claims a further fix to it.
const history = [
  { reviewerResult: { gate: 'code', findings: [finding('C1'), finding('C2'), finding('K1')], dispositions: [] } },
  { reviewerResult: { gate: 'code', findings: [finding('O1')], dispositions: [disposition('C1'), disposition('C2'), disposition('K1')] } },
];
const claims = [{ findingId: 'K1', claim: 'Fixed again in app.js' }];
const reconsider = [{ gate: 'code', id: 'C1' }, { gate: 'code', id: 'C2' }];
const verdict = (historyAssessment, dispositions = [disposition('C1'), disposition('O1'), disposition('K1')]) => ({
  gate: 'code', outcome: 'PASS', summary: 'No blocking defects remain.', criteria: [],
  coverage: { complete: true, paths: ['app/app.js'], interactions: ['app/app.js'], limitations: [] },
  findings: [], dispositions, historyAssessment,
});
const validate = value => validateVerdict(value, ['code'], candidate, null, history, claims, reconsider);

test('a PASS whose affected list includes an open prior finding and a claimed fix is accepted', () => {
  assert.doesNotThrow(() => validate(verdict({ affected: ['C1', 'O1', 'K1'], carryForwardReason: 'C2 is untouched by the change.' })));
  // Listing only the already-required IDs still needs the carry-forward reason for the reconsidered closures.
  assert.doesNotThrow(() => validate(verdict({ affected: ['O1'], carryForwardReason: 'C1 and C2 are untouched by the change.' }), [disposition('O1'), disposition('K1')]));
});

test('unknown or duplicate affected IDs are still rejected', () => {
  assert.throws(() => validate(verdict({ affected: ['C1', 'X9'], carryForwardReason: 'C2 is untouched.' })), /Reconsider affected closed findings/);
  assert.throws(() => validate(verdict({ affected: ['C1', 'C1'], carryForwardReason: 'C2 is untouched.' })), /Reconsider affected closed findings/);
  assert.throws(() => validate(verdict(undefined)), /Reconsider affected closed findings/);
});

test('carried closures still need a reason, and every required ID a supported disposition', () => {
  assert.throws(() => validate(verdict({ affected: ['C1', 'O1'] })), /Unaffected closure applicability justification/);
  // Every reconsidered closure affected: no reason needed.
  assert.doesNotThrow(() => validate(verdict({ affected: ['C1', 'C2', 'O1'] }, [disposition('C1'), disposition('C2', 'unaffected'), disposition('O1'), disposition('K1')])));
  // An affected closure without a disposition, or a missing claimed-fix disposition, is rejected.
  assert.throws(() => validate(verdict({ affected: ['C1', 'O1'], carryForwardReason: 'C2 untouched.' }, [disposition('O1'), disposition('K1')])), /Missing supported disposition for C1/);
  assert.throws(() => validate(verdict({ affected: ['C1', 'O1'], carryForwardReason: 'C2 untouched.' }, [disposition('C1'), disposition('O1')])), /Missing supported disposition for K1/);
  // An open finding is never carried as unaffected.
  assert.throws(() => validate(verdict({ affected: ['C1', 'O1'], carryForwardReason: 'C2 untouched.' }, [disposition('C1'), disposition('O1', 'unaffected'), disposition('K1')])), /Open finding O1 cannot be carried as unaffected/);
});

test('review requires an explicit alias when a relative finding path has multiple owners', () => {
  const candidateWithOverlap = { ...candidate, repositories: [
    ...candidate.repositories,
    { ...candidate.repositories[0], alias: 'other' },
    { alias: 'requirements', files: [], baseFiles: [], targetFiles: [] },
  ] };
  const review = {
    ...verdict(null, []), gate: 'review', outcome: 'FAIL',
    criteria: [{ id: 'R1', outcome: 'FAIL', evidence: 'Source defect.' }],
    dimensions: ['code', 'requirements', 'evidence', 'scope', 'findings']
      .map(name => ({ name, outcome: 'FAIL', evidence: 'Source defect.' })),
  };
  const checkPath = (path, scope = candidateWithOverlap) => validateVerdict({
    ...review, findings: [{ ...finding('F1'), path }],
  }, ['review'], scope, null, [], []);

  assert.throws(() => checkPath('app.js'), /Finding must name source in scope/);
  assert.throws(() => checkPath('spec.md'), /Finding must name source in scope/);
  assert.throws(() => checkPath('missing/app.js'), /Finding must name source in scope/);
  const recovered = checkPath('app.js', candidate);
  assert.equal(recovered.outcome, 'FAIL');
  assert.deepEqual(recovered.findings, [finding('F1')]);
  assert.equal(checkPath('other/app.js').findings[0].path, 'other/app.js');
  assert.equal(checkPath('requirements/spec.md').findings[0].path, 'requirements/spec.md');
});
