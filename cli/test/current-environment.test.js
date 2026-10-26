import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, chmod, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executionEnvironment, environmentChanges, assertEnvironmentCurrent, RUNNER_FINGERPRINT_POLICY } from '../../plugin-src/shared/resources/protocol/current/environment.js';
import { identity } from '../../plugin-src/shared/resources/protocol/current/contracts.js';

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'runner-closure-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'repo'), tools = join(root, 'tools');
  await mkdir(repo); await mkdir(tools);
  const configuration = { externalRuntimeInputs: { app: [] }, checks: [{ repository: 'app', command: process.execPath, args: ['--version'] }] };
  const context = { repositories: [{ alias: 'app', path: repo }] }, candidate = { repositories: [{ alias: 'app' }] };
  return { root, repo, tools, configuration, bind: (environment = process.env) => executionEnvironment(context, candidate, configuration, true, environment) };
}

test('opaque runners require an explicit external scope and unknown scripts fail closed', async t => {
  const f = await fixture(t);
  delete f.configuration.externalRuntimeInputs;
  await assert.rejects(f.bind(), /explicit externalRuntimeInputs/);
  f.configuration.externalRuntimeInputs = { app: [] };
  const path = join(f.tools, 'check.cjs'); await writeFile(path, 'process.exit(0)');
  f.configuration.checks[0].args = [path];
  await assert.rejects(f.bind(), /declare its dependency root/);
  f.configuration.externalRuntimeInputs.app = [f.tools];
  await f.bind();
});

test('inferred launcher packages bind imported libraries and env interpreter selection', async t => {
  const f = await fixture(t), launcher = join(f.tools, 'run');
  await writeFile(join(f.tools, 'package.json'), '{}');
  await writeFile(launcher, '#!/usr/bin/env node\nrequire("./library.cjs");\n'); await chmod(launcher, 0o755);
  const library = join(f.tools, 'library.cjs'); await writeFile(library, 'process.exit(0)');
  f.configuration.checks[0] = { repository: 'app', command: launcher, args: [] };
  const before = await f.bind();
  assert.ok(before.executables[0].closure.launches.some(item => item.path === process.execPath));
  await writeFile(library, 'process.exit(7)');
  assert.notEqual(identity(await f.bind()), identity(before));
});

test('external scope binds missing files, file modes and root retargeting', async t => {
  const f = await fixture(t), input = join(f.tools, 'config');
  f.configuration.externalRuntimeInputs.app = [input];
  const missing = identity(await f.bind()); await writeFile(input, 'one');
  const present = identity(await f.bind()); assert.notEqual(present, missing);
  await chmod(input, 0o755); assert.notEqual(identity(await f.bind()), present);
  const target = join(f.root, 'replacement'); await mkdir(target); await writeFile(join(target, 'config'), 'one');
  const link = join(f.root, 'selected'); await symlink(f.tools, link);
  f.configuration.externalRuntimeInputs.app = [link]; const selected = identity(await f.bind());
  await rm(link); await symlink(target, link); assert.notEqual(identity(await f.bind()), selected);
});

test('escaping dependencies require declared targets and unsupported shebangs fail closed', async t => {
  const f = await fixture(t), target = join(f.root, 'outside.cjs'); await writeFile(target, 'process.exit(0)');
  await symlink(target, join(f.tools, 'dependency.cjs')); f.configuration.externalRuntimeInputs.app = [f.tools];
  await assert.rejects(f.bind(), /symlink escapes/);
  f.configuration.externalRuntimeInputs.app.push(target); await f.bind();
  const launcher = join(f.tools, 'run'); await writeFile(launcher, '#!/usr/bin/env -i node\n'); await chmod(launcher, 0o755);
  f.configuration.checks[0].command = launcher;
  await assert.rejects(f.bind(), /Unsupported env shebang/);
  await writeFile(launcher, `#!${launcher}\n`);
  await assert.rejects(f.bind(), /Cyclic shebang/);
});

test('bare relative symlinks and ignored local argument files bind actual bytes', async t => {
  const f = await fixture(t), external = join(f.tools, 'check.cjs');
  await writeFile(external, 'process.exit(0)'); await symlink(external, join(f.repo, 'check.cjs'));
  f.configuration.checks[0].args = ['check.cjs'];
  await assert.rejects(f.bind(), /declare its dependency root/);
  f.configuration.externalRuntimeInputs.app = [f.tools]; const before = identity(await f.bind());
  await writeFile(external, 'process.exit(7)'); assert.notEqual(identity(await f.bind()), before);
  const local = join(f.repo, 'ignored-check.cjs'); await writeFile(local, 'process.exit(0)');
  f.configuration.checks[0].args = ['./ignored-check.cjs']; const prior = identity(await f.bind());
  await writeFile(local, 'process.exit(7)'); assert.notEqual(identity(await f.bind()), prior);
});

