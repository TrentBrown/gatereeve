import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { ProtocolError } from './errors.js';

const execFileAsync = promisify(execFile);
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const contextScript = resolve(moduleDirectory, '..', 'scripts', 'workflow_context.py');

export async function resolveWorkflowContext({
  cwd = process.cwd(),
  repository = null,
  pythonExecutable = 'python3',
  environment = process.env,
} = {}) {
  const args = [contextScript, 'resolve', '--cwd', resolve(cwd), '--json'];
  if (repository) args.push('--repository', repository);
  try {
    const result = await execFileAsync(pythonExecutable, args, {
      cwd: resolve(cwd),
      env: { ...environment, PYTHONDONTWRITEBYTECODE: '1' },
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new ProtocolError(
      'WORKFLOW_CONTEXT_ERROR',
      error?.stderr?.trim() || error?.message || 'Cannot resolve workflow context',
      { cwd: resolve(cwd), repository }
    );
  }
}
