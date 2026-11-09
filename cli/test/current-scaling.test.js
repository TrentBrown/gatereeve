import assert from 'node:assert/strict';
import test from 'node:test';
import { shapeHistory, fitHistory, HISTORY_PRIORITY, HISTORY_TIERS } from '../../plugin-src/shared/resources/protocol/current/review-history.js';

// Review history: the shape of MyLifeMap's failing run is many 7-11 KB prior
// reports across slices and failed rounds; together they exceed the limit.
function report(index, { gate = 'code', open = false } = {}) {
  const prose = `Evidence prose for round ${index}. `.repeat(220);
  return { reference: { hash: `sha256:${index.toString(16).padStart(64, '0')}`, bytes: 10000 }, reviewerResult: {
    gate, outcome: open ? 'FAIL' : 'PASS', summary: prose, mode: 'full',
    coverage: { complete: true, paths: Array.from({ length: 40 }, (_, i) => `app/src/module${i}.js`), interactions: [prose.slice(0, 500)], limitations: [] },
    criteria: [{ id: 'R1', outcome: open ? 'FAIL' : 'PASS', evidence: prose.slice(0, 1500) }],
    findings: open ? [{ id: `finding-${index}`, classId: 'class', criterion: 'gate:code', path: 'app/src/shared.js', evidence: 'Current defect in shared module', blocking: true }] : [],
    dispositions: [{ id: `finding-${index - 1}`, status: 'resolved', evidence: prose.slice(0, 800) }], historyAssessment: null } };
}
test('review history shaping stays bounded for any number of rounds and keeps open findings inline', () => {
  for (const rounds of [10, 49, 200, 2000]) {
    const history = Array.from({ length: rounds }, (_, i) => report(i, { open: i === 0 }));
    assert.ok(rounds < 100 || JSON.stringify(history.map(item => item.reviewerResult)).length > 512 * 1024, 'full inlining would exceed the provider limit');
    const priorities = new Map([[history[0].reference.hash, HISTORY_PRIORITY.open]]);
    const shaped = shapeHistory(history, priorities, HISTORY_TIERS[0]);
    const size = JSON.stringify(shaped).length;
    assert.ok(size <= HISTORY_TIERS[0].inline + HISTORY_TIERS[0].references + 8192, `history for ${rounds} rounds is ${size} characters`);
    assert.equal(shaped.summary.total, rounds);
    assert.equal(shaped.summary.inline + shaped.summary.references + shaped.summary.indexOnly, rounds, 'every entry is accounted for');
    assert.equal(shaped.entries[0].reference.hash, history[0].reference.hash);
    assert.ok(shaped.entries[0].findings.length === 1 && shaped.entries[0].inline === undefined, 'the oldest open finding stays inline');
    assert.deepEqual(shapeHistory(history, priorities, HISTORY_TIERS[0]), shaped, 'shaping is deterministic');
    const fitted = fitHistory(history, priorities, value => 400 * 1024 + JSON.stringify(value).length, 512 * 1024);
    assert.ok(fitted.fits, `a 400 KB remainder still fits with ${rounds} rounds`);
  }
});
