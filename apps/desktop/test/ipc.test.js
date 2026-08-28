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
    setup: {
      schemaVersion: 1, phase: 'unconfigured', operationalReady: false, checkedAt: null,
      desktop: { version: '0.1.0' }, selectedAgents: [], prerequisites: [], agents: [],
    },
    preferences: { notificationsEnabled: false, recentWorktrees: ['/repo'], selectedAgents: [] },
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
    async pickWorktree() { return '/repo'; },
    async openPath(path) { opened.push(path); return ''; },
    revealPath(path) { revealed.push(path); },
    copyText(value) { copied.push(value); },
    async openExternal(value) { external.push(value); },
    windows: () => [],
  });
  assert.equal(handlers.size, Object.keys(IPC_CHANNELS).length - 2);
  const event = trustedEvent();
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
    { artifactId: 'design' },
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
  assert.equal((await handlers.get(IPC_CHANNELS.setNotificationsEnabled)(event, true)).preferences.notificationsEnabled, true);
  assert.deepEqual(
    (await handlers.get(IPC_CHANNELS.setSelectedAgents)(event, ['claude'])).preferences.selectedAgents,
    ['claude'],
  );
  assert.equal((await handlers.get(IPC_CHANNELS.recheckSetup)(event)).setup.phase, 'unconfigured');
  assert.deepEqual(opened, ['/repo/design.md']);
  assert.deepEqual(revealed, ['/repo/spec.md']);
  assert.deepEqual(copied, ['gatereeve next']);
  assert.deepEqual(external, ['https://github.com/TrentBrown/gatereeve/releases/tag/v0.1.0-rc.4']);
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
