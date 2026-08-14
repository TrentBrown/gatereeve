import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  loadAndValidateNativeSources,
  validateNativeData,
} from '../src/plugin/native.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const sourceRoot = resolve(repositoryRoot, 'plugin-src');

async function readJson(path) {
  return JSON.parse(await readFile(resolve(sourceRoot, path), 'utf8'));
}

async function loadFixture() {
  return {
    inventory: await readJson('contracts/workflow-inventory.json'),
    platforms: await readJson('contracts/platform-contracts.json'),
    codex: {
      manifest: await readJson('codex/.codex-plugin/plugin.json'),
      hooks: await readJson('codex/hooks/hooks.json'),
      catalog: await readJson('catalogs/codex/marketplace.json'),
    },
    claude: {
      manifest: await readJson('claude/.claude-plugin/plugin.json'),
      hooks: await readJson('claude/hooks/hooks.json'),
      catalog: await readJson('catalogs/claude/marketplace.json'),
    },
  };
}

test('validates matching native manifests, catalogs, and hooks', async () => {
  const result = await loadAndValidateNativeSources(sourceRoot);
  assert.equal(result.plugin, 'agentic-development-workflow');
  assert.equal(result.version, '0.1.0');
  assert.deepEqual(result.platforms, ['codex', 'claude']);
});

test('rejects native identity and hook drift', async () => {
  const fixture = await loadFixture();
  fixture.claude.manifest.name = 'different-plugin';
  assert.throws(() => validateNativeData(fixture), /Claude manifest plugin identity mismatch/);

  fixture.claude.manifest.name = fixture.inventory.plugin.id;
  fixture.codex.hooks.hooks.SessionStart[0].hooks[0].command = 'python3 wrong.py';
  assert.throws(() => validateNativeData(fixture), /Codex hook command differs/);
});

test('enforces contract-declared manifest and catalog fields', async () => {
  const fixture = await loadFixture();
  delete fixture.codex.manifest.interface.longDescription;
  assert.throws(() => validateNativeData(fixture), /Codex manifest missing interface.longDescription/);

  const catalogFixture = await loadFixture();
  delete catalogFixture.claude.catalog.description;
  assert.throws(() => validateNativeData(catalogFixture), /Claude marketplace missing description/);
});
