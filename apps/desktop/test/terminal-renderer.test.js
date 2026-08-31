import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

import { parseHTML } from 'linkedom';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function dataModule(source) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

function setup() {
  return {
    schemaVersion: 1,
    phase: 'ready',
    operationalReady: true,
    checkedAt: '2026-08-31T00:00:00.000Z',
    desktop: { version: '0.1.0' },
    selectedAgents: ['codex'],
    prerequisites: [],
    agents: [],
  };
}

function project(path, name) {
  return {
    path,
    name,
    status: 'ready',
    featureHome: `${path}/docs/issues/feature`,
    featureId: 'feature',
    workflowState: 'DELIVERING_SLICES',
    diagnostic: null,
  };
}

function state(selectedPath) {
  const projects = [project('/repo/a', 'a'), project('/repo/b', 'b')];
  return {
    schemaVersion: 1,
    phase: 'ready',
    refreshing: false,
    githubPolling: false,
    selection: {
      worktreePath: selectedPath,
      featureHome: `${selectedPath}/docs/issues/feature`,
    },
    snapshot: null,
    error: null,
    projects,
    candidateDiagnostic: null,
    setup: setup(),
    preferences: {
      notificationsEnabled: false,
      projectPaths: projects.map((item) => item.path),
      selectedAgents: ['codex'],
      terminalHeight: 260,
    },
  };
}

function session(id, projectName, status = 'running', overrides = {}) {
  return {
    schemaVersion: 1,
    id,
    projectName,
    shell: 'sh',
    status,
    cols: 80,
    rows: 24,
    output: '',
    exit: status === 'exited' ? { code: 7, signal: null } : null,
    error: status === 'failed' ? 'spawn failed' : null,
    ...overrides,
  };
}

