import assert from 'node:assert/strict';
import test from 'node:test';

import { IPC_CHANNELS } from '../shared/contracts.js';
import { isTrustedRenderer, registerDesktopIpc } from '../main/ipc.js';
import { RENDERER_URL } from '../main/window.js';

function state() {
  return {
    schemaVersion: 1,
    phase: 'ready',
    refreshing: false,
    githubPolling: false,
    selection: { worktreePath: '/repo', featureHome: '/repo/docs/issues/feature' },
    snapshot: null,
    error: null,
    projects: [],
    candidateDiagnostic: null,
    setup: {
      schemaVersion: 1, phase: 'unconfigured', operationalReady: false, checkedAt: null,
      desktop: { version: '0.1.0' }, selectedAgents: [], prerequisites: [], agents: [],
    },
    preferences: { notificationsEnabled: false, projectPaths: ['/repo'], selectedAgents: [] },
  };
}

function trustedEvent() {
  const frame = { url: RENDERER_URL };
  return { senderFrame: frame, sender: { mainFrame: frame } };
}

test('IPC authenticates the exact top-level application frame', () => {
  assert.equal(isTrustedRenderer(trustedEvent()), true);
  const frame = { url: RENDERER_URL };
  assert.equal(isTrustedRenderer({ senderFrame: frame, sender: { mainFrame: {} } }), false);
  assert.equal(isTrustedRenderer({ senderFrame: { url: 'https://example.com' }, sender: { mainFrame: frame } }), false);
});

