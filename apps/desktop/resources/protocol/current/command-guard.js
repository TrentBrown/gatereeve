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
  // ';', '\n', '&&', '||', '|', '|&' or '&'. Subshell parentheses do not count.
  let before = null;
  let current = fresh();
  let word = null, expect = null, pending = [];
  const append = value => { word = (word ?? '') + value; };
  const pushWord = () => {
    if (word === null) return;
    if (expect?.kind === 'heredoc') pending.push({ delimiter: word, strip: expect.strip, command: current });
    else if (expect?.kind === 'herestring') current.herestrings.push(word);
    else if (!expect) current.words.push(word);
    expect = null; word = null;
  };
  const endCommand = (separator = null) => {
    pushWord();
    if (current.words.length || current.heredocs.length || current.herestrings.length || pending.some(item => item.command === current)) {
      current.before = before; current.after = separator; commands.push(current);
      before = separator;
    } else if (separator !== null) before = separator;
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
    }
    pending = [];
    return i;
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
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

// Wrapper options that change the working directory of the wrapped command.
const CHDIR = { env: { short: '-C', long: '--chdir' }, sudo: { short: '-D', long: '--chdir' } };

function wrapperDirectories(name, words, values) {
  const option = CHDIR[name];
  const directories = [];
  if (!option) return directories;
  for (let index = 0; index < words.length && /^-./u.test(words[index]); index++) {
    const word = words[index];
    if (word === '--') break;
    if (word === option.short || word === option.long) directories.push(words[index + 1]);
    else if (word.startsWith(`${option.long}=`)) directories.push(word.slice(option.long.length + 1));
    else if (word.length > 2 && word.startsWith(option.short)) directories.push(word.slice(2));
    if (values.has(word)) index++;
  }
  return directories.filter(item => item !== undefined);
}

// Where a command may run, as it affects which repository a push acts on:
// directory steps from the hook's directory (an absolute step replaces earlier
// ones) and the inherited GIT_DIR (null when unset). A script tracks the set of
// contexts each command could run in, in execution order: directory and Git
// environment changes made by earlier commands (`cd`, `pushd`, `export`,
// assignments, `unset`, and those made inside `eval`) add contexts for later
// commands in the same or an enclosed subshell. Conditionals cannot remove a
// context, so a push after an uncertain change is checked in each (fail closed);
// in a script with a loop every command sees every context. Past MAX_CONTEXTS
// the result is marked as overflowing and the hook denies its pushes.
const ROOT_CONTEXT = Object.freeze({ steps: [], gitDir: null });
const MAX_CONTEXTS = 64;
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/su;
const LOOPS = new Set(['for', 'while', 'until', 'select']);
const contextKey = context => JSON.stringify([context.steps, context.gitDir]);

function step(steps, next) {
  if (next === undefined || next === null) return steps;
  return String(next).startsWith('/') ? [next] : [...steps, next];
}

function contextSet(initial = []) {
  const set = { items: [], keys: new Set(), overflow: false };
  for (const context of initial) addContext(set, context);
  return set;
}

function addContext(set, context) {
  const key = contextKey(context);
  if (set.keys.has(key)) return;
  if (set.items.length >= MAX_CONTEXTS) { set.overflow = true; return; }
  set.keys.add(key); set.items.push(context);
}

function mergeSets(target, source) {
  for (const context of source.items) addContext(target, context);
  if (source.overflow) target.overflow = true;
  return target;
}

// A wrapper's directory changes and Git environment apply to what it runs.
// scope.gitDir: undefined inherits, null clears, a string sets.
function within(set, scope) {
  const result = contextSet();
  for (const context of set.items) {
    addContext(result, {
      steps: scope.chdir.reduce(step, context.steps),
      gitDir: scope.gitDir === undefined ? context.gitDir : scope.gitDir,
    });
  }
  if (set.overflow) result.overflow = true;
  return result;
}

