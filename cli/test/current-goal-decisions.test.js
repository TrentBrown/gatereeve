import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, human, evaluator, openPr } from './helpers/lightweight-fixture.js';
import { prepared, pairedAdapters } from './helpers/paired-review-fixture.js';
import { git } from '../../plugin-src/shared/resources/protocol/current/evidence.js';
import { currentSnapshot } from '../../plugin-src/shared/resources/protocol/current/adapter.js';
import { parseDecisionEntries, agentDecisions } from '../../plugin-src/shared/resources/protocol/current/goal.js';
import { withDecisions, SUMMARY_END } from '../../plugin-src/shared/resources/protocol/current/publication.js';

const mandate = { goal: 'Export the constant answer.', constraints: [] };
const grant = (f, value = 'goal', id = value) => f.request('run.set-dial', { dial: 'autonomy', value, actor: 'human', runId: 'run-one',
  authority: { ...human, instruction: `Run run-one at ${value}.` }, reason: 'Unattended', mandate }, id);
const snapshot = f => currentSnapshot(f.context, {}, { entryPoints: { adapter: 'adapter.js', cli: null } });
const INTERVIEW = `# Interview

### D1 - Name

- **Question:** Which name?
- **Answer:** answer
- **Answered by:** human
- **Decision:** Keep answer.

### D2 - Default value

- **Question:** Which default?
- **Answered by:** agent
- **Options:** 41, 42
- **Reversibility:** reversible
- **Decision:** 42.
`;

test('agent decision entries are parsed by file and heading from the three record files', async t => {
  assert.deepEqual(parseDecisionEntries('interview.md', INTERVIEW).map(({ heading, answeredBy }) => [heading, answeredBy]),
    [['D1 - Name', 'human'], ['D2 - Default value', 'agent']]);
  const f = await fixture(t);
  await writeFile(join(f.home, 'interview.md'), INTERVIEW);
  await writeFile(join(f.home, 'scratchpad.md'), '# Scratchpad\n\n## 2026-11-21 - Stall valve\n\n**Answered by:** `agent`\n\nAdmit after three blocks.\n');
  await writeFile(join(f.home, 'decisions.md'), '# Decisions\n\n## Promoted\n\n- **Answered by:** human\n');
  assert.deepEqual((await agentDecisions(f.home)).map(({ file, heading }) => `${file}#${heading}`),
    ['interview.md#D2 - Default value', 'scratchpad.md#2026-11-21 - Stall valve']);
  assert.equal((await snapshot(f)).goal, null);
  await grant(f);
  assert.deepEqual((await snapshot(f)).goal.decisions, [{ file: 'interview.md', heading: 'D2 - Default value' }, { file: 'scratchpad.md', heading: '2026-11-21 - Stall valve' }]);
});

test('the decisions section is written only when decisions are supplied', () => {
  const section = `start\n${SUMMARY_END}`;
  assert.equal(withDecisions(section, null), section);
  assert.match(withDecisions(section, []), /Decisions made for you[\s\S]*None recorded[\s\S]*gatereeve:review-summary:end/u);
  assert.match(withDecisions(section, [{ file: 'interview.md', heading: 'D2 - Default value' }]), /`interview\.md` D2 - Default value\n<!-- gatereeve:review-summary:end -->$/u);
});

test('a goal run blocks its milestones while interview.md differs from the approved record and never re-pins on grant', async t => {
  const f = await fixture(t, { rigor: 'full' });
  const missing = async () => (await f.request('milestone.check', { name: 'implementation' })).missing.join('; ');
  await writeFile(join(f.home, 'interview.md'), `${await readFile(join(f.home, 'interview.md'), 'utf8')}\nUnapproved change before the grant.\n`);
  assert.doesNotMatch(await missing(), /interview\.md changed/u, 'a supervised run is unaffected');
  await grant(f);
  assert.match(await missing(), /interview\.md changed since its latest approval/u, 'the grant keeps the approved pin');
  const subject = (await f.core.commitments()).subject;
  await f.request('human.decide', { kind: 'amend', subject, previousSubject: subject, actions: ['authorize-implementation'],
    reason: 'Record the interview change', consequences: 'Pin the current record', authority: { ...human, instruction: 'Pin the updated interview.' } }, 'amend');
  assert.doesNotMatch(await missing(), /interview\.md changed/u);
  assert.equal((await f.request('milestone.check', { name: 'implementation' })).allowed, true);
});

