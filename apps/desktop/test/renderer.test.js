import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

import { parseHTML } from 'linkedom';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readySetup() {
  return {
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
  };
}

function idleState() {
  return {
    schemaVersion: 1,
    phase: 'idle',
    refreshing: false,
    githubPolling: false,
    selection: null,
    snapshot: null,
    error: null,
    setup: readySetup(),
    preferences: {
      notificationsEnabled: false,
      projectPaths: ['/repo/recent'],
      selectedAgents: ['codex'],
      terminalHeight: 260,
    },
  };
}

function idleUpdate() {
  return {
    schemaVersion: 1, status: 'idle', source: null, currentVersion: '0.1.0-rc.3',
    checkedAt: null, available: null, detail: null,
  };
}

test('renderer presents selection first and then canonical observation status', async () => {
  const html = await readFile(resolve(desktopRoot, 'renderer/index.html'), 'utf8');
  const { window } = parseHTML(html);
  let subscriber;
  let updateSubscriber;
  let releaseOpens = 0;
  let projectChooserOpens = 0;
  let activationState = null;
  const activatedProjects = [];
  window.gatereeveDesktop = {
    async checkForUpdates() { return idleUpdate(); },
    async addProject() { projectChooserOpens += 1; },
    async activateProject(path) {
      activatedProjects.push(path);
      return activationState ?? idleState();
    },
    async refresh() {},
    async recheckSetup() { return idleState(); },
    async setSelectedAgents() { return idleState(); },
    async setNotificationsEnabled() { return idleState(); },
    async getState() { return idleState(); },
    async getUpdateState() { return idleUpdate(); },
    async openUpdateRelease() { releaseOpens += 1; return true; },
    subscribe(callback) { subscriber = callback; return () => {}; },
    subscribeUpdates(callback) { updateSubscriber = callback; return () => {}; },
  };
  globalThis.window = window;
  globalThis.document = window.document;
  await import(`${pathToFileURL(resolve(desktopRoot, 'renderer/renderer.js')).href}?test=renderer`);
  await new Promise((done) => setImmediate(done));
  assert.equal(window.document.querySelector('#chooser').hidden, false);
  assert.equal(window.document.querySelector('#overview').hidden, true);
  assert.equal(window.document.querySelectorAll('.project-row').length, 1);
  activationState = {
    ...idleState(),
    candidateDiagnostic: {
      classification: 'incompatible',
      title: 'Project not opened',
      message: 'The feature record is not compatible.',
      selectedPath: '/repo/recent',
      featureHome: '/repo/recent/docs/issues/feature',
      failedChecks: ['Pinned model is unsupported.'],
      pinnedModel: 'gatereeve/workflow@2.0.0',
      supportedModel: 'gatereeve/workflow@1.0.0',
    },
  };
  window.document.querySelector('[role="option"]').click();
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(activatedProjects, ['/repo/recent']);
  assert.equal(window.document.querySelector('#candidate-diagnostic').hidden, false);

  const selectedState = {
    ...idleState(),
    phase: 'ready',
    githubPolling: true,
    selection: { worktreePath: '/repo/current', featureHome: '/repo/current/docs/issues/feature' },
    snapshot: {
      schemaVersion: 1,
      mode: 'governed',
      featureId: 'feature',
      current: { phase: 'IMPLEMENTING' },
      active: { sliceId: 'desktop-shell' },
      sources: {
        local: { status: 'current', detail: 'Local read' },
        git: { status: 'current', detail: 'Git topic' },
        github: { status: 'current', detail: 'PR open' },
      },
    },
  };
  subscriber(selectedState);
  assert.equal(window.document.querySelector('#chooser').hidden, true);
  assert.equal(window.document.querySelector('#overview').hidden, false);
  assert.equal(window.document.querySelector('#project-context'), null);
  assert.equal(window.document.querySelector('#workspace').dataset.featureId, 'feature');
  assert.match(window.document.querySelector('#activity').textContent, /polling GitHub/);
  window.document.querySelector('#activity').click();
  assert.match(window.document.querySelector('#source-dialog-list').textContent, /Local.*Current.*Local read/s);
  assert.match(window.document.querySelector('#source-dialog-list').textContent, /GitHub.*Current.*PR open/s);
  assert.equal(window.document.querySelector('#actions-surface').hidden, false);
  subscriber({
    ...selectedState,
    candidateDiagnostic: {
      classification: 'incompatible',
      title: 'Model-incompatible feature record',
      message: 'The pinned model is not supported by this GateReeve Desktop.',
      selectedPath: '/repo/rejected',
      featureHome: '/repo/rejected/docs/issues/feature',
      failedChecks: ['Pinned workflow model 2.0.0 is newer than the bundled model.'],
      pinnedModel: 'gatereeve/workflow@2.0.0',
      supportedModel: 'gatereeve/workflow@1.0.0',
    },
  });
  const diagnostic = window.document.querySelector('#candidate-diagnostic');
  assert.equal(diagnostic.hidden, false);
  assert.equal(diagnostic.open, true);
  assert.match(diagnostic.textContent, /\/repo\/rejected/);
  assert.match(diagnostic.textContent, /gatereeve\/workflow@2\.0\.0/);
  assert.match(diagnostic.textContent, /GateReeve has not saved, modified, migrated, or deleted anything/);
  assert.equal(window.document.body.classList.contains('diagnostic-only'), true);
  window.document.querySelector('#candidate-diagnostic-choose-another').click();
  assert.equal(projectChooserOpens, 1);
  window.document.querySelector('#open-setup').click();
  assert.equal(window.document.querySelector('#workspace').hidden, true);
  assert.equal(window.document.querySelector('#setup-shell').hidden, false);
  window.document.querySelector('#setup-return').click();
  window.document.querySelector('[data-view="overview"]').click();
  assert.equal(window.document.querySelector('#workspace').hidden, false);
  assert.equal(window.document.querySelector('#overview').hidden, false);
  updateSubscriber({
    ...idleUpdate(), status: 'available', source: 'automatic',
    checkedAt: '2026-08-28T00:00:00.000Z',
    available: { version: '0.1.0-rc.4', channel: 'rc', publishedAt: '2026-08-28T00:00:00.000Z' },
  });
  assert.equal(window.document.querySelector('#update-banner').hidden, false);
  assert.match(window.document.querySelector('#update-title').textContent, /0\.1\.0-rc\.4/);
  window.document.querySelector('#open-update').click();
  await new Promise((done) => setImmediate(done));
  assert.equal(releaseOpens, 1);
  delete globalThis.window;
  delete globalThis.document;
});

