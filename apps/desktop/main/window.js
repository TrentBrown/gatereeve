// @ts-check

export const RENDERER_URL = 'gatereeve-app://desktop/index.html';

export function browserWindowOptions(preload, geometry = null) {
  return {
    width: geometry?.width ?? 1180,
    height: geometry?.height ?? 780,
    ...(geometry ? { x: geometry.x, y: geometry.y } : {}),
    minWidth: 940,
    minHeight: 560,
    show: false,
    title: 'GateReeve',
    backgroundColor: '#f5f2fb',
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      experimentalFeatures: false,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      preload,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
      webviewTag: false,
    },
  };
}

export function layoutAccelerators(platform = process.platform) {
  return {
    sidebar: 'CommandOrControl+B',
    terminal: platform === 'darwin' ? 'Command+J' : 'Control+J',
    inspector: platform === 'darwin' ? 'Command+Alt+B' : 'Control+Alt+B',
  };
}

export function applicationMenuTemplate({
  platform = process.platform,
  onToggleSidebar,
  onToggleTerminal,
  onToggleInspector,
}) {
  const accelerators = layoutAccelerators(platform);
  return [
    ...(platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        {
          label: 'Toggle Project Sidebar',
          accelerator: accelerators.sidebar,
          click: onToggleSidebar,
        },
        {
          label: 'Toggle Terminal',
          accelerator: accelerators.terminal,
          click: onToggleTerminal,
        },
        {
          label: 'Toggle Inspector',
          accelerator: accelerators.inspector,
          click: onToggleInspector,
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
}

export function secureWindowNavigation(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== RENDERER_URL) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
}

export function bindFocusRefresh(window, coordinator) {
  window.on('focus', () => void coordinator.focus());
}
