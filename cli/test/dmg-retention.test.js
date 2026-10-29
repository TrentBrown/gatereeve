import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ARTIFACT_NAME, HOLDS_PATH, WORKFLOW_PATH, cleanup, githubRequest, parseHolds } from '../../ci/dmg-retention.mjs';

const repository = 'TrentBrown/gatereeve', now = Date.parse('2026-10-29T18:00:00Z');
const artifact = (id, patch = {}) => ({ id, name: ARTIFACT_NAME, created_at: new Date(now + id * 1000).toISOString(),
  size_in_bytes: 250_000_000, expired: false, digest: `sha256:${String(id).padStart(64, '0')}`,
  workflow_run: { id: id + 1000, head_sha: 'a'.repeat(40) }, ...patch });
const run = (id, patch = {}) => ({ id: id + 1000, repository: { full_name: repository }, path: WORKFLOW_PATH,
  status: 'completed', conclusion: 'success', event: 'push', head_branch: 'main', ...patch });
const hold = (id, patch = {}) => ({ artifactId: id, reason: 'Investigate exact installer', expiresAt: '2026-10-30T18:00:00Z', ...patch });
const httpError = status => Object.assign(new Error(`HTTP ${status}`), { status });

function fixture(artifacts, { runs = artifacts.map(a => run(a.id)), holds = [], before = () => {} } = {}) {
  const state = { artifacts: new Map(artifacts.map(a => [a.id, structuredClone(a)])),
    runs: new Map(runs.map(r => [r.id, structuredClone(r)])), holds: { schemaVersion: 1, holds }, revision: 'a'.repeat(40), calls: [], deleted: [] };
  const request = async (path, options = {}) => {
    const method = options.method ?? 'GET'; state.calls.push({ path, method });
    await before({ state, path, method });
    if (path === `repos/${repository}/contents/${HOLDS_PATH}?ref=main`) return { type: 'file', encoding: 'base64', sha: state.revision,
      content: Buffer.from(JSON.stringify(state.holds)).toString('base64') };
    if (path.includes('/actions/artifacts?')) {
      const query = new URLSearchParams(path.split('?')[1]); assert.equal(query.get('name'), ARTIFACT_NAME);
      const page = Number(query.get('page')); return { artifacts: structuredClone([...state.artifacts.values()].slice((page - 1) * 100, page * 100)) };
    }
    const match = path.match(/\/actions\/(artifacts|runs)\/(\d+)$/u); assert.ok(match, path);
    const [, kind, rawId] = match, id = Number(rawId), map = state[kind];
    if (!map.has(id)) throw httpError(404);
    if (method === 'DELETE') { assert.equal(kind, 'artifacts'); state.deleted.push(id); map.delete(id); return null; }
    return structuredClone(map.get(id));
  };
  return { state, request, execute: options => cleanup({ request, repository, now: () => now, ...options }) };
}

test('keeps one successful main build, active consumers and holds; ignores other artifact/workflow categories', async () => {
  const artifacts = Array.from({ length: 11 }, (_, i) => artifact(i + 1));
  artifacts[8].name = 'coordinated-desktop-trusted'; artifacts[10].expired = true;
  const runs = artifacts.map(a => run(a.id));
  Object.assign(runs[2], { head_branch: 'topic', event: 'pull_request' });
  runs[3].conclusion = 'failure'; runs[4].conclusion = 'cancelled';
  runs[5].status = 'in_progress'; runs[6].status = 'waiting';
  Object.assign(runs[7], { head_branch: 'investigation', event: 'pull_request' });
  runs[9].path = '.github/workflows/release-conductor.yml';
  const f = fixture(artifacts, { runs, holds: [hold(8)] });
  const report = await f.execute({ apply: true });
  assert.equal(report.ok, true); assert.deepEqual(f.state.deleted.sort((a, b) => a - b), [1, 3, 4, 5]);
  assert.equal(report.plan.find(a => a.artifactId === 2).reason, 'latest-successful-main');
  assert.equal(report.plan.find(a => a.artifactId === 8).reason, 'unexpired-hold');
  assert.ok(f.state.calls.every(c => !c.path.includes('/releases')));
});

