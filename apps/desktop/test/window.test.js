import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { browserWindowOptions, RENDERER_URL, secureWindowNavigation } from '../main/window.js';

test('Electron window uses process isolation and denies embedded web content', () => {
  const options = browserWindowOptions('/app/preload.cjs');
  assert.equal(options.minWidth, 760);
  assert.equal(options.minHeight, 560);
  assert.equal(options.webPreferences.contextIsolation, true);
  assert.equal(options.webPreferences.nodeIntegration, false);
  assert.equal(options.webPreferences.sandbox, true);
  assert.equal(options.webPreferences.webviewTag, false);
  assert.equal(options.webPreferences.webSecurity, true);
});

test('window navigation is confined to the application URL', () => {
  const webContents = new EventEmitter();
  let handler;
  webContents.setWindowOpenHandler = (value) => { handler = value; };
  secureWindowNavigation({ webContents });
  assert.deepEqual(handler({ url: 'https://example.com' }), { action: 'deny' });
  let prevented = false;
  webContents.emit('will-navigate', { preventDefault() { prevented = true; } }, 'https://example.com');
  assert.equal(prevented, true);
  prevented = false;
  webContents.emit('will-navigate', { preventDefault() { prevented = true; } }, RENDERER_URL);
  assert.equal(prevented, false);
});
