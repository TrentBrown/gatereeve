import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

import { parseHTML } from 'linkedom';

import { createProtocolAdapter } from '../main/protocol-adapter.js';
import { listSessionContext, readSessionContext } from '../main/session-observer.js';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(desktopRoot, '..', '..');
const featureHome = resolve(repositoryRoot, 'docs/issues/gatereeve-desktop');

async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((done) => setTimeout(done, 10));
  }
  assert.fail(`Timed out waiting for ${label}`);
}

test('renderer consumes the real canonical GateReeve feature without mutating its journal', async () => {
  const html = await readFile(resolve(desktopRoot, 'renderer/index.html'), 'utf8');
  const journalPath = resolve(featureHome, 'events.jsonl');
  const journalBefore = await readFile(journalPath, 'utf8');
  const protocol = createProtocolAdapter();
  const sources = {
    local: { status: 'current', detail: 'Local fixture', checkedAt: null },
    git: { status: 'not-checked', detail: null, checkedAt: null },
    github: { status: 'not-checked', detail: null, checkedAt: null },
  };
  const snapshot = await protocol.snapshot(featureHome, { sources });
  const state = {
    schemaVersion: 1,
    phase: 'ready',
    refreshing: false,
    githubPolling: false,
    selection: { worktreePath: repositoryRoot, featureHome },
    snapshot,
    error: null,
    setup: {
      schemaVersion: 1,
      phase: 'ready',
      operationalReady: true,
      checkedAt: '2026-08-27T12:00:00.000Z',
      desktop: { version: '0.1.0' },
      selectedAgents: ['codex'],
      prerequisites: [],
      agents: [{
      id: 'codex',
      label: 'Codex',
      status: 'ready',
      cli: {
        status: 'present', version: '0.150.1', authenticated: true,
        detail: 'Codex is authenticated.', remediation: null,
      },
      plugin: {
        status: 'enabled', version: '0.1.0', compatibility: 'matched',
        evidence: 'release', detail: 'Matched.', recommendation: null, remediation: null,
      },
    }],
    },
    preferences: { notificationsEnabled: false, projectPaths: [], selectedAgents: ['codex'] },
  };
  const { window } = parseHTML(html);
  window.gatereeveDesktop = {
    async checkForUpdates() { return {
      schemaVersion: 1, status: 'current', source: 'manual', currentVersion: '0.1.0',
      checkedAt: '2026-08-28T00:00:00.000Z', available: null,
      detail: 'GateReeve Desktop is current.',
    }; },
    async addProject() { return state; },
    async copyText() { return true; },
    async getState() { return state; },
    async getUpdateState() { return {
      schemaVersion: 1, status: 'idle', source: null, currentVersion: '0.1.0',
      checkedAt: null, available: null, detail: null,
    }; },
    async openUpdateRelease() { return true; },
    async listSession() { return listSessionContext(repositoryRoot); },
    async getArtifactActions() {
      return { schemaVersion: 1, editors: [], preferredEditorId: null, githubAvailable: false };
    },
    async openArtifact() { return true; },
    async activateProject() { return state; },
    async readDetail(kind, id) { return protocol.read(featureHome, kind, id, { sources }); },
    async readSession(id) { return readSessionContext(repositoryRoot, id); },
    async refresh() { return state; },
    async recheckSetup() { return state; },
    async setSelectedAgents() { return state; },
    async setNotificationsEnabled(enabled) {
      state.preferences.notificationsEnabled = enabled;
      return state;
    },
    async revealArtifact() { return true; },
    subscribe() { return () => {}; },
    subscribeUpdates() { return () => {}; },
  };
  globalThis.window = window;
  globalThis.document = window.document;
  await import(`${pathToFileURL(resolve(desktopRoot, 'renderer/renderer.js')).href}?test=canonical-integration`);
  await waitFor(() => window.document.querySelectorAll('.state-node').length >= 6, 'pinned state rail');

  assert.equal(window.document.querySelector('#chooser').hidden, true);
  assert.equal(
    window.document.querySelectorAll('.state-node').length >= 6,
    true,
    `${window.document.querySelector('#chooser-error').textContent} | ${window.document.querySelector('#model-graph').textContent}`,
  );
  assert.equal(window.document.querySelectorAll('#slices .card').length, 4);
  assert.equal(window.document.querySelectorAll('.gate-card').length, 10);
  assert.equal(window.document.querySelectorAll('[data-artifact-id]').length, snapshot.artifacts.length);

  window.document.querySelector('[data-view="history"]').click();
  await waitFor(
    () => window.document.querySelectorAll('[data-event-id]').length === snapshot.events.count,
    'complete event history',
  );
  assert.equal(window.document.querySelectorAll('[data-event-id]').length, snapshot.events.count);
  window.document.querySelector('[data-view="model"]').click();
  assert.equal(window.document.querySelectorAll('.model-group').length, 4);
  assert.match(window.document.querySelector('#model-mermaid').textContent, /flowchart/);
  window.document.querySelector('[data-view="session"]').click();
  await waitFor(
    () => !window.document.querySelector('#session-list').textContent.includes('Loading Session context'),
    'optional Session context',
  );
  assert.match(
    window.document.querySelector('#session-list').textContent,
    /Latest checkpoint|No checkpoint or handoff is present/,
  );

  assert.equal(await readFile(journalPath, 'utf8'), journalBefore);
  delete globalThis.window;
  delete globalThis.document;
});
