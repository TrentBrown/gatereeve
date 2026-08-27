import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

import { parseHTML } from 'linkedom';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function unconfiguredState() {
  return {
    schemaVersion: 1,
    phase: 'idle',
    refreshing: false,
    githubPolling: false,
    selection: null,
    snapshot: null,
    error: null,
    setup: {
      schemaVersion: 1,
      phase: 'unconfigured',
      operationalReady: false,
      checkedAt: null,
      desktop: { version: '0.1.0' },
      selectedAgents: [],
      prerequisites: [],
      agents: [],
    },
    preferences: { notificationsEnabled: false, recentWorktrees: [], selectedAgents: [] },
  };
}

function incompleteState() {
  const remediation = {
    summary: 'Install Git with its native owner.',
    command: 'brew install git',
    guideUrl: 'https://git-scm.com/download/mac',
  };
  return {
    ...unconfiguredState(),
    setup: {
      schemaVersion: 1,
      phase: 'incomplete',
      operationalReady: false,
      checkedAt: '2026-08-27T12:00:00.000Z',
      desktop: { version: '0.1.0' },
      selectedAgents: ['codex'],
      prerequisites: [{
        id: 'git', label: 'Git', status: 'missing', version: null,
        detail: 'Git was not found in Finder-compatible locations.', remediation,
      }],
      agents: [{
        id: 'codex', label: 'Codex', status: 'incomplete',
        cli: {
          status: 'missing', version: null, authenticated: null,
          detail: 'Codex was not found.', remediation: {
            summary: 'Install and authenticate Codex.', command: null,
            guideUrl: 'https://help.openai.com/en/articles/11096431',
          },
        },
        plugin: {
          status: 'not-checked', version: null, compatibility: 'not-checked', evidence: null,
          detail: 'Plugin installation was not checked.', recommendation: null, remediation: null,
        },
      }],
    },
    preferences: { notificationsEnabled: false, recentWorktrees: [], selectedAgents: ['codex'] },
  };
}

function mixedReadyState() {
  const agent = (id, status) => ({
    id,
    label: id === 'codex' ? 'Codex' : 'Claude Code',
    status,
    cli: {
      status: status === 'ready' ? 'present' : 'missing',
      version: status === 'ready' ? '0.150.1' : null,
      authenticated: status === 'ready' ? true : null,
      detail: status === 'ready' ? 'Codex is authenticated.' : 'Claude Code was not found.',
      remediation: null,
    },
    plugin: {
      status: status === 'ready' ? 'enabled' : 'not-checked',
      version: status === 'ready' ? '0.1.0-rc.2' : null,
      compatibility: status === 'ready' ? 'compatible' : 'not-checked',
      evidence: status === 'ready' ? 'portable' : null,
      detail: status === 'ready' ? 'Explicitly tested.' : 'Plugin was not checked.',
      recommendation: null,
      remediation: null,
    },
  });
  return {
    ...unconfiguredState(),
    setup: {
      schemaVersion: 1,
      phase: 'ready',
      operationalReady: true,
      checkedAt: '2026-08-27T12:00:00.000Z',
      desktop: { version: '0.1.0' },
      selectedAgents: ['codex', 'claude'],
      prerequisites: [],
      agents: [agent('codex', 'ready'), agent('claude', 'incomplete')],
    },
    preferences: {
      notificationsEnabled: false,
      recentWorktrees: [],
      selectedAgents: ['codex', 'claude'],
    },
  };
}

test('first launch presents persistent non-mutating Setup and preserves historical access', async () => {
  const html = await readFile(resolve(desktopRoot, 'renderer/index.html'), 'utf8');
  const { window } = parseHTML(html);
  const selections = [];
  const copied = [];
  window.gatereeveDesktop = {
    async getState() { return unconfiguredState(); },
    subscribe() { return () => {}; },
    async chooseWorktree() { return unconfiguredState(); },
    async openRecent() { return unconfiguredState(); },
    async refresh() { return unconfiguredState(); },
    async recheckSetup() { return incompleteState(); },
    async setSelectedAgents(value) { selections.push(value); return incompleteState(); },
    async setNotificationsEnabled() { return unconfiguredState(); },
    async copyText(value) { copied.push(value); return true; },
  };
  globalThis.window = window;
  globalThis.document = window.document;
  await import(`${pathToFileURL(resolve(desktopRoot, 'renderer/renderer.js')).href}?test=setup-renderer`);
  await new Promise((done) => setImmediate(done));

  assert.equal(window.document.querySelector('#setup-shell').hidden, false);
  assert.equal(window.document.querySelector('#chooser').hidden, true);
  assert.match(window.document.querySelector('#setup-summary').textContent, /No agent installation has been examined/);

  window.document.querySelector('#agent-codex').checked = true;
  window.document.querySelector('#agent-selection').dispatchEvent(new window.Event('submit'));
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(selections, [['codex']]);
  assert.match(window.document.querySelector('#setup-summary').textContent, /historical or offline/);
  assert.equal(window.document.querySelector('#historical-reading').hidden, false);
  assert.match(window.document.querySelector('#setup-prerequisites').textContent, /Finder-compatible/);

  window.document.querySelector('#setup-prerequisites button').click();
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(copied, ['brew install git']);

  delete globalThis.window;
  delete globalThis.document;
});

test('Setup names the ready path without hiding an incomplete selected agent', async () => {
  const html = await readFile(resolve(desktopRoot, 'renderer/index.html'), 'utf8');
  const { window } = parseHTML(html);
  const state = mixedReadyState();
  window.gatereeveDesktop = {
    async getState() { return state; },
    subscribe() { return () => {}; },
    async chooseWorktree() { return state; },
    async openRecent() { return state; },
    async refresh() { return state; },
    async recheckSetup() { return state; },
    async setSelectedAgents() { return state; },
    async setNotificationsEnabled() { return state; },
    async copyText() { return true; },
  };
  globalThis.window = window;
  globalThis.document = window.document;
  await import(`${pathToFileURL(resolve(desktopRoot, 'renderer/renderer.js')).href}?test=setup-mixed-ready`);
  await new Promise((done) => setImmediate(done));

  assert.match(window.document.querySelector('#setup-summary').textContent, /ready through Codex/);
  assert.match(window.document.querySelector('#setup-summary').textContent, /Claude Code still needs attention/);
  assert.equal(window.document.querySelector('#historical-reading').hidden, true);
  assert.match(window.document.querySelector('#setup-agents').textContent, /Claude Code/);

  delete globalThis.window;
  delete globalThis.document;
});
