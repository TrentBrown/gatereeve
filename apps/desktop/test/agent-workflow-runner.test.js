import assert from 'node:assert/strict';
import test from 'node:test';

import { createDesktopAgentWorkflowRunner } from '../main/agent-workflow-runner.js';

function request() {
  return {
    repositoryRoot: '/repository',
    featureHome: '/repository/docs/issues/feature',
    setup: {
      selectedAgents: ['codex'],
      agents: [{ id: 'codex', label: 'Codex', status: 'ready' }],
    },
    snapshot: {
      active: { boundaryAttemptId: 'attempt-1' },
      projection: {
        boundaryAttempts: [{
          id: 'attempt-1', state: 'ACTIVE',
          gates: [{ id: 'judge', moduleDigest: 'sha256:judge', eligible: true, outcome: 'UNSET' }],
        }],
      },
      modules: {
        slots: [{
          modules: [{
            id: 'gatereeve/judge', boundaryGateId: 'judge',
            run: { kind: 'agent-workflow' },
          }],
        }],
      },
    },
  };
}

test('Desktop automatically schedules one bounded run for an eligible attempt', async () => {
  const calls = [];
  const runner = createDesktopAgentWorkflowRunner({
    protocol: { prepareBoundaryModule: async () => ({}) },
    desktopRoot: '/desktop',
    discover: async () => '/usr/local/bin/codex',
    createCodexAdapter: (configuration) => ({ configuration }),
    run: async (options) => {
      calls.push(['run', options]);
      return { schemaVersion: 1, attemptId: 'attempt-1', results: [{ gateId: 'judge', status: 'completed', outcome: 'PASS' }] };
    },
    onChanged: async (event) => calls.push(['changed', event]),
  });
  const first = runner.schedule(request());
  const second = runner.schedule(request());
  assert.equal(first, second);
  await first;
  assert.equal(calls.filter(([kind]) => kind === 'run').length, 1);
  const options = calls.find(([kind]) => kind === 'run')[1];
  assert.equal(options.attemptId, 'attempt-1');
  assert.equal(options.actorLabel, 'GateReeve Desktop Codex agent-workflow');
  assert.equal(options.adapter.configuration.model, 'gpt-5.5');
  assert(calls.some(([kind, event]) => kind === 'changed' && event.live?.status === 'running'));
  assert(calls.some(([kind, event]) => kind === 'changed' && event.result?.results?.[0]?.outcome === 'PASS'));
  assert.equal(runner.schedule(request()), null);
});

test('Desktop does not launch when no selected agent is ready', () => {
  const value = request();
  value.setup.agents[0].status = 'incomplete';
  const runner = createDesktopAgentWorkflowRunner({
    protocol: {}, desktopRoot: '/desktop', run: async () => { throw new Error('must not run'); },
  });
  assert.equal(runner.schedule(value), null);
});
