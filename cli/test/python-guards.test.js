import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { runTrustedPythonGuard } from '../../plugin-src/shared/resources/protocol/index.js';

test('trusted spec guard uses the existing Python validator as a leaf provider', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve python guard '));
  const featureHome = resolve(root, 'docs/issues/feature');
  await mkdir(featureHome, { recursive: true });
  await writeFile(
    resolve(featureHome, 'spec.md'),
    [
      '# Spec',
      '',
      '## Acceptance Criteria',
      '',
      '- **AC1.** Observable behavior.',
      '',
      '## Rubric',
      '',
      '| # | Criterion | Pass | Fail | Evidence |',
      '|---|---|---|---|---|',
      '| R1 | Behavior | Works | Does not work | Test |',
      '',
      '## Changes',
      '',
    ].join('\n')
  );

  const passed = await runTrustedPythonGuard('spec.validation.current', [featureHome]);
  assert.equal(passed.passed, true);
  assert.match(passed.stdout, /^PASS/m);
  assert.match(passed.evidenceFingerprint, /^sha256:[0-9a-f]{64}$/);

  await writeFile(resolve(featureHome, 'spec.md'), '# invalid\n');
  const failed = await runTrustedPythonGuard('spec.validation.current', [featureHome]);
  assert.equal(failed.passed, false);
  assert.match(failed.stdout, /^FAIL/m);
});

test('model data cannot select an arbitrary Python executable', async () => {
  await assert.rejects(
    runTrustedPythonGuard('shell.run-anything', ['--version']),
    /no trusted Python provider/
  );
});
