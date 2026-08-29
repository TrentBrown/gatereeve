import assert from 'node:assert/strict';
import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';

import { inspectProject } from '../main/project-registry.js';

const sources = {
  local: { status: 'current', detail: 'local', checkedAt: 'now' },
  git: { status: 'not-checked', detail: null, checkedAt: null },
  github: { status: 'not-checked', detail: null, checkedAt: null },
};

function governed(featureHome) {
  return {
    schemaVersion: 1,
    mode: 'governed',
    featureHome,
    featureId: 'feature-one',
    projection: { feature: { state: 'PLANNING' } },
    blockers: [],
  };
}

test('project inspection admits only a canonical governed directory', async () => {
  const path = await mkdtemp(join(tmpdir(), 'gatereeve-project-'));
  const canonical = await realpath(path);
  const result = await inspectProject(path, {
    sources,
    protocol: {
      async resolve(canonical) { return { featureHome: join(canonical, 'docs/issues/feature-one') }; },
      async snapshot(featureHome) { return governed(featureHome); },
    },
  });
  assert.equal(result.ready, true);
  assert.deepEqual(result.project, {
    path: canonical,
    name: basename(path),
    status: 'ready',
    featureHome: join(canonical, 'docs/issues/feature-one'),
    featureId: 'feature-one',
    workflowState: 'PLANNING',
    diagnostic: null,
  });
});

test('project inspection preserves protocol diagnostic details without admission', async () => {
  const path = await mkdtemp(join(tmpdir(), 'gatereeve-project-'));
  const canonical = await realpath(path);
  const featureHome = join(canonical, 'docs/issues/legacy');
  const result = await inspectProject(path, {
    sources,
    protocol: {
      async resolve() { return { featureHome }; },
      async snapshot() {
        return {
          schemaVersion: 1,
          mode: 'legacy',
          featureHome,
          featureId: null,
          model: null,
          projection: null,
          blockers: [{ type: 'legacy', reason: 'No model lock or event journal exists.' }],
        };
      },
    },
  });
  assert.equal(result.ready, false);
  assert.equal(result.project.status, 'needs-attention');
  assert.equal(result.project.diagnostic.title, 'Legacy feature record');
  assert.deepEqual(result.project.diagnostic.failedChecks, [
    'No model lock or event journal exists.',
  ]);
  assert.equal(result.project.diagnostic.selectedPath, canonical);
  assert.equal(result.project.diagnostic.featureHome, featureHome);
});

test('project inspection turns filesystem and malformed-record failures into diagnostics', async () => {
  const result = await inspectProject('/definitely/missing/gatereeve-project', {
    sources,
    protocol: {
      async resolve() { throw new Error('not reached'); },
      async snapshot() { throw new Error('not reached'); },
    },
  });
  assert.equal(result.ready, false);
  assert.equal(result.project.diagnostic.classification, 'unreadable');
  assert.equal(result.project.diagnostic.selectedPath, '/definitely/missing/gatereeve-project');
  assert.equal(result.project.diagnostic.failedChecks.length, 1);
});