test('paginates more than 100 artifacts, orders ties by ID, and is idempotent', async () => {
  const sameDate = new Date(now).toISOString();
  const f = fixture(Array.from({ length: 203 }, (_, i) => artifact(i + 1, { created_at: sameDate })));
  const preview = await f.execute();
  assert.equal(preview.ok, true); assert.equal(preview.plan.length, 203);
  assert.equal(preview.plan[0].artifactId, 203); assert.equal(preview.plan[0].decision, 'retain');
  assert.deepEqual(f.state.deleted, []);
  const applied = await f.execute({ apply: true }); assert.equal(applied.ok, true); assert.equal(f.state.deleted.length, 202);
  const again = await f.execute({ apply: true }); assert.equal(again.ok, true); assert.equal(again.outcomes.length, 0);
});

test('empty inventory, single installer, no main success and all-expired inventories', async () => {
  for (const artifacts of [[], [artifact(1)], [artifact(1, { expired: true })]]) {
    const f = fixture(artifacts); assert.equal((await f.execute({ apply: true })).ok, true); assert.equal(f.state.deleted.length, 0);
  }
  const f = fixture([artifact(1)], { runs: [run(1, { event: 'pull_request', head_branch: 'topic' })] });
  assert.equal((await f.execute({ apply: true })).ok, true); assert.deepEqual(f.state.deleted, [1]);
});

test('expired holds stop protecting at the exact deadline; malformed or duplicate holds fail closed', async () => {
  const f = fixture([artifact(1), artifact(2)], { holds: [hold(1, { expiresAt: '2026-10-29T18:00:00Z' })] });
  assert.equal((await f.execute({ apply: true })).ok, true); assert.deepEqual(f.state.deleted, [1]);
  for (const holds of [[hold(1), hold(1)], [hold(1, { expiresAt: 'forever' })], [hold(1, { expiresAt: '2026-02-30T18:00:00Z' })],
    [hold(1, { artifactId: '1' })], [hold(1, { reason: '' })], [hold(1, { extra: true })]]) {
    const bad = fixture([artifact(1), artifact(2)], { holds });
    assert.equal((await bad.execute({ apply: true })).ok, false); assert.deepEqual(bad.state.deleted, []);
  }
  assert.equal(parseHolds({ schemaVersion: 1, holds: [hold(1, { expiresAt: '2026-10-30T18:00:00.001Z' })] }).length, 1);
});

test('a queued rerun between planning and deletion is protected', async () => {
  let reads = 0;
  const f = fixture([artifact(1), artifact(2)], { before: ({ path, state }) => {
    if (path.endsWith('/runs/1001') && ++reads === 2) state.runs.get(1001).status = 'queued';
  } });
  const report = await f.execute({ apply: true });
  assert.equal(report.ok, true); assert.deepEqual(f.state.deleted, []); assert.equal(report.outcomes[0].reason, 'active-consumers');
});

test('a changed live hold revision stops the sweep even after a previous deletion', async () => {
  const snapshots = [];
  const f = fixture([artifact(1), artifact(2), artifact(3)], { before: ({ state, path }) => {
    if (path.includes('/contents/') && state.deleted.length) { state.revision = 'b'.repeat(40); state.holds.holds = [hold(2)]; }
  } });
  const report = await f.execute({ apply: true, save: async r => snapshots.push(structuredClone(r)) });
  assert.equal(report.ok, false); assert.deepEqual(f.state.deleted, [1]); assert.match(report.errors[0], /Holds changed/);
  assert.ok(snapshots.some(r => r.outcomes.some(o => o.status === 'deleted')));
});

test('keeper deletion or rerun aborts rather than deleting its fallback', async () => {
  for (const mode of ['absent', 'restart']) {
    const f = fixture([artifact(1), artifact(2)], { before: ({ path, state }) => {
      if (path.endsWith('/artifacts/2')) { if (mode === 'absent') state.artifacts.delete(2); else state.runs.get(1002).status = 'in_progress'; }
    } });
    assert.equal((await f.execute({ apply: true })).ok, false); assert.deepEqual(f.state.deleted, []);
  }
});

