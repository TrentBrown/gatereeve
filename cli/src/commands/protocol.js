import { resolve } from 'node:path';

import { Command, Option } from 'qp-cli-core';

import { executeProtocolRequest, readJsonFile } from '../protocol/client.js';

function addContextOptions(command) {
  return command
    .option('--cwd <path>', 'Workspace or repository path', process.cwd())
    .option('--repository <alias>', 'Configured repository alias')
    .option('--feature-home <path>', 'Explicit feature-record directory')
    .option('--json', 'Print the stable protocol JSON envelope');
}

function addObservationOptions(command) {
  return command
    .option('--fingerprints-file <path>', 'JSON map of current fingerprints by boundary attempt')
    .option('--facts-file <path>', 'JSON object containing freshly inferred external facts')
    .option('--sources-file <path>', 'JSON object containing local, Git, and GitHub source statuses');
}

function addEventOptions(command) {
  return command
    .option('--event-id <id>', 'Stable event identifier')
    .option('--recorded-at <timestamp>', 'Explicit ISO-8601 event time')
    .option('--human-confirmed <label>', 'Record an observed human confirmation')
    .option('--actor-label <label>', 'Agent actor label', 'gatereeve CLI');
}

function contextRequest(options) {
  return {
    cwd: resolve(options.cwd),
    ...(options.repository ? { repository: options.repository } : {}),
    ...(options.featureHome ? { featureHome: resolve(options.featureHome) } : {}),
  };
}

function actor(options) {
  return options.humanConfirmed
    ? { kind: 'human-confirmed', label: options.humanConfirmed }
    : { kind: 'agent', label: options.actorLabel };
}

function eventInput(options, extra = {}) {
  return {
    ...extra,
    actor: actor(options),
    ...(options.eventId ? { eventId: options.eventId } : {}),
    ...(options.recordedAt ? { recordedAt: options.recordedAt } : {}),
  };
}

async function optionalJson(path, label, fallback) {
  return path ? readJsonFile(resolve(path), label) : fallback;
}

async function observationOptions(options) {
  return {
    gateFingerprints: await optionalJson(options.fingerprintsFile, 'Fingerprint file', {}),
    facts: await optionalJson(options.factsFile, 'Facts file', {}),
    sources: await optionalJson(options.sourcesFile, 'Sources file', {}),
  };
}

function readinessLabel(action) {
  return action.readiness ?? (action.eligible ? 'ready' : 'blocked');
}

function printStatus(data) {
  console.log(`Mode: ${data.mode}`);
  console.log(`Record: ${data.featureHome}`);
  if (!data.projection) return;
  console.log(`Feature: ${data.projection.featureId}`);
  console.log(`State: ${data.projection.feature.state}`);
  console.log(`Active slice: ${data.projection.activeSliceId ?? 'none'}`);
  const activeSlice = data.projection.slices.find(
    (slice) => slice.id === data.projection.activeSliceId
  );
  console.log(`Boundary attempt: ${activeSlice?.activeAttemptId ?? 'none'}`);
  console.log(`Suspended: ${data.projection.suspension.paused ? 'yes' : 'no'}`);
  console.log(`Implementation authorized: ${data.projection.implementationAuthorization.current ? 'yes' : 'no'}`);
  console.log(`Blockers: ${data.blockers.length}`);
  for (const blocker of data.blockers) console.log(`  - ${JSON.stringify(blocker)}`);
  console.log('Next:');
  for (const action of data.nextActions) {
    console.log(`  - [${readinessLabel(action)}] ${action.command}`);
    for (const reason of action.reasons ?? []) console.log(`      ${reason}`);
  }
}

function printNext(data) {
  if (data.actions.length === 0) console.log('No eligible or pending actions.');
  for (const action of data.actions) {
    const reasons = action.reasons.length > 0 ? ` — ${action.reasons.join('; ')}` : '';
    console.log(`[${readinessLabel(action)}] ${action.command} (${action.authority})${reasons}`);
  }
}

