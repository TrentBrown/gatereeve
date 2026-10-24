import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, chmod, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executionEnvironment } from '../../plugin-src/shared/resources/protocol/current/environment.js';
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
