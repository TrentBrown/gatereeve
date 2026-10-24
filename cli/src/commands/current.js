import { Command } from 'commander';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { executeProtocolRequest, readJsonFile } from '../protocol/client.js';

function command(name, description) {
  return new Command(name).description(description)
    .option('--cwd <path>', 'Workspace/repository directory', process.cwd())
    .option('--repository <alias>', 'Configured repository alias')
    .option('--operation-id <id>', 'Stable identity for repeat-safe execution')
    .option('--json', 'Print the structured result');
}
function context(options) {
  return { cwd: resolve(options.cwd), repository: options.repository, operationId: options.operationId ?? randomUUID() };
}
async function run(options, operation, input = {}, detail = {}) {
  const result = await executeProtocolRequest({ ...context(options), operation, input, ...detail });
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else if (!result.ok) console.error(`${result.error.code}: ${result.error.message}`);
  else if (result.data?.contract && result.data?.featureId && result.data?.milestones) {
    console.log(`${result.data.featureId}: ${result.data.current?.phase ?? result.data.phase ?? 'current run needed'}`);
    for (const milestone of result.data.milestones) console.log(`${milestone.name}: ${milestone.allowed ? 'ready' : milestone.missing.join('; ')}`);
    for (const gap of result.data.current?.historyGaps ?? result.data.historyGaps ?? []) console.log(`Historical evidence unavailable: ${gap.resultHash}; fresh proof must replace any required role.`);
    for (const blocker of result.data.blockers ?? []) console.log(blocker.message);
  } else console.log(JSON.stringify(result.data, null, 2));
  if (!result.ok) { const error = new Error(result.error.message); error.reported = true; throw error; }
  return result.data;
}
const collect = (value, values) => [...values, value];
export function currentCommands() {
  const status = command('status', 'Inspect current commitments, proof and milestone blockers');
  status.action(options => run(options, 'status'));
  const read = command('read', 'Inspect a named artifact, current result, event history or model')
    .argument('<kind>', 'artifact, result, events or model').argument('[id]', 'Advertised artifact ID or result hash')
    .action((kind, id, options) => run(options, 'read', {}, { kind, id: id ?? null }));
  const runCommand = new Command('run').description('Start or resume current work without replaying old protocol state');
  for (const action of ['start', 'resume-current']) {
    runCommand.addCommand(command(action, 'Preserve documents and establish the current run')
      .requiredOption('--implementer <context>', 'Implementing context identity', collect, [])
      .option('--planning <file>', 'Observed design and implementation approval records for resumption')
      .option('--whiteboard', 'Include the optional whiteboard gate')
      .action(async options => run(options, `run.${action}`, { implementers: options.implementer,
        optionalGates: options.whiteboard ? ['whiteboard'] : [], ...(options.planning ? { planning: await readJsonFile(options.planning) } : {}) })));
  }
  const spec = command('validate-spec', 'Run specification validation against the approved design');
  spec.action(options => run(options, 'spec.validate'));
  const ready = command('ready', 'Declare the prepared candidate ready without launching a reviewer');
  ready.action(options => run(options, 'candidate.ready'));
  const candidate = command('candidate', 'Pin source repositories and approved local requirements')
    .requiredOption('--pin <alias=base..head>', 'Repository and exact source revisions', collect, [])
    .requiredOption('--criterion <id>', 'Covered rubric criterion', collect, [])
    .option('--scope <scope>', 'SLICE or FEATURE', 'SLICE');
  candidate.action(async options => {
    const repositories = options.pin.map(pin => {
      const match = /^([^=]+)=([a-f0-9]{40,64})\.\.([a-f0-9]{40,64})$/u.exec(pin);
      if (!match) throw new Error('Pin must be alias=fullBaseSha..fullHeadSha');
      return { alias: match[1], base: match[2], head: match[3] };
    });
    return run(options, 'candidate.prepare', { repositories, criteria: options.criterion, scope: options.scope });
  });
  const gate = command('evaluate', 'Execute requested gates with current inputs and actual receipts')
    .argument('<gates...>', 'Requested gate IDs; code/spec may share one execution')
    .option('--provider <name>', 'codex or claude-code')
    .option('--model <name>', 'Explicit reviewer model')
    .option('--reasoning <effort>', 'Reviewer reasoning effort', 'high')
    .option('--configuration <file>', 'Full check configuration, including runtimeInputs and external validity')
    .option('--checks <file>', 'Project verification checks (command, args, repository, purpose)')
    .option('--consume <file>', 'JSON list of retained evidence references')
    .option('--claims <file>', 'JSON list of findingId and implementer claim pairs')
    .option('--history <file>', 'JSON list of prior review references')
    .option('--prior <file>', 'Retained earlier result for a delta assessment');
  gate.action(async (gates, options) => run(options, 'gate.execute', { gates,
    configuration: options.configuration ? await readJsonFile(options.configuration) : options.checks ? { checks: await readJsonFile(options.checks) }
      : options.provider ? { provider: options.provider, model: options.model, reasoningEffort: options.reasoning } : {},
    ...(options.consume ? { consumed: await readJsonFile(options.consume) } : {}),
    claims: options.claims ? await readJsonFile(options.claims) : [],
    history: options.history ? await readJsonFile(options.history) : [],
    ...(options.prior ? { prior: await readJsonFile(options.prior) } : {}) }));
  const decide = command('decide', 'Record one concrete observed human instruction')
    .argument('<kind>', 'approve-design, authorize-implementation, accept, waive, amend, authorize-merge')
    .requiredOption('--subject <hash>', 'Exact document, commitment or candidate identity')
    .requiredOption('--instruction <quote>', 'Observed human instruction')
    .requiredOption('--context <text>', 'Proposal/conversation context')
    .requiredOption('--reason <text>', 'Reason for decision')
    .requiredOption('--consequences <text>', 'Known consequences')
    .option('--message-id <id>', 'Optional observed message reference')
    .option('--conversation-id <id>', 'Optional conversation reference')
    .option('--continue-with <action>', 'Action expressly included in this same instruction', collect, [])
    .option('--gate <id>', 'Named gate waived', collect, [])
    .option('--action <file>', 'Prepared merge action')
    .option('--previous-subject <hash>', 'Prior commitments for an amendment');
  decide.action(async (kind, options) => run(options, 'human.decide', { kind, subject: options.subject,
    authority: { kind: 'human-confirmed', instruction: options.instruction, context: options.context, ...(options.messageId ? { messageId: options.messageId } : {}), ...(options.conversationId ? { conversationId: options.conversationId } : {}) },
    reason: options.reason, consequences: options.consequences, actions: options.continueWith,
    ...(['waive', 'policy-amend'].includes(kind) ? { gates: options.gate } : {}),
    ...(options.action ? { action: await readJsonFile(options.action) } : {}),
    ...(options.previousSubject ? { previousSubject: options.previousSubject } : {}) }));
  const milestone = new Command('milestone').description('Check or record a protected milestone');
  for (const action of ['check', 'pass']) milestone.addCommand(command(action, `${action} a milestone`)
    .argument('<name>', 'implementation, acceptance, merge or completion')
    .action((name, options) => run(options, `milestone.${action}`, { name })));
  const merge = new Command('merge').description('Prepare or execute an explicitly authorized protected merge');
  for (const action of ['prepare', 'execute']) merge.addCommand(command(action, `${action} the exact pinned PR`)
    .requiredOption('--number <number>', 'PR number', Number)
    .requiredOption('--source-repository <alias>', 'Pinned repository alias')
    .option('--method <method>', 'merge, squash or rebase', 'merge')
    .action(options => run(options, `merge.${action}`, { repository: options.sourceRepository, number: options.number, method: options.method })));
  const observe = command('observe-integration', 'Verify reviewed content on configured integration without asserting quality')
    .requiredOption('--source-repository <alias>', 'Pinned repository alias')
    .action(options => run(options, 'integration.observe', { repository: options.sourceRepository }));
  return [status, read, runCommand, spec, candidate, ready, gate, decide, milestone, merge, observe];
}
