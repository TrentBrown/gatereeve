const model = {
  kind: 'model',
  data: {
    lock: { model: { presentation: { featureOrder: [
      'DESIGNING', 'SPECIFYING', 'PLANNING', 'DELIVERING_SLICES', 'FINALIZING', 'COMPLETE',
    ] } } },
    provenance: {
      pinned: { id: 'gatereeve/workflow', version: '1.0.0', hash: 'sha256:5c202ae9…', coreVersion: '1.0.0' },
      bundled: { id: 'gatereeve/workflow', version: '1.0.0', hash: 'sha256:5c202ae9…', protocolVersion: '1.0.0' },
      migration: { relationship: 'same', available: false },
    },
    graph: {
      nodes: [
        { id: 'feature:DESIGNING', label: 'DESIGNING', group: 'Feature lifecycle' },
        { id: 'feature:SPECIFYING', label: 'SPECIFYING', group: 'Feature lifecycle' },
        { id: 'feature:PLANNING', label: 'PLANNING', group: 'Feature lifecycle' },
        { id: 'feature:DELIVERING_SLICES', label: 'DELIVERING_SLICES', group: 'Feature lifecycle' },
        { id: 'feature:FINALIZING', label: 'FINALIZING', group: 'Feature lifecycle' },
        { id: 'feature:COMPLETE', label: 'COMPLETE', group: 'Feature lifecycle' },
      ],
      edges: [
        { from: 'feature:DESIGNING', to: 'feature:SPECIFYING', label: 'approve design', authority: 'human-confirmation' },
        { from: 'feature:SPECIFYING', to: 'feature:PLANNING', label: 'validate spec', authority: 'agent' },
        { from: 'feature:PLANNING', to: 'feature:DELIVERING_SLICES', label: 'authorize plan', authority: 'human-confirmation' },
      ],
      mermaid: 'flowchart LR\n  DESIGNING --> SPECIFYING --> PLANNING --> DELIVERING_SLICES --> FINALIZING --> COMPLETE',
    },
  },
};

const attempt = {
  id: 'desktop-final-quality-attempt-1',
  sliceId: 'desktop-final-quality',
  scope: 'FEATURE_FINAL',
  state: 'ACTIVE',
  context: { pullRequest: 29 },
  gates: [
    ['pinContext', [], 'PASS'],
    ['reconcile', ['pinContext'], 'PASS'],
    ['verification', ['reconcile'], 'PASS'],
    ['specEvaluation', ['verification'], 'PASS'],
    ['patternReview', ['verification'], 'NOT_APPLICABLE'],
    ['judge', ['verification'], 'PASS'],
    ['codeReview', ['verification'], 'PASS'],
    ['decisionTriage', ['specEvaluation', 'patternReview', 'judge', 'codeReview'], 'PASS'],
    ['explainDiff', ['decisionTriage'], 'PASS'],
    ['packetValidation', ['explainDiff'], 'PASS'],
  ].map(([id, dependsOn, outcome], index) => ({
    id, dependsOn, outcome, freshness: 'CURRENT', blockers: [], reason: null,
    dependencyStage: index < 3 ? index + 1 : index < 7 ? 4 : index - 2,
    dependencyBranch: index >= 3 && index < 7 ? String.fromCharCode(97 + index - 3) : null,
    orderLabel: index >= 3 && index < 7 ? `4${String.fromCharCode(97 + index - 3)}` : String(index < 3 ? index + 1 : index - 2),
    evidence: id === 'patternReview' ? null : { path: `pr-29/${id}.md` },
    recordedEventId: `evt-gate-${index + 1}`,
  })),
};

const artifacts = [
  ['design', 'Approved design', 'design.md', 'markdown', 'present'],
  ['spec', 'Validated specification', 'spec.md', 'markdown', 'present'],
  ['plan', 'Authorized implementation plan', 'plan.md', 'markdown', 'present'],
  ['tracker', 'Rubric tracker', 'tracker.md', 'markdown', 'changed'],
  ['decisions', 'Permanent decisions', 'decisions.md', 'markdown', 'present'],
  ['completion-report', 'Completion report', 'completion-report.md', 'markdown', 'present'],
].map(([id, label, path, format, status]) => ({
  id, label, path, format, status, exists: true, unsafe: false, context: { kind: 'feature' },
})).concat([
  {
    id: 'attempt:desktop-final-quality-attempt-1:boundary',
    label: 'PR boundary', path: 'pr-29/boundary.json', format: 'json', status: 'present',
    exists: true, unsafe: false,
    context: { kind: 'attempt', attemptId: 'desktop-final-quality-attempt-1' },
  },
  {
    id: 'attempt:desktop-final-quality-attempt-1:gate:explainDiff',
    label: 'Explain diff evidence', path: 'pr-29/explain-diff.html', format: 'html', status: 'present',
    exists: true, unsafe: false,
    context: { kind: 'gate', attemptId: 'desktop-final-quality-attempt-1', gateId: 'explainDiff' },
  },
]);

