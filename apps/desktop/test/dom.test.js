import assert from 'node:assert/strict';
import test from 'node:test';

import { parseHTML } from 'linkedom';

import { renderMarkdown } from '../renderer/dom.js';

test('Markdown renders safe emphasis while preserving code, identifiers, and images', () => {
  const { window } = parseHTML('<div id="viewer"></div>');
  globalThis.document = window.document;
  const viewer = window.document.querySelector('#viewer');

  renderMarkdown(viewer, [
    '**Feature start:** and __strong too__',
    '*Italic text* and _more emphasis_ beside feature_id.',
    '`**literal code**` and **strong with `inline code`**.',
    'Malformed **strong and _emphasis remain visible.',
    '![diagram](https://example.com/diagram.png)',
  ].join('\n\n'));

  assert.deepEqual(
    [...viewer.querySelectorAll('strong')].map((element) => element.textContent),
    ['Feature start:', 'strong too', 'strong with inline code'],
  );
  assert.deepEqual(
    [...viewer.querySelectorAll('em')].map((element) => element.textContent),
    ['Italic text', 'more emphasis'],
  );
  assert.deepEqual(
    [...viewer.querySelectorAll('code')].map((element) => element.textContent),
    ['**literal code**', 'inline code'],
  );
  assert.match(viewer.textContent, /feature_id/);
  assert.match(viewer.textContent, /Malformed \*\*strong and _emphasis remain visible/);
  assert.match(viewer.textContent, /!\[diagram\]\(https:\/\/example\.com\/diagram\.png\)/);
  assert.equal(viewer.querySelector('img'), null);

  delete globalThis.document;
});

test('Markdown links are semantic only when an explicit resolver accepts their target', () => {
  const { window } = parseHTML('<div id="viewer"></div>');
  globalThis.document = window.document;
  const viewer = window.document.querySelector('#viewer');
  const activated = [];

  renderMarkdown(
    viewer,
    '[**Guide**](https://example.com/docs) [Spec](spec.md#rubric) '
      + '[unsafe](javascript:alert(1)) ![diagram](https://example.com/image.png)',
    {
      resolveLink(target) {
        if (target.startsWith('https://')) return { kind: 'external', url: target };
        if (target === 'spec.md#rubric') return { kind: 'artifact', artifactId: 'spec' };
        return null;
      },
      activateLink(link) { activated.push(link); },
    },
  );

  const links = [...viewer.querySelectorAll('a')];
  assert.deepEqual(links.map((link) => link.textContent), ['Guide', 'Spec']);
  assert.equal(links[0].querySelector('strong').textContent, 'Guide');
  assert.match(viewer.textContent, /\[unsafe\]\(javascript:alert\(1\)\)/);
  assert.match(viewer.textContent, /!\[diagram\]\(https:\/\/example\.com\/image\.png\)/);
  links[0].dispatchEvent(new window.Event('click', { cancelable: true }));
  assert.deepEqual(activated, [{ kind: 'external', url: 'https://example.com/docs' }]);

  delete globalThis.document;
});

test('Markdown covers representative CommonMark block and inline structures', () => {
  const { window } = parseHTML('<div id="viewer"></div>');
  globalThis.document = window.document;
  const viewer = window.document.querySelector('#viewer');

  // Representative CommonMark 0.31.2 coverage includes examples 80
  // (Setext), 119/120 (fences), 228 (quotes), 302 (ordered lists), and
  // 633 (hard breaks), plus their adjacent inline constructs.
  renderMarkdown(viewer, [
    'Setext heading',
    '==============',
    '',
    '###### Level six',
    '',
    '> A quote with **weight**.',
    '>',
    '> A second paragraph.',
    '',
    '3. ordered',
    '   - nested',
    '',
    'Hard break  ',
    'next line and an \\*escaped star\\* plus &amp;.',
    '',
    '---',
    '',
    '    indented code',
    '',
    '~~~js',
    '**fenced literal**',
    '~~~',
    '',
    '[Guide][guide]',
    '',
    '[guide]: https://example.com/guide',
  ].join('\n'), {
    resolveLink: (target) => ({ kind: 'accepted', target }),
  });

  assert.equal(viewer.querySelector('h1').textContent, 'Setext heading');
  assert.equal(viewer.querySelector('h6').textContent, 'Level six');
  assert.equal(viewer.querySelectorAll('blockquote p').length, 2);
  assert.equal(viewer.querySelector('ol').getAttribute('start'), '3');
  assert.equal(viewer.querySelectorAll('ol ul li').length, 1);
  assert.equal(viewer.querySelectorAll('br').length, 1);
  assert.match(viewer.textContent, /\*escaped star\* plus &/u);
  assert.equal(viewer.querySelectorAll('hr').length, 1);
  assert.deepEqual(
    [...viewer.querySelectorAll('pre code')].map((code) => code.textContent.trim()),
    ['indented code', '**fenced literal**'],
  );
  assert.equal(viewer.querySelector('code.language-js').textContent.trim(), '**fenced literal**');
  assert.equal(viewer.querySelector('a').textContent, 'Guide');

  delete globalThis.document;
});

