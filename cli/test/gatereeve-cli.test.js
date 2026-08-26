import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { executePluginRequest } from '../../plugin-src/shared/resources/protocol/plugin-adapter.js';

const execFileAsync = promisify(execFile);
const executable = resolve(import.meta.dirname, '../bin/workflow.js');
const actor = { kind: 'agent', label: 'gatereeve CLI' };

async function cli(arguments_, options = {}) {
  try {
    const result = await execFileAsync(process.execPath, [executable, ...arguments_], options);
    return { status: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      status: error.code,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    };
  }
}

test('optional CLI and plugin adapter produce the same governed projection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve cli parity '));
  const pluginHome = resolve(root, 'plugin feature');
  const cliHome = resolve(root, 'cli feature');
  const recordedAt = '2026-08-25T00:00:00Z';

  await executePluginRequest({
    operation: 'feature.init',
    featureHome: pluginHome,
    featureId: 'parity-feature',
    actor,
    eventId: 'evt-init',
    recordedAt,
  });
  const initialized = await cli([
    'feature',
    'init',
    '--feature-home',
    cliHome,
    '--feature-id',
    'parity-feature',
    '--event-id',
    'evt-init',
    '--recorded-at',
    recordedAt,
    '--json',
  ]);
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.equal(JSON.parse(initialized.stdout).ok, true);

  await executePluginRequest({
    operation: 'feature.transition',
    featureHome: pluginHome,
    transitionId: 'approve-design',
    input: {
      actor: { kind: 'human-confirmed', label: 'user approval' },
      eventId: 'evt-design',
      recordedAt,
    },
  });
  const approved = await cli([
    'feature',
    'approve-design',
    '--feature-home',
    cliHome,
    '--human-confirmed',
    'user approval',
    '--event-id',
    'evt-design',
    '--recorded-at',
    recordedAt,
    '--json',
  ]);
  assert.equal(approved.status, 0, approved.stderr);

  const pluginStatus = await executePluginRequest({ operation: 'status', featureHome: pluginHome });
  const cliStatus = await cli(['status', '--feature-home', cliHome, '--json']);
  const cliEnvelope = JSON.parse(cliStatus.stdout);
  assert.equal(cliEnvelope.ok, true);
  assert.deepEqual(cliEnvelope.data.projection, pluginStatus.data.projection);
});

test('queries do not mutate and check alone uses binary failure exit semantics', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve cli query '));
  const featureHome = resolve(root, 'feature');
  await executePluginRequest({
    operation: 'feature.init',
    featureHome,
    featureId: 'query-feature',
    actor,
    eventId: 'evt-init',
  });
  await executePluginRequest({
    operation: 'feature.pause',
    featureHome,
    input: { actor, reason: 'test blocker', eventId: 'evt-pause' },
  });
  const journal = resolve(featureHome, 'events.jsonl');
  const before = await readFile(journal, 'utf8');

  for (const arguments_ of [
    ['status', '--feature-home', featureHome, '--json'],
    ['next', '--feature-home', featureHome, '--json'],
    ['history', '--feature-home', featureHome, '--json'],
    ['graph', '--feature-home', featureHome, '--json'],
  ]) {
    const result = await cli(arguments_);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).ok, true);
  }
  assert.equal(await readFile(journal, 'utf8'), before);

  const failed = await cli(['check', 'not-blocked', '--feature-home', featureHome, '--json']);
  assert.equal(failed.status, 1);
  const envelope = JSON.parse(failed.stdout);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'CHECK_FAILED');
  assert.equal(await readFile(journal, 'utf8'), before);
});

test('rejected mutations return the stable envelope and append no event', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve cli rejection '));
  const featureHome = resolve(root, 'feature');
  await executePluginRequest({
    operation: 'feature.init',
    featureHome,
    featureId: 'rejection-feature',
    actor,
    eventId: 'evt-init',
  });
  const journal = resolve(featureHome, 'events.jsonl');
  const before = await readFile(journal, 'utf8');

  const rejected = await cli([
    'feature',
    'approve-design',
    '--feature-home',
    featureHome,
    '--json',
  ]);
  assert.equal(rejected.status, 1);
  const envelope = JSON.parse(rejected.stdout);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.command, 'feature.transition');
  assert.equal(envelope.error.code, 'TRANSITION_REJECTED');
  assert.equal(await readFile(journal, 'utf8'), before);
});

test('public command tree retains maintainer namespaces without force passage', async () => {
  const result = await cli(['help', '--recurse', '3']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^gatereeve Observe and enforce/m);
  assert.match(result.stdout, /^\s+plugin Build and maintain/m);
  assert.match(result.stdout, /^\s+release Publish, observe, and verify/m);
  assert.doesNotMatch(result.stdout, /^\s+advance\b/m);

  for (const family of ['feature', 'slice', 'boundary', 'gate', 'change']) {
    const help = await cli([family, '--help']);
    assert.equal(help.status, 0, help.stderr);
    assert.doesNotMatch(help.stdout, /--force/);
    assert.doesNotMatch(help.stdout, /^\s+advance\b/m);
  }
});