// env -S splits its string into arguments (quotes and backslash escapes, no
// shell syntax), then continues processing them as its own arguments (NEW13).
function splitString(text) {
  const words = [];
  let word = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n') { if (word !== null) words.push(word); word = null; continue; }
    if (c === "'") { const end = text.indexOf("'", i + 1), stop = end === -1 ? text.length : end; word = (word ?? '') + text.slice(i + 1, stop); i = stop; continue; }
    if (c === '"') {
      let value = '';
      for (i++; i < text.length && text[i] !== '"'; i++) value += text[i] === '\\' && i + 1 < text.length ? text[++i] : text[i];
      word = (word ?? '') + value; continue;
    }
    if (c === '\\' && i + 1 < text.length) { const next = text[++i]; word = (word ?? '') + ({ _: ' ', n: '\n', t: '\t' }[next] ?? next); continue; }
    word = (word ?? '') + c;
  }
  if (word !== null) words.push(word);
  return words;
}

// Git environment effects of a wrapper's options: env -i/-u, and sudo/doas,
// which reset the environment unless sudo is told to preserve it (NEW14).
function wrapperEnvironment(name, words, values, scope) {
  if (name === 'sudo' || name === 'doas') {
    const preserves = words.some((word, index) => index < words.length && (word === '-E' || word === '--preserve-env' || (word.startsWith('--preserve-env=') && word.slice(15).split(',').includes('GIT_DIR'))));
    if (!(name === 'sudo' && preserves)) scope.gitDir = null;
    return;
  }
  if (name !== 'env') return;
  for (let index = 0; index < words.length && /^-./u.test(words[index]) && words[index] !== '--'; index++) {
    const word = words[index];
    if (word.startsWith('--')) {
      if (word === '--ignore-environment') scope.gitDir = null;
      const unset = word === '--unset' ? words[++index] : word.startsWith('--unset=') ? word.slice(8) : null;
      if (unset === 'GIT_DIR') scope.gitDir = null;
      else if (values.has(word)) index++;
      continue;
    }
    // A short-option cluster such as -iu NAME: letters until one that takes a value.
    for (let at = 1; at < word.length; at++) {
      const letter = word[at];
      if (letter === 'i') { scope.gitDir = null; continue; }
      if (!'uCS'.includes(letter)) continue;
      const value = at + 1 < word.length ? word.slice(at + 1) : words[++index];
      if (letter === 'u' && value === 'GIT_DIR') scope.gitDir = null;
      break;
    }
  }
}

