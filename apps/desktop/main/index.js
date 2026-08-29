// @ts-check

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
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
import { IPC_CHANNELS } from '../shared/contracts.js';
import { discoverDesktopExecutables } from './executable-discovery.js';
import { observeGit } from './git-observer.js';
import { observeGitHub } from './github-observer.js';
import { registerDesktopIpc } from './ipc.js';
import { createPreferenceStore } from './preferences.js';
import { createProtocolAdapter } from './protocol-adapter.js';
import { registerRendererProtocol } from './renderer-protocol.js';
import { createSetupObserver, createUnconfiguredSetup } from './setup-observer.js';
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
  const executables = await discoverDesktopExecutables();
  const setupCompatibility = JSON.parse(await readFile(
    resolve(desktopRoot, 'shared', 'setup-compatibility.json'),
    'utf8',
  ));
  const unconfiguredSetup = createUnconfiguredSetup(setupCompatibility);
  const coordinator = createDesktopCoordinator({
    protocol: createProtocolAdapter({ gitExecutable: executables.git }),
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
      executablePaths: { git: executables.git, github: executables.gh },
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
  registerRendererProtocol(protocol, resolve(desktopRoot, 'renderer'), {
    brandingAsset: resolve(
      desktopRoot,
      'assets/branding/gatereeve-rolling-vale.png',
    ),
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
    onToggleInspector: () => window.webContents.send(IPC_CHANNELS.layoutCommand, 'toggle-inspector'),
  })));
  registerDesktopIpc({
    ipcMain,
    coordinator,
    updateCoordinator,
    async pickProject() {
      const result = await dialog.showOpenDialog({
        title: 'Choose a GateReeve project',
        buttonLabel: 'Add project',
        properties: ['openDirectory'],
      });
      return result.canceled ? null : result.filePaths[0] ?? null;
    },
    openPath: (path) => shell.openPath(path),
    revealPath: (path) => shell.showItemInFolder(path),
    copyText: (value) => clipboard.writeText(value),
    openExternal: (url) => shell.openExternal(url),
    windows: () => BrowserWindow.getAllWindows(),
  });
  window.on('resized', () => void coordinator.saveWindow(window.getBounds()));
  window.on('moved', () => void coordinator.saveWindow(window.getBounds()));
  app.once('before-quit', () => {
    coordinator.close();
    updateCoordinator.close();
  });
  window.once('ready-to-show', () => window.show());
  await window.loadURL(RENDERER_URL);
  void updateCoordinator.initialize();
  await coordinator.initialize();
  if (process.env.GATEREEVE_DESKTOP_SMOKE === '1') {
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
    const passed = await window.webContents.executeJavaScript(
      `new Promise((resolve) => {
        let attempts = 0;
        let setupObserved = false;
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
          const ready = Boolean(
            setupObserved
            &&
            window.gatereeveDesktop
            && document.querySelector('h1')?.textContent === 'GateReeve'
            && ${expectedFeatureId === null
              ? 'true'
              : `document.querySelector('#workspace')?.hidden === false
                && document.querySelector('#project-context')?.textContent.includes(${JSON.stringify(expectedFeatureId)})`}
          );
          if (ready || attempts >= 120) resolve(ready);
          else {
            attempts += 1;
            requestAnimationFrame(inspect);
          }
        };
        inspect();
      })`,
    );
    if (!passed) throw new Error('Renderer and Setup smoke contract failed.');
    app.quit();
  }
}

function reportStartupFailure(error) {
  process.exitCode = 1;
  process.stderr.write(
    `[gatereeve-desktop] startup failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  app.quit();
}