test('renderer lazily preserves one terminal view per project and presents exit/restart state', async () => {
  const html = await readFile(resolve(desktopRoot, 'renderer/index.html'), 'utf8');
  const rendererPath = resolve(desktopRoot, 'renderer/renderer.js');
  let source = await readFile(rendererPath, 'utf8');
  for (const moduleName of ['dom.js', 'workspace-state.js', 'presentation.js']) {
    source = source.replace(
      `'./${moduleName}'`,
      JSON.stringify(pathToFileURL(resolve(desktopRoot, 'renderer', moduleName)).href),
    );
  }
  const xtermModule = dataModule(`
    export class Terminal {
      constructor() { this.cols = 80; this.rows = 24; this.output = ''; this.disposables = []; }
      loadAddon(addon) { addon.activate?.(this); }
      open(host) {
        this.host = host;
        const root = document.createElement('div'); root.className = 'xterm';
        this.textarea = document.createElement('textarea'); root.append(this.textarea); host.append(root);
      }
      onData(listener) { this.listener = listener; return { dispose() {} }; }
      write(value) { this.output += value; this.host.dataset.output = this.output; }
      writeln(value) { this.write(value + '\\n'); }
      reset() { this.output = ''; this.host.dataset.output = ''; }
      focus() { this.host.dataset.focused = 'true'; this.textarea.focus(); }
      dispose() { this.host.dataset.disposed = 'true'; }
    }
  `);
  const fitModule = dataModule(`
    export class FitAddon { activate(terminal) { this.terminal = terminal; } fit() {} }
  `);
  source = source
    .replace("import('/vendor/xterm.mjs')", `import(${JSON.stringify(xtermModule)})`)
    .replace("import('/vendor/xterm-addon-fit.mjs')", `import(${JSON.stringify(fitModule)})`);

  const { window } = parseHTML(html);
  window.innerHeight = 780;
  let stateSubscriber;
  let terminalSubscriber;
  let current = state('/repo/a');
  const calls = [];
  window.gatereeveDesktop = {
    async getState() { return current; },
    async getUpdateState() {
      return {
        schemaVersion: 1, status: 'idle', source: null, currentVersion: '0.1.0',
        checkedAt: null, available: null, detail: null,
      };
    },
    subscribe(callback) { stateSubscriber = callback; return () => {}; },
    subscribeUpdates() { return () => {}; },
    subscribeTerminals(callback) { terminalSubscriber = callback; return () => {}; },
    async ensureTerminal(cols, rows) {
      const name = current.selection.worktreePath.endsWith('/a') ? 'a' : 'b';
      calls.push(['ensure', name, cols, rows]);
      return session(`terminal_${name}`, name);
    },
    async resizeTerminal(id, cols, rows) {
      calls.push(['resize', id, cols, rows]);
      return session(id, id.endsWith('_a') ? 'a' : 'b', 'running', { cols, rows });
    },
    async writeTerminal(id, data) { calls.push(['write', id, data]); return true; },
    async terminateTerminal(id) {
      calls.push(['terminate', id]);
      return session(id, id.endsWith('_a') ? 'a' : 'b', 'terminating');
    },
    async restartTerminal(id, cols, rows) {
      calls.push(['restart', id, cols, rows]);
      return session(`${id}_restarted`, id.endsWith('_a') ? 'a' : 'b', 'running', { cols, rows });
    },
    async setTerminalHeight(height) {
      calls.push(['height', height]);
      current = { ...current, preferences: { ...current.preferences, terminalHeight: height } };
      return current;
    },
  };
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.requestAnimationFrame = (callback) => callback();
  try {
    await import(`${dataModule(source)}#terminal-renderer`);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.some(([name]) => name === 'ensure'), false);

    const shortcut = new window.Event('keydown', { bubbles: true });
    Object.assign(shortcut, {
      key: 'j', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false,
    });
    window.dispatchEvent(shortcut);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(window.document.querySelector('#terminal-panel').hidden, false);
    assert.equal(window.document.querySelector('#toggle-terminal').getAttribute('aria-pressed'), 'true');
    assert.equal(calls.filter(([name]) => name === 'ensure').length, 1);
    assert.equal(window.document.querySelector('#terminal-title').textContent, 'a');
    assert.equal(
      window.document.querySelector('[data-terminal-project="/repo/a"]').dataset.focused,
      'true',
    );
    const resize = new window.Event('keydown', { bubbles: true });
    Object.assign(resize, { key: 'ArrowUp' });
    window.document.querySelector('#terminal-resizer').dispatchEvent(resize);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.some(([name, height]) => name === 'height' && height === 280), true);

    terminalSubscriber({
      schemaVersion: 1, type: 'data', sessionId: 'terminal_a', data: 'project-a-output',
    });
    assert.match(
      window.document.querySelector('[data-terminal-project="/repo/a"]').dataset.output,
      /project-a-output/,
    );

    current = state('/repo/b');
    stateSubscriber(current);
    assert.equal(window.document.querySelector('#terminal-panel').hidden, true);
    assert.equal(calls.filter(([name]) => name === 'ensure').length, 1);
    window.document.querySelector('#toggle-terminal').click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.filter(([name]) => name === 'ensure').length, 2);

    current = state('/repo/a');
    stateSubscriber(current);
    assert.equal(window.document.querySelector('#terminal-panel').hidden, false);
    assert.equal(calls.filter(([name]) => name === 'ensure').length, 2);
    assert.match(
      window.document.querySelector('[data-terminal-project="/repo/a"]').dataset.output,
      /project-a-output/,
    );

    window.document.querySelector('#terminal-terminate').click();
    await new Promise((resolve) => setImmediate(resolve));
    terminalSubscriber({
      schemaVersion: 1,
      type: 'exited',
      session: session('terminal_a', 'a', 'exited', { output: 'project-a-output' }),
    });
    assert.equal(window.document.querySelector('#terminal-status').textContent, 'Exited 7');
    assert.equal(window.document.querySelector('#terminal-restart').hidden, false);
    window.document.querySelector('#terminal-restart').click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.some(([name]) => name === 'restart'), true);
    assert.equal(window.document.querySelector('#terminal-status').textContent, 'running');
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.requestAnimationFrame;
  }
});
