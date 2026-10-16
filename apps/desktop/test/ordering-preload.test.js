import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { requireModulePolicyApplyRequest, requireModulePolicyRequest } from '../shared/contracts.js';

test('real preload carries Run after choices through preview and apply IPC and rejects malformed ordering', async () => {
  const source = await readFile(new URL('../preload/index.cjs', import.meta.url), 'utf8');let api;const requests = [];
  const settings = { schemaVersion: 1, policyPath: '/repo/.gatereeve/workflow.json', policyExists: true, policyDigest: 'sha256:policy', featureModelHash: 'sha256:model', projectModelHash: 'sha256:model', migrationRequired: false, modules: [], ordering: {}, edges: [] };
  const preview = { schemaVersion: 1, valid: true, error: null, autoEnabled: [], blockingDependents: [], enabledModuleIds: [], suggestedEnabledModuleIds: [], diff: [], migrationImpact: null, ordering: {}, orderingChanged: true, edges: [] };
  runInNewContext(source, { structuredClone, URL, console, require(name) {
    assert.equal(name, 'electron');return { contextBridge: { exposeInMainWorld(name, value) { api = value; } }, ipcRenderer: { async invoke(channel, request) { requests.push({ channel, request });return channel.includes('preview') ? preview : settings; }, on() {}, removeListener() {} } };
  } });
  const ordering = { 'gatereeve/judge': { after: ['gatereeve/code-review'] } };
  await api.previewModulePolicy(['gatereeve/judge'], ordering);
  assert.deepEqual(requireModulePolicyRequest(structuredClone(requests.at(-1).request)).ordering, ordering);
  await api.applyModulePolicy(['gatereeve/judge'], true, 'Confirmed owner choice', ordering, 'sha256:policy', 'sha256:preview');
  const request = requireModulePolicyApplyRequest(structuredClone(requests.at(-1).request));assert.deepEqual(request.ordering, ordering);assert.equal(request.expectedPolicyDigest, 'sha256:policy');assert.equal(request.expectedPreviewFingerprint, 'sha256:preview');
  const count = requests.length;await assert.rejects(api.previewModulePolicy([], { 'gatereeve/judge': { after: ['gatereeve/judge'] } }), /ordering/);assert.equal(requests.length, count);
});
