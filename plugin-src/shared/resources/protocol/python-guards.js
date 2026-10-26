import { execFile } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { ContractError } from './errors.js';
import { identity, digest } from './current/contracts.js';

const execFileAsync = promisify(execFile);
export async function helperTree(root, directory = '') {
  const entries = [];
  for (const entry of (await readdir(join(root, directory), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (['__pycache__', 'tests'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) entries.push(...await helperTree(root, path));
    else if (entry.isFile()) entries.push([path, digest(await readFile(join(root, path)))]);
    else throw new ContractError('Shipped helper directory contains an unsupported entry');
  }
  return entries;
}
// These filesystem/Git readers remain leaf providers. Semantic planning uses
// the current native extractor and independent reviews, not Python gate scripts.
export const pythonScriptsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'scripts')
  .replace(/([\\/])app\.asar([\\/])/u, '$1app.asar.unpacked$2');
export const PYTHON_GUARD_PROVIDERS = Object.freeze({
  'boundary.context.current': { script: 'pr_context.py', output: 'json' },
  'merge.reviewedContent.verified': { script: 'merge_verified.py', output: 'json' },
});
export async function runTrustedPythonGuard(guardId, args, {
  cwd = process.cwd(), pythonExecutable = 'python3', environment = process.env, helperRoot = pythonScriptsRoot,
} = {}) {
  const provider = PYTHON_GUARD_PROVIDERS[guardId];
  if (!provider) throw new ContractError(`Guard ${guardId} has no trusted Python provider`);
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw new ContractError('Trusted Python guard arguments must be an array of strings');
  try {
    const result = await execFileAsync(pythonExecutable, [resolve(helperRoot, provider.script), ...args], {
      cwd, env: { ...environment, PYTHONDONTWRITEBYTECODE: '1' }, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
    });
    let data;
    try { data = JSON.parse(result.stdout); }
    catch (error) { throw new ContractError(`Trusted guard ${guardId} did not return valid JSON`, null, { cause: error }); }
    return { passed: true, guardId, provider: 'python', script: provider.script, data,
      stdout: result.stdout, stderr: result.stderr, evidenceFingerprint: identity({ guardId, args, ...result }) };
  } catch (error) {
    if (error instanceof ContractError) throw error;
    const proof = { passed: false, guardId, provider: 'python', script: provider.script, data: null,
      stdout: error.stdout ?? '', stderr: [error.stderr, error.message].filter(Boolean).join('\n'),
      exitCode: Number.isInteger(error.code) ? error.code : null };
    return { ...proof, evidenceFingerprint: identity({ ...proof, args }) };
  }
}
