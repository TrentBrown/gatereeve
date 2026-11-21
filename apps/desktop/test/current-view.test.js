import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { renderCurrentOverview } from '../renderer/current-view.js';
import { currentFixture } from '../../../cli/test/helpers/current-fixture.js';
import { createProtocolAdapter } from '../main/protocol-adapter.js';

test('current view shows milestone blockers, preserved verdicts, exceptions and no ordering controls', async t => {
  const previousMetrics = process.env.GATEREEVE_METRICS;
  process.env.GATEREEVE_METRICS = 'off';
  t.after(() => { if (previousMetrics === undefined) delete process.env.GATEREEVE_METRICS; else process.env.GATEREEVE_METRICS = previousMetrics; });
  const f = await currentFixture(t);
  await f.request('run.start', { implementers: ['fixture'] }, 'start');
  const adapter = createProtocolAdapter(); await adapter.resolve(f.repo);
  const snapshot = await adapter.snapshot(f.home);
  const { window } = parseHTML(await readFile(new URL('../renderer/index.html', import.meta.url), 'utf8'));
  globalThis.document = window.document; t.after(() => delete globalThis.document);
  const elements = Object.fromEntries([...window.document.querySelectorAll('[id]')].map(element => [element.id, element]));
  const before = (await f.core.state()).events;
  renderCurrentOverview(snapshot, elements);
  assert.equal(window.document.querySelectorAll('#state-rail .state-node').length, 7);
  assert.equal(snapshot.database.exists, true);
  const database = window.document.querySelector('[data-workflow-database]');
  assert.ok(database, 'selected workflow remains inspectable with measurement disabled');
  assert.deepEqual(JSON.parse(database.querySelector('pre').textContent), snapshot.database);
  assert.equal(snapshot.database.integrity, 'ok');
  assert.equal(snapshot.database.schemaVersion, 1);
  assert.match(elements.milestones.textContent, /Implementation.*Blocked/s);
  assert.match(elements['module-settings-list'].textContent, /Independent acceptance assessment/);
  assert.doesNotMatch(elements['module-settings-list'].textContent, /Run after|dependsOn|before/);
  assert.equal(elements['module-apply'].hidden, true);
  for (const milestone of snapshot.milestones) {
    const outcome = milestone.outcomes?.find(item => item.id === 'verification');
    if (outcome) outcome.exception = { reason: 'Known fixture risk', consequences: 'Runtime remains unverified' };
  }
  snapshot.current.standingAuthorizations = [{ grant: 'sha256:fixture-grant', allowed: false, reason: 'Standing grant was revoked', scope: { actions: ['accept'], candidateScopes: ['SLICE', 'FEATURE'] }, applications: [{ subject: 'sha256:fixture-candidate', actions: ['accept'] }] }];
  snapshot.current.historyGaps = [{ resultHash: 'sha256:lost-historical-proof' }];
  renderCurrentOverview(snapshot, elements);
  assert.match(elements['global-alerts'].textContent, /Standing grant was revoked.*SLICE.*fixture-candidate.*Deployment requires separate authorization/);
  assert.match(elements['global-alerts'].textContent, /Historical evidence unavailable.*lost-historical-proof/);
  assert.match(elements['module-settings-list'].textContent, /UNAVAILABLE.*Accepted exception: Known fixture risk/s);
  snapshot.current.sourcePreparationStatus = { failed: { status: 'retry-required', reason: 'Owned refs retained; retry the original operation.' } };
  snapshot.current.sourceCleanup = { status: 'pending', errors: [{ reason: 'Completion recorded; release pending.' }] };
  renderCurrentOverview(snapshot, elements);
  assert.match(elements['global-alerts'].textContent, /Source preparation failed: retry-required/);
  assert.match(elements['global-alerts'].textContent, /Source retention: pending.*Completion recorded/);
  assert.deepEqual((await f.core.state()).events, before);
});

