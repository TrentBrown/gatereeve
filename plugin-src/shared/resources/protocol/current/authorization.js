import { realpath } from 'node:fs/promises';
import { identity, requireThat, object, text, decisionHas, latestImplementation, currentAuthorityDecisions } from './contracts.js';
import { git, checkCandidate } from './evidence.js';

// Even a later amendment without implementation continuation invalidates a
// grant. Reverting document bytes cannot revive authority from before it.
const branchMatches = (branch, prefix) => branch === prefix || branch.startsWith(`${prefix}-`);
export function requireUnexpired(grant) {
  requireThat(grant.scope.expiresAt === null || Date.parse(grant.scope.expiresAt) > Date.now(), 'Standing grant has expired');
}
export function configuredGit(core) {
  return core.runtime.git ?? ((root, args) => git(root, args, {
    gitExecutable: core.context.repositories.find(repository => repository.path === root)?.gitExecutable ?? 'git',
  }));
}
function fields(value, allowed, label) {
  object(value, label);
  requireThat(Object.keys(value).every(key => allowed.includes(key)), `Unsupported ${label} field`);
}
function distinct(values, allowed, label) {
  requireThat(Array.isArray(values) && values.length > 0 && new Set(values).size === values.length
    && values.every(value => allowed.includes(value)), `Invalid ${label}`);
}
export function standingScope(scope) {
  fields(scope, ['actions', 'candidateScopes', 'repositories', 'expiresAt'], 'standing scope');
  distinct(scope.actions, ['accept', 'authorize-merge'], 'standing actions');
  requireThat(scope.actions.includes('accept'), 'Standing authority requires acceptance permission');
  distinct(scope.candidateScopes, ['SLICE', 'FEATURE'], 'candidate scopes');
  requireThat(scope.expiresAt === null || typeof scope.expiresAt === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(scope.expiresAt)
    && Number.isFinite(Date.parse(scope.expiresAt)), 'Explicit UTC expiry or null for this feature run is required');
  requireThat(Array.isArray(scope.repositories) && scope.repositories.length > 0
    && new Set(scope.repositories.map(item => item?.alias)).size === scope.repositories.length, 'Name distinct standing repositories');
  for (const repository of scope.repositories) {
    fields(repository, ['alias', 'headPrefix', 'baseBranch', 'methods'], 'standing repository');
    for (const key of ['alias', 'headPrefix', 'baseBranch']) text(repository[key], key);
    requireThat(!/[\s*?\[\\]/u.test(repository.headPrefix) && !repository.headPrefix.startsWith('-'), 'Use a literal delivery branch prefix');
    if (scope.actions.includes('authorize-merge')) distinct(repository.methods, ['merge', 'squash', 'rebase'], 'merge methods');
    else requireThat(repository.methods === undefined, 'Acceptance-only grants cannot carry merge methods');
  }
  return structuredClone(scope);
}
async function bindings(core, scope) {
  const runGit = configuredGit(core);
  const result = [];
  for (const selected of scope.repositories) {
    const repository = core.context.repositories.find(item => item.alias === selected.alias);
    requireThat(repository && [repository.integrationBranch, repository.releaseBranch].filter(Boolean).includes(selected.baseBranch), 'Standing scope must name a configured repository and target');
    const remote = repository.remote ?? 'origin';
    const remoteUrl = (await runGit(repository.path, ['config', '--get', `remote.${remote}.url`])).trim();
    requireThat(remoteUrl, 'Standing scope requires a repository remote identity');
    result.push({ alias: repository.alias, path: await realpath(repository.path), remote, remoteUrl,
      featureBaseSha: repository.featureBaseSha ?? null, integrationBranch: repository.integrationBranch ?? null,
      releaseBranch: repository.releaseBranch ?? null, keepPullRequestsClosed: Boolean(repository.keepPullRequestsClosed) });
  }
  return result;
}
export async function captureStanding(core, state, value) {
  requireThat(!state.paused && state.phase !== 'COMPLETE', 'Standing grant requires an active unpaused feature');
  const current = await core.commitments();
  const implementation = latestImplementation(state);
  requireThat(value.subject === current.subject && implementation?.subject === current.subject
    && decisionHas(implementation, 'authorize-implementation')
    && (await core.check('implementation', state)).allowed, 'Standing grant requires current implementation authority');
  const scope = standingScope(value.scope);
  requireThat(scope.expiresAt === null || Date.parse(scope.expiresAt) > Date.now(), 'Standing grant has expired');
  return { ...value, scope, runId: state.runId, implementation: implementation.event,
    repositories: await bindings(core, scope), documents: current.docs };
}
export async function standingValidity(core, state, grant, candidate = null, action = null, { allowIntegratedTargets = false } = {}) {
  try {
    requireThat(grant?.kind === 'authorize-standing', 'Unknown standing grant');
    requireThat(grant.runId === state.runId, 'Standing grant belongs to another run');
    requireThat(!state.paused, 'Feature is explicitly paused');
    requireThat(!state.decisions.some(item => item.kind === 'revoke-standing' && item.subject === grant.event), 'Standing grant was revoked');
    requireUnexpired(grant);
    const current = await core.commitments({ capture: false });
    requireThat(current.subject === grant.subject && latestImplementation(state)?.event === grant.implementation,
      'Standing grant no longer matches approved commitments or implementation authorization');
    requireThat(identity(await bindings(core, grant.scope)) === identity(grant.repositories), 'Standing repository configuration or remote identity changed');
    if (candidate) {
      requireThat(candidate.authorization.subject === grant.subject && grant.scope.candidateScopes.includes(candidate.scope), 'Candidate is outside standing scope');
      for (const pin of candidate.repositories) {
        const selected = grant.scope.repositories.find(item => item.alias === pin.alias);
        requireThat(selected, 'Candidate repository is outside standing scope');
        const repository = core.context.repositories.find(item => item.alias === pin.alias);
        const runGit = configuredGit(core);
        const integration = state.integrations[pin.alias];
        // Existing acceptance remains usable for completion after the protected
        // merge advances its target. This cannot authorize a new acceptance.
        if (allowIntegratedTargets && integration?.candidate.hash === state.candidate?.hash) {
          requireThat(integration.branch === selected.baseBranch, 'Observed integration is outside standing target scope');
          await core.store.get(integration.receipt);
          continue;
        }
        const branch = (await runGit(repository.path, ['branch', '--show-current'])).trim();
        requireThat(branchMatches(branch, selected.headPrefix), 'Source branch is outside standing scope');
        const target = (await runGit(repository.path, ['ls-remote', '--exit-code', repository.remote ?? 'origin', `refs/heads/${selected.baseBranch}`])).split(/\s/u)[0];
        requireThat(target === pin.target, 'Assessed target differs from the standing target branch; refresh target and interaction evidence');
      }
    }
    if (action) {
      const selected = grant.scope.repositories.find(item => item.alias === action.repository);
      requireThat(grant.scope.actions.includes('authorize-merge') && selected
        && action.baseBranch === selected.baseBranch && branchMatches(action.headBranch, selected.headPrefix)
        && selected.methods.includes(action.method), 'Merge action is outside standing scope');
    }
    requireUnexpired(grant);
    return { allowed: true, reason: null };
  } catch (error) { return { allowed: false, reason: error.message }; }
}
export async function applyStanding(core, input, operation) {
  fields(input, ['grant', 'action'], 'standing application');
  const { state } = await core.state();
  const grant = state.decisions.find(item => item.event === input.grant && item.kind === 'authorize-standing');
  requireThat(state.candidate, 'Prepare a candidate before applying standing authority');
  const candidate = await checkCandidate(core.store, core.context, state.candidate);
  const validity = await standingValidity(core, state, grant, candidate, input.action);
  requireThat(validity.allowed, validity.reason);
  const check = await core.check('acceptance', state);
  requireThat(check.allowed && check.outcomes.every(item => item.outcome === 'PASS'), 'Standing application requires current PASS evidence for every required gate', check);
  if (input.action) {
    const { prepareMerge } = await import('./actions.js');
    requireThat(identity(await prepareMerge(core, input.action)) === identity(input.action), 'Standing application must bind the exact prepared merge action');
  }
  // Recheck after potentially slow proof and remote reads. append also checks the
  // original event count, so a concurrent revoke/pause/candidate cannot win a race.
  const final = await standingValidity(core, state, grant, candidate, input.action);
  requireThat(final.allowed, final.reason);
  await checkCandidate(core.store, core.context, state.candidate);
  requireUnexpired(grant);
  return core.append(state, 'DECIDED', { kind: 'accept', subject: state.candidate.hash,
    authority: grant.authority, reason: grant.reason, consequences: grant.consequences,
    standingGrant: grant.event, actions: input.action ? ['authorize-merge'] : [],
    ...(input.action ? { action: input.action } : {}), requestId: operation.id }, operation);
}
export async function qualifyingDecisions(core, state, kind, subject, candidate) {
  const decisions = [];
  for (const item of currentAuthorityDecisions(state)) {
    if (!decisionHas(item, kind) || item.subject !== subject) continue;
    if (item.standingGrant) {
      const grant = state.decisions.find(entry => entry.event === item.standingGrant);
      if (!(await standingValidity(core, state, grant, candidate, kind === 'authorize-merge' ? item.action : null,
        { allowIntegratedTargets: kind === 'accept' })).allowed) continue;
    }
    decisions.push(item);
  }
  return decisions;
}