test('shebang preload arguments and flag-equals paths bind dependency content', async t => {
  const f = await fixture(t), preload = join(f.tools, 'preload.cjs'), launcher = join(f.repo, 'run');
  await writeFile(preload, 'process.exit(0)');
  await writeFile(launcher, `#!/usr/bin/env -S ${process.execPath} --require ${preload}\n`); await chmod(launcher, 0o755);
  f.configuration.checks[0] = { repository: 'app', command: launcher, args: [] };
  await assert.rejects(f.bind(), /declare its dependency root/);
  f.configuration.externalRuntimeInputs.app = [f.tools]; const before = identity(await f.bind());
  await writeFile(preload, 'process.exit(7)'); assert.notEqual(identity(await f.bind()), before);
  f.configuration.checks[0] = { repository: 'app', command: process.execPath, args: [`--require=${preload}`] };
  const flag = identity(await f.bind()); await writeFile(preload, 'process.exit(8)'); assert.notEqual(identity(await f.bind()), flag);
  f.configuration.checks[0].args = ['--require', 'unknown-module'];
  await assert.rejects(f.bind(), /resolvable file/);
});

test('known loader environment inputs bind bytes without retaining their values', async t => {
  const f = await fixture(t), preload = join(f.tools, 'preload.cjs');
  await writeFile(join(f.tools, 'package.json'), '{}'); await writeFile(preload, 'process.exit(0)');
  const environment = { ...process.env, NODE_OPTIONS: `--require ${preload}`, NODE_PATH: f.tools };
  const before = await f.bind(environment);
  assert.ok(!JSON.stringify(before).includes(f.tools), 'Loader environment paths must stay hashed');
  await writeFile(preload, 'process.exit(7)'); assert.notEqual(identity(await f.bind(environment)), identity(before));
  await assert.rejects(f.bind({ ...environment, NODE_OPTIONS: '--require "ambiguous path"' }), /Unsupported NODE_OPTIONS quoting/);
});

const resultsPath = `node_modules/.vite/vitest/${'a'.repeat(40)}/results.json`;
const runState = `node_modules/.pnpm-task-run-state-v1/${'b'.repeat(64)}.01a175bc183a-42200-1.finished`;
async function put(root, path, body = '{}') {
  const file = join(root, path); await mkdir(join(file, '..'), { recursive: true }); await writeFile(file, body); return file;
}
for (const scope of ['discovered', 'nested', 'overlapping', 'external']) test(`bookkeeping creation, updates and removal are stable through ${scope} directory scope`, async t => {
  const f = await fixture(t), root = scope === 'external' ? f.tools : scope === 'nested' ? join(f.repo, 'apps/api') : f.repo;
  await mkdir(join(root, 'node_modules'), { recursive: true });
  if (scope === 'overlapping') f.configuration.runtimeInputs = { app: ['.'] };
  if (scope === 'external') f.configuration.externalRuntimeInputs.app = [root];
  const before = await f.bind();
  for (const path of [resultsPath, runState, 'node_modules/.pnpm-task-run-state-v1/latest.json', runState.replace('.finished', '.jsonl'), runState.replace('.finished', '.published')]) await put(root, path);
  assert.deepEqual(await f.bind(), before);
  await put(root, resultsPath, '{"duration":22}'); await put(root, runState, 'new completion');
  assert.deepEqual(await f.bind(), before);
  await rm(join(root, 'node_modules/.vite'), { recursive: true });
  await rm(join(root, 'node_modules/.pnpm-task-run-state-v1'), { recursive: true });
  assert.deepEqual(await f.bind(), before);
});

for (const path of [
  'node_modules/.pnpm/pkg/node_modules/pkg/index.js', 'node_modules/.bin/tool',
  'node_modules/.modules.yaml', 'node_modules/.package-lock.json', 'node_modules/.yarn-state.yml',
  'node_modules/.vite/deps/compiled.js', 'node_modules/.cache/compiled.js',
  'node_modules/.pnpm-task-run-state-v2/latest.json', 'node_modules/.pnpm-task-run-state-v1/unknown.js',
  resultsPath.replace('results.json', 'compiled.js'), '.venv/__pycache__/module.pyc',
]) test(`actual input remains bound: ${path}`, async t => {
  const f = await fixture(t); await put(f.repo, path, 'before'); const before = await f.bind();
  await put(f.repo, path, 'after'); const after = await f.bind();
  assert.notEqual(identity(after), identity(before));
  assert.ok(environmentChanges(before, after).some(item => item.repository === 'app' && item.path));
});

