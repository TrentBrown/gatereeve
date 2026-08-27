'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const channels = Object.freeze({
  chooseWorktree: 'gatereeve:desktop:choose-worktree',
  copyText: 'gatereeve:desktop:copy-text',
  getState: 'gatereeve:desktop:get-state',
  listSession: 'gatereeve:desktop:list-session',
  openArtifact: 'gatereeve:desktop:open-artifact',
  openRecent: 'gatereeve:desktop:open-recent',
  readDetail: 'gatereeve:desktop:read-detail',
  readSession: 'gatereeve:desktop:read-session',
  refresh: 'gatereeve:desktop:refresh',
  revealArtifact: 'gatereeve:desktop:reveal-artifact',
  stateChanged: 'gatereeve:desktop:state-changed',
});

function requireState(value) {
  if (
    typeof value !== 'object'
    || value === null
    || value.schemaVersion !== 1
    || !['idle', 'loading', 'ready', 'error'].includes(value.phase)
    || typeof value.refreshing !== 'boolean'
    || typeof value.githubPolling !== 'boolean'
    || typeof value.preferences !== 'object'
    || !Array.isArray(value.preferences.recentWorktrees)
    || (value.snapshot !== null && (
      typeof value.snapshot !== 'object' || value.snapshot.schemaVersion !== 1
    ))
  ) {
    throw new Error('The main process returned invalid GateReeve Desktop state.');
  }
  return value;
}

function requirePath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 16_384) {
    throw new TypeError('Worktree path is invalid.');
  }
  return path;
}

function requireArtifactId(artifactId) {
  if (typeof artifactId !== 'string' || artifactId.length === 0 || artifactId.length > 512) {
    throw new TypeError('Artifact ID is invalid.');
  }
  return artifactId;
}

function requireClipboardText(value) {
  if (typeof value !== 'string' || value.length > 262_144) {
    throw new TypeError('Clipboard text is invalid.');
  }
  return value;
}

function requireSessionId(value) {
  if (typeof value !== 'string' || !/^session:[a-z-]+:[A-Za-z0-9_-]+$/.test(value)) {
    throw new TypeError('Session item ID is invalid.');
  }
  return value;
}

function requireSessionInventory(value) {
  if (
    typeof value !== 'object'
    || value === null
    || value.schemaVersion !== 1
    || !Array.isArray(value.items)
    || !value.items.every((item) => (
      typeof item === 'object'
      && item !== null
      && Object.keys(item).sort().join(',') === 'id,kind,label,modifiedAt,path,size'
      && typeof item.id === 'string'
      && /^session:[a-z-]+:[A-Za-z0-9_-]+$/.test(item.id)
      && ['latest-checkpoint', 'checkpoint', 'handoff'].includes(item.kind)
      && typeof item.label === 'string'
      && typeof item.path === 'string'
      && item.path.length > 0
      && !item.path.startsWith('..')
      && typeof item.modifiedAt === 'string'
      && Number.isInteger(item.size)
      && item.size >= 0
    ))
  ) {
    throw new Error('The main process returned invalid Session context.');
  }
  return value;
}

function requireSessionDetail(value) {
  if (
    typeof value !== 'object'
    || value === null
    || value.schemaVersion !== 1
    || typeof value.id !== 'string'
    || typeof value.content !== 'string'
    || typeof value.item !== 'object'
    || value.item?.id !== value.id
  ) {
    throw new Error('The main process returned invalid Session detail.');
  }
  return value;
}

function requireDetail(kind, id) {
  if (!['artifact', 'events', 'attempt', 'model'].includes(kind)) {
    throw new TypeError('Detail kind is invalid.');
  }
  if ((kind === 'artifact' || kind === 'attempt') && requireArtifactId(id) !== id) {
    throw new TypeError('Detail ID is invalid.');
  }
  if ((kind === 'events' || kind === 'model') && id !== null) {
    throw new TypeError('This detail kind does not accept an ID.');
  }
  return { kind, id };
}

contextBridge.exposeInMainWorld('gatereeveDesktop', Object.freeze({
  chooseWorktree: async () => requireState(await ipcRenderer.invoke(channels.chooseWorktree)),
  copyText: async (value) => ipcRenderer.invoke(channels.copyText, requireClipboardText(value)),
  getState: async () => requireState(await ipcRenderer.invoke(channels.getState)),
  listSession: async () => requireSessionInventory(await ipcRenderer.invoke(channels.listSession)),
  openArtifact: async (artifactId) => ipcRenderer.invoke(
    channels.openArtifact,
    { artifactId: requireArtifactId(artifactId) },
  ),
  openRecent: async (path) => requireState(await ipcRenderer.invoke(
    channels.openRecent,
    requirePath(path),
  )),
  readDetail: async (kind, id = null) => ipcRenderer.invoke(
    channels.readDetail,
    requireDetail(kind, id),
  ),
  readSession: async (id) => requireSessionDetail(await ipcRenderer.invoke(
    channels.readSession,
    requireSessionId(id),
  )),
  refresh: async () => requireState(await ipcRenderer.invoke(channels.refresh)),
  revealArtifact: async (artifactId) => ipcRenderer.invoke(
    channels.revealArtifact,
    { artifactId: requireArtifactId(artifactId) },
  ),
  subscribe(callback) {
    if (typeof callback !== 'function') throw new TypeError('State subscriber must be a function.');
    const listener = (_event, value) => callback(requireState(value));
    ipcRenderer.on(channels.stateChanged, listener);
    return () => ipcRenderer.removeListener(channels.stateChanged, listener);
  },
}));
