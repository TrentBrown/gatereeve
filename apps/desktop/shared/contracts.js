// @ts-check

export const DESKTOP_STATE_SCHEMA_VERSION = 1;

export const IPC_CHANNELS = Object.freeze({
  chooseWorktree: 'gatereeve:desktop:choose-worktree',
  getState: 'gatereeve:desktop:get-state',
  openArtifact: 'gatereeve:desktop:open-artifact',
  openRecent: 'gatereeve:desktop:open-recent',
  readDetail: 'gatereeve:desktop:read-detail',
  refresh: 'gatereeve:desktop:refresh',
  revealArtifact: 'gatereeve:desktop:reveal-artifact',
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
    || !exactKeys(value.preferences, ['recentWorktrees'])
    || !Array.isArray(value.preferences.recentWorktrees)
    || !value.preferences.recentWorktrees.every((path) => typeof path === 'string')
  ) {
    throw new Error('The main process returned invalid GateReeve Desktop state.');
  }
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
