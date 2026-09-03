import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { initializeFeature } from '../../../plugin-src/shared/resources/protocol/feature.js';
import { loadDefaultModel } from '../../../plugin-src/shared/resources/protocol/model.js';
import { createProtocolAdapter } from '../main/protocol-adapter.js';

const run = promisify(execFile);

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('Desktop reads canonical snapshots and details without journal mutation or CLI execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-desktop-protocol-'));
  const featureHome = join(root, 'docs/issues/desktop-fixture');
  await initializeFeature({
    featureHome,
    featureId: 'desktop-fixture',
    actor: { kind: 'agent', label: 'desktop protocol test' },
    eventId: 'evt-desktop-init',
    recordedAt: '2026-08-26T12:00:00.000Z',
  });
  const journalPath = join(featureHome, 'events.jsonl');
  const before = digest(await readFile(journalPath));
  const adapter = createProtocolAdapter();
  const snapshot = await adapter.snapshot(featureHome, {
    sources: {
      local: { status: 'current', detail: 'fixture', checkedAt: '2026-08-26T12:00:00.000Z' },
    },
  });
  const events = await adapter.read(featureHome, 'events');
  assert.equal(snapshot.featureId, 'desktop-fixture');
  assert.equal(snapshot.mode, 'governed');
  assert.equal(snapshot.modules.schemaVersion, 1);
  assert.equal(snapshot.modules.slots.length, 2);
  assert.equal(
    snapshot.modules.slots.find((slot) => slot.id === 'boundary.evaluation').modules
      .find((module) => module.id === 'gatereeve/judge').label,
    'Judge',
  );
  assert.equal(
    snapshot.modules.slots.find((slot) => slot.id === 'feature.finalization').modules.length,
    0,
  );
  assert.equal(events.kind, 'events');
  assert.equal(digest(await readFile(journalPath)), before);
});

test('Desktop preserves canonical missing, legacy, inconsistent, and incompatible diagnostics', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-desktop-modes-'));
  const adapter = createProtocolAdapter();
  const missing = join(root, 'missing');
  assert.equal((await adapter.snapshot(missing)).mode, 'missing');

  const legacy = join(root, 'legacy');
  await mkdir(legacy);
  assert.equal((await adapter.snapshot(legacy)).mode, 'legacy');

  const inconsistent = join(root, 'inconsistent');
  await mkdir(inconsistent);
  await writeFile(join(inconsistent, 'events.jsonl'), '');
  assert.equal((await adapter.snapshot(inconsistent)).mode, 'inconsistent');

  const incompatible = join(root, 'incompatible');
  const model = { ...(await loadDefaultModel()), modelId: 'example/custom-workflow' };
  await initializeFeature({
    featureHome: incompatible,
    featureId: 'incompatible-fixture',
    model,
    actor: { kind: 'agent', label: 'desktop protocol test' },
    eventId: 'evt-incompatible-init',
    recordedAt: '2026-08-26T12:00:00.000Z',
  });
  assert.equal((await adapter.snapshot(incompatible)).mode, 'incompatible');
});

