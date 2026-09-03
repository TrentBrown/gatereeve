import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { hashModuleDefinition } from '../../../plugin-src/shared/resources/protocol/modules.js';
import {
  createCommandAuthorizationStore,
  inspectCommandAuthorization,
} from '../main/command-authorization.js';

function sha256(value) {
  return `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
}

async function fixture(commonPath) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'gatereeve-command-repo-'));
  const entrypoint = join(repositoryRoot, 'check.js');
  const support = join(repositoryRoot, 'policy.json');
  await writeFile(entrypoint, 'console.log("ok")\n');
  await writeFile(support, '{}\n');
  const crypto = await import('node:crypto');
  const fileDigest = async (path) => `sha256:${crypto.createHash('sha256').update(await readFile(path)).digest('hex')}`;
  const module = {
    schemaVersion: 1,
    id: 'example/check',
    version: '1.0.0',
    digest: sha256('placeholder'),
    label: 'Check',
    description: 'Run a check.',
    slot: 'feature.finalization',
    dependsOn: [],
    disposition: 'optional',
    locked: false,
    enabledByDefault: false,
    waiverAllowed: true,
    evidence: { kind: 'reference', requiredFor: ['PASS', 'FAIL'] },
    fingerprint: { kind: 'feature-finalization-v1', dependencyBinding: 'event-ids' },
    run: {
      kind: 'command',
      executable: './check.js',
      entrypointDigest: await fileDigest(entrypoint),
      args: ['--json'],
      workingDirectory: 'repository',
      supportFiles: [{ path: 'policy.json', digest: await fileDigest(support) }],
      effects: ['Reads repository files and may access the network.'],
      timeoutSeconds: 30,
    },
  };
  module.digest = hashModuleDefinition(module);
  return {
    repositoryRoot, entrypoint, support, module,
    commonDirectory: async () => commonPath,
  };
}

test('persistent command grants are local, exact-version, and shared only by Git common identity', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'gatereeve-command-auth-'));
  const common = await mkdtemp(join(tmpdir(), 'gatereeve-common-'));
  const first = await fixture(common);
  const linkedWorktree = await fixture(common);
  linkedWorktree.module = structuredClone(first.module);
  const cloneCommon = await mkdtemp(join(tmpdir(), 'gatereeve-clone-common-'));
  const clone = await fixture(cloneCommon);
  clone.module = structuredClone(first.module);
  const store = createCommandAuthorizationStore(userData, {
    createId: () => 'temporary', now: () => '2026-09-03T12:00:00Z',
  });

  const initial = await inspectCommandAuthorization(first.repositoryRoot, first.module, first);
  assert.equal((await store.status(initial)).authorized, false);
  assert.equal((await store.grant(initial)).authorized, true);
  const shared = await inspectCommandAuthorization(linkedWorktree.repositoryRoot, linkedWorktree.module, linkedWorktree);
  assert.equal((await store.status(shared)).authorized, true);
  const separate = await inspectCommandAuthorization(clone.repositoryRoot, clone.module, clone);
  assert.equal((await store.status(separate)).authorized, false);
});

test('changed declared files invalidate persistent consent and block a replacement grant', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'gatereeve-command-auth-change-'));
  const common = await mkdtemp(join(tmpdir(), 'gatereeve-common-change-'));
  const context = await fixture(common);
  const store = createCommandAuthorizationStore(userData, { createId: () => 'temporary' });
  const before = await inspectCommandAuthorization(context.repositoryRoot, context.module, context);
  await store.grant(before);
  await writeFile(context.support, '{"changed":true}\n');
  const after = await inspectCommandAuthorization(context.repositoryRoot, context.module, context);
  const status = await store.status(after);
  assert.equal(status.authorized, false);
  assert.equal(status.persistentEligible, false);
  assert.deepEqual(status.changedInputs, ['policy.json']);
  await assert.rejects(store.grant(after), /Always allow is unavailable/);
});

test('production authorization inspection uses the trusted discovered Git executable', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'gatereeve-command-auth-git-'));
  const common = await mkdtemp(join(tmpdir(), 'gatereeve-common-git-'));
  const context = await fixture(common);
  let invocation = null;
  const store = createCommandAuthorizationStore(userData, {
    gitExecutable: '/trusted/git',
    async execFile(file, args, options) {
      invocation = { file, args, options };
      return { stdout: `${common}\n`, stderr: '' };
    },
  });
  const inspection = await store.inspect(context.repositoryRoot, context.module);
  assert.equal(inspection.persistentEligible, true);
  assert.equal(invocation.file, '/trusted/git');
  assert.deepEqual(invocation.args, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
});
