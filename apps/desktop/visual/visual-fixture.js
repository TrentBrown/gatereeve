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
  id: 'desktop-shell-observation-attempt-1',
  sliceId: 'desktop-shell-observation',
  scope: 'SLICE',
  state: 'PASSED',
  context: { pullRequest: 4 },
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
    evidence: id === 'patternReview' ? null : { path: `pr-4/${id}.md` },
    recordedEventId: `evt-gate-${index + 1}`,
  })),
};

const artifacts = [
  ['design', 'Approved design', 'design.md', 'markdown', 'present'],
  ['spec', 'Validated specification', 'spec.md', 'markdown', 'present'],
  ['plan', 'Authorized implementation plan', 'plan.md', 'markdown', 'present'],
  ['tracker', 'Rubric tracker', 'tracker.md', 'markdown', 'changed'],
  ['decisions', 'Permanent decisions', 'decisions.md', 'markdown', 'present'],
  ['attempt:desktop-shell-observation-attempt-1:gate:explainDiff', 'Explain diff evidence', 'pr-4/explain-diff.html', 'html', 'present'],
].map(([id, label, path, format, status]) => ({
  id, label, path, format, status, exists: true, unsafe: false, context: { kind: 'feature' },
}));

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
    slices: [
      { id: 'desktop-observer-contract', name: 'Canonical observer contract', state: 'MERGED', branch: 'gatereeve-desktop', scope: 'SLICE', planSteps: ['P1', 'P2', 'P3'], activeAttemptId: null },
      { id: 'desktop-shell-observation', name: 'Electron shell and observation lifecycle', state: 'MERGED', branch: 'gatereeve-desktop-shell', scope: 'SLICE', planSteps: ['P4', 'P5'], activeAttemptId: null },
      { id: 'desktop-workflow-experience', name: 'State-first workflow and inspection experience', state: 'IMPLEMENTING', branch: 'gatereeve-desktop-workflow-experience', scope: 'SLICE', planSteps: ['P6', 'P7'], activeAttemptId: null },
    ],
    boundaryAttempts: [attempt],
  },
  active: { sliceId: 'desktop-workflow-experience', boundaryAttemptId: null },
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
  error: null,
  preferences: { recentWorktrees: [] },
};

window.gatereeveDesktop = Object.freeze({
  async getState() { return state; },
  subscribe() { return () => {}; },
  async chooseWorktree() { return state; },
  async openRecent() { return state; },
  async refresh() { return state; },
  async copyText() { return true; },
  async openArtifact() { return true; },
  async revealArtifact() { return true; },
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
    return { kind, data: { artifact, content: '# GateReeve artifact\n\nThis is a representative visual fixture.', structured: null } };
  },
});
