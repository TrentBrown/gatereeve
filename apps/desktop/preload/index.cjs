'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const channels = Object.freeze({
  checkForUpdates: 'gatereeve:desktop:check-for-updates',
  addProject: 'gatereeve:desktop:add-project',
  copyText: 'gatereeve:desktop:copy-text',
  getState: 'gatereeve:desktop:get-state',
  getArtifactActions: 'gatereeve:desktop:get-artifact-actions',
  getUpdateState: 'gatereeve:desktop:get-update-state',
  listSession: 'gatereeve:desktop:list-session',
  layoutCommand: 'gatereeve:desktop:layout-command',
  openArtifact: 'gatereeve:desktop:open-artifact',
  chooseArtifactApplication: 'gatereeve:desktop:choose-artifact-application',
  saveArtifactAs: 'gatereeve:desktop:save-artifact-as',
  saveArtifactDownloads: 'gatereeve:desktop:save-artifact-downloads',
  openArtifactGithub: 'gatereeve:desktop:open-artifact-github',
  openExternalLink: 'gatereeve:desktop:open-external-link',
  openUpdateRelease: 'gatereeve:desktop:open-update-release',
  activateProject: 'gatereeve:desktop:activate-project',
  readDetail: 'gatereeve:desktop:read-detail',
  readSession: 'gatereeve:desktop:read-session',
  refresh: 'gatereeve:desktop:refresh',
  removeProject: 'gatereeve:desktop:remove-project',
  reorderProjects: 'gatereeve:desktop:reorder-projects',
  recheckSetup: 'gatereeve:desktop:recheck-setup',
  revealArtifact: 'gatereeve:desktop:reveal-artifact',
  setNotificationsEnabled: 'gatereeve:desktop:set-notifications-enabled',
  setSelectedAgents: 'gatereeve:desktop:set-selected-agents',
  stateChanged: 'gatereeve:desktop:state-changed',
  updateChanged: 'gatereeve:desktop:update-changed',
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
    || !Array.isArray(value.preferences.projectPaths)
    || typeof value.preferences.notificationsEnabled !== 'boolean'
    || !Array.isArray(value.preferences.selectedAgents)
    || value.preferences.selectedAgents.some((id) => !['codex', 'claude'].includes(id))
    || !Array.isArray(value.projects)
    || (value.candidateDiagnostic !== null && typeof value.candidateDiagnostic !== 'object')
    || typeof value.setup !== 'object'
    || value.setup === null
    || value.setup.schemaVersion !== 1
    || !['unconfigured', 'checking', 'ready', 'incomplete'].includes(value.setup.phase)
    || typeof value.setup.operationalReady !== 'boolean'
    || !Array.isArray(value.setup.selectedAgents)
    || !Array.isArray(value.setup.prerequisites)
    || !Array.isArray(value.setup.agents)
    || (value.snapshot !== null && (
      typeof value.snapshot !== 'object' || value.snapshot.schemaVersion !== 1
    ))
  ) {
    throw new Error('The main process returned invalid GateReeve Desktop state.');
  }
  return value;
}

function requireUpdateState(value) {
  const available = value?.available;
  if (
    typeof value !== 'object'
    || value === null
    || value.schemaVersion !== 1
    || !['idle', 'checking', 'current', 'available', 'unavailable'].includes(value.status)
    || ![null, 'cache', 'automatic', 'manual'].includes(value.source)
    || typeof value.currentVersion !== 'string'
    || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-rc\.(?:0|[1-9]\d*))?$/u.test(value.currentVersion)
    || (value.checkedAt !== null && typeof value.checkedAt !== 'string')
    || (available !== null && (
      typeof available !== 'object'
      || typeof available.version !== 'string'
      || !['rc', 'stable'].includes(available.channel)
      || typeof available.publishedAt !== 'string'
    ))
    || (value.status === 'available') !== (available !== null)
    || (value.detail !== null && typeof value.detail !== 'string')
  ) {
    throw new Error('The main process returned invalid GateReeve update state.');
  }
  return value;
}

function requireSelectedAgents(value) {
  if (
    !Array.isArray(value)
    || value.length > 2
    || value.some((id) => !['codex', 'claude'].includes(id))
    || new Set(value).size !== value.length
  ) {
    throw new TypeError('Selected agents are invalid.');
  }
  return ['codex', 'claude'].filter((id) => value.includes(id));
}

function requirePath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 16_384) {
    throw new TypeError('Project path is invalid.');
  }
  return path;
}

function requireProjectOrder(value) {
  if (
    !Array.isArray(value)
    || value.some((path) => requirePath(path) !== path)
    || new Set(value).size !== value.length
  ) {
    throw new TypeError('Project order is invalid.');
  }
  return [...value];
}

function requireArtifactId(artifactId) {
  if (typeof artifactId !== 'string' || artifactId.length === 0 || artifactId.length > 512) {
    throw new TypeError('Artifact ID is invalid.');
  }
  return artifactId;
}

function requireEditorId(editorId) {
  if (
    editorId !== null
    && (typeof editorId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(editorId))
  ) {
    throw new TypeError('Editor ID is invalid.');
  }
  return editorId;
}

