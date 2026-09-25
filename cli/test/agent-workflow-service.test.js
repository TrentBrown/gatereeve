import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  executeAgentWorkflowGate,
  hashModuleDefinition,
  sha256Digest,
} from '../../plugin-src/shared/resources/protocol/index.js';

const SHA = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const MODEL = `sha256:${'c'.repeat(64)}`;

function moduleDefinition({ dependsOn = [] } = {}) {
  const value = {
    schemaVersion: 1,
    id: 'example/report',
    version: '1.0.0',
    digest: `sha256:${'0'.repeat(64)}`,
    label: 'Report',
    description: 'Fixture report.',
    slot: 'boundary.evaluation',
    dependsOn,
    disposition: 'required',
    locked: false,
    enabledByDefault: true,
    waiverAllowed: true,
    evidence: { kind: 'reference', requiredFor: ['PASS', 'FAIL'] },
    fingerprint: { kind: 'boundary-gate-v1', dependencyBinding: 'event-ids' },
    boundary: {
      gateId: 'report',
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
      stages: [{
        id: 'report', role: 'Reporter', dependsOn: [], promptResource: 'prompt.md',
        inputSchema: 'input.json', outputSchema: 'output.json',
      }],
      artifacts: [{ path: 'report.json', mediaType: 'application/json', required: true }],
      evaluator: { resource: 'validator.js', export: 'createBundle' },
      evidenceRoot: 'report.json',
      timeoutSeconds: 10,
      maxAttempts: 1,
    },
  };
  value.digest = hashModuleDefinition(value);
  return value;
}

function adapter({ complete = true, onRequest = null } = {}) {
  return {
    async describe() {
      return {
        schemaVersion: 1, id: 'test/fresh', version: '1.0.0', provider: 'test',
        model: 'test-model', reasoningEffort: 'high', capabilityProfiles: ['high-capability-v1'],
        isolationMethods: ['test-fresh'],
      };
    },
    async runStage(request) {
      if (!complete) throw new Error('provider unavailable');
      onRequest?.(request);
      const output = { answer: 'Evidence-backed.' };
      return {
        output,
        receipt: {
          schemaVersion: 1, kind: 'gatereeve-agent-workflow-receipt', protocolVersion: 1,
          runId: request.runId, attemptId: request.attemptId, module: request.module,
          stage: request.stage.id,
          provider: {
            id: 'test', adapterVersion: '1.0.0', model: 'test-model',
            reasoningEffort: 'high', contextId: 'fresh-report',
          },
          isolation: { method: 'test-fresh', freshContext: true, inheritedTurns: 0 },
          policy: { repositoryAccess: 'read-only-pinned', networkAccess: 'denied', scratch: 'disposable' },
          startedAt: '2026-09-24T00:00:00.000Z', completedAt: '2026-09-24T00:00:01.000Z',
          status: 'completed',
          digests: {
            instructions: sha256Digest(request.instructions), input: sha256Digest(request.input),
            output: sha256Digest(output), snapshot: request.snapshotDigest,
          },
        },
      };
    },
  };
}

function prepared(dependency = null) {
  return {
    attempt: {
      id: 'attempt-1', scope: 'SLICE',
      gates: dependency === null ? [] : [{
        id: 'verification', moduleId: 'gatereeve/verification',
        outcome: 'PASS', recordedEventId: 'evt-verification',
        evidence: dependency,
      }],
    },
    target: { id: 'report', dependsOn: dependency === null ? [] : ['verification'] },
    inputs: { context: { mergeBaseSha: BASE, evaluatedSourceSha: SHA } },
  };
}

