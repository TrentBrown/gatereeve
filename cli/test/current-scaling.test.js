import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, chmod, realpath, rm, symlink, rename, stat, utimes, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { executionEnvironment, fingerprintObservation, releaseComparisonIndexes } from '../../plugin-src/shared/resources/protocol/current/environment.js';
import { withObservationEpochs, observationEpochs } from '../../plugin-src/shared/resources/protocol/current/fingerprint-cache.js';
import { identity } from '../../plugin-src/shared/resources/protocol/current/contracts.js';
import { shapeHistory, fitHistory, HISTORY_PRIORITY, HISTORY_TIERS } from '../../plugin-src/shared/resources/protocol/current/review-history.js';
import { MetricsStore } from '../../plugin-src/shared/resources/performance/store.js';

const execute = promisify(execFile);
const environmentModule = new URL('../../plugin-src/shared/resources/protocol/current/environment.js', import.meta.url).href;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
// Content hashes are cached only for files older than the 2 s racy window.
const RACY_WAIT_MS = 2200;

// A pnpm-shaped dependency tree: real package directories under
// node_modules/.pnpm, sibling dependency links and top-level package links,
// plus runner bookkeeping and an executable bin.
async function workspace(t, { packages = 120, filesPerPackage = 8 } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gatereeve-scaling-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'repo'), tools = join(root, 'tools');
  await mkdir(join(repo, 'node_modules/.pnpm'), { recursive: true }); await mkdir(join(tools, 'bin'), { recursive: true });
  for (let p = 0; p < packages; p++) {
    const name = `pkg${p}`, dir = join(repo, 'node_modules/.pnpm', `${name}@1.0.0/node_modules/${name}`);
    await mkdir(join(dir, 'lib'), { recursive: true });
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
    await Promise.all(Array.from({ length: filesPerPackage - 1 }, (_, i) =>
      writeFile(join(dir, 'lib', `f${i}.js`), `module.exports = ${JSON.stringify(`${name}:${i}:`.repeat(1 + (i * 37) % 60))};\n`)));
    if (p > 0) await symlink(`../../pkg${p - 1}@1.0.0/node_modules/pkg${p - 1}`, join(repo, 'node_modules/.pnpm', `${name}@1.0.0/node_modules/pkg${p - 1}`));
    if (p % 10 === 0) await symlink(`.pnpm/${name}@1.0.0/node_modules/${name}`, join(repo, 'node_modules', name));
  }
  await mkdir(join(repo, 'node_modules/.bin'));
  await writeFile(join(repo, 'node_modules/.bin/tool'), '#!/bin/sh\nexit 0\n'); await chmod(join(repo, 'node_modules/.bin/tool'), 0o755);
  await writeFile(join(repo, 'node_modules/.pnpm-workspace-state-v1.json'), JSON.stringify({ lastValidatedTimestamp: 1, projects: {} }));
  await mkdir(join(repo, 'node_modules/.vite/vitest/0123456789abcdef0123456789abcdef01234567'), { recursive: true });
  await writeFile(join(repo, 'node_modules/.vite/vitest/0123456789abcdef0123456789abcdef01234567/results.json'), '{}');
  await writeFile(join(tools, 'package.json'), '{}'); await writeFile(join(tools, 'bin/helper.js'), 'process.exit(0)\n');
  const context = { repositories: [{ alias: 'app', path: repo }] }, candidate = { repositories: [{ alias: 'app' }] };
  const configuration = { externalRuntimeInputs: { app: [tools] }, checks: [{ repository: 'app', command: process.execPath, args: [join(tools, 'bin/helper.js')] }] };
  const bind = (options = {}) => executionEnvironment(context, candidate, configuration, true, process.env, options);
  return { root, repo, tools, context, candidate, configuration, bind };
}
async function withEnvironment(name, value, fn) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
  try { return await fn(); } finally { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; }
}
// A fresh process: the in-memory cache is empty, so only the sealed cache helps.
async function bindInChild(f, env = {}) {
  const script = `import { executionEnvironment, fingerprintObservation } from ${JSON.stringify(environmentModule)};
import { identity } from ${JSON.stringify(new URL('../../plugin-src/shared/resources/protocol/current/contracts.js', import.meta.url).href)};
const [context, candidate, configuration] = JSON.parse(process.argv[1]);
const manifest = await executionEnvironment(context, candidate, configuration, true, process.env, {});
process.stdout.write(JSON.stringify({ identity: identity(manifest), observation: fingerprintObservation(manifest) }));`;
  const { stdout } = await execute(process.execPath, ['--input-type=module', '-e', script, JSON.stringify([f.context, f.candidate, f.configuration])],
    { env: { ...process.env, GATEREEVE_METRICS: 'off', ...env }, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout);
}

test('content cache never changes a fingerprint: disabled, cold, warm and fresh-process manifests are identical', async t => {
  const f = await workspace(t);
  await pause(RACY_WAIT_MS);
  const exact = await withEnvironment('GATEREEVE_FINGERPRINT_CACHE', 'off', () => f.bind());
  assert.equal(fingerprintObservation(exact).cache, 'disabled');
  const cold = await f.bind(), warm = await f.bind();
  assert.equal(identity(cold), identity(exact)); assert.equal(identity(warm), identity(exact));
  assert.equal(fingerprintObservation(warm).hashed, 0, 'unchanged files are not re-read');
  assert.equal(fingerprintObservation(warm).cacheHits, fingerprintObservation(warm).files);
  const child = await bindInChild(f);
  assert.equal(child.identity, identity(exact));
  assert.equal(child.observation.cache, 'sealed'); assert.equal(child.observation.hashed, 0, 'a new process reuses the sealed cache');
});

test('cached hashes are invalidated by same-size rewrites with restored mtime, inode replacement and mode changes', async t => {
  const f = await workspace(t, { packages: 12 });
  const file = join(f.repo, 'node_modules/.pnpm/pkg3@1.0.0/node_modules/pkg3/lib/f2.js');
  // A whole-second mtime can be restored exactly through utimes().
  await utimes(file, 1_700_000_000, 1_700_000_000);
  await pause(RACY_WAIT_MS);
  let previous = identity(await f.bind());
  assert.equal(fingerprintObservation(await f.bind()).hashed, 0);
  const original = await stat(file), bytes = await readFile(file);
  const rewritten = Buffer.from(bytes); rewritten[0] = rewritten[0] === 0x61 ? 0x62 : 0x61;
  await writeFile(file, rewritten); await utimes(file, original.atime, original.mtime);
  assert.equal((await stat(file)).mtimeMs, 1_700_000_000_000, 'mtime restored exactly; only ctime reveals the write');
  assert.equal((await stat(file)).size, original.size);
  let current = identity(await f.bind());
  assert.notEqual(current, previous, 'same-size rewrite with restored mtime is detected');
  previous = current;
  await writeFile(`${file}.next`, 'replacement'); await rename(`${file}.next`, file);
  current = identity(await f.bind()); assert.notEqual(current, previous, 'replaced inode is detected'); previous = current;
  await chmod(file, 0o755);
  current = identity(await f.bind()); assert.notEqual(current, previous, 'mode change is detected');
  // Racy files: written moments ago, so never cached and always re-read.
  const fresh = await f.bind();
  assert.ok(fingerprintObservation(fresh).hashed >= 1, 'files inside the racy window are re-read');
});

test('unsealed, corrupt or forged caches are ignored and replaced', async t => {
  const f = await workspace(t, { packages: 6 });
  await pause(RACY_WAIT_MS);
  const exact = identity(await f.bind());
  const directory = join(f.repo, '.gatereeve-current/fingerprint-cache');
  const [name] = (await readdir(directory)).filter(item => item.endsWith('.v1'));
  for (const bytes of [Buffer.alloc(64, 1), Buffer.concat([Buffer.alloc(32), Buffer.from('not gzip')]),
    Buffer.concat([(await readFile(join(directory, name))).subarray(0, 32), Buffer.from('forged payload under a stale seal')])]) {
    await writeFile(join(directory, name), bytes);
    const child = await bindInChild(f);
    assert.equal(child.identity, exact);
    assert.equal(child.observation.cacheHits, 0, 'a cache that fails its seal grants nothing');
  }
  assert.equal((await bindInChild(f)).observation.hashed, 0, 'the replacement cache is sealed and reused');
  await releaseComparisonIndexes(f.context);
  assert.deepEqual(await readdir(directory), [], 'completion releases the content cache');
});

test('one operation shares an observation for qualification, while a guard observes afresh', async t => {
  const f = await workspace(t, { packages: 6 });
  await withObservationEpochs(async () => {
    const first = await f.bind({ freshAfter: 0 }), second = await f.bind({ freshAfter: 0 });
    assert.equal(second, first, 'qualification reuses the operation observation');
    const guard = observationEpochs().mark();
    const guarded = await f.bind({ freshAfter: guard });
    assert.notEqual(guarded, first, 'a guard never reuses an observation that started before it');
    assert.equal(identity(guarded), identity(first));
    assert.equal(await f.bind({ freshAfter: guard }), guarded, 'requests within one guard share its observation');
    assert.notEqual(await f.bind({ retainDiagnostics: true, freshAfter: 0 }), first, 'retained diagnostics are always observed afresh');
  });
  assert.notEqual(await f.bind({ freshAfter: 0 }), await f.bind({ freshAfter: 0 }), 'outside an operation every request observes');
});

test('a 40,000-file dependency workspace re-checks without re-reading content', async t => {
  const f = await workspace(t, { packages: 2500, filesPerPackage: 16 });
  await pause(RACY_WAIT_MS);
  let started = performance.now();
  const cold = await f.bind(); const coldMs = performance.now() - started;
  const files = fingerprintObservation(cold).files;
  assert.ok(files >= 40000, `fixture binds ${files} files`);
  started = performance.now();
  const warm = await f.bind(); const warmMs = performance.now() - started;
  assert.equal(identity(warm), identity(cold));
  assert.equal(fingerprintObservation(warm).hashed, 0);
  const child = await bindInChild(f);
  assert.equal(child.identity, identity(cold)); assert.equal(child.observation.hashed, 0);
  t.diagnostic(`files=${files} cold=${Math.round(coldMs)}ms warm=${Math.round(warmMs)}ms freshProcess=${child.observation.durationMs}ms`);
});

test('environment fingerprinting reports spans, counts and cache reuse to workflow metrics', async t => {
  const f = await workspace(t, { packages: 6 });
  const metrics = join(f.root, 'metrics');
  await withEnvironment('GATEREEVE_METRICS_DIR', metrics, () => withEnvironment('GATEREEVE_METRICS', undefined, async () => {
    await pause(RACY_WAIT_MS);
    await f.bind(); await f.bind();
    const records = (await new MetricsStore(metrics).read()).records.map(item => item.record);
    const spans = records.filter(item => item.label === 'environment-fingerprint' && item.outcome !== 'RUNNING');
    assert.equal(spans.length, 2); assert.ok(spans.every(item => item.count > 0 && item.durationMs > 0 && item.category === 'setup'));
    const hashed = records.filter(item => item.label === 'environment-hash');
    assert.equal(hashed.length, 1, 'only the observation that read content records it'); assert.ok(hashed[0].count > 0);
    assert.ok(records.some(item => item.label === 'environment-hash-bytes' && item.count > 0));
    await withObservationEpochs(async () => { await f.bind({ freshAfter: 0 }); await f.bind({ freshAfter: 0 }); });
    const after = (await new MetricsStore(metrics).read()).records.map(item => item.record);
    assert.equal(after.filter(item => item.label === 'environment-fingerprint' && item.outcome !== 'RUNNING').length, 3, 'shared requests add no span');
  }));
});

// Review history: the shape of MyLifeMap's failing run is many 7-11 KB prior
// reports across slices and failed rounds; together they exceed the limit.
function report(index, { gate = 'code', open = false } = {}) {
  const prose = `Evidence prose for round ${index}. `.repeat(220);
  return { reference: { hash: `sha256:${index.toString(16).padStart(64, '0')}`, bytes: 10000 }, reviewerResult: {
    gate, outcome: open ? 'FAIL' : 'PASS', summary: prose, mode: 'full',
    coverage: { complete: true, paths: Array.from({ length: 40 }, (_, i) => `app/src/module${i}.js`), interactions: [prose.slice(0, 500)], limitations: [] },
    criteria: [{ id: 'R1', outcome: open ? 'FAIL' : 'PASS', evidence: prose.slice(0, 1500) }],
    findings: open ? [{ id: `finding-${index}`, classId: 'class', criterion: 'gate:code', path: 'app/src/shared.js', evidence: 'Current defect in shared module', blocking: true }] : [],
    dispositions: [{ id: `finding-${index - 1}`, status: 'resolved', evidence: prose.slice(0, 800) }], historyAssessment: null } };
}
test('review history shaping stays bounded for any number of rounds and keeps open findings inline', () => {
  for (const rounds of [10, 49, 200, 2000]) {
    const history = Array.from({ length: rounds }, (_, i) => report(i, { open: i === 0 }));
    assert.ok(rounds < 100 || JSON.stringify(history.map(item => item.reviewerResult)).length > 512 * 1024, 'full inlining would exceed the provider limit');
    const priorities = new Map([[history[0].reference.hash, HISTORY_PRIORITY.open]]);
    const shaped = shapeHistory(history, priorities, HISTORY_TIERS[0]);
    const size = JSON.stringify(shaped).length;
    assert.ok(size <= HISTORY_TIERS[0].inline + HISTORY_TIERS[0].references + 8192, `history for ${rounds} rounds is ${size} characters`);
    assert.equal(shaped.summary.total, rounds);
    assert.equal(shaped.summary.inline + shaped.summary.references + shaped.summary.indexOnly, rounds, 'every entry is accounted for');
    assert.equal(shaped.entries[0].reference.hash, history[0].reference.hash);
    assert.ok(shaped.entries[0].findings.length === 1 && shaped.entries[0].inline === undefined, 'the oldest open finding stays inline');
    assert.deepEqual(shapeHistory(history, priorities, HISTORY_TIERS[0]), shaped, 'shaping is deterministic');
    const fitted = fitHistory(history, priorities, value => 400 * 1024 + JSON.stringify(value).length, 512 * 1024);
    assert.ok(fitted.fits, `a 400 KB remainder still fits with ${rounds} rounds`);
  }
});
