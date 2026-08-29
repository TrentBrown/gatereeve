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
