// @ts-check

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import { gateInputFingerprint } from '../resources/protocol/fingerprint.js';
import { readFeatureRecord } from '../resources/protocol/feature.js';

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function moduleFromRecord(record, moduleId, attemptId) {
  const boundaryStart = record.events.find((event) => (
    event.type === 'BOUNDARY_STARTED' && event.payload?.attemptId === attemptId
  ));
  const graph = boundaryStart?.payload?.moduleGraph ?? record.modelLock.model.moduleGraph;
  const module = graph?.modules.find((item) => item.id === moduleId);
  if (!module) throw new Error('The requested module is not pinned by the selected feature.');
  if (!graph.enabledModuleIds.includes(moduleId)) {
    throw new Error('The requested module is disabled in the selected boundary attempt.');
  }
  return module;
}

function boundaryTarget(record, module, attemptId, gateId) {
  if (module.slot !== 'boundary.evaluation') {
    throw new Error('Feature-finalization execution becomes available with finalization attempts.');
  }
  if (typeof attemptId !== 'string' || typeof gateId !== 'string') {
    throw new Error('Boundary module execution requires an exact attempt and gate.');
  }
  if (module.boundary?.gateId !== gateId) {
    throw new Error('The requested gate does not match the pinned module.');
  }
}

async function writeAttemptEvidence(featureHome, task, extra, randomId) {
  const directory = resolve(featureHome, 'runtime/module-attempts');
  const path = join(directory, `${task.id}.json`);
  const payload = {
    schemaVersion: 1,
    task,
    provider: extra.provider ?? null,
    providerError: extra.providerError ?? null,
    attestation: extra.attestation ?? null,
  };
  const content = `${JSON.stringify(payload, null, 2)}\n`;
  await mkdir(directory, { recursive: true });
  const temporary = `${path}.${randomId()}.tmp`;
  await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await rename(temporary, path);
  return { path: relative(featureHome, path), hash: sha256(content) };
}

