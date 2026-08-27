// @ts-check

import { readDetail, snapshot } from '../resources/protocol/observer.js';
import { resolveWorkflowContext } from '../resources/protocol/context.js';
import { validateDetail, validateSnapshot } from '../resources/protocol/snapshot.js';

function requireSuccess(result, operation) {
  if (!result?.ok) {
    const error = new Error(result?.error?.message ?? `${operation} failed`);
    error.code = result?.error?.code ?? 'PROTOCOL_ERROR';
    throw error;
  }
  return result.data;
}

export function createProtocolAdapter({ gitExecutable = 'git' } = {}) {
  return Object.freeze({
    async resolve(worktreePath) {
      return resolveWorkflowContext({ cwd: worktreePath, gitExecutable });
    },

    async snapshot(featureHome, options = {}) {
      return validateSnapshot(requireSuccess(await snapshot(featureHome, options), 'snapshot'));
    },

    async read(featureHome, kind, id = null, options = {}) {
      return validateDetail(
        requireSuccess(await readDetail(featureHome, kind, id, options), 'read'),
      );
    },
  });
}
