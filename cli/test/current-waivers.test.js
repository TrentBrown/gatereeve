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
  // Round 5 edge cases: a blank line inside an indented code block, and an
  // indent of spaces plus a tab (four columns), are code too.
  const block = '# Brief\n\n## Goal\nExport 42.\n\n## Scope\n- app.js\n\n    x  =  1\n\n    y  =  2\n  \tz  =  3\n\n## Findings log\n- none\n';
  const blockScope = briefScope(Buffer.from(block));
  assert.notEqual(briefScope(Buffer.from(block.replace('    x  =  1\n\n', '    x  =  1\n'))), blockScope, 'blank line inside indented code');
  assert.notEqual(briefScope(Buffer.from(block.replace('  \tz  =  3', '  \tz = 3'))), blockScope, 'spaces-plus-tab indent');
  assert.equal(briefScope(Buffer.from(block.replace('- app.js\n\n', '- app.js\n\n\n'))), blockScope, 'a run of blank lines counts as one');
  // Removing the blank line before an indented block turns the code into paragraph text.
  const separated = '# Brief\n\n## Goal\nExport 42.\n\n## Scope\nRun:\n\n    rm -rf cache\n\n## Findings log\n- none\n';
  assert.notEqual(briefScope(Buffer.from(separated.replace('Run:\n\n', 'Run:\n'))), briefScope(Buffer.from(separated)), 'a block-separating blank line counts');
  assert.equal(briefScope(Buffer.from(`${separated}\n\n`)), briefScope(Buffer.from(separated)), 'trailing blank lines are ignored');
  // Line content can never collide with the comparison's own structure.
  assert.notEqual(briefScope(Buffer.from(brief.replace('Export 42.', `${String.fromCharCode(0)}Export 42.`))), same, 'a NUL in prose is content');
  assert.equal(briefScope(Buffer.from(brief.replace('Export 42.', 'Export   42.  '))), same, 'inner and trailing whitespace');
  assert.equal(briefScope(Buffer.from(brief.replace('Export 42.\n\n', 'Export 42.\n\n\n'))), same, 'extra blank lines between blocks');
});

test('brief comparison keeps raw HTML <pre> content and hard line breaks (#157)', () => {
  const scope = body => briefScope(Buffer.from(`# Brief\n\n## Goal\nExport 42.\n\n## Scope\n${body}\n\n## Findings log\n- none\n`));
  const pre = '- app.js\n\n<pre>\na  b\n\nc   d\n</pre>\n\nAfter  the block.';
  const same = scope(pre);
  assert.notEqual(scope(pre.replace('a  b', 'a b')), same, 'spaces inside a <pre> block are content');
  assert.notEqual(scope(pre.replace('a  b\n\nc', 'a  b\nc')), same, 'blank lines inside a <pre> block are content');
  assert.notEqual(scope(pre.replace('a  b', 'a  b  ')), same, 'trailing spaces inside a <pre> block are content');
  assert.equal(scope(pre.replace('After  the', 'After the')), same, 'prose after the closing tag collapses again');
  for (const tag of ['PRE class="x"', 'textarea', 'script', 'style']) {
    const name = tag.split(' ')[0];
    const block = `<${tag}>\nx  =  1\n</${name.toLowerCase()}>`;
    assert.notEqual(scope(block.replace('x  =  1', 'x = 1')), scope(block), `<${tag}> content`);
  }
  const inline = 'Keep <pre>a  b</pre> as is, then  prose.';
  assert.notEqual(scope(inline.replace('a  b', 'a b')), scope(inline), 'an inline <pre> fails closed');
  const unclosed = '<pre>\na  b\n\nNo  close.';
  assert.notEqual(scope(unclosed.replace('No  close', 'No close')), scope(unclosed), 'an unclosed <pre> runs to the end');
  const shown = 'Mention `<pre>` here.\n\nThen  prose.';
  assert.equal(scope(shown.replace('Then  prose', 'Then prose')), scope(shown), 'a tag inside an inline code span is not markup');
  assert.equal(scope('<preview>\na  b'), scope('<preview>\na b'), 'only the exact tag names open raw content');
  // An unclosed <pre> in the findings log never moves where the log ends.
  // Raw content is tracked over the scope-bearing lines only: a findings-log
  // entry neither changes how a later section compares nor moves where the log ends.
  const withLog = (log, notes) => briefScope(Buffer.from(`# Brief\n\n## Goal\nExport 42.\n\n## Scope\n- app.js\n\n## Findings log\n${log}\n\n## Notes\n${notes}\n`));
  assert.equal(withLog('- <pre>', 'Keep the name.'), withLog('- none', 'Keep  the name.'), 'a findings-log <pre> leaves later sections as prose');
  assert.notEqual(withLog('- <pre>', 'Drop the name.'), withLog('- <pre>', 'Keep the name.'), 'a section after the log still counts');
  // Indented code shows a tag; it opens nothing (review round 1).
  const shownIndented = 'Example:\n\n    <pre>\n\nAfter  prose.';
  assert.equal(scope(shownIndented.replace('After  prose', 'After prose')), scope(shownIndented), 'a tag inside indented code is not markup');
  const indentedClose = '<pre>\na  b\n    </pre>\n\nAfter  prose.';
  assert.equal(scope(indentedClose.replace('After  prose', 'After prose')), scope(indentedClose), 'an indented line still closes an open tag');
  // Review round 2: a fenced line still closes an open tag, and a tag inside
  // an HTML comment opens nothing.
  const fencedClose = '<pre>\n```\n</pre>\n```\n\nAfter  prose.';
  assert.equal(scope(fencedClose.replace('After  prose', 'After prose')), scope(fencedClose), 'a fenced line closes an open tag');
  const fencedOpen = '```\n<pre>\n```\n\nAfter  prose.';
  assert.equal(scope(fencedOpen.replace('After  prose', 'After prose')), scope(fencedOpen), 'a tag inside fenced code opens nothing');
  for (const comment of ['<!-- <pre> -->\n\nAfter  prose.', '<!--\n<pre>\n-->\n\nAfter  prose.']) {
    assert.equal(scope(comment.replace('After  prose', 'After prose')), scope(comment), `a tag inside a comment: ${JSON.stringify(comment)}`);
  }
  const afterComment = '<!-- note --> <pre>\na  b\n</pre>';
  assert.notEqual(scope(afterComment.replace('a  b', 'a b')), scope(afterComment), 'a tag after a closed comment still opens');
  // A case-fold that changes string length never misplaces a close and reopen.
  const folded = '<pre>\n\u0130</pre><pre>\na  b\n</pre>';
  assert.notEqual(scope(folded.replace('a  b', 'a b')), scope(folded), 'a reopen after a length-changing character');

  const lines = 'Line one\nLine two';
  const broken = scope('Line one  \nLine two');
  assert.notEqual(broken, scope(lines), 'adding a hard break changes the scope');
  assert.equal(scope('Line one   \nLine two'), broken, 'the number of trailing spaces does not matter');
  assert.equal(scope('Line one  \n\nLine two'), scope('Line one\n\nLine two'), 'trailing spaces before a blank line are not a break');
  assert.equal(scope('Line one  \n## Later\nx'), scope('Line one\n## Later\nx'), 'trailing spaces before a heading are not a break');
  assert.equal(scope('Line one  '), scope('Line one'), 'trailing spaces at the end of the scope are not a break');
  assert.notEqual(scope('Line one  \n    more'), scope('Line one\n    more'), 'a break before an indented continuation counts');
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
