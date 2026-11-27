import './helpers/private-scratch.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runCodeHealth } from '../../plugin-src/shared/resources/code-health/run.js';
import { renderText } from '../../plugin-src/shared/resources/code-health/render.js';
import { stringifyToml } from '../../plugin-src/shared/resources/code-health/process.js';
import { parseToml, TomlError } from '../../plugin-src/shared/resources/code-health/toml.js';
import { commit, fakeTools, fixtureRepository, read, write } from './helpers/code-health-fixture.js';

const tools = fakeTools();
const cache = join(tools.directory, 'cache');

function check(root, options = {}) {
  const env = { ...process.env, GATEREEVE_CODE_HEALTH_CACHE: cache, ...options.env };
  return runCodeHealth({ cwd: root, base: 'main', habitSensors: tools.sensors, habitMapper: tools.mapper, useCache: false, ...options, env });
}

test('a missing tool is found even when the change touches no file of that language', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'x\n', 'src/b.py': 'y = 1\n' } });
  write(root, { 'README.md': 'docs only\n' });
  commit(root, 'docs');
  const log = join(tools.directory, `probe-${Date.now()}.jsonl`);
  const clean = await check(root, { env: { FAKE_SENSORS_LOG: log } });
  assert.equal(clean.verdict, 'PASS');
  assert.deepEqual(clean.scope.files, []);
  assert.deepEqual([...clean.scope.probes].sort(), ['src/a.js', 'src/b.py']);
  assert.deepEqual(JSON.parse(readFileSync(log, 'utf8').trim()).files.sort(), ['src/a.js', 'src/b.py']);
  const broken = await check(root, { env: { FAKE_SENSORS_MODE: 'incomplete' } });
  assert.equal(broken.verdict, 'UNAVAILABLE');
  assert.equal(broken.reasons[0].cause, 'incomplete-run');
  const crashed = await check(root, { env: { FAKE_SENSORS_MODE: 'crash' } });
  assert.equal(crashed.verdict, 'UNAVAILABLE', 'an uninstalled plugin makes habit-sensors fail');
  assert.match(crashed.reasons[0].remedy, /opt-out-code-health/);
});

test('probe findings never enter the comparison', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'x\n', 'src/legacy.py': 'SMELL:high-complexity:ruff:C901\n' } });
  write(root, { 'src/a.js': 'y\n' });
  commit(root, 'js only');
  const result = await check(root);
  assert.equal(result.verdict, 'PASS');
  assert.deepEqual(result.scope.probes, ['src/legacy.py']);
  assert.equal(result.findings.preExisting.length + result.findings.advisory.length, 0);
});

test('a failing habit-mapper keeps the FAIL and says coaching is missing', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'SMELL:oversized-function:eslint:x\n' } });
  write(root, { 'src/a.js': 'SMELL:oversized-function:eslint:x\nSMELL:oversized-function:eslint:x\n' });
  commit(root, 'regression');
  const result = await check(root, { env: { FAKE_MAPPER_MODE: 'crash' } });
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.coaching, '');
  assert.equal(result.reasons[0].cause, 'coaching-failed');
  assert.match(renderText(result), /habit-mapper could not render coaching/);
});

test('effective ESLint thresholds come from the resolved tool and tool versions key the cache', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'SMELL:oversized-function:eslint:x\n' } });
  write(root, { 'src/a.js': 'SMELL:oversized-function:eslint:x\n// touched\n' });
  commit(root, 'touch');
  const env = { PATH: `${tools.eslintDirectory}${delimiter}${process.env.PATH}`, GATEREEVE_CODE_HEALTH_CACHE: join(tools.directory, `cache-tools-${Date.now()}`) };
  const first = await check(root, { useCache: true, env });
  assert.deepEqual(first.thresholds.eslint, { functionLines: 40, parameters: 5, complexity: 15, depth: 4, fileLines: 500 });
  assert.equal(first.tools.eslint, 'v9.0.0');
  assert.equal(first.tools.wrapper, 'gatereeve-code-health/3');
  assert.equal(first.tools.habitSensors, 'habit-sensors 9.9.9-fake');
  assert.equal((await check(root, { useCache: true, env })).cache.hit, true);
  const upgraded = await check(root, { useCache: true, env: { ...env, FAKE_ESLINT_VERSION: '10.0.0' } });
  assert.equal(upgraded.cache.hit, false, 'a changed analyser version never reuses the old baseline');
  assert.match(renderText(first), /ESLint functionLines=40 parameters=5 complexity=15 depth=4 fileLines=500/);
});

test('a governed symlink is replaced in the base worktree, never written through', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'x\n', '.gitignore': 'node_modules\n' } });
  write(root, { 'node_modules/shared/eslint.config.js': 'ORIGINAL\n' });
  rmSync(join(root, 'eslint.config.js'));
  symlinkSync('node_modules/shared/eslint.config.js', join(root, 'eslint.config.js'));
  commit(root, 'config becomes a symlink');
  const subject = (await check(root)).governed.subject;
  write(root, { 'src/a.js': 'y\n' });
  commit(root, 'change source');
  const result = await check(root, { approved: [subject] });
  assert.equal(result.verdict, 'PASS', JSON.stringify(result.reasons));
  assert.equal(read(root, 'node_modules/shared/eslint.config.js'), 'ORIGINAL\n');
});

test('package-local node_modules are linked into the worktrees', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'x\n', 'pkg/package.json': '{}\n', '.gitignore': 'node_modules\n' } });
  write(root, { 'pkg/node_modules/marker': 'here\n', 'src/a.js': 'y\n' });
  commit(root, 'change');
  const log = join(tools.directory, `nested-${Date.now()}.jsonl`);
  await check(root, { env: { FAKE_SENSORS_LOG: log } });
  const runs = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.ok(runs.length >= 2 && runs.every(run => run.nested));
});

