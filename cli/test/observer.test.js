import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  check,
  explain,
  graphFeature,
  graphModel,
  history,
  initializeFeature,
  next,
  pauseFeature,
  status,
  validateResultEnvelope,
} from '../../plugin-src/shared/resources/protocol/index.js';

const agent = { kind: 'agent', label: 'observer-agent' };

async function createFeature() {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve observer '));
  const featureHome = resolve(root, 'docs/issues/observer-feature');
  await initializeFeature({
    featureHome,
    featureId: 'observer-feature',
    actor: agent,
    eventId: 'evt-init',
  });
  return { root, featureHome };
}

test('read-only observers share one projection and never append events', async () => {
  const fixture = await createFeature();
  const journalPath = resolve(fixture.featureHome, 'events.jsonl');
  const before = await readFile(journalPath, 'utf8');

  const statusResult = await status(fixture.featureHome);
  const nextResult = await next(fixture.featureHome);
  const historyResult = await history(fixture.featureHome);
  const explainResult = await explain(fixture.featureHome, 'DESIGNING');
  const graphResult = await graphFeature(fixture.featureHome);

  for (const result of [
    statusResult,
    nextResult,
    historyResult,
    explainResult,
    graphResult,
  ]) {
    assert.equal(validateResultEnvelope(result), result);
    assert.equal(result.ok, true);
  }
  assert.equal(statusResult.data.projection.feature.state, 'DESIGNING');
  assert.deepEqual(
    nextResult.data.actions.map((item) => item.command),
    ['feature approve-design']
  );
  assert.equal(historyResult.data.events.length, 1);
  assert.equal(explainResult.data.match.kind, 'feature-state');
  assert.match(graphResult.data.graph.mermaid, /Feature: DESIGNING/);
  assert.equal(await readFile(journalPath, 'utf8'), before);
});

test('blocked and stale-capable status remains successful while check is binary', async () => {
  const fixture = await createFeature();
  await pauseFeature(fixture.featureHome, {
    actor: agent,
    reason: 'pause for observer test',
    eventId: 'evt-pause',
  });
  const statusResult = await status(fixture.featureHome, {
    facts: { worktree: { journalDirty: true } },
  });
  assert.equal(statusResult.ok, true);
  assert(statusResult.data.blockers.some((item) => item.type === 'suspension'));
  assert(statusResult.data.blockers.some((item) => item.type === 'journal-uncommitted'));

  const failed = await check(fixture.featureHome, 'not-blocked', {
    facts: { worktree: { journalDirty: true } },
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.error.code, 'CHECK_FAILED');
  const governed = await check(fixture.featureHome, 'governed');
  assert.equal(governed.ok, true);
});

test('legacy and missing feature modes are observable without adoption', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve legacy observer '));
  const legacyHome = resolve(root, 'docs/issues/legacy');
  await mkdir(legacyHome, { recursive: true });
  await writeFile(resolve(legacyHome, 'interview.md'), '# Legacy\n');

  const legacy = await status(legacyHome);
  const missing = await status(resolve(root, 'docs/issues/missing'));
  assert.equal(legacy.ok, true);
  assert.equal(legacy.data.mode, 'legacy');
  assert.equal(missing.ok, true);
  assert.equal(missing.data.mode, 'missing');
});

test('model graph and current graph expose matching machine identity', async () => {
  const fixture = await createFeature();
  const model = await graphModel();
  const current = await graphFeature(fixture.featureHome);

  assert.equal(model.data.graph.kind, 'model');
  assert.equal(model.data.graph.modelId, 'gatereeve/workflow');
  assert(model.data.graph.nodes.some((node) => node.id === 'gate:verification'));
  assert.match(model.data.graph.mermaid, /^flowchart TD/m);
  assert.equal(current.data.graph.kind, 'current');
  assert.equal(current.data.graph.featureId, 'observer-feature');
});