test('Desktop boundary waivers verify pinned context and retain only exact dependency fingerprints', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'gatereeve-desktop-waiver-'));
  const calls = [];
  let contextPath = null;
  let sequence = 0;
  const adapter = createProtocolAdapter({
    temporaryDirectory,
    randomId: () => `id-${sequence += 1}`,
    readRecord: async () => ({ modelLock: { modelHash: `sha256:${'a'.repeat(64)}` } }),
    project: () => ({
      boundaryAttempts: [{
        id: 'attempt-1', scope: 'SLICE', state: 'ACTIVE', context: { headSha: 'a'.repeat(40) },
        gates: [{
          id: 'pinContext', waiverAllowed: false, locked: true,
          inputFingerprint: `sha256:${'b'.repeat(64)}`,
        }, {
          id: 'judge', moduleId: 'gatereeve/judge', moduleVersion: '1.0.0',
          moduleDigest: `sha256:${'c'.repeat(64)}`,
          waiverAllowed: true, locked: false, inputFingerprint: null,
        }],
      }],
    }),
    runGuard: async (_guard, args, options) => {
      assert.equal(args[0], 'check-current');
      assert.equal(args[args.indexOf('--git-executable') + 1], 'git');
      contextPath = args[args.indexOf('--context') + 1];
      calls.push(['guard', options.cwd, options.pythonExecutable]);
      assert.equal(JSON.parse(await readFile(contextPath, 'utf8')).headSha, 'a'.repeat(40));
      return { passed: true, data: { status: 'current', evaluatedSourceSha: 'a'.repeat(40) } };
    },
    recordWaiver: async (featureHome, request) => {
      calls.push(['waiver', featureHome, request]);
      return { event: { eventId: request.eventId } };
    },
  });
  const result = await adapter.waiveBoundaryGate({
    featureHome: '/repo/docs/issues/feature',
    repositoryRoot: '/repo',
    attemptId: 'attempt-1',
    gateId: 'judge',
    reason: '  Small and low risk.  ',
    confirmationLabel: '  Trent  ',
  });
  assert.equal(result.event.eventId, 'evt-desktop-waiver-id-2');
  assert.deepEqual(calls[0], ['guard', '/repo', 'python3']);
  const waiver = calls[1][2];
  assert.equal(waiver.reason, 'Small and low risk.');
  assert.deepEqual(waiver.actor, { kind: 'human-confirmed', label: 'Trent' });
  assert.deepEqual(waiver.inputs, {
    schemaVersion: 1,
    scope: 'SLICE',
    gate: {
      id: 'judge',
      moduleId: 'gatereeve/judge',
      moduleVersion: '1.0.0',
      moduleDigest: `sha256:${'c'.repeat(64)}`,
    },
    context: { status: 'current', evaluatedSourceSha: 'a'.repeat(40) },
  });
  assert.deepEqual(waiver.currentFingerprints, {
    pinContext: `sha256:${'b'.repeat(64)}`,
  });
  await assert.rejects(access(contextPath), /ENOENT/);
});

test('Desktop rejects waiver mutation once human review has begun', async () => {
  const adapter = createProtocolAdapter({
    readRecord: async () => ({ modelLock: { modelHash: `sha256:${'a'.repeat(64)}` } }),
    project: () => ({
      boundaryAttempts: [{
        id: 'attempt-1', scope: 'SLICE', state: 'HUMAN_REVIEW', context: {},
        gates: [{ id: 'judge', waiverAllowed: true, locked: false }],
      }],
    }),
  });
  await assert.rejects(adapter.waiveBoundaryGate({
    featureHome: '/repo/docs/issues/feature',
    repositoryRoot: '/repo',
    attemptId: 'attempt-1',
    gateId: 'judge',
    reason: 'Too late',
    confirmationLabel: 'Trent',
  }), /not active/);
});

test('Desktop module outcomes revalidate pinned identity and pass only through protocol core', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'gatereeve-desktop-module-outcome-'));
  const module = {
    id: 'example/check', version: '1.0.0', digest: `sha256:${'c'.repeat(64)}`,
  };
  const gates = [{
    id: 'verification', moduleId: 'gatereeve/verification', moduleVersion: '1.0.0',
    moduleDigest: `sha256:${'b'.repeat(64)}`, inputFingerprint: `sha256:${'d'.repeat(64)}`,
    recordedEventId: 'evt-verification', dependsOn: [], eligible: false,
  }, {
    id: 'check', moduleId: module.id, moduleVersion: module.version,
    moduleDigest: module.digest, inputFingerprint: null, recordedEventId: null,
    dependsOn: ['verification'], eligible: true,
  }];
  let guards = 0;
  let recorded = null;
  const adapter = createProtocolAdapter({
    temporaryDirectory,
    randomId: () => `runtime-${guards}`,
    readRecord: async () => ({ modelLock: { modelHash: `sha256:${'a'.repeat(64)}` } }),
    project: () => ({
      boundaryAttempts: [{
        id: 'attempt-1', scope: 'SLICE', state: 'ACTIVE', context: { headSha: 'a'.repeat(40) }, gates,
      }],
    }),
    runGuard: async () => {
      guards += 1;
      return { passed: true, data: { status: 'current', evaluatedSourceSha: 'a'.repeat(40) } };
    },
    recordOutcome: async (_featureHome, request) => {
      recorded = request;
      return { event: { eventId: request.eventId } };
    },
  });
  const target = {
    featureHome: '/repo/docs/issues/feature', repositoryRoot: '/repo',
    attemptId: 'attempt-1', gateId: 'check', module,
  };
  assert.equal((await adapter.prepareBoundaryModule(target)).target.moduleId, module.id);
  const evidence = { path: 'runtime/module-attempts/task.json', hash: `sha256:${'e'.repeat(64)}` };
  await adapter.recordBoundaryModuleOutcome({
    ...target, outcome: 'PASS', evidence, actor: { kind: 'agent', label: 'Desktop' },
  });
  assert.equal(guards, 2);
  assert.equal(recorded.outcome, 'PASS');
  assert.deepEqual(recorded.evidence, evidence);
  assert.deepEqual(recorded.currentFingerprints, { verification: `sha256:${'d'.repeat(64)}` });
  await assert.rejects(adapter.prepareBoundaryModule({
    ...target, module: { ...module, version: '2.0.0' },
  }), /no longer matches/);
  assert.equal(guards, 2);
});

