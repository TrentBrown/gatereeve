import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const cliRoot = resolve(import.meta.dirname, '..');
const executable = join(cliRoot, 'bin/workflow.js');

function sharedArguments(runId, recordedAt) {
  return [
    '--run-id', runId,
    '--repository', 'TrentBrown/gatereeve',
    '--workflow-ref',
    'TrentBrown/gatereeve/.github/workflows/release-conductor.yml@refs/heads/main',
    '--actor', 'github-actions[bot]',
    '--recorded-at', recordedAt,
  ];
}

test('CLI appends and inspects immutable conductor bundles', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'gatereeve-conductor-cli-'));
  try {
    const initialEvidence = join(temporary, 'initial.json');
    const pendingEvidence = join(temporary, 'pending.json');
    const initialBundle = join(temporary, 'initial-bundle');
    const pendingBundle = join(temporary, 'pending-bundle');
    await writeFile(initialEvidence, '{"version":"0.1.0-rc.9"}\n');
    await writeFile(pendingEvidence, '{"preparationArtifact":"coordinated-plugin-candidate"}\n');

    const initialized = await execFileAsync(process.execPath, [
      executable,
      'plugin', 'release', 'conductor', 'advance',
      '--stage', 'INITIALIZED',
      '--tag', 'v0.1.0-rc.9',
      '--source-commit', 'a'.repeat(40),
      '--evidence-file', initialEvidence,
      ...sharedArguments('401', '2026-09-02T00:01:00.000Z'),
      '--output-dir', initialBundle,
      '--json',
    ], { cwd: cliRoot });
    const initial = JSON.parse(initialized.stdout);
    assert.equal(initial.status.stage, 'INITIALIZED');

    const advanced = await execFileAsync(process.execPath, [
      executable,
      'plugin', 'release', 'conductor', 'advance',
      '--stage', 'TRUST_PENDING',
      '--previous-chain', join(initialBundle, 'release-state-chain.json'),
      '--evidence-file', pendingEvidence,
      ...sharedArguments('401', '2026-09-02T00:02:00.000Z'),
      '--output-dir', pendingBundle,
      '--json',
    ], { cwd: cliRoot });
    const pending = JSON.parse(advanced.stdout);
    assert.equal(pending.status.stage, 'TRUST_PENDING');
    assert.equal(pending.status.nextAction, 'APPROVE_TRUST');
    assert.equal(
      pending.artifactName,
      'gatereeve-v0.1.0-rc.9-release-conductor-0002-trust-pending',
    );

    const inspection = await execFileAsync(process.execPath, [
      executable,
      'plugin', 'release', 'conductor', 'inspect',
      '--bundle', pendingBundle,
      '--json',
    ], { cwd: cliRoot });
    assert.deepEqual(JSON.parse(inspection.stdout), pending.status);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('CLI rejects identity arguments after initialization', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'gatereeve-conductor-cli-'));
  try {
    const evidence = join(temporary, 'evidence.json');
    const initialBundle = join(temporary, 'initial-bundle');
    await writeFile(evidence, '{"version":"0.1.0-rc.9"}\n');
    await execFileAsync(process.execPath, [
      executable,
      'plugin', 'release', 'conductor', 'advance',
      '--stage', 'INITIALIZED',
      '--tag', 'v0.1.0-rc.9',
      '--source-commit', 'a'.repeat(40),
      '--evidence-file', evidence,
      ...sharedArguments('402', '2026-09-02T00:01:00.000Z'),
      '--output-dir', initialBundle,
    ], { cwd: cliRoot });
    await assert.rejects(execFileAsync(process.execPath, [
      executable,
      'plugin', 'release', 'conductor', 'advance',
      '--stage', 'TRUST_PENDING',
      '--previous-chain', join(initialBundle, 'release-state-chain.json'),
      '--tag', 'v0.1.0-rc.9',
      '--evidence-file', evidence,
      ...sharedArguments('402', '2026-09-02T00:02:00.000Z'),
      '--output-dir', join(temporary, 'invalid'),
    ], { cwd: cliRoot }), /accepted only for INITIALIZED/u);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('CLI discovers a downloaded conductor bundle without operator-supplied run identity', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'gatereeve-conductor-discover-'));
  try {
    await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: temporary });
    await execFileAsync('git', ['config', 'user.name', 'GateReeve test'], { cwd: temporary });
    await execFileAsync('git', ['config', 'user.email', 'test@gatereeve.invalid'], { cwd: temporary });
    await writeFile(join(temporary, 'source.txt'), 'release source\n');
    await execFileAsync('git', ['add', 'source.txt'], { cwd: temporary });
    await execFileAsync('git', ['commit', '-m', 'test: seed release source'], { cwd: temporary });
    const source = (await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: temporary,
    })).stdout.trim();
    const evidence = join(temporary, 'evidence.json');
    const bundle = join(temporary, 'bundle');
    const artifacts = join(temporary, 'artifacts.json');
    const outputChain = join(temporary, 'discovered-chain.json');
    await writeFile(evidence, '{"version":"0.1.0-rc.9"}\n');
    const initialized = await execFileAsync(process.execPath, [
      executable,
      'plugin', 'release', 'conductor', 'advance',
      '--stage', 'INITIALIZED',
      '--tag', 'v0.1.0-rc.9',
      '--source-commit', source,
      '--evidence-file', evidence,
      ...sharedArguments('501', '2026-09-02T00:01:00.000Z'),
      '--output-dir', bundle,
      '--json',
    ], { cwd: temporary });
    const state = JSON.parse(initialized.stdout);
    await writeFile(artifacts, `${JSON.stringify([{
      id: 601,
      name: state.artifactName,
      expired: false,
      bundlePath: bundle,
      workflowRun: {
        id: 501,
        headSha: source,
        headBranch: 'main',
        event: 'workflow_dispatch',
        path: '.github/workflows/release-conductor.yml',
        conclusion: 'success',
      },
    }])}\n`);

    const discovered = await execFileAsync(process.execPath, [
      executable,
      'plugin', 'release', 'conductor', 'discover',
      '--tag', 'v0.1.0-rc.9',
      '--artifacts-file', artifacts,
      '--output-chain', outputChain,
      '--json',
    ], { cwd: temporary });
    const result = JSON.parse(discovered.stdout);
    assert.equal(result.status.stage, 'INITIALIZED');
    assert.equal(result.latestArtifact.id, 601);
    assert.equal(JSON.parse(await readFile(outputChain, 'utf8')).length, 1);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
