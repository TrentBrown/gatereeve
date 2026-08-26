import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const cliRoot = resolve(import.meta.dirname, '..');

async function createCliFixture() {
  const root = await mkdtemp(join(tmpdir(), 'workflow cli integration '));
  const sourceRoot = join(root, 'plugin source');
  const distRoot = join(root, 'plugin output');

  await mkdir(join(sourceRoot, 'shared/skills/example'), { recursive: true });
  await mkdir(join(sourceRoot, 'codex/.codex-plugin'), { recursive: true });
  await mkdir(join(sourceRoot, 'claude/.claude-plugin'), { recursive: true });
  await writeFile(
    join(sourceRoot, 'shared/skills/example/SKILL.md'),
    '---\nname: example\ndescription: Example.\n---\n'
  );
  await writeFile(
    join(sourceRoot, 'codex/.codex-plugin/plugin.json'),
    '{"name":"example","version":"0.0.0"}\n'
  );
  await writeFile(
    join(sourceRoot, 'claude/.claude-plugin/plugin.json'),
    '{"name":"example","version":"0.0.0"}\n'
  );
  await mkdir(join(sourceRoot, 'contracts'), { recursive: true });
  await writeFile(
    join(sourceRoot, 'contracts/workflow-inventory.json'),
    '{"plugin":{"initialVersion":"3.4.5"}}\n'
  );

  return { sourceRoot, distRoot };
}

test('plugin build and clean commands work through the Commander entrypoint', async () => {
  const fixture = await createCliFixture();
  const executable = join(cliRoot, 'bin/workflow.js');

  const build = await execFileAsync(
    process.execPath,
    [
      executable,
      'plugin',
      'build',
      '--source-root',
      fixture.sourceRoot,
      '--dist-root',
      fixture.distRoot,
      '--plugin-version',
      '2.0.0',
      '--source-commit',
      'deadbeef',
      '--json',
    ],
    { cwd: cliRoot }
  );

  let result;
  try {
    result = JSON.parse(build.stdout);
  } catch (error) {
    throw new Error(`Build did not return JSON: ${JSON.stringify(build.stdout)}`, {
      cause: error,
    });
  }
  assert.equal(result.version, '2.0.0');
  assert.deepEqual(
    result.packages.map((item) => item.platform),
    ['codex', 'claude']
  );

  const manifestPath = join(
    fixture.distRoot,
    'codex/.codex-plugin/plugin.json'
  );
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.version, '2.0.0');
  assert.equal(result.packages[0].pluginName, 'example');

  const clean = await execFileAsync(
    process.execPath,
    [
      executable,
      'plugin',
      'clean',
      '--dist-root',
      fixture.distRoot,
      '--json',
    ],
    { cwd: cliRoot }
  );
  assert.deepEqual(JSON.parse(clean.stdout), { removed: fixture.distRoot });
  await assert.rejects(readFile(manifestPath), /ENOENT/);
});

test('uses the selected source root when resolving the default version', async () => {
  const fixture = await createCliFixture();
  const executable = join(cliRoot, 'bin/workflow.js');

  const build = await execFileAsync(
    process.execPath,
    [
      executable,
      'plugin',
      'build',
      '--source-root',
      fixture.sourceRoot,
      '--dist-root',
      fixture.distRoot,
      '--source-commit',
      'deadbeef',
      '--json',
    ],
    { cwd: cliRoot }
  );

  assert.equal(JSON.parse(build.stdout).version, '3.4.5');
});

test('prepares a release through the grouped command path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workflow release command '));
  const executable = join(cliRoot, 'bin/workflow.js');
  const outputRoot = join(root, 'marketplace');
  const prepared = await execFileAsync(
    process.execPath,
    [
      executable,
      'plugin',
      'release',
      'prepare',
      '--tag',
      'v0.1.0-rc.99',
      '--source-commit',
      'deadbeef',
      '--output-root',
      outputRoot,
      '--json',
    ],
    { cwd: cliRoot }
  );
  const result = JSON.parse(prepared.stdout);
  assert.equal(result.sourceTag, 'v0.1.0-rc.99');
  assert.equal(result.sourceCommit, 'deadbeef');
  assert.equal(result.outputRoot, outputRoot);
});

test('renders hierarchical help through QP CLI Core', async () => {
  const executable = join(cliRoot, 'bin/workflow.js');

  const result = await execFileAsync(
    process.execPath,
    [executable, 'help', '--recurse', '3'],
    { cwd: cliRoot }
  );

  assert.match(
    result.stdout,
    /^gatereeve Observe and enforce the GateReeve workflow protocol/m
  );
  assert.match(result.stdout, /status Show authoritative workflow state and blockers/);
  assert.match(result.stdout, /snapshot Show the versioned canonical observational snapshot/);
  assert.match(result.stdout, /read Read one canonical snapshot detail/);
  assert.match(result.stdout, /feature Govern the feature lifecycle/);
  assert.match(result.stdout, /slice Govern sequential delivery slices/);
  assert.match(result.stdout, /gate Record and invalidate PR-boundary evidence/);
  assert.match(result.stdout, /change Govern discoveries that alter approved work/);
  assert.match(result.stdout, /plugin Build and maintain native workflow plugin packages/);
  assert.match(result.stdout, /build Compose native packages/);
  assert.match(result.stdout, /release Publish, observe, and verify native plugin releases/);
  assert.match(result.stdout, /publish Validate, tag, watch, and verify a marketplace release/);
  assert.match(result.stdout, /--next-rc/);
  assert.match(result.stdout, /--promote/);
  assert.match(result.stdout, /--bump <type>/);
  assert.match(
    result.stdout,
    /list List release tags, workflow runs, and deployed marketplace state/
  );
  assert.match(result.stdout, /watch Watch the latest or selected release workflow run/);
  assert.match(result.stdout, /verify Verify a complete remote marketplace deployment/);
  assert.match(result.stdout, /prepare Compose a tag-scoped marketplace tree/);
  assert.doesNotMatch(result.stdout, /release-prepare/);
  assert.doesNotMatch(result.stdout, /^\s{4}migration\b/m);
  assert.doesNotMatch(result.stdout, /^\s+advance\b/m);
  assert.match(result.stdout, /Legend:/);
});
