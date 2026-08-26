import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IPC_CHANNELS,
  requireArtifactRequest,
  requireCopyText,
  requireDesktopState,
  requireDetailRequest,
  requireSessionDetail,
  requireSessionId,
  requireSessionInventory,
} from '../shared/contracts.js';

function state() {
  return {
    schemaVersion: 1,
    phase: 'idle',
    refreshing: false,
    githubPolling: false,
    selection: null,
    snapshot: null,
    error: null,
    preferences: { recentWorktrees: [] },
  };
}

test('desktop state requires the exact read-only envelope', () => {
  assert.equal(requireDesktopState(state()).phase, 'idle');
  assert.throws(() => requireDesktopState({ ...state(), mutation: null }), /invalid/);
  assert.throws(() => requireDesktopState({ ...state(), refreshing: 'yes' }), /invalid/);
});

test('named read and artifact requests reject broad or malformed access', () => {
  assert.deepEqual(requireDetailRequest({ kind: 'artifact', id: 'design' }), {
    kind: 'artifact', id: 'design',
  });
  assert.throws(() => requireDetailRequest({ kind: 'file', id: '/tmp/anything' }), /invalid/);
  assert.throws(() => requireDetailRequest({ kind: 'events', id: 'one' }), /invalid/);
  assert.deepEqual(requireArtifactRequest({ artifactId: 'design' }), { artifactId: 'design' });
  assert.throws(() => requireArtifactRequest({ path: '/tmp/anything' }), /invalid/);
  assert.equal(requireCopyText('gatereeve next'), 'gatereeve next');
  assert.throws(() => requireCopyText(42), /invalid/);
  const sessionId = 'session:checkpoint:Q0hFQ0tQT0lOVC5tZA';
  assert.equal(requireSessionId(sessionId), sessionId);
  assert.throws(() => requireSessionId('../CHECKPOINT.md'), /invalid/);
  const item = {
    id: sessionId,
    kind: 'checkpoint',
    label: 'CHECKPOINT.md',
    path: '.checkpoints/CHECKPOINT.md',
    modifiedAt: '2026-08-26T00:00:00.000Z',
    size: 12,
  };
  assert.deepEqual(requireSessionInventory({ schemaVersion: 1, items: [item] }).items, [item]);
  assert.equal(requireSessionDetail({ schemaVersion: 1, id: sessionId, item, content: '# State' }).content, '# State');
});

test('IPC allow-list contains no workflow mutation or process-execution surface', () => {
  const channels = Object.values(IPC_CHANNELS).sort();
  assert.deepEqual(channels, [
    'gatereeve:desktop:choose-worktree',
    'gatereeve:desktop:copy-text',
    'gatereeve:desktop:get-state',
    'gatereeve:desktop:list-session',
    'gatereeve:desktop:open-artifact',
    'gatereeve:desktop:open-recent',
    'gatereeve:desktop:read-detail',
    'gatereeve:desktop:read-session',
    'gatereeve:desktop:refresh',
    'gatereeve:desktop:reveal-artifact',
    'gatereeve:desktop:state-changed',
  ]);
  assert.equal(channels.some((channel) => /execute|agent|transition|mutat|record/.test(channel)), false);
});
