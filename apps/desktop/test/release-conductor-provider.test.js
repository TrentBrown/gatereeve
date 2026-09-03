import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { observeReleaseConductor } from '../main/providers/release-conductor-provider.mjs';
import {
  CONDUCTOR_STAGES,
  conductorStateArtifactName,
  createConductorState,
} from '../resources/release/release-conductor-state.js';

const SOURCE = 'b'.repeat(40);
const MERGE = 'a'.repeat(40);
const DIGEST = `sha256:${'c'.repeat(64)}`;
const DMG = 'd'.repeat(64);

const EVIDENCE = {
  INITIALIZED: { version: '0.2.0-rc.1' },
  TRUST_PENDING: { preparationArtifact: 'candidate' },
  TRUSTED: { pluginArtifact: 'plugin', trustArtifact: 'trust', dmgSha256: DMG },
  PRIMARY_FINALIZED: { primaryPlanArtifact: 'primary-plan', primaryPlanSha256: 'e'.repeat(64) },
  PRIMARY_REHEARSED: { primaryRehearsalArtifact: 'primary-rehearsal' },
  PRIMARY_PUBLISHED: { primaryPublicationArtifact: 'primary-publication', primaryRecordSha256: 'f'.repeat(64) },
  WAITING_FOR_DIRECT_INSTALL: { publicDmgSha256: DMG },
  CASK_FINALIZED: {
    directInstallAttestation: {
      confirmedAt: '2026-09-03T10:07:00.000Z', confirmedBy: 'TrentBrown', publicDmgSha256: DMG,
    },
    caskPlanArtifact: 'cask-plan', caskPlanSha256: '1'.repeat(64),
  },
  CASK_REHEARSED: { caskRehearsalArtifact: 'cask-rehearsal' },
  CASK_PUBLISHED: { caskPublicationArtifact: 'cask-publication', caskRecordSha256: '2'.repeat(64) },
  SMOKE_VERIFIED: { smokeArtifacts: ['linked-arm64', 'linked-x64', 'public-arm64', 'public-x64'] },
  COMPLETE: {},
};

function chain(lastStage = 'COMPLETE') {
  const records = [];
  for (const [index, stage] of CONDUCTOR_STAGES.entries()) {
    records.push(createConductorState({
      previous: records.at(-1) ?? null,
      tag: 'v0.2.0-rc.1',
      sourceCommit: SOURCE,
      stage,
      evidence: EVIDENCE[stage],
      run: {
        id: String(1000 + index), attempt: 1, repository: 'TrentBrown/gatereeve',
        workflowRef: 'TrentBrown/gatereeve/.github/workflows/release-conductor.yml@refs/heads/main',
      },
      actor: { login: 'github-actions[bot]' },
      recordedAt: `2026-09-03T10:${String(index).padStart(2, '0')}:00.000Z`,
    }));
    if (stage === lastStage) break;
  }
  return records;
}

function request(mergeInputSha = MERGE, featureId = 'feature-one') {
  return {
    schemaVersion: 1,
    requestId: `request-${featureId}`,
    operation: 'observe',
    provider: { id: 'gatereeve/release-conductor', version: '1.0.0' },
    module: { id: 'gatereeve/release', version: '1.0.0', digest: DIGEST },
    input: {
      featureId,
      attemptId: `attempt-${featureId}`,
      scope: 'FEATURE',
      inputFingerprint: DIGEST,
      dependencyEventIds: {},
      evidence: {
        taskId: null, result: null, structuredOutput: null,
        repositoryRoot: '/repo', featureHome: `/repo/docs/issues/${featureId}`, mergeInputSha,
      },
    },
  };
}

