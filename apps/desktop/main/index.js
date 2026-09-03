// @ts-check

import { dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  Notification,
  protocol,
  session,
  shell,
} from 'electron';

import { createDesktopCoordinator } from './coordinator.js';
import { createModulePolicyManager } from './module-policy.js';
import { createCommandAuthorizationStore } from './command-authorization.js';
import { createModuleExecutionManager } from './module-execution.js';
import { createModuleTaskManager } from './module-task-manager.js';
import { createProviderSupervisor, discoverInstalledProviders } from './module-providers.js';
import { createArtifactActions, createEditorPreferenceStore } from './artifact-actions.js';
import { IPC_CHANNELS } from '../shared/contracts.js';
import {
  discoverCompatiblePythonExecutable,
  discoverDesktopExecutables,
} from './executable-discovery.js';
import { observeGit } from './git-observer.js';
import { observeGitHub } from './github-observer.js';
import { registerDesktopIpc } from './ipc.js';
import { createPreferenceStore } from './preferences.js';
import { createProtocolAdapter } from './protocol-adapter.js';
import { loadDefaultModel } from '../resources/protocol/model.js';
import { registerRendererProtocol } from './renderer-protocol.js';
import { createSetupObserver, createUnconfiguredSetup } from './setup-observer.js';
import { createTerminalManager } from './terminal-manager.js';
import { accountUserInfo, killPtyProcessGroup, spawnPty } from './terminal-pty.js';
import {
  bindTerminalQuitGuard,
  bindTerminalWindowCloseGuard,
  confirmProjectTerminalTermination,
  confirmQuitTerminalTermination,
} from './terminal-lifecycle.js';
import { createUpdateCacheStore } from './update-cache.js';
import { createUpdateCoordinator } from './update-coordinator.js';
import {
  bindFocusRefresh,
  browserWindowOptions,
  applicationMenuTemplate,
  RENDERER_URL,
  secureWindowNavigation,
} from './window.js';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const execute = promisify(execFile);

if (process.env.GATEREEVE_DESKTOP_SMOKE_USER_DATA) {
  app.setPath('userData', resolve(process.env.GATEREEVE_DESKTOP_SMOKE_USER_DATA));
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'gatereeve-app',
    privileges: {
      corsEnabled: false,
      secure: true,
      standard: true,
      supportFetchAPI: true,
    },
  },
  {
    scheme: 'gatereeve-artifact',
    privileges: {
      corsEnabled: false,
      secure: true,
      standard: true,
      supportFetchAPI: false,
    },
  },
]);
app.enableSandbox();
app.whenReady().then(startDesktop).catch(reportStartupFailure);
app.on('window-all-closed', () => app.quit());

