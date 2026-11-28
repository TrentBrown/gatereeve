import { randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, rename, unlink, appendFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { reresolveWorkflowContext, validateFeatureId } from '../context.js';
import { ContractError } from '../errors.js';
import { authority, digest, object, requireThat, text } from './contracts.js';
import { deliveryBranches } from './authorization.js';
import { git } from './evidence.js';
import { CurrentStore } from './store.js';

// Workspace configuration for delivery (spec AC6, design Changes 2026-11-17).
// Merge preparation and execution use `.agentic-workflow.json`; there is no
// configuration-free delivery path. When a run starts in a repository with a
// GitHub remote and no configuration, GateReeve writes a minimal one: the
// current branch as the feature, and the observed default branch as both the
// integration and the release branch (so only per-PR human merges exist). It is
// added to the local Git excludes, never committed, and recorded with the run.
// A configuration naming another feature stops the operation until a human
// confirms it belongs to this run or instructs its replacement.
export const CONFIG_NAME = '.agentic-workflow.json';
export const EXCLUDE_ENTRY = `/${CONFIG_NAME}`;
// The alias the Git fallback gives its single repository; the written
// configuration keeps it so status, guard and request skeletons stay the same.
export const FALLBACK_ALIAS = 'repository';
// Set by the adapter on a core when it already prepared the workspace for this
// request (before the feature home was created). Not reachable from JSON input.
export const WORKSPACE_PREPARED = Symbol('workspace prepared for this request');

const INSTRUCTION_FIELDS = ['replace', 'confirmFeature', 'authority'];
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

// `workspace` input of run.start and the input of workspace.configure.
// Both instructions need the observed human instruction.
export function workspaceInstruction(value) {
  if (value === undefined || value === null) return { kind: null };
  object(value, 'Workspace instruction');
  requireThat(Object.keys(value).every(key => INSTRUCTION_FIELDS.includes(key)), `Unsupported workspace instruction field; use ${INSTRUCTION_FIELDS.join(', ')}`);
  if (!Object.keys(value).length) return { kind: null };
  requireThat(value.replace === undefined || value.replace === true, 'workspace.replace must be true');
  requireThat(!(value.replace && value.confirmFeature !== undefined), 'Either replace the workspace configuration or confirm its feature, not both');
  requireThat(value.replace || value.confirmFeature !== undefined, 'A workspace instruction is replace: true or confirmFeature: <configured featureId>');
  if (value.confirmFeature !== undefined) text(value.confirmFeature, 'workspace.confirmFeature');
  requireThat(value.authority !== undefined, value.replace
    ? 'Replacing a workspace configuration needs the observed human instruction (authority)'
    : 'Confirming that this run belongs to the configured feature needs the observed human instruction (authority)');
  return value.replace ? { kind: 'replace', authority: authority(value.authority) }
    : { kind: 'confirm', feature: value.confirmFeature, authority: authority(value.authority) };
}

// Whether a branch belongs to a configured feature: the feature branch itself,
// one of its sequential delivery branches (<featureId>-NN-<description>, as
// workflow_context.py builds them), or its distinct integration branch.
export function branchFeatureMatch(featureId, branch, repository) {
  if (!branch) return null;
  if (branch === featureId) return 'feature-branch';
  const delivery = new RegExp(`^${escape(featureId)}-(\\d{2,})-[A-Za-z0-9][A-Za-z0-9._-]*$`, 'u').exec(branch);
  if (delivery && Number(delivery[1]) >= 1) return 'delivery-branch';
  const { integration, distinct } = deliveryBranches(repository);
  if (distinct && branch === integration) return 'integration-branch';
  return null;
}

function tools(runtime = {}) {
  return {
    git: runtime.git ?? ((root, args) => git(root, args, { gitExecutable: runtime.gitExecutable ?? 'git' })),
    gh: runtime.gh ?? (async (root, args) => (await import('./actions.js')).gh(root, args)),
  };
}
async function currentBranch(run, path) {
  try { return (await run.git(path, ['branch', '--show-current'])).trim(); }
  catch { return ''; }
}
const message = error => String(error?.stderr || error?.message || error).trim().split('\n')[0].slice(0, 500);

// What a written configuration would name, observed with non-admin access.
// Fails closed: any unobservable fact yields { ok: false, reason }.
export async function observeDelivery(root, branch, runtime = {}) {
  const run = tools(runtime);
  const { remoteName } = await import('./actions.js');
  try { validateFeatureId(branch); }
  catch (error) { return { ok: false, reason: `the current branch ${JSON.stringify(branch)} cannot name a configured feature (${error.message})` }; }
  const github = async name => {
    try { return remoteName(await run.git(root, ['config', '--get', `remote.${name}.url`])); } catch { return null; }
  };
  let remote = null, ownerRepo = await github('origin');
  if (ownerRepo) remote = 'origin';
  else {
    let names = [];
    try { names = (await run.git(root, ['remote'])).split('\n').map(item => item.trim()).filter(Boolean); } catch { names = []; }
    const found = [];
    for (const name of names.filter(item => item !== 'origin')) { const value = await github(name); if (value) found.push({ name, value }); }
    if (found.length > 1) return { ok: false, reason: `several GitHub remotes (${found.map(item => item.name).join(', ')}) and origin is not one; write the configuration by hand naming the remote` };
    if (found.length === 0) return { ok: false, reason: 'the repository has no GitHub remote (git@github.com:owner/repo or https://github.com/owner/repo)' };
    ({ name: remote, value: ownerRepo } = found[0]);
  }
  const endpoint = `repos/${ownerRepo}`;
  let body;
  try { body = await run.gh(root, ['api', '--method', 'GET', endpoint]); }
  catch (error) { return { ok: false, remote, ownerRepo, reason: `the default branch of ${ownerRepo} could not be observed (GET ${endpoint}: ${message(error)})` }; }
  let value;
  try { value = JSON.parse(body); } catch { return { ok: false, remote, ownerRepo, reason: `the response of GET ${endpoint} is not JSON, so the default branch is unknown` }; }
  const defaultBranch = value?.default_branch;
  try { validateFeatureId(defaultBranch); }
  catch { return { ok: false, remote, ownerRepo, reason: `GET ${endpoint} did not report a usable default branch` }; }
  if (defaultBranch === branch) return { ok: false, remote, ownerRepo, defaultBranch, reason: `the current branch ${branch} is the default branch; start the run on a feature branch to configure delivery` };
  return { ok: true, remote, ownerRepo, defaultBranch, source: `GET ${endpoint}`, observedAt: new Date().toISOString(),
    featureBase: await observeFeatureBase(root, remote, defaultBranch, runtime) };
}

// GitHub issue #145: FEATURE scope needs the feature's original base. At run
// start that is the merge base of HEAD with the default branch, preferring the
// already-fetched remote-tracking ref (no fetch, no network side effect). When
// neither ref resolves, the configuration omits it and the record says why.
export async function observeFeatureBase(root, remote, defaultBranch, runtime = {}) {
  const run = tools(runtime);
  const refs = [`refs/remotes/${remote}/${defaultBranch}`, `refs/heads/${defaultBranch}`];
  for (const ref of refs) {
    try {
      const sha = (await run.git(root, ['merge-base', 'HEAD', ref])).trim().toLowerCase();
      if (/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(sha)) return { sha, ref };
    } catch { /* Try the next ref; an unresolvable base is reported below. */ }
  }
  return { sha: null, reason: `no merge base of HEAD with ${refs.join(' or ')}; add featureBaseSha to the configuration by hand for FEATURE scope` };
}

// The minimal configuration: one repository at the workspace root, with the
// default branch as integration and release, and the observed feature base.
export function minimalConfiguration(featureId, observed) {
  return { schemaVersion: 1, featureId, repositories: { [FALLBACK_ALIAS]: { path: '.', remote: observed.remote,
    integrationBranch: observed.defaultBranch, releaseBranch: observed.defaultBranch, keepPullRequestsClosed: false,
    ...(observed.featureBase?.sha ? { featureBaseSha: observed.featureBase.sha } : {}) } } };
}
const serialize = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

// Exclusive, atomic publication: a complete temporary file is hard-linked into
// place, which fails rather than overwrite a file that appeared meanwhile.
async function writeExclusive(path, bytes) {
  const temp = join(dirname(path), `${CONFIG_NAME}.pending-${randomUUID()}`);
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  try { await link(temp, path); }
  catch (error) {
    if (error.code === 'EEXIST') throw new ContractError(`A workspace configuration appeared at ${path} while GateReeve was writing one; it was not overwritten. Inspect it and run the operation again.`);
    throw error;
  } finally { await unlink(temp).catch(() => {}); }
}
// Replacement (human-instructed only): the file must still hold the bytes that
// were judged, then a complete new file is renamed over it.
async function writeReplacing(path, bytes, previous) {
  const temp = join(dirname(path), `${CONFIG_NAME}.pending-${randomUUID()}`);
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  try {
    requireThat(digest(await readFile(path)) === digest(previous), `The workspace configuration at ${path} changed while it was being replaced; inspect it and ask the human again`);
    await rename(temp, path);
  } finally { await unlink(temp).catch(() => {}); }
}
async function restore(path, ours, previous) {
  try {
    if (digest(await readFile(path)) !== digest(ours)) return;
    if (previous) await writeReplacing(path, previous, ours);
    else await unlink(path);
  } catch { /* Best effort: the failure that triggered the rollback is reported. */ }
}

// Add the configuration to the repository's local excludes (shared by every
// worktree through the common Git directory), idempotently.
export async function excludeConfiguration(root, runtime = {}) {
  const run = tools(runtime);
  const common = resolve(root, (await run.git(root, ['rev-parse', '--git-common-dir'])).trim());
  const path = join(common, 'info', 'exclude');
  await mkdir(dirname(path), { recursive: true });
  let current = '';
  try { current = await readFile(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const present = current.split('\n').map(line => line.trim()).some(line => [EXCLUDE_ENTRY, CONFIG_NAME].includes(line));
  if (!present) await appendFile(path, `${current && !current.endsWith('\n') ? '\n' : ''}${EXCLUDE_ENTRY}\n`);
  return { path, entry: EXCLUDE_ENTRY, added: !present };
}

// Whether run.resume-current would start a fresh run here: no current run and
// no retained activation (of this or an earlier contract) to resume. Reading
// creates nothing, so a stale feature home is never created by the check.
export async function startsFreshRun(home, root) {
  let store;
  try { store = await CurrentStore.at(home, root); }
  catch (error) { if (error.code === 'ENOENT') return true; throw error; }
  return !(await store.activationHead());
}
async function activeRun(home, root) {
  let store;
  try { store = await CurrentStore.at(home, root); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  return store.active();
}
// A run start (run.start, or run.resume-current starting a fresh run) needs the
// target feature home free; workspace.configure needs the existing run there (it
// records the write in that run's journal).
async function requireRunState(operation, home, root) {
  const active = await activeRun(home, root);
  if (operation !== 'workspace.configure') requireThat(!active, 'Current run already exists; use run.resume-current');
  else requireThat(active, 'No current run for this feature. run.start writes the workspace configuration when it starts a run; workspace.configure is for an existing run without one.');
}

function mismatch(context, branch, operation) {
  const feature = context.featureId;
  const on = branch ? `branch ${branch}` : 'a detached HEAD';
  return new ContractError(`The workspace configuration ${context.configPath} names feature ${feature}, but ${operation} runs on ${on}, which is not ${feature}, `
    + `one of its delivery branches (${feature}-NN-<description>) or its integration branch. GateReeve never silently reuses another feature's configuration. `
    + `Stop for the human: if this run belongs to ${feature}, record their confirmation as workspace {"confirmFeature":"${feature}","authority":<observed instruction>}; `
    + `to replace the configuration with one for ${branch || 'the current branch'} (its default branch as integration and release), record their instruction as workspace {"replace":true,"authority":<observed instruction>}.`,
  { kind: 'workspace-feature-mismatch', configPath: context.configPath, featureId: feature, branch: branch || null });
}

async function written(context, branch, observed, operation, run, previous = null) {
  const root = context.repository.path;
  const path = previous ? context.configPath : join(root, CONFIG_NAME);
  const configuration = minimalConfiguration(branch, observed);
  const bytes = serialize(configuration);
  const exclude = await excludeConfiguration(root, run);
  if (previous) await writeReplacing(path, bytes, previous.bytes);
  else await writeExclusive(path, bytes);
  const rollback = () => restore(path, bytes, previous?.bytes ?? null);
  let next;
  try {
    next = await reresolveWorkflowContext(context);
    requireThat(next.mode === 'configured' && next.configPath === path && next.featureId === branch
      && next.featureHome === resolve(root, 'docs', 'issues', branch), 'The written workspace configuration does not resolve to this feature');
  } catch (error) { await rollback(); throw error; }
  const { ok, ...facts } = observed;
  return { context: next, bytes, previousBytes: previous?.bytes ?? null, rollback, record: {
    status: previous ? 'replaced' : 'created', operation, configPath: path, featureId: branch, branch,
    observed: facts, configuration, file: { hash: digest(bytes), bytes: bytes.length }, exclude,
    ...(previous ? { previous: { featureId: previous.featureId, file: { hash: digest(previous.bytes), bytes: previous.bytes.length } }, authority: previous.authority } : {}) } };
}

// Decide, and when the rules allow it perform, the workspace configuration for
// run.start or workspace.configure. Returns { context, record } where context
// is the (possibly newly) resolved context the operation continues in.
// `fixedHome`: the caller's store cannot move, so a replacement that changes the
// feature home is refused before anything is written.
export async function prepareWorkspace(context, value, runtime = {}, { operation = 'run.start', fixedHome = null, createAllowed = true } = {}) {
  const instruction = workspaceInstruction(value);
  // An embedder's explicit in-memory context has no discovery to configure.
  if (!context?.mode) {
    requireThat(!instruction.kind, 'Workspace instructions need a resolved workspace context');
    return { context, record: null };
  }
  const run = tools(runtime);
  const repository = context.repository;
  const root = repository.path;
  if (context.mode === 'configured') {
    const branch = await currentBranch(run, root);
    const match = branchFeatureMatch(context.featureId, branch, repository);
    const configured = extra => ({ context, record: { status: 'configured', operation, configPath: context.configPath, featureId: context.featureId, branch: branch || null, ...extra } });
    if (match) {
      requireThat(!instruction.kind, `The workspace configuration already names feature ${context.featureId} for ${branch}; no workspace instruction is needed`);
      if (operation === 'workspace.configure') await requireRunState(operation, context.featureHome, context.workspaceRoot);
      return configured({ match });
    }
    if (instruction.kind === 'confirm') {
      requireThat(instruction.feature === context.featureId, `confirmFeature must name the configured feature ${context.featureId}; to work on another feature, replace the configuration`);
      if (operation === 'workspace.configure') await requireRunState(operation, context.featureHome, context.workspaceRoot);
      return configured({ match: 'human-confirmed', authority: instruction.authority });
    }
    if (instruction.kind !== 'replace') throw mismatch(context, branch, operation);
    requireThat(branch, 'The current branch is a detached HEAD, so it cannot name the replacement feature; check out the feature branch first');
    requireThat(context.repositories.length === 1 && context.workspaceRoot === root,
      `Only a single-repository configuration at the repository root can be replaced by GateReeve; edit ${context.configPath} by hand`);
    const home = resolve(root, 'docs', 'issues', branch);
    requireThat(!fixedHome || resolve(fixedHome) === home, 'Replacing the workspace configuration moves the feature home; run the operation again through the adapter or CLI');
    const observed = await observeDelivery(root, branch, runtime);
    requireThat(observed.ok, `The workspace configuration was not replaced: ${observed.reason}`, { observed });
    await requireRunState(operation, home, root);
    const bytes = await readFile(context.configPath);
    return written(context, branch, observed, operation, run, { featureId: context.featureId, bytes, authority: instruction.authority });
  }
  // Git fallback: no configuration anywhere above this repository.
  requireThat(!instruction.kind, 'There is no workspace configuration to confirm or replace here');
  const branch = context.featureId;
  await requireRunState(operation, context.featureHome, context.workspaceRoot);
  const unconfigured = reason => ({ context, record: { status: 'unconfigured', operation, featureId: branch, branch, reason } });
  if (!createAllowed) return unconfigured('delegation at run start needs a configuration that already names a protected release branch');
  const observed = await observeDelivery(root, branch, runtime);
  if (!observed.ok) {
    requireThat(operation !== 'workspace.configure', `The workspace configuration was not written: ${observed.reason}`, { observed });
    return { context, record: { ...unconfigured(observed.reason).record, ...(observed.ownerRepo ? { observed: { remote: observed.remote, ownerRepo: observed.ownerRepo } } : {}) } };
  }
  return written(context, branch, observed, operation, run);
}

// Status: what the current context names for delivery, and what to do if not.
export async function workspaceStatus(context, recorded, runtime = {}) {
  if (!context?.mode) return null;
  const repositories = context.repositories ?? [];
  const configured = context.mode === 'configured' && repositories.length > 0 && repositories.every(item => item.integrationBranch);
  const status = { mode: context.mode, configPath: context.configPath ?? null, configured, recorded: recorded ?? null };
  if (context.mode === 'configured') {
    const branch = await currentBranch(tools(runtime), context.repository.path);
    status.branch = branch || null;
    status.matchesBranch = Boolean(branchFeatureMatch(context.featureId, branch, context.repository));
  }
  return status;
}