const events = [
  ['SLICE_MERGE_RECORDED', 'agent'],
  ['SLICE_PROPOSED', 'agent'],
  ['SLICE_PLANNED', 'agent'],
  ['SLICE_STARTED', 'agent'],
].map(([type, kind], index) => ({
  sequence: 69 + index,
  eventId: `evt-visual-${index}`,
  recordedAt: `2026-08-26T23:1${index}:00.000Z`,
  type,
  actor: { kind, label: 'gatereeve CLI' },
  modelHash: 'sha256:5c202ae9…',
  payload: { passage: { transitionId: type.toLowerCase().replaceAll('_', '-'), guards: [] } },
}));

const snapshot = {
  schemaVersion: 1,
  mode: 'governed',
  featureId: 'gatereeve-desktop',
  model: { pinned: { hash: 'sha256:5c202ae9…' }, bundled: {}, migration: { available: false } },
  projection: {
    feature: { state: 'DELIVERING_SLICES' },
    suspension: { paused: false },
    activeSliceId: 'desktop-final-quality',
    slices: [
      { id: 'desktop-observer-contract', deliveryOrdinal: 1, name: 'Canonical observer contract', state: 'MERGED', branch: 'gatereeve-desktop', scope: 'SLICE', planSteps: ['P1', 'P2', 'P3'], activeAttemptId: null },
      { id: 'desktop-shell-observation', deliveryOrdinal: 2, name: 'Electron shell and observation lifecycle', state: 'MERGED', branch: 'gatereeve-desktop-shell', scope: 'SLICE', planSteps: ['P4', 'P5'], activeAttemptId: null },
      { id: 'desktop-workflow-experience', deliveryOrdinal: 3, name: 'State-first workflow and inspection experience', state: 'MERGED', branch: 'gatereeve-desktop-workflow-experience', scope: 'SLICE', planSteps: ['P6', 'P7'], activeAttemptId: null },
      { id: 'desktop-final-quality', deliveryOrdinal: 4, name: 'Notifications, accessibility, and final verification', state: 'PR_BOUNDARY', branch: 'gatereeve-desktop-notifications-accessibility', scope: 'FEATURE_FINAL', planSteps: ['P8', 'P9'], activeAttemptId: 'desktop-final-quality-attempt-1' },
    ],
    boundaryAttempts: [attempt],
  },
  active: { sliceId: 'desktop-final-quality', boundaryAttemptId: 'desktop-final-quality-attempt-1' },
  sources: {
    local: { status: 'current', detail: 'Canonical record read locally' },
    git: { status: 'current', detail: 'Topic branch · source changes present' },
    github: { status: 'not-checked', detail: 'No open PR yet' },
  },
  blockers: [],
  warnings: [{ type: 'source-uncommitted', severity: 'activity' }],
  milestones: [{ id: 'delivery.slice-active', label: 'Delivery slice active', state: 'DELIVERING_SLICES', status: 'active' }],
  actions: [{
    id: 'slice.begin.boundary.desktop.workflow.experience',
    command: 'slice begin-boundary desktop-workflow-experience',
    copyCommand: 'gatereeve slice begin-boundary desktop-workflow-experience --payload-file "<boundary-passage.json>"',
    authority: 'agent', readiness: 'ready', inputs: [{ id: 'payloadFile' }], reasons: [],
  }],
  artifacts,
  events: { count: 72, lastEventId: events.at(-1).eventId, recent: events },
};

const fixtureScenario = new URLSearchParams(window.location.search).get('scenario') ?? 'source-activity';
const fixtureScenarios = {
  'source-activity': () => {},
  'governance': () => {
    snapshot.warnings = [
      { type: 'journal-uncommitted', severity: 'warning' },
      { type: 'model-uncommitted', severity: 'warning' },
    ];
  },
  'suspended': () => { snapshot.projection.suspension.paused = true; },
  'inconsistent': () => { snapshot.mode = 'inconsistent'; },
  'incompatible': () => { snapshot.mode = 'incompatible'; },
  'runtime': () => {},
  'no-actions': () => { snapshot.actions = []; },
  'candidate-diagnostic': () => {},
  'multi-project': () => {},
  'setup-incomplete': () => {},
  'gate-blocked': () => {
    const verification = attempt.gates.find((gate) => gate.id === 'verification');
    verification.outcome = 'FAIL';
    verification.reason = 'The verification evidence is not current for this boundary.';
    verification.blockers = [{ message: 'Refresh verification before requesting review.' }];
  },
};
fixtureScenarios[fixtureScenario]?.();

