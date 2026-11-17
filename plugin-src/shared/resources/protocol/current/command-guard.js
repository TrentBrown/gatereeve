// Best-effort classification of shell commands for the PreToolUse merge guard.
// This is a small tokenizer, not a shell: it follows quoting, separators,
// substitutions, heredocs and common wrappers well enough to recognize direct
// merge and protected-branch push attempts, and leaves quoted text alone.
// Scripts, aliases, variables naming commands and other clients are not seen.
// GitHub branch protection remains the real enforcement.

const SUBSTITUTION = '\u0000';
const MAX_DEPTH = 6;
const RESERVED = new Set(['!', '{', '}', 'if', 'then', 'elif', 'else', 'fi', 'do', 'done', 'while', 'until', 'time', 'coproc']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'mksh', 'ash', 'fish']);
// Wrapper commands that run their argument command, with options taking a value.
const WRAPPERS = new Map(Object.entries({
  sudo: ['-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-U', '-T', '--user', '--group', '--chdir', '--host', '--prompt', '--role', '--type', '--other-user', '--close-from', '--command-timeout'],
  doas: ['-u', '-C'],
  command: [],
  builtin: [],
  exec: ['-a'],
  nohup: [],
  nice: ['-n', '--adjustment'],
  ionice: ['-c', '-n', '-p', '--class', '--classdata'],
  stdbuf: ['-i', '-o', '-e', '--input', '--output', '--error'],
  timeout: ['-s', '-k', '--signal', '--kill-after'],
  xargs: ['-I', '-n', '-P', '-L', '-l', '-d', '-E', '-s', '-a', '--max-args', '--max-procs', '--max-lines', '--delimiter', '--eof', '--max-chars', '--arg-file', '--replace'],
  setsid: [],
  unbuffer: [],
  env: ['-u', '-C', '--unset', '--chdir'],
}).map(([name, values]) => [name, new Set(values)]));
const GH_VALUE_SHORT = new Set(['-R', '-X', '-H', '-f', '-F', '-q', '-t', '-p', '-b', '-B', '-A']);
const GH_VALUE_LONG = new Set(['--repo', '--method', '--header', '--field', '--raw-field', '--input', '--jq', '--template', '--preview', '--hostname', '--cache', '--body', '--body-file', '--subject', '--author-email', '--match-head-commit']);
const GIT_GLOBAL_VALUES = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix', '--exec-path']);
const PUSH_VALUES = new Set(['--repo', '-o', '--push-option', '--receive-pack', '--exec']);
const MERGE_ENDPOINT = /^(?:https?:\/\/[^/]+(?:\/api\/v3)?)?\/?repos\/[^/]+\/[^/]+\/pulls\/([^/?#]+)\/merge\/?(?:[?#].*)?$/iu;
const GRAPHQL_MERGE = /\b(?:mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest)\b/u;

// A heredoc operator and its delimiter word (`<<EOF`, `<<-'EOF'`, `<< "EOF"`).
const HEREDOC = /^<<(-?)[ \t]*((?:[^\s;&|()<>'"\\]|'[^'\n]*'|"[^"\n]*"|\\.)+)/u;
// Skip the bodies of pending heredocs starting at `i` (just after a newline);
// returns the index after the last delimiter line.
function skipHeredocBodies(text, i, pending) {
  for (const item of pending) {
    while (i < text.length) {
      const end = text.indexOf('\n', i);
      const line = text.slice(i, end === -1 ? text.length : end);
      i = end === -1 ? text.length : end + 1;
      if ((item.strip ? line.replace(/^\t+/u, '') : line) === item.delimiter) break;
    }
  }
  return i;
}
function matching(text, start, open, close) {
  // `start` indexes the opening delimiter; returns the index of its match.
  // Heredoc bodies inside a command substitution are data: their quotes and
  // parentheses neither open strings nor close the substitution.
  // Only a command substitution holds shell syntax. Parameter expansions
  // (`${...}`) and arithmetic (`$((...))`) contain no comments or heredocs, so a
  // `#` or `<<` there must not hide the rest of the command.
  let depth = 1, pending = [];
  const arithmetic = open === '(' && text[start + 1] === '(';
  const shell = open === '(' && !arithmetic;
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') { i++; continue; }
    if (c === '<' && shell && text[i + 1] === '<' && text[i + 2] !== '<') {
      const found = HEREDOC.exec(text.slice(i));
      if (found) { pending.push({ delimiter: found[2].replace(/\\(.)/gu, '$1').replace(/['"]/gu, ''), strip: found[1] === '-' }); i += found[0].length - 1; continue; }
    }
    if (c === '\n' && pending.length) { i = skipHeredocBodies(text, i + 1, pending) - 1; pending = []; continue; }
    // A comment (at a word start) runs to the end of its line.
    if (c === '#' && shell && /\s/u.test(text[i - 1] ?? ' ')) { const end = text.indexOf('\n', i); if (end === -1) return text.length; i = end - 1; continue; }
    if (c === "'") { const end = text.indexOf("'", i + 1); if (end === -1) return text.length; i = end; continue; }
    if (c === '"') {
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++;
      continue;
    }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return i;
  }
  return text.length;
}

function closingBacktick(text, start) {
  for (let i = start; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '`') return i;
  }
  return text.length;
}

// Command substitutions the shell expands in an unquoted heredoc body before
// the command reads it (NEW21). Quotes are data there; `\` escapes.
function heredocSubstitutions(body) {
  const scripts = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\\') { i++; continue; }
    if (body[i] === '`') { const end = closingBacktick(body, i + 1); scripts.push(body.slice(i + 1, end)); i = end; continue; }
    if (body[i] === '$' && body[i + 1] === '(') {
      const end = matching(body, i + 1, '(', ')');
      if (body[i + 2] !== '(') scripts.push(body.slice(i + 2, end));
      i = end;
    }
  }
  return scripts;
}

// Split a script into simple commands of unquoted words. Command and process
// substitutions are returned separately as nested scripts.
export function parseShell(text) {
  const commands = [], nested = [], nestedAt = [];
  // Subshell nesting, so a `cd` inside `( … )` is scoped to it; each command
  // records the path of subshells enclosing it.
  const subshells = []; let nextSubshell = 0;
  const fresh = () => ({ words: [], heredocs: [], herestrings: [], subshells: [...subshells] });
  const nest = script => { nested.push(script); nestedAt.push(commands.length); };
  // Each command records the separator before and after it (null at the ends):
  // ';', '\n', '&&', '||', '|', '|&' or '&'. Subshell parentheses do not count,
  // and a newline after `&&`, `||` or `|` continues the list (NEW8).
  let before = null;
  let current = fresh();
  let word = null, expect = null, pending = [];
  const append = value => { word = (word ?? '') + value; };
  const pushWord = () => {
    if (word === null) return;
    if (expect?.kind === 'heredoc') pending.push({ delimiter: word, strip: expect.strip, quoted: Boolean(expect.quoted), command: current });
    else if (expect?.kind === 'herestring') current.herestrings.push(word);
    else if (!expect) current.words.push(word);
    expect = null; word = null;
  };
  const endCommand = (separator = null) => {
    pushWord();
    if (current.words.length || current.heredocs.length || current.herestrings.length || pending.some(item => item.command === current)) {
      current.before = before; current.after = separator; commands.push(current);
      before = separator;
    } else if (separator !== null && !(separator === '\n' && ['&&', '||', '|', '|&'].includes(before))) before = separator;
    current = fresh();
  };
  const consumeHeredocs = start => {
    let i = start;
    for (const item of pending) {
      const lines = [];
      while (i < text.length) {
        const end = text.indexOf('\n', i);
        const line = text.slice(i, end === -1 ? text.length : end);
        i = end === -1 ? text.length : end + 1;
        if ((item.strip ? line.replace(/^\t+/u, '') : line) === item.delimiter) break;
        lines.push(line);
      }
      item.command.heredocs.push(lines.join('\n'));
      // An unquoted delimiter leaves the body subject to substitution.
      if (!item.quoted) for (const script of heredocSubstitutions(lines.join('\n'))) { nested.push(script); nestedAt.push(commands.indexOf(item.command)); }
    }
    pending = [];
    return i;
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    // A quoted or escaped heredoc delimiter keeps the body as data; a
    // backslash-newline is only a line continuation (NEW21).
    if (expect?.kind === 'heredoc' && ((c === '\\' && text[i + 1] !== '\n') || c === "'" || c === '"')) expect.quoted = true;
    if (c === '\\') {
      if (text[i + 1] !== '\n') append(text[i + 1] ?? '');
      i += 2; continue;
    }
    if (c === "'") {
      const end = text.indexOf("'", i + 1), stop = end === -1 ? text.length : end;
      append(text.slice(i + 1, stop)); i = stop + 1; continue;
    }
    if (c === '$' && text[i + 1] === "'") {
      let value = '';
      for (i += 2; i < text.length && text[i] !== "'"; i++) {
        if (text[i] === '\\') { i++; value += { n: '\n', t: '\t' }[text[i]] ?? text[i] ?? ''; } else value += text[i];
      }
      append(value); i++; continue;
    }
    if (c === '"') {
      let value = '';
      for (i++; i < text.length && text[i] !== '"'; i++) {
        const d = text[i];
        if (d === '\\') {
          const next = text[i + 1];
          if (next === '\n') { i++; continue; }
          if (['$', '`', '"', '\\'].includes(next)) { value += next; i++; continue; }
          value += d; continue;
        }
        if (d === '`') { const end = closingBacktick(text, i + 1); nest(text.slice(i + 1, end)); value += SUBSTITUTION; i = end; continue; }
        if (d === '$' && text[i + 1] === '(') {
          const end = matching(text, i + 1, '(', ')');
          if (text[i + 2] !== '(') nest(text.slice(i + 2, end));
          value += SUBSTITUTION; i = end; continue;
        }
        value += d;
      }
      append(value); i++; continue;
    }
    if (c === '`') {
      const end = closingBacktick(text, i + 1);
      nest(text.slice(i + 1, end)); append(SUBSTITUTION); i = end + 1; continue;
    }
    if (c === '$' && text[i + 1] === '(') {
      const end = matching(text, i + 1, '(', ')');
      if (text[i + 2] !== '(') nest(text.slice(i + 2, end));
      append(SUBSTITUTION); i = end + 1; continue;
    }
    if (c === '$' && text[i + 1] === '{') {
      const end = matching(text, i + 1, '{', '}');
      append(text.slice(i, end + 1)); i = end + 1; continue;
    }
    if ((c === '<' || c === '>') && text[i + 1] === '(') {
      const end = matching(text, i + 1, '(', ')');
      nest(text.slice(i + 2, end)); append(SUBSTITUTION); i = end + 1; continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') { pushWord(); i++; continue; }
    if (c === '\n') { endCommand('\n'); i = consumeHeredocs(i + 1); continue; }
    if (c === '#' && word === null) {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end; continue;
    }
    if (c === '&' && text[i + 1] === '>') {
      pushWord(); i += text[i + 2] === '>' ? 3 : 2; expect = { kind: 'redirect' }; continue;
    }
    if (c === ';' || c === '&' || c === '|') {
      const separator = text[i + 1] === c || (c === '|' && text[i + 1] === '&') ? c + text[i + 1] : c;
      endCommand(separator === ';;' ? ';' : separator);
      i += separator.length; continue;
    }
    if (c === '(' || c === ')') {
      endCommand();
      if (c === '(') subshells.push(nextSubshell++); else subshells.pop();
      current = fresh(); i++; continue;
    }
    if (c === '<' || c === '>') {
      if (word !== null && /^\d+$/u.test(word)) word = null; else pushWord();
      if (text.startsWith('<<<', i)) { i += 3; expect = { kind: 'herestring' }; continue; }
      if (text.startsWith('<<', i)) {
        i += 2; const strip = text[i] === '-'; if (strip) i++;
        expect = { kind: 'heredoc', strip }; continue;
      }
      i++;
      if (['>', '|', '&'].includes(text[i]) || (c === '<' && text[i] === '>')) i++;
      expect = { kind: 'redirect' }; continue;
    }
    append(c); i++;
  }
  endCommand();
  if (pending.length) consumeHeredocs(text.length);
  return { commands, nested, nestedAt };
}

export function commandName(word) {
  return String(word).split(/[\\/]/u).pop().replace(/\.exe$/iu, '');
}

function skipOptions(words, values) {
  let index = 0;
  while (index < words.length && /^-./u.test(words[index])) {
    if (words[index] === '--') { index++; break; }
    index += values.has(words[index]) ? 2 : 1;
  }
  return words.slice(index);
}

// Options of the wrappers that can change where a wrapped Git command acts,
// with short letters that take no operand (`flags`) or one (`values`), and
// long names (unique abbreviations accepted) that take none, one (`value`) or
// only an attached one (`optional`). The guard acts on the ones it models;
// any other option makes the directory and GIT_DIR unknown, so a push behind
// it is admitted rather than checked in the wrong place (NEW17, NEW23).
const WRAPPER_OPTIONS = {
  env: {
    flags: 'i0v', values: 'uCS',
    long: { 'ignore-environment': 'flag', null: 'flag', debug: 'flag', unset: 'value', chdir: 'value', 'split-string': 'value', 'default-signal': 'optional', 'ignore-signal': 'optional', 'block-signal': 'optional', 'list-signal-handling': 'flag' },
    act: { i: 'clear', 'ignore-environment': 'clear', u: 'unset', unset: 'unset', C: 'dir', chdir: 'dir' },
  },
  sudo: {
    flags: 'AbBEeHiKklnPSsVv', values: 'ugCDhprtTUR',
    long: { askpass: 'flag', background: 'flag', bell: 'flag', 'close-from': 'value', chdir: 'value', chroot: 'value', 'preserve-env': 'optional', edit: 'flag', group: 'value', 'set-home': 'flag', host: 'value', login: 'flag', 'remove-timestamp': 'flag', 'reset-timestamp': 'flag', list: 'flag', 'non-interactive': 'flag', 'preserve-groups': 'flag', prompt: 'value', role: 'value', stdin: 'flag', shell: 'flag', type: 'value', 'command-timeout': 'value', 'other-user': 'value', user: 'value', validate: 'flag', version: 'flag', help: 'flag' },
    act: { D: 'dir', chdir: 'dir', R: 'root', chroot: 'root', i: 'unknown', login: 'unknown', E: 'keep', 'preserve-env': 'keep' },
  },
  doas: { flags: 'nsL', values: 'uC', long: {}, act: {} },
  exec: { flags: 'cl', values: 'a', long: {}, act: { c: 'clear' } },
};
// A directory the guard cannot name.
const UNKNOWN_DIR = Symbol('unknown directory');

// Apply a wrapper's options to the scope; returns the words after them.
function wrapperOptions(name, words, scope) {
  const spec = WRAPPER_OPTIONS[name];
  let keep = false, unknown = false;
  const act = (option, value) => {
    const effect = option === null ? 'unknown' : spec.act[option];
    if (effect === 'unknown' || effect === 'root') { unknown = true; scope.chdir.push(UNKNOWN_DIR); scope.gitDirUnknown = true; }
    // Under another root even absolute paths name other directories.
    if (effect === 'root') scope.rooted = true;
    else if (effect === 'dir' && value !== undefined) scope.chdir.push(value);
    else if (effect === 'clear' || (effect === 'unset' && value === 'GIT_DIR')) { scope.gitDir = null; scope.gitDirUnknown = false; }
    else if (effect === 'keep') keep = value === null || value.split(',').includes('GIT_DIR');
  };
  let index = 0;
  for (; index < words.length; index++) {
    const word = words[index];
    if (word === '--') { index++; break; }
    if (word === '-' && name === 'env') { act('i', null); continue; }
    if (!/^-./u.test(word)) break;
    if (word.startsWith('--')) {
      const equals = word.indexOf('=');
      const given = equals === -1 ? word.slice(2) : word.slice(2, equals);
      const names = Object.keys(spec.long).filter(option => option === given || option.startsWith(given));
      const option = names.includes(given) ? given : names.length === 1 ? names[0] : null;
      if (option === null) { act(null); continue; }
      const value = equals !== -1 ? word.slice(equals + 1) : spec.long[option] === 'value' ? words[++index] : null;
      act(option, value); continue;
    }
    for (let at = 1; at < word.length; at++) {
      const letter = word[at];
      if (spec.flags.includes(letter)) { act(letter, null); continue; }
      if (spec.values.includes(letter)) { act(letter, at + 1 < word.length ? word.slice(at + 1) : words[++index]); break; }
      act(null); break;
    }
  }
  // sudo and doas start the command with a reset environment unless sudo is
  // told to preserve it (NEW14); `sudo`/`doas` policy beyond that is a limit.
  if ((name === 'sudo' && !keep && !unknown) || name === 'doas') { scope.gitDir = null; scope.gitDirUnknown = false; }
  return words.slice(index);
}

// The GIT_DIR a wrapped command inherits: its scope's prefix or the shell's,
// unknown when an unmodelled wrapper option may have changed it.
function scopedGitDir(scope, inherited) {
  const value = scope.gitDir !== undefined ? scope.gitDir : inherited;
  return scope.gitDirUnknown && value !== null ? UNKNOWN_GIT_DIR : value;
}

// Where a push may act, as the set of directories the shell may be in: each is
// a list of steps from the hook's directory (resolved by the hook). `unknown`
// marks a possible directory the guard cannot name (a `cd $VAR`, or a change
// inside a compound command or `eval`); the guard admits rather than guess
// there. The coverage list in PROTOCOL.md says which forms are followed.
const MAX_PLACES = 16;
const NOWHERE = Object.freeze({ dirs: [], unknown: false, overflow: false });
const HERE = Object.freeze({ dirs: [[]], unknown: false, overflow: false });
const SOMEWHERE = Object.freeze({ dirs: [], unknown: true, overflow: false });
// GIT_DIR set by shell-variable state the guard does not follow.
const UNKNOWN_GIT_DIR = Symbol('unknown GIT_DIR');
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/su;
const placesKey = places => JSON.stringify([places.dirs, places.unknown, places.overflow]);
const reachable = places => places.dirs.length > 0 || places.unknown || places.overflow;

function union(a, b) {
  const dirs = [], keys = new Set();
  let overflow = a.overflow || b.overflow;
  for (const dir of [...a.dirs, ...b.dirs]) {
    const key = JSON.stringify(dir);
    if (keys.has(key)) continue;
    if (dirs.length >= MAX_PLACES) { overflow = true; continue; }
    keys.add(key); dirs.push(dir);
  }
  return { dirs, unknown: a.unknown || b.unknown, overflow };
}

// Change directory to a literal target; an absolute target replaces every
// possibility (including unknown and omitted ones).
function move(places, target) {
  if (target === undefined || target === null || !reachable(places)) return places;
  if (target === UNKNOWN_DIR) return SOMEWHERE;
  if (String(target).startsWith('/')) return { dirs: [[target]], unknown: false, overflow: false };
  return { dirs: places.dirs.map(dir => [...dir, target]), unknown: places.unknown, overflow: places.overflow };
}

// env -S splits its string into arguments (quotes and backslash escapes, no
// shell syntax), then continues processing them as its own arguments (NEW13).
// Outside quotes `\_` separates arguments; inside double quotes it is a space.
function splitString(text) {
  const words = [];
  let word = null;
  const end = () => { if (word !== null) words.push(word); word = null; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n') { end(); continue; }
    if (c === "'") { const close = text.indexOf("'", i + 1), stop = close === -1 ? text.length : close; word = (word ?? '') + text.slice(i + 1, stop); i = stop; continue; }
    if (c === '"') {
      let value = '';
      for (i++; i < text.length && text[i] !== '"'; i++) {
        if (text[i] === '\\' && i + 1 < text.length) { const next = text[++i]; value += { _: ' ', n: '\n', t: '\t' }[next] ?? next; } else value += text[i];
      }
      word = (word ?? '') + value; continue;
    }
    if (c === '\\' && text[i + 1] === '_') { end(); i++; continue; }
    if (c === '\\' && i + 1 < text.length) { const next = text[++i]; word = (word ?? '') + ({ n: '\n', t: '\t' }[next] ?? next); continue; }
    word = (word ?? '') + c;
  }
  end();
  return words;
}

// Remove assignments, reserved words and wrappers until the real command. The
// scope collects what selects the repository a wrapped Git command acts on:
// wrapper directory options and GIT_DIR prefixes (NEW6), and whether a
// separate program wraps the command (then a `cd` or `eval` cannot change the
// calling shell, NEW18).
function unwrap(words, scope) {
  let rest = [...words];
  for (let guard = 0; guard < 32 && rest.length; guard++) {
    const assignment = ASSIGNMENT.exec(rest[0]);
    if (assignment?.[1] === 'GIT_DIR') { scope.gitDir = assignment[2]; scope.gitDirUnknown = false; }
    if (RESERVED.has(rest[0]) || assignment) { rest.shift(); continue; }
    const name = commandName(rest[0]);
    if (!WRAPPERS.has(name)) break;
    if (name === 'command' && ['-v', '-V'].includes(rest[1])) return [];
    if (!['command', 'builtin'].includes(name)) scope.external = true;
    // Only env's own options (before any assignment or command) can split; the
    // split arguments are then processed as env's own, so repeat.
    for (let splits = 0; name === 'env' && splits < 8; splits++) {
      let found = false;
      for (let at = 1; at < rest.length && /^-./u.test(rest[at]) && rest[at] !== '--'; at += WRAPPERS.get('env').has(rest[at]) ? 2 : 1) {
        const item = rest[at];
        // `-S…`, a cluster of flags ending in S (`-vS…`), or the long option.
        const short = /^-([i0v]*)S(.*)$/su.exec(item);
        if (!(short || item === '--split-string' || item.startsWith('--split-string='))) continue;
        const flags = short?.[1] ? [`-${short[1]}`] : [];
        const attached = short ? (short[2] || null) : item.startsWith('--split-string=') ? item.slice(15) : null;
        rest = [rest[0], ...rest.slice(1, at), ...flags, ...splitString(attached ?? rest[at + 1] ?? ''), ...rest.slice(at + (attached === null ? 2 : 1))];
        found = true; break;
      }
      if (!found) break;
    }
    rest = WRAPPER_OPTIONS[name] ? wrapperOptions(name, rest.slice(1), scope) : skipOptions(rest.slice(1), WRAPPERS.get(name));
    if (name === 'timeout') rest = rest.slice(1);
  }
  return rest;
}

function classifyGh(args, findings, depth) {
  const positionals = [];
  let method = null, merge = { method: null };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--') { positionals.push(...args.slice(index + 1)); break; }
    if (arg.startsWith('--')) {
      const equals = arg.indexOf('=');
      const flag = equals === -1 ? arg : arg.slice(0, equals);
      const value = equals !== -1 ? arg.slice(equals + 1) : GH_VALUE_LONG.has(flag) ? args[++index] : null;
      if (flag === '--method') method = value;
      if (['--squash', '--rebase', '--merge'].includes(flag)) merge.method = flag.slice(2);
      continue;
    }
    if (/^-./u.test(arg)) {
      const flag = arg.slice(0, 2);
      if (GH_VALUE_SHORT.has(flag)) {
        const value = arg.length > 2 ? arg.slice(2) : args[++index];
        if (flag === '-X') method = value;
      } else if (/^-[smr]+$/u.test(arg)) merge.method = { s: 'squash', m: 'merge', r: 'rebase' }[arg.at(-1)];
      continue;
    }
    positionals.push(arg);
  }
  if (positionals[0] === 'pr' && positionals[1] === 'merge') {
    const number = /^#?(\d+)$/u.exec(positionals[2] ?? '')?.[1];
    findings.push({ kind: 'gh-pr-merge', ...(number ? { number: Number(number) } : {}), ...(merge.method ? { method: merge.method } : {}) });
  }
  if (positionals[0] === 'api') {
    const endpoint = positionals[1] ?? '';
    const read = ['GET', 'HEAD'].includes(String(method ?? '').toUpperCase());
    const match = MERGE_ENDPOINT.exec(endpoint);
    if (match && !read) findings.push({ kind: 'gh-api-merge', ...(/^\d+$/u.test(match[1]) ? { number: Number(match[1]) } : {}) });
    if (endpoint === 'graphql' && args.some(arg => GRAPHQL_MERGE.test(arg))) findings.push({ kind: 'gh-api-graphql-merge' });
  }
  if (positionals[0] === 'alias' && positionals[1] === 'set') findings.push(...classifyShellCommand(`gh ${positionals.slice(3).join(' ')}`, depth + 1).map(item => ({ ...item, alias: true })));
}

// A push finding names where it acts: `locations` are directory-step lists from
// the hook's directory. The repository is where Git runs (the shell's
// directory, then wrapper directory options, then each `-C`) or, when set, the
// Git directory (`--git-dir` over a GIT_DIR prefix over an inherited value; a
// `.git` directory stands for its parent). A work tree selects only the
// checkout (NEW7). `unknown` marks a possible location the guard cannot name.
function classifyGit(args, findings, scope, state) {
  let index = 0;
  const directories = [];
  let gitDir = null;
  while (index < args.length && /^-./u.test(args[index])) {
    const arg = args[index];
    // Git accepts `-C dir` and the attached `-Cdir`; each changes directory in order (NEW6).
    if (arg.length > 2 && arg.startsWith('-C')) { directories.push(arg.slice(2)); index++; continue; }
    if (arg.startsWith('--git-dir=')) { gitDir = arg.slice(10); index++; continue; }
    if (GIT_GLOBAL_VALUES.has(arg)) {
      const value = args[index + 1];
      if (arg === '-C') directories.push(value);
      else if (arg === '--git-dir') gitDir = value;
      index += 2;
    } else index++;
  }
  if (args[index] !== 'push') return;
  const rest = args.slice(index + 1);
  const positionals = [];
  let all = false, tags = false, remoteOption = null;
  for (let at = 0; at < rest.length; at++) {
    const arg = rest[at];
    if (arg === '--') { positionals.push(...rest.slice(at + 1)); break; }
    if (['--all', '--mirror', '--branches'].includes(arg)) { all = true; continue; }
    if (arg === '--tags') { tags = true; continue; }
    if (arg.startsWith('--repo=')) { remoteOption = arg.slice(7); continue; }
    if (PUSH_VALUES.has(arg)) { if (arg === '--repo') remoteOption = rest[at + 1]; at++; continue; }
    if (/^-./u.test(arg)) continue;
    positionals.push(arg);
  }
  const remote = remoteOption ?? positionals.shift() ?? null;
  const base = [...scope.chdir, ...directories].reduce(move, state.places);
  const dir = gitDir ?? scopedGitDir(scope, state.gitDir);
  let where = base;
  if (scope.rooted || state.rooted) where = reachable(base) ? SOMEWHERE : NOWHERE;
  else if (dir === UNKNOWN_GIT_DIR) where = reachable(base) ? SOMEWHERE : NOWHERE;
  else if (dir) where = /(?:^|\/)\.git\/*$/u.test(dir) ? move(move(base, dir), '..') : move(base, dir);
  findings.push({ kind: 'git-push', remote, refspecs: positionals, all, tags, locations: where.dirs, ...(where.unknown ? { unknown: true } : {}), ...(where.overflow ? { overflow: true } : {}) });
}

// The directory a `cd`/`pushd`/`popd` moves to: a literal target, undefined
// when the guard cannot name it (no target, `-`, `~`, a variable, a
// substitution, a glob, a stack entry, `popd`, or an option it does not model),
// or null when the command does not move (not one of these, or `pushd -n`/
// `popd -n`, which only edit the directory stack; NEW22).
function changedDirectory(words) {
  const name = commandName(words[0] ?? '');
  if (!['cd', 'pushd', 'popd'].includes(name)) return null;
  const args = words.slice(1);
  let index = 0, stackOnly = false;
  for (; index < args.length && /^-./u.test(args[index]); index++) {
    const word = args[index];
    if (word === '--') { index++; break; }
    if (name === 'cd' && /^-[LPe@]+$/u.test(word)) continue;
    if (name !== 'cd' && word === '-n') { stackOnly = true; continue; }
    if (name !== 'cd' && /^-\d+$/u.test(word)) break;
    return undefined;
  }
  if (stackOnly) return null;
  const operands = args.slice(index);
  if (name === 'popd' || operands.length !== 1) return undefined;
  const target = operands[0];
  return target && !/^[~+-]|[$`*?[\u0000]/u.test(target) ? target : undefined;
}

// How a command changes GIT_DIR for later commands: 'unset' (`unset`,
// `export -n`), 'set' (an assignment, alone or with export/declare/typeset/
// local/readonly), or null.
function gitDirChange(words) {
  const name = commandName(words[0] ?? '');
  const names = words.slice(1).filter(word => !/^[-+]/u.test(word)).map(word => word.split('=')[0]);
  if (name === 'unset' || (name === 'export' && words.includes('-n'))) return names.includes('GIT_DIR') ? 'unset' : null;
  if (['export', 'declare', 'typeset', 'local', 'readonly'].includes(name)) return names.includes('GIT_DIR') ? 'set' : null;
  return words.every(word => ASSIGNMENT.test(word)) && words.some(word => word.startsWith('GIT_DIR=')) ? 'set' : null;
}

const OPENERS = new Set(['if', 'while', 'until', 'for', 'select', 'case', '{']);
const CLOSERS = new Set(['fi', 'done', 'esac', '}']);
const BRANCHES = new Set(['then', 'else', 'elif', 'do']);
const PIPED = new Set(['|', '|&']);

// Classify a script, following where each command runs (see PROTOCOL.md for
// the coverage list). Returns the findings and where the shell may be at the
// end. Each and-or list (`a && b || c`) tracks the places the shell may be in
// after the last command succeeded (`ok`) or failed (`fail`):
//
// - `cd`/`pushd` to a literal directory is assumed to succeed, except that a
//   command right after `cd … ||` runs where the shell was; `exit` ends the
//   script; `true`/`:` and `false` succeed and fail; other commands may do
//   either and do not move.
// - A command after `&&` runs from `ok`, after `||` from `fail`, and a new list
//   from either. So `x && cd d; git push` is checked in both places.
// - A command in a pipeline or in the background runs in a subshell and changes
//   nothing, and a backgrounded list leaves the shell where it started. A
//   `( … )` subshell is one command of its list: it joins with its exit status,
//   and its changes end with it.
// - A change inside a compound command (`if`, `case`, loops, brace groups,
//   functions) or `eval`, and any GIT_DIR assignment, is not followed: the
//   location becomes unknown and such pushes are admitted.
// - A substitution (also in an unquoted heredoc body) runs where its command
//   runs; a `bash -c` script or heredoc starts there too, with the wrapper's
//   directory and GIT_DIR.
function analyze(text, depth, start) {
  if (typeof text !== 'string' || depth > MAX_DEPTH) return { findings: [], places: start.places, gitDir: start.gitDir };
  const { commands, nested, nestedAt } = parseShell(text);
  const findings = [];
  let ok = start.places, fail = NOWHERE, listStart = start.places, gitDir = start.gitDir;
  let compound = 0, path = [], fallback = null, pipeline = null, composite = null;
  // Statuses an `exit` in the current subshell may end it with.
  let exits = { ok: false, fail: false };
  const saved = [];
  // Where a command starts, from the separator before it. A command right after
  // `cd … ||` runs where the shell was before the cd; every command of a
  // pipeline starts where the pipeline does.
  const inputFor = before => PIPED.has(before) && pipeline ? pipeline.input : before === '&&' ? ok : before === '||' ? (fallback ? union(fail, fallback) : fail) : before === '&' ? listStart : union(ok, fail);
  // Join a command's result to its and-or list. A pipeline's status is its last
  // command's, joined by the separator before its first command (NEW20).
  const join = (before, after, input, result) => {
    if (PIPED.has(after)) { if (!PIPED.has(before)) pipeline = { before, input }; return; }
    let link = before;
    if (PIPED.has(before)) { if (!pipeline) return; link = pipeline.before; pipeline = null; }
    if (link === '&&') { ok = result.ok; fail = union(result.fail, fail); }
    else if (link === '||') { fail = result.fail; ok = union(result.ok, ok); }
    else { ok = result.ok; fail = result.fail; }
  };
  // A `( … )` subshell is one composite command: it starts a fresh list where
  // the caller's list reaches it, and joins the caller's list with its exit
  // status while its directory and GIT_DIR changes end with it. An `exit`
  // inside it ends it with its literal status (`exit 0` succeeds, another
  // number fails), or either status without one.
  const enter = (before, id) => {
    const input = inputFor(before);
    if (!['&&', '||', '|', '|&'].includes(before)) listStart = input;
    saved.push({ ok, fail, listStart, gitDir, pipeline, before, input, exits });
    path.push(id);
    ok = input; fail = NOWHERE; listStart = input; pipeline = null; fallback = null; exits = { ok: false, fail: false };
  };
  const leave = () => {
    const entered = saved.pop(); path.pop();
    const result = { ok: exits.ok || reachable(ok) ? entered.input : NOWHERE, fail: exits.fail || reachable(fail) ? entered.input : NOWHERE };
    ({ ok, fail, listStart, gitDir, pipeline, exits } = entered); fallback = null;
    composite = { before: entered.before, input: entered.input, ok, fail, pipeline };
    join(entered.before, null, entered.input, result);
  };
  const classifyNested = (index, state) => {
    for (let at = 0; at < nested.length; at++) if (nestedAt[at] === index) findings.push(...analyze(nested[at], depth + 1, state).findings);
  };
  commands.forEach((command, index) => {
    const target = command.subshells;
    while (path.length && !path.every((id, k) => target[k] === id)) leave();
    // A subshell turned out to be piped: it joins as a pipeline element instead.
    if (composite && PIPED.has(command.before)) {
      ({ ok, fail, pipeline } = composite);
      if (!PIPED.has(composite.before)) pipeline = { before: composite.before, input: composite.input };
    }
    composite = null;
    const entering = path.length < target.length;
    for (let first = true; path.length < target.length; first = false) enter(first ? command.before : null, target[path.length]);
    const head = command.words[0];
    const inside = compound > 0 || OPENERS.has(head) || BRANCHES.has(head) || head === 'function';
    if (OPENERS.has(head) || (head === 'function' && command.words.includes('{'))) compound++;
    if (CLOSERS.has(head)) compound = Math.max(0, compound - 1);
    // The first command inside a new subshell starts its list.
    const before = entering ? null : command.before;
    const input = inputFor(before);
    if (!['&&', '||', '|', '|&'].includes(before)) listStart = input;
    const state = { places: input, gitDir, rooted: start.rooted };
    classifyNested(index, state);
    const scope = { chdir: [], gitDir: undefined, gitDirUnknown: false, rooted: false, external: false };
    const words = unwrap(command.words, scope);
    const name = words.length ? commandName(words[0]) : null;
    const inner = { places: scope.chdir.reduce(move, input), gitDir: scopedGitDir(scope, gitDir), rooted: start.rooted || scope.rooted };
    let result = { ok: input, fail: input };
    if (name && SHELLS.has(name)) {
      const flag = words.findIndex((word, at) => at > 0 && /^-[A-Za-z]*c[A-Za-z]*$/u.test(word));
      if (flag !== -1) {
        const script = words.slice(flag + 1).find(word => !/^[-+]/u.test(word));
        if (script !== undefined) findings.push(...analyze(script, depth + 1, inner).findings);
      } else for (const script of [...command.heredocs, ...command.herestrings]) findings.push(...analyze(script, depth + 1, inner).findings);
    } else if (name === 'gh') classifyGh(words.slice(1), findings, depth);
    else if (name === 'git') classifyGit(words.slice(1), findings, scope, state);
    else if (name === 'eval') {
      const evaluated = analyze(words.slice(1).join(' '), depth + 1, inner);
      findings.push(...evaluated.findings);
      // eval runs in the current shell; its changes are not followed (a limit).
      if (!scope.external && placesKey(evaluated.places) !== placesKey(inner.places)) result = { ok: SOMEWHERE, fail: SOMEWHERE };
      if (!scope.external && evaluated.gitDir !== inner.gitDir) gitDir = UNKNOWN_GIT_DIR;
    }
    // Changes to the shell itself: only unwrapped (or `command`/`builtin`)
    // builtins outside pipelines and the background change it.
    const own = !scope.external && !PIPED.has(command.before) && !['|', '|&', '&'].includes(command.after);
    const moved = own && words.length ? changedDirectory(words) : null;
    // A function body may change anything when called later (a limit).
    if (head === 'function') result = { ok: SOMEWHERE, fail: SOMEWHERE };
    if (moved !== null) result = inside ? { ok: SOMEWHERE, fail: SOMEWHERE } : { ok: moved === undefined ? (reachable(input) ? SOMEWHERE : NOWHERE) : move(input, moved), fail: NOWHERE };
    // `unwrap` drops assignments, so a bare `GIT_DIR=…` is read from the words.
    const variable = own ? gitDirChange(words.length ? words : command.words.filter(word => !RESERVED.has(word))) : null;
    if (variable === 'set') gitDir = UNKNOWN_GIT_DIR;
    if (variable === 'unset') gitDir = !inside && [null, ';', '\n'].includes(before) ? null : gitDir === null ? null : UNKNOWN_GIT_DIR;
    if (!inside && moved === null) {
      if (name === 'exit' && own) {
        if (reachable(input)) {
          // A literal code counts modulo 256; without one, exit keeps the
          // previous command's status.
          const code = words[1];
          const literal = code !== undefined && /^-?\d+$/u.test(code) ? ((BigInt(code) % 256n) + 256n) % 256n === 0n : null;
          const previous = before === '&&' ? [true, false] : before === '||' ? [false, true] : before === '&' ? [true, false] : before === null ? [true, true] : [reachable(ok), reachable(fail)];
          const [succeeds, fails] = code === undefined ? previous : literal === null ? [true, true] : [literal, !literal];
          if (succeeds) exits.ok = true;
          if (fails) exits.fail = true;
        }
        result = { ok: NOWHERE, fail: NOWHERE };
      }
      else if (command.words.length === 1 && ['true', ':'].includes(head)) result = { ok: input, fail: NOWHERE };
      else if (command.words.length === 1 && head === 'false') result = { ok: NOWHERE, fail: input };
    }
    fallback = moved !== null && !inside ? input : null;
    join(before, command.after, input, result);
  });
  while (path.length) leave();
  const end = commands.at(-1)?.after === '&' ? listStart : union(ok, fail);
  classifyNested(commands.length, { places: end, gitDir, rooted: start.rooted });
  return { findings, places: end, gitDir };
}

// Returns merge/push findings; an empty list means the guard has no opinion.
export function classifyShellCommand(text, depth = 0) {
  return analyze(text, depth, { places: HERE, gitDir: null }).findings;
}

// Branch names a push finding may update. `current` resolves HEAD and an
// implicit destination (push.default simple/current); '*' globs match branches.
// `--tags` adds refs/tags/* as a refspec, so with no other refspec git pushes
// only tags and no implicit branch; explicit refspecs still apply. The matching
// refspec `:` (or `+:`) is treated like `--all`.
export function pushDestinations(finding, current) {
  if (finding.all) return ['*'];
  if (!finding.refspecs.length) return finding.tags ? [] : current ? [current] : [];
  const destinations = [];
  for (const refspec of finding.refspecs) {
    const spec = refspec.replace(/^\+/u, '');
    // The matching refspec (`:` or `+:`) updates every branch that exists on
    // both sides, so it may update any protected branch.
    if (spec === ':') { destinations.push('*'); continue; }
    let destination = spec.includes(':') ? spec.slice(spec.indexOf(':') + 1) : spec;
    if (!destination) continue;
    if (destination === 'HEAD' || destination === '@') destination = current;
    if (!destination) continue;
    if (destination.startsWith('refs/heads/')) destination = destination.slice('refs/heads/'.length);
    else if (destination.startsWith('refs/')) continue;
    destinations.push(destination);
  }
  return destinations;
}

// Whether a destination (possibly a refspec glob) names a protected branch.
export function destinationMatches(destination, branch) {
  if (!destination.includes('*')) return destination === branch;
  const pattern = destination.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('.*');
  return new RegExp(`^${pattern}$`, 'u').test(branch);
}
