import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hashModuleDefinition,
  runAgentWorkflow,
  sha256Digest,
} from '../../plugin-src/shared/resources/protocol/index.js';

const digest = (character) => `sha256:${character.repeat(64)}`;

function moduleDefinition() {
  const module = {
    schemaVersion: 1,
    id: 'example/defense',
    version: '1.0.0',
    digest: digest('0'),
    label: 'Defense',
    description: 'Fixture defense.',
    slot: 'boundary.evaluation',
    dependsOn: [],
    disposition: 'required',
    locked: false,
    enabledByDefault: true,
    waiverAllowed: false,
    evidence: { kind: 'reference', requiredFor: ['PASS', 'FAIL'] },
    fingerprint: { kind: 'boundary-gate-v1', dependencyBinding: 'event-ids' },
    boundary: {
      gateId: 'defense',
      evaluationScope: { SLICE: 'SLICE', FEATURE_FINAL: 'FEATURE' },
      guards: ['boundary.context.current'],
    },
    run: {
      kind: 'agent-workflow',
      protocolVersion: 1,
      resourcePlugin: 'example-plugin',
      capabilityProfile: { id: 'high-capability-v1', minimumReasoning: 'high' },
      automatic: true,
      isolation: { freshContext: true, inheritedTurns: 0 },
      repositoryAccess: 'read-only-pinned',
      networkAccess: 'denied',
      stages: [
        {
          id: 'challenge', role: 'Challenger', dependsOn: [],
          promptResource: 'agents/challenge.md',
          inputSchema: 'schemas/input.json', outputSchema: 'schemas/challenge.json',
        },
        {
          id: 'defend', role: 'Defender', dependsOn: ['challenge'],
          promptResource: 'agents/defend.md',
          inputSchema: 'schemas/defend-input.json', outputSchema: 'schemas/defense.json',
        },
      ],
      artifacts: [{ path: 'defense.json', mediaType: 'application/json', required: true }],
      evaluator: { resource: 'validator.js', export: 'createBundle' },
      evidenceRoot: 'defense.json',
      timeoutSeconds: 900,
      maxAttempts: 1,
    },
  };
  module.digest = hashModuleDefinition(module);
  return module;
}

function adapter({ inheritedTurns = 0, reasoningEffort = 'high', reuseContext = false } = {}) {
  return {
    async describe() {
      return {
        schemaVersion: 1,
        id: 'codex/fresh-subagent',
        version: '1.0.0',
        provider: 'codex',
        model: 'configured-model',
        reasoningEffort,
        capabilityProfiles: ['high-capability-v1'],
        isolationMethods: ['fresh-subagent'],
      };
    },
    async runStage(request) {
      const output = request.stage.id === 'challenge'
        ? { questions: ['Why this boundary?'] }
        : { answers: request.input.dependencies.challenge.questions.map((question) => ({ question, answer: 'Because evidence.' })) };
      return {
        output,
        receipt: {
          schemaVersion: 1,
          kind: 'gatereeve-agent-workflow-receipt',
          protocolVersion: 1,
          runId: request.runId,
          attemptId: request.attemptId,
          module: request.module,
          stage: request.stage.id,
          provider: {
            id: 'codex', adapterVersion: '1.0.0', model: 'configured-model',
            reasoningEffort, contextId: reuseContext ? 'same-context' : `fresh-${request.stage.id}`,
          },
          isolation: { method: 'fresh-subagent', freshContext: inheritedTurns === 0, inheritedTurns },
          policy: {
            repositoryAccess: 'read-only-pinned', networkAccess: 'denied', scratch: 'disposable',
          },
          startedAt: '2026-09-24T12:00:00.000Z',
          completedAt: '2026-09-24T12:01:00.000Z',
          status: 'completed',
          digests: {
            instructions: sha256Digest(request.instructions),
            input: sha256Digest(request.input),
            output: sha256Digest(output),
            snapshot: request.snapshotDigest,
          },
        },
      };
    },
  };
}

function dependencies(overrides = {}) {
  return {
    module: moduleDefinition(),
    attemptId: 'attempt-1',
    runId: 'run-1',
    snapshotDigest: digest('a'),
    repositoryPath: '/repo',
    input: { diff: 'pinned' },
    adapter: adapter(),
    loadResource: async ({ path }) => path.endsWith('.json') ? '{"type":"object"}' : `Instructions for ${path}`,
    validateOutput: async () => {},
    evaluate: async () => ({ outcome: 'PASS' }),
    publishArtifacts: async () => [{ path: 'defense.json', sha256: digest('b') }],
    ...overrides,
  };
}

test('agent workflow runtime executes stage dependencies in fresh contexts and publishes only after validation', async () => {
  const seen = [];
  const result = await runAgentWorkflow(dependencies({
    validateOutput: async (schema, output) => seen.push({ schema, output }),
  }));
  assert.equal(result.status, 'completed');
  assert.equal(result.outcome, 'PASS');
  assert.equal(result.receipts.length, 2);
  assert.deepEqual(result.receipts.map((item) => item.provider.contextId), ['fresh-challenge', 'fresh-defend']);
  assert.equal(seen.length, 4);
});

test('agent workflow runtime fails closed without recording a gate failure when isolation or capability is weak', async () => {
  const inherited = await runAgentWorkflow(dependencies({ adapter: adapter({ inheritedTurns: 1 }) }));
  assert.equal(inherited.status, 'unavailable');
  assert.equal(inherited.outcome, 'UNSET');
  assert.match(inherited.failure.message, /zero inherited turns/);

  const downgraded = await runAgentWorkflow(dependencies({ adapter: adapter({ reasoningEffort: 'low' }) }));
  assert.equal(downgraded.status, 'unavailable');
  assert.equal(downgraded.outcome, 'UNSET');
  assert.match(downgraded.failure.message, /descriptor is invalid|downgrades/);

  const reused = await runAgentWorkflow(dependencies({ adapter: adapter({ reuseContext: true }) }));
  assert.equal(reused.status, 'unavailable');
  assert.equal(reused.outcome, 'UNSET');
  assert.match(reused.failure.message, /reused a provider context/);
});

test('agent workflow runtime refuses passage when required publication is missing', async () => {
  const result = await runAgentWorkflow(dependencies({ publishArtifacts: async () => [] }));
  assert.equal(result.status, 'unavailable');
  assert.equal(result.outcome, 'UNSET');
  assert.match(result.failure.message, /Required agent workflow artifact is missing/);
});
