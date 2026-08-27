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
    '#open-setup', '#setup-open-worktree', '#setup-return', '#setup-recheck',
    '#agent-codex', '#agent-claude', '#save-agents',
    '[data-view="overview"]', '[data-view="artifacts"]', '[data-view="history"]',
    '[data-view="model"]', '[data-view="session"]', '[data-view="setup"]',
  ];
  for (const selector of namedControls) {
    const control = document.querySelector(selector);
    assert.ok(control, `${selector} exists`);
    assert.ok(['BUTTON', 'INPUT', 'SELECT'].includes(control.tagName), `${selector} is keyboard native`);
    const label = control.id ? document.querySelector(`label[for="${control.id}"]`) : null;
    assert.ok(
      control.textContent.trim() || control.getAttribute('aria-label') || label?.textContent.trim(),
      `${selector} has an accessible name`,
    );
  }
  assert.equal(document.querySelector('#notifications').getAttribute('type'), 'checkbox');
  assert.match(document.querySelector('label[for="notifications"]').textContent, /Native notifications/);
  assert.match(document.querySelector('label[for="agent-codex"]').textContent, /Codex/);
});

test('status regions and principal views expose semantic text independent of color', async () => {
  const html = await readFile(resolve(desktopRoot, 'renderer/index.html'), 'utf8');
  const { document } = parseHTML(html).window;
  assert.equal(document.querySelector('#chooser-error').getAttribute('role'), 'alert');
  assert.equal(document.querySelector('#error').getAttribute('role'), 'alert');
  assert.equal(document.querySelector('#diagnostic').getAttribute('role'), 'status');
  assert.equal(document.querySelector('#toast').getAttribute('aria-live'), 'polite');
  for (const page of document.querySelectorAll('[data-page]')) {
    const labelledBy = page.getAttribute('aria-labelledby');
    assert.ok(labelledBy && document.getElementById(labelledBy), 'each principal view has a visible heading');
  }
  assert.match(document.querySelector('#attention-title').textContent, /Blockers and warnings/);
  assert.match(document.querySelector('#state-title').textContent, /Feature state rail/);
});

test('styles preserve visible focus and a usable 760 by 560 minimum layout', async () => {
  const css = await readFile(resolve(desktopRoot, 'renderer/styles.css'), 'utf8');
  assert.match(css, /input:focus-visible/);
  assert.match(css, /outline:\s*3px solid/);
  assert.match(css, /@media \(max-width: 800px\)/);
  assert.match(css, /\.workspace\s*\{\s*display:\s*block/);
  assert.match(css, /min-height:\s*560px/);
});
