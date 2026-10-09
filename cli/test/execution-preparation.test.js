import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyBoundaryContextCurrent } from '../../plugin-src/shared/resources/protocol/execution-preparation.js';

test('verified legacy PR contexts retain the exact ranges and closure policy for automatic review', async () => {
  const context = {
    schemaVersion: 1,
    pullRequest: { number: 74, headRefOid: 'a'.repeat(40), state: 'CLOSED' },
    mergeBaseSha: 'b'.repeat(40),
    featureBaseSha: 'c'.repeat(40),
    evaluatedSourceSha: 'a'.repeat(40),
    keepPullRequestsClosed: true,
  };
  const result = await verifyBoundaryContextCurrent({
    context, repositoryRoot: process.cwd(),
    runGuard: async (guard, args) => {
      assert.equal(guard, 'boundary.context.current');
      assert.equal(args[0], 'check-current');
      return { passed: true, data: { status: 'current', pullRequest: context.pullRequest, evaluatedSourceSha: context.evaluatedSourceSha } };
    },
  });
  assert.equal(result.featureBaseSha, context.featureBaseSha);
  assert.equal(result.mergeBaseSha, context.mergeBaseSha);
  assert.equal(result.evaluatedSourceSha, context.evaluatedSourceSha);
  assert.equal(result.keepPullRequestsClosed, true);
  await assert.rejects(verifyBoundaryContextCurrent({
    context, repositoryRoot: process.cwd(),
    runGuard: async () => ({ passed: false, stderr: 'PR head became stale' }),
  }), /PR head became stale/);
});
