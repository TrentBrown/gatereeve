import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { runTrustedPythonGuard } from '../../plugin-src/shared/resources/protocol/index.js';

test('planning gates cannot be routed through retired Python validators', async () => {
  for (const id of ['spec.validation.current', 'issues.validation.current', 'tracker.validation.current']) {
    await assert.rejects(runTrustedPythonGuard(id, []), /no trusted Python provider/);
  }
});

test('model data cannot select an arbitrary Python executable', async () => {
  await assert.rejects(
    runTrustedPythonGuard('shell.run-anything', ['--version']),
    /no trusted Python provider/
  );
});
