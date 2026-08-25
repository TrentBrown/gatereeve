import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { ContractError } from './errors.js';
import { fingerprint } from './fingerprint.js';

const execFileAsync = promisify(execFile);
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const scriptsRoot = resolve(moduleDirectory, '..', 'scripts');

export const PYTHON_GUARD_PROVIDERS = Object.freeze({
  'spec.validation.current': {
    script: 'lint_spec.py',
    output: 'exit-code',
  },
  'boundary.context.current': {
    script: 'boundary_gate.py',
    output: 'json',
  },
  'merge.reviewedContent.verified': {
    script: 'merge_verified.py',
    output: 'json',
  },
});

export async function runTrustedPythonGuard(
  guardId,
  args,
  {
    cwd = process.cwd(),
    pythonExecutable = 'python3',
    environment = process.env,
  } = {}
) {
  const provider = PYTHON_GUARD_PROVIDERS[guardId];
  if (!provider) {
    throw new ContractError(`Guard ${guardId} has no trusted Python provider`);
  }
  if (!Array.isArray(args) || args.some((argument) => typeof argument !== 'string')) {
    throw new ContractError('Trusted Python guard arguments must be an array of strings');
  }
  const script = resolve(scriptsRoot, provider.script);
  try {
    const result = await execFileAsync(pythonExecutable, [script, ...args], {
      cwd,
      env: environment,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
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
      script: provider.script,
      data,
      stdout: result.stdout,
      stderr: result.stderr,
      evidenceFingerprint: fingerprint({
        guardId,
        script: provider.script,
        args,
        stdout: result.stdout,
        stderr: result.stderr,
      }),
    };
  } catch (error) {
    if (error instanceof ContractError) throw error;
    return {
      passed: false,
      guardId,
      provider: 'python',
      script: provider.script,
      data: null,
      stdout: error?.stdout ?? '',
      stderr: error?.stderr ?? error?.message ?? String(error),
      exitCode: Number.isInteger(error?.code) ? error.code : null,
      evidenceFingerprint: fingerprint({
        guardId,
        script: provider.script,
        args,
        stdout: error?.stdout ?? '',
        stderr: error?.stderr ?? error?.message ?? String(error),
      }),
    };
  }
}
