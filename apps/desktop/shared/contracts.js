// @ts-check

export const DESKTOP_STATE_SCHEMA_VERSION = 1;

export const IPC_CHANNELS = Object.freeze({
  checkForUpdates: 'gatereeve:desktop:check-for-updates',
  addProject: 'gatereeve:desktop:add-project',
  applyModulePolicy: 'gatereeve:desktop:apply-module-policy',
  copyText: 'gatereeve:desktop:copy-text',
  getState: 'gatereeve:desktop:get-state',
  getArtifactActions: 'gatereeve:desktop:get-artifact-actions',
  getModuleSettings: 'gatereeve:desktop:get-module-settings',
  getModuleRunPreview: 'gatereeve:desktop:get-module-run-preview',
  getUpdateState: 'gatereeve:desktop:get-update-state',
  listSession: 'gatereeve:desktop:list-session',
  listModuleTasks: 'gatereeve:desktop:list-module-tasks',
  layoutCommand: 'gatereeve:desktop:layout-command',
  openArtifact: 'gatereeve:desktop:open-artifact',
  chooseArtifactApplication: 'gatereeve:desktop:choose-artifact-application',
  saveArtifactAs: 'gatereeve:desktop:save-artifact-as',
  saveArtifactDownloads: 'gatereeve:desktop:save-artifact-downloads',
  openArtifactGithub: 'gatereeve:desktop:open-artifact-github',
  openExternalLink: 'gatereeve:desktop:open-external-link',
  openUpdateRelease: 'gatereeve:desktop:open-update-release',
  previewModulePolicy: 'gatereeve:desktop:preview-module-policy',
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
  setTerminalHeight: 'gatereeve:desktop:set-terminal-height',
  stateChanged: 'gatereeve:desktop:state-changed',
  attestModule: 'gatereeve:desktop:attest-module',
  moduleTaskCancel: 'gatereeve:desktop:module-task-cancel',
  moduleTaskChanged: 'gatereeve:desktop:module-task-changed',
  moduleTaskResize: 'gatereeve:desktop:module-task-resize',
  moduleTaskStart: 'gatereeve:desktop:module-task-start',
  moduleTaskWrite: 'gatereeve:desktop:module-task-write',
  terminalChanged: 'gatereeve:desktop:terminal-changed',
  terminalEnsure: 'gatereeve:desktop:terminal-ensure',
  terminalResize: 'gatereeve:desktop:terminal-resize',
  terminalRestart: 'gatereeve:desktop:terminal-restart',
  terminalTerminate: 'gatereeve:desktop:terminal-terminate',
  terminalWrite: 'gatereeve:desktop:terminal-write',
  updateChanged: 'gatereeve:desktop:update-changed',
  waiveBoundaryModule: 'gatereeve:desktop:waive-boundary-module',
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

function validProjectDiagnostic(value) {
  return isObject(value)
    && exactKeys(value, [
      'classification', 'title', 'message', 'selectedPath', 'featureHome',
      'failedChecks', 'pinnedModel', 'supportedModel',
    ])
    && typeof value.classification === 'string'
    && typeof value.title === 'string'
    && typeof value.message === 'string'
    && typeof value.selectedPath === 'string'
    && nullableString(value.featureHome)
    && Array.isArray(value.failedChecks)
    && value.failedChecks.every((item) => typeof item === 'string')
    && nullableString(value.pinnedModel)
    && nullableString(value.supportedModel);
}

function validProject(value) {
  return isObject(value)
    && exactKeys(value, [
      'path', 'name', 'status', 'featureHome', 'featureId', 'workflowState', 'diagnostic',
    ])
    && typeof value.path === 'string'
    && typeof value.name === 'string'
    && ['ready', 'needs-attention'].includes(value.status)
    && nullableString(value.featureHome)
    && nullableString(value.featureId)
    && nullableString(value.workflowState)
    && (value.diagnostic === null || validProjectDiagnostic(value.diagnostic))
    && (value.status === 'ready') === (value.diagnostic === null);
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
      'snapshot', 'error', 'preferences', 'setup', 'projects', 'candidateDiagnostic',
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
    || !Array.isArray(value.projects)
    || !value.projects.every(validProject)
    || (value.candidateDiagnostic !== null && !validProjectDiagnostic(value.candidateDiagnostic))
    || !isObject(value.preferences)
    || !exactKeys(value.preferences, [
      'notificationsEnabled', 'projectPaths', 'selectedAgents', 'terminalHeight',
    ])
    || !Array.isArray(value.preferences.projectPaths)
    || !value.preferences.projectPaths.every((path) => typeof path === 'string')
    || typeof value.preferences.notificationsEnabled !== 'boolean'
    || !Number.isInteger(value.preferences.terminalHeight)
    || value.preferences.terminalHeight < 140
    || value.preferences.terminalHeight > 720
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

export function requireTerminalHeight(value) {
  if (!Number.isInteger(value) || value < 140 || value > 720) {
    throw new Error('Terminal panel height is invalid.');
  }
  return value;
}

function validModuleReadiness(value) {
  return isObject(value)
    && exactKeys(value, ['status', 'missing'])
    && ['unchecked', 'available', 'unavailable'].includes(value.status)
    && Array.isArray(value.missing)
    && value.missing.every((item) => (
      isObject(item)
      && exactKeys(item, ['kind', 'id'])
      && ['skill', 'provider'].includes(item.kind)
      && typeof item.id === 'string'
    ));
}

function validModuleSetting(value) {
  return isObject(value)
    && exactKeys(value, [
      'id', 'version', 'digest', 'label', 'description', 'slot', 'enabled',
      'locked', 'disposition', 'waiverAllowed', 'dependsOn', 'after',
      'readiness', 'runKind', 'observeProvider',
    ])
    && typeof value.id === 'string'
    && typeof value.version === 'string'
    && typeof value.digest === 'string'
    && typeof value.label === 'string'
    && typeof value.description === 'string'
    && ['boundary.evaluation', 'feature.finalization'].includes(value.slot)
    && typeof value.enabled === 'boolean'
    && typeof value.locked === 'boolean'
    && ['required', 'optional'].includes(value.disposition)
    && typeof value.waiverAllowed === 'boolean'
    && Array.isArray(value.dependsOn)
    && value.dependsOn.every((id) => typeof id === 'string')
    && Array.isArray(value.after)
    && value.after.every((id) => typeof id === 'string')
    && validModuleReadiness(value.readiness)
    && nullableString(value.runKind)
    && nullableString(value.observeProvider);
}

export function requireModuleSettings(value) {
  if (
    !isObject(value)
    || !exactKeys(value, [
      'schemaVersion', 'policyPath', 'policyExists', 'policyDigest',
      'featureModelHash', 'projectModelHash', 'migrationRequired', 'modules',
    ])
    || value.schemaVersion !== 1
    || typeof value.policyPath !== 'string'
    || typeof value.policyExists !== 'boolean'
    || typeof value.policyDigest !== 'string'
    || typeof value.featureModelHash !== 'string'
    || typeof value.projectModelHash !== 'string'
    || typeof value.migrationRequired !== 'boolean'
    || !Array.isArray(value.modules)
    || !value.modules.every(validModuleSetting)
  ) {
    throw new Error('Module settings are invalid.');
  }
  return value;
}

export function requireModulePolicyRequest(value) {
  if (
    !isObject(value)
    || !exactKeys(value, ['enabledModuleIds'])
    || !Array.isArray(value.enabledModuleIds)
    || value.enabledModuleIds.some((id) => typeof id !== 'string' || id.length === 0 || id.length > 512)
    || new Set(value.enabledModuleIds).size !== value.enabledModuleIds.length
  ) {
    throw new Error('Module policy preview request is invalid.');
  }
  return { enabledModuleIds: [...value.enabledModuleIds] };
}

export function requireModulePolicyApplyRequest(value) {
  if (
    !isObject(value)
    || !exactKeys(value, ['enabledModuleIds', 'confirmedMigration', 'confirmationLabel'])
    || typeof value.confirmedMigration !== 'boolean'
    || !nullableString(value.confirmationLabel)
    || (value.confirmationLabel !== null && value.confirmationLabel.length > 1_024)
  ) {
    throw new Error('Module policy apply request is invalid.');
  }
  const policy = requireModulePolicyRequest({ enabledModuleIds: value.enabledModuleIds });
  return {
    ...policy,
    confirmedMigration: value.confirmedMigration,
    confirmationLabel: value.confirmationLabel,
  };
}

function validMigrationImpact(value) {
  const stringFields = ['fromModelVersion', 'toModelVersion', 'fromModelHash', 'toModelHash'];
  const listFields = [
    'guardsAdded', 'guardsRemoved', 'transitionsAdded', 'transitionsRemoved',
    'modulesAdded', 'modulesRemoved', 'modulesChanged', 'boundaryGateIdsInvalidated',
  ];
  return isObject(value)
    && exactKeys(value, [...stringFields, ...listFields])
    && stringFields.every((field) => typeof value[field] === 'string')
    && listFields.every((field) => (
      Array.isArray(value[field]) && value[field].every((item) => typeof item === 'string')
    ));
}

export function requireModulePolicyPreview(value) {
  if (
    !isObject(value)
    || !exactKeys(value, [
      'schemaVersion', 'valid', 'error', 'autoEnabled', 'blockingDependents',
      'enabledModuleIds', 'suggestedEnabledModuleIds', 'diff', 'migrationImpact',
    ])
    || value.schemaVersion !== 1
    || typeof value.valid !== 'boolean'
    || !nullableString(value.error)
    || !Array.isArray(value.autoEnabled)
    || value.autoEnabled.some((id) => typeof id !== 'string')
    || !Array.isArray(value.blockingDependents)
    || !Array.isArray(value.enabledModuleIds)
    || value.enabledModuleIds.some((id) => typeof id !== 'string')
    || !Array.isArray(value.suggestedEnabledModuleIds)
    || value.suggestedEnabledModuleIds.some((id) => typeof id !== 'string')
    || !Array.isArray(value.diff)
    || value.diff.some((item) => (
      !isObject(item)
      || !exactKeys(item, ['id', 'before', 'after'])
      || typeof item.id !== 'string'
      || typeof item.before !== 'boolean'
      || typeof item.after !== 'boolean'
    ))
    || value.blockingDependents.some((item) => (
      !isObject(item)
      || !exactKeys(item, ['id', 'label', 'locked', 'missingDependencies'])
      || typeof item.id !== 'string'
      || typeof item.label !== 'string'
      || typeof item.locked !== 'boolean'
      || !Array.isArray(item.missingDependencies)
      || item.missingDependencies.some((id) => typeof id !== 'string')
    ))
    || (value.migrationImpact !== null && !validMigrationImpact(value.migrationImpact))
  ) {
    throw new Error('Module policy preview is invalid.');
  }
  return value;
}

export function requireBoundaryModuleWaiverRequest(value) {
  if (
    !isObject(value)
    || !exactKeys(value, ['attemptId', 'gateId', 'reason', 'confirmationLabel'])
    || !['attemptId', 'gateId', 'reason', 'confirmationLabel'].every((field) => (
      typeof value[field] === 'string'
      && value[field].trim().length > 0
      && value[field].length <= 2_048
    ))
  ) {
    throw new Error('Boundary module waiver request is invalid.');
  }
  return {
    attemptId: value.attemptId,
    gateId: value.gateId,
    reason: value.reason.trim(),
    confirmationLabel: value.confirmationLabel.trim(),
  };
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

export function requireArtifactOpenRequest(value) {
  if (
    !isObject(value)
    || !exactKeys(value, ['artifactId', 'editorId', 'remember'])
    || typeof value.artifactId !== 'string'
    || value.artifactId.length === 0
    || value.artifactId.length > 512
    || (value.editorId !== null && (
      typeof value.editorId !== 'string'
      || !/^[a-z][a-z0-9-]{0,63}$/u.test(value.editorId)
    ))
    || typeof value.remember !== 'boolean'
  ) {
    throw new Error('Artifact open request is invalid.');
  }
  return value;
}

export function requireArtifactActions(value) {
  if (
    !isObject(value)
    || !exactKeys(value, ['schemaVersion', 'editors', 'preferredEditorId', 'githubAvailable'])
    || value.schemaVersion !== 1
    || !Array.isArray(value.editors)
    || value.editors.some((editor) => (
      !isObject(editor)
      || !exactKeys(editor, ['id', 'label'])
      || typeof editor.id !== 'string'
      || !/^[a-z][a-z0-9-]{0,63}$/u.test(editor.id)
      || typeof editor.label !== 'string'
      || editor.label.length === 0
    ))
    || new Set(value.editors.map((editor) => editor.id)).size !== value.editors.length
    || (value.preferredEditorId !== null && (
      typeof value.preferredEditorId !== 'string'
      || !value.editors.some((editor) => editor.id === value.preferredEditorId)
    ))
    || typeof value.githubAvailable !== 'boolean'
  ) {
    throw new Error('Artifact action capabilities are invalid.');
  }
  return value;
}

export function requireProjectPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 16_384) {
    throw new Error('Project path is invalid.');
  }
  return value;
}

export function requireProjectOrder(value) {
  if (
    !Array.isArray(value)
    || value.some((path) => requireProjectPath(path) !== path)
    || new Set(value).size !== value.length
  ) {
    throw new Error('Project order is invalid.');
  }
  return [...value];
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

const TERMINAL_STATUSES = new Set(['running', 'terminating', 'exited', 'failed']);

export function requireTerminalId(value) {
  if (typeof value !== 'string' || !/^terminal_[A-Za-z0-9_-]{1,128}$/u.test(value)) {
    throw new Error('Terminal session ID is invalid.');
  }
  return value;
}

function validTerminalDimensions(cols, rows) {
  return Number.isInteger(cols)
    && Number.isInteger(rows)
    && cols >= 2
    && cols <= 500
    && rows >= 1
    && rows <= 300;
}

export function requireTerminalDimensionsRequest(value) {
  if (
    !isObject(value)
    || !exactKeys(value, ['cols', 'rows'])
    || !validTerminalDimensions(value.cols, value.rows)
  ) {
    throw new Error('Terminal dimensions request is invalid.');
  }
  return { cols: value.cols, rows: value.rows };
}

export function requireTerminalSessionRequest(value) {
  if (!isObject(value) || !exactKeys(value, ['sessionId'])) {
    throw new Error('Terminal session request is invalid.');
  }
  return { sessionId: requireTerminalId(value.sessionId) };
}

export function requireTerminalInputRequest(value) {
  if (
    !isObject(value)
    || !exactKeys(value, ['data', 'sessionId'])
    || typeof value.data !== 'string'
    || value.data.length === 0
    || value.data.length > 65_536
  ) {
    throw new Error('Terminal input request is invalid.');
  }
  return { sessionId: requireTerminalId(value.sessionId), data: value.data };
}

export function requireTerminalResizeRequest(value) {
  if (!isObject(value) || !exactKeys(value, ['cols', 'rows', 'sessionId'])) {
    throw new Error('Terminal resize request is invalid.');
  }
  const dimensions = requireTerminalDimensionsRequest({ cols: value.cols, rows: value.rows });
  return { sessionId: requireTerminalId(value.sessionId), ...dimensions };
}

export function requireTerminalRestartRequest(value) {
  return requireTerminalResizeRequest(value);
}

export function requireTerminalSession(value) {
  const exit = value?.exit;
  if (
    !isObject(value)
    || !exactKeys(value, [
      'cols', 'error', 'exit', 'id', 'output', 'projectName', 'rows',
      'schemaVersion', 'shell', 'status',
    ])
    || value.schemaVersion !== 1
    || requireTerminalId(value.id) !== value.id
    || typeof value.projectName !== 'string'
    || value.projectName.length === 0
    || value.projectName.length > 512
    || typeof value.shell !== 'string'
    || value.shell.length === 0
    || value.shell.length > 512
    || !TERMINAL_STATUSES.has(value.status)
    || !validTerminalDimensions(value.cols, value.rows)
    || typeof value.output !== 'string'
    || value.output.length > 1_000_000
    || (value.error !== null && typeof value.error !== 'string')
    || (exit !== null && (
      !isObject(exit)
      || !exactKeys(exit, ['code', 'signal'])
      || (exit.code !== null && !Number.isInteger(exit.code))
      || (exit.signal !== null && !Number.isInteger(exit.signal))
    ))
    || (value.status === 'failed') !== (value.error !== null)
    || (value.status === 'exited') !== (exit !== null)
  ) {
    throw new Error('Terminal session is invalid.');
  }
  return value;
}

export function requireTerminalEvent(value) {
  if (!isObject(value) || value.schemaVersion !== 1 || typeof value.type !== 'string') {
    throw new Error('Terminal event is invalid.');
  }
  if (
    value.type === 'data'
    && exactKeys(value, ['data', 'schemaVersion', 'sessionId', 'type'])
    && requireTerminalId(value.sessionId) === value.sessionId
    && typeof value.data === 'string'
    && value.data.length <= 1_000_000
  ) {
    return value;
  }
  if (
    ['exited', 'terminating'].includes(value.type)
    && exactKeys(value, ['schemaVersion', 'session', 'type'])
  ) {
    requireTerminalSession(value.session);
    if (value.type !== value.session.status) throw new Error('Terminal event state is inconsistent.');
    return value;
  }
  throw new Error('Terminal event is invalid.');
}

const MODULE_TASK_STATUSES = new Set([
  'running', 'terminating', 'passed', 'failed', 'awaiting-provider', 'timed-out', 'cancelled',
]);
const MODULE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

function boundedString(value, maximum = 16_384) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

export function requireModuleTargetRequest(value) {
  if (
    !isObject(value)
    || !exactKeys(value, ['moduleId', 'attemptId', 'gateId'])
    || [value.moduleId, value.attemptId, value.gateId].some((item) => (
      typeof item !== 'string' || item.length === 0 || item.length > 512
    ))
  ) throw new Error('Module target request is invalid.');
  return value;
}

export function requireModuleRunPreview(value) {
  const skillValid = value?.skill === null || (
    isObject(value.skill)
    && exactKeys(value.skill, ['id', 'invocation'])
    && boundedString(value.skill.id, 512)
    && boundedString(value.skill.invocation)
  );
  const manualValid = value?.manual === null || (
    isObject(value.manual)
    && exactKeys(value.manual, ['instructions'])
    && boundedString(value.manual.instructions, 65_536)
  );
  const command = value?.command;
  const commandValid = command === null || (
    isObject(command)
    && exactKeys(command, ['digest', 'display', 'authorization'])
    && MODULE_DIGEST_PATTERN.test(command.digest)
    && isObject(command.display)
    && exactKeys(command.display, [
      'executable', 'args', 'workingDirectory', 'effects', 'timeoutSeconds', 'authority',
    ])
    && boundedString(command.display.executable)
    && Array.isArray(command.display.args)
    && command.display.args.every((item) => typeof item === 'string' && item.length <= 16_384)
    && boundedString(command.display.workingDirectory)
    && Array.isArray(command.display.effects)
    && command.display.effects.every((item) => boundedString(item, 8_192))
    && Number.isSafeInteger(command.display.timeoutSeconds)
    && command.display.timeoutSeconds >= 1
    && command.display.timeoutSeconds <= 3_600
    && Array.isArray(command.display.authority)
    && command.display.authority.every((item) => boundedString(item, 8_192))
    && isObject(command.authorization)
    && exactKeys(command.authorization, [
      'authorized', 'authorizedAt', 'persistentEligible', 'changedInputs', 'supersededCount',
    ])
    && typeof command.authorization.authorized === 'boolean'
    && nullableString(command.authorization.authorizedAt)
    && typeof command.authorization.persistentEligible === 'boolean'
    && Array.isArray(command.authorization.changedInputs)
    && command.authorization.changedInputs.every((item) => boundedString(item, 16_384))
    && Number.isSafeInteger(command.authorization.supersededCount)
    && command.authorization.supersededCount >= 0
  );
  if (
    !isObject(value)
    || !exactKeys(value, ['schemaVersion', 'moduleId', 'kind', 'skill', 'manual', 'command'])
    || value.schemaVersion !== 1
    || typeof value.moduleId !== 'string'
    || !['skill', 'manual', 'command', 'observe'].includes(value.kind)
    || !skillValid
    || !manualValid
    || !commandValid
    || (value.kind === 'skill') !== (value.skill !== null)
    || (value.kind === 'manual') !== (value.manual !== null)
    || (value.kind === 'command') !== (value.command !== null)
  ) throw new Error('Module run preview is invalid.');
  return value;
}

export function requireModuleTaskStartRequest(value) {
  if (!isObject(value) || !exactKeys(value, [
    'moduleId', 'attemptId', 'gateId', 'consent', 'cols', 'rows',
  ])) throw new Error('Module task start request is invalid.');
  if (
    [value.moduleId, value.attemptId, value.gateId].some((item) => (
      typeof item !== 'string' || item.length === 0 || item.length > 512
    ))
    || !['once', 'always'].includes(value.consent)
    || !validTerminalDimensions(value.cols, value.rows)
  ) {
    throw new Error('Module task start request is invalid.');
  }
  return value;
}

export function requireModuleAttestationRequest(value) {
  if (!isObject(value) || !exactKeys(value, [
    'moduleId', 'attemptId', 'gateId', 'outcome', 'summary', 'confirmationLabel',
  ])) throw new Error('Module attestation request is invalid.');
  if (
    [value.moduleId, value.attemptId, value.gateId].some((item) => (
      typeof item !== 'string' || item.length === 0 || item.length > 512
    ))
    ||
    !['PASS', 'FAIL', 'NOT_APPLICABLE'].includes(value.outcome)
    || typeof value.summary !== 'string'
    || value.summary.trim().length === 0
    || value.summary.length > 8_192
    || typeof value.confirmationLabel !== 'string'
    || value.confirmationLabel.trim().length === 0
    || value.confirmationLabel.length > 512
  ) throw new Error('Module attestation request is invalid.');
  return value;
}

export function requireModuleTaskId(value) {
  if (typeof value !== 'string' || !/^module_task_[A-Za-z0-9_-]{1,128}$/u.test(value)) {
    throw new Error('Module task ID is invalid.');
  }
  return value;
}

export function requireModuleTaskSession(value) {
  if (
    !isObject(value)
    || !exactKeys(value, [
      'schemaVersion', 'id', 'kind', 'name', 'moduleId', 'moduleVersion', 'moduleDigest',
      'attemptId', 'gateId', 'projectPath', 'projectName', 'status', 'cols', 'rows', 'output', 'startedAt',
      'finishedAt', 'exit', 'result', 'structuredOutput', 'error',
    ])
    || value.schemaVersion !== 1
    || value.kind !== 'module-task'
    || requireModuleTaskId(value.id) !== value.id
    || ![value.name, value.moduleId, value.moduleVersion, value.projectName, value.startedAt]
      .every((item) => boundedString(item, 512))
    || !boundedString(value.projectPath)
    || !MODULE_DIGEST_PATTERN.test(value.moduleDigest)
    || ![value.attemptId, value.gateId, value.finishedAt, value.error]
      .every((item) => item === null || typeof item === 'string')
    || !MODULE_TASK_STATUSES.has(value.status)
    || !validTerminalDimensions(value.cols, value.rows)
    || typeof value.output !== 'string'
    || value.output.length > 1_000_000
    || (value.exit !== null && (
      !isObject(value.exit)
      || !exactKeys(value.exit, ['code', 'signal'])
      || (value.exit.code !== null && !Number.isInteger(value.exit.code))
      || (value.exit.signal !== null && !Number.isInteger(value.exit.signal))
    ))
    || (value.result !== null && (
      !isObject(value.result)
      || !exactKeys(value.result, ['attemptStatus', 'outcome', 'reason'])
      || !MODULE_TASK_STATUSES.has(value.result.attemptStatus)
      || !['UNSET', 'PASS', 'FAIL'].includes(value.result.outcome)
      || !boundedString(value.result.reason, 8_192)
    ))
    || (value.structuredOutput !== null && (
      !isObject(value.structuredOutput)
      || value.structuredOutput.schemaVersion !== 1
      || Object.keys(value.structuredOutput).some((key) => !['schemaVersion', 'detail', 'evidence'].includes(key))
      || (value.structuredOutput.detail !== undefined && typeof value.structuredOutput.detail !== 'string')
    ))
  ) throw new Error('Module task session is invalid.');
  return value;
}

export function requireModuleTaskList(value) {
  if (!Array.isArray(value) || value.some((item) => requireModuleTaskSession(item) !== item)) {
    throw new Error('Module task list is invalid.');
  }
  return value;
}

export function requireModuleTaskSessionRequest(value) {
  if (!isObject(value) || !exactKeys(value, ['sessionId'])) throw new Error('Module task request is invalid.');
  return { sessionId: requireModuleTaskId(value.sessionId) };
}

export function requireModuleTaskInputRequest(value) {
  if (!isObject(value) || !exactKeys(value, ['sessionId', 'data']) || typeof value.data !== 'string' || value.data.length < 1 || value.data.length > 65_536) {
    throw new Error('Module task input is invalid.');
  }
  return { sessionId: requireModuleTaskId(value.sessionId), data: value.data };
}

export function requireModuleTaskResizeRequest(value) {
  if (!isObject(value) || !exactKeys(value, ['sessionId', 'cols', 'rows']) || !validTerminalDimensions(value.cols, value.rows)) {
    throw new Error('Module task resize request is invalid.');
  }
  return { sessionId: requireModuleTaskId(value.sessionId), cols: value.cols, rows: value.rows };
}

export function requireModuleTaskEvent(value) {
  if (!isObject(value) || value.schemaVersion !== 1 || typeof value.type !== 'string') {
    throw new Error('Module task event is invalid.');
  }
  if (value.type === 'data' && exactKeys(value, ['schemaVersion', 'type', 'sessionId', 'data'])) {
    requireModuleTaskId(value.sessionId);
    if (typeof value.data !== 'string' || value.data.length > 1_000_000) throw new Error('Module task event is invalid.');
    return value;
  }
  if (['started', 'terminating', 'finished'].includes(value.type) && exactKeys(value, ['schemaVersion', 'type', 'session'])) {
    requireModuleTaskSession(value.session);
    return value;
  }
  throw new Error('Module task event is invalid.');
}
