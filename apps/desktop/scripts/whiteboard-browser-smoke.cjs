const { app, BrowserWindow, session } = require('electron');
const { resolve } = require('node:path');

const htmlPath = resolve(__dirname, '../test/fixtures/whiteboard-browser-smoke.html');

(async () => {
  const errors = [];
  const externalRequests = [];
  await app.whenReady();
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    externalRequests.push(details.url);
    callback({ cancel: true });
  });
  const window = new BrowserWindow({
    show: false,
    width: 390,
    height: 720,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) errors.push(message);
  });
  window.webContents.on('render-process-gone', (_event, details) => errors.push(`renderer:${details.reason}`));

  try {
    await window.loadFile(htmlPath);
    const result = await window.webContents.executeJavaScript(`(() => {
      const primary = document.querySelector('[data-challenge-id]');
      const layers = [...primary.querySelectorAll('details[data-layer]')];
      const harder = document.querySelector('[data-push-harder-id]');
      layers.forEach((layer) => layer.querySelector(':scope > summary').click());
      harder.querySelector(':scope > summary').click();
      const visual = document.querySelector('[data-visual-id] svg');
      return {
        ready: document.documentElement.dataset.whiteboardReady,
        primaryOpen: layers.every((layer) => layer.open),
        harderOpen: harder.open,
        layers: layers.length,
        findingTarget: document.querySelector('#defense-findings a').getAttribute('href'),
        visualRole: visual.getAttribute('role'),
        visualDescription: visual.querySelector('desc')?.textContent,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    })()`);
    process.stdout.write(`${JSON.stringify({ result, errors, externalRequests })}\n`);
    app.exit(0);
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    app.exit(1);
  }
})().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  app.exit(1);
});
