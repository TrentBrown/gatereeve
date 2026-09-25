import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import electron from 'electron';

const execFileAsync = promisify(execFile);
const supported = process.platform !== 'linux' || Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);

test('representative Whiteboard Defense works in a sandboxed narrow Electron viewport', { skip: !supported }, async () => {
  const runner = resolve(import.meta.dirname, '../scripts/whiteboard-browser-smoke.cjs');
  const { stdout } = await execFileAsync(electron, [runner], {
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
    timeout: 20_000,
  });
  const observed = JSON.parse(stdout.trim());
  assert.deepEqual(observed.errors, []);
  assert.deepEqual(observed.externalRequests, []);
  assert.deepEqual(observed.result, {
    ready: 'true',
    primaryOpen: true,
    harderOpen: true,
    layers: 3,
    findingTarget: '#challenge-routing',
    visualRole: 'img',
    visualDescription: 'A request passes through validation and routing before one handler executes.',
    horizontalOverflow: false,
  });
});
