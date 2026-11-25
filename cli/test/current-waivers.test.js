import './helpers/private-scratch.js';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isolatedTests } from './helpers/isolated-tests.js';
import { fixture, candidate, branchWith, human, BRIEF, authorizeBrief, openPr } from './helpers/lightweight-fixture.js';
import { allowedRunOutcome, passingGate } from '../../plugin-src/shared/resources/protocol/current/autonomous.js';
import { briefScope } from '../../plugin-src/shared/resources/protocol/current/delegation.js';
import { decisionHas } from '../../plugin-src/shared/resources/protocol/current/contracts.js';
import { selection, pairedAdapters } from './helpers/paired-review-fixture.js';

const test = isolatedTests(import.meta.url, { shards: 2 });

const check = (id, purpose) => ({ repository: 'app', command: process.execPath, args: ['-e', `process.exit(0); // ${id}`], purpose });
const verify = (f, checks, operationId) => f.request('gate.execute', { gates: ['verification'], configuration: {
  validation: { kind: 'alternative', reason: 'Fixture has no hosted CI', scope: 'The approved criterion' }, checks } }, operationId);

// GitHub issue #145 item 1: after a docs-only push the repository's CI reuses an
// earlier full run and skips its browser/integration checks, one reviewer is
// UNAVAILABLE, and the human explicitly waives review and verification.
async function reusedCoverageWithUnavailableReviewer(t, rigor, { unavailable = 'claude-code', setup = null } = {}) {
  const f = await fixture(t, { rigor });
  if (setup) await setup(f);
  await writeFile(join(f.home, 'scratchpad.md'), '# No pending decisions\n');
  const first = await branchWith(f, 'topic', 'export const answer = 42;\n');
  await candidate(f, 'SLICE', first, 'candidate-first');
  await f.request('candidate.ready', {}, 'ready-first');
  await verify(f, [check('unit', 'Unit tests'), check('browser', 'Browser tests')], 'verify-full');
  const second = await branchWith(f, 'topic', { 'app.js': 'export const answer = 42;\n', 'README.md': 'Docs only.\n' });
  await candidate(f, 'SLICE', second, 'candidate-second');
  await f.request('candidate.ready', {}, 'ready-second');
  const reused = await verify(f, [check('unit', 'Unit tests')], 'verify-reused');
  await f.request('review.select', selection(), 'select');
  pairedAdapters(f, { unavailable });
  await f.request('review.execute', { consumed: reused.event.payload.results }, 'review');
  await f.request('gate.execute', { gates: ['context'] }, 'context');
  await f.request('gate.execute', { gates: ['packet'] }, 'packet');
  return f;
}

for (const rigor of ['light', 'full']) test(`${rigor}: an explicit human waiver of review and verification gets past reused CI coverage with an UNAVAILABLE reviewer`, async t => {
  const f = await reusedCoverageWithUnavailableReviewer(t, rigor);
  const before = await f.request('milestone.check', { name: 'acceptance' });
  assert.equal(before.allowed, false);
  assert.match(before.missing.join('; '), /uncovered prior behavior/);
  const subject = (await f.core.state()).state.candidate.hash;
  const decision = await f.request('human.decide', { kind: 'waive', actions: ['accept'], gates: ['review', 'verification'], subject,
    authority: { ...human, instruction: 'Waive the review and verification gates for this PR and accept it.' },
    reason: 'Docs-only push; CI reused the earlier full run and one reviewer was unavailable', consequences: 'Browser checks did not run on this head; one review is missing' }, 'waive-accept');
  assert.ok(decision.event);
  const after = await f.request('milestone.check', { name: 'acceptance' });
  assert.equal(after.allowed, true, after.missing.join('; '));
  const review = after.outcomes.find(item => item.id === 'review');
  const verification = after.outcomes.find(item => item.id === 'verification');
  // The record stays honest: the waived facts are preserved, not rewritten.
  assert.equal(review.outcome, 'UNAVAILABLE');
  assert.ok(review.exception);
  assert.equal(verification.outcome, 'PASS');
  assert.ok(verification.exception);
  assert.equal(verification.waivedCoverage.length, 1);
  assert.match(verification.waivedCoverage[0], /uncovered prior behavior/);
  // The decision retains what the human waived, as observed when they decided.
  const recorded = (await f.core.state()).state.decisions.find(item => item.kind === 'waive');
  assert.equal(recorded.observed.review.outcome, 'UNAVAILABLE');
  assert.equal(recorded.observed.verification.outcome, 'PASS');
  assert.match(recorded.observed.verification.waivedCoverage[0], /uncovered prior behavior/);
  const passed = await f.request('milestone.pass', { name: 'acceptance' }, 'acceptance');
  const milestone = passed.event.payload.outcomes;
  assert.equal(milestone.find(item => item.id === 'review').outcome, 'UNAVAILABLE');
  assert.match(milestone.find(item => item.id === 'verification').waivedCoverage[0], /uncovered prior behavior/);
  // The PR explainer a human reads shows the waived residual, not a bare PASS.
  if (rigor === 'light') {
    const head = (await f.core.store.json((await f.core.state()).state.candidate)).repositories[0].head;
    openPr(f, 'topic', f.integration, head);
    const published = await f.request('review.publish', { repository: 'app', number: 12 }, 'publish');
    const explainer = await readFile(published.handoff.path, 'utf8');
    assert.match(explainer, /waived by human decision: Verification has uncovered prior behavior/);
  }
});

