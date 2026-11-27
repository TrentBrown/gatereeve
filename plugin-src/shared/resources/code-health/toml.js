// A TOML 1.0 reader for configuration files (.habit-hooks/config.toml,
// ruff.toml, pyproject.toml). The wrapper must run wherever GateReeve runs,
// including Python 3.10 hosts without tomllib and plugin installs without
// node_modules, so it carries its own parser. Dates and times are returned
// as their source text; nothing here needs them as values.
export class TomlError extends Error {}

const BARE = /[A-Za-z0-9_-]/;

class Reader {
  constructor(text) {
    this.text = text.replace(/\r\n/g, '\n');
    this.index = 0;
    this.line = 1;
  }

  fail(message) {
    throw new TomlError(`line ${this.line}: ${message}`);
  }

  peek(offset = 0) {
    return this.text[this.index + offset];
  }

  startsWith(value) {
    return this.text.startsWith(value, this.index);
  }

  next() {
    const char = this.text[this.index++];
    if (char === '\n') this.line += 1;
    return char;
  }

  spaces() {
    while (this.peek() === ' ' || this.peek() === '\t') this.next();
  }

  comment() {
    if (this.peek() === '#') while (this.index < this.text.length && this.peek() !== '\n') this.next();
  }

  // Whitespace, newlines and comments (inside arrays).
  blank() {
    for (;;) {
      this.spaces();
      this.comment();
      if (this.peek() === '\n') this.next();
      else return;
    }
  }

  endOfLine() {
    this.spaces();
    this.comment();
    if (this.index < this.text.length && this.next() !== '\n') this.fail('expected end of line');
  }

  key() {
    const parts = [];
    for (;;) {
      this.spaces();
      if (this.peek() === '"') parts.push(this.basicString());
      else if (this.peek() === "'") parts.push(this.literalString());
      else {
        let bare = '';
        while (this.index < this.text.length && BARE.test(this.peek())) bare += this.next();
        if (!bare) this.fail('expected a key');
        parts.push(bare);
      }
      this.spaces();
      if (this.peek() !== '.') return parts;
      this.next();
    }
  }

  escape() {
    const char = this.next();
    const simple = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' };
    if (char in simple) return simple[char];
    if (char === 'u' || char === 'U') {
      const length = char === 'u' ? 4 : 8;
      const hex = this.text.slice(this.index, this.index + length);
      if (!/^[0-9A-Fa-f]+$/.test(hex) || hex.length !== length) this.fail('invalid unicode escape');
      this.index += length;
      return String.fromCodePoint(parseInt(hex, 16));
    }
    return this.fail(`invalid escape \\${char}`);
  }

  basicString() {
    if (this.startsWith('"""')) {
      this.index += 3;
      if (this.peek() === '\n') this.next();
      let value = '';
      for (;;) {
        if (this.index >= this.text.length) this.fail('unterminated string');
        if (this.startsWith('"""')) {
          let quotes = 0;
          while (this.peek(quotes) === '"' && quotes < 5) quotes += 1;
          this.index += quotes;
          return value + '"'.repeat(quotes - 3);
        }
        const char = this.next();
        if (char === '\\') {
          if (/^[ \t]*\n/.test(this.text.slice(this.index))) {
            while (/[ \t\n]/.test(this.peek() ?? '')) this.next();
          } else value += this.escape();
        } else value += char;
      }
    }
    this.next();
    let value = '';
    for (;;) {
      const char = this.next();
      if (char === undefined || char === '\n') this.fail('unterminated string');
      if (char === '"') return value;
      value += char === '\\' ? this.escape() : char;
    }
  }