test('publishes a validated root and records only the completed governed outcome', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-agent-service-'));
  let recorded = null;
  let cleaned = false;
  let snapshotOptions = null;
  let stageRequest = null;
  try {
    const verification = '# Verification\n\nPASS\n';
    await writeFile(join(root, 'verification.md'), verification);
    const result = await executeAgentWorkflowGate({
      repositoryRoot: root,
      featureHome: root,
      artifactRoot: join(root, 'packet'),
      modelHash: MODEL,
      module: moduleDefinition({ dependsOn: ['gatereeve/verification'] }),
      prepared: prepared({ path: 'verification.md', hash: sha256Digest(verification) }),
      adapter: adapter({ onRequest: (value) => { stageRequest = value; } }),
      resources: {
        loadResource: async ({ path }) => path.endsWith('.md') ? 'Create the report.' : JSON.stringify({ type: 'object' }),
        loadEvaluator: async () => ({ module, outputs }) => ({
          outcome: 'PASS', files: { 'report.json': { module: module.id, answer: outputs.report.answer } },
        }),
      },
      buildChangeInput: async (input) => ({ schemaVersion: 1, source: input, patch: 'diff' }),
      createSnapshot: async (options) => {
        snapshotOptions = options;
        return {
        repositoryPath: root, digest: `sha256:${'d'.repeat(64)}`,
        cleanup: async () => { cleaned = true; },
        };
      },
      recordOutcome: async (value) => { recorded = value; return { event: { eventId: 'evt-result' } }; },
      createId: () => 'run-1',
    });
    assert.equal(result.status, 'completed');
    assert.equal(result.outcome, 'PASS');
    assert.equal(result.evidence.path, 'packet/attempts/attempt-1/report.json');
    assert.equal(recorded.outcome, 'PASS');
    assert.deepEqual(recorded.evidence, result.evidence);
    assert.equal(cleaned, true);
    assert.deepEqual(stageRequest.input.initial.change.patch, {
      kind: 'snapshot-file',
      path: '.gatereeve-agent-evidence/feature.patch',
      hash: sha256Digest('diff'),
      bytes: 4,
    });
    assert.equal(snapshotOptions.evidenceFiles['.gatereeve-agent-evidence/feature.patch'], 'diff');
    assert.deepEqual(stageRequest.input.initial.dependencyEvidence.verification, {
      outcome: 'PASS',
      eventId: 'evt-verification',
      kind: 'snapshot-file',
      path: '.gatereeve-agent-evidence/gates/verification/verification.md',
      hash: sha256Digest(verification),
      bytes: Buffer.byteLength(verification, 'utf8'),
    });
    assert.equal(
      snapshotOptions.evidenceFiles['.gatereeve-agent-evidence/gates/verification/verification.md'],
      verification
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ordering-only predecessors are never exposed as agent evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-agent-ordering-'));
  let stageRequest = null;
  let snapshotOptions = null;
  try {
    const verification = '# Verification\n\nPASS\n';
    const judge = '{"outcome":"PASS","private":"must-not-leak"}\n';
    await writeFile(join(root, 'verification.md'), verification);
    await writeFile(join(root, 'judge.json'), judge);
    const preparedWithOrdering = prepared({
      path: 'verification.md', hash: sha256Digest(verification),
    });
    preparedWithOrdering.attempt.gates.push({
      id: 'judge', moduleId: 'gatereeve/judge', outcome: 'PASS',
      recordedEventId: 'evt-judge',
      evidence: { path: 'judge.json', hash: sha256Digest(judge) },
    });
    preparedWithOrdering.target.dependsOn.push('judge');

    await executeAgentWorkflowGate({
      repositoryRoot: root,
      featureHome: root,
      artifactRoot: join(root, 'packet'),
      modelHash: MODEL,
      module: moduleDefinition({ dependsOn: ['gatereeve/verification'] }),
      prepared: preparedWithOrdering,
      adapter: adapter({ onRequest: (value) => { stageRequest = value; } }),
      resources: {
        loadResource: async ({ path }) => path.endsWith('.md')
          ? 'Create the report.'
          : JSON.stringify({ type: 'object' }),
        loadEvaluator: async () => ({ module, outputs }) => ({
          outcome: 'PASS', files: { 'report.json': { module: module.id, answer: outputs.report.answer } },
        }),
      },
      buildChangeInput: async () => ({}),
      createSnapshot: async (options) => {
        snapshotOptions = options;
        return {
          repositoryPath: root, digest: `sha256:${'d'.repeat(64)}`, cleanup: async () => {},
        };
      },
      recordOutcome: async () => ({ event: { eventId: 'evt-result' } }),
      createId: () => 'run-ordering',
    });

    assert.deepEqual(Object.keys(stageRequest.input.initial.dependencyEvidence), ['verification']);
    assert.equal(
      Object.keys(snapshotOptions.evidenceFiles).some((path) => path.includes('/judge/')),
      false
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('provider unavailability leaves the gate UNSET and does not call the recorder', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-agent-service-unavailable-'));
  let recorded = false;
  try {
    const result = await executeAgentWorkflowGate({
      repositoryRoot: root, featureHome: root, artifactRoot: join(root, 'packet'),
      modelHash: MODEL, module: moduleDefinition(), prepared: prepared(), adapter: adapter({ complete: false }),
      resources: {
        loadResource: async ({ path }) => path.endsWith('.md') ? 'Create the report.' : JSON.stringify({ type: 'object' }),
        loadEvaluator: async () => () => ({ outcome: 'PASS', files: { 'report.json': {} } }),
      },
      buildChangeInput: async () => ({}),
      createSnapshot: async () => ({
        repositoryPath: root, digest: `sha256:${'d'.repeat(64)}`, cleanup: async () => {},
      }),
      recordOutcome: async () => { recorded = true; },
    });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.outcome, 'UNSET');
    assert.equal(recorded, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('changed dependency evidence fails before snapshot or provider launch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-agent-service-evidence-'));
  let snapshotCreated = false;
  try {
    await writeFile(join(root, 'verification.md'), 'changed\n');
    await assert.rejects(
      executeAgentWorkflowGate({
        repositoryRoot: root,
        featureHome: root,
        artifactRoot: join(root, 'packet'),
        modelHash: MODEL,
        module: moduleDefinition({ dependsOn: ['gatereeve/verification'] }),
        prepared: prepared({ path: 'verification.md', hash: sha256Digest('expected\n') }),
        adapter: adapter(),
        resources: {
          loadResource: async () => '{}',
          loadEvaluator: async () => () => ({ outcome: 'PASS', files: { 'report.json': {} } }),
        },
        buildChangeInput: async () => ({}),
        createSnapshot: async () => { snapshotCreated = true; },
        recordOutcome: async () => {},
      }),
      /evidence is unavailable or changed/u
    );
    assert.equal(snapshotCreated, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