const state = {
  schemaVersion: 1,
  phase: 'ready',
  refreshing: false,
  githubPolling: false,
  selection: {
    worktreePath: '/home/trent/code/tb/gatereeve-desktop',
    featureHome: '/home/trent/code/tb/gatereeve-desktop/docs/issues/gatereeve-desktop',
  },
  snapshot,
  error: fixtureScenario === 'runtime' ? { message: 'The canonical observer failed to refresh.' } : null,
  projects: [{
    path: '/home/trent/code/tb/gatereeve-desktop',
    name: 'gatereeve-desktop',
    status: 'ready',
    featureHome: '/home/trent/code/tb/gatereeve-desktop/docs/issues/gatereeve-desktop',
    featureId: 'gatereeve-desktop',
    workflowState: 'DELIVERING_SLICES',
    diagnostic: null,
  }],
  candidateDiagnostic: null,
  setup: {
    schemaVersion: 1,
    phase: 'ready',
    operationalReady: true,
    checkedAt: '2026-08-27T12:00:00.000Z',
    desktop: { version: '0.1.0' },
    selectedAgents: ['codex'],
    prerequisites: [
      {
        id: 'git', label: 'Git', status: 'present', version: '2.53.0',
        detail: 'Git 2.53.0 is available.', remediation: null,
      },
      {
        id: 'python', label: 'Python', status: 'present', version: '3.14.4',
        detail: 'Python 3.14.4 is available.', remediation: null,
      },
      {
        id: 'node', label: 'Node.js', status: 'present', version: '24.19.0',
        detail: 'Node.js 24.19.0 is available.', remediation: null,
      },
      {
        id: 'github', label: 'GitHub CLI', status: 'present', version: '2.98.0',
        detail: 'GitHub CLI 2.98.0 is available.', remediation: null,
      },
    ],
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
  preferences: {
    notificationsEnabled: false,
    projectPaths: ['/home/trent/code/tb/gatereeve-desktop'],
    selectedAgents: ['codex'],
  },
};

const incompatibleDiagnostic = {
  classification: 'incompatible',
  title: 'Model-incompatible feature record',
  message: 'This project pins a workflow model that this GateReeve Desktop cannot interpret safely.',
  selectedPath: '/home/trent/code/tb/future-gatereeve-project',
  featureHome: '/home/trent/code/tb/future-gatereeve-project/docs/issues/future-workflow',
  failedChecks: ['Pinned gatereeve/workflow@2.0.0 does not match supported gatereeve/workflow@1.0.0.'],
  pinnedModel: 'gatereeve/workflow@2.0.0',
  supportedModel: 'gatereeve/workflow@1.0.0',
};

if (fixtureScenario === 'candidate-diagnostic') state.candidateDiagnostic = incompatibleDiagnostic;
if (fixtureScenario === 'setup-incomplete') state.setup.operationalReady = false;
if (fixtureScenario === 'multi-project') {
  state.projects.push({
    path: incompatibleDiagnostic.selectedPath,
    name: 'future-gatereeve-project',
    status: 'needs-attention',
    featureHome: incompatibleDiagnostic.featureHome,
    featureId: 'future-workflow',
    workflowState: null,
    diagnostic: incompatibleDiagnostic,
  });
  state.preferences.projectPaths.push(incompatibleDiagnostic.selectedPath);
}

const updateState = {
  schemaVersion: 1,
  status: 'idle',
  source: null,
  currentVersion: '0.1.0',
  checkedAt: null,
  available: null,
  detail: null,
};

const fixtureActions = [];
let fixturePreferredEditorId = 'vscode';
let fixtureFailureArmed = false;

function simulateFixtureAction(action, detail) {
  const event = Object.freeze({
    action,
    detail,
    recordedAt: new Date().toISOString(),
  });
  fixtureActions.push(event);
  window.dispatchEvent(new CustomEvent('gatereeve:fixture-action', { detail: event }));
  if (fixtureFailureArmed) {
    fixtureFailureArmed = false;
    throw new Error(`Simulated fixture failure: ${action}`);
  }
  return true;
}

window.gatereeveFixture = Object.freeze({
  actions: () => [...fixtureActions],
  armFailure() { fixtureFailureArmed = true; },
  clear() {
    fixtureActions.length = 0;
    window.dispatchEvent(new CustomEvent('gatereeve:fixture-actions-cleared'));
  },
});

window.gatereeveDesktop = Object.freeze({
  async getState() { return state; },
  subscribe() { return () => {}; },
  async getUpdateState() { return updateState; },
  subscribeUpdates() { return () => {}; },
  async checkForUpdates() { return updateState; },
  async openUpdateRelease() { return simulateFixtureAction('Open update release', 'Official GitHub release'); },
  async openExternalLink(url) { return simulateFixtureAction('Open external link', url); },
  async addProject() { return state; },
  async activateProject(path) {
    const project = state.projects.find((item) => item.path === path);
    if (project?.diagnostic) state.candidateDiagnostic = project.diagnostic;
    else if (project) {
      state.candidateDiagnostic = null;
      state.selection = { worktreePath: project.path, featureHome: project.featureHome };
    }
    return state;
  },
  async removeProject(path) {
    const index = state.projects.findIndex((item) => item.path === path);
    if (index < 0) return state;
    const removingActive = state.selection?.worktreePath === path;
    state.projects.splice(index, 1);
    state.preferences.projectPaths = state.projects.map((item) => item.path);
    if (removingActive) {
      const nearest = state.projects[Math.min(index, state.projects.length - 1)] ?? null;
      state.selection = nearest ? { worktreePath: nearest.path, featureHome: nearest.featureHome } : null;
      state.snapshot = nearest ? snapshot : null;
    }
    return state;
  },
  async reorderProjects(paths) {
    const projects = new Map(state.projects.map((item) => [item.path, item]));
    state.projects = paths.map((path) => projects.get(path));
    state.preferences.projectPaths = [...paths];
    return state;
  },
  async refresh() { return state; },
  async recheckSetup() { return state; },
  async setSelectedAgents() { return state; },
  async setNotificationsEnabled(enabled) {
    state.preferences.notificationsEnabled = enabled;
    return state;
  },
  async copyText(value) { return simulateFixtureAction('Copy text', `${String(value).length} characters`); },
  async getArtifactActions() {
    return {
      schemaVersion: 1,
      editors: [
        { id: 'vscode', label: 'VS Code' },
        { id: 'cursor', label: 'Cursor' },
        { id: 'zed', label: 'Zed' },
        { id: 'sublime-text', label: 'Sublime Text' },
      ],
      preferredEditorId: fixturePreferredEditorId,
      githubAvailable: true,
    };
  },
  async openArtifact(artifactId, editorId = null, remember = false) {
    const selected = editorId === null ? fixturePreferredEditorId ?? 'default' : editorId;
    const completed = simulateFixtureAction('Open artifact', `${artifactId} with ${selected}`);
    if (remember) fixturePreferredEditorId = selected === 'default' ? null : selected;
    return completed;
  },
  async chooseArtifactApplication(artifactId) {
    return simulateFixtureAction('Choose Application…', `${artifactId} with a one-time app`);
  },
  async saveArtifactAs(artifactId) {
    return simulateFixtureAction('Save As…', `${artifactId} to a selected path`);
  },
  async saveArtifactDownloads(artifactId) {
    return simulateFixtureAction('Save to Downloads', `${artifactId} to ~/Downloads`);
  },
  async openArtifactGithub(artifactId) {
    return simulateFixtureAction('Open on GitHub', `${artifactId} at a commit-pinned URL`);
  },
  async revealArtifact(artifactId) {
    return simulateFixtureAction('Show in Finder', artifactId);
  },
  async listSession() {
    return { schemaVersion: 1, items: [{
      id: 'session:latest-checkpoint:Q0hFQ0tQT0lOVC5tZA',
      kind: 'latest-checkpoint', label: 'Latest checkpoint', path: 'CHECKPOINT.md',
      modifiedAt: '2026-08-26T23:13:00.000Z', size: 2048,
    }] };
  },
  async readSession(id) {
    const item = (await this.listSession()).items[0];
    return { schemaVersion: 1, id, item, content: '# Current position\n\nThe workflow experience slice is implementing.' };
  },
  async readDetail(kind, id) {
    if (kind === 'model') return model;
    if (kind === 'events') return { kind, data: { events } };
    if (kind === 'attempt') return { kind, data: { attempt } };
    const artifact = artifacts.find((item) => item.id === id);
    return {
      kind,
      data: {
        artifact,
        content: '# GateReeve artifact\n\n**Feature start:** safe and *current*. '
          + '[Read the spec](spec.md) or [jump to details](#details).\n\n'
          + '## Details\n\nThis is a representative visual fixture.',
        structured: artifact?.format === 'json' ? { attemptId: attempt.id, pullRequest: 29 } : null,
      },
    };
  },
});