  literalString() {
    if (this.startsWith("'''")) {
      this.index += 3;
      if (this.peek() === '\n') this.next();
      const end = this.text.indexOf("'''", this.index);
      if (end === -1) this.fail('unterminated string');
      let close = end;
      while (this.text[close + 3] === "'") close += 1;
      const value = this.text.slice(this.index, close);
      for (const char of value) if (char === '\n') this.line += 1;
      this.index = close + 3;
      return value;
    }
    this.next();
    const end = this.text.indexOf("'", this.index);
    const newline = this.text.indexOf('\n', this.index);
    if (end === -1 || (newline !== -1 && newline < end)) this.fail('unterminated string');
    const value = this.text.slice(this.index, end);
    this.index = end + 1;
    return value;
  }

  array() {
    this.next();
    const values = [];
    for (;;) {
      this.blank();
      if (this.peek() === ']') {
        this.next();
        return values;
      }
      values.push(this.value());
      this.blank();
      if (this.peek() === ',') this.next();
      else if (this.peek() !== ']') this.fail('expected , or ] in array');
    }
  }

  inlineTable() {
    this.next();
    const table = {};
    this.spaces();
    if (this.peek() === '}') {
      this.next();
      return table;
    }
    for (;;) {
      const path = this.key();
      if (this.next() !== '=') this.fail('expected =');
      this.spaces();
      assign(this, table, path, this.value());
      this.spaces();
      const char = this.next();
      if (char === '}') return table;
      if (char !== ',') this.fail('expected , or } in inline table');
    }
  }

  value() {
    this.spaces();
    const char = this.peek();
    if (char === '"') return this.basicString();
    if (char === "'") return this.literalString();
    if (char === '[') return this.array();
    if (char === '{') return this.inlineTable();
    let raw = '';
    while (this.index < this.text.length && !/[,\]}\n#]/.test(this.peek())) raw += this.next();
    raw = raw.trim();
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (/^[+-]?(inf|nan)$/.test(raw)) return raw.endsWith('inf') ? (raw.startsWith('-') ? -Infinity : Infinity) : NaN;
    const number = raw.replace(/_/g, '');
    if (/^[+-]?(0|[1-9][0-9]*)$/.test(number)) return Number(number);
    if (/^0x[0-9A-Fa-f]+$|^0o[0-7]+$|^0b[01]+$/.test(number)) return Number(number);
    if (/^[+-]?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(number)) return Number(number);
    if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$|^\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw)) return raw;
    return this.fail(`invalid value "${raw}"`);
  }
}

const isTable = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function descend(reader, root, path, { create = true } = {}) {
  let table = root;
  for (const part of path) {
    if (!(part in table) && create) table[part] = {};
    let next = table[part];
    if (Array.isArray(next) && next.length && isTable(next.at(-1))) next = next.at(-1);
    if (!isTable(next)) reader.fail(`key ${path.join('.')} is not a table`);
    table = next;
  }
  return table;
}

function assign(reader, table, path, value) {
  const parent = descend(reader, table, path.slice(0, -1));
  const last = path.at(-1);
  if (last in parent) reader.fail(`duplicate key ${path.join('.')}`);
  parent[last] = value;
}

export function parseToml(text) {
  const reader = new Reader(text);
  const root = {};
  let current = root;
  while (reader.index < reader.text.length) {
    reader.blank();
    if (reader.index >= reader.text.length) break;
    if (reader.startsWith('[[')) {
      reader.index += 2;
      const path = reader.key();
      if (!reader.startsWith(']]')) reader.fail('expected ]]');
      reader.index += 2;
      const parent = descend(reader, root, path.slice(0, -1));
      const last = path.at(-1);
      parent[last] ??= [];
      if (!Array.isArray(parent[last])) reader.fail(`key ${path.join('.')} is not an array of tables`);
      current = {};
      parent[last].push(current);
      reader.endOfLine();
    } else if (reader.peek() === '[') {
      reader.next();
      const path = reader.key();
      if (reader.next() !== ']') reader.fail('expected ]');
      current = descend(reader, root, path);
      reader.endOfLine();
    } else {
      const path = reader.key();
      if (reader.next() !== '=') reader.fail('expected =');
      assign(reader, current, path, reader.value());
      reader.endOfLine();
    }
  }
  return root;
}
