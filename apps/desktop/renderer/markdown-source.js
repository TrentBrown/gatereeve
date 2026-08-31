import { toDom } from 'hast-util-to-dom';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

const DOM_ID_PREFIX = 'gatereeve-md-';
const HEADING_ID_PREFIX = `${DOM_ID_PREFIX}heading-`;

const SANITIZE_SCHEMA = Object.freeze({
  attributes: {
    a: [
      'ariaDescribedBy',
      'ariaLabel',
      ['className', 'data-footnote-backref'],
      'dataFootnoteBackref',
      'dataFootnoteRef',
      'dataMarkdownFootnote',
      'dataMarkdownSource',
      'dataMarkdownTarget',
      'href',
      'id',
    ],
    code: [['className', /^language-[\w-]+$/u]],
    h2: [['className', 'sr-only'], 'id'],
    input: [['type', 'checkbox'], 'checked', 'disabled'],
    li: [['className', 'task-list-item'], 'id'],
    ol: ['start'],
    section: [['className', 'footnotes'], 'dataFootnotes'],
    td: [['align', 'left', 'right', 'center']],
    th: [['align', 'left', 'right', 'center']],
    ul: [['className', 'contains-task-list']],
  },
  clobber: ['id', 'name'],
  clobberPrefix: DOM_ID_PREFIX,
  protocols: {},
  required: {
    input: { disabled: true, type: 'checkbox' },
  },
  strip: ['iframe', 'object', 'script', 'style'],
  tagNames: [
    'a',
    'blockquote',
    'br',
    'code',
    'del',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'input',
    'li',
    'ol',
    'p',
    'pre',
    'section',
    'strong',
    'sup',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'ul',
  ],
});

function sourceForNode(node, source) {
  const start = node?.position?.start?.offset;
  const end = node?.position?.end?.offset;
  if (Number.isInteger(start) && Number.isInteger(end)) {
    return source.slice(start, end);
  }
  if (node.type === 'html') return String(node.value ?? '');
  if (node.type === 'image') {
    const title = node.title ? ` \"${node.title}\"` : '';
    return `![${node.alt ?? ''}](${node.url ?? ''}${title})`;
  }
  if (node.type === 'imageReference') {
    return `![${node.alt ?? ''}][${node.label ?? node.identifier ?? ''}]`;
  }
  return String(node.value ?? '');
}

function preserveInertSource() {
  return (tree, file) => {
    const source = String(file);
    function visit(parent) {
      if (!Array.isArray(parent.children)) return;
      for (let index = 0; index < parent.children.length; index += 1) {
        const child = parent.children[index];
        if (['html', 'image', 'imageReference'].includes(child.type)) {
          parent.children[index] = {
            type: 'text',
            value: sourceForNode(child, source),
          };
        } else {
          visit(child);
        }
      }
    }
    visit(tree);
  };
}

function annotateLinks() {
  return (tree, file) => {
    const source = String(file);
    function visit(node) {
      if (node.type === 'element' && node.tagName === 'a') {
        const target = node.properties?.href;
        if (typeof target === 'string') {
          const footnote = Boolean(
            node.properties.dataFootnoteRef !== undefined
            || node.properties.dataFootnoteBackref !== undefined,
          );
          node.properties.dataMarkdownTarget = target;
          node.properties.dataMarkdownFootnote = footnote;
          if (!footnote) node.properties.dataMarkdownSource = sourceForNode(node, source);
          if (!footnote) delete node.properties.href;
        }
      }
      for (const child of node.children ?? []) visit(child);
    }
    visit(tree);
  };
}

const PROCESSOR = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(preserveInertSource)
  .use(remarkRehype, { clobberPrefix: 'footnote-' })
  .use(annotateLinks)
  .use(rehypeSanitize, SANITIZE_SCHEMA);

