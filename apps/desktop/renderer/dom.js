export function clear(element) {
  element.replaceChildren();
  return element;
}

export function node(tag, options = {}, children = []) {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = String(options.text);
  if (options.id) element.id = options.id;
  if (options.title) element.title = options.title;
  if (options.type) element.type = options.type;
  if (options.disabled !== undefined) element.disabled = options.disabled;
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    element.setAttribute(name, String(value));
  }
  for (const child of children) element.append(child);
  return element;
}

const INLINE_TOKENS = Object.freeze([
  Object.freeze({ kind: 'code', expression: /`([^`\n]+)`/u }),
  Object.freeze({ kind: 'link', expression: /(?<!!)\[([^\]\n]+)\]\(([^)\n]+)\)/u }),
  Object.freeze({
    kind: 'strong',
    expression: /(?<!\*)\*\*(?!\*)(?=\S)([\s\S]*?\S)\*\*(?!\*)/u,
  }),
  Object.freeze({
    kind: 'strong',
    expression: /(?<![\p{L}\p{N}_])__(?!_)(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}_])/u,
  }),
  Object.freeze({
    kind: 'em',
    expression: /(?<!\*)\*(?!\*)(?=\S)([\s\S]*?\S)\*(?!\*)/u,
  }),
  Object.freeze({
    kind: 'em',
    expression: /(?<![\p{L}\p{N}_])_(?!_)(?=\S)([\s\S]*?\S)_(?![\p{L}\p{N}_])/u,
  }),
]);

function nextInlineToken(value) {
  let selected = null;
  for (const definition of INLINE_TOKENS) {
    const match = definition.expression.exec(value);
    if (match === null) continue;
    if (selected === null || match.index < selected.match.index) {
      selected = { definition, match };
    }
  }
  return selected;
}

function appendInline(parent, text, options = {}) {
  let remaining = String(text);
  while (remaining.length > 0) {
    const token = nextInlineToken(remaining);
    if (token === null) {
      parent.append(document.createTextNode(remaining));
      return;
    }
    if (token.match.index > 0) {
      parent.append(document.createTextNode(remaining.slice(0, token.match.index)));
    }
    if (token.definition.kind === 'link') {
      const resolved = options.resolveLink?.(token.match[2]) ?? null;
      if (resolved === null) {
        parent.append(document.createTextNode(token.match[0]));
      } else {
        const element = node('a', {
          className: 'markdown-link',
          title: token.match[2],
          attributes: {
            href: '#',
            'data-markdown-target': token.match[2],
          },
        });
        appendInline(element, token.match[1], options);
        element.addEventListener('click', (event) => {
          event.preventDefault();
          options.activateLink?.(resolved);
        });
        parent.append(element);
      }
      remaining = remaining.slice(token.match.index + token.match[0].length);
      continue;
    }
    const element = node(token.definition.kind);
    if (token.definition.kind === 'code') {
      element.textContent = token.match[1];
    } else {
      appendInline(element, token.match[1], options);
    }
    parent.append(element);
    remaining = remaining.slice(token.match.index + token.match[0].length);
  }
}

function headingSlug(value) {
  const label = String(value)
    .replaceAll(/(?<!!)\[([^\]\n]+)\]\([^)\n]+\)/gu, '$1')
    .replaceAll(/[`*_]/gu, '')
    .trim()
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, '-')
    .replaceAll(/^-|-$/gu, '');
  return label || 'section';
}

export function renderMarkdown(container, content, options = {}) {
  clear(container);
  container.classList.add('markdown');
  const lines = String(content).replaceAll('\r\n', '\n').split('\n');
  let code = null;
  let list = null;
  let paragraph = [];
  const headingCounts = new Map();

  function flushParagraph() {
    if (paragraph.length === 0) return;
    const element = node('p');
    appendInline(element, paragraph.join(' '), options);
    container.append(element);
    paragraph = [];
  }
  function flushList() { list = null; }

  for (const line of lines) {
    if (line.startsWith('```')) {
      flushParagraph();
      flushList();
      if (code === null) {
        code = node('code');
        container.append(node('pre', {}, [code]));
      } else {
        code = null;
      }
      continue;
    }
    if (code !== null) {
      code.textContent += `${code.textContent ? '\n' : ''}${line}`;
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const element = node(`h${heading[1].length}`);
      const baseSlug = headingSlug(heading[2]);
      const count = (headingCounts.get(baseSlug) ?? 0) + 1;
      headingCounts.set(baseSlug, count);
      element.id = count === 1 ? baseSlug : `${baseSlug}-${count}`;
      appendInline(element, heading[2], options);
      container.append(element);
      continue;
    }
    const item = /^\s*([-*]|\d+\.)\s+(.+)$/.exec(line);
    if (item) {
      flushParagraph();
      const tag = /\d+\./.test(item[1]) ? 'ol' : 'ul';
      if (list?.tagName?.toLowerCase() !== tag) {
        list = node(tag);
        container.append(list);
      }
      const entry = node('li');
      appendInline(entry, item[2], options);
      list.append(entry);
      continue;
    }
    if (line.startsWith('> ')) {
      flushParagraph();
      flushList();
      const quote = node('blockquote');
      appendInline(quote, line.slice(2), options);
      container.append(quote);
      continue;
    }
    if (line.trim() === '---') {
      flushParagraph();
      flushList();
      container.append(node('hr'));
      continue;
    }
    if (line.trim() === '') {
      flushParagraph();
      flushList();
    } else {
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  return container;
}

export function renderJson(container, value) {
  clear(container);
  container.append(node('pre', { text: JSON.stringify(value, null, 2) }));
  return container;
}
