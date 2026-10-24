import assert from 'node:assert/strict';
import test from 'node:test';
import { humanize, featureStateLabel, diagnosticCanShowGovernedViews } from '../renderer/presentation.js';
test('current presentation uses current phases and contract identity', () => {
  assert.equal(humanize('authorize-implementation'), 'Authorize implementation');
  assert.equal(featureStateLabel('IMPLEMENTING'), 'IMPLEMENTING');
  assert.equal(diagnosticCanShowGovernedViews({ contract: 'gatereeve/current/2' }), true);
  assert.equal(diagnosticCanShowGovernedViews({ mode: 'governed' }), false);
});