test('IPC exposes only validated named reads, Session context, clipboard, selection, refresh, and artifact OS actions', async () => {
  const handlers = new Map();
  const opened = [];
  const artifactOperations = [];
  const revealed = [];
  const copied = [];
  const external = [];
  const sessionId = 'session:checkpoint:Q0hFQ0tQT0lOVC5tZA';
  const sessionItem = {
    id: sessionId,
    kind: 'checkpoint',
    label: 'CHECKPOINT.md',
    path: '.checkpoints/CHECKPOINT.md',
    modifiedAt: '2026-08-26T00:00:00.000Z',
    size: 12,
  };
  registerDesktopIpc({
    ipcMain: { handle(channel, handler) { handlers.set(channel, handler); } },
    coordinator: {
      current: state,
      async open() { return state(); },
      async activate() { return state(); },
      async reorderProjects() { return state(); },
      async removeProject() { return state(); },
      async refresh() { return state(); },
      async recheckSetup() { return state(); },
      async setSelectedAgents(selectedAgents) {
        return {
          ...state(),
          setup: {
            ...state().setup,
            phase: 'incomplete',
            checkedAt: '2026-08-27T12:00:00.000Z',
            selectedAgents,
          },
          preferences: { ...state().preferences, selectedAgents },
        };
      },
      async setNotificationsEnabled(enabled) {
        return { ...state(), preferences: { ...state().preferences, notificationsEnabled: enabled } };
      },
      async read(kind, id) {
        return { schemaVersion: 1, kind, id, featureId: 'feature', data: { events: [] } };
      },
      async listSession() { return { schemaVersion: 1, items: [sessionItem] }; },
      async readSession(id) {
        return { schemaVersion: 1, id, item: sessionItem, content: '# State' };
      },
      artifact(artifactId) { return { absolutePath: `/repo/${artifactId}.md` }; },
      subscribe() { return () => {}; },
    },
    updateCoordinator: {
      current() {
        return {
          schemaVersion: 1, status: 'available', source: 'manual', currentVersion: '0.1.0-rc.3',
          checkedAt: '2026-08-28T00:00:00.000Z',
          available: { version: '0.1.0-rc.4', channel: 'rc', publishedAt: '2026-08-28T00:00:00.000Z' },
          detail: null,
        };
      },
      async check() { return this.current(); },
      releasePage() { return 'https://github.com/TrentBrown/gatereeve/releases/tag/v0.1.0-rc.4'; },
      subscribe() { return () => {}; },
    },
    artifactActions: {
      async capabilities(path) {
        artifactOperations.push(['capabilities', path]);
        return {
          schemaVersion: 1,
          editors: [{ id: 'vscode', label: 'VS Code' }],
          preferredEditorId: 'vscode',
          githubAvailable: true,
        };
      },
      async open(path, editorId, remember) {
        artifactOperations.push(['open', path, editorId, remember]);
        return true;
      },
      async chooseAndOpen(path) { artifactOperations.push(['choose', path]); return true; },
      async saveAs(path) { artifactOperations.push(['save-as', path]); return true; },
      async saveToDownloads(path) { artifactOperations.push(['downloads', path]); return '/downloads/design.md'; },
      async openOnGithub(path) { artifactOperations.push(['github', path]); return true; },
    },
    async pickProject() { return '/repo'; },
    revealPath(path) { revealed.push(path); },
    copyText(value) { copied.push(value); },
    async openExternal(value) { external.push(value); },
    windows: () => [],
  });
  assert.equal(handlers.size, Object.keys(IPC_CHANNELS).length - 3);
  const event = trustedEvent();
  assert.equal((await handlers.get(IPC_CHANNELS.addProject)(event)).phase, 'ready');
  assert.equal((await handlers.get(IPC_CHANNELS.activateProject)(event, '/repo')).phase, 'ready');
  assert.equal((await handlers.get(IPC_CHANNELS.reorderProjects)(event, ['/repo'])).phase, 'ready');
  assert.equal((await handlers.get(IPC_CHANNELS.removeProject)(event, '/repo')).phase, 'ready');
  assert.deepEqual(await handlers.get(IPC_CHANNELS.readDetail)(
    event,
    { kind: 'events', id: null },
  ), {
    schemaVersion: 1,
    kind: 'events',
    id: null,
    featureId: 'feature',
    data: { events: [] },
  });
  assert.equal(await handlers.get(IPC_CHANNELS.openArtifact)(
    event,
    { artifactId: 'design', editorId: 'vscode', remember: true },
  ), true);
  assert.equal((await handlers.get(IPC_CHANNELS.getArtifactActions)(
    event, { artifactId: 'design' },
  )).preferredEditorId, 'vscode');
  assert.equal(await handlers.get(IPC_CHANNELS.chooseArtifactApplication)(
    event, { artifactId: 'design' },
  ), true);
  assert.equal(await handlers.get(IPC_CHANNELS.saveArtifactAs)(
    event, { artifactId: 'design' },
  ), true);
  assert.equal(await handlers.get(IPC_CHANNELS.saveArtifactDownloads)(
    event, { artifactId: 'design' },
  ), true);
  assert.equal(await handlers.get(IPC_CHANNELS.openArtifactGithub)(
    event, { artifactId: 'design' },
  ), true);
  assert.equal(await handlers.get(IPC_CHANNELS.revealArtifact)(
    event,
    { artifactId: 'spec' },
  ), true);
  assert.deepEqual(await handlers.get(IPC_CHANNELS.listSession)(event), {
    schemaVersion: 1,
    items: [sessionItem],
  });
  assert.equal((await handlers.get(IPC_CHANNELS.readSession)(event, sessionId)).content, '# State');
  assert.equal(await handlers.get(IPC_CHANNELS.copyText)(event, 'gatereeve next'), true);
  assert.equal((await handlers.get(IPC_CHANNELS.checkForUpdates)(event)).status, 'available');
  assert.equal(await handlers.get(IPC_CHANNELS.openUpdateRelease)(event), true);
  assert.equal(await handlers.get(IPC_CHANNELS.openExternalLink)(
    event,
    'https://example.com/workflow?q=1',
  ), true);
  assert.equal((await handlers.get(IPC_CHANNELS.setNotificationsEnabled)(event, true)).preferences.notificationsEnabled, true);
  assert.deepEqual(
    (await handlers.get(IPC_CHANNELS.setSelectedAgents)(event, ['claude'])).preferences.selectedAgents,
    ['claude'],
  );
  assert.equal((await handlers.get(IPC_CHANNELS.recheckSetup)(event)).setup.phase, 'unconfigured');
  assert.deepEqual(opened, []);
  assert.deepEqual(artifactOperations, [
    ['open', '/repo/design.md', 'vscode', true],
    ['capabilities', '/repo/design.md'],
    ['choose', '/repo/design.md'],
    ['save-as', '/repo/design.md'],
    ['downloads', '/repo/design.md'],
    ['github', '/repo/design.md'],
  ]);
  assert.deepEqual(revealed, ['/repo/spec.md']);
  assert.deepEqual(copied, ['gatereeve next']);
  assert.deepEqual(external, [
    'https://github.com/TrentBrown/gatereeve/releases/tag/v0.1.0-rc.4',
    'https://example.com/workflow?q=1',
  ]);
  await assert.rejects(
    handlers.get(IPC_CHANNELS.openExternalLink)(event, 'file:///etc/passwd'),
    /HTTP\(S\)/,
  );
  await assert.rejects(
    handlers.get(IPC_CHANNELS.readDetail)(event, { kind: 'file', id: '/etc/passwd' }),
    /invalid/,
  );
  await assert.rejects(
    handlers.get(IPC_CHANNELS.getState)(
      { senderFrame: { url: 'https://example.com' }, sender: { mainFrame: {} } },
    ),
    /Untrusted/,
  );
});