export function createModuleExecutionManager({
  protocol,
  authorizationStore,
  taskManager,
  providerSupervisor,
  providers = [],
  randomId = randomUUID,
  now = () => new Date().toISOString(),
  onChanged = async () => {},
  readRecord = readFeatureRecord,
} = {}) {
  if (!protocol || !authorizationStore || !taskManager || !providerSupervisor) {
    throw new TypeError('Module execution requires protocol, authorization, task, and provider adapters.');
  }
  const providersById = new Map(providers.map((provider) => [provider.id, provider]));
  const taskContexts = new Map();
  let completionQueue = Promise.resolve();

  async function context(repositoryRoot, featureHome, moduleId, attemptId, gateId) {
    const record = await readRecord(featureHome);
    const module = moduleFromRecord(record, moduleId, attemptId);
    boundaryTarget(record, module, attemptId, gateId);
    return { repositoryRoot, featureHome, record, module, attemptId, gateId };
  }

  async function complete(task) {
    const active = taskContexts.get(task.id);
    if (!active) return;
    let provider = null;
    let providerError = null;
    let outcome = task.result?.outcome ?? 'UNSET';
    let reason = task.result?.reason ?? null;
    if (task.result?.attemptStatus === 'awaiting-provider') {
      const installed = providersById.get(active.module.observe.providerId);
      if (!installed || installed.version !== active.module.observe.version) {
        providerError = { code: 'PROVIDER_UNAVAILABLE', message: 'The exact observation provider is unavailable.' };
      } else {
        try {
          await onChanged({
            task,
            projectPath: active.repositoryRoot,
            live: {
              status: 'running',
              detail: `Observing with ${installed.id} ${installed.version}.`,
              updatedAt: now(),
              stages: [], actions: [], attempts: [], evidence: [], links: [], failure: null,
            },
          });
          const record = await readRecord(active.featureHome);
          const prepared = await protocol.prepareBoundaryModule(active);
          const inputFingerprint = gateInputFingerprint({
            modelHash: record.modelLock.modelHash,
            attemptId: active.attemptId,
            gateId: active.gateId,
            inputs: prepared.inputs,
          });
          provider = await providerSupervisor.observe(installed, {
            schemaVersion: 1,
            requestId: `provider-${randomId()}`,
            operation: 'observe',
            provider: { id: installed.id, version: installed.version },
            module: {
              id: active.module.id,
              version: active.module.version,
              digest: active.module.digest,
            },
            input: {
              featureId: record.events[0].featureId,
              attemptId: active.attemptId,
              scope: prepared.attempt.scope,
              inputFingerprint,
              dependencyEventIds: Object.fromEntries(prepared.target.dependsOn.map((id) => {
                const dependency = prepared.attempt.gates.find((gate) => gate.id === id);
                return [id, dependency.recordedEventId];
              })),
              evidence: { taskId: task.id, result: task.result, structuredOutput: task.structuredOutput },
            },
          });
          outcome = provider.outcome ?? 'UNSET';
          reason = provider.live.detail ?? reason;
        } catch (error) {
          providerError = { code: error?.code ?? 'PROVIDER_FAILED', message: error?.message ?? String(error) };
        }
      }
    }
    const evidence = await writeAttemptEvidence(active.featureHome, task, {
      provider,
      providerError,
    }, randomId);
    if (['PASS', 'FAIL'].includes(outcome)) {
      await protocol.recordBoundaryModuleOutcome({
        ...active,
        outcome,
        evidence,
        reason,
        actor: { kind: 'agent', label: `GateReeve Desktop module ${active.module.id}` },
      });
    }
    await onChanged({
      task, projectPath: active.repositoryRoot, provider, providerError, evidence,
    });
  }

  function queueCompletion(task) {
    const queuedContext = taskContexts.get(task.id);
    completionQueue = completionQueue.then(() => complete(task)).catch(async (error) => {
      await onChanged({ task, projectPath: queuedContext?.repositoryRoot ?? null, error });
    }).finally(() => taskContexts.delete(task.id));
  }

  const unsubscribe = taskManager.subscribe((event) => {
    if (event.type !== 'finished') return;
    queueCompletion(event.session);
  });

  return Object.freeze({
    async preview({ repositoryRoot, featureHome, moduleId, attemptId, gateId }) {
      const active = await context(repositoryRoot, featureHome, moduleId, attemptId, gateId);
      const run = active.module.run ?? null;
      if (run?.kind !== 'command') {
        return {
          schemaVersion: 1,
          moduleId,
          kind: run?.kind ?? 'observe',
          skill: run?.kind === 'skill' ? { id: run.skillId, invocation: run.invocation ?? `/${run.skillId}` } : null,
          manual: run?.kind === 'manual' ? { instructions: run.instructions } : null,
          command: null,
        };
      }
      const inspection = await authorizationStore.inspect(repositoryRoot, active.module);
      return {
        schemaVersion: 1,
        moduleId,
        kind: 'command',
        skill: null,
        manual: null,
        command: {
          digest: inspection.commandDigest,
          display: inspection.display,
          authorization: await authorizationStore.status(inspection),
        },
      };
    },
    async startCommand({ repositoryRoot, featureHome, project, moduleId, attemptId, gateId, consent, dimensions }) {
      const active = await context(repositoryRoot, featureHome, moduleId, attemptId, gateId);
      if (active.module.run?.kind !== 'command') throw new Error('The selected module is not a command module.');
      await protocol.prepareBoundaryModule(active);
      const inspection = await authorizationStore.inspect(repositoryRoot, active.module);
      const status = await authorizationStore.status(inspection);
      if (consent === 'always') {
        if (!status.authorized) await authorizationStore.grant(inspection);
      } else if (consent !== 'once') {
        throw new Error('Command execution requires Run once or Always allow consent.');
      }
      const task = await taskManager.start(project, active.module, dimensions, { attemptId, gateId });
      taskContexts.set(task.id, active);
      if (task.finishedAt !== null) {
        queueCompletion(task);
      }
      return task;
    },
    async attest({ repositoryRoot, featureHome, moduleId, attemptId, gateId, outcome, summary, confirmationLabel }) {
      const active = await context(repositoryRoot, featureHome, moduleId, attemptId, gateId);
      if (active.module.run?.kind !== 'manual') throw new Error('The selected module is not manual.');
      if (!['PASS', 'FAIL', 'NOT_APPLICABLE'].includes(outcome)) throw new Error('Manual outcome is invalid.');
      if (!summary?.trim() || !confirmationLabel?.trim()) throw new Error('Manual attestation requires a summary and confirmation.');
      const task = {
        schemaVersion: 1,
        id: `manual_${randomId()}`,
        kind: 'manual-attestation',
        moduleId: active.module.id,
        moduleVersion: active.module.version,
        moduleDigest: active.module.digest,
        attemptId,
        gateId,
        outcome,
        summary: summary.trim(),
        recordedAt: now(),
      };
      const evidence = await writeAttemptEvidence(featureHome, task, {
        attestation: { outcome, summary: summary.trim(), confirmationLabel: confirmationLabel.trim() },
      }, randomId);
      await protocol.recordBoundaryModuleOutcome({
        ...active,
        outcome,
        evidence,
        reason: outcome === 'PASS' ? null : summary.trim(),
        actor: { kind: 'human-confirmed', label: confirmationLabel.trim() },
      });
      await onChanged({ task, projectPath: active.repositoryRoot, evidence });
      return { schemaVersion: 1, task, evidence };
    },
    listTasks(projectPath) {
      return taskManager.list(projectPath);
    },
    waitForCompletions() { return completionQueue; },
    close() {
      unsubscribe();
      providerSupervisor.close?.();
    },
  });
}
