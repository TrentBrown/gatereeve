import { realpath } from 'node:fs/promises';
import { identity, requireThat, object, text, decisionHas, latestImplementation, currentAuthorityDecisions } from './contracts.js';
import { git, checkCandidate } from './evidence.js';

// Even a later amendment without implementation continuation invalidates a
// grant. Reverting document bytes cannot revive authority from before it.
const branchMatches = (branch, prefix) => branch === prefix || branch.startsWith(`${prefix}-`);
export function requireUnexpired(grant) {
  requireThat(grant.scope.expiresAt === null || Date.parse(grant.scope.expiresAt) > Date.now(), 'Standing grant has expired');
}
// Delivery targets (spec AC6). With distinct branches, a SLICE PR targets the
// integration branch and only the FEATURE PR from integration to release targets
// release. With one branch, every merge targets release. Release merges always
// need a per-PR human authorize-merge: no standing grant and no delegation may
// authorize one.
export function deliveryBranches(repository) {
  const integration = repository?.integrationBranch || null;
  const release = repository?.releaseBranch || integration;
  return { integration, release, distinct: Boolean(integration && release && integration !== release) };
}
export function deliveryTarget(repository, scope, headBranch, baseBranch) {
  const { integration, release, distinct } = deliveryBranches(repository);
  requireThat(integration, 'PR branches do not match configured delivery: configure integrationBranch (and releaseBranch) for this repository');
  const pairing = `${scope} ${headBranch} -> ${baseBranch}`;
  if (!distinct) {
    requireThat(baseBranch === release, `PR branches do not match configured delivery: ${pairing} must target the configured branch ${release}`);
    return 'release';
  }
  requireThat(['SLICE', 'FEATURE'].includes(scope), 'Merge preparation requires an explicit candidate scope');
  if (scope === 'SLICE') {
    requireThat(baseBranch === integration && headBranch !== release,
      `Scope does not match target: a SLICE PR must target the integration branch ${integration} (only the FEATURE PR ${integration} -> ${release} may target ${release}); ${pairing} is rejected`);
    return 'integration';
  }
  requireThat(headBranch === integration && baseBranch === release,
    `Scope does not match target: only the FEATURE PR from the integration branch ${integration} to the release branch ${release} is a FEATURE delivery; ${pairing} is rejected (prepare a SLICE candidate for slice PRs)`);
  return 'release';
}
// Reason a standing grant naming this target cannot authorize, or null.
export function standingTargetRefusal(repository, baseBranch) {
  const { release, distinct } = deliveryBranches(repository);
  if (!release || baseBranch !== release) return null;
  return distinct
    ? `Standing scope names the release branch ${release}; release merges need a per-PR human authorize-merge, so a standing grant naming it authorizes neither acceptance nor merge`
    : `Integration and release are the same branch (${release}); no standing acceptance or merge authority exists for this repository. Configure a distinct integrationBranch for standing slice delivery`;
}
function releaseRefusal(core, scope) {
  for (const selected of scope?.repositories ?? []) {
    const reason = standingTargetRefusal(core.context.repositories.find(item => item.alias === selected?.alias), selected?.baseBranch);
    if (reason) return reason;
  }
  return null;
}
export function standingReleaseRefusal(core, grant) { return releaseRefusal(core, grant?.scope); }
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
    const urls = async args => (await runGit(repository.path, ['remote', 'get-url', ...args, '--all', remote])).trim().split(/\r?\n/u);
    const fetchUrls = await urls([]), pushUrls = await urls(['--push']);
    requireThat([...fetchUrls, ...pushUrls].every(Boolean), 'Standing scope requires effective fetch and push remote identities');
    result.push({ alias: repository.alias, path: await realpath(repository.path), remote, remoteUrl, fetchUrls, pushUrls,
      featureBaseSha: repository.featureBaseSha ?? null, integrationBranch: repository.integrationBranch ?? null,
      releaseBranch: repository.releaseBranch ?? null, keepPullRequestsClosed: Boolean(repository.keepPullRequestsClosed) });
  }
  return result;
}
export async function captureStanding(core, state, value) {
  requireThat(!state.paused && state.phase !== 'COMPLETE', 'Standing grant requires an active unpaused feature');
  const current = await core.commitments({ state });
  const implementation = latestImplementation(state);
  requireThat(value.subject === current.subject && implementation?.subject === current.subject
    && decisionHas(implementation, 'authorize-implementation')
    && (await core.check('implementation', state)).allowed, 'Standing grant requires current implementation authority');
  const scope = standingScope(value.scope);
  const refusal = releaseRefusal(core, scope);
  requireThat(!refusal, refusal);
  requireThat(scope.expiresAt === null || Date.parse(scope.expiresAt) > Date.now(), 'Standing grant has expired');
  return { ...value, scope, runId: state.runId, implementation: implementation.event,
    repositories: await bindings(core, scope), documents: current.docs };
}
export async function standingValidity(core, state, grant, candidate = null, action = null, { allowIntegratedTargets = false } = {}) {
  try {
    await core.assertContext();
    requireThat(grant?.kind === 'authorize-standing', 'Unknown standing grant');
    requireThat(grant.runId === state.runId, 'Standing grant belongs to another run');
    // Grants recorded before this rule are retained but never authorize.
    const refusal = releaseRefusal(core, grant.scope);
    requireThat(!refusal, refusal);
    requireThat(!state.paused, 'Feature is explicitly paused');
    requireThat(!state.decisions.some(item => item.kind === 'revoke-standing' && item.subject === grant.event), 'Standing grant was revoked');
    requireUnexpired(grant);
    const current = await core.commitments({ capture: false, state });
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
      requireThat(action.deliveryTarget !== 'release', 'No standing grant authorizes a release-branch merge; a per-PR human authorize-merge is required');
      requireThat(grant.scope.actions.includes('authorize-merge') && selected
        && action.baseBranch === selected.baseBranch && branchMatches(action.headBranch, selected.headPrefix)
        && selected.methods.includes(action.method), 'Merge action is outside standing scope');
    }
    await core.assertContext();
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
  requireThat(check.allowed && check.outcomes.every(item => item.required === false || item.outcome === 'PASS'), 'Standing application requires current PASS evidence for every required gate', check);
  if (input.action) {
    const { prepareMerge } = await import('./actions.js');
    requireThat(identity(await prepareMerge(core, input.action)) === identity(input.action), 'Standing application must bind the exact prepared merge action');
    const { requirePublishedReview } = await import('./publication.js');
    await requirePublishedReview(core, input.action);
  }
  // Recheck after potentially slow proof and remote reads. append also checks the
  // original event count, so a concurrent revoke/pause/candidate cannot win a race.
  const final = await standingValidity(core, state, grant, candidate, input.action);
  requireThat(final.allowed, final.reason);
  await core.assertLiveInputs(state, 'acceptance', check.liveInputs);
  requireUnexpired(grant);
  return core.append(state, 'DECIDED', { kind: 'accept', subject: state.candidate.hash,
    authority: grant.authority, reason: grant.reason, consequences: grant.consequences,
    standingGrant: grant.event, actions: input.action ? ['authorize-merge'] : [],
    ...(input.action ? { action: input.action } : {}), requestId: operation.id }, operation);
}
// A delegated acceptance (delegation.apply) authorizes only while the run is
// still under the same delegation, for a SLICE candidate whose prepared action
// targets the distinct integration branch. A hand-back ends it.
export function delegationValidity(state, item, candidate, action = null) {
  if (!['delegated', 'autonomous'].includes(state.dials.autonomy.value) || state.dials.autonomy.event !== item.delegation
    || (item.authority?.kind === 'autonomous-evaluator') !== (state.dials.autonomy.value === 'autonomous')) {
    return { allowed: false, reason: 'Delegation was handed back or replaced; the delegated acceptance no longer authorizes' };
  }
  if (state.delegationBlocked === item.delegation) {
    return { allowed: false, reason: 'An external merge blocker was recorded under this delegation; delegated authority stops until the human acts' };
  }
  if (candidate?.scope !== 'SLICE' || item.action?.deliveryTarget !== 'integration') {
    return { allowed: false, reason: 'Delegated authority covers only SLICE PRs into the integration branch' };
  }
  if (action && identity(action) !== identity(item.action)) return { allowed: false, reason: 'Merge action differs from the delegated acceptance' };
  return { allowed: true, reason: null };
}
export async function qualifyingDecisions(core, state, kind, subject, candidate) {
  const decisions = [];
  for (const item of currentAuthorityDecisions(state)) {
    if (!decisionHas(item, kind) || item.subject !== subject) continue;
    if (item.delegation && !delegationValidity(state, item, candidate, kind === 'authorize-merge' ? item.action : null).allowed) continue;
    if (item.standingGrant) {
      const grant = state.decisions.find(entry => entry.event === item.standingGrant);
      if (!(await standingValidity(core, state, grant, candidate, kind === 'authorize-merge' ? item.action : null,
        { allowIntegratedTargets: kind === 'accept' })).allowed) continue;
    }
    decisions.push(item);
  }
  return decisions;
}