function github(records, { contains = true, expired = false } = {}) {
  const artifacts = records.map((state, index) => ({
    id: 2000 + index,
    name: conductorStateArtifactName(state),
    expired,
    workflow_run: { id: Number(state.run.id) },
  }));
  const byName = new Map(artifacts.map((artifact, index) => [artifact.name, records[index]]));
  return {
    async run(executable, args) {
      if (executable === 'git') return '';
      if (args[0] !== 'run' || args[1] !== 'download') throw new Error(`Unexpected command ${args.join(' ')}`);
      const name = args[args.indexOf('--name') + 1];
      const destination = args[args.indexOf('--dir') + 1];
      await mkdir(destination, { recursive: true });
      await writeFile(join(destination, 'release-state.json'), `${JSON.stringify(byName.get(name))}\n`);
      return '';
    },
    async runJson(_executable, args) {
      if (args[0] === 'repo') return { nameWithOwner: 'TrentBrown/gatereeve' };
      if (args.at(-1)?.includes('/actions/artifacts')) return [{ artifacts }];
      if (args.at(-1)?.includes('/actions/runs/')) {
        const id = Number(args.at(-1).split('/').at(-1));
        return {
          id, head_sha: '9'.repeat(40), head_branch: 'main', event: 'workflow_dispatch',
          path: '.github/workflows/release-conductor.yml', conclusion: 'success',
        };
      }
      if (args.at(-1)?.includes('/compare/')) {
        const comparison = args.at(-1);
        if (comparison.includes(`${MERGE}...${SOURCE}`)) return { status: contains ? 'ahead' : 'diverged' };
        return { status: 'ahead' };
      }
      throw new Error(`Unexpected JSON command ${args.join(' ')}`);
    },
  };
}

test('terminal conductor evidence passes every feature whose final merge is contained', async () => {
  const records = chain();
  const adapters = github(records);
  const first = await observeReleaseConductor(request(MERGE, 'feature-one'), adapters);
  const second = await observeReleaseConductor(request(MERGE, 'feature-two'), adapters);
  assert.equal(first.outcome, 'PASS');
  assert.equal(second.outcome, 'PASS');
  assert.equal(first.evidence.releaseSourceCommit, SOURCE);
  assert.equal(first.live.stages.at(-1).id, 'COMPLETE');
  assert.equal(first.live.attempts[0].recordedAt, '2026-09-03T10:00:00.000Z');
});

test('nonterminal, wrong-source, and expired conductor evidence never passes', async () => {
  const nonterminal = await observeReleaseConductor(
    request(),
    github(chain('PRIMARY_REHEARSED')),
  );
  assert.equal(nonterminal.outcome, null);
  assert.match(nonterminal.live.detail, /PRIMARY_REHEARSED/u);

  const wrongSource = await observeReleaseConductor(request(), github(chain(), { contains: false }));
  assert.equal(wrongSource.outcome, null);
  assert.match(wrongSource.live.detail, /No retained/u);

  const expired = await observeReleaseConductor(request(), github(chain(), { expired: true }));
  assert.equal(expired.outcome, null);
  assert.equal(expired.live.failure.code, 'CONDUCTOR_EVIDENCE_INVALID');
});

test('valid conductor failure checkpoints remain visible and nonterminal', async () => {
  const records = chain('PRIMARY_REHEARSED');
  records.push(createConductorState({
    previous: records.at(-1),
    stage: 'PRIMARY_REHEARSED',
    evidence: {},
    run: {
      id: '2000', attempt: 1, repository: 'TrentBrown/gatereeve',
      workflowRef: 'TrentBrown/gatereeve/.github/workflows/release-conductor.yml@refs/heads/main',
    },
    actor: { login: 'github-actions[bot]' },
    failure: { code: 'PUBLICATION_FAILED', message: 'Publication must be retried.', retryable: true },
    recordedAt: '2026-09-03T10:07:00.000Z',
  }));
  const result = await observeReleaseConductor(request(), github(records));
  assert.equal(result.outcome, null);
  assert.equal(result.live.status, 'blocked');
  assert.equal(result.live.failure.code, 'PUBLICATION_FAILED');
  assert.match(result.live.detail, /retried/u);
});
