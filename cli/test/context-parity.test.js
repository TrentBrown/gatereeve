import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  resolveWorkflowContext,
} from '../../plugin-src/shared/resources/protocol/context.js';

const execute = promisify(execFile);
const contextScript = resolve(
  import.meta.dirname,
  '../../plugin-src/shared/resources/scripts/workflow_context.py'
);

async function pythonContext(cwd, repository = null) {
  const args = [contextScript, 'resolve', '--cwd', cwd, '--json'];
  if (repository !== null) args.push('--repository', repository);
  const result = await execute('python3', args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(result.stdout);
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

test('JavaScript and Python resolve the same configured multi-repository context', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'gatereeve context parity '));
  const nested = join(workspace, 'client', 'src', 'nested');
  await mkdir(nested, { recursive: true });
  await mkdir(join(workspace, 'services', 'backend'), { recursive: true });
  await writeJson(join(workspace, '.agentic-workflow.json'), {
    schemaVersion: 1,
    featureId: 'tb-1234-context-parity',
    externalTask: {
      id: '1234',
      url: 'https://tracker.example/tasks/1234',
    },
    repositories: {
      workspace: {
        path: '.',
        remote: 'origin',
        integrationBranch: 'main',
        featureBaseSha: 'A'.repeat(40),
      },
      client: {
        path: 'client',
        remote: 'origin',
        integrationBranch: 'development-client',
      },
      backend: {
        path: 'services/backend',
        remote: 'upstream',
        integrationBranch: 'development-backend',
      },
    },
  });

  assert.deepEqual(
    await resolveWorkflowContext({
      cwd: nested,
      environment: { PATH: '/finder-does-not-expose-tools' },
      exec: async () => {
        throw new Error('configured context resolution must not execute a subprocess');
      },
    }),
    await pythonContext(nested)
  );
  assert.deepEqual(
    await resolveWorkflowContext({ cwd: workspace, repository: 'backend' }),
    await pythonContext(workspace, 'backend')
  );
});

test('JavaScript and Python preserve the same legacy branch-derived context', async () => {
  const repository = await mkdtemp(join(tmpdir(), 'gatereeve legacy context '));
  await execute('git', ['-C', repository, 'init']);
  await execute('git', ['-C', repository, 'checkout', '-b', 'developer/context-parity']);
  const nested = join(repository, 'src');
  await mkdir(nested);

  assert.deepEqual(
    await resolveWorkflowContext({ cwd: nested }),
    await pythonContext(nested)
  );
});

test('JavaScript preserves Python workspace semantics for a symlinked config file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve symlinked context '));
  const workspace = join(root, 'workspace');
  const configTarget = join(root, 'config-target.json');
  await mkdir(workspace);
  await writeJson(configTarget, {
    schemaVersion: 1,
    featureId: 'symlinked-context',
    repositories: {
      product: { path: '.', integrationBranch: 'main' },
    },
  });
  await symlink(configTarget, join(workspace, '.agentic-workflow.json'));

  assert.deepEqual(
    await resolveWorkflowContext({ cwd: workspace }),
    await pythonContext(workspace)
  );
});

test('JavaScript rejects the same unsafe configured contexts as Python', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'gatereeve invalid context '));
  const cases = [
    {
      expected: /schemaVersion/u,
      value: { schemaVersion: 2, featureId: 'feature', repositories: {} },
    },
    {
      expected: /featureId/u,
      value: {
        schemaVersion: 1,
        featureId: 'bad feature',
        repositories: {
          product: { path: '.', integrationBranch: 'main' },
        },
      },
    },
    {
      expected: /escapes/u,
      value: {
        schemaVersion: 1,
        featureId: 'feature',
        repositories: {
          product: { path: '../outside', integrationBranch: 'main' },
        },
      },
    },
    {
      expected: /featureBaseSha/u,
      value: {
        schemaVersion: 1,
        featureId: 'feature',
        repositories: {
          product: {
            path: '.',
            integrationBranch: 'main',
            featureBaseSha: 'not-an-object-id',
          },
        },
      },
    },
  ];

  for (const fixture of cases) {
    await writeJson(join(workspace, '.agentic-workflow.json'), fixture.value);
    await assert.rejects(resolveWorkflowContext({ cwd: workspace }), fixture.expected);
    await assert.rejects(pythonContext(workspace), fixture.expected);
  }
});
