import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCaskBaseline } from '../../ci/cask-smoke-baseline.mjs';
const repository = 'TrentBrown/gatereeve', version = '0.1.0-rc.19';
const artifact = { id: 10, name: `gatereeve-v${version}-linked-homebrew-cask-result`, expired: false,
  workflow_run: { id: 20, head_sha: 'a'.repeat(40) } };
const run = { id: 20, head_sha: 'a'.repeat(40), repository: { full_name: repository },
  path: '.github/workflows/release-conductor.yml', event: 'workflow_dispatch', head_branch: 'main', status: 'completed', conclusion: 'failure' };
const options = { repository, version, artifacts: [artifact], readRun: async () => run };
test('Cask rehearsal follows released version and retains publication before a later smoke failure', async () => {
  assert.deepEqual(await selectCaskBaseline(options), { runId: '20', tag: `v${version}`, artifactId: 10 });
  await assert.rejects(selectCaskBaseline({ ...options, version: '0.1.0-rc.20' }), /No retained/);
  await assert.rejects(selectCaskBaseline({ ...options, artifacts: [{ ...artifact, expired: true }] }), /retention/);
});
test('Cask baseline rejects untrusted, active, mismatched or unrelated producers', async () => {
  for (const change of [{ event: 'pull_request' }, { head_branch: 'topic' }, { status: 'in_progress' },
    { path: '.github/workflows/other.yml' }, { repository: { full_name: 'other/repo' } }, { head_sha: 'b'.repeat(40) }, { id: 21 }]) {
    await assert.rejects(selectCaskBaseline({ ...options, readRun: async () => ({ ...run, ...change }) }), /No retained/);
  }
  await assert.rejects(selectCaskBaseline({ ...options, readRun: async () => { throw Error('API unavailable'); } }), /API unavailable/);
});
