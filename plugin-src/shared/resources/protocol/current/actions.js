import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { CONTRACT, requireThat, identity, text } from './contracts.js';
import { checkCandidate } from './evidence.js';
import { runTrustedPythonGuard } from '../python-guards.js';
import { ExternalBlockerError } from '../errors.js';
import { qualifyingDecisions, requireUnexpired, configuredGit, deliveryTarget } from './authorization.js';
import { requirePublishedReview } from './publication.js';

const exec = promisify(execFile);
export async function gh(root, args) {
  const { stdout } = await exec('gh', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}
export function remoteName(url) {
  const match = /^(?:git@github\.com:|https:\/\/github\.com\/)([^/]+\/[^/]+?)(?:\.git)?$/u.exec(url.trim());
  requireThat(match, 'Protected merge requires a configured GitHub remote');
  return match[1];
}
export function mergeDirection(head, base) {
  requireThat(typeof head === 'string' && typeof base === 'string' && head !== base, 'Merge needs distinct named branches');
  requireThat(head !== 'development' && !head.startsWith('development-'), `Forbidden merge direction: ${head} -> ${base}`);
}
function emptyCheckSet(error, action, required = false) {
  return error?.code === 1 && error.stdout === '' && typeof error.stderr === 'string'
    && error.stderr.trim() === `no ${required ? 'required ' : ''}checks reported on the '${action.headBranch}' branch`;
}
// Returns what was observed so an absent check set is recorded as "no CI
// checks", never as passing CI.
export async function waitForHostedChecks(root, action, run = gh) {
  const args = ['pr', 'checks', String(action.number), '--repo', action.ownerRepo];
  const observed = checks => ({ checks, head: action.head ?? null, summary: checks === 'none'
    ? 'no CI checks: GitHub reported no hosted checks for this pull request; this is not passing CI'
    : `${checks === 'required' ? 'required' : 'all reported'} hosted checks completed successfully for this pull request` });
  try {
    await run(root, [...args, '--required', '--watch', '--fail-fast']);
    return observed('required');
  } catch (error) {
    // gh reports no checks before filtering for required checks. Confirm either
    // empty-set diagnostic through an unfiltered query; all other errors block.
    if (!emptyCheckSet(error, action, true) && !emptyCheckSet(error, action)) throw error;
  }
  try {
    await run(root, [...args, '--watch', '--fail-fast']);
    return observed('reported');
  } catch (error) {
    // Explicitly reported absence is allowed; API/auth failures are not absence.
    // The caller still revalidates gate proof, authority and exact PR identity.
    if (!emptyCheckSet(error, action)) throw error;
  }
  return observed('none');
}
export async function prepareMerge(core, input) {
  await core.assertContext();
  const { state } = await core.state();
  const runGit = configuredGit(core);
  const candidate = await checkCandidate(core.store, core.context, state.candidate);
  const pin = candidate.repositories.find(item => item.alias === input.repository);
  const repository = core.context.repositories.find(item => item.alias === input.repository);
  requireThat(pin && repository && Number.isSafeInteger(input.number) && input.number > 0, 'Select a pinned repository and PR number');
  const name = remoteName(await runGit(repository.path, ['config', '--get', `remote.${repository.remote ?? 'origin'}.url`]));
  const read = core.runtime.gh ?? gh;
  const pr = JSON.parse(await read(repository.path, ['pr', 'view', String(input.number), '--repo', name,
    '--json', 'number,url,state,headRefName,baseRefName,baseRefOid,headRefOid,isDraft']));
  requireThat(pr.number === input.number && pr.state !== 'MERGED', 'Selected PR is already merged or has changed identity');
  const head = (await runGit(repository.path, ['branch', '--show-current'])).trim();
  mergeDirection(head, pr.baseRefName);
  requireThat(pr.headRefName === head, 'PR branches do not match configured delivery: the PR source is not the checked-out delivery branch');
  // Scope is bound to target (AC6): the final PR's head is the integration branch.
  const target = deliveryTarget(repository, candidate.scope, head, pr.baseRefName);
  const remoteHead = (await runGit(repository.path, ['ls-remote', '--exit-code', repository.remote ?? 'origin', `refs/heads/${head}`])).split(/\s/u)[0];
  requireThat(remoteHead === pin.head, 'Remote PR source differs from reviewed source');
  const base = (await runGit(repository.path, ['ls-remote', '--exit-code', repository.remote ?? 'origin', `refs/heads/${pr.baseRefName}`])).split(/\s/u)[0];
  requireThat(base === pin.target, 'PR target differs from the assessed target; refresh candidate target and interaction review before merge');
  if (repository.keepPullRequestsClosed) requireThat(pr.state === 'CLOSED', 'PR must remain closed until the authorized merge window');
  else requireThat(pr.state === 'OPEN' && pr.isDraft, 'PR must be an open draft during preparation');
  await core.assertContext();
  return { contract: CONTRACT, kind: 'github-pr', repository: input.repository, number: input.number,
    ownerRepo: name, url: pr.url, headBranch: head, baseBranch: pr.baseRefName, head: pin.head, base,
    keepClosed: Boolean(repository.keepPullRequestsClosed), method: input.method ?? 'merge', deliveryTarget: target };
}
// Classify a refused hosted merge. Only a PR observed as still unmerged and
// blocked by a hosting rule is an external blocker; anything else (including a
// lost response after a completed merge) keeps its original error.
const REVIEW_RULE = /approving review|review(?:s)? (?:is |are )?required|changes requested|review required/iu;
const POLICY_RULE = /base branch policy|protected branch|repository rule|rule violation|merge(?:s)? (?:is |are )?blocked/iu;
export async function externalBlocker(run, root, action, error) {
  let observed;
  try {
    observed = JSON.parse(await run(root, ['pr', 'view', String(action.number), '--repo', action.ownerRepo,
      '--json', 'number,state,headRefOid,mergeStateStatus,reviewDecision']));
  } catch { return null; }
  if (observed?.number !== action.number || observed.state !== 'OPEN' || observed.headRefOid !== action.head) return null;
  const message = [error?.stderr, error?.message].filter(item => typeof item === 'string').join('\n').trim().slice(0, 2000);
  const review = ['REVIEW_REQUIRED', 'CHANGES_REQUESTED'].includes(observed.reviewDecision) || REVIEW_RULE.test(message);
  const policy = observed.mergeStateStatus === 'BLOCKED' || POLICY_RULE.test(message);
  if (!review && !policy) return null;
  return { blocker: review ? 'required-review' : 'branch-policy', mergeStateStatus: observed.mergeStateStatus ?? null,
    reviewDecision: observed.reviewDecision ?? null, message };
}
async function recordExternalBlocker(core, state, action, blocker, cause) {
  const payload = { candidate: state.candidate, repository: action.repository, number: action.number, ownerRepo: action.ownerRepo,
    headBranch: action.headBranch, baseBranch: action.baseBranch, head: action.head, deliveryTarget: action.deliveryTarget ?? null, ...blocker };
  let recorded = true, handedBack = false;
  try { await core.append(state, 'MERGE_BLOCKED', payload, { id: `blocked_${randomUUID()}`, hash: identity(payload) }); }
  catch { recorded = false; }
  // An external blocker is a delegation hand-back trigger (spec AC5).
  if (state.dials.autonomy.value === 'delegated') {
    const { handBack } = await import('./delegation.js');
    try { handedBack = (await handBack(core, 'external-blocker', `PR #${action.number} is blocked by a hosting rule (${blocker.blocker})`, { number: action.number, repository: action.repository })).handedBack; }
    catch { handedBack = false; }
  }
  return new ExternalBlockerError(`Merge of PR #${action.number} is blocked by a hosting rule outside GateReeve (${blocker.blocker}). `
    + 'This is an external blocker, not a gate failure: gate proof and authorization are unchanged. '
    + (handedBack ? 'Delegation is handed back to supervised: stop for the human. ' : '')
    + `Resolve it on the host (for example, an eligible reviewer approves) and run merge.execute again.${blocker.message ? ` Host said: ${blocker.message}` : ''}`,
  { kind: 'external-blocker', gateFailure: false, recorded, handedBack, ...payload }, { cause });
}
async function requireCurrentState(core, expected) {
  const { state } = await core.state();
  requireThat(state.runId === expected.runId && state.eventCount === expected.eventCount
    && state.candidate?.hash === expected.candidate?.hash, 'Feature state or authority changed during merge; prepare the current action again');
}
export async function merge(core, input, operation) {
  const { state } = await core.state();
  const initial = await core.check('merge', state);
  requireThat(initial.allowed, 'Merge is blocked', initial);
  const runGit = configuredGit(core);
  const action = await prepareMerge(core, input);
  requireThat(['merge', 'squash', 'rebase'].includes(action.method), 'Unsupported merge method');
  const candidate = await core.store.json(state.candidate);
  const authorization = (await qualifyingDecisions(core, state, 'authorize-merge', state.candidate.hash, candidate))
    .findLast(item => identity(item.action) === identity(action));
  requireThat(authorization, 'Human authorization must name this exact PR, source, target and method');
  requireThat(!authorization.standingGrant || action.deliveryTarget !== 'release', 'No standing grant authorizes a release-branch merge; a per-PR human authorize-merge is required');
  requireThat(!authorization.delegation || (action.deliveryTarget === 'integration' && candidate.scope === 'SLICE'), 'Delegation authorizes only SLICE merges into the integration branch; a per-PR human authorize-merge is required');
  const unattended = Boolean(authorization.standingGrant || authorization.delegation);
  if (unattended) requireThat(initial.outcomes.every(item => item.required === false || item.outcome === 'PASS'), `${authorization.delegation ? 'Delegated' : 'Standing'} merge requires every required gate to PASS`);
  // Delegated merges re-observe release-branch protection before any write.
  const guard = async () => { if (authorization.delegation) await (await import('./delegation.js')).guardDelegatedAction(core, state, 'the delegated merge'); };
  await guard();
  const repository = core.context.repositories.find(item => item.alias === action.repository);
  const run = core.runtime.gh ?? gh;
  // The PR must still present the current review summary for this head.
  await requirePublishedReview(core, action);
  let opened = false;
  let madeReady = false;
  await requireCurrentState(core, state);
  try {
    if (action.keepClosed) {
      opened = true;
      await run(repository.path, ['pr', 'reopen', String(action.number), '--repo', action.ownerRepo]);
    }
    const current = JSON.parse(await run(repository.path, ['pr', 'view', String(action.number), '--repo', action.ownerRepo,
      '--json', 'number,state,headRefName,headRefOid,baseRefName,baseRefOid,isDraft']));
    requireThat(current.number === action.number && current.state === 'OPEN' && current.headRefOid === action.head
      && current.headRefName === action.headBranch && current.baseRefName === action.baseBranch && current.baseRefOid === action.base,
    'PR identity changed inside the merge window');
    if (current.isDraft) {
      madeReady = true;
      await run(repository.path, ['pr', 'ready', String(action.number), '--repo', action.ownerRepo]);
    }
    const hostedChecks = await waitForHostedChecks(repository.path, action, run);
    await requireCurrentState(core, state);
    const currentProof = await core.check('merge', state);
    requireThat(currentProof.allowed && (!unattended || currentProof.outcomes.every(item => item.required === false || item.outcome === 'PASS')), 'Gate proof changed while waiting for hosted checks');
    const latestBase = (await runGit(repository.path, ['ls-remote', '--exit-code', repository.remote ?? 'origin', `refs/heads/${action.baseBranch}`])).split(/\s/u)[0];
    requireThat(latestBase === action.base, 'PR base changed while waiting for hosted checks; refresh review');
    const refreshed = JSON.parse(await run(repository.path, ['pr', 'view', String(action.number), '--repo', action.ownerRepo,
      '--json', 'number,state,headRefName,headRefOid,baseRefName,baseRefOid,isDraft']));
    requireThat(refreshed.number === action.number && refreshed.state === 'OPEN' && refreshed.headRefOid === action.head
      && refreshed.headRefName === action.headBranch && refreshed.baseRefName === action.baseBranch && refreshed.baseRefOid === action.base,
    'PR identity changed while waiting for hosted checks');
    // Match-head binds source at the write. GitHub exposes no target compare-and-swap;
    // reread the target after the potentially long checks wait, immediately before merging.
    await requireCurrentState(core, state);
    requireThat((await qualifyingDecisions(core, state, 'authorize-merge', state.candidate.hash, candidate))
      .some(item => item.event === authorization.event), 'Merge authorization expired or changed while waiting for hosted checks');
    await guard();
    await requireCurrentState(core, state);
    await core.assertLiveInputs(state, 'merge', currentProof.liveInputs);
    await requireCurrentState(core, state);
    core.assertLiveDeadlines(currentProof.liveInputs);
    if (authorization.standingGrant) requireUnexpired(state.decisions.find(item => item.event === authorization.standingGrant));
    try {
      await run(repository.path, ['pr', 'merge', String(action.number), '--repo', action.ownerRepo,
        `--${action.method}`, '--match-head-commit', action.head]);
    } catch (error) {
      const blocker = await externalBlocker(run, repository.path, action, error);
      if (!blocker) throw error;
      throw await recordExternalBlocker(core, state, action, blocker, error);
    }
    const observed = JSON.parse(await run(repository.path, ['pr', 'view', String(action.number), '--repo', action.ownerRepo,
      '--json', 'number,state,mergeCommit,url']));
    requireThat(observed.number === action.number && observed.state === 'MERGED' && observed.mergeCommit?.oid, 'Hosted merge outcome is not verified');
    await runGit(repository.path, ['fetch', repository.remote ?? 'origin', action.baseBranch]);
    return observeIntegration(core, { repository: action.repository, branch: action.baseBranch, hosted: observed, hostedChecks }, operation, state);
  } finally {
    if (opened) {
      const observed = JSON.parse(await run(repository.path, ['pr', 'view', String(action.number), '--repo', action.ownerRepo, '--json', 'state']));
      if (observed.state !== 'MERGED' && observed.state !== 'CLOSED') {
        await run(repository.path, ['pr', 'close', String(action.number), '--repo', action.ownerRepo]);
        const closed = JSON.parse(await run(repository.path, ['pr', 'view', String(action.number), '--repo', action.ownerRepo, '--json', 'state']));
        requireThat(closed.state === 'CLOSED', 'Merge cleanup could not verify PR closure');
      }
    } else if (madeReady) {
      // Restore only the open draft this invocation promoted. Otherwise an
      // expired/revoked attempt would leave merge.prepare unable to retry.
      const observed = JSON.parse(await run(repository.path, ['pr', 'view', String(action.number), '--repo', action.ownerRepo,
        '--json', 'number,state,isDraft,headRefName,headRefOid,baseRefName']));
      if (observed.number === action.number && observed.state === 'OPEN' && !observed.isDraft
        && observed.headRefName === action.headBranch && observed.headRefOid === action.head && observed.baseRefName === action.baseBranch) {
        await run(repository.path, ['pr', 'ready', String(action.number), '--repo', action.ownerRepo, '--undo']);
        const restored = JSON.parse(await run(repository.path, ['pr', 'view', String(action.number), '--repo', action.ownerRepo, '--json', 'state,isDraft']));
        requireThat(restored.state === 'MERGED' || restored.state === 'OPEN' && restored.isDraft, 'Merge cleanup could not verify draft restoration');
      }
    }
  }
}
export async function observeIntegration(core, input, operation, expectedState = null) {
  const state = expectedState ?? (await core.state()).state;
  if (expectedState) await requireCurrentState(core, expectedState);
  const runGit = configuredGit(core);
  requireThat(state.candidate, 'Integration observation requires a pinned candidate');
  const candidate = await checkCandidate(core.store, core.context, state.candidate, { live: false });
  const repository = core.context.repositories.find(item => item.alias === input.repository);
  const pin = candidate.repositories.find(item => item.alias === input.repository);
  requireThat(repository && pin, 'Integration repository is outside the candidate');
  const branch = input.branch ?? repository.integrationBranch;
  text(branch, 'Configured integration branch');
  requireThat([repository.integrationBranch, repository.releaseBranch].includes(branch), 'Observation target is not configured');
  await runGit(repository.path, ['fetch', repository.remote ?? 'origin', `refs/heads/${branch}:refs/remotes/${repository.remote ?? 'origin'}/${branch}`]);
  const ref = `refs/remotes/${repository.remote ?? 'origin'}/${branch}`;
  const proof = await runTrustedPythonGuard('merge.reviewedContent.verified', ['--repository', repository.path,
    '--reviewed-base', pin.base, '--reviewed-head', pin.head, '--integration-ref', ref, '--json'], {
    ...core.runtime.pythonGuardOptions,
    environment: { ...(core.runtime.pythonGuardOptions?.environment ?? process.env),
      GATEREEVE_GIT_EXECUTABLE: repository.gitExecutable },
  });
  requireThat(proof.passed && proof.data?.status === 'verified', 'Reviewed content is not verified on integration', proof.stderr);
  if (input.hosted) requireThat(proof.data.integrationSha === input.hosted.mergeCommit.oid, 'Observed hosted merge differs from integration source');
  const receipt = await core.store.putJson({ contract: CONTRACT, candidate: state.candidate, repository: input.repository,
    proof, hosted: input.hosted ?? null, ...(input.hostedChecks ? { hostedChecks: input.hostedChecks } : {}), observedAt: new Date().toISOString() });
  return core.append(state, 'INTEGRATED', { candidate: state.candidate, repository: input.repository,
    branch, integrationSha: proof.data.integrationSha, receipt, ...(input.hostedChecks ? { hostedChecks: input.hostedChecks } : {}) }, operation);
}
