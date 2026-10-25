import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm, readdir, stat, open, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { currentFixture } from './helpers/current-fixture.js';
import { git, sourceCandidate, checkSource, contentIdentity } from '../../plugin-src/shared/resources/protocol/current/evidence.js';
import { sourcePreparation, ensurePins, releasePins, checkPins } from '../../plugin-src/shared/resources/protocol/current/source-retention.js';
import { ObjectReader, withObjects, sourceGit } from '../../plugin-src/shared/resources/protocol/current/git-source.js';
import { newView, cleanupViews } from '../../plugin-src/shared/resources/protocol/current/source-views.js';

async function commit(f) {
  await git(f.repo, ['add', '.']); await git(f.repo, ['commit', '--allow-empty', '-m', 'source fixture']);
  return (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
}
async function capture(f, run = 'source-run', head = null) {
  head ??= (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  const input = { repositories: [{ alias: 'app', base: head, head }], scope: 'SLICE', criteria: ['R1'] };
  const pins = await sourcePreparation(f.core.store, f.context, input, run, { id: run, hash: head });
  await ensurePins(f.context, pins);
  return (await sourceCandidate(f.core.store, f.context, input, {}, pins)).value;
}
async function authorizeSource(f) {
  const execute = (operation, input, operationId) => f.core.execute({ operation, input, operationId });
  const authority = { kind: 'human-confirmed', instruction: 'Approve synthetic fixture', context: 'Disposable source test' };
  await execute('run.start', { runId: 'source-fixture', implementers: ['fixture'] }, 'start');
  await execute('human.decide', { kind: 'approve-design', subject: (await f.core.store.capture('design.md')).hash, authority, reason: 'Fixture', consequences: 'Validate' }, 'design');
  await execute('spec.validate', {}, 'spec');
  await execute('human.decide', { kind: 'authorize-implementation', subject: (await f.core.commitments()).subject, authority, reason: 'Fixture', consequences: 'Implement' }, 'implement');
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await execute('candidate.prepare', { repositories: [{ alias: 'app', base: head, head }], scope: 'SLICE', criteria: ['R1'] }, 'candidate');
}
async function blob(f, path) { return (await git(f.repo, ['rev-parse', `HEAD:${path}`])).trim(); }
async function fill(path, mib, value = 120) {
  await mkdir(join(path, '..'), { recursive: true }); const fd = await open(path, 'w');
  try { const block = Buffer.alloc(1024 * 1024, value); for (let i = 0; i < mib; i++) await fd.write(block); } finally { await fd.close(); }
}

test('large trees stream source, skip excluded bodies, and retain manifests without file copies', async t => {
  const f = await currentFixture(t);
  await fill(join(f.repo, 'large.bin'), 150);
  await fill(join(f.repo, 'docs/issues/old/evidence/capture.log'), 150, 121);
  await commit(f);
  const hidden = await blob(f, 'docs/issues/old/evidence/capture.log');
  // A missing excluded blob demonstrates that capture never even requests its body.
  // Its tree entry is intact; fixture objects are deliberately disposable.
  await rm(join(f.repo, '.git/objects', hidden.slice(0, 2), hidden.slice(2)));
  const selected = await capture(f);
  assert.deepEqual(selected.repositories[0].files.map(file => file.path), ['app.js', 'large.bin']);
  assert.equal(selected.repositories[0].files[1].hash, undefined);
  const objects = join(f.home, '.gatereeve-current/objects');
  let retainedBytes = 0; for (const name of await readdir(objects)) retainedBytes += (await stat(join(objects, name))).size;
  assert.ok(retainedBytes < 1024 * 1024, `metadata store grew to ${retainedBytes}`);
  let peakChunk = 0; let bytes = 0;
  await withObjects({ path: f.repo }, {}, reader => reader.read(selected.repositories[0].files[1].oid, chunk => { bytes += chunk.length; peakChunk = Math.max(peakChunk, chunk.length); }));
  assert.equal(bytes, 150 * 1024 * 1024); assert.ok(peakChunk <= 1024 * 1024);
  await checkSource(f.core.store, f.context, selected);
});

test('full views share verified bytes only inside the session, ignore archive attributes, and clean up', async t => {
  const f = await currentFixture(t);
  await writeFile(join(f.repo, '.gitattributes'), 'app.js export-ignore\nsubstituted.txt export-subst\n');
  await writeFile(join(f.repo, 'substituted.txt'), '$Format:%H$\n');
  await symlink('../outside', join(f.repo, 'link')); await commit(f);
  const candidate = await capture(f); const repo = candidate.repositories[0];
  const view = await newView(f.core.store);
  try {
    for (const kind of ['repositories', 'base', 'target']) await view.source(`${kind}/app`, { path: f.repo }, repo.files, repo.objectFormat);
    await view.seal();
    assert.equal(await readFile(join(view.root, 'repositories/app/substituted.txt'), 'utf8'), '$Format:%H$\n');
    assert.equal(await readFile(join(view.root, 'repositories/app/link'), 'utf8'), '../outside');
    const a = await stat(join(view.root, 'repositories/app/app.js')); const b = await stat(join(view.root, 'base/app/app.js'));
    assert.equal(a.ino, b.ino); assert.equal(a.mode & 0o333, 0);
    assert.notEqual(a.ino, (await stat(join(f.repo, 'app.js'))).ino);
    await assert.rejects(stat(join(view.root, '.source-blobs')), /ENOENT/);
  } finally { await view.close(); }
  await assert.rejects(stat(view.root), /ENOENT/); assert.deepEqual(await f.core.store.openViews(), []);
});

test('reference ownership protects shared source, detects conflicts and releases idempotently', async t => {
  const f = await currentFixture(t); const first = await capture(f, 'first'); const second = await capture(f, 'second');
  assert.notEqual(first.sourceRetention.owner, second.sourceRetention.owner);
  assert.equal((await releasePins(f.context, [first.sourceRetention])).status, 'released');
  await assert.rejects(checkSource(f.core.store, f.context, first), /retention reference/);
  await checkSource(f.core.store, f.context, second);
  assert.equal((await releasePins(f.context, [first.sourceRetention])).status, 'released');
  const pin = second.sourceRetention.pins[0];
  const next = await commit(f); await git(f.repo, ['update-ref', pin.ref, next]);
  await assert.rejects(ensurePins(f.context, second.sourceRetention), /Conflicting/);
  const result = await releasePins(f.context, [second.sourceRetention]); assert.equal(result.status, 'pending');
  assert.equal((await git(f.repo, ['rev-parse', pin.ref])).trim(), next);
});

test('equivalent commits reuse content identity while changed bytes and modes do not', async t => {
  const f = await currentFixture(t); const first = await capture(f, 'first'); await commit(f); const second = await capture(f, 'second');
  assert.notEqual(first.repositories[0].head, second.repositories[0].head);
  assert.equal(contentIdentity(first), contentIdentity(second));
  await writeFile(join(f.repo, 'app.js'), 'changed\n'); await commit(f); const third = await capture(f, 'third');
  assert.notEqual(contentIdentity(second), contentIdentity(third));
});

test('ambiguous JSON classification is bounded, provenance checked, and nonregular records rejected', async t => {
  const f = await currentFixture(t); const dir = join(f.repo, 'docs/issues/old/evidence'); await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'ordinary.json'), '{broken');
  await writeFile(join(dir, 'known.json'), JSON.stringify({ schemaVersion: 1, kind: 'feature-verification', payload: {} }));
  await commit(f); const candidate = await capture(f);
  assert.ok(candidate.repositories[0].files.some(file => file.path.endsWith('ordinary.json')));
  assert.ok(!candidate.repositories[0].files.some(file => file.path.endsWith('known.json')));
  await checkSource(f.core.store, f.context, candidate);
  candidate.repositories[0].classifications.head[0].policy = 'wrong';
  await assert.rejects(checkSource(f.core.store, f.context, candidate), /provenance/);
  await fill(join(dir, 'huge.json'), 9); await commit(f);
  await assert.rejects(capture(f, 'oversized'), /classification limit/);
  await rm(join(dir, 'huge.json')); await symlink('../ordinary.json', join(dir, 'record.md')); await commit(f);
  await assert.rejects(capture(f, 'link'), /regular non-executable/);
});

