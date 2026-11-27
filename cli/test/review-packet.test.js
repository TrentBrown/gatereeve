import './helpers/private-scratch.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  afterMergeCriteria, incorporatedDocuments, incorporatesDefinitionOfDone, linkedPath, markdownLinks,
  DEFINITION_OF_DONE_URL, DEFINITION_OF_DONE_VIEW_PATH, MAX_INCORPORATED_DOCUMENTS,
} from '../../plugin-src/shared/resources/protocol/current/review-packet.js';
import { planningFacts } from '../../plugin-src/shared/resources/protocol/current/planning.js';
import { authorizeFull, candidate, evaluator, fixture, reviewConfig, SPEC } from './helpers/lightweight-fixture.js';

const resources = new URL('../../plugin-src/shared/resources/', import.meta.url);
const rubric = rows => `# Spec\n\n## Acceptance Criteria\n\n- **AC1.** Export the constant answer with value 42.\n\n## Rubric\n\n| # | Criterion | Pass | Fail | Evidence |\n|---|---|---|---|---|\n${rows}\n## Changes\n`;

// A full-rigor run whose spec is `spec`, with feature-home `files`, ready
// for an individual review (verification recorded).
async function full(t, spec, files = {}, criteria = ['R1']) {
  const f = await fixture(t, { rigor: 'full', authorize: false });
  await writeFile(join(f.home, 'spec.md'), spec);
  for (const [name, body] of Object.entries(files)) { await mkdir(join(f.home, name, '..'), { recursive: true }); await writeFile(join(f.home, name), body); }
  await authorizeFull(f);
  f.criteria = criteria;
  return f;
}
async function verified(f) {
  await candidate(f, 'SLICE', f.base);
  await f.request('gate.execute', { gates: ['verification'], configuration: {
    validation: { kind: 'alternative', reason: 'Offline fixture', scope: 'Constant export' },
    checks: [{ repository: 'app', command: process.execPath, args: ['-e', 'process.exit(0)'], purpose: 'Verify fixture export' }] } }, 'verify');
}
// Records each review request with the files its view holds.
function recording(f) {
  const runs = evaluator(f);
  const adapter = f.core.runtime.evaluator, run = adapter.runStage.bind(adapter), views = [];
  adapter.runStage = async request => {
    const read = async path => { try { return await readFile(join(request.repositoryPath, path), 'utf8'); } catch { return null; } };
    views.push({ request, read });
    const files = {};
    for (const item of request.input.incorporated?.documents ?? []) files[item.path] = await read(item.path);
    views.at(-1).files = files;
    return run(request);
  };
  return { runs, views };
}

test('R7: the Definition of Done is incorporated by its phrase in any case and wrapping', () => {
  assert.equal(incorporatesDefinitionOfDone('The global Definition of Done in the software development workflow applies.'), true);
  assert.equal(incorporatesDefinitionOfDone('The GLOBAL definition\n  of done applies.'), true);
  assert.equal(incorporatesDefinitionOfDone(SPEC), false);
  assert.equal(incorporatesDefinitionOfDone('Our definition of done is local.'), false);
});