// Remove assignments, reserved words and wrappers until the real command. The
// scope collects what selects the repository a wrapped Git command acts on:
// wrapper directory changes and GIT_DIR assignments (NEW6).
function unwrap(words, depth, findings, scope = { chdir: [], gitDir: undefined }, set = contextSet([ROOT_CONTEXT])) {
  let rest = [...words];
  for (let guard = 0; guard < 32 && rest.length; guard++) {
    const assignment = ASSIGNMENT.exec(rest[0]);
    if (assignment?.[1] === 'GIT_DIR') scope.gitDir = assignment[2];
    if (RESERVED.has(rest[0]) || assignment) { rest.shift(); continue; }
    const name = commandName(rest[0]);
    if (!WRAPPERS.has(name)) break;
    if (name === 'command' && ['-v', '-V'].includes(rest[1])) return [];
    // Only env's own options (before any assignment or command) can split; the
    // split arguments are then processed as env's own, so repeat.
    for (let splits = 0; name === 'env' && splits < 8; splits++) {
      let found = false;
      for (let at = 1; at < rest.length && /^-./u.test(rest[at]) && rest[at] !== '--'; at += WRAPPERS.get('env').has(rest[at]) ? 2 : 1) {
        const item = rest[at];
        if (!(item.startsWith('-S') || item === '--split-string' || item.startsWith('--split-string='))) continue;
        const attached = item.startsWith('--split-string=') ? item.slice(15) : item.length > 2 && item.startsWith('-S') ? item.slice(2) : null;
        rest = [rest[0], ...rest.slice(1, at), ...splitString(attached ?? rest[at + 1] ?? ''), ...rest.slice(at + (attached === null ? 2 : 1))];
        found = true; break;
      }
      if (!found) break;
    }
    scope.chdir.push(...wrapperDirectories(name, rest.slice(1), WRAPPERS.get(name)));
    wrapperEnvironment(name, rest.slice(1), WRAPPERS.get(name), scope);
    rest = skipOptions(rest.slice(1), WRAPPERS.get(name));
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

function classifyGit(args, findings, scope, set) {
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
  // The repository the push acts on, as directory steps from the hook's directory,
  // in each context the command could run in: where Git runs (wrappers, then each
  // -C) or, when set, the Git directory (option over environment, as in Git; a
  // `.git` directory stands for its parent). A work tree selects only the
  // checkout, not the repository (NEW7).
  const runs = within(set, scope);
  const locations = [];
  const seen = new Set();
  for (const context of runs.items) {
    const base = directories.reduce(step, context.steps);
    const dir = gitDir ?? context.gitDir;
    const location = dir ? (/(?:^|\/)\.git\/*$/u.test(dir) ? step(step(base, dir), '..') : step(base, dir)) : base;
    const key = JSON.stringify(location);
    if (!seen.has(key)) { seen.add(key); locations.push(location); }
  }
  findings.push({ kind: 'git-push', remote, refspecs: positionals, all, tags, locations, ...(runs.overflow ? { overflow: true } : {}) });
}

// The directory a `cd`/`pushd` command names, when it is a literal target.
function changedDirectory(words) {
  if (!['cd', 'pushd'].includes(commandName(words[0] ?? ''))) return null;
  const target = words.slice(1).find(word => word !== '--' && !/^[-+]./u.test(word));
  return target && target !== '-' && !target.startsWith('~') ? target : null;
}

// GIT_DIR changes for later commands: assignments (alone or with `export`,
// `declare`, `typeset`, `local`, `readonly`) set it; `unset` or `export -n`
// clears it.
function environmentChanges(words) {
  const name = commandName(words[0] ?? '');
  if (name === 'unset') return words.slice(1).includes('GIT_DIR') ? [null] : [];
  if (name === 'export' && words.includes('-n')) return words.slice(1).some(word => word === 'GIT_DIR' || word.startsWith('GIT_DIR=')) ? [null] : [];
  const rest = ['export', 'declare', 'typeset', 'local', 'readonly'].includes(name) ? words.slice(1).filter(word => !/^[-+]/u.test(word)) : words;
  if (!rest.length || (rest === words && !rest.every(word => ASSIGNMENT.test(word)))) return [];
  return rest.map(word => ASSIGNMENT.exec(word)).filter(match => match?.[1] === 'GIT_DIR').map(match => match[2]);
}

// Classify one simple command in the given contexts. Returns its findings and,
// when it changes the current shell's directory or GIT_DIR, the contexts it adds.
function classifyWords(command, depth, set) {
  const findings = [];
  // A command made only of assignments changes the current shell's variables.
  const bare = command.words.filter(word => !RESERVED.has(word));
  if (bare.length && bare.every(word => ASSIGNMENT.test(word))) {
    let effects = null;
    for (const value of environmentChanges(bare)) effects = mergeSets(effects ?? contextSet(), contextSet(set.items.map(context => ({ ...context, gitDir: value }))));
    return { findings, effects };
  }
  const scope = { chdir: [], gitDir: undefined };
  const words = unwrap(command.words, depth, findings, scope, set);
  if (!words.length) return { findings, effects: null };
  const name = commandName(words[0]);
  const inner = within(set, scope);
  let effects = null;
  if (SHELLS.has(name)) {
    const flag = words.findIndex((word, index) => index > 0 && /^-[A-Za-z]*c[A-Za-z]*$/u.test(word));
    if (flag !== -1) {
      const script = words.slice(flag + 1).find(word => !/^[-+]/u.test(word));
      if (script !== undefined) findings.push(...analyze(script, depth + 1, inner).findings);
    } else for (const script of [...command.heredocs, ...command.herestrings]) findings.push(...analyze(script, depth + 1, inner).findings);
  } else if (name === 'eval') {
    // eval runs in the current shell, so its changes reach later commands (NEW8).
    const result = analyze(words.slice(1).join(' '), depth + 1, inner);
    findings.push(...result.findings);
    effects = result.after;
  } else if (name === 'gh') classifyGh(words.slice(1), findings, depth);
  else if (name === 'git') classifyGit(words.slice(1), findings, scope, set);
  const target = changedDirectory(words);
  if (target) effects = mergeSets(effects ?? contextSet(), contextSet(set.items.map(context => ({ ...context, steps: step(context.steps, target) }))));
  for (const value of environmentChanges(words)) effects = mergeSets(effects ?? contextSet(), contextSet(set.items.map(context => ({ ...context, gitDir: value }))));
  return { findings, effects };
}

const OPENERS = new Set(['if', 'while', 'until', 'for', 'select', 'case', '{']);
const CLOSERS = new Set(['fi', 'done', 'esac', '}']);
const BRANCHES = new Set(['then', 'else', 'elif', 'do']);

// Analyze a script in execution order (see ROOT_CONTEXT). Returns its findings
// and the contexts the current shell is in afterwards.
//
// - A command that certainly runs (at the start, or after `;` or a newline,
//   outside any compound command) and changes directory or GIT_DIR replaces
//   the current contexts. One that may not run (after `&&` or `||`, or inside
//   `if`/`case`/a loop/a brace group or function) adds to them.
// - A command after `||` or inside a compound command may run in any context
//   seen so far.
// - A command in a pipeline or in the background runs in a subshell and changes
//   nothing; a `( … )` subshell's changes end with it; `$( … )` runs in the
//   contexts of the command that contains it.
// - In a script with a loop, every command may follow every other, so a second
//   pass classifies every command in every context the first pass saw.
function analyze(text, depth, initial) {
  if (typeof text !== 'string' || depth > MAX_DEPTH) return { findings: [], after: initial };
  const { commands, nested, nestedAt } = parseShell(text);
  const copy = set => mergeSets(contextSet(), set);
  const loop = commands.some(command => LOOPS.has(command.words[0]) || command.words[0] === 'do');
  const pass = (start, everywhere) => {
    let current = copy(start);
    const all = copy(start);
    const saved = new Map();
    let path = [], compound = 0;
    const findings = [];
    const classifyNested = (index, set) => {
      for (let at = 0; at < nested.length; at++) {
        if (nestedAt[at] === index) findings.push(...analyze(nested[at], depth + 1, set).findings);
      }
    };
    commands.forEach((command, index) => {
      const target = command.subshells;
      while (path.length && !path.every((id, k) => target[k] === id)) current = saved.get(path.pop());
      while (path.length < target.length) { const id = target[path.length]; saved.set(id, copy(current)); path.push(id); }
      const head = command.words[0];
      const inside = compound > 0 || OPENERS.has(head) || BRANCHES.has(head);
      if (OPENERS.has(head)) compound++;
      if (CLOSERS.has(head)) compound = Math.max(0, compound - 1);
      const available = everywhere || inside || command.before === '||' ? copy(all) : copy(current);
      classifyNested(index, available);
      const result = classifyWords(command, depth, available);
      findings.push(...result.findings);
      const subshell = ['|', '|&'].includes(command.before) || ['|', '|&', '&'].includes(command.after);
      if (!result.effects || subshell) return;
      const certain = !inside && [null, ';', '\n'].includes(command.before);
      current = certain ? copy(result.effects) : mergeSets(current, result.effects);
      mergeSets(all, result.effects);
    });
    while (path.length) current = saved.get(path.pop());
    classifyNested(commands.length, everywhere ? copy(all) : copy(current));
    return { findings, after: everywhere ? all : current, all };
  };
  const first = pass(initial, false);
  if (!loop) return { findings: first.findings, after: first.after };
  const second = pass(first.all, true);
  return { findings: second.findings, after: second.all };
}

// Returns merge/push findings; an empty list means the guard has no opinion.
export function classifyShellCommand(text, depth = 0) {
  return analyze(text, depth, contextSet([ROOT_CONTEXT])).findings;
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