function requireArtifactActions(value) {
  if (
    typeof value !== 'object'
    || value === null
    || value.schemaVersion !== 1
    || !Array.isArray(value.editors)
    || value.editors.some((editor) => (
      typeof editor !== 'object'
      || editor === null
      || typeof editor.id !== 'string'
      || !/^[a-z][a-z0-9-]{0,63}$/.test(editor.id)
      || typeof editor.label !== 'string'
    ))
    || (value.preferredEditorId !== null
      && !value.editors.some((editor) => editor.id === value.preferredEditorId))
    || typeof value.githubAvailable !== 'boolean'
  ) {
    throw new Error('The main process returned invalid artifact actions.');
  }
  return value;
}

function requireClipboardText(value) {
  if (typeof value !== 'string' || value.length > 262_144) {
    throw new TypeError('Clipboard text is invalid.');
  }
  return value;
}

function requireExternalLink(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 8_192) {
    throw new TypeError('External link is invalid. Only HTTP(S) links are allowed.');
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('External link is invalid. Only HTTP(S) links are allowed.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol)
    || url.username.length > 0
    || url.password.length > 0
  ) {
    throw new TypeError('External link is invalid. Only HTTP(S) links are allowed.');
  }
  return url.href;
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
  checkForUpdates: async () => requireUpdateState(await ipcRenderer.invoke(channels.checkForUpdates)),
  addProject: async () => requireState(await ipcRenderer.invoke(channels.addProject)),
  copyText: async (value) => ipcRenderer.invoke(channels.copyText, requireClipboardText(value)),
  getState: async () => requireState(await ipcRenderer.invoke(channels.getState)),
  getArtifactActions: async (artifactId) => requireArtifactActions(await ipcRenderer.invoke(
    channels.getArtifactActions,
    { artifactId: requireArtifactId(artifactId) },
  )),
  getUpdateState: async () => requireUpdateState(await ipcRenderer.invoke(channels.getUpdateState)),
  listSession: async () => requireSessionInventory(await ipcRenderer.invoke(channels.listSession)),
  openArtifact: async (artifactId, editorId = null, remember = false) => {
    if (typeof remember !== 'boolean') throw new TypeError('Remember editor must be boolean.');
    return ipcRenderer.invoke(
      channels.openArtifact,
      {
        artifactId: requireArtifactId(artifactId),
        editorId: requireEditorId(editorId),
        remember,
      },
    );
  },
  chooseArtifactApplication: async (artifactId) => ipcRenderer.invoke(
    channels.chooseArtifactApplication,
    { artifactId: requireArtifactId(artifactId) },
  ),
  saveArtifactAs: async (artifactId) => ipcRenderer.invoke(
    channels.saveArtifactAs,
    { artifactId: requireArtifactId(artifactId) },
  ),
  saveArtifactDownloads: async (artifactId) => ipcRenderer.invoke(
    channels.saveArtifactDownloads,
    { artifactId: requireArtifactId(artifactId) },
  ),
  openArtifactGithub: async (artifactId) => ipcRenderer.invoke(
    channels.openArtifactGithub,
    { artifactId: requireArtifactId(artifactId) },
  ),
  openExternalLink: async (url) => ipcRenderer.invoke(
    channels.openExternalLink,
    requireExternalLink(url),
  ),
  activateProject: async (path) => requireState(await ipcRenderer.invoke(
    channels.activateProject,
    requirePath(path),
  )),
  openUpdateRelease: async () => ipcRenderer.invoke(channels.openUpdateRelease),
  readDetail: async (kind, id = null) => ipcRenderer.invoke(
    channels.readDetail,
    requireDetail(kind, id),
  ),
  readSession: async (id) => requireSessionDetail(await ipcRenderer.invoke(
    channels.readSession,
    requireSessionId(id),
  )),
  refresh: async () => requireState(await ipcRenderer.invoke(channels.refresh)),
  removeProject: async (path) => requireState(await ipcRenderer.invoke(
    channels.removeProject,
    requirePath(path),
  )),
  reorderProjects: async (paths) => requireState(await ipcRenderer.invoke(
    channels.reorderProjects,
    requireProjectOrder(paths),
  )),
  recheckSetup: async () => requireState(await ipcRenderer.invoke(channels.recheckSetup)),
  setNotificationsEnabled: async (enabled) => {
    if (typeof enabled !== 'boolean') throw new TypeError('Notification preference must be boolean.');
    return requireState(await ipcRenderer.invoke(channels.setNotificationsEnabled, enabled));
  },
  setSelectedAgents: async (selectedAgents) => requireState(await ipcRenderer.invoke(
    channels.setSelectedAgents,
    requireSelectedAgents(selectedAgents),
  )),
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
  subscribeUpdates(callback) {
    if (typeof callback !== 'function') throw new TypeError('Update subscriber must be a function.');
    const listener = (_event, value) => callback(requireUpdateState(value));
    ipcRenderer.on(channels.updateChanged, listener);
    return () => ipcRenderer.removeListener(channels.updateChanged, listener);
  },
  subscribeLayoutCommands(callback) {
    if (typeof callback !== 'function') throw new TypeError('Layout command subscriber must be a function.');
    const listener = (_event, command) => {
      if (!['toggle-sidebar', 'toggle-inspector'].includes(command)) {
        throw new Error('The main process sent an invalid layout command.');
      }
      callback(command);
    };
    ipcRenderer.on(channels.layoutCommand, listener);
    return () => ipcRenderer.removeListener(channels.layoutCommand, listener);
  },
}));
