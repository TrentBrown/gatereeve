import { execFile } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { readdir, readFile, realpath } from 'node:fs/promises';
import { executable } from './current/environment.js';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { ContractError } from './errors.js';
import { digest, identity as fingerprint } from './current/contracts.js';

const execFileAsync = promisify(execFile);
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const scriptsRoot = resolve(moduleDirectory, '..', 'scripts');

export const PYTHON_GUARD_PROVIDERS = Object.freeze({
  'issues.validation.current': { script: 'lint_issues.py', output: 'exit-code' },
  'tracker.validation.current': { script: 'lint_tracker.py', output: 'exit-code' },
  'spec.validation.current': {
    script: 'lint_spec.py',
    output: 'exit-code',
  },
  'boundary.context.current': {
    script: 'pr_context.py',
    output: 'json',
  },
  'merge.reviewedContent.verified': {
    script: 'merge_verified.py',
    output: 'json',
  },
});

const isolatedGuards = new Set(['spec.validation.current', 'issues.validation.current', 'tracker.validation.current']);
// These three validators use only argparse, re and pathlib. Isolated/no-site
// Python excludes caller imports and startup hooks; capture their complete loaded
// standard-library closure as well as every file in the shipped helper directory.
const runtimePrelude = `import argparse, re, pathlib, json, sys, __future__, warnings
with warnings.catch_warnings():
    warnings.simplefilter('ignore')
argparse.ArgumentParser().parse_args([])

def module_files():
    return sorted(set(str(pathlib.Path(p).resolve()) for m in list(sys.modules.values()) for p in [getattr(m,'__file__',None),getattr(m,'__cached__',None)] if p and pathlib.Path(p).is_file()))
`;
const runtimeProbe = runtimePrelude + `print(json.dumps({'executable':sys.executable,'version':sys.version,'prefix':sys.prefix,'basePrefix':sys.base_prefix,'modules':module_files()}))`;
// Execute source directly (never a sibling .pyc) with exactly the probed imports.
// A future validator requiring more imports must extend this bound closure.
const validatorBootstrap = runtimePrelude + `expected = module_files()
script = sys.argv[1]
sys.argv = sys.argv[1:]
try:
    exec(compile(pathlib.Path(script).read_bytes(), script, 'exec'), {'__name__':'__main__','__file__':script})
finally:
    if module_files() != expected:
        raise RuntimeError('Trusted validator imported an unbound runtime dependency: ' + str(sorted(set(module_files()) - set(expected))))
`;
async function helperTree(root, directory = '') {
  const entries = [];
  for (const entry of (await readdir(join(root, directory), { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    if (['__pycache__', 'tests'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) entries.push(...await helperTree(root, path));
    else if (entry.isFile()) entries.push([path, digest(await readFile(join(root, path)))]);
    else throw new ContractError('Trusted validator directory contains an unsupported entry');
  }
  return entries;
}
export async function trustedPythonBinding(guardId, { cwd = process.cwd(), pythonExecutable = 'python3', environment = process.env, helperRoot = scriptsRoot } = {}) {
  if (!isolatedGuards.has(guardId)) throw new ContractError('No isolated current validator binding for this guard');
  environment = Object.freeze({ ...environment, PYTHONDONTWRITEBYTECODE: '1' });
  const selected = await executable(pythonExecutable, cwd, environment);
  if (selected.unavailable) throw new ContractError('Trusted Python interpreter is unavailable');
  const probe = await execFileAsync(selected.path, ['-I', '-S', '-B', '-c', runtimeProbe], { cwd, env: environment, encoding: 'utf8', timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
  const runtime = JSON.parse(probe.stdout);
  const actual = await realpath(runtime.executable);
  const modules = await Promise.all(runtime.modules.map(async path => [path, digest(await readFile(path))]));
  return { contract: 'trusted-python/1', guardId, selected, interpreter: { path: actual, hash: digest(await readFile(actual)) },
    runtime: { version: runtime.version, prefix: runtime.prefix, basePrefix: runtime.basePrefix, modules },
    helpers: await helperTree(helperRoot), bootstrap: digest(validatorBootstrap), environment: fingerprint(environment), platform: process.platform, arch: process.arch };
}
export async function assertTrustedPythonProof(proof, options = {}) {
  if (!proof?.passed || !proof.binding || fingerprint(proof.binding) !== fingerprint(await trustedPythonBinding(proof.guardId, options))) {
    throw new ContractError('Trusted validator proof is stale or unavailable');
  }
}

export async function runTrustedPythonGuard(
  guardId,
  args,
  {
    cwd = process.cwd(),
    pythonExecutable = 'python3',
    environment = process.env,
    helperRoot = scriptsRoot,
  } = {}
) {
  const provider = PYTHON_GUARD_PROVIDERS[guardId];
  if (!provider) {
    throw new ContractError(`Guard ${guardId} has no trusted Python provider`);
  }
  if (!Array.isArray(args) || args.some((argument) => typeof argument !== 'string')) {
    throw new ContractError('Trusted Python guard arguments must be an array of strings');
  }
  const script = resolve(helperRoot, provider.script);
  const frozenEnvironment = Object.freeze({ ...environment, PYTHONDONTWRITEBYTECODE: '1' });
  const options = { cwd, pythonExecutable, environment: frozenEnvironment, helperRoot };
  let binding = null, executed = null;
  try {
    binding = isolatedGuards.has(guardId) ? await trustedPythonBinding(guardId, options) : null;
    const result = await execFileAsync(binding?.interpreter.path ?? pythonExecutable, [...(binding ? ['-I', '-S', '-B', '-c', validatorBootstrap] : []), script, ...args], {
      cwd,
      env: frozenEnvironment,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    executed = result;
    if (binding && fingerprint(binding) !== fingerprint(await trustedPythonBinding(guardId, options))) throw new ContractError('Trusted validator changed during execution');
    let data = null;
    if (provider.output === 'json') {
      try {
        data = JSON.parse(result.stdout);
      } catch (error) {
        throw new ContractError(
          `Trusted guard ${guardId} did not return valid JSON`,
          null,
          { cause: error }
        );
      }
    }
    return {
      passed: true,
      guardId,
      provider: 'python',
      binding,
      script: provider.script,
      data,
      stdout: result.stdout,
      stderr: result.stderr,
      evidenceFingerprint: fingerprint({
        guardId, binding,
        script: provider.script,
        args,
        stdout: result.stdout,
        stderr: result.stderr,
      }),
    };
  } catch (error) {
    if (error instanceof ContractError && !isolatedGuards.has(guardId)) throw error;
    return {
      passed: false,
      guardId,
      provider: 'python',
      binding,
      script: provider.script,
      data: null,
      stdout: error?.stdout ?? executed?.stdout ?? '',
      stderr: [error?.stderr ?? executed?.stderr ?? '', error?.message ?? String(error)].filter(Boolean).join('\n'),
      exitCode: Number.isInteger(error?.code) ? error.code : null,
      evidenceFingerprint: fingerprint({
        guardId, binding,
        script: provider.script,
        args,
        stdout: error?.stdout ?? executed?.stdout ?? '',
        stderr: [error?.stderr ?? executed?.stderr ?? '', error?.message ?? String(error)].filter(Boolean).join('\n'),
      }),
    };
  }
}
