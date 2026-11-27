#!/usr/bin/env node
// gatereeve code-health: the plugin-local entry point. The CLI command and the
// core's Verification runner both call this file, so all three share one
// implementation. Exit status: 0 PASS, 1 FAIL, 2 UNAVAILABLE or usage error.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderText } from './render.js';
import { exitCode, runCodeHealth } from './run.js';

const USAGE = `Usage: code-health [run] --base <ref> [--json] [--approved <sha256>]... [--cwd <dir>]
                   [--habit-sensors <path>] [--habit-mapper <path>] [--timeout-ms <ms>] [--no-cache]`;

export function parseArguments(argv) {
  const options = { approved: [], json: false, useCache: true };
  const args = argv[0] === 'run' ? argv.slice(1) : [...argv];
  const value = flag => {
    const next = args.shift();
    if (next === undefined || next.startsWith('--')) throw new Error(`${flag} needs a value`);
    return next;
  };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--base') options.base = value(arg);
    else if (arg === '--approved') options.approved.push(value(arg));
    else if (arg === '--json') options.json = true;
    else if (arg === '--cwd') options.cwd = value(arg);
    else if (arg === '--habit-sensors') options.habitSensors = value(arg);
    else if (arg === '--habit-mapper') options.habitMapper = value(arg);
    else if (arg === '--timeout-ms') options.timeoutMs = Number(value(arg));
    else if (arg === '--no-cache') options.useCache = false;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.help && !options.base) throw new Error('--base <ref> is required');
  if (options.timeoutMs !== undefined && !(Number.isInteger(options.timeoutMs) && options.timeoutMs > 0)) throw new Error('--timeout-ms must be a positive integer');
  return options;
}

export async function main(argv, { stdout = process.stdout, stderr = process.stderr, env = process.env } = {}) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    stderr.write(`${error.message}\n${USAGE}\n`);
    return 2;
  }
  if (options.help) {
    stdout.write(`${USAGE}\n`);
    return 0;
  }
  const { json, help, ...input } = options;
  let result;
  try {
    result = await runCodeHealth({ ...input, env });
  } catch (error) {
    // Anything that escapes the run (scratch storage, a crash) is UNAVAILABLE,
    // never exit 1, which means FAIL.
    result = { verdict: 'UNAVAILABLE', base: input.base, mergeBase: null, scope: { files: [] }, governed: { matched: null },
      findings: { new: [], preExisting: [], advisory: [] }, groups: [], reasons: [{ cause: 'internal-error', message: `The code-health check could not run: ${error.message}` }] };
  }
  stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : renderText(result));
  return exitCode(result.verdict);
}

const invoked = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invoked) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => {
    process.stderr.write(`code-health: ${error.stack ?? error.message}\n`);
    process.exitCode = 2;
  });
}
