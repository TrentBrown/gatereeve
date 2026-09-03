const MAIN_VIEWS = Object.freeze(['overview', 'modules', 'artifacts', 'history', 'model', 'session']);
const DEFAULT_INSPECTOR_WIDTH = 420;
const MIN_INSPECTOR_WIDTH = 300;
const MAX_INSPECTOR_WIDTH = 720;

function clampWidth(value) {
  const width = Number.isFinite(Number(value)) ? Number(value) : DEFAULT_INSPECTOR_WIDTH;
  return Math.min(MAX_INSPECTOR_WIDTH, Math.max(MIN_INSPECTOR_WIDTH, Math.round(width)));
}

function createWorkspace() {
  return {
    schemaVersion: 1,
    mainView: 'overview',
    selectedFeatureState: null,
    selectedSliceId: null,
    selectedAttemptId: null,
    selectedGateId: null,
    sidebarVisible: true,
    terminalVisible: false,
    inspectorVisible: false,
    inspectorWidth: DEFAULT_INSPECTOR_WIDTH,
    tabs: [],
    activeTabId: null,
  };
}

function documentTab(artifact) {
  const identity = artifact.path ?? artifact.id;
  return {
    id: `document:${identity}`,
    kind: 'artifact',
    artifactId: artifact.id,
    path: artifact.path ?? null,
    label: artifact.label,
    format: artifact.format ?? null,
    status: artifact.status ?? (artifact.exists ? 'present' : 'missing'),
    available: artifact.exists === true && artifact.unsafe !== true,
  };
}

function virtualTab({ attemptId, gate }) {
  return {
    id: `gate:${attemptId}:${gate.id}`,
    kind: 'gate',
    attemptId,
    gateId: gate.id,
    label: `${gate.orderLabel ? `${gate.orderLabel} · ` : ''}${gate.id}`,
    status: gate.outcome ?? 'UNSET',
    available: true,
  };
}

function moduleTab(module) {
  return {
    id: `module:${module.id}`,
    kind: 'module',
    moduleId: module.id,
    slot: module.slot,
    label: module.label,
    status: module.live?.status ?? module.readiness?.status ?? 'unknown',
    available: true,
  };
}

export function createWorkspaceStore() {
  const workspaces = new Map();

  function ensure(projectPath) {
    if (typeof projectPath !== 'string' || projectPath.length === 0) return createWorkspace();
    if (!workspaces.has(projectPath)) workspaces.set(projectPath, createWorkspace());
    return workspaces.get(projectPath);
  }

  function update(projectPath, values) {
    const workspace = ensure(projectPath);
    Object.assign(workspace, values);
    return workspace;
  }

  return {
    get: ensure,
    discard(projectPath) {
      workspaces.delete(projectPath);
    },
    setMainView(projectPath, view) {
      if (!MAIN_VIEWS.includes(view)) throw new TypeError(`Unknown main view: ${view}`);
      return update(projectPath, { mainView: view });
    },
    setHierarchy(projectPath, values) {
      return update(projectPath, values);
    },
    toggleSidebar(projectPath, visible = undefined) {
      const workspace = ensure(projectPath);
      workspace.sidebarVisible = visible ?? !workspace.sidebarVisible;
      return workspace;
    },
    toggleTerminal(projectPath, visible = undefined) {
      const workspace = ensure(projectPath);
      workspace.terminalVisible = visible ?? !workspace.terminalVisible;
      return workspace;
    },
    toggleInspector(projectPath, visible = undefined) {
      const workspace = ensure(projectPath);
      workspace.inspectorVisible = visible ?? !workspace.inspectorVisible;
      return workspace;
    },
    setInspectorWidth(projectPath, width) {
      return update(projectPath, { inspectorWidth: clampWidth(width) });
    },
    openArtifact(projectPath, artifact) {
      const workspace = ensure(projectPath);
      const tab = documentTab(artifact);
      const existing = workspace.tabs.findIndex((item) => item.id === tab.id);
      if (existing === -1) workspace.tabs.push(tab);
      else workspace.tabs[existing] = { ...workspace.tabs[existing], ...tab };
      workspace.activeTabId = tab.id;
      workspace.inspectorVisible = true;
      return workspace;
    },
    openGate(projectPath, attemptId, gate) {
      const workspace = ensure(projectPath);
      const tab = virtualTab({ attemptId, gate });
      const existing = workspace.tabs.findIndex((item) => item.id === tab.id);
      if (existing === -1) workspace.tabs.push(tab);
      else workspace.tabs[existing] = tab;
      workspace.activeTabId = tab.id;
      workspace.inspectorVisible = true;
      return workspace;
    },
    openModule(projectPath, module) {
      const workspace = ensure(projectPath);
      const tab = moduleTab(module);
      const existing = workspace.tabs.findIndex((item) => item.id === tab.id);
      if (existing === -1) workspace.tabs.push(tab);
      else workspace.tabs[existing] = tab;
      workspace.activeTabId = tab.id;
      workspace.inspectorVisible = true;
      return workspace;
    },
    activateTab(projectPath, tabId) {
      const workspace = ensure(projectPath);
      if (workspace.tabs.some((item) => item.id === tabId)) workspace.activeTabId = tabId;
      return workspace;
    },
    closeTab(projectPath, tabId) {
      const workspace = ensure(projectPath);
      const index = workspace.tabs.findIndex((item) => item.id === tabId);
      if (index === -1) return workspace;
      workspace.tabs.splice(index, 1);
      if (workspace.activeTabId === tabId) {
        workspace.activeTabId = workspace.tabs[Math.min(index, workspace.tabs.length - 1)]?.id ?? null;
      }
      return workspace;
    },
    reconcile(projectPath, artifacts) {
      const workspace = ensure(projectPath);
      for (let index = 0; index < workspace.tabs.length; index += 1) {
        const tab = workspace.tabs[index];
        if (tab.kind !== 'artifact') continue;
        const artifact = artifacts.find((item) => (
          (tab.path !== null && item.path === tab.path) || item.id === tab.artifactId
        ));
        workspace.tabs[index] = artifact
          ? { ...tab, ...documentTab(artifact), id: tab.id }
          : { ...tab, status: 'unavailable', available: false };
      }
      return workspace;
    },
    snapshot(projectPath) {
      const workspace = ensure(projectPath);
      return JSON.parse(JSON.stringify(workspace));
    },
  };
}

export const workspaceDefaults = Object.freeze({
  mainViews: MAIN_VIEWS,
  inspectorWidth: DEFAULT_INSPECTOR_WIDTH,
  minInspectorWidth: MIN_INSPECTOR_WIDTH,
  maxInspectorWidth: MAX_INSPECTOR_WIDTH,
});