test('goal planning review input carries the agent decisions with an assessment rule', async t => {
  const f = await fixture(t, { rigor: 'full' });
  await writeFile(join(f.home, 'interview.md'), INTERVIEW);
  await grant(f);
  const runs = evaluator(f);
  const run = f.core.runtime.evaluator.runStage;
  f.core.runtime.evaluator.runStage = async request => {
    const result = await run(request);
    result.output.mandateAssessment = { outcome: 'PASS', evidence: 'Fixture mandate assessment.' };
    const { sha256Digest } = await import('../../plugin-src/shared/resources/protocol/agent-workflow.js');
    result.receipt.digests.output = sha256Digest(result.output);
    return result;
  };
  await f.request('planning.review', { artifact: 'spec', configuration: { provider: 'codex', model: 'fixture' } }, 'review');
  const packet = runs.at(-1).input;
  assert.deepEqual(packet.agentDecisions.entries.map(entry => entry.heading), ['D2 - Default value']);
  assert.match(packet.agentDecisions.rule, /agent-answered decision/u);
});

test('a goal boundary review receives the agent decisions and the published PR lists them', async t => {
  const f = await prepared(t, 'light', 'FEATURE');
  await git(f.repo, ['switch', '-c', f.integration, f.base]);
  await writeFile(join(f.home, 'scratchpad.md'), '# Scratchpad\n\n## Chose the merge method\n\n**Answered by:** agent\n\nMerge commit, matching history.\n');
  await grant(f);
  await f.request('candidate.ready', {}, 'ready');
  const inputs = [];
  pairedAdapters(f);
  for (const adapter of Object.values(f.core.runtime.evaluators ?? {})) {
    const run = adapter.runStage.bind(adapter);
    adapter.runStage = async request => { inputs.push(request.input); return run(request); };
  }
  await f.request('review.execute', {}, 'reviews');
  assert.equal(inputs.length, 2, 'both boundary perspectives ran');
  for (const input of inputs) {
    assert.deepEqual(input.agentDecisions.entries.map(entry => entry.heading), ['Chose the merge method']);
    assert.match(input.agentDecisions.rule, /fixed mandate/u);
  }
  openPr(f, f.integration, f.release, f.base);
  await f.request('review.publish', { repository: 'app', number: 12 }, 'publish');
  assert.match(f.gh.pr.body, /Decisions made for you[\s\S]*`scratchpad\.md` Chose the merge method/u);
});

test('a goal planning decision cites only a review that assessed the current agent decision entries', async t => {
  const { sha256Digest } = await import('../../plugin-src/shared/resources/protocol/agent-workflow.js');
  const f = await fixture(t, { rigor: 'full' });
  const prior = (await f.core.commitments()).subject;
  const mandated = await grant(f, 'mandated', 'mandated');
  await writeFile(join(f.home, 'design.md'), (await readFile(join(f.home, 'design.md'), 'utf8')) + '\nSimplify within the same goal.\n');
  await writeFile(join(f.home, 'spec.md'), (await readFile(join(f.home, 'spec.md'), 'utf8')) + '\nApproach simplified.\n');
  evaluator(f);
  const run = f.core.runtime.evaluator.runStage;
  f.core.runtime.evaluator.runStage = async request => {
    const result = await run(request);
    result.output.mandateAssessment = { outcome: 'PASS', evidence: 'Fixture mandate assessment.' };
    result.receipt.digests.output = sha256Digest(result.output);
    return result;
  };
  const review = (id) => f.request('planning.review', { artifact: 'spec', configuration: { provider: 'codex', model: 'fixture' } }, id);
  const amend = (delegation, evaluation, id) => f.request('human.decide', { kind: 'amend', subject: current, previousSubject: prior, actions: ['authorize-implementation'],
    reason: 'In-mandate simplification', consequences: 'Refresh evidence', authority: { kind: 'autonomous-evaluator', delegation, evaluation } }, id);
  const current = (await f.core.commitments()).subject;
  const beforeRaise = await review('review-mandated');
  const raised = await grant(f, 'goal', 'goal');
  await assert.rejects(amend(raised.event.hash, beforeRaise.event.hash, 'amend-stale-raise'), /did not assess the current agent decision entries/u);
  const fresh = await review('review-goal');
  await writeFile(join(f.home, 'scratchpad.md'), '# Scratchpad\n\n## Late choice\n\n**Answered by:** agent\n\nPicked a default.\n');
  await assert.rejects(amend(raised.event.hash, fresh.event.hash, 'amend-stale-entry'), /did not assess the current agent decision entries/u);
  const assessed = await review('review-goal-current');
  const amended = await amend(raised.event.hash, assessed.event.hash, 'amend-current');
  assert.equal(amended.event.payload.authority.kind, 'autonomous-evaluator');
  assert.ok(mandated.event);
});

