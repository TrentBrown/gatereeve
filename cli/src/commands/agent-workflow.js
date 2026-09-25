import { resolve } from 'node:path';

import { Command, Option } from 'commander';

import {
  configuredPluginRoots,
  loadAgentConfiguration,
  resolveAgentWorkflowContext,
  runEligibleAgentWorkflows,
} from '../agent-workflow/execution.js';

function collect(value, previous) {
  return [...previous, value];
}

export function agentWorkflowCommands() {
  const root = new Command('agent-workflow')
    .description('Run eligible governed staged-agent modules in fresh contexts');
  const eligible = new Command('run-eligible')
    .description('Automatically run eligible agent-workflow gates for the active boundary')
    .option('--cwd <path>', 'Workspace or repository path', process.cwd())
    .option('--repository <alias>', 'Configured repository alias')
    .option('--feature-home <path>', 'Explicit feature-record directory')
    .option('--attempt <id>', 'Exact active boundary attempt')
    .option('--artifact-root <path>', 'Explicit artifact packet directory')
    .option('--agent-config <path>', 'JSON file with provider, model, and optional reasoningEffort')
    .addOption(new Option('--provider <provider>', 'Local agent provider').choices(['codex', 'claude-code']))
    .option('--model <model>', 'Explicit provider model or versioned alias')
    .addOption(new Option('--reasoning <effort>', 'Reasoning effort').choices(['high', 'xhigh', 'max', 'ultra']))
    .option('--plugin-root <plugin=path>', 'Trusted plugin shared-resource root', collect, [])
    .option('--json', 'Print JSON output');
  eligible.action(async (options) => {
    const configured = options.agentConfig ? await loadAgentConfiguration(options.agentConfig) : {};
    const provider = options.provider ?? configured.provider ?? process.env.GATEREEVE_AGENT_PROVIDER;
    const model = options.model ?? configured.model ?? process.env.GATEREEVE_AGENT_MODEL;
    const reasoningEffort = options.reasoning ?? configured.reasoningEffort ?? 'high';
    if (!['codex', 'claude-code'].includes(provider) || typeof model !== 'string' || !model) {
      throw new Error('Configure an explicit provider and model with flags, --agent-config, or GATEREEVE_AGENT_PROVIDER/GATEREEVE_AGENT_MODEL.');
    }
    const context = await resolveAgentWorkflowContext({
      cwd: resolve(options.cwd),
      repository: options.repository ?? null,
      featureHome: options.featureHome ?? null,
    });
    const result = await runEligibleAgentWorkflows({
      ...context,
      attemptId: options.attempt ?? null,
      artifactRoot: options.artifactRoot ?? null,
      provider,
      model,
      reasoningEffort,
      pluginRoots: await configuredPluginRoots(options.pluginRoot),
    });
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else if (result.results.length === 0) console.log('No eligible agent-workflow gates.');
    else for (const item of result.results) {
      console.log(`${item.gateId}: ${item.status === 'completed' ? item.outcome : 'UNAVAILABLE'}`);
      if (item.evidence) console.log(`  Evidence: ${item.evidence.path}`);
      if (item.failure) console.log(`  ${item.failure.message}`);
    }
    if (result.results.some((item) => item.status !== 'completed')) process.exitCode = 2;
    else if (result.results.some((item) => item.outcome === 'FAIL')) process.exitCode = 1;
  });
  root.addCommand(eligible);
  return root;
}