function printSnapshot(data) {
  console.log(`Mode: ${data.mode}`);
  console.log(`Record: ${data.featureHome}`);
  if (!data.projection) return;
  console.log(`Feature: ${data.featureId}`);
  console.log(`State: ${data.projection.feature.state}`);
  console.log(`Active slice: ${data.active.sliceId ?? 'none'}`);
  console.log(`Boundary attempt: ${data.active.boundaryAttemptId ?? 'none'}`);
  console.log(`Artifacts: ${data.artifacts.length}`);
  console.log(`Actions: ${data.actions.length}`);
  for (const action of data.actions) {
    console.log(`  - [${readinessLabel(action)}] ${action.command}`);
  }
}

function printHistory(data) {
  console.log(`Feature: ${data.featureId}`);
  for (const event of data.events) {
    console.log(`${event.sequence}. ${event.type} — ${event.recordedAt} — ${event.actor.kind}:${event.actor.label}`);
  }
}

function printMutation(data) {
  const event = data?.event ?? data?.events?.at?.(-1) ?? null;
  if (event) console.log(`Recorded ${event.type} as ${event.eventId} (sequence ${event.sequence}).`);
  const state = data?.projection?.feature?.state ?? data?.featureState;
  if (state) console.log(`Feature state: ${state}`);
}

async function run(request, options, renderer = (data) => console.log(JSON.stringify(data, null, 2))) {
  const result = await executeProtocolRequest(request);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    renderer(result.data);
  } else {
    console.error(`${result.error.code}: ${result.error.message}`);
    if (result.error.details) console.error(JSON.stringify(result.error.details, null, 2));
  }
  if (!result.ok) {
    const error = new Error(result.error.message);
    error.reported = true;
    error.exitCode = 1;
    throw error;
  }
  return result;
}

function transitionCommand(name, description, operation, transitionId, { slice = false } = {}) {
  const command = new Command(name).description(description);
  if (slice) command.argument('<slice-id>', 'Slice identifier');
  addContextOptions(addEventOptions(command))
    .option('--facts-file <path>', 'JSON object containing freshly inferred guard facts')
    .option('--fingerprints-file <path>', 'JSON map of current boundary gate fingerprints')
    .option('--payload-file <path>', 'JSON object recorded with the passage')
    .action(async (...args) => {
      const commander = args.at(-1);
      const options = commander.opts();
      const sliceId = slice ? args[0] : null;
      const facts = await optionalJson(options.factsFile, 'Facts file', {});
      const currentFingerprints = await optionalJson(
        options.fingerprintsFile,
        'Fingerprint file',
        {}
      );
      const payload = await optionalJson(options.payloadFile, 'Payload file', {});
      await run(
        {
          operation,
          ...contextRequest(options),
          transitionId,
          ...(slice ? { sliceId } : {}),
          input: eventInput(options, { facts, currentFingerprints, payload }),
        },
        options,
        printMutation
      );
    });
  return command;
}