async function startDesktop() {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  const preferenceStore = createPreferenceStore(app.getPath('userData'));
  const initialPreferences = await preferenceStore.load();
  const [executables, pythonExecutable] = await Promise.all([
    discoverDesktopExecutables(),
    discoverCompatiblePythonExecutable(),
  ]);
  const setupCompatibility = JSON.parse(await readFile(
    resolve(desktopRoot, 'shared', 'setup-compatibility.json'),
    'utf8',
  ));
  const unconfiguredSetup = createUnconfiguredSetup(setupCompatibility);
  const bundledModel = await loadDefaultModel();
  const providerAllowlist = JSON.parse(await readFile(
    resolve(desktopRoot, 'main', 'provider-allowlist.json'),
    'utf8',
  ));
  if (providerAllowlist.schemaVersion !== 1 || !Array.isArray(providerAllowlist.providers)) {
    throw new Error('The installed provider allowlist is invalid.');
  }
  const installedProviderResult = await discoverInstalledProviders(
    resolve(desktopRoot, 'main', 'providers'),
    providerAllowlist.providers,
  );
  const installedProviders = installedProviderResult.providers;
  const bundledSkillIds = bundledModel.moduleGraph.modules
    .filter((module) => module.run?.kind === 'skill')
    .map((module) => module.run.skillId);
  let coordinator;
  const modulePolicyManager = createModulePolicyManager({
    getAvailability: async () => ({
      skills: coordinator?.current().setup.operationalReady ? bundledSkillIds : [],
      providers: installedProviders.map(({ id, version }) => ({ id, version })),
    }),
  });
  const protocolAdapter = createProtocolAdapter({
    gitExecutable: executables.git,
    ghExecutable: executables.gh,
    pythonExecutable,
  });
  coordinator = createDesktopCoordinator({
    protocol: protocolAdapter,
    modulePolicyManager,
    preferenceStore,
    initialPreferences,
    initialSetup: initialPreferences.selectedAgents.length === 0
      ? unconfiguredSetup
      : {
        ...unconfiguredSetup,
        phase: 'checking',
        selectedAgents: initialPreferences.selectedAgents,
      },
    setupObserver: createSetupObserver({
      metadata: setupCompatibility,
      executablePaths: {
        git: executables.git,
        github: executables.gh,
        python: pythonExecutable,
      },
    }),
    gitObserver: (worktreePath, featureHome) => observeGit(
      worktreePath,
      featureHome,
      { gitExecutable: executables.git },
    ),
    githubObserver: (repositoryRoot, branch) => observeGitHub(
      repositoryRoot,
      branch,
      { ghExecutable: executables.gh },
    ),
    notify({ title, body }) {
      if (!Notification.isSupported()) return;
      new Notification({ title, body }).show();
    },
  });
  const updateCoordinator = createUpdateCoordinator({
    currentVersion: setupCompatibility.desktop.version,
    cacheStore: createUpdateCacheStore(app.getPath('userData')),
    notificationsEnabled: () => coordinator.current().preferences.notificationsEnabled,
    notify({ title, body }) {
      if (!Notification.isSupported()) return;
      new Notification({ title, body }).show();
    },
  });
  const artifactActions = createArtifactActions({
    homePath: app.getPath('home'),
    downloadsPath: app.getPath('downloads'),
    preferenceStore: createEditorPreferenceStore(app.getPath('userData')),
    gitExecutable: executables.git,
    openDefault: (path) => shell.openPath(path),
    openApplication: (applicationPath, path) => execute(
      '/usr/bin/open',
      ['-a', applicationPath, path],
      { timeout: 15_000 },
    ),
    async chooseApplication() {
      const result = await dialog.showOpenDialog({
        title: 'Choose an application',
        buttonLabel: 'Open',
        defaultPath: '/Applications',
        properties: ['openFile'],
        filters: [{ name: 'Applications', extensions: ['app'] }],
      });
      return result.canceled ? null : result.filePaths[0] ?? null;
    },
    async chooseSavePath(filename) {
      const result = await dialog.showSaveDialog({
        title: 'Save a copy',
        buttonLabel: 'Save Copy',
        defaultPath: join(app.getPath('documents'), filename),
      });
      return result.canceled ? null : result.filePath ?? null;
    },
    openExternal: (url) => shell.openExternal(url),
  });
  await artifactActions.initialize();
  const terminalManager = createTerminalManager({
    spawn: spawnPty,
    userInfo: accountUserInfo,
    killProcessGroup: killPtyProcessGroup,
  });
  const moduleTaskManager = createModuleTaskManager({
    spawn: spawnPty,
    killProcessGroup: killPtyProcessGroup,
  });
  const moduleExecutionManager = createModuleExecutionManager({
    protocol: protocolAdapter,
    authorizationStore: createCommandAuthorizationStore(app.getPath('userData'), {
      gitExecutable: executables.git,
    }),
    taskManager: moduleTaskManager,
    providerSupervisor: createProviderSupervisor(),
    providers: installedProviders,
    async onChanged({ task, projectPath, live, provider, providerError, error }) {
      if (live) await coordinator.setModuleLive(projectPath, task.moduleId, live);
      else if (provider) await coordinator.setModuleLive(projectPath, task.moduleId, provider.live);
      else if (providerError) {
        await coordinator.setModuleLive(projectPath, task.moduleId, {
          status: 'unavailable',
          detail: providerError.message,
          updatedAt: new Date().toISOString(),
          stages: [], actions: [], attempts: [], evidence: [], links: [],
          failure: providerError,
        });
      } else if (error && projectPath) {
        const failure = {
          code: error.code ?? 'MODULE_COMPLETION_FAILED',
          message: error.message ?? String(error),
        };
        await coordinator.setModuleLive(projectPath, task.moduleId, {
          status: 'unavailable',
          detail: failure.message,
          updatedAt: new Date().toISOString(),
          stages: [], actions: [], attempts: [], evidence: [], links: [], failure,
        });
      } else await coordinator.refresh('module-runtime');
    },
  });
  const processManager = Object.freeze({
    hasLive(path) {
      return terminalManager.hasLive(path) || moduleTaskManager.liveProjects().includes(path);
    },
    liveProjects() {
      return [...new Set([...terminalManager.liveProjects(), ...moduleTaskManager.liveProjects()])];
    },
    discardProject(path) {
      terminalManager.discardProject(path);
      moduleTaskManager.discardProject(path);
    },
    close() {
      terminalManager.close();
      moduleTaskManager.close();
    },
  });
  registerRendererProtocol(protocol, resolve(desktopRoot, 'renderer'), {
    brandingAsset: resolve(
      desktopRoot,
      'assets/branding/gatereeve-rolling-vale.png',
    ),
    terminalAssets: {
      'vendor/xterm.mjs': resolve(desktopRoot, 'node_modules/@xterm/xterm/lib/xterm.mjs'),
      'vendor/xterm.css': resolve(desktopRoot, 'node_modules/@xterm/xterm/css/xterm.css'),
      'vendor/xterm-addon-fit.mjs': resolve(
        desktopRoot,
        'node_modules/@xterm/addon-fit/lib/addon-fit.mjs',
      ),
    },
    readArtifact: (artifactId) => coordinator.read('artifact', artifactId),
  });
  const window = new BrowserWindow(browserWindowOptions(
    resolve(desktopRoot, 'preload', 'index.cjs'),
    initialPreferences.window,
  ));
  secureWindowNavigation(window);
  bindFocusRefresh(window, coordinator);
  Menu.setApplicationMenu(Menu.buildFromTemplate(applicationMenuTemplate({
    onToggleSidebar: () => window.webContents.send(IPC_CHANNELS.layoutCommand, 'toggle-sidebar'),
    onToggleTerminal: () => window.webContents.send(IPC_CHANNELS.layoutCommand, 'toggle-terminal'),
    onToggleInspector: () => window.webContents.send(IPC_CHANNELS.layoutCommand, 'toggle-inspector'),
  })));
  const disposeDesktopIpc = registerDesktopIpc({
    ipcMain,
    coordinator,
    artifactActions,
    terminalManager,
    moduleTaskManager,
    moduleExecutionManager,
    processManager,
    updateCoordinator,
    async pickProject() {
      const result = await dialog.showOpenDialog({
        title: 'Choose a GateReeve project',
        buttonLabel: 'Add project',
        properties: ['openDirectory'],
      });
      return result.canceled ? null : result.filePaths[0] ?? null;
    },
    revealPath: (path) => shell.showItemInFolder(path),
    copyText: (value) => clipboard.writeText(value),
    openExternal: (url) => shell.openExternal(url),
    confirmProjectTermination: (projectName) => confirmProjectTerminalTermination(
      dialog,
      window,
      projectName,
    ),
    windows: () => BrowserWindow.getAllWindows(),
  });
  window.on('resized', () => void coordinator.saveWindow(window.getBounds()));
  window.on('moved', () => void coordinator.saveWindow(window.getBounds()));
  bindTerminalQuitGuard({
    app,
    terminalManager: processManager,
    confirmQuit: (projectCount) => confirmQuitTerminalTermination(dialog, window, projectCount),
    cleanup() {
      disposeDesktopIpc();
      moduleExecutionManager.close();
      processManager.close();
      coordinator.close();
      updateCoordinator.close();
    },
  });
  bindTerminalWindowCloseGuard({
    window,
    terminalManager: processManager,
    confirmQuit: (projectCount) => confirmQuitTerminalTermination(dialog, window, projectCount),
  });
  window.once('ready-to-show', () => window.show());
  await window.loadURL(RENDERER_URL);
  void updateCoordinator.initialize();
  await coordinator.initialize();
  if (process.env.GATEREEVE_DESKTOP_SMOKE === '1') {
    window.setSize(940, 560);
    const smokeWorktree = process.env.GATEREEVE_DESKTOP_SMOKE_WORKTREE;
    let expectedFeatureId = null;
    if (smokeWorktree) {
      const state = await coordinator.open(smokeWorktree);
      if (
        state.phase !== 'ready'
        || state.snapshot === null
        || state.snapshot.mode !== 'governed'
      ) {
        throw new Error(
          `Governed fixture smoke failed: ${state.error?.message ?? 'no governed snapshot'}`
        );
      }
      expectedFeatureId = state.snapshot.featureId;
    }
    const smoke = await window.webContents.executeJavaScript(
      `new Promise((resolve) => {
        let attempts = 0;
        let setupObserved = false;
        let shellObserved = false;
        let shellChecked = false;
        let shellEvidence = null;
        let terminalRequested = false;
        let terminalRunningObserved = false;
        let terminalTerminateRequested = false;
        let terminalObserved = ${expectedFeatureId === null ? 'true' : 'false'};
        const inspect = () => {
          if (!setupObserved && document.querySelector('#open-setup')) {
            document.querySelector('#open-setup').click();
            setupObserved = Boolean(
              document.querySelector('#setup-shell')?.hidden === false
              && document.querySelector('#setup-title')?.textContent === 'GateReeve Setup'
              && document.querySelector('#agent-codex')
              && document.querySelector('#agent-claude')
            );
            if (setupObserved && document.querySelector('#setup-return')?.hidden === false) {
              document.querySelector('#setup-return').click();
            }
          }
          if (!shellChecked && document.querySelector('#workspace')?.dataset.featureId) {
            shellChecked = true;
            document.querySelector('#workspace').style.transition = 'none';
            const sidebarToggle = document.querySelector('#toggle-sidebar');
            const inspectorToggle = document.querySelector('#toggle-inspector');
            const selectedProject = document.querySelector('[role="option"][aria-selected="true"]');
            const mainTabs = [...document.querySelectorAll('#main-tabs .main-tab')];
            const initialProject = selectedProject?.textContent;
            sidebarToggle?.click();
            const sidebarHidden = document.querySelector('#project-sidebar')?.hidden === true;
            sidebarToggle?.click();
            const sidebarRestored = Boolean(
              document.querySelector('#project-sidebar')?.hidden === false
              && document.activeElement?.getAttribute('role') === 'option'
              && document.querySelector('[role="option"][aria-selected="true"]')?.textContent === initialProject
            );
            const inspector = document.querySelector('#inspector-panel');
            const resizer = document.querySelector('#inspector-resizer');
            if (inspector?.hidden === false) inspectorToggle?.click();
            const inspectorBaselineHidden = inspector?.hidden === true;
            inspectorToggle?.click();
            const inspectorShown = inspector?.hidden === false;
            const initialWidth = Number(resizer?.getAttribute('aria-valuenow'));
            resizer?.focus();
            resizer?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
            const resizedWidth = Number(resizer?.getAttribute('aria-valuenow'));
            resizer?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
            const maximumRequestedWidth = Number(resizer?.getAttribute('aria-valuenow'));
            const maximumRenderedWidth = Math.round(inspector?.getBoundingClientRect().width ?? 0);
            const maximumWidthScroll = document.documentElement.scrollWidth;
            resizer?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
            for (let index = 0; index < 5; index += 1) {
              resizer?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
            }
            const restoredWidth = Number(resizer?.getAttribute('aria-valuenow'));
            inspectorToggle?.click();
            const inspectorHidden = inspector?.hidden === true;
            inspectorToggle?.click();
            const inspectorRestored = Boolean(
              inspector?.hidden === false
              && resizedWidth === initialWidth - 20
              && document.activeElement === document.querySelector('#artifact-viewer')
            );
            const tabLabels = mainTabs.map((tab) => tab.textContent).join('|');
            const versionText = document.querySelector('#brand-version')?.textContent;
            const scrollWidth = document.documentElement.scrollWidth;
            const viewportWidth = window.innerWidth;
            const workspace = document.querySelector('#workspace');
            const workspaceChildren = workspace
              ? [...workspace.children].map((element) => {
                  const rect = element.getBoundingClientRect();
                  return {
                    element: element.id ? '#' + element.id : element.tagName.toLowerCase(),
                    hidden: element.hidden,
                    left: Math.round(rect.left),
                    right: Math.round(rect.right),
                    width: Math.round(rect.width),
                    scrollWidth: element.scrollWidth,
                    minWidth: getComputedStyle(element).minWidth,
                  };
                })
              : [];
            const overflowers = [...document.querySelectorAll('body *')]
              .map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  element: element.id
                    ? '#' + element.id
                    : element.tagName.toLowerCase() + '.' + element.className,
                  left: Math.round(rect.left),
                  right: Math.round(rect.right),
                  width: Math.round(rect.width),
                  scrollWidth: element.scrollWidth,
                  clientWidth: element.clientWidth,
                };
              })
              .filter((item) => item.right > viewportWidth + 1 || item.left < -1)
              .slice(0, 12);
            shellEvidence = {
              sidebarHidden,
              sidebarRestored,
              inspectorBaselineHidden,
              inspectorShown,
              inspectorHidden,
              inspectorRestored,
              initialWidth,
              resizedWidth,
              maximumRequestedWidth,
              maximumRenderedWidth,
              maximumWidthScroll,
              restoredWidth,
              tabLabels,
              versionText,
              scrollWidth,
              viewportWidth,
              documentScrollLeft: document.documentElement.scrollLeft,
              inspectorWidthProperty: workspace
                ? getComputedStyle(workspace).getPropertyValue('--inspector-width')
                : null,
              inspectorWidthInline: workspace?.style.getPropertyValue('--inspector-width') ?? null,
              workspaceGridColumns: workspace ? getComputedStyle(workspace).gridTemplateColumns : null,
              workspaceChildren,
              overflowers,
              activeElement: document.activeElement?.id ?? document.activeElement?.getAttribute('role') ?? null,
            };
            const inspectorRenderedWidth = workspaceChildren
              .find((item) => item.element === '#inspector-panel')?.width ?? 0;
            shellObserved = Boolean(
              sidebarHidden
              && sidebarRestored
              && inspectorBaselineHidden
              && inspectorShown
              && inspectorHidden
              && inspectorRestored
              && maximumRequestedWidth === 720
              && maximumRenderedWidth < maximumRequestedWidth
              && maximumWidthScroll <= viewportWidth
              && restoredWidth === resizedWidth
              && mainTabs.length === 6
              && tabLabels === 'Overview|Modules|Artifacts|History|Model|Session'
              && versionText === ${JSON.stringify(`v${app.getVersion()}`)}
              && scrollWidth <= viewportWidth
              && viewportWidth <= 940
              && inspectorRenderedWidth >= resizedWidth - 1
            );
          }
          if (shellObserved && !terminalRequested && ${expectedFeatureId === null ? 'false' : 'true'}) {
            terminalRequested = true;
            document.querySelector('#toggle-terminal')?.click();
          }
          if (terminalRequested && !terminalObserved) {
            const terminalPanel = document.querySelector('#terminal-panel');
            const terminalStatus = document.querySelector('#terminal-status');
            if (
              terminalPanel?.hidden === false
              && terminalStatus?.dataset.status === 'running'
              && document.querySelector('#terminal-hosts .xterm')
            ) {
              terminalRunningObserved = true;
            }
            if (terminalRunningObserved && !terminalTerminateRequested) {
              terminalTerminateRequested = true;
              document.querySelector('#terminal-terminate')?.click();
            }
            terminalObserved = Boolean(
              terminalRunningObserved
              && terminalStatus?.dataset.status === 'exited'
              && document.querySelector('#terminal-restart')?.hidden === false
            );
          }
          const ready = Boolean(
            setupObserved
            && shellObserved
            && terminalObserved
            &&
            window.gatereeveDesktop
            && document.querySelector('h1')?.textContent === 'GateReeve'
            && ${expectedFeatureId === null
              ? 'true'
              : `document.querySelector('#workspace')?.hidden === false
                && document.querySelector('#workspace')?.dataset.featureId === ${JSON.stringify(expectedFeatureId)}`}
          );
          const evidence = {
            setupObserved,
            shellObserved,
            shellChecked,
            shellEvidence,
            terminalRequested,
            terminalRunningObserved,
            terminalTerminateRequested,
            terminalObserved,
            heading: document.querySelector('h1')?.textContent ?? null,
            projectContext: document.querySelector('#workspace')?.dataset.featureId ?? null,
          };
          if (ready || (shellChecked && !shellObserved) || attempts >= 120) {
            resolve({ passed: ready, evidence });
          }
          else {
            attempts += 1;
            requestAnimationFrame(inspect);
          }
        };
        inspect();
      })`,
    );
    if (!smoke.passed) {
      throw new Error(`Renderer and Setup smoke contract failed: ${JSON.stringify(smoke.evidence)}`);
    }
    if (process.env.GATEREEVE_DESKTOP_SMOKE_SCREENSHOT) {
      const image = await window.webContents.capturePage();
      await writeFile(resolve(process.env.GATEREEVE_DESKTOP_SMOKE_SCREENSHOT), image.toPNG());
    }
    app.quit();
  }
}

function reportStartupFailure(error) {
  process.stderr.write(
    `[gatereeve-desktop] startup failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  app.exit(1);
}