test('R7: links are read from prose, never from code, and classified', () => {
  const text = [
    'See [notes](notes.md "Notes") and ![diagram](images/flow.png).',
    '[ref]: other.md',
    '`[code](ignored.md)`',
    '```', '[fenced](ignored-too.md)', '```',
    '[web](https://example.test/doc.md) [anchor](#section) [mail](mailto:a@example.test) [up](../sibling/spec.md) [abs](/etc/passwd) [hidden](.gatereeve-current/objects/x)',
  ].join('\n');
  assert.deepEqual(markdownLinks(text), ['notes.md', 'images/flow.png', 'other.md', 'https://example.test/doc.md', '#section', 'mailto:a@example.test', '../sibling/spec.md', '/etc/passwd', '.gatereeve-current/objects/x']);
  // Balanced parentheses, escapes and angle brackets in a destination (round 1, codex high).
  assert.deepEqual(markdownLinks('[draft](docs/(draft).md) [esc](a\\)b.md) [angle](<two words.md>) [t](plain.md "Title")'),
    ['docs/(draft).md', 'a)b.md', 'two words.md', 'plain.md']);
  // Round 4: a reference destination or inline destination on the next line,
  // an escaped quote in a title, and an escaped `\]` that is not a link.
  assert.deepEqual(markdownLinks('[interview]:\n  interview.md\n\n[x](\n  next.md "a \\" b")\n\\](docs/literal.md) \\\\](real.md)'), ['interview.md', 'next.md', 'real.md']);
  // Labels never hide a link: nested or escaped brackets (round 3, codex high).
  assert.deepEqual(markdownLinks('[see [v2] notes](docs/v2.md) ![a [b [c]]](img/x.png) [esc \\] x](e.md)\n[r\\]x]: ref.md'), ['docs/v2.md', 'img/x.png', 'e.md', 'ref.md']);
  // Any depth of balanced parentheses (round 2, codex high); unbalanced is not a link.
  assert.deepEqual(markdownLinks('[n](docs/(a(b)).md) [deep](x/((((y)))).md "T") [bad](docs/(open.md'), ['docs/(a(b)).md', 'x/((((y)))).md']);
  assert.deepEqual(linkedPath('docs/(draft).md'), { path: 'docs/(draft).md' });
  assert.deepEqual(linkedPath('notes.md#part'), { path: 'notes.md' });
  assert.deepEqual(linkedPath('dir/../notes.md'), { path: 'notes.md' });
  for (const external of ['https://example.test/doc.md', '#section', 'mailto:a@example.test', '//host/x']) assert.equal(linkedPath(external).external, true, external);
  assert.match(linkedPath('../sibling/spec.md').reason, /outside the feature home/u);
  assert.match(linkedPath('/etc/passwd').reason, /not a relative path/u);
  assert.match(linkedPath('.gatereeve-current/objects/x').reason, /hidden or workflow-record/u);
});

test('R7: linked feature-home documents are captured; others become notes; external links are never fetched', async t => {
  const f = await fixture(t, { rigor: 'full', authorize: false });
  await writeFile(join(f.home, 'notes.md'), '# Notes\n');
  await mkdir(join(f.home, 'docs'));
  await writeFile(join(f.home, 'docs', '(draft).md'), '# Draft\n');
  await writeFile(join(f.home, 'docs', '(a(b)).md'), '# Nested\n');
  await writeFile(join(f.home, 'big.md'), 'x'.repeat(256 * 1024 + 1));
  await mkdir(join(f.home, 'folder'));
  await symlink(join(f.home, 'notes.md'), join(f.home, 'link.md'));
  const fetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => { fetched++; throw new Error('no network'); };
  t.after(() => { globalThis.fetch = fetch; });
  const spec = `${SPEC}\nThe global Definition of Done applies.\n[n](notes.md) [n again](notes.md) [draft](docs/(draft).md) [nested](docs/(a(b)).md) [design](design.md) [big](big.md) [folder](folder) [link](link.md) [missing](missing.md) [up](../x.md) [web](https://example.test/spec.md)\n`;
  const value = await incorporatedDocuments(f.core.store, spec, ['spec.md', 'design.md']);
  assert.equal(fetched, 0);
  assert.deepEqual(value.documents.map(item => [item.reference, item.path]), [
    ['global Definition of Done', DEFINITION_OF_DONE_VIEW_PATH], ['notes.md', 'incorporated/feature/notes.md'], ['docs/(draft).md', 'incorporated/feature/docs/(draft).md'],
    ['docs/(a(b)).md', 'incorporated/feature/docs/(a(b)).md']]);
  assert.equal(value.documents[0].ref.hash.startsWith('sha256:'), true);
  assert.deepEqual(value.notes.map(item => item.reference), ['big.md', 'folder', 'link.md', 'missing.md', '../x.md']);
  assert.match(value.notes[0].reason, /larger than 256 KiB/u);
  assert.match(value.notes[3].reason, /no such file/u);
  assert.match(value.notes[4].reason, /outside the feature home/u);
  assert.ok(!JSON.stringify(value).includes('example.test'), 'An external link is neither included nor noted');
  // Past the document bound.
  const many = Array.from({ length: MAX_INCORPORATED_DOCUMENTS + 2 }, (_, index) => `doc-${index}.md`);
  for (const name of many) await writeFile(join(f.home, name), `${name}\n`);
  const bounded = await incorporatedDocuments(f.core.store, many.map(name => `[${name}](${name})`).join('\n'), []);
  assert.equal(bounded.documents.length, MAX_INCORPORATED_DOCUMENTS);
  assert.deepEqual(bounded.notes.map(item => item.reference), many.slice(MAX_INCORPORATED_DOCUMENTS));
  assert.match(bounded.notes[0].reason, /16-document bound/u);
});

