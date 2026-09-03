import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkspaceStore, workspaceDefaults } from '../renderer/workspace-state.js';

const design = {
  id: 'design', label: 'Approved design', path: 'design.md', format: 'markdown',
  status: 'present', exists: true, unsafe: false,
};

test('workspace state is isolated per canonical project and remains serializable', () => {
  const store = createWorkspaceStore();
  store.setMainView('/project/a', 'artifacts');
  store.openArtifact('/project/a', design);
  store.toggleTerminal('/project/a', true);
  store.setInspectorWidth('/project/a', 530);
  store.setHierarchy('/project/a', {
    selectedFeatureState: 'DELIVERING_SLICES',
    selectedSliceId: 'slice-2',
    selectedAttemptId: 'attempt-2',
    selectedGateId: 'verification',
  });

  assert.equal(store.get('/project/a').mainView, 'artifacts');
  assert.equal(store.get('/project/a').tabs.length, 1);
  assert.equal(store.get('/project/a').terminalVisible, true);
  assert.deepEqual({
    selectedFeatureState: store.get('/project/a').selectedFeatureState,
    selectedSliceId: store.get('/project/a').selectedSliceId,
    selectedAttemptId: store.get('/project/a').selectedAttemptId,
    selectedGateId: store.get('/project/a').selectedGateId,
  }, {
    selectedFeatureState: 'DELIVERING_SLICES',
    selectedSliceId: 'slice-2',
    selectedAttemptId: 'attempt-2',
    selectedGateId: 'verification',
  });
  assert.equal(store.get('/project/b').mainView, 'overview');
  assert.equal(store.get('/project/b').tabs.length, 0);
  assert.equal(store.get('/project/b').terminalVisible, false);
  assert.equal(store.get('/project/b').selectedFeatureState, null);
  assert.deepEqual(JSON.parse(JSON.stringify(store.snapshot('/project/a'))), store.snapshot('/project/a'));
});

test('document tabs deduplicate by canonical path and close to the nearest tab', () => {
  const store = createWorkspaceStore();
  store.openArtifact('/project', design);
  store.openArtifact('/project', { ...design, id: 'gate:design', label: 'Design evidence' });
  store.openArtifact('/project', {
    id: 'spec', label: 'Specification', path: 'spec.md', format: 'markdown',
    status: 'present', exists: true, unsafe: false,
  });

  assert.deepEqual(store.get('/project').tabs.map((tab) => tab.id), [
    'document:design.md', 'document:spec.md',
  ]);
  store.closeTab('/project', 'document:spec.md');
  assert.equal(store.get('/project').activeTabId, 'document:design.md');
  store.closeTab('/project', 'document:design.md');
  assert.equal(store.get('/project').activeTabId, null);
});

test('hiding panels preserves tabs and width while reconciliation marks stale content unavailable', () => {
  const store = createWorkspaceStore();
  store.openArtifact('/project', design);
  store.toggleInspector('/project', false);
  store.setInspectorWidth('/project', 10_000);
  store.reconcile('/project', []);

  const workspace = store.get('/project');
  assert.equal(workspace.inspectorVisible, false);
  assert.equal(workspace.inspectorWidth, workspaceDefaults.maxInspectorWidth);
  assert.equal(workspace.tabs.length, 1);
  assert.equal(workspace.tabs[0].available, false);
  assert.equal(workspace.tabs[0].status, 'unavailable');
});

test('virtual gate tabs retain scoped attempt and gate identity', () => {
  const store = createWorkspaceStore();
  store.openGate('/project', 'attempt-1', { id: 'reconcile', outcome: 'PASS', orderLabel: '2' });
  store.openGate('/project', 'attempt-2', { id: 'reconcile', outcome: 'FAIL', orderLabel: '2' });

  assert.deepEqual(store.get('/project').tabs.map((tab) => tab.id), [
    'gate:attempt-1:reconcile', 'gate:attempt-2:reconcile',
  ]);
});

test('virtual module tabs retain module identity and deduplicate across refreshes', () => {
  const store = createWorkspaceStore();
  const module = {
    id: 'gatereeve/release', slot: 'feature.finalization', label: 'GateReeve Release',
    readiness: { status: 'available', missing: [] }, live: null,
  };
  store.openModule('/project', module);
  store.openModule('/project', { ...module, live: { status: 'running' } });

  assert.deepEqual(store.get('/project').tabs, [{
    id: 'module:gatereeve/release',
    kind: 'module',
    moduleId: 'gatereeve/release',
    slot: 'feature.finalization',
    label: 'GateReeve Release',
    status: 'running',
    available: true,
  }]);
  assert.equal(store.get('/project').activeTabId, 'module:gatereeve/release');
  assert.equal(store.get('/project').inspectorVisible, true);
});