test('Desktop packaged waiver guard executes through discovered Python and GitHub paths', async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'gatereeve-desktop-guard-'));
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'gatereeve-desktop-guard-context-'));
  const git = async (...args) => (await run('git', args, { cwd: repositoryRoot })).stdout.trim();
  await git('init', '-b', 'main');
  await git('config', 'user.name', 'Desktop Guard Test');
  await git('config', 'user.email', 'desktop-guard@example.test');
  await git('config', 'commit.gpgsign', 'false');
  await git('config', 'core.hooksPath', '.git/disabled-hooks');
  await writeFile(join(repositoryRoot, 'README.md'), 'base\n');
  await git('add', 'README.md');
  await git('commit', '-m', 'base');
  const baseSha = await git('rev-parse', 'HEAD');
  await git('switch', '-c', 'topic-module-waiver');
  await writeFile(join(repositoryRoot, 'module.txt'), 'changed\n');
  await git('add', 'module.txt');
  await git('commit', '-m', 'module change');
  const headSha = await git('rev-parse', 'HEAD');
  const pullRequest = {
    repository: 'example/gatereeve', number: 62,
    url: 'https://github.com/example/gatereeve/pull/62', state: 'OPEN', isDraft: true,
    baseRefName: 'main', baseRefOid: baseSha,
    headRefName: 'topic-module-waiver', headRefOid: headSha,
  };
  const fakeGh = join(repositoryRoot, 'fake-gh');
  await writeFile(fakeGh, [
    '#!/bin/sh',
    'if [ "$1" = "repo" ]; then',
    "  printf '%s\\n' '{\"nameWithOwner\":\"example/gatereeve\"}'",
    'else',
    `  printf '%s\\n' '${JSON.stringify(Object.fromEntries(
      Object.entries(pullRequest).filter(([key]) => key !== 'repository'),
    ))}'`,
    'fi',
    '',
  ].join('\n'));
  await chmod(fakeGh, 0o755);
  const context = {
    schemaVersion: 1, source: 'github', repositoryRoot, repositoryAlias: 'product',
    remote: 'origin', pullRequest, mergeBaseSha: baseSha,
    evaluatedSourceSha: headSha, featureBaseSha: baseSha,
  };
  let recorded = null;
  const adapter = createProtocolAdapter({
    ghExecutable: fakeGh,
    pythonExecutable: 'python3',
    temporaryDirectory,
    randomId: () => 'packaged',
    readRecord: async () => ({ modelLock: { modelHash: `sha256:${'a'.repeat(64)}` } }),
    project: () => ({
      boundaryAttempts: [{
        id: 'attempt-1', scope: 'SLICE', state: 'ACTIVE', context,
        gates: [{
          id: 'verification', moduleId: 'gatereeve/verification',
          moduleVersion: '1.0.0', moduleDigest: `sha256:${'b'.repeat(64)}`,
          waiverAllowed: true, locked: false, inputFingerprint: null,
        }],
      }],
    }),
    recordWaiver: async (_featureHome, request) => {
      recorded = request;
      return { event: { eventId: request.eventId } };
    },
  });
  const result = await adapter.waiveBoundaryGate({
    featureHome: join(repositoryRoot, 'docs/issues/fixture'),
    repositoryRoot,
    attemptId: 'attempt-1',
    gateId: 'verification',
    reason: 'Accepted risk.',
    confirmationLabel: 'Trent',
  });
  assert.equal(result.event.eventId, 'evt-desktop-waiver-packaged');
  assert.equal(recorded.inputs.context.status, 'current');
  assert.equal(recorded.inputs.context.evaluatedSourceSha, headSha);
  await assert.rejects(access(join(temporaryDirectory, 'gatereeve-waiver-packaged.json')), /ENOENT/);
});
