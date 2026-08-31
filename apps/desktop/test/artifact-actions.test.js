import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createArtifactActions,
  createEditorPreferenceStore,
  githubArtifactUrl,
  nextAvailableDownloadPath,
} from '../main/artifact-actions.js';

test('GitHub artifact URLs require a tracked path, GitHub origin, and exact HEAD', async () => {
  const calls = [];
  const url = await githubArtifactUrl('/repo/docs/issues/feature/design notes.md', {
    async exec(_git, args) {
      calls.push(args);
      if (args.includes('--show-toplevel')) return { stdout: '/repo\n' };
      if (args.includes('ls-files')) return { stdout: 'docs/issues/feature/design notes.md\n' };
      if (args.includes('get-url')) return { stdout: 'git@github.com:TrentBrown/gatereeve.git\n' };
      return { stdout: '0123456789abcdef0123456789abcdef01234567\n' };
    },
  });
  assert.equal(url, 'https://github.com/TrentBrown/gatereeve/blob/0123456789abcdef0123456789abcdef01234567/docs/issues/feature/design%20notes.md');
  assert.equal(calls.some((args) => args.includes('--error-unmatch')), true);

  assert.equal(await githubArtifactUrl('/repo/design.md', {
    async exec(_git, args) {
      if (args.includes('--show-toplevel')) return { stdout: '/repo\n' };
      if (args.includes('ls-files')) return { stdout: 'design.md\n' };
      if (args.includes('get-url')) return { stdout: 'ssh://example.com/repo.git\n' };
      return { stdout: '0123456789abcdef0123456789abcdef01234567\n' };
    },
  }), null);
});

test('Downloads choose a non-overwriting filename', async () => {
  const occupied = new Set(['/downloads/design.md', '/downloads/design 2.md']);
  assert.equal(await nextAvailableDownloadPath('/downloads', 'design.md', {
    exists: async (path) => occupied.has(path),
  }), '/downloads/design 3.md');
});

test('editor preference store persists only a bounded editor selection document', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-editor-'));
  const store = createEditorPreferenceStore(root);
  assert.equal(await store.load(), null);
  await store.save('vscode');
  assert.equal(await store.load(), 'vscode');
  assert.deepEqual(JSON.parse(await readFile(store.path, 'utf8')), {
    schemaVersion: 1, editorId: 'vscode',
  });
});

test('artifact actions detect bounded editors, remember explicit choices, and preserve source files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-actions-'));
  const source = join(root, 'design.md');
  const saved = join(root, 'saved.md');
  await writeFile(source, '# Canonical\n');
  const opened = [];
  const preferences = [];
  const service = createArtifactActions({
    homePath: '/Users/test',
    downloadsPath: join(root, 'Downloads'),
    preferenceStore: {
      async load() { return null; },
      async save(value) { preferences.push(value); },
    },
    gitExecutable: null,
    pathExists: async (path) => path === '/Applications/Visual Studio Code.app',
    async openDefault(path) { opened.push(['default', path]); return ''; },
    async openApplication(application, path) { opened.push([application, path]); },
    async chooseApplication() { return '/Applications/One-time.app'; },
    async chooseSavePath() { return saved; },
    async openExternal() {},
  });
  await service.initialize();
  assert.deepEqual(await service.capabilities(source), {
    schemaVersion: 1,
    editors: [{ id: 'vscode', label: 'VS Code' }],
    preferredEditorId: null,
    githubAvailable: false,
  });
  await service.open(source, 'vscode', true);
  await service.open(source);
  await service.chooseAndOpen(source);
  await service.saveAs(source);
  const download = await service.saveToDownloads(source);
  assert.deepEqual(preferences, ['vscode']);
  assert.deepEqual(opened, [
    ['/Applications/Visual Studio Code.app', source],
    ['/Applications/Visual Studio Code.app', source],
    ['/Applications/One-time.app', source],
  ]);
  assert.equal(await readFile(source, 'utf8'), '# Canonical\n');
  assert.equal(await readFile(saved, 'utf8'), '# Canonical\n');
  assert.equal(await readFile(download, 'utf8'), '# Canonical\n');
  await assert.rejects(service.open(source, 'unknown', false), /not installed/);
});
