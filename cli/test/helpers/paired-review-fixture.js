import assert from 'node:assert/strict';
import { fixture, candidate, evaluator } from './lightweight-fixture.js';
import { sha256Digest } from '../../../plugin-src/shared/resources/protocol/agent-workflow.js';

export const selection = () => ({ reason: 'Daily-driver models advertised by the fixture host.',
  observations: ['codex', 'claude-code'].map(provider => ({ provider, model: 'fixture', modelClass: 'standard', basis: 'agent-judgment', source: 'Fixture discovery', reasoningEfforts: ['high'] })),
  reviewers: ['codex', 'claude-code'].map(provider => ({ provider, model: 'fixture', reasoningEffort: 'high', reason: 'Suitable independent daily-driver perspective.' })) });

// Explicitly upgrade acceptance fixtures, keeping their evaluator's assertions
// and transformations. Individual gate/invalid-receipt tests remain individual.
export function pairExistingEvaluator(f) {
  const base = f.core.runtime.evaluator;
  f.core.runtime.evaluators = Object.fromEntries(['codex', 'claude-code'].map(provider => [provider, {
    async describe() { return { ...await base.describe(), provider }; },
    async runStage(request) {
      const result = await base.runStage(request);
      result.receipt.provider.id = provider;
      result.receipt.provider.contextId = `${provider}-${result.receipt.provider.contextId}`;
      return result;
    },
  }]));
}

export async function prepared(t, rigor = 'light', scope = 'SLICE') {
  const f = await fixture(t, { rigor });
  await candidate(f, scope, f.base);
  await f.request('gate.execute', { gates: ['verification'], configuration: {
    validation: { kind: 'alternative', reason: 'Offline fixture', scope: 'Constant export' },
    checks: [{ repository: 'app', command: process.execPath, args: ['--input-type=module', '-e', "import { answer } from './app.js'; if(answer !== 41) process.exit(1)"], purpose: 'Verify fixture export' }],
  } }, 'verify');
  await f.request('review.select', selection(), 'select');
  return f;
}
export function pairedAdapters(f, { unavailable = null, overlap = false, blocking = [], mandateFailure = [], present = [] } = {}) {
  evaluator(f);
  const base = f.core.runtime.evaluator;
  let entered = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  f.core.runtime.evaluators = Object.fromEntries(['codex', 'claude-code'].map(provider => [provider, {
    async describe() { return { provider, model: 'fixture', reasoningEffort: 'high' }; },
    async runStage(request) {
      entered++;
      if (entered === 2) release();
      if (overlap) await Promise.race([barrier, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Reviewers did not overlap')), 3000); timer.unref(); })]);
      if (provider === unavailable) throw new Error('Provider unavailable');
      const result = await base.runStage(request);
      if (request.input.mandate) for (const verdict of result.output.verdicts) verdict.mandateAssessment = { outcome: mandateFailure.includes(provider) ? 'FAIL' : 'PASS', evidence: 'Fixture reviewer judgment about the fixed mandate.' };
      if (blocking.includes(provider) || mandateFailure.includes(provider)) for (const verdict of result.output.verdicts) {
        verdict.outcome = 'FAIL';
        verdict.dimensions.find(row => row.name === 'code').outcome = 'FAIL';
        if (mandateFailure.includes(provider)) verdict.dimensions.find(row => row.name === 'scope').outcome = 'FAIL';
        verdict.findings = [{ id: 'same-local-id', classId: 'constant', criterion: request.input.criteria[0], path: 'app/app.js', evidence: 'The fixture exports 41.', blocking: true }];
      }
      if (present.length) for (const verdict of result.output.verdicts) {
        verdict.outcome = 'FAIL'; verdict.dimensions.find(row => row.name === 'code').outcome = 'FAIL';
        verdict.findings = []; verdict.dispositions = present.map(id => ({ id, status: 'present', evidence: 'Current inspection confirms this original issue remains.' }));
      }
      result.receipt.digests.output = sha256Digest(result.output);
      result.receipt.provider.id = provider;
      result.receipt.provider.contextId = `${provider}-fresh-reviewer`;
      return result;
    },
  }]));
  return () => entered;
}
