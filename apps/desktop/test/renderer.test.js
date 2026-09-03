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
  assert.equal(window.document.querySelector('#project-context'), null);
  assert.equal(window.document.querySelector('#workspace').dataset.featureId, 'feature');
  assert.match(window.document.querySelector('#activity').textContent, /polling GitHub/);
  window.document.querySelector('#activity').click();
  assert.match(window.document.querySelector('#source-dialog-list').textContent, /Local.*Current.*Local read/s);
  assert.match(window.document.querySelector('#source-dialog-list').textContent, /GitHub.*Current.*PR open/s);
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

test('renderer exposes state, gate, artifact, history, model, command, and Session inspection', async () => {
  const html = await readFile(resolve(desktopRoot, 'renderer/index.html'), 'utf8');
  const { window } = parseHTML(html);
  const copied = [];
  const openedArtifacts = [];
  const fileActions = [];
  const notificationPreferences = [];
  const modulePolicyCalls = [];
  const waiverCalls = [];
  let stateSubscriber;
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
      eligible: true,
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
      eligible: true,
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
      id: 'interview', label: 'Design interview', status: 'present', exists: true, unsafe: false,
      path: 'interview.md', format: 'markdown', context: { kind: 'feature' },
    },
    {
      id: 'design', label: 'Approved design', status: 'changed', exists: true, unsafe: false,
      path: 'design.md', format: 'markdown', context: { kind: 'feature' },
    },
    {
      id: 'spec', label: 'Validated specification', status: 'present', exists: true, unsafe: false,
      path: 'spec.md', format: 'markdown', context: { kind: 'feature' },
    },
    {
      id: 'plan', label: 'Authorized implementation plan', status: 'present', exists: true, unsafe: false,
      path: 'plan.md', format: 'markdown', context: { kind: 'feature' },
    },
    {
      id: 'issues', label: 'Operational issues', status: 'pending', exists: false, unsafe: false,
      path: 'issues.md', format: 'markdown', context: { kind: 'feature' },
    },
    {
      id: 'tracker', label: 'Rubric tracker', status: 'missing', exists: false, unsafe: true,
      path: 'tracker.md', format: 'markdown', context: { kind: 'feature' },
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
    modules: {
      schemaVersion: 1,
      policyDigest: 'sha256:policy',
      slots: [{
        id: 'boundary.evaluation',
        modules: [{
          id: 'gatereeve/verification', label: 'Verification', description: 'Verify the change.',
          boundaryGateId: 'verification', enabled: true, locked: false, waiverAllowed: true,
          slot: 'boundary.evaluation', disposition: 'required', run: { kind: 'skill', skillId: 'workflow:verify' },
          observe: { providerId: 'gatereeve/checks', version: '1.0.0' },
          dependsOn: [], after: [], readiness: { status: 'available', missing: [] },
          live: {
            status: 'waiting', detail: 'Awaiting the independent result.',
            updatedAt: '2026-08-26T12:01:00.000Z',
            stages: [{ id: 'analysis', label: 'Analysis', status: 'running', detail: 'Checking evidence.' }],
            actions: [{ id: 'refresh', label: 'Refresh observation', available: true }],
            attempts: [{ id: 'verification-1', status: 'running', startedAt: '2026-08-26T12:00:00.000Z' }],
            evidence: [{ label: 'Provider log', path: 'provider.log' }],
            links: [{ label: 'Workflow run', url: 'https://example.com/run/1' }],
          },
        }, {
          id: 'gatereeve/explain-diff', label: 'Explain Diff', description: 'Explain the change.',
          boundaryGateId: 'explainDiff', enabled: true, locked: false, waiverAllowed: false,
          dependsOn: ['gatereeve/verification'], after: [], readiness: { status: 'available', missing: [] }, live: null,
        }],
      }, {
        id: 'feature.finalization',
        modules: [{
          id: 'gatereeve/release', label: 'GateReeve Release', description: 'Verify a complete release.',
          boundaryGateId: null, enabled: true, locked: false, waiverAllowed: true,
          slot: 'feature.finalization', disposition: 'required', run: null,
          observe: { providerId: 'gatereeve/release-conductor', version: '1.0.0' },
          dependsOn: [], after: [], readiness: { status: 'unavailable', missing: [{ kind: 'provider', id: 'gatereeve/release-conductor' }] }, live: null,
        }],
      }],
    },
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
    async getModuleSettings() {
      return {
        schemaVersion: 1, policyPath: '/repo/current/.gatereeve/workflow.json',
        policyExists: true, policyDigest: 'sha256:policy', featureModelHash: 'sha256:model',
        projectModelHash: 'sha256:model', migrationRequired: false,
        modules: [{
          id: 'gatereeve/pin-context', version: '1.0.0', digest: 'sha256:pin',
          label: 'Pin Context', description: 'Pin exact inputs.', slot: 'boundary.evaluation',
          enabled: true, locked: true, disposition: 'required', waiverAllowed: false,
          dependsOn: [], after: [], readiness: { status: 'available', missing: [] },
          runKind: null, observeProvider: null,
        }, {
          id: 'gatereeve/judge', version: '1.0.0', digest: 'sha256:judge',
          label: 'Judge', description: 'Independent evaluation.', slot: 'boundary.evaluation',
          enabled: true, locked: false, disposition: 'required', waiverAllowed: true,
          dependsOn: [], after: [], readiness: { status: 'available', missing: [] },
          runKind: 'skill', observeProvider: null,
        }],
      };
    },
    async previewModulePolicy(enabledModuleIds) {
      modulePolicyCalls.push(['preview', enabledModuleIds]);
      return {
        schemaVersion: 1, valid: true, error: null, autoEnabled: [], blockingDependents: [],
        enabledModuleIds, suggestedEnabledModuleIds: enabledModuleIds,
        diff: enabledModuleIds.includes('gatereeve/judge') ? [] : [{
          id: 'gatereeve/judge', before: true, after: false,
        }],
        migrationImpact: enabledModuleIds.includes('gatereeve/judge') ? null : {
          fromModelVersion: '1.0.0', toModelVersion: '1.0.0',
          fromModelHash: 'sha256:old', toModelHash: 'sha256:new',
          guardsAdded: [], guardsRemoved: [], transitionsAdded: [], transitionsRemoved: [],
          modulesAdded: [], modulesRemoved: [], modulesChanged: ['gatereeve/judge'],
          boundaryGateIdsInvalidated: ['judge'],
        },
      };
    },
    async applyModulePolicy(enabledModuleIds, confirmedMigration, confirmationLabel) {
      modulePolicyCalls.push(['apply', enabledModuleIds, confirmedMigration, confirmationLabel]);
      const settings = await this.getModuleSettings();
      return {
        ...settings,
        modules: settings.modules.map((module) => ({
          ...module, enabled: enabledModuleIds.includes(module.id),
        })),
      };
    },
    async waiveBoundaryModule(...args) { waiverCalls.push(args); return readyState; },
    async copyText(value) { copied.push(value); return true; },
    async getArtifactActions() { return fileActionCapabilities(); },
    async openArtifact(...args) { openedArtifacts.push(args); return true; },
    async chooseArtifactApplication(id) { fileActions.push(['choose', id]); return true; },
    async saveArtifactAs(id) { fileActions.push(['save-as', id]); return true; },
    async saveArtifactDownloads(id) { fileActions.push(['downloads', id]); return true; },
    async openArtifactGithub(id) { fileActions.push(['github', id]); return true; },
    async revealArtifact() { return true; },
    async listSession() {
      return { schemaVersion: 1, items: [{
        id: sessionId, kind: 'latest-checkpoint', label: 'Latest checkpoint',
        path: 'CHECKPOINT.md', modifiedAt: '2026-08-26T12:00:00.000Z', size: 20,
      }] };
    },
    async readSession(id) {
      const item = (await this.listSession()).items[0];
      return {
        schemaVersion: 1,
        id,
        item,
        content: [
          '# Current position',
          '',
          '- [x] Ready.',
          '',
          '| Check | State |',
          '| --- | --- |',
          '| Markdown | Complete |',
          '',
          '[External context](https://example.com/context)',
        ].join('\n'),
      };
    },
    async readDetail(kind, id) {
      if (kind === 'model') return {
        kind,
        data: {
          lock: { model: { presentation: { featureOrder: [
            'DESIGNING', 'SPECIFYING', 'PLANNING', 'DELIVERING_SLICES', 'FINALIZING', 'COMPLETE',
          ] } } },
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
    subscribe(callback) { stateSubscriber = callback; return () => {}; },
  };
  globalThis.window = window;
  globalThis.document = window.document;
  await import(`${pathToFileURL(resolve(desktopRoot, 'renderer/renderer.js')).href}?test=renderer-rich`);
  for (let index = 0; index < 3; index += 1) await new Promise((done) => setImmediate(done));

  assert.equal(
    window.document.querySelectorAll('.state-node').length,
    6,
    `${window.document.querySelector('#model-graph').textContent} | ${window.document.querySelector('#chooser-error').textContent}`,
  );
  assert.equal(window.document.querySelector('.state-node.current strong').textContent, 'Implementing');
  assert.equal(window.document.querySelector('.state-node.current .state-select').getAttribute('aria-pressed'), 'true');
  assert.equal(window.document.querySelectorAll('.gate-card').length, 2);
  assert.equal(window.document.querySelector('#slices-surface').hidden, false);
  assert.equal(window.document.querySelectorAll('.slice-card').length, 3);
  assert.equal(window.document.querySelector('.slice-card.selected .order-marker').textContent, '2');
  assert.match(window.document.querySelector('.slice-card.selected').getAttribute('aria-label'), /Active delivery slice/);
  assert.match(window.document.querySelector('.slice-card.selected').getAttribute('aria-label'), /Selected for inspection/);
  assert.doesNotMatch(window.document.querySelector('.slice-card.selected').textContent, /Active|Selected/);
  assert.equal(window.document.querySelector('#milestones').hidden, false);
  assert.equal(window.document.querySelector('#milestones').textContent, 'PR boundary active');
  assert.doesNotMatch(window.document.querySelector('#milestones').textContent, /No milestones/);
  assert.equal(window.document.querySelectorAll('.inspector-tab').length, 0);
  assert.equal(window.document.querySelector('#global-alerts').hidden, true);
  assert.equal(window.document.querySelector('#attention-title'), null);
  assert.equal(window.document.querySelector('.project-sources'), null);
  assert.equal(window.document.querySelector('#actions-surface').hidden, false);
  assert.match(window.document.querySelector('#guidance-context').textContent, /Current: Implementing/);
  assert.equal(window.document.querySelector('.action-card').hasAttribute('open'), false);
  assert.equal(window.document.querySelector('#phase-context-surface').hidden, true);

  const designing = [...window.document.querySelectorAll('.state-select')]
    .find((button) => button.textContent.includes('Designing'));
  designing.click();
  await new Promise((done) => setImmediate(done));
  assert.equal(window.document.querySelector('.state-node.current strong').textContent, 'Implementing');
  assert.equal(window.document.querySelector('.state-node.selected strong').textContent, 'Designing');
  assert.equal(window.document.querySelector('.state-node.current .state-select').getAttribute('aria-pressed'), 'false');
  assert.equal(window.document.querySelector('.state-node.selected .state-select').getAttribute('aria-pressed'), 'true');
  assert.equal(window.document.querySelector('#slices-surface').hidden, true);
  assert.equal(window.document.querySelector('#milestones').hidden, false);
  assert.equal(window.document.querySelector('#milestones').textContent, 'Design approved');
  assert.equal(window.document.querySelector('#phase-context-surface').hidden, false);
  assert.equal(window.document.querySelector('#phase-context-kicker').textContent, 'Selected state · Designing');
  assert.equal(window.document.querySelector('#phase-context-title').textContent, 'Design synthesis');
  assert.match(window.document.querySelector('#phase-context-description').textContent, /approved design intent/);
  assert.deepEqual(
    [...window.document.querySelectorAll('#phase-context-uses .phase-context-entry')]
      .map((item) => [item.dataset.phaseEntryId, item.dataset.kind]),
    [['interview', 'artifact'], ['existing-codebase', 'source']],
  );
  const codebaseSource = window.document.querySelector('[data-phase-entry-id="existing-codebase"]');
  assert.equal(codebaseSource.tagName, 'SPAN');
  assert.match(codebaseSource.textContent, /SourceExisting codebase/);
  assert.equal(window.document.querySelector('#phase-context-produces [data-phase-entry-id="design"]').dataset.status, 'changed');
  assert.match(
    window.document.querySelector('#phase-context-produces [data-phase-entry-id="design"] .phase-context-status').className,
    /status changed/,
  );
  assert.match(
    window.document.querySelector('[data-phase-entry-id="interview"]').getAttribute('aria-label'),
    /interview\.md, artifact, Present, open in inspector/,
  );
  window.document.querySelector('[data-phase-entry-id="interview"]').click();
  for (let index = 0; index < 2; index += 1) await new Promise((done) => setImmediate(done));
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /interview\.md/);
  assert.equal(window.document.querySelectorAll('.inspector-tab').length, 0);
  assert.match(window.document.querySelector('#guidance-context').textContent, /Current: Implementing/);
  assert.equal(window.document.querySelector('#actions-surface').hidden, false);

  const specifying = [...window.document.querySelectorAll('.state-select')]
    .find((button) => button.textContent.includes('Specifying'));
  specifying.click();
  assert.equal(window.document.querySelector('#phase-context-title').textContent, 'Specification drafting');
  assert.deepEqual(
    [...window.document.querySelectorAll('#phase-context-uses .phase-context-entry')]
      .map((item) => item.dataset.phaseEntryId),
    ['design', 'interview', 'existing-codebase', 'architecture-contracts'],
  );
  assert.deepEqual(
    [...window.document.querySelectorAll('#phase-context-produces .phase-context-entry')]
      .map((item) => item.dataset.phaseEntryId),
    ['spec'],
  );

  const planning = [...window.document.querySelectorAll('.state-select')]
    .find((button) => button.textContent.includes('Planning'));
  planning.click();
  assert.equal(window.document.querySelector('#phase-context-title').textContent, 'Implementation planning');
  assert.deepEqual(
    [...window.document.querySelectorAll('#phase-context-uses .phase-context-entry')]
      .map((item) => item.dataset.phaseEntryId),
    ['spec', 'design', 'interview', 'repository-structure', 'tests-and-commands'],
  );
  assert.deepEqual(
    [...window.document.querySelectorAll('#phase-context-produces .phase-context-entry')]
      .map((item) => item.dataset.phaseEntryId),
    ['plan', 'issues', 'tracker'],
  );
  const pendingIssues = window.document.querySelector('[data-phase-entry-id="issues"]');
  assert.equal(pendingIssues.disabled, false);
  assert.match(pendingIssues.getAttribute('aria-label'), /Pending, open in inspector/);
  assert.match(pendingIssues.querySelector('.phase-context-status').className, /status pending/);
  pendingIssues.click();
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /issues\.md/);
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /unavailable in the current canonical snapshot/);
  const unsafeTracker = window.document.querySelector('[data-phase-entry-id="tracker"]');
  assert.equal(unsafeTracker.disabled, true);
  assert.match(unsafeTracker.getAttribute('aria-label'), /Missing, unavailable/);

  const finalizing = [...window.document.querySelectorAll('.state-select')]
    .find((button) => button.textContent.includes('Finalizing'));
  finalizing.click();
  assert.equal(window.document.querySelector('#phase-context-surface').hidden, true);
  assert.equal(window.document.querySelector('#phase-context-uses').textContent, '');
  assert.equal(window.document.querySelector('#milestones').hidden, true);
  assert.equal(window.document.querySelector('#milestones').textContent, '');
  assert.equal(window.document.querySelector('#closeout-surface').hidden, false);
  assert.equal(window.document.querySelector('#closeout-status').textContent, 'In progress');
  assert.match(window.document.querySelector('#closeout-summary').textContent, /must finish before closeout is ready/);
  assert.match(window.document.querySelector('#closeout-summary').textContent, /Additional delivery slice/);
  assert.equal(window.document.querySelector('#finalization-surface').hidden, false);
  assert.match(window.document.querySelector('#finalization-surface').textContent, /GateReeve Release/);
  assert.match(window.document.querySelector('#finalization-surface').textContent, /Unavailable/);
  window.document.querySelector('#finalization-dag .module-card').click();
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /GateReeve Release/);
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /Feature finalization/);
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /Implementation unavailable/);
  assert.equal(window.document.querySelector('#finalization-dag .module-card').getAttribute('aria-pressed'), 'true');
  stateSubscriber({
    ...readyState,
    snapshot: {
      ...snapshot,
      modules: {
        ...snapshot.modules,
        slots: snapshot.modules.slots.map((slot) => slot.id === 'feature.finalization'
          ? { ...slot, modules: slot.modules.map((module) => ({ ...module, enabled: false })) }
          : slot),
      },
    },
  });
  assert.equal(window.document.querySelector('#finalization-surface').hidden, true);
  stateSubscriber(readyState);

  const delivering = [...window.document.querySelectorAll('.state-select')]
    .find((button) => button.textContent.includes('Implementing'));
  delivering.click();
  assert.equal(window.document.querySelector('#slices-surface').hidden, false);
  assert.equal(window.document.querySelector('#milestones').hidden, false);
  assert.equal(window.document.querySelector('#milestones').textContent, 'PR boundary active');

  [...window.document.querySelectorAll('.slice-card')]
    .find((button) => button.textContent.includes('Final quality')).click();
  assert.match(window.document.querySelector('#boundary-summary').textContent, /No PR boundary has started/);
  assert.equal(window.document.querySelectorAll('.gate-card').length, 0);

  [...window.document.querySelectorAll('.slice-card')]
    .find((button) => button.textContent.includes('Workflow experience')).click();
  assert.equal(window.document.querySelectorAll('.gate-card').length, 2);
  assert.match(window.document.querySelectorAll('.gate-card')[0].textContent, /Verification/);
  assert.equal(window.document.querySelectorAll('.module-waiver-button').length, 1);
  assert.equal(window.document.querySelectorAll('#attempt-select option').length, 1);
  assert.deepEqual(
    [...window.document.querySelectorAll('.gate-card .order-marker')].map((marker) => marker.textContent),
    ['1', '4a'],
  );
  assert.match(window.document.querySelector('.gate-card').textContent, /reconciliation evidence/);
  window.document.querySelectorAll('.gate-card')[0].click();
  assert.equal(window.document.querySelector('.gate-card.selected').getAttribute('aria-pressed'), 'true');
  assert.equal(window.document.querySelectorAll('.inspector-tab').length, 0);
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /Outcome.*PASS/s);
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /Live status.*Waiting/s);
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /Provider stages.*Analysis.*Running/s);
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /Available actions.*Refresh observation/s);
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /Attempt history.*verification-1/s);
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /Evidence.*Provider log/s);
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /Links.*Workflow run/s);
  window.document.querySelectorAll('.gate-card')[1].click();
  assert.equal(window.document.querySelectorAll('.inspector-tab').length, 0);
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /Explain Diff/);
  window.document.querySelector('#artifact-viewer button.secondary').click();
  for (let index = 0; index < 2; index += 1) await new Promise((done) => setImmediate(done));
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

  window.document.querySelector('.module-waiver-button').click();
  assert.match(window.document.querySelector('#module-waiver-title').textContent, /Verification/);
  window.document.querySelector('#module-waiver-reason').value = 'The change is sufficiently small.';
  window.document.querySelector('#module-waiver-confirm').click();
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(waiverCalls, [[
    'slice-attempt-1', 'verification', 'The change is sufficiently small.',
    'GateReeve Desktop: Skip Verification',
  ]]);

  window.document.querySelector('[data-view="modules"]').click();
  for (let index = 0; index < 3; index += 1) await new Promise((done) => setImmediate(done));
  assert.equal(window.document.querySelectorAll('.module-setting').length, 2);
  assert.equal(window.document.querySelector('#module-setting-gatereeve-pin-context').disabled, true);
  const judgeSetting = window.document.querySelector('#module-setting-gatereeve-judge');
  judgeSetting.checked = false;
  judgeSetting.dispatchEvent(new window.Event('change'));
  await new Promise((done) => setImmediate(done));
  assert.match(window.document.querySelector('#module-preview').textContent, /Judge: enabled → disabled/);
  window.document.querySelector('#module-apply').click();
  assert.equal(window.document.querySelector('#module-confirm-dialog').hasAttribute('open'), true);
  assert.match(window.document.querySelector('#module-confirm-impact').textContent, /Boundary gates invalidated.*judge/s);
  window.document.querySelector('#module-confirm-apply').click();
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(modulePolicyCalls.at(-1), [
    'apply', ['gatereeve/pin-context'], true, 'GateReeve Desktop module settings',
  ]);

  window.document.querySelector('[data-view="artifacts"]').click();
  window.document.querySelector('[data-artifact-id="design"]').click();
  await new Promise((done) => setImmediate(done));
  assert.equal(window.document.querySelector('#inspector-panel').hidden, false);
  assert.equal(window.document.querySelectorAll('.inspector-tab').length, 0);
  window.document.querySelector('[data-artifact-id="design"]').click();
  await new Promise((done) => setImmediate(done));
  assert.equal(window.document.querySelectorAll('.inspector-tab').length, 0);
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /design\.md/);
  assert.equal(window.document.querySelector('#artifact-viewer h1')?.textContent, 'Design');
  assert.match(window.document.querySelector('#artifact-viewer').textContent, /Approved\./);
  assert.equal(window.document.querySelectorAll('.view-modes .viewer-icon').length, 2);
  window.document.querySelector('[aria-label="Open in default application"]').click();
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(openedArtifacts, [['design']]);
  const fileMenu = window.document.querySelector('.open-menu');
  fileMenu.open = true;
  assert.deepEqual(
    [...fileMenu.querySelectorAll('.open-menu-heading')].map((heading) => heading.textContent),
    ['Open with', 'File location', 'Save a copy', 'Utilities'],
  );
  [...fileMenu.querySelectorAll('button')].find((button) => button.textContent === 'VS Code').click();
  [...fileMenu.querySelectorAll('button')].find((button) => button.textContent === 'Open on GitHub').click();
  [...fileMenu.querySelectorAll('button')].find((button) => button.textContent === 'Save As…').click();
  [...fileMenu.querySelectorAll('button')].find((button) => button.textContent === 'Save to Downloads').click();
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(openedArtifacts, [['design'], ['design', 'vscode', true]]);
  assert.equal(
    window.document.querySelector('.open-split > button').getAttribute('aria-label'),
    'Open in VS Code',
  );
  assert.deepEqual(fileActions, [
    ['github', 'design'], ['save-as', 'design'], ['downloads', 'design'],
  ]);
  window.document.querySelector('[aria-label="Show Markdown source"]').click();
  assert.match(window.document.querySelector('.artifact-source').textContent, /# Design/);
  window.document.querySelector('[aria-label="Show rendered Markdown"]').click();
  assert.equal(window.document.querySelector('.artifact-source'), null);
  window.document.querySelector('[aria-label="Copy artifact contents"]').click();
  await new Promise((done) => setImmediate(done));
  assert.equal(copied.at(-1), '# Design\nApproved.');
  const expandInspector = window.document.querySelector('[data-expand-inspector]');
  expandInspector.click();
  assert.equal(window.document.body.classList.contains('inspector-expanded'), true);
  assert.equal(expandInspector.getAttribute('aria-label'), 'Restore artifact viewer');
  expandInspector.click();
  assert.equal(window.document.body.classList.contains('inspector-expanded'), false);
  window.document.querySelector('#toggle-inspector').click();
  assert.equal(window.document.querySelector('#inspector-panel').hidden, true);
  assert.equal(window.document.querySelectorAll('.inspector-tab').length, 0);
  window.document.querySelector('#toggle-inspector').click();
  assert.equal(window.document.querySelector('#inspector-panel').hidden, false);
  window.document.querySelector('[data-artifact-id="attempt:slice-attempt-1:gate:explainDiff"]').click();
  await new Promise((done) => setImmediate(done));
  assert.equal(window.document.querySelectorAll('.inspector-tab').length, 0);
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
  assert.equal(window.document.querySelector('#session-detail table') !== null, true);
  assert.equal(window.document.querySelector('#session-detail input:disabled') !== null, true);
  assert.match(
    window.document.querySelector('#session-detail').textContent,
    /\[External context\]\(https:\/\/example\.com\/context\)/u,
  );
  assert.equal(window.document.querySelector('#session-detail a'), null);

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
