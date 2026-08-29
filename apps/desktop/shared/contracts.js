// @ts-check

export const DESKTOP_STATE_SCHEMA_VERSION = 1;

export const IPC_CHANNELS = Object.freeze({
  checkForUpdates: 'gatereeve:desktop:check-for-updates',
  chooseWorktree: 'gatereeve:desktop:choose-worktree',
  copyText: 'gatereeve:desktop:copy-text',
  getState: 'gatereeve:desktop:get-state',
  getUpdateState: 'gatereeve:desktop:get-update-state',
  listSession: 'gatereeve:desktop:list-session',
  openArtifact: 'gatereeve:desktop:open-artifact',
  openExternalLink: 'gatereeve:desktop:open-external-link',
  openUpdateRelease: 'gatereeve:desktop:open-update-release',
  openRecent: 'gatereeve:desktop:open-recent',
  readDetail: 'gatereeve:desktop:read-detail',
  readSession: 'gatereeve:desktop:read-session',
  refresh: 'gatereeve:desktop:refresh',
  recheckSetup: 'gatereeve:desktop:recheck-setup',
  revealArtifact: 'gatereeve:desktop:reveal-artifact',
  setNotificationsEnabled: 'gatereeve:desktop:set-notifications-enabled',
  setSelectedAgents: 'gatereeve:desktop:set-selected-agents',
  stateChanged: 'gatereeve:desktop:state-changed',
  updateChanged: 'gatereeve:desktop:update-changed',
});

const PHASES = new Set(['idle', 'loading', 'ready', 'error']);
const SETUP_PHASES = new Set(['unconfigured', 'checking', 'ready', 'incomplete']);
const AGENT_IDS = Object.freeze(['codex', 'claude']);
const UPDATE_STATUSES = new Set(['idle', 'checking', 'current', 'available', 'unavailable']);
const UPDATE_SOURCES = new Set([null, 'cache', 'automatic', 'manual']);
const DESKTOP_VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-rc\.(?:0|[1-9]\d*))?$/u;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length
    && actual.every((key, index) => key === [...keys].sort()[index]);
}

function nullableString(value) {
  return value === null || typeof value === 'string';
}

function validRemediation(value) {
  return value === null || (
    isObject(value)
    && exactKeys(value, ['summary', 'command', 'guideUrl'])
    && typeof value.summary === 'string'
    && nullableString(value.command)
    && typeof value.guideUrl === 'string'
  );
}

export function requireSelectedAgents(value) {
  if (
    !Array.isArray(value)
    || value.length > AGENT_IDS.length
    || value.some((id) => !AGENT_IDS.includes(id))
    || new Set(value).size !== value.length
  ) {
    throw new Error('Selected agents are invalid.');
  }
  return AGENT_IDS.filter((id) => value.includes(id));
}

function validPrerequisite(value) {
  return isObject(value)
    && exactKeys(value, ['id', 'label', 'status', 'version', 'detail', 'remediation'])
    && typeof value.id === 'string'
    && typeof value.label === 'string'
    && ['present', 'missing', 'unavailable', 'incompatible', 'unauthenticated'].includes(value.status)
    && nullableString(value.version)
    && typeof value.detail === 'string'
    && validRemediation(value.remediation);
}

function validAgent(value) {
  return isObject(value)
    && exactKeys(value, ['id', 'label', 'status', 'cli', 'plugin'])
    && AGENT_IDS.includes(value.id)
    && typeof value.label === 'string'
    && ['ready', 'incomplete'].includes(value.status)
    && isObject(value.cli)
    && exactKeys(value.cli, ['status', 'version', 'authenticated', 'detail', 'remediation'])
    && ['present', 'missing', 'unavailable'].includes(value.cli.status)
    && nullableString(value.cli.version)
    && (value.cli.authenticated === null || typeof value.cli.authenticated === 'boolean')
    && typeof value.cli.detail === 'string'
    && validRemediation(value.cli.remediation)
    && isObject(value.plugin)
    && exactKeys(value.plugin, [
      'status', 'version', 'compatibility', 'evidence', 'detail', 'recommendation', 'remediation',
    ])
    && ['enabled', 'disabled', 'missing', 'unavailable', 'not-checked'].includes(value.plugin.status)
    && nullableString(value.plugin.version)
    && ['matched', 'compatible', 'incompatible', 'not-checked'].includes(value.plugin.compatibility)
    && nullableString(value.plugin.evidence)
    && typeof value.plugin.detail === 'string'
    && nullableString(value.plugin.recommendation)
    && validRemediation(value.plugin.remediation);
}