test('workflow header shows both run dials, marking defaults when no run exists', async t => {
  const previousMetrics = process.env.GATEREEVE_METRICS;
  process.env.GATEREEVE_METRICS = 'off';
  t.after(() => { if (previousMetrics === undefined) delete process.env.GATEREEVE_METRICS; else process.env.GATEREEVE_METRICS = previousMetrics; });
  const f = await currentFixture(t);
  const adapter = createProtocolAdapter(); await adapter.resolve(f.repo);
  const { window } = parseHTML(await readFile(new URL('../renderer/index.html', import.meta.url), 'utf8'));
  globalThis.document = window.document; t.after(() => delete globalThis.document);
  const elements = Object.fromEntries([...window.document.querySelectorAll('[id]')].map(element => [element.id, element]));
  const header = window.document.querySelector('.page-heading #workflow-dials');
  assert.ok(header, 'the dial badges live in the workflow overview heading');
  assert.equal(header.getAttribute('aria-label'), 'Run dials');
  const badges = () => [...header.querySelectorAll('[data-dial]')].map(item => ({ dial: item.getAttribute('data-dial'), value: item.getAttribute('data-value'), text: item.textContent, className: item.className }));

  renderCurrentOverview(await adapter.snapshot(f.home), elements);
  assert.deepEqual(badges().map(({ dial, value, text }) => ({ dial, value, text })), [
    { dial: 'rigor', value: 'full', text: 'Rigor · Full (default)' },
    { dial: 'autonomy', value: 'supervised', text: 'Autonomy · Supervised (default)' },
  ]);
  assert.ok(badges().every(item => item.className.includes('dial-default')));

  const authority = { kind: 'human-confirmed', instruction: 'Light for this one.', context: 'desktop fixture conversation' };
  const started = await f.request('run.start', { implementers: ['fixture'], rigor: { value: 'light', authority, reason: 'Small slice' } }, 'light-start');
  assert.equal(started.ok, true, JSON.stringify(started.error));
  renderCurrentOverview(await adapter.snapshot(f.home), elements);
  assert.deepEqual(badges().map(({ dial, value, text }) => ({ dial, value, text })), [
    { dial: 'rigor', value: 'light', text: 'Rigor · Light' },
    { dial: 'autonomy', value: 'supervised', text: 'Autonomy · Supervised' },
  ]);
  assert.match(badges()[0].className, /dial-light/u);
  assert.doesNotMatch(badges()[1].className, /dial-default|dial-delegated/u);

  // Delegation is enabled in a later slice; the header renders it from status.
  renderCurrentOverview({ ...(await adapter.snapshot(f.home)), dials: { rigor: 'full', autonomy: 'delegated' } }, elements);
  assert.deepEqual(badges().map(item => item.text), ['Rigor · Full', 'Autonomy · Delegated']);
  assert.match(badges()[1].className, /dial-delegated/u);

  // Mandated (formerly autonomous) and goal autonomy stand out too; a goal run
  // also shows its terminal state and the decisions made for the human.
  renderCurrentOverview({ ...(await adapter.snapshot(f.home)), dials: { rigor: 'full', autonomy: 'mandated' } }, elements);
  assert.deepEqual(badges().map(item => item.text), ['Rigor · Full', 'Autonomy · Mandated']);
  assert.match(badges()[1].className, /dial-mandated/u);
  assert.equal(header.querySelector('[data-goal-terminal]'), null);
  for (const [terminal, label] of [[null, 'Goal · In progress'], ['parked', 'Goal · Parked'], ['ready-pr', 'Goal · Ready PR']]) {
    const goal = { condition: 'condition', terminal, reason: 'reason', decisions: [{ file: 'interview.md', heading: 'D2 - Default value' }] };
    renderCurrentOverview({ ...(await adapter.snapshot(f.home)), dials: { rigor: 'full', autonomy: 'goal' }, goal }, elements);
    assert.match(badges()[1].className, /dial-goal/u);
    const badge = header.querySelector('[data-goal-terminal]');
    assert.equal(badge.textContent, label);
    assert.equal(badge.getAttribute('data-goal-terminal'), terminal ?? 'none');
    assert.match(elements['global-alerts'].querySelector('.goal-decisions').textContent, /Decisions made for you \(1\): interview\.md D2 - Default value/u);
  }
});