test('gatereeve code-health keeps the exit contract through the CLI', () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'SMELL:oversized-function:eslint:x\n' } });
  write(root, { 'src/a.js': 'SMELL:oversized-function:eslint:x\nSMELL:oversized-function:eslint:x\n' });
  commit(root, 'regression');
  const bin = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'workflow.js');
  const env = { ...process.env, GATEREEVE_CODE_HEALTH_CACHE: cache };
  const cli = args => spawnSync(process.execPath, [bin, 'code-health', ...args], { env, encoding: 'utf8' });
  const tool = ['--habit-sensors', tools.sensors, '--habit-mapper', tools.mapper, '--no-cache'];
  const failed = cli(['run', '--base', 'main', '--cwd', root, '--json', ...tool]);
  assert.equal(failed.status, 1, failed.stderr);
  assert.equal(JSON.parse(failed.stdout).verdict, 'FAIL');
  assert.equal(cli(['--base', 'main', '--cwd', root, ...tool]).status, 1);
  const outside = mkdtempSync(join(tools.directory, 'not-git-'));
  const unavailable = cli(['run', '--base', 'main', '--cwd', outside, '--json', ...tool]);
  assert.equal(unavailable.status, 2, unavailable.stderr);
  assert.equal(JSON.parse(unavailable.stdout).reasons[0].cause, 'internal-error');
  assert.equal(cli(['run']).status, 2);
  assert.equal(cli(['--help']).status, 0);
});

test('the TOML reader handles the configuration shapes the wrapper reads', () => {
  const text = [
    '# comment',
    'plugins = ["a", \'b\',] # trailing',
    'files = [',
    '  "**/*.js", # one',
    '  "!**/test/**",',
    ']',
    'nested.key = 1_000',
    '[smells."@typescript-eslint/no-floating-promises"]',
    'severity = "enforced"',
    '[tool.ruff.lint.pylint]',
    'max-args = 5',
    '[[tool.list]]',
    'n = 1',
    '[[tool.list]]',
    'n = 2',
    '[project]',
    'description = """',
    'multi "quoted" line"""',
    "path = 'C:\\raw'",
    'inline = { a = true, b.c = 1.5 }',
    'when = 1979-05-27T07:32:00Z',
    '',
  ].join('\n');
  const parsed = parseToml(text);
  assert.deepEqual(parsed.plugins, ['a', 'b']);
  assert.deepEqual(parsed.files, ['**/*.js', '!**/test/**']);
  assert.equal(parsed.nested.key, 1000);
  assert.equal(parsed.smells['@typescript-eslint/no-floating-promises'].severity, 'enforced');
  assert.equal(parsed.tool.ruff.lint.pylint['max-args'], 5);
  assert.deepEqual(parsed.tool.list, [{ n: 1 }, { n: 2 }]);
  assert.equal(parsed.project.description, 'multi "quoted" line');
  assert.equal(parsed.project.path, 'C:\\raw');
  assert.deepEqual(parsed.project.inline, { a: true, b: { c: 1.5 } });
  assert.equal(parsed.project.when, '1979-05-27T07:32:00Z');
  for (const bad of ['a = 1\na = 2', 'a = "open', '[a]\nb = 1\n[a.b]', 'a = nope']) assert.throws(() => parseToml(bad), TomlError, bad);
  const value = { plugins: ['a'], smells: { 'x/y': { severity: 'enforced' } } };
  assert.deepEqual(parseToml(stringifyToml(value)), value);
});

test('round 2: prototype keys, vendored plugin, reported paths and probe parse errors', async () => {
  const parsed = parseToml('[__proto__]\ndisabled = true\n[smells.__proto__]\nseverity = "suggested"\n');
  assert.equal(({}).disabled, undefined, 'Object.prototype is untouched');
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
  assert.deepEqual(Object.keys(parsed), ['__proto__', 'smells']);

  const noVendored = fixtureRepository({ files: { 'src/a.js': 'x\n' } });
  rmSync(join(noVendored, '.habit-hooks', 'gatereeve'), { recursive: true });
  commit(noVendored, 'drop vendored plugin');
  const missing = await check(noVendored, { base: 'HEAD' });
  assert.equal(missing.reasons[0]?.cause, 'plugin-not-configured');
  assert.match(missing.reasons[0].message, /vendored plugin \.habit-hooks\/gatereeve\/ is not committed/);

  for (const mode of ['dotslash', 'absolute']) {
    const root = fixtureRepository({ files: { 'src/a.js': 'SMELL:oversized-function:eslint:x\n' } });
    write(root, { 'src/a.js': 'SMELL:oversized-function:eslint:x\nSMELL:oversized-function:eslint:x\n' });
    commit(root, 'regression');
    const result = await check(root, { env: { FAKE_SENSORS_MODE: mode } });
    assert.equal(result.verdict, 'FAIL', mode);
    assert.deepEqual(result.groups.map(group => [group.file, group.base, group.head]), [['src/a.js', 1, 2]], mode);
  }

  const probeBroken = fixtureRepository({ files: { 'src/a.js': 'x\n', 'src/legacy.py': 'PARSE_ERROR\n' } });
  write(probeBroken, { 'src/a.js': 'y\n' });
  commit(probeBroken, 'js only');
  const probed = await check(probeBroken, { env: { FAKE_SENSORS_MODE: 'parse' } });
  assert.equal(probed.verdict, 'PASS', 'a parse error in an untouched probe file does not block the change');
});

test.after(() => rmSync(tools.directory, { recursive: true, force: true }));