test('R7: a review packet carries incorporated documents, notes and instructions; a spec without them carries none', async t => {
  const spec = `${SPEC.replace('## Changes', 'The GLOBAL definition\nof done in the software development workflow applies. See [notes](notes.md) and [gone](gone.md).\n\n## Changes')}`;
  const f = await full(t, spec, { 'notes.md': '# Notes\nLinked context.\n' });
  await verified(f);
  const { views } = recording(f);
  await f.request('gate.execute', { gates: ['review'], configuration: reviewConfig }, 'review-incorporated');
  const [view] = views;
  assert.deepEqual(view.request.input.incorporated.documents, [
    { reference: 'global Definition of Done', path: DEFINITION_OF_DONE_VIEW_PATH }, { reference: 'notes.md', path: 'incorporated/feature/notes.md' }]);
  assert.deepEqual(view.request.input.incorporated.notes, [{ reference: 'gone.md', reason: 'no such file in the feature home' }]);
  assert.equal(view.files[DEFINITION_OF_DONE_VIEW_PATH], await readFile(DEFINITION_OF_DONE_URL, 'utf8'));
  assert.equal(view.files['incorporated/feature/notes.md'], '# Notes\nLinked context.\n');
  assert.match(view.request.instructions, /A missing incorporated document is a non-blocking note, not by itself a reason for UNAVAILABLE; but a selected criterion that cannot be judged without it fails, with evidence naming the missing document/u);
  // The plain fixture spec has neither.
  const g = await full(t, SPEC);
  await verified(g);
  const plain = recording(g);
  await g.request('gate.execute', { gates: ['review'], configuration: reviewConfig }, 'review-plain');
  assert.deepEqual(plain.views[0].request.input.incorporated, { documents: [], notes: [] });
  assert.equal(await plain.views[0].read(DEFINITION_OF_DONE_VIEW_PATH), null);
});

test('R7: a changed incorporated document prevents reuse of an earlier review', async t => {
  const f = await full(t, SPEC.replace('## Changes', 'See [notes](notes.md).\n\n## Changes'), { 'notes.md': 'first\n' });
  await verified(f);
  const { views } = recording(f);
  await f.request('gate.execute', { gates: ['review'], configuration: reviewConfig }, 'review-1');
  const same = await f.request('gate.execute', { gates: ['review'], configuration: reviewConfig }, 'review-2');
  assert.equal(same.reused, true, 'Unchanged inputs reuse the earlier review');
  assert.equal(views.length, 1);
  await writeFile(join(f.home, 'notes.md'), 'second\n');
  const changed = await f.request('gate.execute', { gates: ['review'], configuration: reviewConfig }, 'review-3');
  assert.notEqual(changed.reused, true);
  assert.equal(views.length, 2);
  assert.equal(views[1].files['incorporated/feature/notes.md'], 'second\n');
});

