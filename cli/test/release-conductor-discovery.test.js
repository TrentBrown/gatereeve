import assert from 'node:assert/strict';
import test from 'node:test';

import { discoverConductorState } from '../src/plugin/release-conductor-discovery.js';
import {
  conductorStateArtifactName,
  createConductorState,
} from '../src/plugin/release-conductor-state.js';

const SOURCE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);

function states() {
  const initial = createConductorState({
    tag: 'v0.1.0-rc.9',
    sourceCommit: SOURCE,
    stage: 'INITIALIZED',
    evidence: { version: '0.1.0-rc.9' },
    run: {
      id: '201',
      attempt: 1,
      repository: 'TrentBrown/gatereeve',
      workflowRef: 'TrentBrown/gatereeve/.github/workflows/release-conductor.yml@refs/heads/main',
    },
    actor: { login: 'TrentBrown' },
    recordedAt: '2026-09-02T00:01:00.000Z',
  });
  const pending = createConductorState({
    previous: initial,
    stage: 'TRUST_PENDING',
    evidence: { preparationArtifact: 'coordinated-plugin-candidate' },
    run: { ...initial.run },
    actor: { login: 'github-actions[bot]' },
    recordedAt: '2026-09-02T00:02:00.000Z',
  });
  const failed = createConductorState({
    previous: pending,
    stage: 'TRUST_PENDING',
    run: {
      ...pending.run,
      id: '202',
      attempt: 2,
    },
    actor: { login: 'github-actions[bot]' },
    recordedAt: '2026-09-02T00:03:00.000Z',
    failure: { code: 'APPLE_TIMEOUT', message: 'Apple polling timed out', retryable: true },
  });
  return [initial, pending, failed];
}

function artifacts(records = states()) {
  return records.map((state, index) => ({
    id: 300 + index,
    name: conductorStateArtifactName(state),
    expired: false,
    workflowRun: {
      id: Number(state.run.id),
      headSha: HEAD,
      headBranch: 'main',
      event: 'workflow_dispatch',
      path: '.github/workflows/release-conductor.yml',
      conclusion: state.condition === 'failed' ? 'failure' : 'success',
    },
  }));
}

function readers(records = states(), listed = artifacts(records)) {
  const byId = new Map(
    artifacts(records).map((artifact, index) => [artifact.id, records[index]]),
  );
  return {
    listArtifacts: async () => listed,
    readArtifactState: async (artifact) => structuredClone(byId.get(artifact.id)),
    isAncestor: async (source, head) => source === SOURCE && head === HEAD,
  };
}

test('discovers an unordered unique chain by tag and projects retry state', async () => {
  const records = states();
  const listed = artifacts(records).reverse();
  const discovered = await discoverConductorState({
    tag: 'v0.1.0-rc.9',
    ...readers(records, listed),
  });
  assert.deepEqual(discovered.chain, records);
  assert.equal(discovered.latest.condition, 'failed');
  assert.equal(discovered.status.nextAction, 'RESUME');
  assert.deepEqual(
    discovered.artifacts.map((entry) => entry.artifact.id),
    [300, 301, 302],
  );
});

test('rejects absent, expired, renamed, wrong-run, non-main, and nonconductor artifacts', async () => {
  await assert.rejects(discoverConductorState({
    tag: 'v0.1.0-rc.9',
    listArtifacts: async () => [],
    readArtifactState: async () => null,
    isAncestor: async () => true,
  }), /No Release Conductor state/u);

  for (const mutate of [
    (artifact) => { artifact.expired = true; },
    (artifact) => { artifact.name += '-changed'; },
    (artifact) => { artifact.workflowRun.id = 999; },
    (artifact) => { artifact.workflowRun.headBranch = 'topic'; },
    (artifact) => { artifact.workflowRun.path = '.github/workflows/other.yml'; },
  ]) {
    const records = states();
    const listed = artifacts(records);
    mutate(listed[0]);
    await assert.rejects(discoverConductorState({
      tag: 'v0.1.0-rc.9',
      ...readers(records, listed),
    }));
  }
});

test('rejects divergent sequences and source commits outside the workflow history', async () => {
  const records = states();
  const divergent = structuredClone(records[2]);
  divergent.sequence = 2;
  divergent.predecessorSha256 = records[1].predecessorSha256;
  const divergedRecords = [records[0], records[1], divergent];
  const listed = artifacts(divergedRecords);
  await assert.rejects(discoverConductorState({
    tag: 'v0.1.0-rc.9',
    ...readers(divergedRecords, listed),
  }), /divergent sequence 2/u);

  await assert.rejects(discoverConductorState({
    tag: 'v0.1.0-rc.9',
    ...readers(),
    isAncestor: async () => false,
  }), /cannot contain its source commit/u);
});

test('accepts completed checkpoints from a conductor run that later failed', async () => {
  const records = states().slice(0, 2);
  const listed = artifacts(records);
  listed[0].workflowRun.conclusion = 'failure';
  listed[1].workflowRun.conclusion = 'failure';
  const discovered = await discoverConductorState({
    tag: 'v0.1.0-rc.9',
    ...readers(records, listed),
  });
  assert.equal(discovered.latest.stage, 'TRUST_PENDING');
  assert.equal(discovered.latest.condition, 'waiting');
});
