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

function appendInline(parent, text) {
  const parts = String(text).split(/(`[^`]+`)/g);
  for (const part of parts) {
    if (part.startsWith('`') && part.endsWith('`')) {
      parent.append(node('code', { text: part.slice(1, -1) }));
    } else {
      parent.append(document.createTextNode(part));
    }
  }
}

export function renderMarkdown(container, content) {
  clear(container);
  container.classList.add('markdown');
  const lines = String(content).replaceAll('\r\n', '\n').split('\n');
  let code = null;
  let list = null;
  let paragraph = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    const element = node('p');
    appendInline(element, paragraph.join(' '));
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
      appendInline(element, heading[2]);
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
      appendInline(entry, item[2]);
      list.append(entry);
      continue;
    }
    if (line.startsWith('> ')) {
      flushParagraph();
      flushList();
      const quote = node('blockquote');
      appendInline(quote, line.slice(2));
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
