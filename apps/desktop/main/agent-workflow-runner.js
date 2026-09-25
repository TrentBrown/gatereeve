// @ts-check

import { resolve } from 'node:path';

import {
  createClaudeCodeAgentAdapter,
  createCodexAgentAdapter,
} from '../resources/protocol/local-agent-adapters.js';
import { createPluginResourceAccess } from '../resources/protocol/agent-workflow-resources.js';
import { runEligibleAgentWorkflowGates } from '../resources/protocol/agent-workflow-scheduler.js';
import { discoverExecutable } from './executable-discovery.js';

const PROFILES = Object.freeze({
  codex: Object.freeze({ provider: 'codex', model: 'gpt-5.5', reasoningEffort: 'high' }),
  claude: Object.freeze({ provider: 'claude-code', model: 'opus', reasoningEffort: 'high' }),
});

function eligibleSignature(snapshot) {
  const attemptId = snapshot?.active?.boundaryAttemptId;
  const attempt = snapshot?.projection?.boundaryAttempts?.find((item) => item.id === attemptId);
  if (!attempt || attempt.state !== 'ACTIVE') return null;
  const modules = new Map((snapshot.modules?.slots ?? [])
    .flatMap((slot) => slot.modules)
    .map((module) => [module.boundaryGateId, module]));
  const eligible = attempt.gates.filter((gate) => (
    gate.eligible
    && gate.outcome === 'UNSET'
    && modules.get(gate.id)?.run?.kind === 'agent-workflow'
  ));
  if (eligible.length === 0) return null;
  return {
    attemptId,
    firstModuleId: modules.get(eligible[0].id).id,
    gates: eligible.map((gate) => `${gate.id}:${gate.moduleDigest}`).join(','),
  };
}

function selectedReadyAgent(setup) {
  return setup?.selectedAgents
    ?.map((id) => setup.agents.find((agent) => agent.id === id && agent.status === 'ready'))
    .find(Boolean) ?? null;
}

export function createDesktopAgentWorkflowRunner({
  protocol,
  desktopRoot,
  discover = discoverExecutable,
  run = runEligibleAgentWorkflowGates,
  createCodexAdapter = createCodexAgentAdapter,
  createClaudeAdapter = createClaudeCodeAgentAdapter,
  onChanged = async () => {},
} = {}) {
  const inFlight = new Map();
  const attempted = new Set();
  const resources = createPluginResourceAccess({
    pluginRoots: {
      'agentic-development-workflow': resolve(desktopRoot, 'resources/plugins/agentic-development-workflow'),
      'whiteboard-test': resolve(desktopRoot, 'resources/plugins/whiteboard-test'),
    },
  });

  async function execute(request, signature, agent) {
    const profile = PROFILES[agent.id];
    const executable = await discover(agent.id === 'claude' ? 'claude' : 'codex');
    if (!executable) throw new Error(`${agent.label} is no longer available.`);
    const adapter = profile.provider === 'codex'
      ? createCodexAdapter({ executable, model: profile.model, reasoningEffort: profile.reasoningEffort })
      : createClaudeAdapter({ executable, model: profile.model, reasoningEffort: profile.reasoningEffort });
    await onChanged({
      ...request,
      moduleId: signature.firstModuleId,
      live: {
        status: 'running',
        detail: `Running isolated stages with ${agent.label}.`,
        updatedAt: new Date().toISOString(),
        stages: [], actions: [], attempts: [], evidence: [], links: [], failure: null,
      },
    });
    const result = await run({
      repositoryRoot: request.repositoryRoot,
      featureHome: request.featureHome,
      attemptId: signature.attemptId,
      adapter,
      resources,
      actorLabel: `GateReeve Desktop ${agent.label} agent-workflow`,
      prepare: (options) => protocol.prepareBoundaryModule(options),
    });
    await onChanged({ ...request, result });
    return result;
  }

  return Object.freeze({
    schedule(request) {
      const signature = eligibleSignature(request.snapshot);
      const agent = selectedReadyAgent(request.setup);
      if (!signature || !agent) return null;
      const key = `${request.repositoryRoot}:${signature.attemptId}:${signature.gates}:${agent.id}`;
      if (attempted.has(key)) return inFlight.get(key) ?? null;
      attempted.add(key);
      const promise = execute(request, signature, agent)
        .catch(async (error) => {
          await onChanged({ ...request, moduleId: signature.firstModuleId, error });
          return null;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, promise);
      return promise;
    },
    reset(repositoryRoot = null) {
      for (const key of [...attempted]) {
        if (repositoryRoot === null || key.startsWith(`${repositoryRoot}:`)) attempted.delete(key);
      }
    },
  });
}
