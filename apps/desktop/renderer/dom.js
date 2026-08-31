import { renderMarkdownDom } from './generated/markdown-renderer.js';

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

export function renderMarkdown(container, content, options = {}) {
  clear(container);
  const rendered = renderMarkdownDom(content, {
    document: container.ownerDocument ?? globalThis.document,
    ...options,
  });
  container.classList.add('markdown');
  container.append(...rendered.childNodes);
  return container;
}

export function renderJson(container, value) {
  clear(container);
  container.append(node('pre', { text: JSON.stringify(value, null, 2) }));
  return container;
}
