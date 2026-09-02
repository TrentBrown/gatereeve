// @ts-check

import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** @param {unknown} error */
export function isTransientHdiutilResourceError(error) {
  if (!(error instanceof Error)) return false;
  const details = /** @type {Error & {stdout?: unknown, stderr?: unknown}} */ (error);
  return [details.message, details.stdout, details.stderr]
    .filter((value) => typeof value === 'string' || Buffer.isBuffer(value))
    .map((value) => String(value))
    .some((value) => /Resource temporarily unavailable/iu.test(value));
}

/**
 * @param {string} dmgPath
 * @param {{
 *   run?: (file: string, args: string[]) => Promise<unknown>,
 *   sleep?: (milliseconds: number) => Promise<void>,
 *   maxAttempts?: number,
 *   initialDelayMs?: number,
 *   onRetry?: (details: {attempt: number, delayMs: number, error: unknown}) => void,
 * }} [options]
 */
export async function verifyDmgWithRetry(dmgPath, options = {}) {
  const run = options.run ?? ((file, args) => execFileAsync(file, args, {
    maxBuffer: 8 * 1024 * 1024,
  }));
  const sleep = options.sleep ?? ((milliseconds) => (
    new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
  ));
  const maxAttempts = options.maxAttempts ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 1_000;
  const onRetry = options.onRetry ?? (({ attempt, delayMs }) => {
    console.warn(`hdiutil verify attempt ${attempt} hit transient resource contention; retrying in ${delayMs}ms`);
  });
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('maxAttempts must be a positive integer');
  }
  if (!Number.isFinite(initialDelayMs) || initialDelayMs < 0) {
    throw new Error('initialDelayMs must be nonnegative');
  }
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run('/usr/bin/hdiutil', ['verify', resolve(dmgPath)]);
    } catch (error) {
      if (!isTransientHdiutilResourceError(error) || attempt === maxAttempts) throw error;
      const delayMs = initialDelayMs * (2 ** (attempt - 1));
      onRetry({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
  throw new Error('Unreachable hdiutil verification retry state');
}
