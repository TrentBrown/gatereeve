import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { hashModuleDefinition } from '../../../plugin-src/shared/resources/protocol/modules.js';
import { createModuleExecutionManager } from '../main/module-execution.js';

function moduleDefinition(kind = 'command') {
  const run = kind === 'command'
    ? { kind, executable: '/usr/bin/true', args: [], workingDirectory: 'repository', effects: ['Runs a check.'], timeoutSeconds: 30 }
    : kind === 'manual'
      ? { kind, instructions: 'Confirm the external check.' }
      : { kind, skillId: 'example:check', invocation: '/example:check' };
  const module = {
    schemaVersion: 1, id: `example/${kind}`, version: '1.0.0', digest: `sha256:${'0'.repeat(64)}`,
    label: `${kind} check`, description: 'Fixture.', slot: 'boundary.evaluation', dependsOn: [],
    disposition: 'optional', locked: false, enabledByDefault: true, waiverAllowed: true,
    evidence: { kind: 'reference', requiredFor: ['PASS', 'FAIL'] },
    fingerprint: { kind: 'boundary-gate-v1', dependencyBinding: 'event-ids' },
    boundary: { gateId: kind, evaluationScope: { SLICE: 'SLICE', FEATURE_FINAL: 'FEATURE' }, guards: ['boundary.context.current'] },
    run,
  };
  module.digest = hashModuleDefinition(module);
  return module;
}

function taskSession(module) {
  return {
    schemaVersion: 1, id: 'module_task_one', kind: 'module-task', name: module.label,
    moduleId: module.id, moduleVersion: module.version, moduleDigest: module.digest,
    attemptId: 'attempt-1', gateId: module.boundary?.gateId ?? module.id,
    projectPath: '/repo', projectName: 'repo',
    status: 'passed', cols: 80, rows: 24, output: 'ok\n',
    startedAt: '2026-09-03T12:00:00Z', finishedAt: '2026-09-03T12:00:01Z',
    exit: { code: 0, signal: null },
    result: { attemptStatus: 'passed', outcome: 'PASS', reason: 'Command completed successfully' },
    structuredOutput: null, error: null,
  };
}

async function harness(module, {
  currentModule = module,
  providers = [],
  observe = async () => { throw new Error('unexpected'); },
  recordError = null,
} = {}) {
  const featureHome = await mkdtemp(join(tmpdir(), 'gatereeve-module-execution-'));
  const listeners = new Set();
  const starts = [];
  const records = [];
  const changes = [];
  let grants = 0;
  const finalization = module.slot === 'feature.finalization';
  const record = {
    events: [
      { featureId: 'feature' },
      {
        type: finalization ? 'FEATURE_FINALIZATION_STARTED' : 'BOUNDARY_STARTED',
        payload: {
          attemptId: 'attempt-1',
          moduleGraph: { modules: [module], enabledModuleIds: [module.id] },
        },
      },
    ],
    modelLock: {
      modelHash: `sha256:${'1'.repeat(64)}`,
      model: { moduleGraph: { modules: [currentModule], enabledModuleIds: [currentModule.id] } },
    },
  };
  const taskManager = {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async start(project, selected, dimensions, context) {
      starts.push({ project, selected, dimensions, context });
      return { ...taskSession(module), status: 'running', finishedAt: null, exit: null, result: null };
    },
    list() { return []; },
    finish(session) { for (const listener of listeners) listener({ type: 'finished', session }); },
  };
  const inspection = {
    commandDigest: `sha256:${'2'.repeat(64)}`,
    components: { repositoryIdentity: `sha256:${'3'.repeat(64)}`, moduleId: module.id },
    persistentEligible: true, changedInputs: [], display: { executable: '/usr/bin/true' },
  };
  const authorizationStore = {
    async inspect() { return inspection; },
    async status() { return { authorized: false, persistentEligible: true, changedInputs: [], supersededCount: 0, authorizedAt: null }; },
    async grant() { grants += 1; return { authorized: true }; },
  };
  const protocol = {
    async prepareBoundaryModule() {
      return {
        attempt: { scope: 'SLICE', gates: [] },
        target: { dependsOn: [] },
        inputs: { exact: true },
      };
    },
    async recordBoundaryModuleOutcome(value) {
      if (recordError) throw recordError;
      records.push(value);
    },
    async prepareFinalizationModule() {
      return {
        attempt: { scope: 'FEATURE', mergeInputSha: 'a'.repeat(40), modules: [] },
        target: { dependsOn: [] },
        inputs: { exact: true },
      };
    },
    async recordFinalizationModuleOutcome(value) {
      if (recordError) throw recordError;
      records.push(value);
    },
  };
  const manager = createModuleExecutionManager({
    protocol, authorizationStore, taskManager,
    providerSupervisor: { observe }, providers,
    readRecord: async () => record,
    randomId: () => 'fixed',
    async onChanged(value) { changes.push(value); },
  });
  return {
    featureHome, manager, taskManager, starts, records, changes,
    get grants() { return grants; },
  };
}

test('previewing a command discloses consent state without starting it', async () => {
  const module = moduleDefinition();
  const fixture = await harness(module);
  const preview = await fixture.manager.preview({
    repositoryRoot: '/repo', featureHome: fixture.featureHome, moduleId: module.id,
    attemptId: 'attempt-1', gateId: 'command',
  });
  assert.equal(preview.kind, 'command');
  assert.equal(preview.command.authorization.authorized, false);
  assert.equal(fixture.starts.length, 0);
});

