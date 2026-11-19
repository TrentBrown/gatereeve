import { access, stat, constants } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Installation-aware recovery entry points. Denials and status recovery text
// must name a command that exists here: the bundled adapter shipped next to this
// module (plugin, CLI and desktop copies all carry it), and the optional
// `gatereeve` CLI only when it is actually found on PATH.
const BUNDLED_ADAPTER = fileURLToPath(new URL('../plugin-adapter.js', import.meta.url));

// CLI spellings of the operations recovery text names.
const CLI_FORMS = Object.freeze({
  status: 'gatereeve status --json',
  next: 'gatereeve --help',
  'run.start': 'gatereeve run start --help',
  'run.resume-current': 'gatereeve run resume-current --help',
  'workspace.configure': 'gatereeve workspace configure --help',
  'gate.execute': 'gatereeve evaluate --help',
  'human.decide': 'gatereeve decide --help',
  'authorization.apply': 'gatereeve apply-authorization --help',
  'planning.review': 'gatereeve review-planning --help',
  'delegation.apply': 'gatereeve apply-delegation --help',
  'review.publish': 'gatereeve publish-review --number <PR> --source-repository <alias>',
  'review.select': 'gatereeve select-reviewers --help',
  'review.execute': 'gatereeve review-boundary --help',
  'review.adjudicate': 'gatereeve adjudicate-review --help',
  'run.set-dial': 'gatereeve run set-dial --help',
  'merge.prepare': 'gatereeve merge prepare --number <PR> --source-repository <alias>',
  'merge.execute': 'gatereeve merge execute --number <PR> --source-repository <alias>',
});

async function executableFile(path) {
  try {
    if (!(await stat(path)).isFile()) return false;
    if (process.platform !== 'win32') await access(path, constants.X_OK);
    return true;
  } catch { return false; }
}

export async function findOnPath(name, env = process.env) {
  const extensions = process.platform === 'win32'
    ? ['', ...String(env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)] : [''];
  for (const directory of String(env.PATH ?? '').split(delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = join(directory, `${name}${extension}`);
      if (await executableFile(candidate)) return candidate;
    }
  }
  return null;
}

// An adapter inside an Electron archive cannot be run by an external `node`.
async function usableAdapter(path) {
  if (!path || /\.asar(?:[\\/]|$)/u.test(path)) return null;
  try { return (await stat(path)).isFile() ? path : null; } catch { return null; }
}

export async function resolveEntryPoints({ env = process.env, adapterPath = BUNDLED_ADAPTER } = {}) {
  return { adapter: await usableAdapter(adapterPath), cli: await findOnPath('gatereeve', env) };
}

const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;

export function adapterRequest(operation, { cwd, input } = {}) {
  return { operation, ...(cwd ? { cwd } : {}), ...(input ? { input } : {}) };
}

export function adapterCommand(entry, operation, { cwd } = {}) {
  if (!entry.adapter) return null;
  if (operation === 'status' && cwd) return `node ${quote(entry.adapter)} status --cwd ${quote(cwd)}`;
  return `node ${quote(entry.adapter)} --request-file <request.json>`;
}

export function cliCommand(entry, operation) {
  return entry.cli ? CLI_FORMS[operation] ?? 'gatereeve --help' : null;
}

export const UNAVAILABLE = 'No GateReeve entry point was found in this installation (no runnable bundled adapter and no gatereeve CLI on PATH); reinstall or update the GateReeve plugin.';

// One copyable command for an operation: the CLI when it is on PATH (its help
// documents the arguments), otherwise the bundled adapter with a request file.
export function operationCommand(entry, operation, options = {}) {
  const cli = cliCommand(entry, operation);
  if (cli) return { entryPoint: 'cli', command: cli };
  const adapter = adapterCommand(entry, operation, options);
  if (adapter) return { entryPoint: 'adapter', command: adapter, request: adapterRequest(operation, options) };
  return { entryPoint: 'none', command: UNAVAILABLE };
}

// Prose naming every available entry point for a sequence of operations.
// `requests` maps operation -> { input } for the adapter request examples.
export function recoveryText(entry, operations, { cwd, requests = {} } = {}) {
  const parts = [];
  if (entry.adapter) {
    const examples = operations.map(operation => JSON.stringify(adapterRequest(operation, { cwd, input: requests[operation]?.input })));
    parts.push(`bundled adapter: node ${quote(entry.adapter)} --request-file <request.json>, with request ${examples.join(', then ')}`);
  }
  if (entry.cli) parts.push(`CLI: ${operations.map(operation => CLI_FORMS[operation] ?? `gatereeve --help (${operation})`).join(', then ')}`);
  return parts.length ? parts.join('; or ') : UNAVAILABLE;
}