test('renderer reloads optional Session context when a refresh begins', async () => {
  const html = await readFile(resolve(desktopRoot, 'renderer/index.html'), 'utf8');
  const { window } = parseHTML(html);
  let subscriber;
  let sessionReads = 0;
  const state = {
    ...idleState(),
    phase: 'ready',
    selection: { worktreePath: '/repo/current', featureHome: '/repo/current/docs/issues/feature' },
    snapshot: {
      schemaVersion: 1,
      mode: 'governed',
      featureId: 'feature',
      model: null,
      projection: null,
      sources: {},
      artifacts: [],
      events: { count: 0, lastEventId: null, recent: [] },
    },
  };
  window.gatereeveDesktop = {
    async checkForUpdates() { return idleUpdate(); },
    async addProject() {},
    async activateProject() {},
    async refresh() {},
    async recheckSetup() { return state; },
    async setSelectedAgents() { return state; },
    async setNotificationsEnabled() { return state; },
    async getState() { return state; },
    async getUpdateState() { return idleUpdate(); },
    async openUpdateRelease() { return true; },
    async listSession() {
      sessionReads += 1;
      return { schemaVersion: 1, items: [] };
    },
    subscribe(callback) { subscriber = callback; return () => {}; },
    subscribeUpdates() { return () => {}; },
  };
  globalThis.window = window;
  globalThis.document = window.document;
  await import(`${pathToFileURL(resolve(desktopRoot, 'renderer/renderer.js')).href}?test=session-refresh`);
  await new Promise((done) => setImmediate(done));

  window.document.querySelector('[data-view="session"]').click();
  await new Promise((done) => setImmediate(done));
  assert.equal(sessionReads, 1);

  subscriber({ ...state, refreshing: true });
  await new Promise((done) => setImmediate(done));
  assert.equal(sessionReads, 2);

  delete globalThis.window;
  delete globalThis.document;
});

