import { access, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, isAbsolute, resolve } from 'node:path';
import { runnerEnvironment, environmentIdentity } from './runner-profile.js';
import { identity, requireThat } from './contracts.js';

export const EXECUTION_CONTEXT_POLICY = 'recorded-execution/1';

// This is a declaration/provenance check, not a snapshot of installed software.
// Never traverse dependency, toolchain or externally declared directories here.
export async function executionEnvironment(context, candidate, configuration, runner, inherited = process.env) {
  if (!runner) return { kind: 'pinned-review-inputs' };
  return {
    policy: EXECUTION_CONTEXT_POLICY,
    assurance: 'declared-context-only; installed dependencies and remote services are not snapshotted',
    configuration: identity(configuration),
    effectiveEnvironment: await environmentIdentity(context, runnerEnvironment(configuration, inherited)),
    runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  };
}
export function environmentChanges(before, after) {
  if (identity(before) === identity(after)) return [];
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => identity(before[key] ?? null) !== identity(after[key] ?? null))
    .map(kind => ({ kind }));
}
export function assertEnvironmentCurrent(before, after, message = 'Recorded execution context changed') {
  const changedInputs = environmentChanges(before, after);
  requireThat(!changedInputs.length, `${message}: ${changedInputs.map(item => item.kind).join(', ')}`, { changedInputs });
}
export async function executable(command, cwd, environment) {
  const paths = command.includes('/') || isAbsolute(command) ? [resolve(cwd, command)]
    : (environment.PATH ?? '').split(delimiter).map(part => resolve(part || cwd, command));
  for (const path of paths) {
    try { await access(path, constants.X_OK); return await realpath(path); } catch { /* Try the next explicit PATH entry. */ }
  }
  throw new Error(`Executable unavailable: ${command}`);
}