test('incomplete or changed keeper metadata cannot authorize deleting a fallback', async () => {
  for (const patch of [{ expired: undefined }, { expired: null }, { expired: 0 }, { expired: true },
    { id: 999 }, { workflow_run: undefined }, { created_at: 'invalid' }, { created_at: new Date(now).toISOString() },
    { size_in_bytes: undefined }, { size_in_bytes: 1 }, { digest: 'sha256:changed' }]) {
    const f = fixture([artifact(1), artifact(2)], { before: ({ path, state }) => {
      if (path.endsWith('/artifacts/2')) Object.assign(state.artifacts.get(2), patch);
    } });
    const report = await f.execute({ apply: true });
    assert.equal(report.ok, false, JSON.stringify(patch)); assert.deepEqual(f.state.deleted, []);
    assert.equal(report.errors.length, 1);
  }
});

test('malformed inventory expiry stops cleanup before any deletion', async () => {
  for (const expired of [undefined, null, 0, 1, 'false', 'true', [], {}]) {
    const f = fixture([artifact(1), artifact(2), artifact(3, { expired })]);
    const report = await f.execute({ apply: true });
    assert.equal(report.ok, false); assert.deepEqual(f.state.deleted, []);
    assert.match(report.errors[0], /Incomplete artifact metadata/);
  }
});

test('a mismatched ID in the deletion target response stops cleanup', async () => {
  const f = fixture([artifact(1), artifact(2), artifact(3)], { before: ({ path, state }) => {
    if (path.endsWith('/artifacts/1')) state.artifacts.get(1).id = 999;
  } });
  const report = await f.execute({ apply: true });
  assert.equal(report.ok, false); assert.deepEqual(f.state.deleted, []);
  assert.match(report.errors[0], /Deletion target identity changed/);
});

test('new uploads and newly successful main runs do not get deleted', async () => {
  let reads = 0;
  const f = fixture([artifact(1), artifact(2)], { runs: [run(1, { conclusion: 'failure' }), run(2)], before: ({ path, state }) => {
    if (path.endsWith('/runs/1001') && ++reads === 2) {
      state.runs.get(1001).conclusion = 'success'; state.artifacts.set(3, artifact(3)); state.runs.set(1003, run(3));
    }
  } });
  const report = await f.execute({ apply: true }); assert.equal(report.ok, true); assert.deepEqual(f.state.deleted, []);
  assert.equal(report.outcomes[0].reason, 'new-successful-main'); assert.ok(f.state.artifacts.has(3));
});

test('already-deleted targets are harmless on both GET and DELETE', async () => {
  for (const method of ['GET', 'DELETE']) {
    const f = fixture([artifact(1), artifact(2)], { before: ({ path, method: current, state }) => {
      if (path.endsWith('/artifacts/1') && current === method) state.artifacts.delete(1);
    } });
    const report = await f.execute({ apply: true }); assert.equal(report.ok, true);
    assert.equal(report.outcomes[0].status, 'already-absent'); assert.deepEqual(f.state.deleted, []);
  }
});

test('API, policy, identity, unknown conclusions and partial failures are not deletion permission', async () => {
  for (const mode of ['holds', 'run', 'identity', 'unknown-conclusion', 'partial']) {
    const f = fixture([artifact(1), artifact(2), artifact(3)], { before: ({ path, method, state }) => {
      if (mode === 'holds' && path.includes('/contents/')) throw httpError(403);
      if (mode === 'run' && path.endsWith('/runs/1001')) throw httpError(404);
      if (mode === 'identity' && path.endsWith('/artifacts/1')) state.artifacts.get(1).name = 'signed-recovery';
      if (mode === 'unknown-conclusion' && path.endsWith('/runs/1001')) state.runs.get(1001).conclusion = 'unknown';
      if (mode === 'partial' && path.endsWith('/artifacts/2') && method === 'DELETE') throw httpError(503);
    } });
    const report = await f.execute({ apply: true }); assert.equal(report.ok, false, mode);
    assert.deepEqual(f.state.deleted, mode === 'partial' ? [1] : [], mode);
  }
});

