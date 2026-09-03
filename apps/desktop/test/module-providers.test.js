import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { chmod, mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import {
  createProviderSupervisor,
  discoverInstalledProviders,
  hashProviderExecutable,
  hashProviderManifest,
} from '../main/module-providers.js';

const moduleDigest = `sha256:${'a'.repeat(64)}`;
const inputFingerprint = `sha256:${'b'.repeat(64)}`;

function manifest(overrides = {}) {
  const value = {
    schemaVersion: 1,
    id: 'example/check-provider',
    version: '1.0.0',
    digest: `sha256:${'0'.repeat(64)}`,
    runtime: 'native',
    executable: 'bin/provider',
    executableDigest: hashProviderExecutable('#!/bin/sh\n'),
    args: [],
    timeoutSeconds: 10,
    ...overrides,
  };
  value.digest = hashProviderManifest(value);
  return value;
}

function request() {
  return {
    schemaVersion: 1,
    requestId: 'request-1',
    operation: 'observe',
    provider: { id: 'example/check-provider', version: '1.0.0' },
    module: { id: 'example/check', version: '1.0.0', digest: moduleDigest },
    input: {
      featureId: 'feature', attemptId: 'attempt', scope: 'SLICE', inputFingerprint,
      dependencyEventIds: {}, evidence: null,
    },
  };
}

function response(overrides = {}) {
  return {
    schemaVersion: 1,
    requestId: 'request-1',
    provider: { id: 'example/check-provider', version: '1.0.0' },
    module: { id: 'example/check', version: '1.0.0', digest: moduleDigest },
    observedInputFingerprint: inputFingerprint,
    live: {
      status: 'running', detail: null, updatedAt: '2026-09-03T12:00:00Z',
      stages: [], actions: [], attempts: [], evidence: [], links: [], failure: null,
    },
    outcome: null,
    evidence: null,
    ...overrides,
  };
}

function installedProvider() {
  const value = manifest({ executable: '/installed/provider' });
  return { ...value, manifest: value, manifestPath: '/installed/provider.json' };
}

function supervisor(options = {}) {
  return createProviderSupervisor({
    readExecutable: async () => Buffer.from('#!/bin/sh\n'),
    ...options,
  });
}

test('installed provider discovery admits only exact allowlisted regular manifests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-providers-'));
  await mkdir(join(root, 'bin'));
  await writeFile(join(root, 'bin/provider'), '#!/bin/sh\n');
  await chmod(join(root, 'bin/provider'), 0o755);
  const allowed = manifest();
  const unlisted = manifest({ id: 'example/other-provider' });
  await writeFile(join(root, 'allowed.json'), `${JSON.stringify(allowed)}\n`);
  await writeFile(join(root, 'unlisted.json'), `${JSON.stringify(unlisted)}\n`);
  await symlink(join(root, 'allowed.json'), join(root, 'linked.json'));
  const result = await discoverInstalledProviders(root, [{
    id: allowed.id, version: allowed.version, digest: allowed.digest,
  }]);
  assert.equal(result.providers.length, 1);
  assert.equal(result.providers[0].id, allowed.id);
  assert.equal(result.providers[0].executable, join(root, 'bin/provider'));
  assert.equal(result.diagnostics.length, 2);
});

test('duplicate allowlisted provider IDs make every duplicate unavailable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-provider-duplicates-'));
  await mkdir(join(root, 'bin'));
  await writeFile(join(root, 'bin/provider'), '#!/bin/sh\n');
  await chmod(join(root, 'bin/provider'), 0o755);
  const allowed = manifest();
  await writeFile(join(root, 'one.json'), `${JSON.stringify(allowed)}\n`);
  await writeFile(join(root, 'two.json'), `${JSON.stringify(allowed)}\n`);
  const result = await discoverInstalledProviders(root, [{
    id: allowed.id, version: allowed.version, digest: allowed.digest,
  }]);
  assert.deepEqual(result.providers, []);
  assert.equal(result.diagnostics.some((item) => /Duplicate/.test(item.detail)), true);
});

test('provider discovery treats missing or linked installed executables as unavailable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-provider-executables-'));
  await mkdir(join(root, 'bin'));
  await symlink('/usr/bin/true', join(root, 'bin/provider'));
  const linked = manifest();
  await writeFile(join(root, 'linked.json'), `${JSON.stringify(linked)}\n`);
  const result = await discoverInstalledProviders(root, [{
    id: linked.id, version: linked.version, digest: linked.digest,
  }]);
  assert.deepEqual(result.providers, []);
  assert.match(result.diagnostics[0].detail, /regular file, not a symlink/);
});

