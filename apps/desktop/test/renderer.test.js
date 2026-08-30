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
      projection: { feature: { state: 'DELIVERING_SLICES' } },
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
  assert.match(window.document.querySelector('#project-context').textContent, /DELIVERING SLICES/);
  assert.match(window.document.querySelector('#activity').textContent, /polling GitHub/);
  assert.equal(window.document.querySelector('#actions-surface').hidden, true);
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
  assert.equal(window.document.querySelector('#overview').hidden, false);
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

test('renderer exposes state, gate, artifact, history, model, command, and Session inspection', async () => {
  const html = await readFile(resolve(desktopRoot, 'renderer/index.html'), 'utf8');
  const { window } = parseHTML(html);
  const copied = [];
  const notificationPreferences = [];
  const sessionId = 'session:latest-checkpoint:Q0hFQ0tQT0lOVC5tZA';
  const event = {
    sequence: 10,
    eventId: 'evt-review',
    recordedAt: '2026-08-26T12:00:00.000Z',
    type: 'HUMAN_REVIEW_REQUESTED',
    actor: { kind: 'agent', label: 'GateReeve' },
    modelHash: 'sha256:model',
    payload: { passage: { transitionId: 'request-human-review', guards: [] } },
  };
  const attempt = {
    id: 'slice-attempt-1',
    sliceId: 'slice',
    scope: 'SLICE',
    state: 'ACTIVE',
    context: { pullRequest: 8 },
    gates: [{
      id: 'verification',
      orderLabel: '1',
      dependsOn: ['reconcile'],
      outcome: 'PASS',
      freshness: 'CURRENT',
      blockers: [{ message: 'Reconcile must be current first.' }],
      reason: 'Verification depends on current reconciliation evidence.',
      evidence: { path: 'pr-8/verification.md' },
      recordedEventId: 'evt-gate',
    }, {
      id: 'explainDiff',
      orderLabel: '4a',
      dependsOn: ['verification'],
      outcome: 'PASS',
      freshness: 'CURRENT',
      blockers: [],
      reason: null,
      evidence: { path: 'pr-8/explain-diff.html' },
      recordedEventId: 'evt-explain',
    }],
  };
  const previousAttempt = {
    id: 'slice-old-attempt-1',
    sliceId: 'slice-old',
    scope: 'SLICE',
    state: 'MERGED',
    context: { pullRequest: 7 },
    gates: [],
  };
  const artifacts = [
    {
      id: 'design', label: 'Approved design', status: 'present', exists: true, unsafe: false,
      path: 'design.md', format: 'markdown', context: { kind: 'feature' },
    },
    {
      id: 'attempt:slice-attempt-1:boundary', label: 'PR boundary', status: 'present',
      exists: true, unsafe: false, path: 'pr-8/boundary.json', format: 'json',
      context: { kind: 'attempt', attemptId: 'slice-attempt-1' },
    },
    {
      id: 'attempt:slice-attempt-1:gate:explainDiff', label: 'Explain diff', status: 'present',
      exists: true, unsafe: false, path: 'pr-8/explain-diff.html', format: 'html',
      context: { kind: 'gate', attemptId: 'slice-attempt-1', gateId: 'explainDiff' },
    },
  ];
  const snapshot = {
    schemaVersion: 1,
    mode: 'governed',
    featureId: 'feature',
    model: { pinned: { hash: 'sha256:model' }, bundled: {} },
    projection: {
      feature: { state: 'DELIVERING_SLICES' },
      suspension: { paused: false },
      activeSliceId: 'slice',
      slices: [
        {
          id: 'slice-old', deliveryOrdinal: 1, name: 'Observer contract', state: 'MERGED', branch: 'topic-old',
          scope: 'SLICE', planSteps: ['P1'], activeAttemptId: null,
        },
        {
          id: 'slice', deliveryOrdinal: 2, name: 'Workflow experience', state: 'PR_BOUNDARY', branch: 'topic',
          scope: 'SLICE', planSteps: ['P6', 'P7'], activeAttemptId: 'slice-attempt-1',
        },
        {
          id: 'slice-next', deliveryOrdinal: 3, name: 'Final quality', state: 'PLANNED', branch: 'topic-next',
          scope: 'FEATURE_FINAL', planSteps: ['P8'], activeAttemptId: null,
        },
      ],
      boundaryAttempts: [previousAttempt, attempt],
    },
    active: { sliceId: 'slice', boundaryAttemptId: 'slice-attempt-1' },
    sources: {
      local: { status: 'current', detail: 'Local record' },
      git: { status: 'current', detail: 'Topic branch' },
      github: { status: 'current', detail: 'PR #8' },
    },
    blockers: [],
    warnings: [{ type: 'source-uncommitted', severity: 'activity' }],
    milestones: [
      { id: 'design.approved', label: 'Design approved', state: 'DESIGNING', status: 'complete' },
      { id: 'delivery.boundary', label: 'PR boundary active', state: 'DELIVERING_SLICES', status: 'active' },
    ],
    actions: [{
      id: 'boundary.request.review', command: 'boundary request-review slice-attempt-1',
      copyCommand: 'gatereeve boundary request-review slice-attempt-1',
      authority: 'agent', readiness: 'ready', inputs: [{ id: 'reviewPacket', label: 'Review packet' }],
      reasons: ['All prior gates must remain current.'],
    }],
    artifacts,
    events: { count: 1, lastEventId: event.eventId, recent: [event] },
  };
  const readyState = {
    ...idleState(),
    phase: 'ready',
    selection: { worktreePath: '/repo/current', featureHome: '/repo/current/docs/issues/feature' },
    snapshot,
  };
  window.gatereeveDesktop = {
    async checkForUpdates() { return idleUpdate(); },
    async addProject() {},
    async activateProject() {},
    async refresh() {},
    async recheckSetup() { return readyState; },
    async setSelectedAgents() { return readyState; },
    async setNotificationsEnabled(enabled) {
      notificationPreferences.push(enabled);
      return { ...readyState, preferences: { ...readyState.preferences, notificationsEnabled: enabled } };
    },
    async getState() { return readyState; },
    async getUpdateState() { return idleUpdate(); },
    async openUpdateRelease() { return true; },
    async copyText(value) { copied.push(value); return true; },
    async openArtifact() { return true; },
    async revealArtifact() { return true; },
    async listSession() {
      return { schemaVersion: 1, items: [{
        id: sessionId, kind: 'latest-checkpoint', label: 'Latest checkpoint',
        path: 'CHECKPOINT.md', modifiedAt: '2026-08-26T12:00:00.000Z', size: 20,
      }] };
    },
    async readSession(id) {
      const item = (await this.listSession()).items[0];
      return { schemaVersion: 1, id, item, content: '# Current position\nReady.' };
    },
    async readDetail(kind, id) {
      if (kind === 'model') return {
        kind,
        data: {
          lock: { model: { presentation: { featureOrder: ['DESIGNING', 'DELIVERING_SLICES', 'FINALIZING', 'COMPLETE'] } } },
          provenance: {
            pinned: { id: 'workflow', version: '1', hash: 'sha256:model' },
            bundled: { id: 'workflow', version: '1', hash: 'sha256:model' },
            migration: {
              relationship: 'bundled-newer',
              available: true,
              impact: { addedStates: ['FINALIZING'] },
            },
          },
          graph: {
            nodes: [
              { id: 'feature:DESIGNING', label: 'DESIGNING', group: 'Feature lifecycle' },
              { id: 'feature:DELIVERING_SLICES', label: 'DELIVERING_SLICES', group: 'Feature lifecycle' },
            ],
            edges: [{ id: 'edge', from: 'feature:DESIGNING', to: 'feature:DELIVERING_SLICES', label: 'approve', authority: 'human' }],
            mermaid: 'flowchart LR\n  DESIGNING --> DELIVERING_SLICES',
          },
        },
      };
      if (kind === 'events') return { kind, data: { events: [event] } };
      if (kind === 'attempt') return { kind, data: { attempt } };
      const artifact = artifacts.find((item) => item.id === id);
      return {
        kind,
        data: {
          artifact,
          content: artifact.format === 'html' ? '<html><body>Diff</body></html>' : '# Design\nApproved.',
          structured: null,
        },
      };
    },
    subscribeUpdates() { return () => {}; },
    subscribe() { return () => {}; },
  };
  globalThis.window = window;
  globalThis.document = window.document;
  await import(`${pathToFileURL(resolve(desktopRoot, 'renderer/renderer.js')).href}?test=renderer-rich`);
  for (let index = 0; index < 3; index += 1) await new Promise((done) => setImmediate(done));

  assert.equal(
    window.document.querySelectorAll('.state-node').length,
    4,
    `${window.document.querySelector('#model-graph').textContent} | ${window.document.querySelector('#chooser-error').textContent}`,
  );
  assert.equal(window.document.querySelector('.state-node.current small').textContent, 'DELIVERING_SLICES');
  assert.equal(window.document.querySelector('.state-node.current .state-select').getAttribute('aria-pressed'), 'true');
  assert.equal(window.document.querySelectorAll('.gate-card').length, 2);
  assert.equal(window.document.querySelector('#slices-surface').hidden, false);
  assert.equal(window.document.querySelectorAll('.slice-card').length, 3);
  assert.equal(window.document.querySelector('.slice-card.selected .order-marker').textContent, '2');
  assert.match(window.document.querySelector('.slice-card.selected').textContent, /Active/);
  assert.match(window.document.querySelector('.slice-card.selected').textContent, /Selected/);
  assert.match(window.document.querySelector('#milestones').textContent, /PR boundary active/);
  assert.equal(window.document.querySelectorAll('.inspector-tab').length, 1);
  assert.equal(window.document.querySelector('#global-alerts').hidden, true);
  assert.equal(window.document.querySelector('#attention-title'), null);
  assert.ok(window.document.querySelector('.project-sources'));
  assert.equal(window.document.querySelector('#actions-surface').hidden, false);
  assert.match(window.document.querySelector('#guidance-context').textContent, /Current: DELIVERING SLICES/);
  assert.equal(window.document.querySelector('.action-card').hasAttribute('open'), false);

  const designing = [...window.document.querySelectorAll('.state-select')]
    .find((button) => button.textContent.includes('DESIGNING'));
  designing.click();
  await new Promise((done) => setImmediate(done));
  assert.equal(window.document.querySelector('.state-node.current small').textContent, 'DELIVERING_SLICES');
  assert.equal(window.document.querySelector('.state-node.selected small').textContent, 'DESIGNING');
  assert.equal(window.document.querySelector('.state-node.current .state-select').getAttribute('aria-pressed'), 'false');
  assert.equal(window.document.querySelector('.state-node.selected .state-select').getAttribute('aria-pressed'), 'true');
  assert.equal(window.document.querySelector('#slices-surface').hidden, true);
  assert.match(window.document.querySelector('#milestones').textContent, /Design approved/);
  assert.equal(window.document.querySelectorAll('.inspector-tab').length, 2);
  assert.match(window.document.querySelector('#guidance-context').textContent, /Current: DELIVERING SLICES/);
  assert.equal(window.document.querySelector('#actions-surface').hidden, false);

  const finalizing = [...window.document.querySelectorAll('.state-select')]
    .find((button) => button.textContent.includes('FINALIZING'));
  finalizing.click();
  assert.equal(window.document.querySelector('#closeout-surface').hidden, false);
  assert.equal(window.document.querySelector('#closeout-status').textContent, 'In progress');
  assert.match(window.document.querySelector('#closeout-summary').textContent, /must finish before closeout is ready/);
  assert.match(window.document.querySelector('#closeout-summary').textContent, /Additional delivery slice/);

  const delivering = [...window.document.querySelectorAll('.state-select')]
    .find((button) => button.textContent.includes('DELIVERING_SLICES'));
  delivering.click();
  assert.equal(window.document.querySelector('#slices-surface').hidden, false);
  assert.match(window.document.querySelector('#milestones').textContent, /PR boundary active/);

  [...window.document.querySelectorAll('.slice-card')]
    .find((button) => button.textContent.includes('Final quality')).click();
  assert.match(window.document.querySelector('#boundary-summary').textContent, /No PR boundary has started/);
  assert.equal(window.document.querySelectorAll('.gate-card').length, 0);

  [...window.document.querySelectorAll('.slice-card')]
    .find((button) => button.textContent.includes('Workflow experience')).click();
  assert.equal(window.document.querySelectorAll('.gate-card').length, 2);
  assert.equal(window.document.querySelectorAll('#attempt-select option').length, 1);
  assert.deepEqual(
    [...window.document.querySelectorAll('.gate-card .order-marker')].map((marker) => marker.textContent),
    ['1', '4a'],
  );
  assert.match(window.document.querySelector('.gate-card .object-condition').textContent, /reconciliation evidence/);
  window.document.querySelectorAll('.gate-card')[0].click();
  assert.equal(window.document.querySelector('.gate-card.selected').getAttribute('aria-pressed'), 'true');
  assert.equal(window.document.querySelectorAll('.inspector-tab').length, 3);
  window.document.querySelectorAll('.gate-card')[1].click();
  for (let index = 0; index < 2; index += 1) await new Promise((done) => setImmediate(done));
  assert.equal(window.document.querySelectorAll('.inspector-tab').length, 4);
  const selectedGateFrame = window.document.querySelector('#artifact-viewer iframe');
  assert.ok(selectedGateFrame, `${window.document.querySelector('#inspector-tabs').textContent} | ${window.document.querySelector('#artifact-viewer').textContent}`);
  assert.match(selectedGateFrame.getAttribute('src'), /^gatereeve-artifact:/);
  assert.equal(window.document.querySelectorAll('.action-card').length, 1);
  const action = window.document.querySelector('.action-card');
  action.open = true;
  assert.match(action.textContent, /All prior gates must remain current/);
  assert.match(action.textContent, /Review packet/);
  assert.match(action.textContent, /Agent/);
  assert.match(action.textContent, /gatereeve boundary request-review/);
  const notifications = window.document.querySelector('#notifications');
  notifications.checked = true;
  notifications.dispatchEvent(new window.Event('change'));
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(notificationPreferences, [true]);
  assert.equal(notifications.checked, true);
  window.document.querySelector('.action-card button.secondary').click();
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(copied, ['gatereeve boundary request-review slice-attempt-1']);

  window.document.querySelector('[data-view="artifacts"]').click();
  window.document.querySelector('[data-artifact-id="design"]').click();
  await new Promise((done) => setImmediate(done));
  assert.equal(window.document.querySelector('#inspector-panel').hidden, false);
  assert.equal(window.document.querySelectorAll('.inspector-tab').length, 4);
  window.document.querySelector('[data-artifact-id="design"]').click();
  await new Promise((done) => setImmediate(done));
  assert.equal(window.document.querySelectorAll('.inspector-tab').length, 4);
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /Approved design/);
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /Approved\./);
  window.document.querySelector('#hide-inspector').click();
  assert.equal(window.document.querySelector('#inspector-panel').hidden, true);
  assert.equal(window.document.querySelectorAll('.inspector-tab').length, 4);
  window.document.querySelector('#toggle-inspector').click();
  assert.equal(window.document.querySelector('#inspector-panel').hidden, false);
  window.document.querySelector('[data-artifact-id="attempt:slice-attempt-1:gate:explainDiff"]').click();
  await new Promise((done) => setImmediate(done));
  assert.equal(window.document.querySelectorAll('.inspector-tab').length, 4);
  assert.match(window.document.querySelector('#artifact-viewer iframe').getAttribute('src'), /^gatereeve-artifact:/);
  assert.match(window.document.querySelector('#artifact-viewer iframe').getAttribute('src'), /\?refresh=\d+$/);
  assert.equal(window.document.querySelector('#artifact-viewer iframe').hasAttribute('sandbox'), false);

  window.document.querySelector('[data-view="history"]').click();
  for (let index = 0; index < 2; index += 1) await new Promise((done) => setImmediate(done));
  window.document.querySelector('[data-event-id="evt-review"]').click();
  assert.match(window.document.querySelector('#history-detail').textContent, /Request human review/i);
  assert.match(window.document.querySelector('#history-detail').textContent, /request-human-review/);

  window.document.querySelector('[data-view="model"]').click();
  assert.equal(window.document.querySelectorAll('.model-state').length, 2);
  assert.match(window.document.querySelector('#model-mermaid').textContent, /flowchart/);
  assert.match(window.document.querySelector('#model-provenance').textContent, /Read-only migration impact/);

  window.document.querySelector('[data-view="session"]').click();
  for (let index = 0; index < 2; index += 1) await new Promise((done) => setImmediate(done));
  window.document.querySelector(`[data-session-id="${sessionId}"]`).click();
  await new Promise((done) => setImmediate(done));
  assert.match(window.document.querySelector('#session-detail').textContent, /non-authoritative/);
  assert.match(window.document.querySelector('#session-detail').textContent, /Current position/);

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
  let failArtifactRead = false;
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
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /First/);

  const viewer = window.document.querySelector('#artifact-viewer');
  Object.defineProperty(viewer, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(viewer, 'clientHeight', { configurable: true, value: 200 });
  viewer.scrollTop = 300;

  subscriber(state(artifact('2026-08-29T01:01:00.000Z', 28)));
  await new Promise((done) => setImmediate(done));
  assert.equal(artifactReads, 2);
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /Updated/);
  assert.equal(
    window.document.querySelector('[data-artifact-id="interview"]').classList.contains('selected'),
    true,
  );
  assert.equal(window.document.querySelector('[data-artifact-refresh]').textContent, 'Refresh');
  assert.equal(viewer.scrollTop, 300);

  viewer.scrollTop = 790;
  window.document.querySelector('[data-artifact-refresh]').click();
  await new Promise((done) => setImmediate(done));
  assert.equal(artifactReads, 3);
  assert.equal(viewer.scrollTop, 800);

  failArtifactRead = true;
  subscriber(state(artifact('2026-08-29T01:02:00.000Z', 29)));
  await new Promise((done) => setImmediate(done));
  assert.equal(artifactReads, 4);
  assert.match(viewer.textContent, /Updated/);
  assert.match(viewer.textContent, /Refresh failed/);
  assert.ok(window.document.querySelector('[data-artifact-refresh]'));

  failArtifactRead = false;
  window.document.querySelector('[data-artifact-refresh]').click();
  await new Promise((done) => setImmediate(done));
  const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
  };
  const olderRead = deferred();
  const newerRead = deferred();
  queuedArtifactReads.push(olderRead, newerRead);
  subscriber(state(artifact('2026-08-29T01:03:00.000Z', 30)));
  subscriber(state(artifact('2026-08-29T01:04:00.000Z', 31)));
  newerRead.resolve({
    kind: 'artifact',
    data: {
      artifact: artifact('2026-08-29T01:04:00.000Z', 31),
      content: '# Interview\nNewest',
      structured: null,
    },
  });
  await new Promise((done) => setImmediate(done));
  olderRead.resolve({
    kind: 'artifact',
    data: {
      artifact: artifact('2026-08-29T01:03:00.000Z', 30),
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
              + '[Unsafe](file:///etc/passwd)\n\n## Details\nHere.'
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

  links.External.dispatchEvent(new window.Event('click', { cancelable: true }));
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(external, ['https://example.com/docs']);

  let fragmentScrolls = 0;
  viewer.querySelector('#details').scrollIntoView = () => { fragmentScrolls += 1; };
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
