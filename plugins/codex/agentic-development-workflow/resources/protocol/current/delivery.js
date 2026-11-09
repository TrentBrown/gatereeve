import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { identity, requireThat, decisionHas } from './contracts.js';
import { prepareMerge, merge, observeIntegration } from './actions.js';
import { configuredGit, qualifyingDecisions, standingValidity } from './authorization.js';

const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; } };
const status = (state, reason, nextAction = null, details = {}) => ({ status: state, reason, nextAction, ...details });

// Claim before the first external write. A recovered call observes the unique
// PR resource before retrying; it never assumes a lost response meant failure.
export async function protectedMerge(core, input, operation) {
  let { state } = await core.state();
  const key = identity({ candidate: state.candidate, input });
  const prior = state.actions[key];
  if (prior?.running && (prior.host !== hostname() || (core.runtime.processAlive ?? alive)(prior.pid))) {
    return status('running', 'The existing protected merge still owns this action.', 'observe', { actionId: key });
  }
  const action = prior?.action ?? await prepareMerge(core, input);
  if (prior) requireThat(state.candidate?.hash === prior.candidate.hash, 'Recovered merge candidate changed');
  const owner = randomUUID();
  const claimed = await core.append(state, 'ACTION_CLAIMED', { id: key, owner, pid: process.pid, host: hostname(),
    candidate: state.candidate, action, operation }, { id: `claim_${owner}`, hash: identity({ key, owner }) });
  try {
    if (prior) {
      const repository = core.context.repositories.find(item => item.alias === action.repository);
      const run = core.runtime.gh ?? (await import('./actions.js')).gh;
      const observed = JSON.parse(await run(repository.path, ['pr', 'view', String(action.number), '--repo', action.ownerRepo,
        '--json', 'number,state,isDraft,headRefOid,baseRefName,mergeCommit,url']));
      requireThat(observed.number === action.number && observed.headRefOid === action.head && observed.baseRefName === action.baseBranch,
        'Recovered PR identity differs from the claimed merge');
      if (observed.state === 'MERGED') {
        await configuredGit(core)(repository.path, ['fetch', repository.remote ?? 'origin', action.baseBranch]);
        return await observeIntegration(core, { repository: action.repository, branch: action.baseBranch, hosted: observed }, operation);
      }
      // Compensation belongs to the same claimed action. A second resumption
      // cannot write while this owner is observing or restoring presentation.
      const current = (await core.state()).state;
      requireThat(!current.paused && current.eventCount === claimed.state.eventCount, 'Feature state or authority changed during recovery');
      if (action.keepClosed && observed.state === 'OPEN') await run(repository.path, ['pr', 'close', String(action.number), '--repo', action.ownerRepo]);
      else if (!action.keepClosed && observed.state === 'OPEN' && !observed.isDraft) await run(repository.path, ['pr', 'ready', String(action.number), '--repo', action.ownerRepo, '--undo']);
      requireThat(identity(action) === identity(await prepareMerge(core, input)), 'Recovered source/target changed; reassess the action');
    }
    return await merge(core, input, operation);
  }
  finally {
    for (;;) {
      state = (await core.state()).state;
      if (state.runId !== claimed.state.runId || state.actions[key]?.owner !== owner) break;
      try {
        await core.append(state, 'ACTION_RELEASED', { id: key, owner },
          { id: `release_${owner}`, hash: identity({ key, owner }) }); break;
      } catch (error) { if (!error.message.startsWith('Concurrent update;')) throw error; }
    }
  }
}

export async function resumeDelivery(core, input, operation) {
  requireThat(Object.keys(input).every(key => ['merge', 'grant'].includes(key)), 'Unsupported delivery resume field');
  const request = (name, args = {}) => core.execute({ operation: name, input: args,
    operationId: `advance_${identity({ operation, name, args }).slice(7)}` });
  await core.reconcileCompletedJobs();
  let { state } = await core.state();
  if (state.paused) return status('needs-attention', 'Feature is explicitly paused.', 'run.continue');
  if (state.phase === 'COMPLETE') return status('complete', 'Feature completion is recorded.');
  const pending = Object.values(state.jobs).filter(job => !job.finished);
  if (pending.length) return status('running', 'Reconnect to existing work; no replacement launched.', 'observe', { jobs: pending.map(job => job.jobId) });
  if (!state.candidate) return status('needs-attention', 'Prepare a candidate and choose its validation.', 'candidate.prepare');
  if (input.merge && !state.integrations[input.merge.repository]
    && state.actions[identity({ candidate: state.candidate, input: input.merge })]) {
    const recovered = await request('merge.execute', input.merge);
    return recovered.status ? recovered : status('waiting', 'Existing merge reconciled; continue delivery.', 'delivery.resume');
  }
  if (state.phase === 'INTEGRATED') {
    const completion = await core.check('completion');
    if (!completion.allowed) return status('needs-attention', 'Required completion evidence or authority is missing.', 'evaluate', { missing: completion.missing });
    await request('milestone.pass', { name: 'completion' });
    return status('complete', 'Required feature completion recorded.');
  }
  const check = await core.check('acceptance');
  if (!check.allowed) return status('needs-attention', 'Required acceptance proof needs model work.', 'evaluate', { missing: check.missing });
  if (state.phase === 'IMPLEMENTING') await request('milestone.pass', { name: 'acceptance' });
  const action = input.merge ? await prepareMerge(core, input.merge) : null;
  state = (await core.state()).state;
  const candidate = await core.store.json(state.candidate);
  const authorized = (await qualifyingDecisions(core, state, action ? 'authorize-merge' : 'accept', state.candidate.hash, candidate))
    .some(item => !action || identity(item.action) === identity(action));
  if (!authorized) {
    let grant = input.grant;
    if (!grant) for (const item of [...state.decisions].reverse()) {
      if (item.kind === 'authorize-standing' && (await standingValidity(core, state, item, candidate, action)).allowed) { grant = item.event; break; }
    }
    if (!grant) return status('needs-attention', 'Scoped human acceptance or merge authorization is needed.', 'authorization.apply');
    await request('authorization.apply', { grant, ...(action ? { action } : {}) });
  }
  if (action) {
    const merged = await request('merge.execute', input.merge);
    if (merged.status) return merged;
    return status('waiting', 'Integration recorded; release and completion obligations remain.', 'delivery.resume');
  }
  return status('waiting', 'Acceptance recorded. Merge and deployment retain separate authority.', 'merge.prepare');
}
