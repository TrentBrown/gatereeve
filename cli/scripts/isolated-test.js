#!/usr/bin/env node
// Run the CLI test suite against a private scratch root and metrics store.
// Tests must never write into the host scratch area (/tmp/gatereeve) or the
// shared metrics store (~/.local/share/gatereeve/performance): fixtures there
// evict real measurements and leave large reviewer views behind (spec AC2).
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { removePrivateRoot } from '../test/helpers/remove-private-root.js';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scratchTool = join(here, '../../plugin-src/shared/resources/storage/scratch.js');
const { registerScratchRoot } = await import(scratchTool);

export async function isolatedTestEnvironment(environment = process.env, base) {
  base ??= await mkdtemp(join(tmpdir(), 'gatereeve-test-'));
  return { base, env: { ...environment,
    GATEREEVE_SCRATCH_ROOT: join(base, 'gatereeve'),
    GATEREEVE_METRICS_DIR: join(base, 'metrics'),
    GATEREEVE_TEST_ISOLATED: '1' } };
}

async function main(args) {
  const { base, env } = await isolatedTestEnvironment();
  // An inherited scratch root must already be registered.
  await registerScratchRoot(env.GATEREEVE_SCRATCH_ROOT);
  let code = 1;
  try {
    code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [scratchTool, 'run', process.execPath, '--test', ...args], { env, stdio: 'inherit' });
      for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
      child.on('error', reject);
      child.on('close', (status, signal) => resolve(status ?? (signal ? 1 : 0)));
    });
  } finally {
    removePrivateRoot(base);
  }
  process.exitCode = code;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main(process.argv.slice(2));
