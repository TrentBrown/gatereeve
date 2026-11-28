import './helpers/private-scratch.js';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { main } from '../../plugin-src/shared/resources/code-health/cli.js';
import { initCodeHealth, renderInit } from '../../plugin-src/shared/resources/code-health/init.js';
import { runCodeHealth } from '../../plugin-src/shared/resources/code-health/run.js';
import { parseToml } from '../../plugin-src/shared/resources/code-health/process.js';
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

test('init adapts to a JavaScript-only repository and to existing lint configs', async () => {
  const root = repository({ 'index.mjs': 'export {};\n', 'eslint.config.js': 'export default [];\n' });
  const report = await initCodeHealth({ cwd: root, preset: 'moderate' });
  assert.deepEqual(report.languages, { javascript: true, python: false });
  assert.ok(!report.written.includes('ruff.toml'));
  assert.ok(!report.written.some(path => path.includes('ruff_s110')));
  assert.ok(!report.written.includes('eslint.config.mjs'));
  assert.match(report.notes.join('\n'), /ESLint config already exists/);
  const plugin = await parseToml(read(root, '.habit-hooks/gatereeve/config.toml'));
  assert.deepEqual(plugin.sensors, []);
  assert.ok(!('detectors' in plugin));
  assert.deepEqual((await parseToml(read(root, '.habit-hooks/config.toml'))).plugins, ['gatereeve', 'typescript', 'generic']);
});

test('init output satisfies the wrapper plugin check and is itself a governed change to approve', async () => {
  const root = repository({ 'src/app.js': 'export const a = 1;\n', '.gitignore': 'node_modules\n' });
  await initCodeHealth({ cwd: root, preset: 'moderate' });
  // The typescript plugin's tools, as installed project dependencies.
  for (const name of ['eslint', 'knip', 'ts-morph']) write(root, { [`node_modules/${name}/package.json`]: '{"version":"0.0.0"}\n' });
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
