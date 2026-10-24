import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveWorkflowContext, workflowContextGuard } from '../../plugin-src/shared/resources/protocol/context.js';
import { CurrentCore } from '../../plugin-src/shared/resources/protocol/current/core.js';
import { currentFixture } from './helpers/current-fixture.js';

async function configured(t) {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-live-context-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, 'app', 'nested');
  await mkdir(cwd, { recursive: true }); await mkdir(join(root, 'other'));
  const path = join(root, '.agentic-workflow.json');
  const value = { schemaVersion: 1, featureId: 'feature', repositories: {
    app: { path: 'app', integrationBranch: 'main' }, other: { path: 'other', integrationBranch: 'main' },
  } };
  const save = data => writeFile(path, JSON.stringify(data));
  await save(value);
  const context = await resolveWorkflowContext({ cwd });
  return { root, cwd, path, value, save, context, guard: workflowContextGuard(context) };
}

test('live context guard follows original discovery and rejects actual policy edits', async t => {
  const f = await configured(t);
  for (const change of [
    value => { value.repositories.app.integrationBranch = 'development'; },
    value => { value.repositories.app.releaseBranch = 'release'; },
    value => { value.repositories.app.remote = 'upstream'; },
    value => { value.repositories.app.keepPullRequestsClosed = true; },
    value => { value.repositories.app.featureBaseSha = 'a'.repeat(40); },
    value => { delete value.repositories.app; },
    value => { value.featureId = 'new-feature'; },
    value => { value.repositories.app.path = '.'; },
  ]) {
    const next = structuredClone(f.value); change(next); await f.save(next);
    await assert.rejects(f.guard(), /Workspace configuration changed|repository/i);
    await f.save(f.value); await f.guard();
  }
  await rm(f.path); await assert.rejects(f.guard()); await f.save(f.value);
  await writeFile(f.path, '{'); await assert.rejects(f.guard(), /JSON/); await f.save(f.value);
  const closer = join(f.cwd, '.agentic-workflow.json');
  await writeFile(closer, JSON.stringify({ schemaVersion: 1, featureId: 'feature', repositories: { app: { path: '.', integrationBranch: 'main' } } }));
  await assert.rejects(f.guard(), /Workspace configuration changed/);
  await rm(closer); await f.guard();
});

test('live context guard normalizes irrelevant edits and retains immutable initial meaning', async t => {
  const f = await configured(t);
  const next = structuredClone(f.value);
  next.externalTask = { id: 'new-label' };
  next.repositories = { other: next.repositories.other, app: next.repositories.app };
  Object.assign(next.repositories.app, { remote: 'origin', releaseBranch: 'main', keepPullRequestsClosed: false, featureBaseSha: null });
  await writeFile(f.path, JSON.stringify(next, null, 4)); await f.guard();
  f.context.repositories[0].integrationBranch = 'changed';
  await assert.rejects(f.guard(), /Workspace configuration changed/);
  await assert.rejects(workflowContextGuard(structuredClone(f.context))(), /discovery is unavailable/);
});

test('cached core blocks mutations and reports milestone drift without switching feature stores', async t => {
  const f = await currentFixture(t);
  await f.core.execute({ operation: 'run.start', input: { runId: 'live-config', implementers: ['implementer'] } });
  const path = join(f.root, '.agentic-workflow.json'); const original = await readFile(path, 'utf8');
  const next = JSON.parse(original); next.repositories.app.keepPullRequestsClosed = true;
  await writeFile(path, JSON.stringify(next));
  await assert.rejects(f.core.execute({ operation: 'pause', input: { reason: 'stale request' } }), /Workspace configuration changed/);
  const check = await f.core.check('implementation');
  assert.equal(check.allowed, false); assert.match(JSON.stringify(check), /Workspace configuration changed/);
  assert.equal(f.core.store.home, f.home);
  await writeFile(path, original); await f.core.assertContext();
  const copied = await CurrentCore.at(structuredClone(f.context));
  await assert.rejects(copied.assertContext(), /discovery is unavailable/);
});