test('Markdown renders GFM tables, task lists, autolinks, strikethrough, and footnotes', () => {
  const { window } = parseHTML('<div id="viewer"></div>');
  globalThis.document = window.document;
  const viewer = window.document.querySelector('#viewer');
  const activated = [];

  renderMarkdown(viewer, [
    '| Left | Right |',
    '| :--- | ---: |',
    '| one | two |',
    '',
    '- [x] complete',
    '- [ ] pending',
    '',
    '~~removed~~ and https://example.com/docs with a note[^1].',
    '',
    '[^1]: Footnote detail.',
  ].join('\n'), {
    resolveLink: (target) => target.startsWith('https://')
      ? { kind: 'external', url: target }
      : null,
    activateLink: (link) => activated.push(link),
  });

  assert.equal(viewer.querySelector('.markdown-table-scroll table') !== null, true);
  assert.equal(viewer.querySelector('th').getAttribute('align'), 'left');
  assert.equal(viewer.querySelectorAll('.task-list-item input:disabled').length, 2);
  assert.equal(viewer.querySelector('.task-list-item input').checked, true);
  assert.equal(viewer.querySelector('del').textContent, 'removed');
  const external = [...viewer.querySelectorAll('a')]
    .find((link) => link.textContent === 'https://example.com/docs');
  external.dispatchEvent(new window.Event('click', { cancelable: true }));
  assert.deepEqual(activated, [{ kind: 'external', url: 'https://example.com/docs' }]);

  const footnote = viewer.querySelector('section[data-footnotes] li');
  let scrolls = 0;
  footnote.scrollIntoView = () => { scrolls += 1; };
  const reference = viewer.querySelector('[data-footnote-ref]');
  assert.equal(reference.getAttribute('aria-describedby'), 'gatereeve-md-footnote-label');
  reference.dispatchEvent(new window.Event('click', { cancelable: true }));
  assert.equal(scrolls, 1);
  assert.match(viewer.querySelector('[data-footnote-backref]').getAttribute('aria-label'), /Back to reference 1/u);

  delete globalThis.document;
});

test('Markdown keeps HTML, images, and rejected destinations visible without resource DOM', () => {
  const { window } = parseHTML('<div id="viewer"></div>');
  globalThis.document = window.document;
  const viewer = window.document.querySelector('#viewer');

  renderMarkdown(viewer, [
    '<script src="https://example.com/run.js">alert(1)</script>',
    '',
    '<iframe src="file:///etc/passwd">hidden</iframe>',
    '',
    '![inline](https://example.com/image.png)',
    '',
    '![reference][diagram]',
    '',
    '[unsafe](javascript:alert(1)) [credential](https://user:pass@example.com)',
    '',
    '[diagram]: file:///tmp/diagram.svg',
  ].join('\n'), {
    resolveLink: () => null,
  });

  assert.match(viewer.textContent, /<script src="https:\/\/example\.com\/run\.js">/u);
  assert.match(viewer.textContent, /<iframe src="file:\/\/\/etc\/passwd">/u);
  assert.match(viewer.textContent, /!\[inline\]\(https:\/\/example\.com\/image\.png\)/u);
  assert.match(viewer.textContent, /!\[reference\]\[diagram\]/u);
  assert.match(viewer.textContent, /\[unsafe\]\(javascript:alert\(1\)\)/u);
  assert.match(viewer.textContent, /\[credential\]\(https:\/\/user:pass@example\.com\)/u);
  assert.equal(
    viewer.querySelector('img, picture, source, audio, video, iframe, object, script, style'),
    null,
  );
  assert.equal(viewer.querySelector('[src]'), null);
  assert.equal(viewer.querySelector('a'), null);

  delete globalThis.document;
});

test('Markdown heading anchors are deterministic, prefixed, formatted, and duplicate-aware', () => {
  const { window } = parseHTML('<div id="viewer"></div>');
  globalThis.document = window.document;
  const viewer = window.document.querySelector('#viewer');

  renderMarkdown(viewer, '# **Rubric** `status`\n\n# Rubric status\n\n# window');

  const headings = [...viewer.querySelectorAll('h1')];
  assert.deepEqual(
    headings.map((heading) => heading.dataset.markdownFragment),
    ['rubric-status', 'rubric-status-2', 'window'],
  );
  assert.deepEqual(
    headings.map((heading) => heading.id),
    [
      'gatereeve-md-heading-rubric-status',
      'gatereeve-md-heading-rubric-status-2',
      'gatereeve-md-heading-window',
    ],
  );

  delete globalThis.document;
});

test('Markdown keeps malformed input and Mermaid fences literal', () => {
  const { window } = parseHTML('<div id="viewer"></div>');
  globalThis.document = window.document;
  const viewer = window.document.querySelector('#viewer');

  renderMarkdown(viewer, [
    'Malformed **strong and [unfinished](target',
    '',
    '```mermaid',
    'graph TD; A-->B',
    '**not strong**',
    '```',
  ].join('\n'));

  assert.match(viewer.textContent, /Malformed \*\*strong and \[unfinished\]\(target/u);
  const code = viewer.querySelector('code.language-mermaid');
  assert.equal(code.textContent.trim(), 'graph TD; A-->B\n**not strong**');
  assert.equal(code.querySelector('strong'), null);

  delete globalThis.document;
});