export function requireSetupState(value) {
  if (
    !isObject(value)
    || !exactKeys(value, [
      'schemaVersion', 'phase', 'operationalReady', 'checkedAt', 'desktop',
      'selectedAgents', 'prerequisites', 'agents',
    ])
    || value.schemaVersion !== 1
    || !SETUP_PHASES.has(value.phase)
    || typeof value.operationalReady !== 'boolean'
    || value.operationalReady !== (value.phase === 'ready')
    || !nullableString(value.checkedAt)
    || !isObject(value.desktop)
    || !exactKeys(value.desktop, ['version'])
    || typeof value.desktop.version !== 'string'
    || (() => {
      try { return requireSelectedAgents(value.selectedAgents).length !== value.selectedAgents.length; }
      catch { return true; }
    })()
    || !Array.isArray(value.prerequisites)
    || !value.prerequisites.every(validPrerequisite)
    || !Array.isArray(value.agents)
    || !value.agents.every(validAgent)
    || value.agents.some((agent) => !value.selectedAgents.includes(agent.id))
    || (value.phase === 'unconfigured' && (
      value.selectedAgents.length !== 0
      || value.checkedAt !== null
      || value.prerequisites.length !== 0
      || value.agents.length !== 0
    ))
    || (value.operationalReady && (
      value.selectedAgents.length === 0
      || value.agents.length !== value.selectedAgents.length
      || value.prerequisites.some((item) => item.status !== 'present')
      || !value.agents.some((agent) => agent.status === 'ready')
    ))
  ) {
    throw new Error('The main process returned invalid GateReeve Setup state.');
  }
  return value;
}

export function requireDesktopState(value) {
  if (
    !isObject(value)
    || !exactKeys(value, [
      'schemaVersion', 'phase', 'refreshing', 'githubPolling', 'selection',
      'snapshot', 'error', 'preferences', 'setup',
    ])
    || value.schemaVersion !== DESKTOP_STATE_SCHEMA_VERSION
    || !PHASES.has(value.phase)
    || typeof value.refreshing !== 'boolean'
    || typeof value.githubPolling !== 'boolean'
    || (value.selection !== null && (
      !isObject(value.selection)
      || !exactKeys(value.selection, ['worktreePath', 'featureHome'])
      || typeof value.selection.worktreePath !== 'string'
      || !nullableString(value.selection.featureHome)
    ))
    || (value.snapshot !== null && (!isObject(value.snapshot) || value.snapshot.schemaVersion !== 1))
    || (value.error !== null && (
      !isObject(value.error)
      || !exactKeys(value.error, ['code', 'message'])
      || typeof value.error.code !== 'string'
      || typeof value.error.message !== 'string'
    ))
    || !isObject(value.preferences)
    || !exactKeys(value.preferences, ['notificationsEnabled', 'recentWorktrees', 'selectedAgents'])
    || !Array.isArray(value.preferences.recentWorktrees)
    || !value.preferences.recentWorktrees.every((path) => typeof path === 'string')
    || typeof value.preferences.notificationsEnabled !== 'boolean'
    || (() => {
      try { return requireSelectedAgents(value.preferences.selectedAgents).length !== value.preferences.selectedAgents.length; }
      catch { return true; }
    })()
    || (() => {
      try { requireSetupState(value.setup); return false; }
      catch { return true; }
    })()
    || JSON.stringify(requireSelectedAgents(value.preferences.selectedAgents))
      !== JSON.stringify(requireSelectedAgents(value.setup.selectedAgents))
  ) {
    throw new Error('The main process returned invalid GateReeve Desktop state.');
  }
  return value;
}