test('a waived verification residual is not a passing gate for standing, delegated or autonomous authority', () => {
  const state = { dials: { autonomy: { value: 'delegated' } } };
  const waived = { id: 'verification', outcome: 'PASS', waivedCoverage: ['Verification has uncovered prior behavior'] };
  assert.equal(allowedRunOutcome(state, { id: 'verification', outcome: 'PASS' }), true);
  assert.equal(allowedRunOutcome(state, waived), false);
  assert.equal(passingGate(waived), false);
});

test('standing application refuses a verification PASS whose coverage a human waived without accepting', async t => {
  let grant;
  const f = await reusedCoverageWithUnavailableReviewer(t, 'light', { unavailable: null, setup: async g => {
    grant = await g.request('human.decide', { kind: 'authorize-standing', subject: (await g.core.commitments()).subject,
      scope: { actions: ['accept'], candidateScopes: ['SLICE'], repositories: [{ alias: 'app', headPrefix: 'topic', baseBranch: g.integration }], expiresAt: null },
      authority: { ...human, instruction: 'Accept slices of this feature when all gates pass; do not merge.' }, reason: 'Unattended acceptance', consequences: 'Acceptance only' }, 'standing-grant');
  } });
  const subject = (await f.core.state()).state.candidate.hash;
  await f.request('human.decide', { kind: 'waive', gates: ['verification'], subject, authority: { ...human, instruction: 'Waive verification for this PR.' },
    reason: 'CI reused the earlier full run', consequences: 'Browser checks did not run on this head' }, 'waive-verification');
  const check = await f.request('milestone.check', { name: 'acceptance' });
  assert.equal(check.allowed, true, check.missing.join('; '));
  assert.ok(check.outcomes.find(item => item.id === 'verification').waivedCoverage.length);
  await assert.rejects(f.request('authorization.apply', { grant: grant.event.hash }, 'apply'), /current PASS evidence for every required gate/);
  assert.ok(!(await f.core.state()).state.decisions.some(item => item.kind === 'accept'));
});

test('brief comparison follows Markdown whitespace: indentation and code count, prose whitespace does not', () => {
  const brief = '# Brief\n\n## Goal\nExport 42.\n\n## Scope\n- app.js\n  - keep the name\nUse `a  b` exactly.\n\n```js\nconst v = "a  b";\n\n```\n\n## Findings log\n- none\n';
  const same = briefScope(Buffer.from(brief));
  assert.notEqual(briefScope(Buffer.from(brief.replace('  - keep the name', '- keep the name'))), same, 'promoting a nested bullet is a scope change');
  assert.notEqual(briefScope(Buffer.from(brief.replace('"a  b"', '"a b"'))), same, 'whitespace inside fenced code is content');
  assert.notEqual(briefScope(Buffer.from(brief.replace('\n\n```\n\n##', '\n```\n\n##'))), same, 'blank lines inside fenced code are content');
  assert.notEqual(briefScope(Buffer.from(brief.replace('`a  b`', '`a b`'))), same, 'whitespace inside an inline code span is content');
  assert.equal(briefScope(Buffer.from(brief.replace('- none', '- none\n- Found: more'))), same, 'findings log growth');
  const indented = '# Brief\n\n## Goal\nExport 42.\n\n## Scope\n- app.js\n\n      ```\n      x  =  1\n      ```\n\n    y  =  2\n\n## Findings log\n- none\n';
  for (const [from, to] of [['x  =  1', 'x = 1'], ['y  =  2', 'y = 2']]) assert.notEqual(briefScope(Buffer.from(indented.replace(from, to))), briefScope(Buffer.from(indented)), `indented code: ${from}`);
  assert.equal(briefScope(Buffer.from(brief.replace('Export 42.', 'Export   42.  '))), same, 'inner and trailing whitespace');
  assert.equal(briefScope(Buffer.from(brief.replace('## Scope\n', '## Scope\n\n'))), same, 'blank lines');
});