test('nested headings inside an agent entry stay part of that entry, so a changed choice changes the entries', () => {
  const entry = choice => `# Scratchpad\n\n## [1] Storage choice\n\n**Answered by:** agent\n\n### Decision\n\n${choice}\n\n### Alternatives\n\nOther stores.\n\n## [2] Next entry\n\n**Answered by:** human\n`;
  const first = parseDecisionEntries('scratchpad.md', entry('Use SQLite.'));
  assert.deepEqual(first.map(({ heading, answeredBy }) => [heading, answeredBy]), [['[1] Storage choice', 'agent'], ['[2] Next entry', 'human']]);
  assert.match(first[0].body, /### Decision[\s\S]*Use SQLite\.[\s\S]*### Alternatives/u);
  assert.notEqual(parseDecisionEntries('scratchpad.md', entry('Use Postgres.'))[0].body, first[0].body);
});

test('entries beneath a grouping heading keep their own identity and provenance', () => {
  const grouped = choice => `# Interview\n\n## Feature design\n\nContext for the section.\n\n### D1 - Name\n\n- **Answered by:** human\n- **Decision:** Keep answer.\n\n### D2 - Default\n\n- **Answered by:** agent\n- **Decision:** ${choice}\n\n#### Rationale\n\nReversible.\n\n## Later section\n\n### D3 - Other\n\n- **Answered by:** agent\n- **Decision:** Third.\n`;
  const parsed = parseDecisionEntries('interview.md', grouped('42.'));
  assert.deepEqual(parsed.map(({ heading, answeredBy }) => [heading, answeredBy]), [['D1 - Name', 'human'], ['D2 - Default', 'agent'], ['D3 - Other', 'agent']]);
  assert.match(parsed[1].body, /42\.[\s\S]*#### Rationale[\s\S]*Reversible/u);
  assert.doesNotMatch(parsed[1].body, /D3 - Other|Later section/u);
  assert.notEqual(parseDecisionEntries('interview.md', grouped('41.'))[1].body, parsed[1].body);
});

test('agent entries are found at any heading depth, before any heading, and in plain or bold provenance form', () => {
  const deep = `# Scratchpad\n\n#### Storage decisions\n\n##### [1] Human choice\n\n**Answered by:** human\n\n##### [2] Agent choice\n\n**Answered by:** agent\n\nUse SQLite.\n\n###### Why\n\nEmbedded.\n`;
  assert.deepEqual(parseDecisionEntries('scratchpad.md', deep).map(({ heading, answeredBy }) => [heading, answeredBy]), [['[1] Human choice', 'human'], ['[2] Agent choice', 'agent']]);
  assert.match(parseDecisionEntries('scratchpad.md', deep)[1].body, /Use SQLite[\s\S]*###### Why[\s\S]*Embedded/u);
  for (const form of ['Answered by: agent', '- Answered by: `agent`', '**Answered by:** `agent`', '- **Answered by**: agent', '__Answered by:__ agent'])
    assert.deepEqual(parseDecisionEntries('interview.md', `# Interview\n\n## D1 - Choice\n\n${form}\n\nPicked 42.\n`).map(entry => entry.answeredBy), ['agent'], form);
  assert.deepEqual(parseDecisionEntries('scratchpad.md', 'Answered by: agent\n\nChose a default before any heading.\n').map(({ heading, answeredBy }) => [heading, answeredBy]), [['(preamble)', 'agent']]);
  assert.deepEqual(parseDecisionEntries('scratchpad.md', '## Notes\n\n```md\n## Fake heading\nAnswered by: agent\n```\n'), [], 'fenced examples are not entries');
});

test('indented headings, CommonMark fence lengths and ordered-list or quoted provenance are handled', () => {
  const indented = '# Scratchpad\n\n## Choices\n\n  ### [1] Human choice\n\n**Answered by:** human\n\n   ### [2] Agent choice\n\n**Answered by:** agent\n\nChose 42.\n';
  assert.deepEqual(parseDecisionEntries('scratchpad.md', indented).map(({ heading, answeredBy }) => [heading, answeredBy]), [['[1] Human choice', 'human'], ['[2] Agent choice', 'agent']]);
  const fences = '## [1] Human choice\n\n**Answered by:** human\n\n````md\n```js\n## Not a heading\nAnswered by: agent\n````\n\n## [2] Agent choice\n\n**Answered by:** agent\n\nChose 42.\n';
  assert.deepEqual(parseDecisionEntries('scratchpad.md', fences).map(({ heading, answeredBy }) => [heading, answeredBy]), [['[1] Human choice', 'human'], ['[2] Agent choice', 'agent']]);
  for (const form of ['3. **Answered by:** agent', '> Answered by: agent', '> - **Answered by:** `agent`'])
    assert.deepEqual(parseDecisionEntries('interview.md', `## D1 - Choice\n\n${form}\n`).map(entry => entry.answeredBy), ['agent'], form);
});
