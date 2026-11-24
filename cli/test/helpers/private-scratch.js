// Import first in every CLI test file (enforced by test-shards.test.js).
// `npm test` already supplies a private scratch root and metrics store; a
// suite run directly with `node --test` gets its own here, so no test process
// writes into the host scratch root or the shared metrics store, and parallel
// test files never share a maintenance lock (spec AC2, D28, D33).
import { mkdtempSync } from 'node:fs';
import { removePrivateRoot } from './remove-private-root.js';
export { removePrivateRoot };
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerScratchRoot } from '../../../plugin-src/shared/resources/storage/scratch.js';

export async function privateScratch(environment = process.env) {
  const base = mkdtempSync(join(tmpdir(), 'gatereeve-test-'));
  const root = join(base, 'gatereeve');
  await registerScratchRoot(root);
  return { base, env: { GATEREEVE_SCRATCH_ROOT: root, GATEREEVE_METRICS_DIR: environment.GATEREEVE_TEST_ISOLATED ? environment.GATEREEVE_METRICS_DIR : join(base, 'metrics'), GATEREEVE_TEST_ISOLATED: '1' } };
}

if (!process.env.GATEREEVE_TEST_ISOLATED) {
  const { base, env } = await privateScratch();
  Object.assign(process.env, env);
  process.once('exit', () => removePrivateRoot(base));
}