test('ordinary object availability is lightweight but materialization verifies corrupted contents', async t => {
  const f = await currentFixture(t); const candidate = await capture(f); const oid = await blob(f, 'app.js');
  const path = join(f.repo, '.git/objects', oid.slice(0, 2), oid.slice(2));
  const { deflateSync } = await import('node:zlib');
  await rm(path);
  await writeFile(path, deflateSync(Buffer.from('blob 7\0changed')));
  // Metadata lookup is intentionally not a content audit.
  await checkSource(f.core.store, f.context, candidate);
  const view = await newView(f.core.store);
  try { await assert.rejects(view.source('repositories/app', { path: f.repo }, candidate.repositories[0].files, 'sha1'), /integrity/); }
  finally { await view.close(); }
  await rm(path); await assert.rejects(checkSource(f.core.store, f.context, candidate), /unavailable/);
});

test('cleanup leaves live view sessions intact', async t => {
  const f = await currentFixture(t); const view = await newView(f.core.store);
  await cleanupViews(f.core.store); assert.ok((await stat(view.root)).isDirectory());
  await view.close();
});

test('completion cleanup is durable, protects active jobs, and does not undo completion', async t => {
  const f = await currentFixture(t); const selected = await capture(f);
  await f.core.execute({ operation: 'run.start', input: { runId: 'source-run', implementers: ['fixture'] }, operationId: 'start' });
  const append = async (type, payload, id) => f.core.append((await f.core.state()).state, type, payload, { id, hash: (await import('../../plugin-src/shared/resources/protocol/current/contracts.js')).identity(payload) });
  await append('SOURCE_PREPARING', selected.sourceRetention, 'source-prepared');
  await append('JOB_STARTED', { jobId: 'job', gates: ['code'] }, 'job-start');
  await append('MILESTONE', { name: 'completion', candidate: null }, 'completed-fixture');
  await f.core.cleanupSource();
  assert.equal((await f.core.state()).state.sourceCleanup.status, 'pending');
  await checkPins(f.context, selected.sourceRetention);
  await append('JOB_FINISHED', { jobId: 'job', results: [] }, 'job-finish');
  await f.core.cleanupSource();
  assert.equal((await f.core.state()).state.sourceCleanup.status, 'released');
  const check = await f.core.check('completion'); assert.equal(check.historical, true); assert.equal(check.allowed, true);
  await f.core.cleanupSource();
  assert.equal((await f.core.state()).state.phase, 'COMPLETE');
  await assert.rejects(checkPins(f.context, selected.sourceRetention), /unavailable/);
});

