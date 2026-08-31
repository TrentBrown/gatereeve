import assert from 'node:assert/strict';
import test from 'node:test';

import {
  actionMeaning,
  attemptArtifact,
  featureStates,
  gateArtifact,
  globalAlert,
  humanize,
  modeMessage,
  phaseContext,
  selectedAttempt,
  selectedSlice,
  stateArtifact,
} from '../renderer/presentation.js';

test('presentation derives the state rail from the pinned model and keeps exact IDs', () => {
  const snapshot = { projection: { feature: { state: 'PLANNING' } } };
  const model = {
    data: { lock: { model: { presentation: { featureOrder: [
      'DESIGNING', 'SPECIFYING', 'PLANNING', 'DELIVERING_SLICES',
    ] } } } },
  };
  assert.deepEqual(featureStates(snapshot, model).map(({ id, position }) => ({ id, position })), [
    { id: 'DESIGNING', position: 'complete' },
    { id: 'SPECIFYING', position: 'complete' },
    { id: 'PLANNING', position: 'current' },
    { id: 'DELIVERING_SLICES', position: 'pending' },
  ]);
  assert.equal(humanize('boundary.request-review'), 'Boundary request review');
});

test('presentation keeps governed workflow state distinct from observational selection', () => {
  const snapshot = {
    projection: { feature: { state: 'DELIVERING_SLICES' } },
    artifacts: [
      { id: 'design', path: 'design.md' },
      { id: 'spec', path: 'spec.md' },
      { id: 'plan', path: 'plan.md' },
      { id: 'completion-report', path: 'completion-report.md' },
    ],
  };
  const model = {
    data: { lock: { model: { presentation: { featureOrder: [
      'DESIGNING', 'DELIVERING_SLICES', 'COMPLETE',
    ] } } } },
  };

  const states = featureStates(snapshot, model, 'DESIGNING');
  assert.equal(states.find(({ id }) => id === 'DELIVERING_SLICES').current, true);
  assert.equal(states.find(({ id }) => id === 'DELIVERING_SLICES').selected, false);
  assert.equal(states.find(({ id }) => id === 'DESIGNING').selected, true);
  assert.equal(stateArtifact(snapshot, 'DESIGNING').path, 'design.md');
  assert.equal(stateArtifact(snapshot, 'SPECIFYING').path, 'spec.md');
  assert.equal(stateArtifact(snapshot, 'PLANNING').path, 'plan.md');
  assert.equal(stateArtifact(snapshot, 'DELIVERING_SLICES'), null);
  assert.equal(stateArtifact(snapshot, 'COMPLETE').path, 'completion-report.md');
});

test('phase context resolves approved recipes against canonical artifact inventory', () => {
  const snapshot = {
    artifacts: [
      { id: 'interview', path: 'interview.md', status: 'present', exists: true, unsafe: false },
      { id: 'design', path: 'design.md', status: 'changed', exists: true, unsafe: false },
      { id: 'spec', path: 'spec.md', status: 'pending', exists: false, unsafe: false },
      { id: 'plan', path: 'plan.md', status: 'pending', exists: false, unsafe: false },
      { id: 'issues', path: 'issues.md', status: 'missing', exists: false, unsafe: true },
      { id: 'tracker', path: 'tracker.md', status: 'present', exists: true, unsafe: false },
    ],
  };

  const designing = phaseContext(snapshot, 'DESIGNING');
  assert.equal(designing.title, 'Design synthesis');
  assert.deepEqual(designing.uses.map(({ kind, id }) => ({ kind, id })), [
    { kind: 'artifact', id: 'interview' },
    { kind: 'source', id: 'existing-codebase' },
  ]);
  assert.equal(designing.produces[0].artifact, snapshot.artifacts[1]);
  assert.equal(designing.produces[0].status, 'changed');

  const specifying = phaseContext(snapshot, 'SPECIFYING');
  assert.deepEqual(specifying.uses.map(({ id }) => id), [
    'design', 'interview', 'existing-codebase', 'architecture-contracts',
  ]);
  assert.equal(specifying.produces[0].status, 'pending');
  assert.equal(specifying.produces[0].disabled, false);

  const planning = phaseContext(snapshot, 'PLANNING');
  assert.deepEqual(planning.uses.map(({ id }) => id), [
    'spec', 'design', 'interview', 'repository-structure', 'tests-and-commands',
  ]);
  assert.deepEqual(planning.produces.map(({ id }) => id), ['plan', 'issues', 'tracker']);
  assert.equal(planning.produces[1].disabled, true);
  for (const state of ['DELIVERING_SLICES', 'FINALIZING', 'COMPLETE']) {
    assert.equal(phaseContext(snapshot, state), null);
  }
});