test('selected artifact rereads automatically when its canonical fingerprint changes', async () => {
  const html = await readFile(resolve(desktopRoot, 'renderer/index.html'), 'utf8');
  const { window } = parseHTML(html);
  let subscriber;
  let artifactReads = 0;
  let failArtifactRead = true;
  const queuedArtifactReads = [];
  const artifact = (modifiedAt, size) => ({
    id: 'interview',
    label: 'Design interview',
    status: 'present',
    exists: true,
    unsafe: false,
    path: 'interview.md',
    absolutePath: '/repo/docs/issues/feature/interview.md',
    format: 'markdown',
    modifiedAt,
    size,
    context: { kind: 'feature' },
  });
  const state = (item) => ({
    ...idleState(),
    phase: 'ready',
    selection: { worktreePath: '/repo', featureHome: '/repo/docs/issues/feature' },
    snapshot: {
      schemaVersion: 1,
      mode: 'governed',
      featureId: 'feature',
      model: null,
      projection: null,
      active: {},
      sources: {},
      blockers: [],
      warnings: [],
      milestones: [],
      actions: [],
      artifacts: item === null ? [] : [item],
      events: { count: 0, lastEventId: null, recent: [] },
    },
  });
  const initial = state(artifact('2026-08-29T01:00:00.000Z', 20));
  window.gatereeveDesktop = {
    async checkForUpdates() { return idleUpdate(); },
    async addProject() {},
    async activateProject() {},
    async refresh() { return initial; },
    async recheckSetup() { return initial; },
    async setSelectedAgents() { return initial; },
    async setNotificationsEnabled() { return initial; },
    async getState() { return initial; },
    async getUpdateState() { return idleUpdate(); },
    async openUpdateRelease() { return true; },
    async getArtifactActions() { return fileActionCapabilities(); },
    async openArtifact() { return true; },
    async revealArtifact() { return true; },
    async readDetail(kind, id) {
      if (kind !== 'artifact') throw new Error('not used');
      artifactReads += 1;
      if (failArtifactRead) throw new Error('File is being replaced');
      if (queuedArtifactReads.length > 0) return queuedArtifactReads.shift().promise;
      const current = artifactReads === 1
        ? artifact('2026-08-29T01:00:00.000Z', 20)
        : artifact('2026-08-29T01:01:00.000Z', 28);
      return {
        kind,
        data: {
          artifact: current,
          content: artifactReads === 1 ? '# Interview\nFirst' : '# Interview\nUpdated',
          structured: null,
        },
      };
    },
    subscribe(callback) { subscriber = callback; return () => {}; },
    subscribeUpdates() { return () => {}; },
  };
  globalThis.window = window;
  globalThis.document = window.document;
  await import(`${pathToFileURL(resolve(desktopRoot, 'renderer/renderer.js')).href}?test=artifact-auto-refresh`);
  await new Promise((done) => setImmediate(done));

  window.document.querySelector('[data-view="artifacts"]').click();
  window.document.querySelector('[data-artifact-id="interview"]').click();
  await new Promise((done) => setImmediate(done));
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /Refresh failed/);
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /Open with/);

  const viewer = window.document.querySelector('#artifact-viewer');
  Object.defineProperty(viewer, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(viewer, 'clientHeight', { configurable: true, value: 200 });
  viewer.scrollTop = 300;

  failArtifactRead = false;
  subscriber(state(artifact('2026-08-29T01:01:00.000Z', 28)));
  await new Promise((done) => setImmediate(done));
  assert.equal(artifactReads, 2);
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /Updated/);
  assert.equal(
    window.document.querySelector('[data-artifact-id="interview"]').classList.contains('selected'),
    true,
  );
  assert.equal(window.document.querySelector('[data-artifact-refresh]'), null);
  assert.equal(viewer.scrollTop, 300);

  failArtifactRead = true;
  subscriber(state(artifact('2026-08-29T01:02:00.000Z', 29)));
  await new Promise((done) => setImmediate(done));
  assert.equal(artifactReads, 3);
  assert.match(viewer.textContent, /Updated/);
  assert.match(viewer.textContent, /Refresh failed/);
  assert.equal(window.document.querySelector('[data-artifact-refresh]'), null);

  failArtifactRead = false;
  subscriber(state(artifact('2026-08-29T01:03:00.000Z', 30)));
  await new Promise((done) => setImmediate(done));
  assert.equal(artifactReads, 4);
  const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
  };
  const olderRead = deferred();
  const newerRead = deferred();
  queuedArtifactReads.push(olderRead, newerRead);
  subscriber(state(artifact('2026-08-29T01:04:00.000Z', 31)));
  subscriber(state(artifact('2026-08-29T01:05:00.000Z', 32)));
  newerRead.resolve({
    kind: 'artifact',
    data: {
      artifact: artifact('2026-08-29T01:05:00.000Z', 32),
      content: '# Interview\nNewest',
      structured: null,
    },
  });
  await new Promise((done) => setImmediate(done));
  olderRead.resolve({
    kind: 'artifact',
    data: {
      artifact: artifact('2026-08-29T01:04:00.000Z', 31),
      content: '# Interview\nStale',
      structured: null,
    },
  });
  await new Promise((done) => setImmediate(done));
  assert.match(viewer.textContent, /Newest/);
  assert.doesNotMatch(viewer.textContent, /Stale/);

  subscriber(state(null));
  assert.match(viewer.textContent, /unavailable/i);
  assert.equal(window.document.querySelector('[data-artifact-id="interview"]'), null);

  delete globalThis.window;
  delete globalThis.document;
});