function headingSlug(value) {
  const label = String(value)
    .trim()
    .toLowerCase()
    .replaceAll(/[^\u200C\u200D\p{L}\p{N}_-]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '');
  return label || 'section';
}

function assignHeadingIds(container) {
  const counts = new Map();
  for (const heading of container.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    if (heading.closest?.('section[data-footnotes]')) continue;
    const base = headingSlug(heading.textContent);
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    const fragment = count === 1 ? base : `${base}-${count}`;
    heading.id = `${HEADING_ID_PREFIX}${fragment}`;
    heading.dataset.markdownFragment = fragment;
  }
}

function prepareWideContent(container, document) {
  for (const table of container.querySelectorAll('table')) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('markdown-table-scroll');
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Scrollable table');
    table.replaceWith(wrapper);
    wrapper.append(table);
  }
}

function scrollToFootnote(container, target) {
  if (!target.startsWith('#')) return;
  const logicalId = target.slice(1);
  const physicalId = logicalId.startsWith('footnote-')
    ? `${DOM_ID_PREFIX}${logicalId}`
    : logicalId;
  const destination = [...container.querySelectorAll('[id]')]
    .find((candidate) => candidate.id === physicalId);
  destination?.scrollIntoView?.({ block: 'nearest' });
}

function activateLinks(container, links, options, document) {
  for (const { element, footnote, source, target } of links) {
    element.removeAttribute('data-markdown-footnote');
    element.removeAttribute('data-markdown-source');
    element.removeAttribute('data-markdown-target');
    if (footnote) {
      const describedBy = element.getAttribute('aria-describedby');
      if (describedBy) {
        element.setAttribute(
          'aria-describedby',
          describedBy.split(/\s+/u).map((id) => `${DOM_ID_PREFIX}${id}`).join(' '),
        );
      }
      element.classList.add('markdown-link');
      element.setAttribute('href', '#');
      element.addEventListener('click', (event) => {
        event.preventDefault();
        scrollToFootnote(element.closest('.markdown') ?? container, target);
      });
      continue;
    }
    let resolved = null;
    try {
      resolved = options.resolveLink?.(target) ?? null;
    } catch {
      resolved = null;
    }
    if (resolved === null) {
      element.replaceWith(document.createTextNode(source || element.textContent || target));
      continue;
    }
    element.classList.add('markdown-link');
    element.setAttribute('href', '#');
    element.setAttribute('title', target);
    element.addEventListener('click', (event) => {
      event.preventDefault();
      options.activateLink?.(resolved);
    });
  }
}

export function renderMarkdownDom(content, options = {}) {
  const document = options.document ?? globalThis.document;
  if (!document?.createElement || !document?.createTextNode) {
    throw new TypeError('A DOM document is required to render Markdown.');
  }
  const source = String(content).replaceAll('\r\n', '\n');
  const container = document.createElement('div');
  container.classList.add('markdown');
  const links = [];
  let fragment;
  try {
    const syntaxTree = PROCESSOR.runSync(PROCESSOR.parse(source), { value: source });
    fragment = toDom(syntaxTree, {
      document,
      fragment: true,
      afterTransform(hastNode, domNode) {
        if (
          hastNode.type === 'element'
          && hastNode.tagName === 'a'
          && domNode.nodeType === 1
        ) {
          links.push({
            element: domNode,
            footnote: hastNode.properties.dataMarkdownFootnote === true,
            source: String(hastNode.properties.dataMarkdownSource ?? ''),
            target: String(
              hastNode.properties.dataMarkdownTarget
              ?? hastNode.properties.href
              ?? '',
            ),
          });
        }
      },
    });
  } catch {
    container.append(document.createTextNode(source));
    return container;
  }
  container.append(fragment);
  assignHeadingIds(container);
  prepareWideContent(container, document);
  for (const input of container.querySelectorAll('input[type="checkbox"]')) {
    input.disabled = true;
    input.setAttribute('disabled', '');
  }
  activateLinks(container, links, options, document);
  return container;
}
