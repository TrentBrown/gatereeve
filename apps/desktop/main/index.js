// @ts-check

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Notification,
  protocol,
  session,
  shell,
} from 'electron';

import { createDesktopCoordinator } from './coordinator.js';
import { registerDesktopIpc } from './ipc.js';
import { createPreferenceStore } from './preferences.js';
import { createProtocolAdapter } from './protocol-adapter.js';
import { registerRendererProtocol } from './renderer-protocol.js';
import {
  bindFocusRefresh,
  browserWindowOptions,
  RENDERER_URL,
  secureWindowNavigation,
} from './window.js';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
  const coordinator = createDesktopCoordinator({
    protocol: createProtocolAdapter(),
    preferenceStore,
    initialPreferences,
    notify({ title, body }) {
      if (!Notification.isSupported()) return;
      new Notification({ title, body }).show();
    },
  });
  registerRendererProtocol(protocol, resolve(desktopRoot, 'renderer'), {
    readArtifact: (artifactId) => coordinator.read('artifact', artifactId),
  });
  const window = new BrowserWindow(browserWindowOptions(
    resolve(desktopRoot, 'preload', 'index.cjs'),
    initialPreferences.window,
  ));
  secureWindowNavigation(window);
  bindFocusRefresh(window, coordinator);
  registerDesktopIpc({
    ipcMain,
    coordinator,
    async pickWorktree() {
      const result = await dialog.showOpenDialog({
        title: 'Choose a GateReeve feature worktree',
        buttonLabel: 'Open worktree',
        properties: ['openDirectory'],
      });
      return result.canceled ? null : result.filePaths[0] ?? null;
    },
    openPath: (path) => shell.openPath(path),
    revealPath: (path) => shell.showItemInFolder(path),
    copyText: (value) => clipboard.writeText(value),
    windows: () => BrowserWindow.getAllWindows(),
  });
  window.on('resized', () => void coordinator.saveWindow(window.getBounds()));
  window.on('moved', () => void coordinator.saveWindow(window.getBounds()));
  app.once('before-quit', () => coordinator.close());
  window.once('ready-to-show', () => window.show());
  await window.loadURL(RENDERER_URL);
  await coordinator.initialize();
  if (process.env.GATEREEVE_DESKTOP_SMOKE === '1') {
    const passed = await window.webContents.executeJavaScript(
      `Boolean(window.gatereeveDesktop && document.querySelector('h1')?.textContent === 'GateReeve')`,
    );
    if (!passed) throw new Error('Renderer smoke contract failed.');
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