function featureCommands() {
  const feature = new Command('feature').description('Govern the feature lifecycle');

  const init = addContextOptions(addEventOptions(
    new Command('init').description('Initialize a missing feature in DESIGNING')
  )).option('--feature-id <id>', 'Feature ID when it cannot be resolved from context');
  init.action(async (options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({
      operation: 'feature.init',
      ...contextRequest(resolvedOptions),
      ...(resolvedOptions.featureId ? { featureId: resolvedOptions.featureId } : {}),
      actor: actor(resolvedOptions),
      ...(resolvedOptions.eventId ? { eventId: resolvedOptions.eventId } : {}),
      ...(resolvedOptions.recordedAt ? { recordedAt: resolvedOptions.recordedAt } : {}),
    }, resolvedOptions, printMutation);
  });
  feature.addCommand(init);

  feature.addCommand(transitionCommand('approve-design', 'Record explicit design approval', 'feature.transition', 'approve-design'));
  feature.addCommand(transitionCommand('validate-spec', 'Record successful specification validation', 'feature.transition', 'validate-spec'));
  feature.addCommand(transitionCommand('authorize-plan', 'Record implementation authorization', 'feature.transition', 'authorize-plan'));
  feature.addCommand(transitionCommand('finalize', 'Record successful feature closeout', 'feature.transition', 'complete-feature'));

  const abandon = addContextOptions(addEventOptions(
    new Command('abandon').description('Abandon the complete feature after human confirmation')
  ));
  abandon.action(async (options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({ operation: 'feature.abandon', ...contextRequest(resolvedOptions), input: eventInput(resolvedOptions) }, resolvedOptions, printMutation);
  });
  feature.addCommand(abandon);

  const pause = addContextOptions(addEventOptions(
    new Command('pause').description('Suspend ordinary workflow mutations')
  )).option('--reason <text>', 'Reason for suspension');
  pause.action(async (options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({ operation: 'feature.pause', ...contextRequest(resolvedOptions), input: eventInput(resolvedOptions, { reason: resolvedOptions.reason ?? null }) }, resolvedOptions, printMutation);
  });
  feature.addCommand(pause);

  const resume = addContextOptions(addEventOptions(
    new Command('resume').description('Resume a suspended feature')
  ));
  resume.action(async (options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({ operation: 'feature.resume', ...contextRequest(resolvedOptions), input: eventInput(resolvedOptions) }, resolvedOptions, printMutation);
  });
  feature.addCommand(resume);

  const migrate = addContextOptions(addEventOptions(
    new Command('migrate-model').description('Migrate a pinned model after reviewing its impact')
  )).requiredOption('--model-file <path>', 'Next normalized workflow model JSON');
  migrate.action(async (options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({
      operation: 'feature.migrate-model',
      ...contextRequest(resolvedOptions),
      input: {
        nextModel: await readJsonFile(resolve(resolvedOptions.modelFile), 'Workflow model'),
        confirmedBy: actor(resolvedOptions),
        ...(resolvedOptions.eventId ? { eventId: resolvedOptions.eventId } : {}),
        ...(resolvedOptions.recordedAt ? { recordedAt: resolvedOptions.recordedAt } : {}),
      },
    }, resolvedOptions, printMutation);
  });
  feature.addCommand(migrate);

  const migrationImpact = addContextOptions(
    new Command('migration-impact').description('Preview model-migration obligations without changing state')
  ).requiredOption('--model-file <path>', 'Candidate normalized workflow model JSON');
  migrationImpact.action(async (options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({
      operation: 'feature.migration-impact',
      ...contextRequest(resolvedOptions),
      input: {
        nextModel: await readJsonFile(resolve(resolvedOptions.modelFile), 'Workflow model'),
      },
    }, resolvedOptions);
  });
  feature.addCommand(migrationImpact);
  return feature;
}

function sliceCommands() {
  const slice = new Command('slice').description('Govern sequential delivery slices');
  const propose = addContextOptions(addEventOptions(
    new Command('propose').description('Create a planned delivery instance').argument('<slice-id>', 'Slice identifier')
  ))
    .option('--name <name>', 'Human-readable slice name')
    .option('--branch <branch>', 'Expected delivery branch')
    .addOption(new Option('--scope <scope>', 'Boundary scope').choices(['SLICE', 'FEATURE_FINAL']))
    .option('--plan-steps <ids...>', 'Covered plan step IDs')
    .option('--rubric-criteria <ids...>', 'Covered rubric criterion IDs');
  propose.action(async (sliceId, options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({
      operation: 'slice.propose',
      ...contextRequest(resolvedOptions),
      input: eventInput(resolvedOptions, {
        sliceId,
        name: resolvedOptions.name ?? sliceId,
        branch: resolvedOptions.branch ?? null,
        scope: resolvedOptions.scope ?? null,
        planSteps: resolvedOptions.planSteps ?? [],
        rubricCriteria: resolvedOptions.rubricCriteria ?? [],
      }),
    }, resolvedOptions, printMutation);
  });
  slice.addCommand(propose);
  slice.addCommand(transitionCommand('plan', 'Move a proposed slice to PLANNED', 'slice.transition', 'plan-slice', { slice: true }));
  slice.addCommand(transitionCommand('start', 'Start implementation of a ready slice', 'slice.transition', 'start-slice', { slice: true }));
  slice.addCommand(transitionCommand('begin-boundary', 'Begin a PR-boundary attempt', 'slice.transition', 'begin-boundary', { slice: true }));
  slice.addCommand(transitionCommand('remediate', 'Return a boundary slice to implementation', 'slice.transition', 'remediate-boundary', { slice: true }));
  slice.addCommand(transitionCommand('changes-requested', 'Record human-requested review changes', 'slice.transition', 'apply-review-changes', { slice: true }));
  slice.addCommand(transitionCommand('record-merge', 'Record verified reviewed content on the integration branch', 'slice.transition', 'record-merge', { slice: true }));

  const abandon = addContextOptions(addEventOptions(
    new Command('abandon').description('Abandon a planned or implementing slice').argument('<slice-id>', 'Slice identifier')
  ));
  abandon.action(async (sliceId, options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({ operation: 'slice.abandon', ...contextRequest(resolvedOptions), sliceId, input: eventInput(resolvedOptions) }, resolvedOptions, printMutation);
  });
  slice.addCommand(abandon);

  const accept = addContextOptions(addEventOptions(
    new Command('accept-review').description('Record observed human review acceptance').argument('<slice-id>', 'Slice identifier')
  ));
  accept.action(async (sliceId, options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({ operation: 'slice.accept-review', ...contextRequest(resolvedOptions), sliceId, input: eventInput(resolvedOptions) }, resolvedOptions, printMutation);
  });
  slice.addCommand(accept);
  return slice;
}