test('without a verification waiver the uncovered coverage still blocks, and the refusal names it', async t => {
  const f = await reusedCoverageWithUnavailableReviewer(t, 'light');
  const subject = (await f.core.state()).state.candidate.hash;
  await assert.rejects(f.request('human.decide', { kind: 'waive', actions: ['accept'], gates: ['review'], subject,
    authority: { ...human, instruction: 'Waive the review gate for this PR and accept it.' }, reason: 'One reviewer unavailable', consequences: 'One review is missing' }, 'waive-review-only'),
    /Required review proof is missing: .*uncovered prior behavior/);
  const check = await f.request('milestone.check', { name: 'acceptance' });
  assert.equal(check.allowed, false);
  assert.match(check.missing.join('; '), /uncovered prior behavior/);
  assert.equal(check.outcomes.find(item => item.id === 'verification').waivedCoverage, undefined);
});

// GitHub issue #145 item 2: the findings log of a supervised light brief grows
// without a new authorize-implementation; any other brief change still needs one.
test('light: a findings-log append keeps implementation authority; a scope edit does not', async t => {
  const f = await fixture(t, { rigor: 'light' });
  const authorized = (await f.core.commitments()).subject;
  const head = await branchWith(f, 'topic', 'export const answer = 42;\n');
  await writeFile(join(f.home, 'brief.md'), BRIEF.replace('- none yet\n', '- none yet\n- Reviewer noted the constant is unexported; fixed in app.js.\n'));
  assert.equal((await f.core.commitments()).subject, authorized);
  const implementation = await f.request('milestone.check', { name: 'implementation' });
  assert.equal(implementation.allowed, true, implementation.missing.join('; '));
  await candidate(f, 'SLICE', head, 'candidate-after-log');
  const pinned = await f.core.store.json((await f.core.state()).state.candidate);
  assert.match((await f.core.store.get(pinned.requirements['brief.md'])).toString(), /Reviewer noted/, 'the candidate pins the brief as logged');
  assert.equal((await f.core.state()).state.decisions.filter(item => decisionHas(item, 'authorize-implementation')).length, 1);
  // A nested sub-heading inside the findings log is still the log.
  await writeFile(join(f.home, 'brief.md'), `${await readFile(join(f.home, 'brief.md'), 'utf8')}\n### Round 2\n- Nothing new.\n`);
  assert.equal((await f.core.commitments()).subject, authorized);
  // Outside the findings log: goal or scope changes need a new authorization.
  await writeFile(join(f.home, 'brief.md'), (await readFile(join(f.home, 'brief.md'), 'utf8')).replace('app.js only.', 'app.js and the CLI.'));
  const changed = (await f.core.commitments()).subject;
  assert.notEqual(changed, authorized);
  const blocked = await f.request('milestone.check', { name: 'implementation' });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.missing.join('; '), /current implementation authorization/);
  await assert.rejects(candidate(f, 'SLICE', head, 'candidate-after-scope'), /implementation authority/);
  // Restoring the scope restores the authorized subject; the log stays grown.
  await writeFile(join(f.home, 'brief.md'), (await readFile(join(f.home, 'brief.md'), 'utf8')).replace('app.js and the CLI.', 'app.js only.'));
  assert.equal((await f.core.commitments()).subject, authorized);
});

test('light: re-indenting a scope list outside the findings log needs a new authorization', async t => {
  const f = await fixture(t, { rigor: 'light', authorize: false });
  const nested = BRIEF.replace('app.js only.', '- app.js only.\n  - keep the export name.');
  await writeFile(join(f.home, 'brief.md'), nested);
  await authorizeBrief(f);
  const authorized = (await f.core.commitments()).subject;
  await writeFile(join(f.home, 'brief.md'), nested.replace('  - keep the export name.', '- keep the export name.'));
  assert.notEqual((await f.core.commitments()).subject, authorized);
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, false);
});
