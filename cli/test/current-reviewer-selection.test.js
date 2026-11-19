import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewerSelection } from '../../plugin-src/shared/resources/protocol/current/reviewer-selection.js';

const input = () => ({
  reason: 'Choose available daily-driver models for independent boundary review.',
  observations: ['codex', 'claude-code'].map((provider, i) => ({ provider, model: `daily-${i}`, reasoningEfforts: ['medium', 'high'], modelClass: 'standard', basis: 'agent-judgment', source: 'Host capability discovery in this run' })),
  reviewers: ['codex', 'claude-code'].map((provider, i) => ({ provider, model: `daily-${i}`, reasoningEffort: 'high', reason: 'Daily-driver class inferred from the advertised description.' })),
});
test('selection records inferred classes honestly and does not claim execution', () => {
  const selected = reviewerSelection(input());
  assert.deepEqual(selected.reviewers.map(row => row.modelProvider), ['openai', 'anthropic']);
  assert.equal(selected.observations[0].basis, 'agent-judgment');
  assert.match(selected.availability, /execution not yet/);
});
test('model versions are data and explicit instructions remain visible', () => {
  const value = input(); value.instruction = 'Use my chosen models.';
  value.observations[0].model = value.reviewers[0].model = 'a-new-model-with-no-code-update';
  assert.equal(reviewerSelection(value).instruction, value.instruction);
});
test('same-provider models cannot supply two independent provider perspectives', () => {
  const value = input(); value.observations[1].provider = value.reviewers[1].provider = 'codex';
  assert.throws(() => reviewerSelection(value), /different model providers/);
});
test('undiscovered models and unavailable reasoning cannot be silently substituted', () => {
  const value = input(); value.reviewers[0].model = 'not-discovered';
  assert.throws(() => reviewerSelection(value), /not discovered/);
  const effort = input(); effort.reviewers[0].reasoningEffort = 'xhigh';
  assert.throws(() => reviewerSelection(effort), /not discovered/);
});
test('low effort does not qualify despite discovery and a standard-class label', () => {
  const value = input(); value.observations[0].reasoningEfforts = ['low']; value.reviewers[0].reasoningEffort = 'low';
  assert.throws(() => reviewerSelection(value), /capability profile/);
});
test('selection needs two reviewers, discovery provenance and an honest class basis', () => {
  const value = input(); value.reviewers.pop();
  assert.throws(() => reviewerSelection(value), /exactly two/);
  const source = input(); delete source.observations[0].source;
  assert.throws(() => reviewerSelection(source), /Discovery source/);
  const basis = input(); basis.observations[0].basis = 'guaranteed';
  assert.throws(() => reviewerSelection(basis), /agent judgment/);
});