test('unstable pagination aborts before any mutation', async () => {
  const f = fixture(Array.from({ length: 101 }, (_, i) => artifact(i + 1)));
  const request = async (path, options) => {
    if (path.includes('page=2')) return { artifacts: [artifact(1, { size_in_bytes: 123 })] };
    return f.request(path, options);
  };
  const report = await cleanup({ request, repository, apply: true }); assert.equal(report.ok, false); assert.deepEqual(f.state.deleted, []);
});

test('local proposed holds are usable only in preview', async () => {
  const f = fixture([artifact(1), artifact(2)], { before: ({ path }) => { if (path.includes('/contents/')) throw httpError(404); } });
  const previewHolds = { schemaVersion: 1, holds: [hold(1)] };
  assert.equal((await f.execute({ previewHolds })).ok, true);
  await assert.rejects(f.execute({ previewHolds, apply: true }), /preview-only/); assert.deepEqual(f.state.deleted, []);
});

test('HTTP retries are bounded for safe reads; deletion failures are not blindly retried', async () => {
  for (const status of [429, 500, 403]) {
    let calls = 0; const sleeps = [];
    const request = githubRequest('test', { sleep: async ms => sleeps.push(ms), fetcher: async (url, options) => {
      assert.ok(url.startsWith('https://api.github.com/repos/')); assert.equal(options.redirect, 'error'); calls++;
      return calls < 3 ? new Response('', { status, headers: { 'retry-after': '0' } }) : Response.json({ ok: true });
    } });
    assert.deepEqual(await request('repos/a/b/actions/artifacts'), { ok: true }); assert.equal(calls, 3); assert.equal(sleeps.length, 2);
  }
  for (const method of ['GET', 'DELETE']) {
    let calls = 0;
    const request = githubRequest('test', { sleep: async () => {}, fetcher: async () => { calls++; return new Response('', { status: 503 }); } });
    await assert.rejects(request('repos/a/b/actions/artifacts/1', { method }), /HTTP 503/);
    assert.equal(calls, method === 'GET' ? 3 : 1);
  }
});

test('workflow uses trusted main code, serialized narrowly authorized cleanup, preview default and explicit expiry', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/ci-dmg-retention.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_run:\s+workflows: \[Plugin CI\]\s+types: \[completed\]/u);
  assert.match(workflow, /schedule:\s+- cron:/u); assert.match(workflow, /default: false/u);
  assert.match(workflow, /contents: read\s+actions: write/u);
  assert.match(workflow, /group: ordinary-ci-dmg-retention\s+cancel-in-progress: false/u);
  assert.match(workflow, /github.ref == 'refs\/heads\/main'/u);
  assert.match(workflow, /ref: main\s+persist-credentials: false/u);
  assert.doesNotMatch(workflow, /github\.event\.workflow_run\.(head|pull)|pull_request_target|npm (ci|install)/u);
  assert.match(workflow, /if: always\(\)/u); assert.match(workflow, /name: ci-dmg-retention-receipt/u);
  const ci = await readFile(new URL('../../.github/workflows/plugin-ci.yml', import.meta.url), 'utf8');
  assert.match(ci, /name: gatereeve-universal-dmg[\s\S]*?retention-days: 90/u);
  const holds = JSON.parse(await readFile(new URL('../../ci/dmg-retention-holds.json', import.meta.url), 'utf8'));
  assert.deepEqual(parseHolds(holds), []);
});

test('CLI cannot apply locally or from another branch/workflow', () => {
  for (const overrides of [{ GITHUB_ACTIONS: 'false' }, { GITHUB_REF: 'refs/heads/topic' }, { GITHUB_WORKFLOW: 'Plugin CI' }]) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../../ci/dmg-retention.mjs', import.meta.url)), '--apply'], {
      encoding: 'utf8', env: { ...process.env, GH_TOKEN: 'not-a-real-token', GITHUB_ACTIONS: 'true',
        GITHUB_REF: 'refs/heads/main', GITHUB_WORKFLOW: 'CI installer retention', GITHUB_REPOSITORY: repository,
        GITHUB_RUN_ID: '123', ...overrides }, timeout: 5000,
    });
    assert.equal(result.status, 1); assert.match(result.stderr, /local execution is preview-only/);
  }
});