test('provider discovery rejects executable bytes that differ from the exact manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-provider-digest-'));
  await mkdir(join(root, 'bin'));
  await writeFile(join(root, 'bin/provider'), '#!/bin/sh\nchanged\n');
  await chmod(join(root, 'bin/provider'), 0o755);
  const allowed = manifest();
  await writeFile(join(root, 'provider.json'), `${JSON.stringify(allowed)}\n`);
  const result = await discoverInstalledProviders(root, [{
    id: allowed.id, version: allowed.version, digest: allowed.digest,
  }]);
  assert.deepEqual(result.providers, []);
  assert.match(result.diagnostics[0].detail, /executable digest/);
});

test('electron-node providers use the trusted app runtime without requiring system Node', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-electron-provider-'));
  const entrypoint = 'provider.mjs';
  await writeFile(join(root, entrypoint), 'process.stdout.write("ready\\n");\n');
  const allowed = manifest({
    runtime: 'electron-node',
    executable: entrypoint,
    executableDigest: hashProviderExecutable('process.stdout.write("ready\\n");\n'),
  });
  await writeFile(join(root, 'provider.json'), `${JSON.stringify(allowed)}\n`);
  const result = await discoverInstalledProviders(root, [{
    id: allowed.id, version: allowed.version, digest: allowed.digest,
  }], { electronExecutable: '/Applications/GateReeve.app/Contents/MacOS/GateReeve' });
  assert.equal(result.providers[0].executable, '/Applications/GateReeve.app/Contents/MacOS/GateReeve');
  assert.deepEqual(result.providers[0].args, [join(root, entrypoint)]);
  assert.deepEqual(result.providers[0].environment, { ELECTRON_RUN_AS_NODE: '1' });
});

function fakeSpawn(lines, { code = 0, signal = null } = {}) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => {};
    queueMicrotask(() => {
      for (const line of lines) child.stdout.write(`${line}\n`);
      child.stdout.end();
      child.emit('close', code, signal);
    });
    return child;
  };
}

test('provider supervisor validates one exact response and rejects stale, duplicate, and crashed peers', async () => {
  const installed = installedProvider();
  const valid = supervisor({ spawn: fakeSpawn([JSON.stringify(response())]) });
  assert.equal((await valid.observe(installed, request())).live.status, 'running');

  const stale = supervisor({
    spawn: fakeSpawn([JSON.stringify(response({ observedInputFingerprint: moduleDigest }))]),
  });
  await assert.rejects(stale.observe(installed, request()), (error) => (
    error.code === 'PROVIDER_MALFORMED_RESPONSE' && /stale/.test(error.message)
  ));
  const duplicate = supervisor({
    spawn: fakeSpawn([JSON.stringify(response()), JSON.stringify(response())]),
  });
  await assert.rejects(duplicate.observe(installed, request()), { code: 'PROVIDER_DUPLICATE_RESPONSE' });
  const crashed = supervisor({ spawn: fakeSpawn([], { code: 2 }) });
  await assert.rejects(crashed.observe(installed, request()), { code: 'PROVIDER_CRASHED' });
});

test('provider supervisor times out and kills an unresponsive peer', async () => {
  let killed = null;
  let timeout;
  const spawn = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = (signal) => { killed = signal; };
    return child;
  };
  const runtime = supervisor({
    spawn,
    setTimer(callback) { timeout = callback; return 1; },
    clearTimer() {},
  });
  const pending = runtime.observe({
    ...installedProvider(),
  }, request());
  await Promise.resolve();
  timeout();
  await assert.rejects(pending, { code: 'PROVIDER_TIMEOUT' });
  assert.equal(killed, 'SIGKILL');
});

test('closing provider supervision kills and rejects every in-flight observation', async () => {
  let killed = null;
  const runtime = supervisor({
    spawn() {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = new PassThrough();
      child.kill = (signal) => { killed = signal; };
      return child;
    },
  });
  const pending = runtime.observe(installedProvider(), request());
  await Promise.resolve();
  runtime.close();
  await assert.rejects(pending, { code: 'PROVIDER_UNAVAILABLE' });
  assert.equal(killed, 'SIGKILL');
  assert.throws(() => runtime.observe(installedProvider(), request()), { code: 'PROVIDER_UNAVAILABLE' });
});

test('provider supervisor rejects entrypoint drift immediately before launch', async () => {
  let spawned = false;
  const runtime = supervisor({
    readExecutable: async () => Buffer.from('changed\n'),
    spawn() { spawned = true; },
  });
  await assert.rejects(runtime.observe(installedProvider(), request()), {
    code: 'PROVIDER_UNAVAILABLE',
    message: 'Provider executable changed after discovery.',
  });
  assert.equal(spawned, false);
});
