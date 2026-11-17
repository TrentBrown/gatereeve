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
  const commands = [], nested = [];
  let current = { words: [], heredocs: [], herestrings: [] };
  let word = null, expect = null, pending = [];
  const append = value => { word = (word ?? '') + value; };
  const pushWord = () => {
    if (word === null) return;
    if (expect?.kind === 'heredoc') pending.push({ delimiter: word, strip: expect.strip, command: current });
    else if (expect?.kind === 'herestring') current.herestrings.push(word);
    else if (!expect) current.words.push(word);
    expect = null; word = null;
  };
  const endCommand = () => {
    pushWord();
    if (current.words.length || current.heredocs.length || current.herestrings.length || pending.some(item => item.command === current)) commands.push(current);
    current = { words: [], heredocs: [], herestrings: [] };
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
        if (d === '`') { const end = closingBacktick(text, i + 1); nested.push(text.slice(i + 1, end)); value += SUBSTITUTION; i = end; continue; }
        if (d === '$' && text[i + 1] === '(') {
          const end = matching(text, i + 1, '(', ')');
          if (text[i + 2] !== '(') nested.push(text.slice(i + 2, end));
          value += SUBSTITUTION; i = end; continue;
        }
        value += d;
      }
      append(value); i++; continue;
    }
    if (c === '`') {
      const end = closingBacktick(text, i + 1);
      nested.push(text.slice(i + 1, end)); append(SUBSTITUTION); i = end + 1; continue;
    }
    if (c === '$' && text[i + 1] === '(') {
      const end = matching(text, i + 1, '(', ')');
      if (text[i + 2] !== '(') nested.push(text.slice(i + 2, end));
      append(SUBSTITUTION); i = end + 1; continue;
    }
    if (c === '$' && text[i + 1] === '{') {
      const end = matching(text, i + 1, '{', '}');
      append(text.slice(i, end + 1)); i = end + 1; continue;
    }
    if ((c === '<' || c === '>') && text[i + 1] === '(') {
      const end = matching(text, i + 1, '(', ')');
      nested.push(text.slice(i + 2, end)); append(SUBSTITUTION); i = end + 1; continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') { pushWord(); i++; continue; }
    if (c === '\n') { endCommand(); i = consumeHeredocs(i + 1); continue; }
    if (c === '#' && word === null) {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end; continue;
    }
    if (c === '&' && text[i + 1] === '>') {
      pushWord(); i += text[i + 2] === '>' ? 3 : 2; expect = { kind: 'redirect' }; continue;
    }
    if (c === ';' || c === '&' || c === '|') {
      endCommand();
      i += text[i + 1] === c || (c === '|' && text[i + 1] === '&') ? 2 : 1; continue;
    }
    if (c === '(' || c === ')') { endCommand(); i++; continue; }
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
  return { commands, nested };
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

// Where a command runs, as it affects which repository a push acts on: directory
// steps from the hook's directory and an inherited GIT_DIR. Only what the command
// itself (or a wrapper or shell running it) names is followed; directory or
// environment changes made by earlier commands (`cd`, `export`) are not.
const ROOT_CONTEXT = Object.freeze({ steps: [], gitDir: null });
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/su;

// A wrapper's directory change and Git directory apply to what it runs.
function within(context, scope) {
  return { steps: [...context.steps, ...scope.chdir], gitDir: scope.gitDir ?? context.gitDir };
}

const quoted = word => `'${word.replaceAll("'", "'\\''")}'`;

// Remove assignments, reserved words and wrappers until the real command. The
// scope collects what selects the repository a wrapped Git command acts on:
// wrapper directory changes and GIT_DIR assignments (NEW6).
function unwrap(words, depth, findings, scope = { chdir: [], gitDir: null }, context = ROOT_CONTEXT) {
  let rest = [...words];
  for (let guard = 0; guard < 32 && rest.length; guard++) {
    const assignment = ASSIGNMENT.exec(rest[0]);
    if (assignment?.[1] === 'GIT_DIR') scope.gitDir = assignment[2];
    if (RESERVED.has(rest[0]) || assignment) { rest.shift(); continue; }
    const name = commandName(rest[0]);
    if (!WRAPPERS.has(name)) break;
    if (name === 'command' && ['-v', '-V'].includes(rest[1])) return [];
    scope.chdir.push(...wrapperDirectories(name, rest.slice(1), WRAPPERS.get(name)));
    if (name === 'env') {
      // Only env's own options (before any assignment or command) can split.
      let split = -1;
      for (let at = 1; at < rest.length && /^-./u.test(rest[at]) && rest[at] !== '--'; at += WRAPPERS.get('env').has(rest[at]) ? 2 : 1) {
        if (rest[at].startsWith('-S') || rest[at] === '--split-string' || rest[at].startsWith('--split-string=')) { split = at; break; }
      }
      if (split !== -1) {
        // env splits the string into arguments and appends the remaining ones (NEW12).
        const item = rest[split];
        const attached = item.startsWith('--split-string=') ? item.slice(15) : item.startsWith('-S') && item.length > 2 ? item.slice(2) : null;
        const script = attached ?? rest[split + 1] ?? '';
        const remaining = rest.slice(split + (attached === null ? 2 : 1));
        findings.push(...classifyShellCommand([script, ...remaining.map(quoted)].join(' '), depth + 1, within(context, scope)));
        return [];
      }
    }
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

function classifyGit(args, findings, scope, context) {
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
  // The repository the push acts on, as directory steps from the hook's directory:
  // where Git runs (wrappers, then each -C) and, when set, the Git directory
  // (option over environment, as in Git; a `.git` directory stands for its
  // parent). A work tree selects only the checkout, not the repository (NEW7).
  const inner = within(context, scope);
  const dir = gitDir ?? inner.gitDir;
  const directory = [...inner.steps, ...directories, ...(dir ? [dir, ...(/(?:^|\/)\.git\/*$/u.test(dir) ? ['..'] : [])] : [])];
  findings.push({ kind: 'git-push', remote, refspecs: positionals, all, tags, directory });
}

function classifyWords(command, depth, context) {
  const findings = [];
  const scope = { chdir: [], gitDir: null };
  const words = unwrap(command.words, depth, findings, scope, context);
  if (!words.length) return findings;
  const name = commandName(words[0]);
  const inner = within(context, scope);
  if (SHELLS.has(name)) {
    const flag = words.findIndex((word, index) => index > 0 && /^-[A-Za-z]*c[A-Za-z]*$/u.test(word));
    if (flag !== -1) {
      const script = words.slice(flag + 1).find(word => !/^[-+]/u.test(word));
      if (script !== undefined) findings.push(...classifyShellCommand(script, depth + 1, inner));
    } else for (const script of [...command.heredocs, ...command.herestrings]) findings.push(...classifyShellCommand(script, depth + 1, inner));
  } else if (name === 'eval') findings.push(...classifyShellCommand(words.slice(1).join(' '), depth + 1, inner));
  else if (name === 'gh') classifyGh(words.slice(1), findings, depth);
  else if (name === 'git') classifyGit(words.slice(1), findings, scope, context);
  return findings;
}

// Returns merge/push findings; an empty list means the guard has no opinion.
// `context` is where an enclosing wrapper or shell runs this script.
export function classifyShellCommand(text, depth = 0, context = ROOT_CONTEXT) {
  if (typeof text !== 'string' || depth > MAX_DEPTH) return [];
  const { commands, nested } = parseShell(text);
  const findings = [];
  for (const script of nested) findings.push(...classifyShellCommand(script, depth + 1, context));
  for (const command of commands) findings.push(...classifyWords(command, depth, context));
  return findings;
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
