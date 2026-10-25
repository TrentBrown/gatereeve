import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { renderCurrentOverview } from '../renderer/current-view.js';
import { currentFixture } from '../../../cli/test/helpers/current-fixture.js';
import { createProtocolAdapter } from '../main/protocol-adapter.js';

test('current view shows milestone blockers, preserved verdicts, exceptions and no ordering controls', async t => {
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
  assert.match(elements.milestones.textContent, /Implementation.*Blocked/s);
  assert.match(elements['module-settings-list'].textContent, /Independent compliance judgment/);
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