test('execution retains the module definition pinned by its boundary attempt', async () => {
  const pinned = moduleDefinition();
  const current = moduleDefinition();
  current.version = '2.0.0';
  current.run.executable = '/usr/bin/false';
  current.digest = hashModuleDefinition(current);
  const fixture = await harness(pinned, { currentModule: current });
  await fixture.manager.startCommand({
    repositoryRoot: '/repo', featureHome: fixture.featureHome, project: { path: '/repo', name: 'repo' },
    moduleId: pinned.id, attemptId: 'attempt-1', gateId: 'command', consent: 'once',
    dimensions: { cols: 80, rows: 24 },
  });
  assert.equal(fixture.starts[0].selected.version, '1.0.0');
  assert.equal(fixture.starts[0].selected.run.executable, '/usr/bin/true');
});

test('explicit durable consent starts a dedicated task and fresh completion records core evidence', async () => {
  const module = moduleDefinition();
  const fixture = await harness(module);
  await fixture.manager.startCommand({
    repositoryRoot: '/repo', featureHome: fixture.featureHome, project: { path: '/repo', name: 'repo' },
    moduleId: module.id, attemptId: 'attempt-1', gateId: 'command', consent: 'always',
    dimensions: { cols: 80, rows: 24 },
  });
  assert.equal(fixture.grants, 1);
  fixture.taskManager.finish(taskSession(module));
  await fixture.manager.waitForCompletions();
  assert.equal(fixture.records.length, 1);
  assert.equal(fixture.records[0].outcome, 'PASS');
  const evidence = JSON.parse(await readFile(join(
    fixture.featureHome, fixture.records[0].evidence.path,
  ), 'utf8'));
  assert.equal(evidence.task.id, 'module_task_one');
});

test('provider-backed completion publishes live progress and records only the verified provider outcome', async () => {
  const module = moduleDefinition();
  module.observe = { providerId: 'example/provider', version: '1.0.0' };
  module.digest = hashModuleDefinition(module);
  const live = {
    status: 'waiting', detail: 'Verified external result.', updatedAt: '2026-09-03T12:00:02Z',
    stages: [], actions: [], attempts: [], evidence: [], links: [], failure: null,
  };
  const fixture = await harness(module, {
    providers: [{ id: 'example/provider', version: '1.0.0' }],
    observe: async () => ({ outcome: 'PASS', live, evidence: { source: 'fixture' } }),
  });
  await fixture.manager.startCommand({
    repositoryRoot: '/repo', featureHome: fixture.featureHome, project: { path: '/repo', name: 'repo' },
    moduleId: module.id, attemptId: 'attempt-1', gateId: 'command', consent: 'once',
    dimensions: { cols: 80, rows: 24 },
  });
  fixture.taskManager.finish({
    ...taskSession(module), status: 'awaiting-provider',
    result: { attemptStatus: 'awaiting-provider', outcome: 'UNSET', reason: 'Awaiting provider' },
  });
  await fixture.manager.waitForCompletions();
  assert.equal(fixture.changes[0].live.status, 'running');
  assert.deepEqual(fixture.changes.at(-1).provider.live, live);
  assert.equal(fixture.records.length, 1);
  assert.equal(fixture.records[0].outcome, 'PASS');
});

test('finalization providers observe directly and record through the finalization core adapter', async () => {
  const module = moduleDefinition();
  module.id = 'example/finalization';
  module.label = 'Finalization';
  module.slot = 'feature.finalization';
  delete module.boundary;
  delete module.run;
  module.observe = { providerId: 'example/provider', version: '1.0.0' };
  module.fingerprint.kind = 'feature-finalization-v1';
  module.digest = hashModuleDefinition(module);
  const live = {
    status: 'waiting', detail: 'Release complete.', updatedAt: '2026-09-03T12:00:02Z',
    stages: [], actions: [], attempts: [], evidence: [], links: [], failure: null,
  };
  const fixture = await harness(module, {
    providers: [{ id: 'example/provider', version: '1.0.0' }],
    observe: async () => ({ outcome: 'PASS', live, evidence: { source: 'fixture' } }),
  });
  await fixture.manager.observe({
    repositoryRoot: '/repo', featureHome: fixture.featureHome, moduleId: module.id,
    attemptId: 'attempt-1', gateId: module.id,
  });
  assert.equal(fixture.records.length, 1);
  assert.equal(fixture.records[0].outcome, 'PASS');
  assert.equal(fixture.records[0].module.slot, 'feature.finalization');
  assert.equal(fixture.changes.at(-1).live.status, 'waiting');
});

test('a stale provider result replaces running status with an explicit blocked failure', async () => {
  const module = moduleDefinition();
  module.observe = { providerId: 'example/provider', version: '1.0.0' };
  module.digest = hashModuleDefinition(module);
  const rejecting = await harness(module, {
    providers: [{ id: 'example/provider', version: '1.0.0' }],
    observe: async () => ({
      outcome: 'PASS',
      live: {
        status: 'waiting', detail: 'Verified.', updatedAt: '2026-09-03T12:00:02Z',
        stages: [], actions: [], attempts: [], evidence: [], links: [], failure: null,
      },
      evidence: {},
    }),
    recordError: new Error('Finalization inputs became stale.'),
  });
  await assert.rejects(rejecting.manager.observe({
    repositoryRoot: '/repo', featureHome: rejecting.featureHome, moduleId: module.id,
    attemptId: 'attempt-1', gateId: 'command',
  }), /became stale/);
  assert.equal(rejecting.changes.at(-1).live.status, 'blocked');
  assert.match(rejecting.changes.at(-1).live.detail, /not recorded/);
});