test('pin preparation retry preserves independent owners across linked worktrees', async t => {
  const f = await currentFixture(t); const original = await capture(f, 'original');
  const linked = join(f.root, 'linked'); await git(f.repo, ['worktree', 'add', '--detach', linked, 'HEAD']);
  const otherContext = { ...f.context, repositories: [{ ...f.context.repositories[0], path: linked }] };
  const head = original.repositories[0].head;
  const prep = await sourcePreparation(f.core.store, otherContext, { repositories: [{ alias: 'app', base: head, head }] }, 'linked', { id: 'linked' });
  await ensurePins(otherContext, prep); await ensurePins(otherContext, prep);
  assert.equal(prep.pins[0].common, original.sourceRetention.pins[0].common);
  assert.equal((await releasePins(f.context, [original.sourceRetention])).status, 'released');
  await checkPins(otherContext, prep);
});

test('SHA-256 objects and views use their native object identities', async t => {
  const f = await currentFixture(t);
  const repo = join(f.root, 'sha256'); await mkdir(repo);
  await git(repo, ['init', '--object-format=sha256', '-b', 'topic']);
  await git(repo, ['config', 'user.name', 'Fixture']); await git(repo, ['config', 'user.email', 'fixture@example.test']);
  await git(repo, ['config', 'commit.gpgsign', 'false']);
  await writeFile(join(repo, 'app.js'), 'sha256 source\n');
  f.repo = repo; f.context.repositories[0].path = await (await import('node:fs/promises')).realpath(repo);
  await commit(f); const selected = await capture(f);
  assert.equal(selected.repositories[0].objectFormat, 'sha256'); assert.equal(selected.repositories[0].files[0].oid.length, 64);
  const view = await newView(f.core.store);
  try { await view.source('repositories/app', { path: repo }, selected.repositories[0].files, 'sha256'); await view.seal();
    assert.equal(await readFile(join(view.root, 'repositories/app/app.js'), 'utf8'), 'sha256 source\n');
  } finally { await view.close(); }
});

