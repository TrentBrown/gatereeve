import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import electron from 'electron';

const execFileAsync = promisify(execFile);
const supported = process.platform !== 'linux' || Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);

test('representative Whiteboard Defense works in a sandboxed narrow Electron viewport', { skip: !supported }, async () => {
  const runner = resolve(import.meta.dirname, '../scripts/whiteboard-browser-smoke.cjs');
  const fixture = resolve(import.meta.dirname, 'fixtures/whiteboard-browser-smoke.html');
  const scratch = await mkdtemp(resolve(tmpdir(), 'gatereeve-generated-whiteboard-'));
  const generatedArtifact = resolve(scratch, 'whiteboard-defense.html');
  await writeFile(
    generatedArtifact,
    (await readFile(fixture, 'utf8')).replace(
      '<title>Whiteboard Defense Browser Smoke</title>',
      '<title>Generated Whiteboard Defense Browser Smoke</title>'
    )
  );
  let stdout;
  try {
    ({ stdout } = await execFileAsync(electron, [runner, generatedArtifact], {
      encoding: 'utf8',
      env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
      timeout: 20_000,
    }));
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
  const observed = JSON.parse(stdout.trim());
  assert.deepEqual(observed.errors, []);
  assert.deepEqual(observed.externalRequests, []);
  assert.deepEqual(observed.result, {
    ready: 'true',
    primaryOpen: true,
    harderOpen: true,
    layers: 3,
    findingTarget: '#finding-routing-metrics',
    visualRole: 'img',
    visualDescription: 'A request passes through validation and routing before one handler executes.',
    horizontalOverflow: false,
  });
});
