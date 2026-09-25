import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProtocolAdapter } from '../protocol/client.js';
import { validateGeneratedArtifacts } from '../../resources/protocol/generated-artifact-validation.js';

const SOURCE_PLUGIN_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../plugin-src',
);

async function defaultPluginRoots() {
  const candidates = {
    'agentic-development-workflow': resolve(SOURCE_PLUGIN_ROOT, 'shared'),
    'whiteboard-test': resolve(SOURCE_PLUGIN_ROOT, 'plugins/whiteboard-test/shared'),
  };
  const roots = {};
  for (const [id, path] of Object.entries(candidates)) {
    try { await access(path); roots[id] = path; } catch { /* Packaged CLI may use explicit roots. */ }
  }
  return roots;
}

export function parsePluginRoots(values = []) {
  const roots = {};
  for (const value of values) {
    const separator = value.indexOf('=');
    if (separator < 1 || separator === value.length - 1) {
      throw new Error(`Plugin root must use plugin-id=/absolute/path: ${value}`);
    }
    roots[value.slice(0, separator)] = resolve(value.slice(separator + 1));
  }
  return roots;
}

export async function configuredPluginRoots(explicit = [], environment = process.env) {
  let configured = {};
  if (environment.GATEREEVE_PLUGIN_ROOTS) {
    configured = JSON.parse(environment.GATEREEVE_PLUGIN_ROOTS);
    if (configured === null || typeof configured !== 'object' || Array.isArray(configured)) {
      throw new Error('GATEREEVE_PLUGIN_ROOTS must be a JSON object.');
    }
  }
  return { ...await defaultPluginRoots(), ...configured, ...parsePluginRoots(explicit) };
}

export async function runEligibleAgentWorkflows({
  repositoryRoot,
  featureHome,
  attemptId = null,
  artifactRoot = null,
  provider,
  model,
  reasoningEffort = 'high',
  pluginRoots = {},
  protocol = null,
  createId,
}) {
  const core = protocol ?? await loadProtocolAdapter();
  const adapter = provider === 'codex'
    ? core.createCodexAgentAdapter({ model, reasoningEffort })
    : core.createClaudeCodeAgentAdapter({ model, reasoningEffort });
  const resources = core.createPluginResourceAccess({ pluginRoots });
  return core.runEligibleAgentWorkflowGates({
    repositoryRoot,
    featureHome,
    attemptId,
    artifactRoot,
    adapter,
    resources,
    validateGeneratedArtifacts,
    actorLabel: `GateReeve ${provider} agent-workflow`,
    ...(createId ? { createId } : {}),
  });
}

export async function resolveAgentWorkflowContext({ cwd, repository = null, featureHome = null }) {
  const core = await loadProtocolAdapter();
  const context = await core.resolveWorkflowContext({ cwd, repository });
  return {
    repositoryRoot: context.repository.path,
    featureHome: featureHome === null ? context.featureHome : resolve(featureHome),
  };
}

export async function loadAgentConfiguration(path) {
  const value = JSON.parse(await readFile(resolve(path), 'utf8'));
  if (!['codex', 'claude-code'].includes(value.provider) || typeof value.model !== 'string' || !value.model) {
    throw new Error('Agent configuration requires provider codex or claude-code and an explicit model.');
  }
  return value;
}
