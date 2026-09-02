import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  conductorBundleFiles,
  readConductorStateBundle,
  writeConductorStateBundle,
} from '../src/plugin/release-conductor-artifact.js';
import {
  createConductorState,
  releaseStateSha256,
} from '../src/plugin/release-conductor-state.js';

function fixtureChain() {
  const initial = createConductorState({
    tag: 'v0.1.0-rc.9',
    sourceCommit: 'a'.repeat(40),
    stage: 'INITIALIZED',
    evidence: { version: '0.1.0-rc.9' },
    run: {
      id: '101',
      attempt: 1,
      repository: 'TrentBrown/gatereeve',
      workflowRef: 'TrentBrown/gatereeve/.github/workflows/release-conductor.yml@refs/heads/main',
    },
    actor: { login: 'TrentBrown' },
    recordedAt: '2026-09-02T00:01:00.000Z',
  });
  return [initial, createConductorState({
    previous: initial,
    stage: 'TRUST_PENDING',
    evidence: { preparationArtifact: 'coordinated-plugin-candidate' },
    run: {
      id: '101',
      attempt: 1,
      repository: 'TrentBrown/gatereeve',
      workflowRef: 'TrentBrown/gatereeve/.github/workflows/release-conductor.yml@refs/heads/main',
    },
    actor: { login: 'github-actions[bot]' },
    recordedAt: '2026-09-02T00:02:00.000Z',
  })];
}

test('writes and verifies a self-consistent state, status, checksum, and summary bundle', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'gatereeve-conductor-bundle-'));
  try {
    const output = join(temporary, 'state');
    const chain = fixtureChain();
    const written = await writeConductorStateBundle({ outputDirectory: output, chain });
    assert.deepEqual(written.files, conductorBundleFiles);
    assert.equal(written.status.stateSha256, releaseStateSha256(chain.at(-1)));
    const verified = await readConductorStateBundle(output);
    assert.deepEqual(verified.chain, chain);
    assert.deepEqual(verified.state, chain.at(-1));
    assert.match(verified.summary, /APPROVE_TRUST/u);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('refuses nonempty output and detects changed state projections', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'gatereeve-conductor-bundle-'));
  try {
    const output = join(temporary, 'state');
    const chain = fixtureChain();
    await writeConductorStateBundle({ outputDirectory: output, chain });
    await assert.rejects(
      writeConductorStateBundle({ outputDirectory: output, chain }),
      /must be empty/u,
    );

    const statusPath = join(output, 'release-status.json');
    const status = JSON.parse(await readFile(statusPath, 'utf8'));
    status.nextAction = 'PUBLISH_WITHOUT_APPROVAL';
    await writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`);
    await assert.rejects(readConductorStateBundle(output), /status differs from state/u);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('detects changed chain bytes even when the latest state file is untouched', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'gatereeve-conductor-bundle-'));
  try {
    const output = join(temporary, 'state');
    await writeConductorStateBundle({ outputDirectory: output, chain: fixtureChain() });
    const chainPath = join(output, 'release-state-chain.json');
    const chain = JSON.parse(await readFile(chainPath, 'utf8'));
    chain[0].actor.login = 'attacker';
    await writeFile(chainPath, `${JSON.stringify(chain)}\n`);
    await assert.rejects(readConductorStateBundle(output), /predecessor digest differs/u);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