test('copy fallback preserves full bytes and removes backing files', async t => {
  const f = await currentFixture(t); const candidate = await capture(f); let attempts = 0;
  const view = await newView(f.core.store, { linkFile: async () => { attempts++; throw Object.assign(new Error('unsupported link'), { code: 'EXDEV' }); } });
  try {
    for (const kind of ['repositories', 'base', 'target']) await view.source(`${kind}/app`, { path: f.repo }, candidate.repositories[0].files, 'sha1');
    await view.seal(); assert.equal(attempts, 3);
    const a = join(view.root, 'repositories/app/app.js'); const b = join(view.root, 'base/app/app.js');
    assert.notEqual((await stat(a)).ino, (await stat(b)).ino); assert.deepEqual(await readFile(a), await readFile(b));
  } finally { await view.close(); }
});

test('interrupted controller cannot clean an unresolved evaluator job or an unknown view owner', async t => {
  const f = await currentFixture(t); const view = await newView(f.core.store, { runId: 'run', jobId: 'job' });
  const [record] = await f.core.store.openViews();
  // Force a dead-controller observation, keeping the actual job unresolved.
  const views = f.core.store.openViews.bind(f.core.store);
  f.core.store.openViews = async () => (await views()).map(value => ({ ...value, pid: 2147483647 }));
  await cleanupViews(f.core.store, { runId: 'run', jobs: { job: { finished: false } } });
  assert.ok((await stat(view.root)).isDirectory());
  await rm(join(view.root, '.gatereeve-view-owner'));
  await cleanupViews(f.core.store, { runId: 'run', jobs: { job: { finished: true } } });
  assert.ok((await stat(view.root)).isDirectory());
  assert.equal((await f.core.store.openViews())[0].id, record.id);
  await view.close();
});

test('multi-repository partial pin failure retries without disturbing another operation', async t => {
  const f = await currentFixture(t); const one = await capture(f, 'one');
  const second = join(f.root, 'second'); await git(f.root, ['clone', '--no-hardlinks', f.repo, second]);
  const other = { ...f.context.repositories[0], alias: 'other', path: second };
  const context = { ...f.context, repositories: [...f.context.repositories, other] };
  const head = one.repositories[0].head;
  const input = { repositories: [{ alias: 'app', base: head, head }, { alias: 'other', base: head, head }] };
  const prep = await sourcePreparation(f.core.store, context, input, 'two', { id: 'two', hash: 'original' });
  other.path = join(f.root, 'unavailable');
  await assert.rejects(ensurePins(context, prep), /ENOENT|configuration/);
  await checkPins(f.context, one.sourceRetention);
  other.path = second; await ensurePins(context, prep); await checkPins(context, prep);
  const changed = await sourcePreparation(f.core.store, context, input, 'two', { id: 'two', hash: 'changed' });
  assert.equal(changed.id, prep.id); assert.notDeepEqual(changed.operation, prep.operation);
  await releasePins(context, [prep]); await checkPins(f.context, one.sourceRetention);
});