function gateCommands() {
  const gate = new Command('gate').description('Record and invalidate PR-boundary evidence');
  const record = addContextOptions(addEventOptions(
    new Command('record').description('Record one eligible gate outcome')
      .argument('<attempt-id>', 'Boundary attempt ID')
      .argument('<gate-id>', 'Gate ID')
  ))
    .addOption(new Option('--outcome <outcome>', 'Gate outcome').choices(['PASS', 'FAIL', 'NOT_APPLICABLE']).makeOptionMandatory())
    .requiredOption('--inputs-file <path>', 'JSON value containing current gate inputs')
    .option('--fingerprints-file <path>', 'JSON map of all current gate fingerprints')
    .option('--evidence-file <path>', 'JSON evidence reference with path and sha256 hash')
    .option('--reason <text>', 'Failure or not-applicable reason');
  record.action(async (attemptId, gateId, options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({
      operation: 'gate.record',
      ...contextRequest(resolvedOptions),
      input: eventInput(resolvedOptions, {
        attemptId,
        gateId,
        outcome: resolvedOptions.outcome,
        inputs: await readJsonFile(resolve(resolvedOptions.inputsFile), 'Gate inputs'),
        currentFingerprints: await optionalJson(resolvedOptions.fingerprintsFile, 'Fingerprint file', {}),
        evidence: await optionalJson(resolvedOptions.evidenceFile, 'Evidence file', null),
        reason: resolvedOptions.reason ?? null,
      }),
    }, resolvedOptions, printMutation);
  });
  gate.addCommand(record);

  const waive = addContextOptions(addEventOptions(
    new Command('waive').description('Record explicit human risk acceptance for an eligible gate')
      .argument('<attempt-id>', 'Boundary attempt ID')
      .argument('<gate-id>', 'Gate ID')
  ))
    .requiredOption('--inputs-file <path>', 'JSON value containing current gate inputs')
    .option('--fingerprints-file <path>', 'JSON map of all current gate fingerprints')
    .requiredOption('--reason <text>', 'Risk-acceptance reason');
  waive.action(async (attemptId, gateId, options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({
      operation: 'gate.waive',
      ...contextRequest(resolvedOptions),
      input: eventInput(resolvedOptions, {
        attemptId,
        gateId,
        inputs: await readJsonFile(resolve(resolvedOptions.inputsFile), 'Gate inputs'),
        currentFingerprints: await optionalJson(resolvedOptions.fingerprintsFile, 'Fingerprint file', {}),
        reason: resolvedOptions.reason,
      }),
    }, resolvedOptions, printMutation);
  });
  gate.addCommand(waive);

  const invalidate = addContextOptions(addEventOptions(
    new Command('invalidate').description('Mark selected gate evidence stale')
      .argument('<attempt-id>', 'Boundary attempt ID')
      .argument('<gate-ids...>', 'Gate IDs')
  )).option('--reason <text>', 'Invalidation reason');
  invalidate.action(async (attemptId, gateIds, options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({ operation: 'gate.invalidate', ...contextRequest(resolvedOptions), input: eventInput(resolvedOptions, { attemptId, gateIds, reason: resolvedOptions.reason ?? null }) }, resolvedOptions, printMutation);
  });
  gate.addCommand(invalidate);
  return gate;
}

