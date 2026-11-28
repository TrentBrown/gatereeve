import './helpers/private-scratch.js';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { main } from '../../plugin-src/shared/resources/code-health/cli.js';
import { initCodeHealth, renderInit } from '../../plugin-src/shared/resources/code-health/init.js';
import { runCodeHealth } from '../../plugin-src/shared/resources/code-health/run.js';
import { parseToml, selector } from '../../plugin-src/shared/resources/code-health/process.js';
import { commit, fakeTools, gitIn, read, write } from './helpers/code-health-fixture.js';

function repository(files) {
  const root = mkdtempSync(join(tmpdir(), 'gatereeve-code-health-init-'));
  gitIn(root, 'init', '-q', '-b', 'main');
  write(root, files);
  commit(root, 'project');
  return root;
}

test('init writes the moderate preset for JavaScript and Python and never overwrites', async () => {
  const root = repository({ 'src/app.js': 'export const a = 1;\n', 'tool/run.py': 'print(1)\n' });
  const report = await initCodeHealth({ cwd: root, preset: 'moderate' });
  assert.deepEqual(report.languages, { javascript: true, python: true });
  for (const path of ['.habit-hooks/config.toml', '.habit-hooks/gatereeve/config.toml', '.habit-hooks/gatereeve/sensors/ruff-s110.toml',
    '.habit-hooks/gatereeve/sensors/ruff_s110.py', '.habit-hooks/gatereeve/guides/floating-promise.md', 'eslint.config.mjs', 'tsconfig.json', 'ruff.toml']) {
    assert.ok(report.written.includes(path), path);
  }
  const config = await parseToml(read(root, '.habit-hooks/config.toml'));
  assert.deepEqual(config.plugins, ['gatereeve', 'typescript', 'python', 'generic']);
  for (const glob of ['**/*.cjs', '**/*.py', '!**/test/**', '!**/*.test.*']) assert.ok(config.files.includes(glob), glob);
  for (const smell of ['@typescript-eslint/no-floating-promises', '@typescript-eslint/no-misused-promises', 'swallowed-exception']) {
    assert.equal(config.smells[smell].severity, 'enforced', smell);
  }
  const eslint = read(root, 'eslint.config.mjs');
  for (const rule of [/'max-lines-per-function': \['error', \{ max: 40/, /'max-params': \['error', 5\]/, /complexity: \['error', 15\]/, /'max-depth': \['error', \{ max: 4 \}\]/, /'max-lines': \['error', \{ max: 500/, /no-floating-promises/, /no-misused-promises/, /package: 'node:test'/]) {
    assert.match(eslint, rule);
  }
  const tsconfig = JSON.parse(read(root, 'tsconfig.json'));
  assert.equal(tsconfig.compilerOptions.allowJs, true);
  assert.equal(tsconfig.compilerOptions.checkJs, true);
  for (const glob of ['**/*.js', '**/*.mjs', '**/*.cjs', '**/*.ts', '**/*.tsx']) assert.ok(tsconfig.include.includes(glob), glob);
  const ruff = await parseToml(read(root, 'ruff.toml'));
  assert.deepEqual([ruff.lint.mccabe['max-complexity'], ruff.lint.pylint['max-args'], ruff.lint.pylint['max-statements']], [15, 5, 40]);
  assert.deepEqual((await parseToml(read(root, '.habit-hooks/gatereeve/config.toml'))).sensors, ['ruff-s110']);
  const text = renderInit(report);
  assert.match(text, /npm install --save-dev eslint typescript typescript-eslint/);
  assert.match(text, /pip install habit-hooks .*habit-hooks-python ruff deptry/);
  assert.match(text, /approve-code-health-config/);

  write(root, { 'eslint.config.mjs': '// mine\n' });
  const again = await initCodeHealth({ cwd: root, preset: 'moderate' });
  assert.deepEqual(again.written, []);
  assert.ok(again.existing.includes('.habit-hooks/config.toml'));
  assert.match(again.notes.join('\n'), /ESLint config already exists/);
  assert.equal(read(root, 'eslint.config.mjs'), '// mine\n');
});

test('init writes the full preset on an empty repository, so files added later are covered (R9)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gatereeve-code-health-init-'));
  gitIn(root, 'init', '-q', '-b', 'main');
  const report = await initCodeHealth({ cwd: root, preset: 'moderate' });
  assert.deepEqual(report.languages, { javascript: false, python: false });
  for (const path of ['.habit-hooks/config.toml', '.habit-hooks/gatereeve/config.toml', '.habit-hooks/gatereeve/sensors/ruff-s110.toml',
    '.habit-hooks/gatereeve/sensors/ruff_s110.py', 'eslint.config.mjs', 'tsconfig.json', 'ruff.toml']) {
    assert.ok(report.written.includes(path), path);
  }
  const config = await parseToml(read(root, '.habit-hooks/config.toml'));
  assert.deepEqual(config.plugins, ['gatereeve', 'typescript', 'python', 'generic']);
  for (const glob of ['**/*.js', '**/*.cjs', '**/*.ts', '**/*.py']) assert.ok(config.files.includes(glob), glob);
  assert.deepEqual(config.sensors.ruff.files, ['**/*.py', '**/*.pyi'], 'Ruff never sees JavaScript');
  assert.ok(config.sensors.eslint.files.includes('**/*.cjs'));
  assert.deepEqual((await parseToml(read(root, '.habit-hooks/gatereeve/config.toml'))).sensors, ['ruff-s110']);
  assert.match(renderInit(report), /detected: no language yet/);
  assert.match(renderInit(report), /npm install --save-dev eslint/);
});

test('init leaves existing lint and TypeScript configs alone and says what to add (CH-S2-03)', async () => {
  const root = repository({ 'index.mjs': 'export {};\n', 'eslint.config.js': 'export default [];\n', 'tsconfig.json': '{}\n', 'ruff.toml': '\n' });
  const report = await initCodeHealth({ cwd: root, preset: 'moderate' });
  assert.deepEqual(report.languages, { javascript: true, python: false });
  for (const path of ['eslint.config.mjs', 'tsconfig.json', 'ruff.toml']) assert.ok(!report.written.includes(path), path);
  const notes = report.notes.join('\n');
  assert.match(notes, /ESLint config already exists/);
  assert.match(notes, /tsconfig\.json already exists; make sure it sets allowJs, checkJs and noEmit/);
  assert.match(notes, /Ruff config already exists/);
  assert.equal(read(root, 'tsconfig.json'), '{}\n');
});

test('dot-files, dot-directories and minified files are outside the scan, as they are outside the TypeScript program (CH-S2-02, CH-S3-01)', async () => {
  const root = repository({ 'src/a.js': 'x\n' });
  await initCodeHealth({ cwd: root, preset: 'moderate' });
  const scoped = selector((await parseToml(read(root, '.habit-hooks/config.toml'))).files);
  for (const path of ['.prettierrc.js', 'src/.build-helper.ts', '.mocharc.cjs', '.github/actions/x/index.js', 'site/.storybook/main.js', '.habit-hooks/gatereeve/sensors/ruff_s110.py', 'vendor/lib.min.js']) assert.equal(scoped(path), false, path);
  for (const path of ['src/a.js', 'tool/run.py', 'scripts/smoke.cjs']) assert.equal(scoped(path), true, path);
});

test('init output satisfies the wrapper plugin check and is itself a governed change to approve', async () => {
  const root = repository({ 'src/app.js': 'export const a = 1;\n', '.gitignore': 'node_modules\n' });
  await initCodeHealth({ cwd: root, preset: 'moderate' });
  // The typescript plugin's tools, as installed project dependencies.
  for (const name of ['eslint', 'knip', 'ts-morph']) write(root, { [`node_modules/${name}/package.json`]: '{"version":"0.0.0"}\n' });
  // and the python plugin's, as executables in the project's .venv.
  write(root, { '.gitignore': 'node_modules\n.venv\n' });
  for (const name of ['ruff', 'deptry']) {
    write(root, { [`.venv/bin/${name}`]: '#!/bin/sh\necho 0.0.0\n' });
    chmodSync(join(root, '.venv', 'bin', name), 0o755);
  }
  commit(root, 'set up code health');
  gitIn(root, 'checkout', '-q', '-b', 'feature');
  write(root, { 'src/app.js': 'export const a = 2;\n' });
  commit(root, 'change');
  const tools = fakeTools();
  try {
    const env = { ...process.env, GATEREEVE_CODE_HEALTH_CACHE: join(tools.directory, 'cache') };
    const options = { cwd: root, base: 'main~1', habitSensors: tools.sensors, habitMapper: tools.mapper, useCache: false, env };
    const blocked = await runCodeHealth(options);
    assert.equal(blocked.verdict, 'UNAVAILABLE');
    assert.equal(blocked.reasons[0].cause, 'unapproved-config');
    assert.ok(blocked.governed.changes.some(change => change.path === '.habit-hooks/config.toml' && change.base === null));
    assert.ok(blocked.governed.changes.some(change => change.path === 'eslint.config.mjs'));
    assert.ok(blocked.governed.changes.some(change => change.path === 'tsconfig.json'));
    assert.equal((await runCodeHealth({ ...options, approved: [blocked.governed.subject] })).verdict, 'PASS');
    assert.equal((await runCodeHealth({ ...options, base: 'main' })).verdict, 'PASS', 'once the setup is on the base, ordinary changes need no approval');
  } finally {
    rmSync(tools.directory, { recursive: true, force: true });
  }
});

test('init CLI argument handling', async () => {
  const root = repository({ 'a.py': 'x = 1\n' });
  const sink = { write() {} };
  assert.equal(await main(['init', '--cwd', root], { stdout: sink, stderr: sink }), 2);
  assert.equal(await main(['init', '--preset', 'strict', '--cwd', root], { stdout: sink, stderr: sink }), 2);
  let out = '';
  assert.equal(await main(['init', '--preset', 'moderate', '--cwd', root, '--json'], { stdout: { write: text => { out += text; } }, stderr: sink }), 0);
  assert.deepEqual(JSON.parse(out).languages, { javascript: false, python: true });
});

test('gatereeve code-health init runs through the CLI command (CH-S2-04)', () => {
  const root = repository({ 'a.py': 'x = 1\n' });
  const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'workflow.js');
  const result = spawnSync(process.execPath, [cli, 'code-health', 'init', '--preset', 'moderate', '--cwd', root, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(JSON.parse(result.stdout).written.includes('.habit-hooks/config.toml'));
  assert.equal(spawnSync(process.execPath, [cli, 'code-health', 'init', '--preset', 'strict', '--cwd', root], { encoding: 'utf8' }).status, 2);
});
