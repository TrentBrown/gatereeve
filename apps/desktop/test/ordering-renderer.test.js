import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { initializeFeature, readFeatureRecord } from '../../../plugin-src/shared/resources/protocol/feature.js';
import { createModulePolicyManager } from '../main/module-policy.js';
import { createProtocolAdapter } from '../main/protocol-adapter.js';
import { requireModulePolicyPreview, requireModuleSettings } from '../shared/contracts.js';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function waitFor(test, label) { for (let i = 0; i < 100; i += 1) { if (test()) return;await new Promise(r => setTimeout(r, 10)); }assert.fail(`Timed out: ${label}`); }

test('Run after edits preview exact edges, discard/cancel write nothing, and ordering-only apply requires explicit confirmation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-ordering-ui-'));const home = join(root, 'feature');
  await initializeFeature({ featureHome: home, featureId: 'ordering-ui', actor: { kind: 'agent', label: 'UI integration fixture' } });
  const manager = createModulePolicyManager();const protocol = createProtocolAdapter();
  const before = (await readFeatureRecord(home)).events.length;
  const { window } = parseHTML(await readFile(resolve(desktopRoot, 'renderer/index.html'), 'utf8'));
  const update = { schemaVersion: 1, status: 'idle', source: null, currentVersion: '0.1.0', checkedAt: null, available: null, detail: null };
  const state = { schemaVersion: 1, phase: 'ready', refreshing: false, githubPolling: false, selection: { worktreePath: root, featureHome: home }, snapshot: await protocol.snapshot(home), error: null, setup: { schemaVersion: 1, phase: 'ready', operationalReady: true, checkedAt: null, desktop: { version: '0.1.0' }, selectedAgents: ['codex'], prerequisites: [], agents: [] }, preferences: { notificationsEnabled: false, projectPaths: [], selectedAgents: ['codex'], terminalHeight: 260 } };
  let applies = 0;
  window.gatereeveDesktop = {
    async getState() { return state; }, async getUpdateState() { return update; }, async checkForUpdates() { return update; },
    async getModuleSettings() { return requireModuleSettings(await manager.inspect(root, home)); },
    async previewModulePolicy(enabled, ordering) { const { policy, nextModel, ...preview } = await manager.preview(root, home, enabled, ordering);return requireModulePolicyPreview(preview); },
    async applyModulePolicy(enabled, confirmedMigration, confirmationLabel, ordering) { applies += 1;return requireModuleSettings(await manager.apply(root, home, enabled, { confirmedMigration, confirmationLabel, ordering })); },
    async readDetail(kind, id) { return protocol.read(home, kind, id); }, async refresh() { return state; },
    subscribe() { return () => {}; },subscribeUpdates() { return () => {}; },
  };
  globalThis.window = window;globalThis.document = window.document;
  try {
    await import(`${pathToFileURL(resolve(desktopRoot, 'renderer/renderer.js')).href}?test=owner-ordering-ui`);
    window.document.querySelector('[data-view="modules"]').click();
    const runAfter = () => window.document.querySelector('input[aria-label="Run Judge after Code Review"]');
    const changed = () => { const input = runAfter();input.checked = true;input.dispatchEvent(new window.Event('change')); };
    await waitFor(() => runAfter(), 'Run after control');
    const protectedInput = window.document.querySelector('input[aria-label="Run Judge after Verification"]');assert.equal(protectedInput.checked, true);assert.equal(protectedInput.disabled, true);
    changed();await waitFor(() => !window.document.getElementById('module-apply').disabled, 'ordering-only Apply');
    assert(window.document.querySelector('#module-preview [data-edge-from="gatereeve/code-review"][data-edge-to="gatereeve/judge"][data-edge-kind="owner"]'));
    window.document.getElementById('module-discard').click();assert.equal(runAfter().checked, false);assert.equal((await readFeatureRecord(home)).events.length, before);
    changed();await waitFor(() => !window.document.getElementById('module-apply').disabled, 'restaged ordering');
    window.document.getElementById('module-apply').click();assert.equal(window.document.getElementById('module-confirm-dialog').hasAttribute('open'), true);
    window.document.getElementById('module-confirm-cancel').click();assert.equal(applies, 0);assert.equal((await readFeatureRecord(home)).events.length, before);
    window.document.getElementById('module-apply').click();window.document.getElementById('module-confirm-apply').click();
    await waitFor(() => !window.document.getElementById('module-confirm-dialog').hasAttribute('open'), 'confirmed ordering apply');
    assert.equal(applies, 1);assert.equal(runAfter().checked, true);
    const saved = JSON.parse(await readFile(join(root, '.gatereeve/workflow.json')));assert.deepEqual(saved.ordering, { 'gatereeve/judge': { after: ['gatereeve/code-review'] } });
    assert.equal((await readFeatureRecord(home)).events.at(-1).type, 'MODEL_MIGRATED');
  } finally { delete globalThis.window;delete globalThis.document; }
});