function boundaryCommands() {
  const boundary = new Command('boundary').description('Govern PR-boundary passage');
  const request = addContextOptions(addEventOptions(
    new Command('request-review').description('Pass a current nonblocking boundary to HUMAN_REVIEW')
      .argument('<attempt-id>', 'Boundary attempt ID')
  )).requiredOption('--fingerprints-file <path>', 'JSON map of all current gate fingerprints');
  request.action(async (attemptId, options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({
      operation: 'boundary.request-review',
      ...contextRequest(resolvedOptions),
      input: eventInput(resolvedOptions, {
        attemptId,
        currentFingerprints: await readJsonFile(resolve(resolvedOptions.fingerprintsFile), 'Fingerprint file'),
      }),
    }, resolvedOptions, printMutation);
  });
  boundary.addCommand(request);
  return boundary;
}

function changeCommands() {
  const change = new Command('change').description('Govern discoveries that alter approved work');
  const propose = addContextOptions(addEventOptions(
    new Command('propose').description('Record a discovered design, spec, plan, or slice change')
      .argument('<change-id>', 'Change identifier')
  ))
    .addOption(new Option('--target <target>', 'Affected artifact').choices(['design', 'spec', 'plan', 'slice']).makeOptionMandatory())
    .requiredOption('--rationale <text>', 'Why the change is needed')
    .option('--origin <text>', 'Where the discovery originated')
    .option('--impact-file <path>', 'JSON impact description');
  propose.action(async (changeId, options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({
      operation: 'change.propose',
      ...contextRequest(resolvedOptions),
      input: eventInput(resolvedOptions, {
        changeId,
        target: resolvedOptions.target,
        origin: resolvedOptions.origin ?? null,
        rationale: resolvedOptions.rationale,
        impact: await optionalJson(resolvedOptions.impactFile, 'Impact file', null),
      }),
    }, resolvedOptions, printMutation);
  });
  change.addCommand(propose);

  for (const [name, transitionId, description] of [
    ['approve', 'approve-change', 'Approve a proposed change'],
    ['reject', 'reject-change', 'Reject a proposed change'],
    ['apply', 'apply-change', 'Record an approved change as applied'],
    ['validate', 'validate-change', 'Validate updated downstream artifacts'],
    ['supersede-proposed', 'supersede-proposed-change', 'Supersede a proposed change'],
    ['supersede-applied', 'supersede-applied-change', 'Supersede an applied change'],
  ]) {
    const command = addContextOptions(addEventOptions(
      new Command(name).description(description).argument('<change-id>', 'Change identifier')
    )).option('--payload-file <path>', 'JSON transition payload');
    command.action(async (changeId, options, commander) => {
      const resolvedOptions = commander?.opts?.() ?? options;
      await run({
        operation: 'change.transition',
        ...contextRequest(resolvedOptions),
        transitionId,
        changeId,
        input: eventInput(resolvedOptions, {
          payload: await optionalJson(resolvedOptions.payloadFile, 'Payload file', {}),
        }),
      }, resolvedOptions, printMutation);
    });
    change.addCommand(command);
  }

  const reauthorize = addContextOptions(addEventOptions(
    new Command('reauthorize').description('Renew implementation authorization after design/spec changes')
      .argument('<change-ids...>', 'Applied design/spec change IDs')
  )).requiredOption('--downstream-current', 'Confirm downstream artifacts are current');
  reauthorize.action(async (changeIds, options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({ operation: 'change.reauthorize', ...contextRequest(resolvedOptions), input: eventInput(resolvedOptions, { changeIds, downstreamArtifactsCurrent: true }) }, resolvedOptions, printMutation);
  });
  change.addCommand(reauthorize);
  return change;
}