test('R7: the Definition of Done has its two parts and the template and policy point to it', async () => {
  const document = await readFile(DEFINITION_OF_DONE_URL, 'utf8');
  for (const heading of ['## At the review boundary', '## After merge']) assert.ok(document.includes(heading), heading);
  for (const item of ['Tests', 'Build and lint', 'Criteria met with evidence', 'Decisions recorded', 'Scope']) assert.ok(document.includes(`**${item}.**`), item);
  assert.match(document, /release, deployment, and live or production acceptance checks/u);
  const template = await readFile(new URL('templates/spec.md', resources), 'utf8');
  assert.equal(incorporatesDefinitionOfDone(template), true);
  assert.match(template, /DEFINITION-OF-DONE\.md/u);
  assert.match(template, /After merge:/u);
  for (const policy of ['policy/WORKFLOW.md', 'policy/STANDARDS.md']) assert.match(await readFile(new URL(policy, resources), 'utf8'), /DEFINITION-OF-DONE\.md/u, policy);
});

const AFTER_MERGE_SPEC = rubric([
  '| R1 | AC1 | 42 | other | test |',
  '| R2 | After merge: the live host serves 42 | live check passes | otherwise | deployment receipt |',
  '| R3 | AC1 again | 42 | other | test |',
].join('\n'));

test('R8: rows marked After merge are found from the criterion text only', () => {
  assert.deepEqual(afterMergeCriteria(planningFacts(AFTER_MERGE_SPEC)), [{ id: 'R2', criterion: 'After merge: the live host serves 42' }]);
  assert.deepEqual(afterMergeCriteria(planningFacts(rubric('| R1 | **after merge:** bold marker | a | b | c |'))).map(row => row.id), ['R1']);
  assert.deepEqual(afterMergeCriteria(planningFacts(rubric('| R1 | Runs after merge: not a marker | a | b | c |'))), []);
  assert.deepEqual(afterMergeCriteria(planningFacts(SPEC)), []);
});

test('R8: candidates leave after-merge rows out of boundary review and the packet lists them', async t => {
  const f = await full(t, AFTER_MERGE_SPEC, {}, ['R2']);
  await assert.rejects(candidate(f, 'SLICE', f.base, 'after-merge-slice'), /Criteria marked "After merge:" are checked after merge, not at a review boundary: R2/u);
  f.criteria = ['R1'];
  await assert.rejects(candidate(f, 'FEATURE', f.base, 'feature-missing-row'), /Feature review must cover the entire rubric except rows marked "After merge:" \(R2\)/u);
  f.criteria = ['R1', 'R3'];
  await candidate(f, 'FEATURE', f.base, 'feature-without-after-merge');
  await f.request('gate.execute', { gates: ['verification'], configuration: {
    validation: { kind: 'alternative', reason: 'Offline fixture', scope: 'Constant export' },
    checks: [{ repository: 'app', command: process.execPath, args: ['-e', 'process.exit(0)'], purpose: 'Verify fixture export' }] } }, 'verify');
  const { views } = recording(f);
  await f.request('gate.execute', { gates: ['review'], configuration: reviewConfig }, 'review-after-merge');
  const input = views[0].request.input;
  assert.deepEqual(input.criteria, ['R1', 'R3']);
  assert.deepEqual(input.afterMergeCriteria, [{ id: 'R2', criterion: 'After merge: the live host serves 42' }]);
  assert.match(views[0].request.instructions, /packet\.afterMergeCriteria lists rubric rows the specification marks as checked only after merge \(release, deployment or live acceptance\): they are not selected, so do not score them and do not report them as coverage limitations, findings or a reason for UNAVAILABLE/u);
  // Without the marker a feature candidate still covers every row.
  const g = await full(t, SPEC);
  g.criteria = [];
  await assert.rejects(candidate(g, 'FEATURE', g.base, 'feature-empty'), /Explicit distinct criteria are required/u);
  g.criteria = ['R1'];
  await candidate(g, 'FEATURE', g.base, 'feature-plain');
});
