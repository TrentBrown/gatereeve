import assert from 'node:assert/strict';
import test from 'node:test';

import { runEligibleAgentWorkflowGates } from '../../plugin-src/shared/resources/protocol/index.js';

const modules = [
  { id: 'gatereeve/judge', version: '2.0.0', digest: 'judge-digest', run: { kind: 'agent-workflow' }, boundary: { gateId: 'judge' } },
  { id: 'whiteboard-test/defense', version: '1.0.0', digest: 'whiteboard-digest', run: { kind: 'agent-workflow' }, boundary: { gateId: 'whiteboardDefense' } },
];

function harness(judgeOutcome = 'PASS') {
  const outcomes = new Map([['judge', 'UNSET'], ['whiteboardDefense', 'UNSET']]);
  const calls = [];
  const recordValue = {
    modelLock: { modelHash: `sha256:${'a'.repeat(64)}`, model: { moduleGraph: { modules } } },
    events: [{
      type: 'BOUNDARY_STARTED', payload: {
        attemptId: 'attempt-1', moduleGraph: { modules },
      },
    }],
  };
  const projection = () => ({
    activeSliceId: 'slice-1',
    slices: [{ id: 'slice-1', activeAttemptId: 'attempt-1' }],
    boundaryAttempts: [{
      id: 'attempt-1', state: 'ACTIVE', scope: 'SLICE', context: {},
      gates: [
        {
          id: 'judge', moduleId: modules[0].id, moduleVersion: modules[0].version,
          moduleDigest: modules[0].digest, eligible: true, outcome: outcomes.get('judge'),
        },
        {
          id: 'whiteboardDefense', moduleId: modules[1].id, moduleVersion: modules[1].version,
          moduleDigest: modules[1].digest,
          eligible: outcomes.get('judge') === 'PASS', outcome: outcomes.get('whiteboardDefense'),
        },
      ],
    }],
  });
  return {
    calls,
    options: {
      repositoryRoot: '/repo', featureHome: '/repo/docs/issues/feature', adapter: {}, resources: {},
      readRecord: async () => recordValue,
      project: projection,
      prepare: async ({ attemptId, gateId }) => ({
        modelHash: recordValue.modelLock.modelHash,
        attempt: { id: attemptId, scope: 'SLICE' },
        target: { id: gateId },
        currentFingerprints: {},
        inputs: { schemaVersion: 1, context: { headSha: 'head' }, gateId },
      }),
      execute: async ({ module, recordOutcome }) => {
        calls.push(module.id);
        const outcome = module.id === 'gatereeve/judge' ? judgeOutcome : 'PASS';
        await recordOutcome({ outcome, evidence: { path: `${module.id}.json`, hash: `sha256:${'b'.repeat(64)}` }, reason: null });
        return { schemaVersion: 1, status: 'completed', outcome, artifacts: [], receipts: [], failure: null };
      },
      record: async (_featureHome, value) => { outcomes.set(value.gateId, value.outcome); return { event: {} }; },
      createId: (() => { let index = 0; return () => `id-${++index}`; })(),
    },
  };
}

test('scheduler runs Judge then conditionally eligible Whiteboard in separate governed stages', async () => {
  const fixture = harness('PASS');
  const result = await runEligibleAgentWorkflowGates(fixture.options);
  assert.deepEqual(fixture.calls, ['gatereeve/judge', 'whiteboard-test/defense']);
  assert.deepEqual(result.results.map((item) => [item.gateId, item.outcome]), [
    ['judge', 'PASS'], ['whiteboardDefense', 'PASS'],
  ]);
});

test('a blocking Judge failure is recorded and leaves Whiteboard ineligible', async () => {
  const fixture = harness('FAIL');
  const result = await runEligibleAgentWorkflowGates(fixture.options);
  assert.deepEqual(fixture.calls, ['gatereeve/judge']);
  assert.deepEqual(result.results.map((item) => [item.gateId, item.outcome]), [['judge', 'FAIL']]);
});
