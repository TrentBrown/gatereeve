import { observe } from '../../performance/observe.js';
import { mkdir, lstat, appendFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveWorkflowContext } from '../context.js';
import { successResult, failureResult } from '../result.js';
import { CurrentCore, validateStart } from './core.js';
import { prepareWorkspace, workspaceStatus, startsFreshRun, WORKSPACE_PREPARED } from './workspace.js';
import { CurrentStore, readSafe } from './store.js';
import { CONTRACT, PHASES, GATES, ENFORCEMENT, DEFAULT_DIALS, identity, digest, requireThat, unattendedValue } from './contracts.js';
import { resolveEntryPoints, operationCommand, recoveryText } from './entry-point.js';

// brief.md is a light run's commitment; it is listed only when present.
const DOCUMENTS = ['brief.md', 'interview.md', 'design.md', 'spec.md', 'plan.md', 'issues.md', 'tracker.md', 'scratchpad.md', 'decisions.md'];
export async function contextFor(request, runtime = {}) {
  const context = await resolveWorkflowContext({ cwd: request.cwd ?? process.cwd(), repository: request.repository ?? null, gitExecutable: runtime.gitExecutable ?? 'git' });
  if (request.featureHome) requireThat(resolve(request.featureHome) === resolve(context.featureHome), 'Explicit feature home differs from the canonical resolver');
  return context;
}
async function ensureHome(context) {
  const local = relative(context.workspaceRoot, context.featureHome);
  requireThat(local && !local.startsWith(`..${sep}`) && local !== '..' && !isAbsolute(local), 'Feature home escaped workspace');
  let current = context.workspaceRoot;
  for (const part of local.split(sep)) {
    current = join(current, part);
    await mkdir(current).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const info = await lstat(current);
    requireThat(info.isDirectory() && !info.isSymbolicLink(), 'Unsafe feature home');
  }
}
async function documents(context) {
  const artifacts = [];
  try { await CurrentStore.at(context.featureHome, context.workspaceRoot); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const name of DOCUMENTS) {
    let ref = null, unsafe = false;
    try {
      const bytes = await readSafe(context.featureHome, name);
      ref = { bytes: bytes.length, hash: digest(bytes) };
    } catch (error) { if (error.code !== 'ENOENT') unsafe = true; }
    if (name === 'brief.md' && !ref && !unsafe) continue;
    artifacts.push({ id: name, kind: 'document', format: 'markdown', label: name.replace('.md', ''), path: name,
      absolutePath: join(context.featureHome, name), exists: Boolean(ref), unsafe,
      status: unsafe ? 'unavailable' : ref ? 'available' : 'missing', fingerprint: ref?.hash ?? null });
  }
  return artifacts;
}
// Recovery commands name only entry points present in this installation: the
// bundled adapter, and the gatereeve CLI when it is on PATH.
function snapshotActions(entry, cwd, resume) {
  const action = (id, operation, label, extra = {}) => ({ id, label, operation, ...operationCommand(entry, operation, { cwd }), ...extra });
  return resume ? [action('resume-current', 'run.resume-current', 'Resume using current commitments', { readiness: 'available' })] : [
    action('status', 'status', 'Inspect exact current commitments and proof'),
    action('work', 'next', 'Choose work within the authorized phase'),
    action('evaluate', 'gate.execute', 'Request checks explicitly; readiness launches none'),
    action('select-reviewers', 'review.select', 'Select two available daily-driver reviewer providers and record discovery'),
    action('review-boundary', 'review.execute', 'Run both independent boundary reviewers in parallel'),
    action('adjudicate-review', 'review.adjudicate', 'With autonomous authority, record eligible residual risk and stopping rationale'),
    action('abandon-job', 'job.abandon', 'Record that a runner or assessment job whose process is gone will never finish'),
    action('decide', 'human.decide', 'Record observed human decisions and scoped exceptions'),
    action('apply-authorization', 'authorization.apply', 'Apply recorded standing permission after all required gates pass'),
    action('review-planning', 'planning.review', 'Request an independent planning review (design, spec or brief) for a delegated decision'),
    action('apply-delegation', 'delegation.apply', 'Under delegation, accept and authorize a fully passing SLICE PR into the integration branch'),
  ];
}
function tripwireSummary(data) {
  const recorded = data.tripwires;
  const checked = (data.milestones ?? []).find(item => item.name === 'acceptance')?.tripwires ?? null;
  if (!recorded && !checked) return null;
  return { hits: checked?.hits ?? recorded.hits, subject: checked?.subject ?? recorded.subject, coveredByStayLight: checked?.coveredByStayLight ?? false,
    recordedAt: recorded?.at ?? null, stage: recorded?.stage ?? null, skipped: checked?.skipped ?? recorded?.skipped ?? [] };
}
// Stop-for-the-human states that are not gate failures.
function runBlockers(data) {
  if (!data) return [];
  const blockers = [];
  const tripwires = tripwireSummary(data);
  if (data.dials?.rigor?.value === 'light' && tripwires?.hits?.length && !tripwires.coveredByStayLight) blockers.push({ type: 'tripwire',
    message: `${tripwires.hits.length} tripwire hit(s) (${[...new Set(tripwires.hits.map(hit => hit.category))].join(', ')}) block acceptance of this light run. `
      + (unattendedValue(data.dials.autonomy.value) ? 'Under unattended authority the run escalates to full rigor.'
        : `Stop for the human: escalate to full (run.set-dial rigor full) or record their stay-light decision bound to subject ${tripwires.subject}.`) });
  if (data.goal?.terminal === 'parked') blockers.push({ type: 'goal-park',
    message: `${data.goal.reason}. Ask the human through the harness question tool; a human run.continue resumes the goal run.` });
  // Pending until a human decision is observed after the hand-back.
  if (data.handBack) blockers.push({ type: 'hand-back',
    message: `Delegation was handed back to supervised (${data.handBack.trigger ?? 'agent'}: ${data.handBack.reason ?? 'no reason recorded'}). Stop for the human. `
      + 'Delegated decisions no longer count: implementation, candidates and gates need a human authorize-implementation (and acceptance and merges a human decision); only a human can delegate again.' });
  if (data.delegationBlocked && data.dials?.autonomy?.value === 'delegated') blockers.push({ type: 'hand-back',
    message: 'An external merge blocker was recorded under delegation but the hand-back could not be recorded. Delegated authority is void: stop for the human.' });
  return blockers;
}
// Delivery configuration (spec AC6): what the workspace names, what run start
// observed or wrote, and the path forward when delivery has no configuration.
async function workspaceSummary(context, data, entry, cwd, runtime) {
  let status = null;
  try { status = await workspaceStatus(context, data?.workspace ?? null, runtime); } catch { return null; }
  if (!status) return null;
  const reason = status.recorded?.status === 'unconfigured' ? `; it was not written at run start because ${status.recorded.reason}` : '';
  if (!status.configured) status.message = `Delivery needs a workspace configuration (.agentic-workflow.json) naming the integration and release branches${reason}. `
    + (data ? `Write it for this run with workspace.configure (${recoveryText(entry, ['workspace.configure'], { cwd })}), or write it by hand (WORKSPACE-CONTEXT.md); merge preparation fails until then.`
      : 'run.start writes a minimal one (the GitHub default branch as integration and release, excluded locally) when the repository has a GitHub remote.');
  else if (!data && status.matchesBranch === false) status.message = `The workspace configuration ${status.configPath} names feature ${context.featureId}, but the current branch is ${status.branch ?? 'a detached HEAD'}: `
    + 'run.start stops until the human confirms the configuration belongs to this run (workspace.confirmFeature) or instructs its replacement (workspace.replace).';
  else status.message = null;
  return status;
}
export async function currentSnapshot(context, options = {}, runtime = {}) {
  let core, data = null, reason = null;
  const entry = runtime.entryPoints ?? await resolveEntryPoints({ env: runtime.environment ?? process.env });
  const cwd = context.repository?.path ?? context.workspaceRoot;
  try {
    core = await CurrentCore.at(context, runtime);
    if (await core.store.active()) data = await core.inspect();
    else reason = `Resume with the current protocol (run.resume-current; ${recoveryText(entry, ['run.resume-current'], { cwd, requests: { 'run.resume-current': { input: { implementers: ['<implementing-context>'] } } } })}). Existing documents and old journals remain intact; old events are not replayed.`;
  } catch (error) { reason = error.message; }
  const artifacts = await documents(context);
  const events = data ? (await core.state()).events : [];
  return {
    schemaVersion: 1, contract: CONTRACT, mode: data ? 'governed' : 'current-entry',
    featureId: context.featureId, featureHome: context.featureHome, current: data,
    // Current dial values for a governed run; with no current run, the built-in
    // defaults a new or resumed run receives unless explicitly chosen.
    dials: data ? { rigor: data.dials.rigor.value, autonomy: data.dials.autonomy.value } : null,
    dialDefaults: DEFAULT_DIALS,
    // Configured delivery branches (empty for the unconfigured Git fallback).
    branches: (context.repositories ?? []).filter(item => item.integrationBranch).map(item => ({ alias: item.alias,
      integrationBranch: item.integrationBranch, releaseBranch: item.releaseBranch || item.integrationBranch })),
    entryPoints: { adapter: entry.adapter, cli: entry.cli },
    workspace: await workspaceSummary(context, data, entry, cwd, runtime),
    phases: PHASES, obligations: data?.obligations ?? GATES.filter(item => !item.optional && !item.supplemental),
    milestones: data?.milestones ?? [], database: core ? await core.store.inspect() : null, artifacts, enforcement: ENFORCEMENT,
    events: { count: events.length, lastEventId: events.at(-1)?.hash ?? null },
    recentEvents: events.slice(-10), sources: options.sources ?? {},
    // Delegation scope, protection, hand-backs and delegated decisions, and the
    // current light candidate's tripwire hits (spec AC4, AC5).
    delegation: data?.delegation ?? null,
    // Goal autonomy: the native-goal condition and terminal state (spec AC2).
    goal: data?.goal ?? null,
    tripwires: data ? tripwireSummary(data) : null,
    blockers: reason ? [{ type: 'current-entry', message: reason }] : [...runBlockers(data), ...(data?.externalBlocker ? [{ type: 'external-blocker',
      message: `PR #${data.externalBlocker.number} (${data.externalBlocker.headBranch} -> ${data.externalBlocker.baseBranch}) is blocked by a hosting rule (${data.externalBlocker.blocker}); this is not a gate failure. Resolve it on the host, then run merge.execute again (${recoveryText(entry, ['merge.execute'], { cwd, requests: { 'merge.execute': { input: { repository: data.externalBlocker.repository ?? '<alias>', number: data.externalBlocker.number, method: data.externalBlocker.method ?? '<authorized method>' } } } })}).` }] : [])],
    actions: [...snapshotActions(entry, cwd, Boolean(reason)), ...(data && context.mode && !(context.repositories ?? []).every(item => item.integrationBranch)
      ? [{ id: 'configure-workspace', label: 'Write the workspace configuration delivery needs (GitHub default branch as integration and release)', operation: 'workspace.configure', ...operationCommand(entry, 'workspace.configure', { cwd }) }] : [])],
  };
}
export async function readCurrent(context, kind, id, runtime = {}) {
  if (kind === 'artifact') {
    const artifact = (await documents(context)).find(item => item.id === id);
    requireThat(artifact && artifact.exists && !artifact.unsafe, 'Requested artifact is not safely available');
    return { schemaVersion: 1, kind, id, data: { artifact,
      content: (await readSafe(context.featureHome, artifact.path)).toString('utf8'), format: 'markdown' } };
  }
  if (kind === 'model') return { schemaVersion: 1, kind, id: CONTRACT, data: {
    phases: PHASES, obligations: GATES, graph: { mermaid: 'flowchart LR\n  Planning --> Authorization --> Implementation --> Acceptance --> Merge --> Completion' } } };
  const core = await CurrentCore.at(context, runtime);
  const { state, events } = await core.state();
  if (kind === 'events') return { schemaVersion: 1, kind, id: state.runId, data: { events } };
  if (kind === 'result') {
    const ref = state.results.find(item => item.hash === id) ?? state.planningReviews.find(item => item.result.hash === id)?.result;
    requireThat(ref, 'Unknown current result');
    const result = await core.store.json(ref);
    return { schemaVersion: 1, kind, id, data: { result, input: result.input ? await core.store.json(result.input) : null, receipt: await core.store.json(result.receipt),
      ...(result.kind === 'planning-review' ? { output: await core.store.json(result.output) } : {}) } };
  }
  throw new Error('Unsupported current detail kind');
}
async function executeObservedRequest(request, runtime = {}) {
  const operation = request?.operation ?? 'unknown';
  let prepared = null;
  try {
    let context = await contextFor(request, runtime);
    // Workspace configuration (spec AC6) is decided, and when allowed written,
    // before the feature home is created: a configuration naming another feature
    // stops here, and a written or replaced one decides which home is used.
    // run.resume-current that would start a fresh run (nothing to resume in the
    // resolved feature home) is a run start and follows the same rules (NEW4);
    // genuine resumption of a current run or retained activation is unaffected.
    const freshResume = operation === 'run.resume-current' && context.mode && await startsFreshRun(context.featureHome, context.workspaceRoot);
    if (operation === 'run.start' || freshResume) {
      validateStart(request.input ?? {});
      prepared = await prepareWorkspace(context, request.input?.workspace, runtime, { operation, createAllowed: request.input?.autonomy?.value !== 'delegated' });
      context = prepared.context;
    }
    if (operation === 'workspace.configure') { prepared = await prepareWorkspace(context, request.input ?? {}, runtime, { operation }); context = prepared.context; }
    if (['run.start', 'run.resume-current'].includes(operation)) await ensureHome(context);
    if (['status', 'snapshot', 'next'].includes(operation)) return successResult(operation, await currentSnapshot(context, request.options, runtime));
    if (operation === 'read') return successResult(operation, await readCurrent(context, request.kind, request.id, runtime));
    const core = await CurrentCore.at(context, runtime);
    if (prepared) core[WORKSPACE_PREPARED] = prepared;
    let input = request.input ?? {};
    if (['run.start', 'run.resume-current'].includes(operation)) {
      let active = null;
      try {
        if (operation === 'run.resume-current') await core.store.activationHead({ repair: true });
        active = await core.store.active();
        if (active) {
          if (operation === 'run.resume-current') await core.store.events(active.runId, { repair: true });
          await core.state();
        }
      }
      catch (error) { if (operation !== 'run.resume-current') throw error; active = null; }
      if (active && operation === 'run.start') throw new Error('Current run already exists; use run.resume-current');
      // Explicit start/resume setup owns this narrow untracked-file policy.
      // Existing runtime records are never edited or interpreted here.
      const localStore = join(context.featureHome, '.gatereeve-current');
      await mkdir(localStore, {recursive:true});
      requireThat(!(await lstat(localStore)).isSymbolicLink(), 'Unsafe local workflow directory');
      let ignored = '';
      try { ignored = (await readSafe(context.featureHome, '.gatereeve-current/.gitignore')).toString(); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!ignored.split('\n').includes('/workflow.sqlite*')) await appendFile(join(localStore,'.gitignore'), `${ignored && !ignored.endsWith('\n') ? '\n' : ''}/workflow.sqlite*\n`, {mode:0o600});
      input = { ...input, runId: input.runId ?? active?.runId ?? request.operationId ?? randomUUID() };
    }
    try { return successResult(operation, await core.execute({ ...request, input })); }
    catch (error) { if (await unrecorded(core, prepared, operation, input)) await prepared.rollback(); throw error; }
  } catch (error) {
    // A configuration written for this request but recorded by no run is removed.
    if (prepared?.rollback && !prepared.kept) await prepared.rollback().catch(() => {});
    return failureResult(operation, error);
  }
}
// Whether a configuration this request wrote is recorded by no event: it is then
// rolled back rather than left as an unrecorded write.
async function unrecorded(core, prepared, operation, input) {
  if (!prepared?.rollback) return false;
  prepared.kept = true;
  try {
    const active = await core.store.active();
    if (!active || (operation !== 'workspace.configure' && active.runId !== input.runId)) return true;
    const events = await core.store.events(active.runId);
    return !events.some(event => event.payload?.workspace?.file?.hash === prepared.record.file.hash || event.payload?.file?.hash === prepared.record.file.hash);
  } catch { return false; }
}

export async function executeCurrentRequest(request, runtime = {}) {
  const operation = request?.operation ?? 'unknown';
  if (['database.inspect','database.history'].includes(operation)) return executeObservedRequest(request,runtime);
  return observe({project:request?.cwd ?? process.cwd(), category:['status','snapshot','next'].includes(operation)?'poll':'operation', command:operation, worker:false}, () => executeObservedRequest(request,runtime));
}