export function requireUpdateState(value) {
  const available = value?.available;
  if (
    !isObject(value)
    || !exactKeys(value, [
      'schemaVersion', 'status', 'source', 'currentVersion', 'checkedAt', 'available', 'detail',
    ])
    || value.schemaVersion !== 1
    || !UPDATE_STATUSES.has(value.status)
    || !UPDATE_SOURCES.has(value.source)
    || typeof value.currentVersion !== 'string'
    || !DESKTOP_VERSION_PATTERN.test(value.currentVersion)
    || (value.checkedAt !== null && (
      typeof value.checkedAt !== 'string' || !Number.isFinite(Date.parse(value.checkedAt))
    ))
    || (available !== null && (
      !isObject(available)
      || !exactKeys(available, ['version', 'channel', 'publishedAt'])
      || typeof available.version !== 'string'
      || !DESKTOP_VERSION_PATTERN.test(available.version)
      || !['rc', 'stable'].includes(available.channel)
      || (available.channel === 'rc') !== available.version.includes('-rc.')
      || typeof available.publishedAt !== 'string'
      || !Number.isFinite(Date.parse(available.publishedAt))
    ))
    || (value.detail !== null && typeof value.detail !== 'string')
    || (value.status === 'idle' && (
      value.source !== null || value.checkedAt !== null || available !== null || value.detail !== null
    ))
    || (value.status === 'checking' && value.source === null)
    || (value.status === 'available' && available === null)
    || (value.status !== 'available' && available !== null)
    || (['current', 'available', 'unavailable'].includes(value.status) && (
      value.source === null || value.checkedAt === null
    ))
  ) {
    throw new Error('The main process returned invalid GateReeve update state.');
  }
  return value;
}

export function requireNotificationsEnabled(value) {
  if (typeof value !== 'boolean') throw new Error('Notification preference is invalid.');
  return value;
}

export function requireDetailRequest(value) {
  if (
    !isObject(value)
    || !exactKeys(value, ['kind', 'id'])
    || !['artifact', 'events', 'attempt', 'model'].includes(value.kind)
    || !nullableString(value.id)
    || (value.kind === 'artifact' && (!value.id || value.id.length > 512))
    || (value.kind === 'attempt' && (!value.id || value.id.length > 512))
    || (value.kind === 'events' && value.id !== null)
    || (value.kind === 'model' && value.id !== null)
  ) {
    throw new Error('Named detail request is invalid.');
  }
  return value;
}

export function requireArtifactRequest(value) {
  if (
    !isObject(value)
    || !exactKeys(value, ['artifactId'])
    || typeof value.artifactId !== 'string'
    || value.artifactId.length === 0
    || value.artifactId.length > 512
  ) {
    throw new Error('Artifact request is invalid.');
  }
  return value;
}

export function requireWorktreePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 16_384) {
    throw new Error('Worktree path is invalid.');
  }
  return value;
}

export function requireCopyText(value) {
  if (typeof value !== 'string' || value.length > 262_144) {
    throw new Error('Clipboard text is invalid.');
  }
  return value;
}

export function requireExternalLink(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 8_192) {
    throw new Error('External link is invalid. Only HTTP(S) links are allowed.');
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('External link is invalid. Only HTTP(S) links are allowed.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol)
    || url.username.length > 0
    || url.password.length > 0
  ) {
    throw new Error('External link is invalid. Only HTTP(S) links are allowed.');
  }
  return url.href;
}

export function requireSessionId(value) {
  if (typeof value !== 'string' || !/^session:[a-z-]+:[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Session item ID is invalid.');
  }
  return value;
}

function validateSessionItem(item) {
  return isObject(item)
    && exactKeys(item, ['id', 'kind', 'label', 'modifiedAt', 'path', 'size'])
    && typeof item.id === 'string'
    && /^session:[a-z-]+:[A-Za-z0-9_-]+$/.test(item.id)
    && ['latest-checkpoint', 'checkpoint', 'handoff'].includes(item.kind)
    && typeof item.label === 'string'
    && typeof item.path === 'string'
    && item.path.length > 0
    && !item.path.startsWith('..')
    && Number.isInteger(item.size)
    && item.size >= 0
    && typeof item.modifiedAt === 'string';
}

export function requireSessionInventory(value) {
  if (
    !isObject(value)
    || !exactKeys(value, ['items', 'schemaVersion'])
    || value.schemaVersion !== 1
    || !Array.isArray(value.items)
    || !value.items.every(validateSessionItem)
  ) {
    throw new Error('Session inventory is invalid.');
  }
  return value;
}

export function requireSessionDetail(value) {
  if (
    !isObject(value)
    || !exactKeys(value, ['content', 'id', 'item', 'schemaVersion'])
    || value.schemaVersion !== 1
    || typeof value.id !== 'string'
    || !validateSessionItem(value.item)
    || value.item.id !== value.id
    || typeof value.content !== 'string'
  ) {
    throw new Error('Session detail is invalid.');
  }
  return value;
}