export function protocolCommands() {
  const commands = [];

  const status = addObservationOptions(addContextOptions(new Command('status').description('Show authoritative workflow state and blockers')));
  status.action(async (options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({ operation: 'status', ...contextRequest(resolvedOptions), options: await observationOptions(resolvedOptions) }, resolvedOptions, printStatus);
  });
  commands.push(status);

  const snapshot = addObservationOptions(addContextOptions(
    new Command('snapshot').description('Show the versioned canonical observational snapshot')
  ));
  snapshot.action(async (options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run(
      { operation: 'snapshot', ...contextRequest(resolvedOptions), options: await observationOptions(resolvedOptions) },
      resolvedOptions,
      printSnapshot
    );
  });
  commands.push(snapshot);

  const read = addObservationOptions(addContextOptions(
    new Command('read').description('Read one canonical snapshot detail')
      .argument('<kind>', 'Detail kind', (value) => {
        const allowed = ['artifact', 'events', 'attempt', 'model'];
        if (!allowed.includes(value)) throw new Error(`Unknown detail kind: ${value}`);
        return value;
      })
      .argument('[id]', 'Artifact, event, or attempt ID')
  ));
  read.action(async (kind, id, options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run(
      {
        operation: 'read',
        kind,
        ...(id ? { id } : {}),
        ...contextRequest(resolvedOptions),
        options: await observationOptions(resolvedOptions),
      },
      resolvedOptions
    );
  });
  commands.push(read);

  const next = addObservationOptions(addContextOptions(new Command('next').description('Show eligible and blocked next semantic actions')));
  next.action(async (options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({ operation: 'next', ...contextRequest(resolvedOptions), options: await observationOptions(resolvedOptions) }, resolvedOptions, printNext);
  });
  commands.push(next);

  const explain = addObservationOptions(addContextOptions(
    new Command('explain').description('Explain a gate, change, slice, or current feature state').argument('<target>', 'Target ID or state')
  ));
  explain.action(async (target, options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({ operation: 'explain', target, ...contextRequest(resolvedOptions), options: await observationOptions(resolvedOptions) }, resolvedOptions);
  });
  commands.push(explain);

  const history = addContextOptions(new Command('history').description('Show the append-only workflow event journal'));
  history.action(async (options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({ operation: 'history', ...contextRequest(resolvedOptions) }, resolvedOptions, printHistory);
  });
  commands.push(history);

  const graph = addObservationOptions(addContextOptions(new Command('graph').description('Render the current position or complete protocol model')))
    .option('--model', 'Render the complete protocol model')
    .addOption(new Option('--format <format>', 'Graph output').choices(['mermaid', 'json']).default('mermaid'));
  graph.action(async (options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run(
      { operation: resolvedOptions.model ? 'graph.model' : 'graph', ...contextRequest(resolvedOptions), options: await observationOptions(resolvedOptions) },
      resolvedOptions,
      (data) => {
        if (!data.graph) console.log(`No graph is available for ${data.mode} mode.`);
        else if (resolvedOptions.format === 'json') console.log(JSON.stringify(data.graph, null, 2));
        else process.stdout.write(data.graph.mermaid);
      }
    );
  });
  commands.push(graph);

  const check = addObservationOptions(addContextOptions(
    new Command('check').description('Assert one protocol invariant for hooks or CI')
      .argument('<assertion>', 'Invariant', (value) => {
        const allowed = ['governed', 'not-blocked', 'implementation-authorized', 'boundary-ready'];
        if (!allowed.includes(value)) throw new Error(`Unknown assertion: ${value}`);
        return value;
      })
  ));
  check.action(async (assertion, options, commander) => {
    const resolvedOptions = commander?.opts?.() ?? options;
    await run({ operation: 'check', assertion, ...contextRequest(resolvedOptions), options: await observationOptions(resolvedOptions) }, resolvedOptions, () => console.log(`PASS: ${assertion}`));
  });
  commands.push(check);

  commands.push(featureCommands(), sliceCommands(), boundaryCommands(), gateCommands(), changeCommands());
  return commands;
}
