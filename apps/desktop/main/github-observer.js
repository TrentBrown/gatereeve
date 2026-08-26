// @ts-check

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

function source(status, detail, checkedAt) {
  return { status, detail, checkedAt };
}

export function checkIsPending(check) {
  const status = String(check?.status ?? check?.state ?? '').toUpperCase();
  const conclusion = String(check?.conclusion ?? '').toUpperCase();
  return !['COMPLETED', 'SUCCESS', 'FAILURE', 'CANCELLED', 'SKIPPED', 'NEUTRAL'].includes(status)
    && !['SUCCESS', 'FAILURE', 'CANCELLED', 'SKIPPED', 'NEUTRAL', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(conclusion);
}

export function githubNeedsPolling(pullRequest) {
  return pullRequest?.state === 'OPEN'
    || (pullRequest?.checks ?? []).some(checkIsPending);
}

export async function observeGitHub(repositoryRoot, branch, {
  exec = execute,
  now = () => new Date(),
} = {}) {
  const checkedAt = now().toISOString();
  if (!repositoryRoot || !branch) {
    return {
      source: source('not-checked', 'GitHub enrichment requires a Git branch', checkedAt),
      pullRequest: null,
      needsPolling: false,
    };
  }
  try {
    const result = await exec('gh', [
      'pr', 'list', '--head', branch, '--state', 'all', '--limit', '1',
      '--json', 'number,url,state,isDraft,reviewDecision,mergeStateStatus,statusCheckRollup,mergedAt,updatedAt',
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 20_000,
    });
    const rows = JSON.parse(result.stdout);
    const item = rows[0] ?? null;
    if (item === null) {
      return {
        source: source('current', `No pull request found for ${branch}`, checkedAt),
        pullRequest: null,
        needsPolling: false,
      };
    }
    const pullRequest = {
      number: item.number,
      url: item.url,
      state: item.state,
      isDraft: item.isDraft,
      reviewDecision: item.reviewDecision || null,
      mergeStateStatus: item.mergeStateStatus || null,
      mergedAt: item.mergedAt || null,
      updatedAt: item.updatedAt || null,
      checks: Array.isArray(item.statusCheckRollup) ? item.statusCheckRollup : [],
    };
    return {
      source: source('current', `PR #${pullRequest.number} is ${pullRequest.state.toLowerCase()}`, checkedAt),
      pullRequest,
      needsPolling: githubNeedsPolling(pullRequest),
    };
  } catch (error) {
    return {
      source: source('unavailable', error?.stderr?.trim() || error?.message || 'GitHub unavailable', checkedAt),
      pullRequest: null,
      needsPolling: null,
    };
  }
}
