import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

import { parseHTML } from 'linkedom';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function idleState() {
  return {
    schemaVersion: 1,
    phase: 'idle',
    refreshing: false,
    githubPolling: false,
    selection: null,
    snapshot: null,
    error: null,
    preferences: { recentWorktrees: ['/repo/recent'] },
  };
}

test('renderer presents selection first and then canonical observation status', async () => {
  const html = await readFile(resolve(desktopRoot, 'renderer/index.html'), 'utf8');
  const { window } = parseHTML(html);
  let subscriber;
  window.gatereeveDesktop = {
    async chooseWorktree() {},
    async openRecent() {},
    async refresh() {},
    async getState() { return idleState(); },
    subscribe(callback) { subscriber = callback; return () => {}; },
  };
  globalThis.window = window;
  globalThis.document = window.document;
  await import(`${pathToFileURL(resolve(desktopRoot, 'renderer/renderer.js')).href}?test=renderer`);
  await new Promise((done) => setImmediate(done));
  assert.equal(window.document.querySelector('#chooser').hidden, false);
  assert.equal(window.document.querySelector('#overview').hidden, true);
  assert.equal(window.document.querySelectorAll('.recent').length, 1);

  subscriber({
    ...idleState(),
    phase: 'ready',
    githubPolling: true,
    selection: { worktreePath: '/repo/current', featureHome: '/repo/current/docs/issues/feature' },
    snapshot: {
      schemaVersion: 1,
      mode: 'governed',
      featureId: 'feature',
      projection: { feature: { state: 'DELIVERING_SLICES' } },
      active: { sliceId: 'desktop-shell' },
      sources: {
        local: { status: 'current', detail: 'Local read' },
        git: { status: 'current', detail: 'Git topic' },
        github: { status: 'current', detail: 'PR open' },
      },
    },
  });
  assert.equal(window.document.querySelector('#chooser').hidden, true);
  assert.equal(window.document.querySelector('#overview').hidden, false);
  assert.equal(window.document.querySelector('#mode').textContent, 'governed');
  assert.equal(window.document.querySelector('#feature-state').textContent, 'DELIVERING_SLICES');
  assert.match(window.document.querySelector('#activity').textContent, /polling GitHub/);
  delete globalThis.window;
  delete globalThis.document;
});
