import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IPC_CHANNELS,
  requireBoundaryModuleWaiverRequest,
  requireArtifactActions,
  requireArtifactOpenRequest,
  requireArtifactRequest,
  requireCopyText,
  requireDesktopState,
  requireDetailRequest,
  requireExternalLink,
  requireModulePolicyApplyRequest,
  requireModulePolicyPreview,
  requireModulePolicyRequest,
  requireModuleSettings,
  requireProjectOrder,
  requireSessionDetail,
  requireSessionId,
  requireSessionInventory,
  requireSelectedAgents,
  requireSetupState,
  requireTerminalDimensionsRequest,
  requireTerminalEvent,
  requireTerminalInputRequest,
  requireTerminalResizeRequest,
  requireTerminalSession,
  requireTerminalSessionRequest,
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
    preferences: {
      notificationsEnabled: false, projectPaths: [], selectedAgents: [], terminalHeight: 260,
    },
  };
}

test('desktop state requires the exact bounded application envelope', () => {
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

test('terminal contracts are exact, bounded, and expose no spawn configuration', () => {
  const running = {
    schemaVersion: 1,
    id: 'terminal_abc-123',
    projectName: 'project',
    shell: 'zsh',
    status: 'running',
    cols: 80,
    rows: 24,
    output: '',
    exit: null,
    error: null,
  };
  assert.equal(requireTerminalSession(running).id, running.id);
  assert.deepEqual(requireTerminalDimensionsRequest({ cols: 80, rows: 24 }), {
    cols: 80, rows: 24,
  });
  assert.deepEqual(requireTerminalInputRequest({
    sessionId: running.id, data: 'echo ready\r',
  }), { sessionId: running.id, data: 'echo ready\r' });
  assert.deepEqual(requireTerminalResizeRequest({
    sessionId: running.id, cols: 100, rows: 40,
  }), { sessionId: running.id, cols: 100, rows: 40 });
  assert.deepEqual(requireTerminalSessionRequest({ sessionId: running.id }), {
    sessionId: running.id,
  });
  assert.equal(requireTerminalEvent({
    schemaVersion: 1, type: 'data', sessionId: running.id, data: 'ready',
  }).data, 'ready');
  assert.throws(() => requireTerminalDimensionsRequest({ cols: 0, rows: 24 }), /invalid/);
  assert.throws(() => requireTerminalInputRequest({
    sessionId: running.id, data: 'x'.repeat(65_537),
  }), /invalid/);
  assert.throws(() => requireTerminalResizeRequest({
    sessionId: running.id, cols: 80, rows: 24, pid: 123,
  }), /invalid/);
  assert.throws(() => requireTerminalSession({ ...running, executable: '/bin/sh' }), /invalid/);
  assert.throws(() => requireTerminalEvent({
    schemaVersion: 1, type: 'exited', session: { ...running, status: 'running' },
  }), /invalid|inconsistent/);
});

test('module policy contracts expose only complete selections, previews, and scoped waivers', () => {
  const module = {
    id: 'gatereeve/judge', version: '1.0.0', digest: 'sha256:judge', label: 'Judge',
    description: 'Independent evaluation.', slot: 'boundary.evaluation', enabled: true,
    locked: false, disposition: 'required', waiverAllowed: true,
    dependsOn: ['gatereeve/verification'], after: [],
    readiness: { status: 'available', missing: [] }, runKind: 'skill', observeProvider: null,
  };
  const settings = {
    schemaVersion: 1, policyPath: '/repo/.gatereeve/workflow.json', policyExists: true,
    policyDigest: 'sha256:policy', featureModelHash: 'sha256:feature',
    projectModelHash: 'sha256:project', migrationRequired: false, modules: [module],
  };
  assert.equal(requireModuleSettings(settings).modules[0].id, 'gatereeve/judge');
  assert.deepEqual(requireModulePolicyRequest({ enabledModuleIds: ['gatereeve/judge'] }), {
    enabledModuleIds: ['gatereeve/judge'],
  });
  assert.equal(requireModulePolicyApplyRequest({
    enabledModuleIds: [], confirmedMigration: true, confirmationLabel: 'Trent',
  }).confirmedMigration, true);
  assert.equal(requireModulePolicyPreview({
    schemaVersion: 1, valid: true, error: null, autoEnabled: [], blockingDependents: [],
    enabledModuleIds: [], suggestedEnabledModuleIds: [],
    diff: [{ id: 'gatereeve/judge', before: true, after: false }],
    migrationImpact: null,
  }).diff.length, 1);
  assert.deepEqual(requireBoundaryModuleWaiverRequest({
    attemptId: 'attempt-1', gateId: 'judge', reason: 'Small change', confirmationLabel: 'Trent',
  }), {
    attemptId: 'attempt-1', gateId: 'judge', reason: 'Small change', confirmationLabel: 'Trent',
  });
  assert.throws(() => requireModulePolicyRequest({ enabledModuleIds: ['judge', 'judge'] }), /invalid/);
  assert.throws(() => requireBoundaryModuleWaiverRequest({
    attemptId: 'attempt-1', gateId: 'judge', reason: '', confirmationLabel: 'Trent',
  }), /invalid/);
});

test('IPC allow-list contains only bounded named desktop operations', () => {
  const channels = Object.values(IPC_CHANNELS).sort();
  assert.deepEqual(channels, [
    'gatereeve:desktop:activate-project',
    'gatereeve:desktop:add-project',
    'gatereeve:desktop:apply-module-policy',
    'gatereeve:desktop:attest-module',
    'gatereeve:desktop:check-for-updates',
    'gatereeve:desktop:choose-artifact-application',
    'gatereeve:desktop:copy-text',
    'gatereeve:desktop:get-artifact-actions',
    'gatereeve:desktop:get-module-run-preview',
    'gatereeve:desktop:get-module-settings',
    'gatereeve:desktop:get-state',
    'gatereeve:desktop:get-update-state',
    'gatereeve:desktop:layout-command',
    'gatereeve:desktop:list-module-tasks',
    'gatereeve:desktop:list-session',
    'gatereeve:desktop:module-task-cancel',
    'gatereeve:desktop:module-task-changed',
    'gatereeve:desktop:module-task-resize',
    'gatereeve:desktop:module-task-start',
    'gatereeve:desktop:module-task-write',
    'gatereeve:desktop:open-artifact',
    'gatereeve:desktop:open-artifact-github',
    'gatereeve:desktop:open-external-link',
    'gatereeve:desktop:open-update-release',
    'gatereeve:desktop:preview-module-policy',
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
    'gatereeve:desktop:set-terminal-height',
    'gatereeve:desktop:state-changed',
    'gatereeve:desktop:terminal-changed',
    'gatereeve:desktop:terminal-ensure',
    'gatereeve:desktop:terminal-resize',
    'gatereeve:desktop:terminal-restart',
    'gatereeve:desktop:terminal-terminate',
    'gatereeve:desktop:terminal-write',
    'gatereeve:desktop:update-changed',
    'gatereeve:desktop:waive-boundary-module',
  ]);
  assert.equal(channels.some((channel) => /execute|spawn|transition|advance|install|upgrade|plugin/.test(channel)), false);
});
