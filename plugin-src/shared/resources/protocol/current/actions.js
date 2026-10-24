import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CONTRACT, requireThat, identity, text, decisionHas } from './contracts.js';
import { checkCandidate, git } from './evidence.js';
import { runTrustedPythonGuard } from '../python-guards.js';

const exec = promisify(execFile);
async function gh(root, args) {
  const { stdout } = await exec('gh', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}
function remoteName(url) {
  const match = /^(?:git@github\.com:|https:\/\/github\.com\/)([^/]+\/[^/]+?)(?:\.git)?$/u.exec(url.trim());
  requireThat(match, 'Protected merge requires a configured GitHub remote');
  return match[1];
}
export function mergeDirection(head, base) {
  requireThat(typeof head === 'string' && typeof base === 'string' && head !== base, 'Merge needs distinct named branches');
  requireThat(head !== 'development' && !head.startsWith('development-'), `Forbidden merge direction: ${head} -> ${base}`);
}
export async function prepareMerge(core, input) {
  const { state } = await core.state();
  const runGit = core.runtime.git ?? git;
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
  requireThat(pr.headRefName === head && [repository.integrationBranch, repository.releaseBranch].filter(Boolean).includes(pr.baseRefName), 'PR branches do not match configured delivery');
  const remoteHead = (await runGit(repository.path, ['ls-remote', '--exit-code', repository.remote ?? 'origin', `refs/heads/${head}`])).split(/\s/u)[0];
  requireThat(remoteHead === pin.head, 'Remote PR source differs from reviewed source');
  const base = (await runGit(repository.path, ['ls-remote', '--exit-code', repository.remote ?? 'origin', `refs/heads/${pr.baseRefName}`])).split(/\s/u)[0];
  requireThat(base === pin.target, 'PR target differs from the assessed target; refresh candidate target and interaction review before merge');
  if (repository.keepPullRequestsClosed) requireThat(pr.state === 'CLOSED', 'PR must remain closed until the authorized merge window');
  else requireThat(pr.state === 'OPEN' && pr.isDraft, 'PR must be an open draft during preparation');
  return { contract: CONTRACT, kind: 'github-pr', repository: input.repository, number: input.number,
    ownerRepo: name, url: pr.url, headBranch: head, baseBranch: pr.baseRefName, head: pin.head, base,
    keepClosed: Boolean(repository.keepPullRequestsClosed), method: input.method ?? 'merge' };
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
  const runGit = core.runtime.git ?? git;
  const action = await prepareMerge(core, input);
  requireThat(['merge', 'squash', 'rebase'].includes(action.method), 'Unsupported merge method');
  const authorization = state.decisions.findLast(item => decisionHas(item, 'authorize-merge')
    && item.subject === state.candidate.hash && identity(item.action) === identity(action));
  requireThat(authorization, 'Human authorization must name this exact PR, source, target and method');
  const repository = core.context.repositories.find(item => item.alias === action.repository);
  const run = core.runtime.gh ?? gh;
  let opened = false;
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
    if (current.isDraft) await run(repository.path, ['pr', 'ready', String(action.number), '--repo', action.ownerRepo]);
    await run(repository.path, ['pr', 'checks', String(action.number), '--repo', action.ownerRepo, '--required', '--watch', '--fail-fast']);
    await requireCurrentState(core, state);
    requireThat((await core.check('merge', state)).allowed, 'Gate proof changed while waiting for hosted checks');
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
    await run(repository.path, ['pr', 'merge', String(action.number), '--repo', action.ownerRepo,
      `--${action.method}`, '--match-head-commit', action.head]);
    const observed = JSON.parse(await run(repository.path, ['pr', 'view', String(action.number), '--repo', action.ownerRepo,
      '--json', 'number,state,mergeCommit,url']));
    requireThat(observed.number === action.number && observed.state === 'MERGED' && observed.mergeCommit?.oid, 'Hosted merge outcome is not verified');
    await runGit(repository.path, ['fetch', repository.remote ?? 'origin', action.baseBranch]);
    return observeIntegration(core, { repository: action.repository, branch: action.baseBranch, hosted: observed }, operation, state);
  } finally {
    if (opened) {
      const observed = JSON.parse(await run(repository.path, ['pr', 'view', String(action.number), '--repo', action.ownerRepo, '--json', 'state']));
      if (observed.state !== 'MERGED' && observed.state !== 'CLOSED') {
        await run(repository.path, ['pr', 'close', String(action.number), '--repo', action.ownerRepo]);
        const closed = JSON.parse(await run(repository.path, ['pr', 'view', String(action.number), '--repo', action.ownerRepo, '--json', 'state']));
        requireThat(closed.state === 'CLOSED', 'Merge cleanup could not verify PR closure');
      }
    }
  }
}
export async function observeIntegration(core, input, operation, expectedState = null) {
  const state = expectedState ?? (await core.state()).state;
  if (expectedState) await requireCurrentState(core, expectedState);
  const runGit = core.runtime.git ?? git;
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
    '--reviewed-base', pin.base, '--reviewed-head', pin.head, '--integration-ref', ref, '--json']);
  requireThat(proof.passed && proof.data?.status === 'verified', 'Reviewed content is not verified on integration', proof.stderr);
  if (input.hosted) requireThat(proof.data.integrationSha === input.hosted.mergeCommit.oid, 'Observed hosted merge differs from integration source');
  const receipt = await core.store.putJson({ contract: CONTRACT, candidate: state.candidate, repository: input.repository,
    proof, hosted: input.hosted ?? null, observedAt: new Date().toISOString() });
  return core.append(state, 'INTEGRATED', { candidate: state.candidate, repository: input.repository,
    branch, integrationSha: proof.data.integrationSha, receipt }, operation);
}
