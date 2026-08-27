// @ts-check

export const DESKTOP_STATE_SCHEMA_VERSION = 1;

export const IPC_CHANNELS = Object.freeze({
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
  setNotificationsEnabled: 'gatereeve:desktop:set-notifications-enabled',
  stateChanged: 'gatereeve:desktop:state-changed',
});

const PHASES = new Set(['idle', 'loading', 'ready', 'error']);

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

export function requireDesktopState(value) {
  if (
    !isObject(value)
    || !exactKeys(value, [
      'schemaVersion', 'phase', 'refreshing', 'githubPolling', 'selection',
      'snapshot', 'error', 'preferences',
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
    || !exactKeys(value.preferences, ['notificationsEnabled', 'recentWorktrees'])
    || !Array.isArray(value.preferences.recentWorktrees)
    || !value.preferences.recentWorktrees.every((path) => typeof path === 'string')
    || typeof value.preferences.notificationsEnabled !== 'boolean'
  ) {
    throw new Error('The main process returned invalid GateReeve Desktop state.');
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
