import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IPC_CHANNELS,
  requireArtifactActions,
  requireArtifactOpenRequest,
  requireArtifactRequest,
  requireCopyText,
  requireDesktopState,
  requireDetailRequest,
  requireExternalLink,
  requireProjectOrder,
  requireSessionDetail,
  requireSessionId,
  requireSessionInventory,
  requireSelectedAgents,
  requireSetupState,
  requireUpdateState,
} from '../shared/contracts.js';

function setup() {
  return {
    schemaVersion: 1,
    phase: 'unconfigured',
    operationalReady: false,
    checkedAt: null,
    desktop: { version: '0.1.0' },
    selectedAgents: [],
    prerequisites: [],
    agents: [],
  };
}

function state() {
  return {
    schemaVersion: 1,
    phase: 'idle',
    refreshing: false,
    githubPolling: false,
    selection: null,
    snapshot: null,
    error: null,
    setup: setup(),
    projects: [],
    candidateDiagnostic: null,
    preferences: { notificationsEnabled: false, projectPaths: [], selectedAgents: [] },
  };
}

test('desktop state requires the exact read-only envelope', () => {
  assert.equal(requireDesktopState(state()).phase, 'idle');
  assert.throws(() => requireDesktopState({ ...state(), mutation: null }), /invalid/);
  assert.throws(() => requireDesktopState({ ...state(), refreshing: 'yes' }), /invalid/);
});

test('Setup state and selected agents are exact, bounded read-only contracts', () => {
  assert.equal(requireSetupState(setup()).phase, 'unconfigured');
  assert.deepEqual(requireSelectedAgents(['claude', 'codex']), ['codex', 'claude']);
  assert.throws(() => requireSelectedAgents(['codex', 'codex']), /invalid/);
  assert.throws(() => requireSetupState({ ...setup(), installationMutation: true }), /invalid/);
});

test('update state exposes notification-only discovery without a download contract', () => {
  const update = {
    schemaVersion: 1,
    status: 'available',
    source: 'manual',
    currentVersion: '0.1.0-rc.3',
    checkedAt: '2026-08-28T00:00:00.000Z',
    available: { version: '0.1.0-rc.4', channel: 'rc', publishedAt: '2026-08-28T00:00:00.000Z' },
    detail: null,
  };
  assert.equal(requireUpdateState(update).available.version, '0.1.0-rc.4');
  assert.throws(() => requireUpdateState({ ...update, downloadUrl: 'https://example.com' }), /invalid/);
});

test('named read and artifact requests reject broad or malformed access', () => {
  assert.deepEqual(requireDetailRequest({ kind: 'artifact', id: 'design' }), {
    kind: 'artifact', id: 'design',
  });
  assert.throws(() => requireDetailRequest({ kind: 'file', id: '/tmp/anything' }), /invalid/);
  assert.throws(() => requireDetailRequest({ kind: 'events', id: 'one' }), /invalid/);
  assert.deepEqual(requireArtifactRequest({ artifactId: 'design' }), { artifactId: 'design' });
  assert.throws(() => requireArtifactRequest({ path: '/tmp/anything' }), /invalid/);
  assert.deepEqual(requireArtifactOpenRequest({
    artifactId: 'design', editorId: 'vscode', remember: true,
  }), { artifactId: 'design', editorId: 'vscode', remember: true });
  assert.throws(() => requireArtifactOpenRequest({
    artifactId: 'design', editorId: '/Applications/Evil.app', remember: true,
  }), /invalid/);
  assert.equal(requireArtifactActions({
    schemaVersion: 1,
    editors: [{ id: 'vscode', label: 'VS Code' }],
    preferredEditorId: 'vscode',
    githubAvailable: true,
  }).preferredEditorId, 'vscode');
  assert.equal(requireCopyText('gatereeve next'), 'gatereeve next');
  assert.throws(() => requireCopyText(42), /invalid/);
  assert.equal(requireExternalLink('https://example.com/docs'), 'https://example.com/docs');
  assert.throws(() => requireExternalLink('file:///etc/passwd'), /HTTP\(S\)/);
  assert.throws(() => requireExternalLink('https://user@example.com/private'), /HTTP\(S\)/);
  assert.deepEqual(requireProjectOrder(['/one', '/two']), ['/one', '/two']);
  assert.throws(() => requireProjectOrder(['/one', '/one']), /invalid/);
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
    'gatereeve:desktop:activate-project',
    'gatereeve:desktop:add-project',
    'gatereeve:desktop:check-for-updates',
    'gatereeve:desktop:choose-artifact-application',
    'gatereeve:desktop:copy-text',
    'gatereeve:desktop:get-artifact-actions',
    'gatereeve:desktop:get-state',
    'gatereeve:desktop:get-update-state',
    'gatereeve:desktop:layout-command',
    'gatereeve:desktop:list-session',
    'gatereeve:desktop:open-artifact',
    'gatereeve:desktop:open-artifact-github',
    'gatereeve:desktop:open-external-link',
    'gatereeve:desktop:open-update-release',
    'gatereeve:desktop:read-detail',
    'gatereeve:desktop:read-session',
    'gatereeve:desktop:recheck-setup',
    'gatereeve:desktop:refresh',
    'gatereeve:desktop:remove-project',
    'gatereeve:desktop:reorder-projects',
    'gatereeve:desktop:reveal-artifact',
    'gatereeve:desktop:save-artifact-as',
    'gatereeve:desktop:save-artifact-downloads',
    'gatereeve:desktop:set-notifications-enabled',
    'gatereeve:desktop:set-selected-agents',
    'gatereeve:desktop:state-changed',
    'gatereeve:desktop:update-changed',
  ]);
  assert.equal(channels.some((channel) => /execute|transition|advance|install|upgrade|disable|plugin/.test(channel)), false);
});