test('workspace-state normalization preserves semantic fields and malformed state', async t => {
  const f = await fixture(t), path = 'node_modules/.pnpm-workspace-state-v1.json';
  await put(f.repo, path, JSON.stringify({ lastValidatedTimestamp: 1, settings: { production: true }, projects: { app: 'v1' } }));
  const before = await f.bind();
  await put(f.repo, path, JSON.stringify({ lastValidatedTimestamp: 2, settings: { production: true }, projects: { app: 'v1' } }));
  assert.deepEqual(await f.bind(), before);
  await put(f.repo, path, JSON.stringify({ lastValidatedTimestamp: 2, settings: { production: false }, projects: { app: 'v1' } }));
  assert.notEqual(identity(await f.bind()), identity(before));
  await put(f.repo, path, '{invalid:1'); const broken = await f.bind();
  await put(f.repo, path, '{invalid:2'); assert.notEqual(identity(await f.bind()), identity(broken));
});

for (const kind of ['runtime-file', 'argument', 'external-file', 'executable', 'symlink']) test(`bookkeeping names do not hide ${kind} inputs`, async t => {
  const f = await fixture(t), file = await put(f.repo, resultsPath, '{}');
  if (kind === 'runtime-file') f.configuration.runtimeInputs = { app: [resultsPath] };
  if (kind === 'argument') f.configuration.checks[0].args = [file];
  if (kind === 'external-file') f.configuration.externalRuntimeInputs.app = [file];
  if (kind === 'executable') await chmod(file, 0o755);
  let target = file;
  if (kind === 'symlink') {
    target = await put(f.repo, 'payload.json', '{}'); await rm(file); await symlink(target, file);
  }
  const before = await f.bind(); await writeFile(target, '{"changed":true}');
  assert.notEqual(identity(await f.bind()), identity(before));
});

test('policy changes invalidate prior fingerprints and changes identify roots without private values', async t => {
  const f = await fixture(t); await put(f.repo, 'node_modules/pkg/index.js', 'one');
  const before = await f.bind(); assert.deepEqual(before.fingerprintPolicy, RUNNER_FINGERPRINT_POLICY);
  const old = structuredClone(before); delete old.fingerprintPolicy;
  assert.throws(() => assertEnvironmentCurrent(old, before), error => error.changedInputs[0].kind === 'fingerprint-policy');
  await put(f.repo, 'node_modules/pkg/index.js', 'two');
  const after = await f.bind();
  assert.throws(() => assertEnvironmentCurrent(before, after), /app:node_modules/);
  const secret = await f.bind({ ...process.env, TEST_PRIVATE_VALUE: 'never-print-me' });
  assert.equal(JSON.stringify(environmentChanges(after, secret)).includes('never-print-me'), false);
  assert.ok(environmentChanges(after, secret).some(item => item.kind === 'inherited-environment'));
});

test('changed public argument roots are named while private preload paths stay redacted', async t => {
  const f = await fixture(t), file = await put(f.repo, 'check.cjs', 'one');
  f.configuration.checks[0].args = [file];
  const before = await f.bind(); await writeFile(file, 'two'); const after = await f.bind();
  assert.ok(environmentChanges(before, after).some(item => item.kind === 'argument-input' && item.path === file));
  assert.throws(() => assertEnvironmentCurrent(before, after), error => error.message.includes(file));
  f.configuration.checks[0].args = [];
  const privateFile = await put(f.repo, 'private-loader.cjs', 'one');
  const environment = { ...process.env, NODE_OPTIONS: `--require=${privateFile}` };
  const privateBefore = await f.bind(environment); await writeFile(privateFile, 'two');
  const privateAfter = await f.bind(environment), changes = environmentChanges(privateBefore, privateAfter);
  assert.ok(changes.some(item => item.kind === 'argument-or-loader-input'));
  assert.equal(JSON.stringify(changes).includes(privateFile), false);
  assert.throws(() => assertEnvironmentCurrent(privateBefore, privateAfter), error => !error.message.includes(privateFile));
});
