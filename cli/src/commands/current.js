import { Command, Option } from 'commander';
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
  else if (operation === 'review.publish' && result.data?.handoff) {
    const { path, mutation } = result.data.handoff;
    console.log(`[PR explainer](<${path}>)`);
    if (result.data.publicationPending) console.log(result.data.publicationPending);
    if (mutation) {
      console.log(`Mutineer advisory: ${mutation.status}${mutation.summary ? ` — ${mutation.summary}` : ''}`);
      if (mutation.path) console.log(`[Mutineer report](<${mutation.path}>)`);
    }
  }
  else if (operation === 'followup.list') {
    for (const record of result.data.records) console.log(`${record.id} ${record.finding.severity} ${record.status}${record.decision ? ` (${record.decision.authorityKind})` : ''}: ${record.finding.class ?? record.origin.kind}`);
    if (result.data.unavailable?.length) console.log(`Unavailable: ${result.data.unavailable.length} unreadable review record(s); the list is incomplete.`);
    else if (!result.data.records.length) console.log('No follow-ups.');
    if (result.data.next) console.log(`Next: ${result.data.next}`);
  }
  else if (result.data?.contract && result.data?.featureId && result.data?.milestones) {
    console.log(`${result.data.featureId}: ${result.data.current?.phase ?? result.data.phase ?? 'current run needed'}`);
    // Both run dials, or the built-in defaults a new run receives when none exists.
    const dials = result.data.dials, defaults = result.data.dialDefaults ?? { rigor: 'full', autonomy: 'supervised' };
    for (const dial of ['rigor', 'autonomy']) {
      console.log(`${dial === 'rigor' ? 'Rigor' : 'Autonomy'}: ${dials ? dials[dial] : `${defaults[dial]} (default for a new run)`}`);
    }
    for (const line of goalLines(result.data.goal)) console.log(line);
    for (const milestone of result.data.milestones) {
      console.log(`${milestone.name}: ${milestone.historical ? (milestone.allowed ? 'recorded' : `recorded; ${milestone.missing.join('; ')}`) : milestone.allowed ? 'ready' : milestone.missing.join('; ')}`);
      for (const outcome of milestone.outcomes ?? []) if (outcome.exception) {
        console.log(`  ${outcome.id}: ${outcome.outcome}; accepted exception: ${outcome.exception.reason}; consequences: ${outcome.exception.consequences}`);
      }
      for (const outcome of milestone.outcomes ?? []) if (outcome.adjudication) console.log(`  ${outcome.id}: original ${outcome.outcome}; autonomous adjudication: ${outcome.adjudication.reason}; ${outcome.adjudication.stopReason ?? 'remaining risk retained'}`);
    }
    const selected = result.data.current?.reviewerSelection ?? result.data.reviewerSelection;
    for (const reviewer of selected?.selection?.reviewers ?? []) console.log(`Boundary reviewer: ${reviewer.modelProvider} ${reviewer.model}, ${reviewer.reasoningEffort} effort; ${reviewer.reason}`);
    // Delegation scope and delegated decisions, reported distinctly from human-confirmed ones.
    const delegation = result.data.delegation ?? result.data.current?.delegation;
    if (delegation?.active) console.log(`Delegation: active since ${delegation.since}; ${delegation.scope.map(item => `${item.repository}: ${item.delegatedMerges}`).join('; ')}; hands back on ${delegation.handBackTriggers.join(', ')}`);
    for (const item of delegation?.decisions ?? []) console.log(`${item.authorityKind === 'autonomous-evaluator' ? 'Autonomous' : 'Delegated'} decision ${item.kind}${item.actions.length ? ` + ${item.actions.join(', ')}` : ''} (${item.authorityKind ?? 'delegated-evaluator'}, ${item.basis}): ${item.event}${item.judgment ? `; original planning review ${item.evaluationOutcome}; ${item.judgment.reason}` : ''}`);
    const tripwires = result.data.tripwires;
    if (tripwires?.hits?.length) console.log(`Tripwires: ${tripwires.hits.length} hit(s): ${tripwires.hits.map(hit => `${hit.category} ${hit.repository}/${hit.path}`).join('; ')}${tripwires.coveredByStayLight ? ' (human stay-light decision recorded)' : ''}; subject ${tripwires.subject}`);
    const verification = result.data.milestones.flatMap(milestone => milestone.outcomes ?? []).find(outcome => outcome.provenance);
    if (verification) console.log(`Verification provenance: ${verification.provenance.summary}`);
    for (const pending of result.data.pendingDecisions ?? result.data.current?.pendingDecisions ?? []) console.log(`Pending human instruction (${pending.operation.id}): ${pending.decision.reason}; requested continuation has not been authorized.`);
    for (const grant of result.data.standingAuthorizations ?? result.data.current?.standingAuthorizations ?? []) console.log(`Standing authorization ${grant.grant}: ${grant.allowed ? 'active' : grant.reason}; scope: ${JSON.stringify(grant.scope)}`);
    for (const gap of result.data.current?.historyGaps ?? result.data.historyGaps ?? []) console.log(`Historical evidence unavailable: ${gap.resultHash}; fresh proof must replace any required role.`);
    for (const [id, prep] of Object.entries(result.data.current?.sourcePreparationStatus ?? result.data.sourcePreparationStatus ?? {})) if (prep.status !== 'published') console.log(`Source preparation ${id}: ${prep.status}; ${prep.reason}`);
    const cleanup = result.data.current?.sourceCleanup ?? result.data.sourceCleanup;
    if (cleanup) console.log(`Source retention: ${cleanup.status}; ${cleanup.errors?.map(item => item.reason).join('; ') || 'completed-run pins released; later reuse checks availability'}`);
    for (const view of result.data.current?.temporaryViews ?? result.data.temporaryViews ?? []) console.log(`Review view ${view.id}: ${view.status}`);
    const workspaceState = result.data.workspace;
    if (workspaceState?.recorded && ['created', 'replaced'].includes(workspaceState.recorded.status)) console.log(`Workspace configuration ${workspaceState.recorded.status} ${({ 'run.start': 'at run start', 'run.resume-current': 'when resumption started the run' })[workspaceState.recorded.operation] ?? 'by workspace.configure'}: ${workspaceState.recorded.configPath} (feature ${workspaceState.recorded.featureId}; integration and release ${workspaceState.recorded.configuration.repositories.repository.integrationBranch}; excluded locally in ${workspaceState.recorded.exclude.path})`);
    if (workspaceState?.message) console.log(`Workspace: ${workspaceState.message}`);
    for (const blocker of result.data.blockers ?? []) console.log(blocker.message);
  } else console.log(JSON.stringify(result.data, null, 2));
  if (!result.ok) { const error = new Error(result.error.message); error.reported = true; throw error; }
  return result.data;
}
const collect = (value, values) => [...values, value];
// Workspace instruction options (spec AC6): replacing another feature's
// configuration, or confirming the run belongs to it, needs the human instruction.
function workspaceOptions(item) {
  return item.option('--replace-workspace', 'Replace a configuration naming another feature (needs --instruction and --instruction-context)')
    .option('--confirm-feature <featureId>', 'Confirm this run belongs to the configured feature although the branch does not name it (needs --instruction and --instruction-context)')
    .option('--instruction <quote>', 'Observed human instruction for the workspace decision')
    .option('--instruction-context <text>', 'Proposal/conversation context of that instruction');
}
function workspaceInput(options) {
  if (!options.replaceWorkspace && options.confirmFeature === undefined) return undefined;
  // Both are passed through when both are given, so the protocol rejects the
  // contradiction instead of the CLI silently choosing one.
  return { ...(options.replaceWorkspace ? { replace: true } : {}), ...(options.confirmFeature !== undefined ? { confirmFeature: options.confirmFeature } : {}),
    authority: { kind: 'human-confirmed', instruction: options.instruction, context: options.instructionContext } };
}
// Goal autonomy: terminal state and the decisions made for the human (spec AC8).
export function goalLines(goal) {
  if (!goal) return [];
  return [`Goal: ${goal.terminal ?? 'not yet terminal'}; ${goal.reason}`,
    ...(goal.decisions ?? []).map(entry => `Decision made for you: ${entry.file} ${entry.heading}`)];
}
export function currentCommands() {
  const status = command('status', 'Inspect current commitments, proof and milestone blockers');
  status.action(options => run(options, 'status'));
  const coverage = command('coverage', 'Derive criterion status from applicable independent evidence');
  coverage.action(options => run(options, 'coverage.status'));
  const database = command('database', 'Inspect the current authoritative SQLite store').option('--history','Read bounded workflow history').option('--kind <kind>').option('--limit <count>', 'History rows', Number, 100);
  database.action(options => run(options, options.history ? 'database.history' : 'database.inspect', options.history ? {kind:options.kind,limit:options.limit} : {}));
  const ask = command('ask', 'Record that a decision question is being presented to the human, so the wait until the answer is measured')
    .argument('<file>', 'decision.ask input: kind, optional subject and a short question summary');
  ask.action(async (file, options) => run(options, 'decision.ask', await readJsonFile(file)));
  const note = command('workflow-note', 'Record strategy, friction, fixes or escaped defects without granting authority').argument('<file>');
  note.action(async (file,options) => run(options,'workflow.observe',await readJsonFile(file)));
  const read = command('read', 'Inspect a named artifact, current result, event history or model')
    .argument('<kind>', 'artifact, result, events or model').argument('[id]', 'Advertised artifact ID or result hash')
    .action((kind, id, options) => run(options, 'read', {}, { kind, id: id ?? null }));
  const runCommand = new Command('run').description('Start or resume current work without replaying old protocol state');
  for (const action of ['start', 'resume-current']) {
    const item = command(action, action === 'start' ? 'Establish the current run; in a repository with a GitHub remote and no workspace configuration, write a minimal one'
      : 'Preserve documents and establish the current run (a fresh run follows the run start workspace rules)')
      .requiredOption('--implementer <context>', 'Implementing context identity', collect, [])
      .option('--planning <file>', 'Observed design and implementation approval records for resumption')
      .option('--whiteboard', 'Include the optional whiteboard gate')
      .option('--choices <file>', 'Explicit per-run rigor/autonomy choices and optional runId; mandated and goal need a human mandate');
    workspaceOptions(item);
    runCommand.addCommand(item.action(async options => run(options, `run.${action}`, { ...(options.choices ? await readJsonFile(options.choices) : {}), implementers: options.implementer,
      optionalGates: options.whiteboard ? ['whiteboard'] : [], ...(options.planning ? { planning: await readJsonFile(options.planning) } : {}),
      ...(workspaceInput(options) ? { workspace: workspaceInput(options) } : {}) })));
  }
  runCommand.addCommand(command('set-dial', 'Record a per-run human choice or permitted agent return/escalation')
    .argument('<file>', 'Exact run.set-dial input; mandated and goal require the named run, human authority and fixed mandate')
    .action(async (file, options) => run(options, 'run.set-dial', await readJsonFile(file))));
  runCommand.addCommand(command('park', 'Under goal autonomy, park the run behind an open PR (draft or ready) that lists every blocker')
    .argument('<file>', 'Exact goal.park input: pr {repository, number}, blockers and evidence')
    .action(async (file, options) => run(options, 'goal.park', await readJsonFile(file))));
  const selectReviewers = command('select-reviewers', 'Record runtime capability observations and two cross-provider reviewer choices')
    .argument('<file>', 'Observed capabilities, selected reviewers and rationale')
    .action(async (file, options) => run(options, 'review.select', await readJsonFile(file)));
  const reviewBoundary = command('review-boundary', 'Execute both selected independent boundary reviewers in parallel')
    .argument('[file]', 'Optional consumed/history/claims or per-provider delta priors')
    .action(async (file, options) => run(options, 'review.execute', file ? await readJsonFile(file) : {}));
  const adjudicateReview = command('adjudicate-review', 'Under autonomous authority, record eligible residual risk and any diminishing-returns stopping reason')
    .argument('<file>', 'Exact candidate/pair, dispositions, retained evidence and rationale')
    .action(async (file, options) => run(options, 'review.adjudicate', await readJsonFile(file)));
  const abandonJob = command('abandon-job', 'Record that a runner or independent-assessment job whose process is verifiably gone will never finish')
    .requiredOption('--job <id>', 'Pending job ID from status')
    .requiredOption('--reason <text>', 'Why the job will never finish')
    .action(options => run(options, 'job.abandon', { jobId: options.job, reason: options.reason }));
  const workspace = new Command('workspace').description('Workspace configuration for delivery (.agentic-workflow.json)');
  workspace.addCommand(workspaceOptions(command('configure', 'For an existing run without one, write the minimal workspace configuration: the GitHub default branch as integration and release, excluded locally'))
    .action(options => run(options, 'workspace.configure', workspaceInput(options) ?? {})));
  const spec = command('validate-spec', 'Run specification validation against the approved design');
  spec.action(options => run(options, 'spec.validate'));
  const ready = command('ready', 'Declare the prepared candidate ready without launching a reviewer');
  ready.action(options => run(options, 'candidate.ready'));
  const candidate = command('candidate', 'Pin source repositories and approved local requirements')
    .requiredOption('--pin <alias=base..head>', 'Repository and exact source revisions', collect, [])
    .option('--target <alias=sha>', 'Assessed merge target commit (defaults to review base)', collect, [])
    .requiredOption('--criterion <id>', 'Covered rubric criterion', collect, [])
    .option('--scope <scope>', 'SLICE or FEATURE', 'SLICE');
  candidate.action(async options => {
    const repositories = options.pin.map(pin => {
      const match = /^([^=]+)=([a-f0-9]{40,64})\.\.([a-f0-9]{40,64})$/u.exec(pin);
      if (!match) throw new Error('Pin must be alias=fullBaseSha..fullHeadSha');
      return { alias: match[1], base: match[2], head: match[3] };
    });
    const targets = new Set();
    for (const target of options.target) {
      const match = /^([^=]+)=([a-f0-9]{40,64})$/u.exec(target);
      const repository = match && repositories.find(item => item.alias === match[1]);
      if (!repository || targets.has(match[1])) throw new Error('Target must name one selected alias exactly once with a full SHA');
      targets.add(match[1]); repository.target = match[2];
    }
    return run(options, 'candidate.prepare', { repositories, criteria: options.criterion, scope: options.scope });
  });
  const gate = command('evaluate', 'Execute requested gates with current inputs and actual receipts')
    .argument('<gates...>', 'Requested gate IDs; code/spec may share one execution')
    .option('--provider <name>', 'codex or claude-code')
    .option('--model <name>', 'Explicit reviewer model')
    .option('--reasoning <effort>', 'Reviewer reasoning effort', 'high')
    .option('--configuration <file>', 'Full check configuration, including checks, controlled environment, validation scope and external validity')
    .addOption(new Option('--checks <file>').hideHelp().argParser(() => {
      throw new Error('--checks has been retired. Use --configuration with checks and an acceptance validation scope when applicable.');
    }))
    .option('--consume <file>', 'JSON list of retained evidence references')
    .option('--claims <file>', 'JSON list of claims: findingId, claim, disposition (fixed or disputed) and, for fixed, a sweep record')
    .option('--history <file>', 'JSON list of prior review references')
    .option('--prior <file>', 'Retained earlier result for a delta assessment')
    .option('--coverage-claims <file>', 'Replacement coverage for assessment within this review')
    .option('--repair <file>', 'Original unvalidated result for independent format correction');
  gate.action(async (gates, options) => run(options, 'gate.execute', { gates,
    configuration: options.configuration ? await readJsonFile(options.configuration) : options.provider ? { provider: options.provider, model: options.model, reasoningEffort: options.reasoning } : {},
    ...(options.consume ? { consumed: await readJsonFile(options.consume) } : {}),
    claims: options.claims ? await readJsonFile(options.claims) : [],
    history: options.history ? await readJsonFile(options.history) : [],
    ...(options.coverageClaims ? { coverageClaims: await readJsonFile(options.coverageClaims) } : {}),
    ...(options.repair ? { repair: await readJsonFile(options.repair) } : {}),
    ...(options.prior ? { prior: await readJsonFile(options.prior) } : {}) }));
  const decide = command('decide', 'Record one concrete observed human instruction')
    .argument('<kind>', 'approve-design, authorize-implementation, accept, waive, amend, policy-amend, authorize-merge, authorize-standing, revoke-standing, stay-light')
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
    .option('--scope <file>', 'Explicit standing authorization scope (authorize-standing only)')
    .option('--waiver-basis <file>', 'Whiteboard NON_BEHAVIORAL classification and retained evidence reference')
    .option('--previous-subject <hash>', 'Prior commitments for an amendment');
  decide.action(async (kind, options) => run(options, 'human.decide', { kind, subject: options.subject,
    authority: { kind: 'human-confirmed', instruction: options.instruction, context: options.context, ...(options.messageId ? { messageId: options.messageId } : {}), ...(options.conversationId ? { conversationId: options.conversationId } : {}) },
    reason: options.reason, consequences: options.consequences, actions: options.continueWith,
    ...(['waive', 'policy-amend'].includes(kind) ? { gates: options.gate } : {}),
    ...(options.action ? { action: await readJsonFile(options.action) } : {}),
    ...(options.scope ? { scope: await readJsonFile(options.scope) } : {}),
    ...(options.waiverBasis ? { waiverBasis: await readJsonFile(options.waiverBasis) } : {}),
    ...(options.previousSubject ? { previousSubject: options.previousSubject } : {}) }));
  const delegatedDecision = command('decide-delegated', 'Under delegated autonomy, record a planning decision citing the delegation and an independent planning review PASS')
    .argument('<kind>', 'approve-design or authorize-implementation')
    .requiredOption('--subject <hash>', 'Exact design or commitment identity the review passed')
    .requiredOption('--delegation <hash>', 'Current delegation event identity (status delegation.event)')
    .requiredOption('--evaluation <hash>', 'Planning review event identity with outcome PASS')
    .requiredOption('--reason <text>', 'Reason for decision')
    .requiredOption('--consequences <text>', 'Known consequences');
  delegatedDecision.action((kind, options) => run(options, 'human.decide', { kind, subject: options.subject,
    authority: { kind: 'delegated-evaluator', delegation: options.delegation, evaluation: options.evaluation },
    reason: options.reason, consequences: options.consequences }));
  const autonomousDecision = command('decide-autonomous', 'Record an independently assessed in-mandate planning decision, including explicit judgment when needed')
    .argument('<file>', 'Exact planning decision with autonomous-evaluator authority; amendments retain previousSubject')
    .action(async (file, options) => run(options, 'human.decide', await readJsonFile(file)));
  const planningReview = command('review-planning', 'Run an independent planning review of the design, spec or brief')
    .argument('<artifact>', 'design, spec or brief')
    .requiredOption('--provider <name>', 'codex or claude-code')
    .requiredOption('--model <name>', 'Explicit reviewer model')
    .option('--reasoning <effort>', 'Reviewer reasoning effort', 'high');
  planningReview.action((artifact, options) => run(options, 'planning.review', { artifact,
    configuration: { provider: options.provider, model: options.model, reasoningEffort: options.reasoning } }));
  const applyDelegation = command('apply-delegation', 'Under delegated autonomy, accept and authorize a fully passing SLICE PR into the integration branch')
    .requiredOption('--action <file>', 'Exact prepared SLICE merge action')
    .action(async options => run(options, 'delegation.apply', { action: await readJsonFile(options.action) }));
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
  const publish = command('publish-review', 'Publish the current independent review summary into the PR description')
    .requiredOption('--number <number>', 'PR number', Number)
    .requiredOption('--source-repository <alias>', 'Pinned repository alias')
    .action(options => run(options, 'review.publish', { repository: options.sourceRepository, number: options.number }));
  const observe = command('observe-integration', 'Verify reviewed content on configured integration without asserting quality')
    .requiredOption('--source-repository <alias>', 'Pinned repository alias')
    .action(options => run(options, 'integration.observe', { repository: options.sourceRepository }));
  const apply = command('apply-authorization', 'Apply an existing standing grant to a fully passing candidate')
    .requiredOption('--grant <hash>', 'Recorded standing grant event identity')
    .option('--action <file>', 'Exact prepared merge action when merge permission is included')
    .action(async options => run(options, 'authorization.apply', { grant: options.grant,
      ...(options.action ? { action: await readJsonFile(options.action) } : {}) }));
  const delivery = command('resume-delivery', 'Reconnect work and advance eligible steps under existing scoped authority')
    .option('--grant <hash>', 'Existing scoped standing grant')
    .option('--merge <file>', 'Selected repository, PR number and merge method')
    .action(async options => run(options, 'delivery.resume', {
      ...(options.grant ? { grant: options.grant } : {}), ...(options.merge ? { merge: await readJsonFile(options.merge) } : {}) }));
  // Follow-up records (issue #148): list, decide (bulk or by ID), regenerate follow-ups.md.
  const followUps = new Command('follow-ups').description('List, decide or render the run\'s follow-up records (list is the default)');
  followUps.addCommand(command('list', 'List the run\'s follow-up records and their decisions')
    .action(options => run(options, 'followup.list')), { isDefault: true });
  followUps.addCommand(command('decide', 'Decide follow-ups (accept-risk, new-work, reject, or the policy defaults); new work is filed as GitHub issues')
    .argument('<file>', 'Exact followup.decide input: followUps or select, decision or defaults: true, reason, authority, optional pr')
    .action(async (file, options) => run(options, 'followup.decide', await readJsonFile(file))));
  followUps.addCommand(command('render', 'Regenerate follow-ups.md in the feature folder from the workflow records')
    .action(options => run(options, 'followup.render')));
  return [status, coverage, database, ask, note, read, runCommand, workspace, spec, candidate, ready, gate, selectReviewers, reviewBoundary, adjudicateReview, abandonJob, decide, delegatedDecision, autonomousDecision, planningReview, apply, applyDelegation, milestone, merge, publish, observe, delivery, followUps];
}