test('artifact Markdown confines external, relative, fragment, and unsafe links', async () => {
  const html = await readFile(resolve(desktopRoot, 'renderer/index.html'), 'utf8');
  const { window } = parseHTML(html);
  const external = [];
  const artifacts = [
    {
      id: 'interview', label: 'Interview', status: 'present', exists: true, unsafe: false,
      path: 'interview.md', absolutePath: '/repo/interview.md', format: 'markdown',
      modifiedAt: '2026-08-29T01:00:00.000Z', size: 100, context: { kind: 'feature' },
    },
    {
      id: 'spec', label: 'Spec', status: 'present', exists: true, unsafe: false,
      path: 'spec.md', absolutePath: '/repo/spec.md', format: 'markdown',
      modifiedAt: '2026-08-29T01:00:00.000Z', size: 20, context: { kind: 'feature' },
    },
  ];
  const state = {
    ...idleState(),
    phase: 'ready',
    selection: { worktreePath: '/repo', featureHome: '/repo/docs/issues/feature' },
    snapshot: {
      schemaVersion: 1, mode: 'governed', featureId: 'feature', model: null,
      projection: null, active: {}, sources: {}, blockers: [], warnings: [], milestones: [],
      actions: [], artifacts, events: { count: 0, lastEventId: null, recent: [] },
    },
  };
  window.gatereeveDesktop = {
    async checkForUpdates() { return idleUpdate(); },
    async getState() { return state; },
    async getUpdateState() { return idleUpdate(); },
    async openUpdateRelease() { return true; },
    async openExternalLink(url) { external.push(url); return true; },
    async addProject() { return state; },
    async activateProject() { return state; },
    async refresh() { return state; },
    async recheckSetup() { return state; },
    async setSelectedAgents() { return state; },
    async setNotificationsEnabled() { return state; },
    async getArtifactActions() { return fileActionCapabilities(); },
    async openArtifact() { return true; },
    async revealArtifact() { return true; },
    async readDetail(kind, id) {
      const artifact = artifacts.find((item) => item.id === id);
      return {
        kind,
        data: {
          artifact,
          content: id === 'interview'
            ? '# Overview\n[External](https://example.com/docs) [Spec](spec.md) '
              + '[Details](#details) [Missing](missing.md) '
              + '[Unsafe](file:///etc/passwd) '
              + '[Credential](https://user:pass@example.com/private) '
              + '[Protocol relative](//example.com/path)\n\n## Details\nHere.'
            : '# Spec\nSelected through the canonical inventory.',
          structured: null,
        },
      };
    },
    subscribe() { return () => {}; },
    subscribeUpdates() { return () => {}; },
  };
  globalThis.window = window;
  globalThis.document = window.document;
  await import(`${pathToFileURL(resolve(desktopRoot, 'renderer/renderer.js')).href}?test=artifact-links`);
  await new Promise((done) => setImmediate(done));

  window.document.querySelector('[data-view="artifacts"]').click();
  window.document.querySelector('[data-artifact-id="interview"]').click();
  await new Promise((done) => setImmediate(done));
  const viewer = window.document.querySelector('#artifact-viewer');
  const links = Object.fromEntries(
    [...viewer.querySelectorAll('a')].map((link) => [link.textContent, link]),
  );
  assert.deepEqual(Object.keys(links), ['External', 'Spec', 'Details']);
  assert.match(viewer.textContent, /\[Missing\]\(missing\.md\)/);
  assert.match(viewer.textContent, /\[Unsafe\]\(file:\/\/\/etc\/passwd\)/);
  assert.match(
    viewer.textContent,
    /\[Credential\]\(https:\/\/user:pass@example\.com\/private\)/u,
  );
  assert.match(viewer.textContent, /\[Protocol relative\]\(\/\/example\.com\/path\)/u);

  links.External.dispatchEvent(new window.Event('click', { cancelable: true }));
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(external, ['https://example.com/docs']);

  let fragmentScrolls = 0;
  viewer.querySelector('[data-markdown-fragment="details"]').scrollIntoView = () => {
    fragmentScrolls += 1;
  };
  links.Details.dispatchEvent(new window.Event('click', { cancelable: true }));
  await new Promise((done) => setImmediate(done));
  assert.equal(fragmentScrolls, 1);

  links.Spec.dispatchEvent(new window.Event('click', { cancelable: true }));
  await new Promise((done) => setImmediate(done));
  assert.match(viewer.textContent, /Selected through the canonical inventory/);
  assert.equal(
    window.document.querySelector('[data-artifact-id="spec"]').classList.contains('selected'),
    true,
  );

  delete globalThis.window;
  delete globalThis.document;
});
function fileActionCapabilities(overrides = {}) {
  return {
    schemaVersion: 1,
    editors: [{ id: 'vscode', label: 'VS Code' }],
    preferredEditorId: null,
    githubAvailable: true,
    ...overrides,
  };
}