test('candidate publication cannot cross a concurrent human pause after preparation intent', async t => {
  const f = await currentFixture(t);
  await authorizeSource(f);
  const before = (await f.core.state()).state.candidate;
  const append = f.core.append.bind(f.core); let intervened = false;
  f.core.append = async (state, type, payload, operation) => {
    const recorded = await append(state, type, payload, operation);
    if (type === 'SOURCE_PREPARING' && !intervened) {
      intervened = true;
      await f.core.execute({ operation: 'run.pause', operationId: 'concurrent-pause', input: { authority: { kind: 'human-confirmed', instruction: 'Pause work.', context: 'Concurrent user instruction fixture' } } });
    }
    return recorded;
  };
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await assert.rejects(f.core.execute({ operation: 'candidate.prepare', operationId: 'new-preparation', input: { repositories: [{ alias: 'app', base: head, head }], scope: 'SLICE', criteria: ['R1'] } }), /Concurrent update/);
  const state = (await f.core.state()).state;
  assert.deepEqual(state.candidate, before); assert.equal(state.paused, true);
});

test('view initialization failure removes the created root even before its owner marker exists', async t => {
  const f = await currentFixture(t); let root;
  await assert.rejects(newView(f.core.store, { writeMarker: async path => { root = join(path, '..'); throw new Error('simulated marker failure'); } }), /marker failure/);
  await assert.rejects(stat(root), /ENOENT/); assert.deepEqual(await f.core.store.openViews(), []);
});

test('completion exposes pending cleanup immediately and failed preparation is visible until retry', async t => {
  const f = await currentFixture(t);
  await authorizeSource(f);
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await writeFile(join(f.repo, 'app.js'), 'dirty');
  const request = { operation: 'candidate.prepare', operationId: 'retry-fixture', input: { repositories: [{ alias: 'app', base: head, head }], scope: 'SLICE', criteria: ['R1'] } };
  await assert.rejects(f.core.execute(request), /dirty/);
  let state = (await f.core.state()).state;
  const pending = Object.entries(state.sourcePreparationStatus).find(([, value]) => value.status === 'retry-required');
  assert.ok(pending); assert.match(pending[1].reason, /retained.*Retry/);
  await git(f.repo, ['restore', 'app.js']);
  await f.core.execute(request); state = (await f.core.state()).state;
  assert.equal(state.sourcePreparationStatus[pending[0]].status, 'published');
  const { identity } = await import('../../plugin-src/shared/resources/protocol/current/contracts.js');
  await f.core.append(state, 'MILESTONE', { name: 'completion' }, { id: 'completion-crash', hash: identity('completion-crash') });
  const observed = await f.core.inspect(); assert.equal(observed.phase, 'COMPLETE'); assert.equal(observed.sourceCleanup.status, 'pending');
});

test('classification and metadata limits reject precisely at their documented boundaries', async t => {
  const f = await currentFixture(t); const dir = join(f.repo, 'docs/issues/old/evidence'); await mkdir(dir, { recursive: true });
  const envelope = JSON.stringify({ schemaVersion: 1, kind: 'feature-verification', payload: '' });
  const value = JSON.stringify({ schemaVersion: 1, kind: 'feature-verification', payload: 'x'.repeat(8 * 1024 * 1024 - Buffer.byteLength(envelope)) });
  assert.equal(Buffer.byteLength(value), 8 * 1024 * 1024);
  await writeFile(join(dir, 'limit.json'), value); await commit(f);
  const selected = await capture(f); assert.ok(!selected.repositories[0].files.some(file => file.path.endsWith('limit.json')));
  await writeFile(join(dir, 'limit.json'), value + ' '); await commit(f);
  await assert.rejects(capture(f, 'over-bound'), /8388609.*8388608.*classification limit/);
  await assert.rejects(f.core.store.putJson({ metadata: 'x'.repeat(64 * 1024 * 1024) }), /metadata.*64 MiB/);
});

test('malformed Git object streams reject with a source diagnostic', async t => {
  const f = await currentFixture(t); const fake = join(f.root, 'malformed-git.mjs');
  await writeFile(fake, '#!/usr/bin/env node\nprocess.stdin.once("data",()=>{process.stdout.write("malformed source header\\n"); process.stdin.destroy();});\n', { mode: 0o700 });
  await assert.rejects(withObjects({ path: f.repo, gitExecutable: fake }, {}, reader => reader.read('1'.repeat(40))), /unavailable or invalid/);
});