test('phase context keeps a disabled unavailable entry when inventory metadata is absent', () => {
  const context = phaseContext({ artifacts: [] }, 'DESIGNING');
  assert.deepEqual(
    context.uses[0],
    {
      kind: 'artifact', id: 'interview', fileName: 'interview.md', artifact: null,
      status: 'unavailable', disabled: true,
    },
  );
});

test('hierarchy selection stays scoped to the selected slice and attempt', () => {
  const snapshot = {
    active: { sliceId: 'slice-2', boundaryAttemptId: 'attempt-2' },
    projection: {
      slices: [
        { id: 'slice-1', deliveryOrdinal: 1, activeAttemptId: 'attempt-1' },
        { id: 'slice-2', deliveryOrdinal: 2, activeAttemptId: 'attempt-2' },
        { id: 'slice-3', deliveryOrdinal: 3, activeAttemptId: null },
      ],
      boundaryAttempts: [
        { id: 'attempt-1', sliceId: 'slice-1' },
        { id: 'attempt-2', sliceId: 'slice-2' },
        { id: 'attempt-2-old', sliceId: 'slice-2' },
      ],
    },
  };

  assert.equal(selectedSlice(snapshot), 'slice-2');
  assert.equal(selectedSlice(snapshot, 'slice-1'), 'slice-1');
  assert.equal(selectedAttempt(snapshot, 'slice-2'), 'attempt-2');
  assert.equal(selectedAttempt(snapshot, 'slice-2', 'attempt-2-old'), 'attempt-2-old');
  assert.equal(selectedAttempt(snapshot, 'slice-3'), null);
});

test('attempt and gate artifacts resolve only canonical scoped evidence', () => {
  const snapshot = {
    artifacts: [
      { id: 'boundary', path: 'pr-8/boundary.json', context: { attemptId: 'attempt-1' } },
      { id: 'verification', path: 'pr-8/verification.md', context: { attemptId: 'attempt-1', gateId: 'verification' } },
      { id: 'artifactless', path: null, context: { attemptId: 'attempt-1', gateId: 'reconcile' } },
      { id: 'other', path: 'pr-9/verification.md', context: { attemptId: 'attempt-2', gateId: 'verification' } },
    ],
  };

  assert.equal(attemptArtifact(snapshot, 'attempt-1').id, 'boundary');
  assert.equal(gateArtifact(snapshot, 'attempt-1', 'verification').id, 'verification');
  assert.equal(gateArtifact(snapshot, 'attempt-1', 'reconcile'), null);
  assert.equal(gateArtifact(snapshot, 'attempt-2', 'verification').id, 'other');
});

test('diagnostic and action explanations distinguish observation from workflow passage', () => {
  assert.match(modeMessage({ mode: 'missing', blockers: [] }), /will not initialize or adopt/i);
  assert.match(modeMessage({ mode: 'legacy', blockers: [] }), /legacy workflow records/i);
  assert.match(modeMessage({ mode: 'inconsistent', blockers: [] }), /internally inconsistent/i);
  assert.match(modeMessage({ mode: 'incompatible', blockers: [] }), /will not reinterpret or migrate/i);
  assert.match(modeMessage({
    mode: 'governed', blockers: [], projection: { suspension: { paused: true } },
  }), /suspended/i);
  assert.match(actionMeaning('slice record-merge one'), /exact reviewed content/i);
});

test('global alerts reserve headline visibility for exceptional workflow conditions', () => {
  assert.equal(globalAlert({
    mode: 'governed',
    warnings: [{ type: 'source-uncommitted', severity: 'activity' }],
  }), null);

  const governance = globalAlert({
    mode: 'governed',
    warnings: [
      { type: 'journal-uncommitted', severity: 'warning' },
      { type: 'model-uncommitted', severity: 'warning' },
      { type: 'journal-uncommitted', severity: 'warning' },
    ],
  });
  assert.equal(governance.tone, 'warning');
  assert.equal(governance.items.length, 2);
  assert.match(governance.items.join(' '), /Journal uncommitted/);

  const incompatible = globalAlert({ mode: 'incompatible', warnings: [], blockers: [] });
  assert.equal(incompatible.tone, 'danger');
  assert.match(incompatible.items[0], /will not reinterpret or migrate/i);

  const runtime = globalAlert({ mode: 'governed', warnings: [] }, new Error('Observer failed'));
  assert.equal(runtime.tone, 'danger');
  assert.deepEqual(runtime.items, ['Observer failed']);
});
