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
    preferences: { recentWorktrees: ['/repo'] },
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

test('IPC exposes only validated named reads, selection, refresh, and artifact OS actions', async () => {
  const handlers = new Map();
  const opened = [];
  const revealed = [];
  registerDesktopIpc({
    ipcMain: { handle(channel, handler) { handlers.set(channel, handler); } },
    coordinator: {
      current: state,
      async open() { return state(); },
      async refresh() { return state(); },
      async read(kind, id) {
        return { schemaVersion: 1, kind, id, featureId: 'feature', data: { events: [] } };
      },
      artifact(artifactId) { return { absolutePath: `/repo/${artifactId}.md` }; },
      subscribe() { return () => {}; },
    },
    async pickWorktree() { return '/repo'; },
    async openPath(path) { opened.push(path); return ''; },
    revealPath(path) { revealed.push(path); },
    windows: () => [],
  });
  assert.equal(handlers.size, Object.keys(IPC_CHANNELS).length - 1);
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
  assert.deepEqual(opened, ['/repo/design.md']);
  assert.deepEqual(revealed, ['/repo/spec.md']);
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
