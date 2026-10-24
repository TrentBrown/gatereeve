import { mkdir, lstat } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveWorkflowContext } from '../context.js';
import { successResult, failureResult } from '../result.js';
import { CurrentCore } from './core.js';
import { CurrentStore, readSafe } from './store.js';
import { CONTRACT, PHASES, GATES, ENFORCEMENT, identity, digest, requireThat } from './contracts.js';

const DOCUMENTS = ['interview.md', 'design.md', 'spec.md', 'plan.md', 'issues.md', 'tracker.md', 'scratchpad.md', 'decisions.md'];
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
    artifacts.push({ id: name, kind: 'document', format: 'markdown', label: name.replace('.md', ''), path: name,
      absolutePath: join(context.featureHome, name), exists: Boolean(ref), unsafe,
      status: unsafe ? 'unavailable' : ref ? 'available' : 'missing', fingerprint: ref?.hash ?? null });
  }
  return artifacts;
}
export async function currentSnapshot(context, options = {}, runtime = {}) {
  let core, data = null, reason = null;
  try {
    core = await CurrentCore.at(context, runtime);
    if (await core.store.active()) data = await core.inspect();
    else reason = 'Resume with the current protocol. Existing documents and old journals remain intact; old events are not replayed.';
  } catch (error) { reason = error.message; }
  const artifacts = await documents(context);
  const events = data ? (await core.state()).events : [];
  return {
    schemaVersion: 1, contract: CONTRACT, mode: data ? 'governed' : 'current-entry',
    featureId: context.featureId, featureHome: context.featureHome, current: data,
    phases: PHASES, obligations: data?.obligations ?? GATES.filter(item => !item.optional),
    milestones: data?.milestones ?? [], artifacts, enforcement: ENFORCEMENT,
    events: { count: events.length, lastEventId: events.at(-1)?.hash ?? null },
    recentEvents: events.slice(-10), sources: options.sources ?? {},
    blockers: reason ? [{ type: 'current-entry', message: reason }] : [],
    actions: reason ? [{ id: 'resume-current', command: 'gatereeve run resume-current --help', readiness: 'available', label: 'Resume using current commitments' }] : [
      { id: 'status', command: 'gatereeve status --json', label: 'Inspect exact current commitments and proof' },
      { id: 'work', command: 'gatereeve --help', label: 'Choose work within the authorized phase' },
      { id: 'evaluate', command: 'gatereeve evaluate --help', label: 'Request checks explicitly; readiness launches none' },
      { id: 'decide', command: 'gatereeve decide --help', label: 'Record observed human decisions and scoped exceptions' },
      { id: 'apply-authorization', command: 'gatereeve apply-authorization --help', label: 'Apply recorded standing permission after all required gates pass' },
    ],
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
    const ref = state.results.find(item => item.hash === id);
    requireThat(ref, 'Unknown current result');
    const result = await core.store.json(ref);
    return { schemaVersion: 1, kind, id, data: { result, input: await core.store.json(result.input), receipt: await core.store.json(result.receipt) } };
  }
  throw new Error('Unsupported current detail kind');
}
export async function executeCurrentRequest(request, runtime = {}) {
  const operation = request?.operation ?? 'unknown';
  try {
    const context = await contextFor(request, runtime);
    if (['run.start', 'run.resume-current'].includes(operation)) await ensureHome(context);
    if (['status', 'snapshot', 'next'].includes(operation)) return successResult(operation, await currentSnapshot(context, request.options, runtime));
    if (operation === 'read') return successResult(operation, await readCurrent(context, request.kind, request.id, runtime));
    const core = await CurrentCore.at(context, runtime);
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
      input = { ...input, runId: input.runId ?? active?.runId ?? request.operationId ?? randomUUID() };
    }
    return successResult(operation, await core.execute({ ...request, input }));
  } catch (error) { return failureResult(operation, error); }
}
