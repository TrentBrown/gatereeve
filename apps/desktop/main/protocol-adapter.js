// @ts-check
import { resolveWorkflowContext } from '../resources/protocol/context.js';
import { currentSnapshot, readCurrent } from '../resources/protocol/current/adapter.js';

// Desktop observes the same current core as native skills and CLI. It does not
// launch evaluators on refresh or accept caller-authored gate outcomes.
export function createProtocolAdapter({ gitExecutable = 'git', pythonExecutable = 'python3' } = {}) {
  const contexts = new Map();
  const runtime = { gitExecutable, pythonGuardOptions: { pythonExecutable } };
  function context(featureHome) {
    const value = contexts.get(featureHome);
    if (!value) throw new Error('Resolve the selected workspace before reading its feature record.');
    return value;
  }
  return Object.freeze({
    async resolve(worktreePath) {
      const value = await resolveWorkflowContext({ cwd: worktreePath, gitExecutable });
      contexts.set(value.featureHome, value);
      return value;
    },
    async snapshot(featureHome, options = {}) {
      return currentSnapshot(context(featureHome), options, runtime);
    },
    async read(featureHome, kind, id = null) {
      return readCurrent(context(featureHome), kind, id, runtime);
    },
  });
}
