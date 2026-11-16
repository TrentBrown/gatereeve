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

function matching(text, start, open, close) {
  // `start` indexes the opening delimiter; returns the index of its match.
  let depth = 1;
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') { i++; continue; }
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

// Remove assignments, reserved words and wrappers until the real command.
function unwrap(words, depth, findings) {
  let rest = [...words];
  for (let guard = 0; guard < 32 && rest.length; guard++) {
    if (RESERVED.has(rest[0]) || /^[A-Za-z_][A-Za-z0-9_]*=/u.test(rest[0])) { rest.shift(); continue; }
    const name = commandName(rest[0]);
    if (!WRAPPERS.has(name)) break;
    if (name === 'command' && ['-v', '-V'].includes(rest[1])) return [];
    if (name === 'env') {
      const split = rest.findIndex(item => item === '-S' || item === '--split-string' || item.startsWith('--split-string='));
      if (split !== -1) {
        const script = rest[split].includes('=') ? rest[split].slice(rest[split].indexOf('=') + 1) : rest[split + 1];
        findings.push(...classifyShellCommand(script ?? '', depth + 1));
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

function classifyGit(args, findings) {
  let index = 0;
  const directories = [];
  while (index < args.length && /^-./u.test(args[index])) {
    const arg = args[index];
    if (GIT_GLOBAL_VALUES.has(arg)) { if (arg === '-C') directories.push(args[index + 1]); index += 2; } else index++;
  }
  if (args[index] !== 'push') return;
  const rest = args.slice(index + 1);
  const positionals = [];
  let all = false, remoteOption = null;
  for (let at = 0; at < rest.length; at++) {
    const arg = rest[at];
    if (arg === '--') { positionals.push(...rest.slice(at + 1)); break; }
    if (['--all', '--mirror', '--branches'].includes(arg)) { all = true; continue; }
    if (arg.startsWith('--repo=')) { remoteOption = arg.slice(7); continue; }
    if (PUSH_VALUES.has(arg)) { if (arg === '--repo') remoteOption = rest[at + 1]; at++; continue; }
    if (/^-./u.test(arg)) continue;
    positionals.push(arg);
  }
  const remote = remoteOption ?? positionals.shift() ?? null;
  findings.push({ kind: 'git-push', remote, refspecs: positionals, all, directory: directories.length ? directories : null });
}

function classifyWords(command, depth) {
  const findings = [];
  const words = unwrap(command.words, depth, findings);
  if (!words.length) return findings;
  const name = commandName(words[0]);
  if (SHELLS.has(name)) {
    const flag = words.findIndex((word, index) => index > 0 && /^-[A-Za-z]*c[A-Za-z]*$/u.test(word));
    if (flag !== -1) {
      const script = words.slice(flag + 1).find(word => !/^[-+]/u.test(word));
      if (script !== undefined) findings.push(...classifyShellCommand(script, depth + 1));
    } else for (const script of [...command.heredocs, ...command.herestrings]) findings.push(...classifyShellCommand(script, depth + 1));
  } else if (name === 'eval') findings.push(...classifyShellCommand(words.slice(1).join(' '), depth + 1));
  else if (name === 'gh') classifyGh(words.slice(1), findings, depth);
  else if (name === 'git') classifyGit(words.slice(1), findings);
  return findings;
}

// Returns merge/push findings; an empty list means the guard has no opinion.
export function classifyShellCommand(text, depth = 0) {
  if (typeof text !== 'string' || depth > MAX_DEPTH) return [];
  const { commands, nested } = parseShell(text);
  const findings = [];
  for (const script of nested) findings.push(...classifyShellCommand(script, depth + 1));
  for (const command of commands) findings.push(...classifyWords(command, depth));
  return findings;
}

// Branch names a push finding may update. `current` resolves HEAD and an
// implicit destination (push.default simple/current); '*' globs match branches.
export function pushDestinations(finding, current) {
  if (finding.all) return ['*'];
  if (!finding.refspecs.length) return current ? [current] : [];
  const destinations = [];
  for (const refspec of finding.refspecs) {
    const spec = refspec.replace(/^\+/u, '');
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
