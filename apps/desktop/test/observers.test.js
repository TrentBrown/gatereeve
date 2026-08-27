import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyWorktreeChanges, observeGit } from '../main/git-observer.js';
import { checkIsPending, githubNeedsPolling, observeGitHub } from '../main/github-observer.js';

test('Git facts distinguish source activity from governed record dirtiness', () => {
  const result = classifyWorktreeChanges(
    '/repo',
    '/repo/docs/issues/feature',
    ' M docs/issues/feature/events.jsonl\0 M src/index.js\0?? docs/issues/feature/workflow-model.lock.json\0',
  );
  assert.deepEqual(result, {
    journalDirty: true,
    modelDirty: true,
    sourceDirty: true,
    changedPathCount: 3,
  });
});

test('Git observer degrades independently when Git is unavailable', async () => {
  const result = await observeGit('/worktree', '/worktree/docs/issues/feature', {
    exec: async () => { throw Object.assign(new Error('git missing'), { stderr: 'not a repository' }); },
    now: () => new Date('2026-08-26T12:00:00Z'),
  });
  assert.equal(result.source.status, 'unavailable');
  assert.equal(result.source.detail, 'not a repository');
  assert.deepEqual(result.facts, {});
});

test('missing Finder executables do not execute bare commands or erase local state', async () => {
  let executions = 0;
  const exec = async () => {
    executions += 1;
    throw new Error('must not execute');
  };
  const git = await observeGit('/worktree', '/worktree/docs/issues/feature', {
    exec,
    gitExecutable: null,
    now: () => new Date('2026-08-26T12:00:00Z'),
  });
  const github = await observeGitHub('/worktree', 'topic', {
    exec,
    ghExecutable: null,
    now: () => new Date('2026-08-26T12:00:00Z'),
  });
  assert.equal(executions, 0);
  assert.equal(git.source.status, 'unavailable');
  assert.match(git.source.detail, /Git executable/u);
  assert.equal(github.source.status, 'unavailable');
  assert.match(github.source.detail, /local observation remains available/u);
  assert.equal(github.needsPolling, false);
});

test('GitHub polling is conditional on open PRs or pending checks', () => {
  assert.equal(checkIsPending({ status: 'IN_PROGRESS', conclusion: '' }), true);
  assert.equal(checkIsPending({ status: 'COMPLETED', conclusion: 'SUCCESS' }), false);
  assert.equal(githubNeedsPolling({ state: 'OPEN', checks: [] }), true);
  assert.equal(githubNeedsPolling({ state: 'MERGED', checks: [{ status: 'IN_PROGRESS' }] }), true);
  assert.equal(githubNeedsPolling({ state: 'MERGED', checks: [{ status: 'COMPLETED' }] }), false);
  assert.equal(githubNeedsPolling(null), false);
});

test('GitHub observer reports unavailable without invalidating Git data', async () => {
  const result = await observeGitHub('/repo', 'topic', {
    exec: async () => { throw new Error('offline'); },
    now: () => new Date('2026-08-26T12:00:00Z'),
  });
  assert.equal(result.source.status, 'unavailable');
  assert.equal(result.needsPolling, null);
  assert.equal(result.pullRequest, null);
});
