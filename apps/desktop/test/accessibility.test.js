import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { parseHTML } from 'linkedom';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('principal controls use keyboard-native elements with visible accessible names', async () => {
  const html = await readFile(resolve(desktopRoot, 'renderer/index.html'), 'utf8');
  const { document } = parseHTML(html).window;
  const namedControls = [
    '#choose', '#refresh', '#notifications', '#attempt-select', '#copy-mermaid',
    '#choose-empty', '#toggle-sidebar', '#toggle-terminal', '#toggle-inspector', '#activity',
    '#terminal-terminate', '#terminal-restart',
    '#open-setup', '#setup-open-worktree', '#setup-return', '#setup-recheck',
    '#candidate-diagnostic-choose-another', '#source-dialog-close',
    '#module-discard', '#module-apply', '#module-confirm-close', '#module-confirm-cancel',
    '#module-confirm-apply', '#module-waiver-close', '#module-waiver-reason',
    '#module-waiver-cancel', '#module-waiver-confirm',
    '#agent-codex', '#agent-claude', '#save-agents',
    '[data-view="overview"]', '[data-view="modules"]', '[data-view="artifacts"]', '[data-view="history"]',
    '[data-view="model"]', '[data-view="session"]',
  ];
  for (const selector of namedControls) {
    const control = document.querySelector(selector);
    assert.ok(control, `${selector} exists`);
    assert.ok(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName), `${selector} is keyboard native`);
    const label = control.id ? document.querySelector(`label[for="${control.id}"]`) : null;
    assert.ok(
      control.textContent.trim() || control.getAttribute('aria-label') || label?.textContent.trim(),
      `${selector} has an accessible name`,
    );
  }
  assert.equal(document.querySelector('#notifications').getAttribute('type'), 'checkbox');
  assert.match(document.querySelector('label[for="notifications"]').textContent, /Native notifications/);
  assert.match(document.querySelector('label[for="agent-codex"]').textContent, /Codex/);
  assert.equal(document.querySelector('#inspector-resizer').getAttribute('role'), 'separator');
  assert.equal(document.querySelector('#inspector-resizer').getAttribute('tabindex'), '0');
  assert.equal(document.querySelector('#terminal-resizer').getAttribute('role'), 'separator');
  assert.equal(document.querySelector('#terminal-resizer').getAttribute('aria-orientation'), 'horizontal');
  assert.equal(document.querySelector('#terminal-resizer').getAttribute('tabindex'), '0');
  const layoutControls = [...document.querySelectorAll('.layout-button')].map((item) => item.id);
  assert.deepEqual(layoutControls, ['toggle-sidebar', 'toggle-terminal', 'toggle-inspector']);
});

test('status regions and principal views expose semantic text independent of color', async () => {
  const html = await readFile(resolve(desktopRoot, 'renderer/index.html'), 'utf8');
  const { document } = parseHTML(html).window;
  assert.equal(document.querySelector('#chooser-error').getAttribute('role'), 'alert');
  assert.equal(document.querySelector('#candidate-diagnostic').getAttribute('role'), 'alert');
  assert.equal(document.querySelector('#candidate-diagnostic').tagName, 'DETAILS');
  assert.match(document.querySelector('#candidate-diagnostic').textContent, /Safe next steps/);
  assert.equal(document.querySelector('#global-alerts').getAttribute('role'), 'alert');
  assert.equal(document.querySelector('#error'), null);
  assert.equal(document.querySelector('#diagnostic'), null);
  assert.equal(document.querySelector('#toast').getAttribute('aria-live'), 'polite');
  for (const page of document.querySelectorAll('[data-page]')) {
    const labelledBy = page.getAttribute('aria-labelledby');
    assert.ok(labelledBy && document.getElementById(labelledBy), 'each principal view has a visible heading');
  }
  assert.equal(document.querySelector('#attention-title'), null);
  assert.match(document.querySelector('#actions-title').textContent, /Current workflow guidance/);
  assert.equal(document.querySelector('.project-sources'), null);
  assert.match(document.querySelector('#source-dialog-title').textContent, /Watching project sources/);
  assert.match(document.querySelector('#state-title').textContent, /Feature state rail/);
  assert.equal(document.querySelector('#phase-context-surface').getAttribute('aria-labelledby'), 'phase-context-title');
  assert.match(document.querySelector('#phase-context-uses-title').textContent, /Uses/);
  assert.match(document.querySelector('#phase-context-produces-title').textContent, /Produces/);
});

test('styles preserve visible focus, docked regions, and reduced-motion behavior', async () => {
  const css = await readFile(resolve(desktopRoot, 'renderer/styles.css'), 'utf8');
  assert.match(css, /input:focus-visible/);
  assert.match(css, /outline:\s*3px solid/);
  assert.match(css, /@media \(max-width: 800px\)/);
  assert.match(css, /\.workspace\s*\{\s*display:\s*block/);
  assert.match(css, /min-height:\s*560px/);
  assert.match(css, /grid-template-columns:\s*var\(--project-sidebar-width\)/);
  assert.match(css, /minmax\(300px, 1fr\)\s*min\(var\(--inspector-width\),\s*max\(0px,\s*calc\(100vw - var\(--project-sidebar-width\) - 320px\)\)\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.order-marker\s*\{/);
  assert.match(css, /border:\s*2px solid #4e3c63/);
  assert.match(css, /\.workspace-main\s*\{\s*grid-column:\s*2/);
  assert.match(css, /\.inspector-body\s*\{[^}]*min-height:\s*0/);
  assert.match(css, /\.inspector-viewer\s*\{[^}]*overflow:\s*auto/);
  assert.match(css, /\.inspector-tabs\s*\{\s*display:\s*none/);
  assert.match(css, /container:\s*phase-context\s*\/\s*inline-size/);
  assert.match(css, /@container phase-context \(max-width:\s*720px\)/);
  assert.match(css, /\.phase-context-source\s*\{[^}]*border-style:\s*dashed/);
  assert.match(css, /#toggle-terminal::after/);
  assert.match(css, /\.terminal-panel\s*\{[^}]*grid-column:\s*1 \/ -1/);
});

test('terminal panel exposes one session lifecycle without transcript-management controls', async () => {
  const html = await readFile(resolve(desktopRoot, 'renderer/index.html'), 'utf8');
  const { document } = parseHTML(html).window;
  const panel = document.querySelector('#terminal-panel');
  assert.equal(panel.hidden, true);
  assert.equal(panel.getAttribute('aria-label'), 'Project terminal');
  assert.equal(document.querySelectorAll('#terminal-hosts').length, 1);
  assert.equal(document.querySelectorAll('#terminal-terminate').length, 1);
  assert.equal(document.querySelectorAll('#terminal-restart').length, 1);
  assert.doesNotMatch(panel.textContent, /save output|transcript|new terminal|split|profile/i);
});
