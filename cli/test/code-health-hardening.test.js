import './helpers/private-scratch.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runCodeHealth } from '../../plugin-src/shared/resources/code-health/run.js';
import { renderText } from '../../plugin-src/shared/resources/code-health/render.js';
import { stringifyToml } from '../../plugin-src/shared/resources/code-health/process.js';
import { parseToml, TomlError } from '../../plugin-src/shared/resources/code-health/toml.js';
import { BASE_CONFIG, commit, fakeTools, fixtureRepository, gitIn, read, write } from './helpers/code-health-fixture.js';

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
  assert.equal(first.tools.wrapper, 'gatereeve-code-health/7');
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

test('round 3: malformed issues, a symlinked run-config path, and tools checked with nothing in scope', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'SMELL:oversized-function:eslint:x\n' } });
  write(root, { 'src/a.js': 'SMELL:oversized-function:eslint:x\n// touched\n' });
  commit(root, 'touch');
  const malformed = await check(root, { env: { FAKE_SENSORS_MODE: 'badissue' } });
  assert.equal(malformed.verdict, 'UNAVAILABLE');
  assert.equal(malformed.reasons[0].cause, 'sensor-failed');

  const linked = fixtureRepository({ files: { 'src/a.js': 'x\n', '.gitignore': 'node_modules\n' } });
  write(linked, { 'node_modules/shared/config.toml': 'ORIGINAL\n' });
  symlinkSync('../node_modules/shared/config.toml', join(linked, '.habit-hooks', '.gatereeve-code-health.toml'));
  commit(linked, 'tracked symlink at the run-config path');
  const subject = (await check(linked)).governed.subject;
  write(linked, { 'src/a.js': 'y\n' });
  commit(linked, 'change');
  assert.equal((await check(linked, { approved: [subject] })).verdict, 'PASS');
  assert.equal(read(linked, 'node_modules/shared/config.toml'), 'ORIGINAL\n');

  const jscpd = fixtureRepository({ config: BASE_CONFIG.replace('[sensors.jscpd]\ndisabled = true\n', ''), files: { 'README.md': 'x\n' } });
  write(jscpd, { 'README.md': 'docs only\n' });
  commit(jscpd, 'docs');
  const missing = await check(jscpd, { env: { PATH: [dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter) } });
  assert.equal(missing.verdict, 'UNAVAILABLE', 'nothing in scope still checks the tools');
  assert.equal(missing.reasons[0].cause, 'missing-tool');
  assert.match(missing.reasons[0].message, /jscpd, needed by sensor jscpd \(npm install --save-dev jscpd\)/);
  assert.ok('jscpd' in (await check(root)).tools, 'jscpd identity is part of the tool versions');
});

test('round 4: plugin inventory, issue file validation and overlay directories', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'SMELL:oversized-function:eslint:x\n' } });
  write(root, { 'src/a.js': 'SMELL:oversized-function:eslint:x\n// touched\n' });
  commit(root, 'touch');
  for (const mode of ['emptykey', 'badfile', 'emptyfile']) {
    const result = await check(root, { env: { FAKE_SENSORS_MODE: mode } });
    assert.equal(result.verdict, 'UNAVAILABLE', mode);
    assert.equal(result.reasons[0].cause, 'sensor-failed', mode);
  }

  const launcher = mkdtempSync(join(tools.directory, 'launcher-'));
  const copied = join(launcher, 'habit-sensors');
  writeFileSync(copied, readFileSync(tools.sensors));
  chmodSync(copied, 0o755);
  const unknown = await check(root, { habitSensors: copied });
  assert.equal(unknown.verdict, 'UNAVAILABLE', 'an unknown plugin inventory is never treated as complete');
  assert.match(unknown.reasons[0].message, /GATEREEVE_HABIT_PYTHON/);
  assert.equal((await check(root, { habitSensors: copied, env: { GATEREEVE_HABIT_PYTHON: join(tools.directory, 'python') } })).verdict, 'PASS');
  assert.equal((await check(root, { env: { FAKE_PYTHON_MODE: 'fail' } })).verdict, 'UNAVAILABLE');

  const docs = fixtureRepository({ files: { 'README.md': 'x\n' } });
  write(docs, { 'README.md': 'docs\n' });
  commit(docs, 'docs');
  const missingPlugin = await check(docs, { env: { FAKE_PLUGINS: JSON.stringify({ 'habit-hooks': '9.9.9' }) } });
  assert.equal(missingPlugin.verdict, 'UNAVAILABLE', 'nothing in scope still checks the plugins');
  assert.match(missingPlugin.reasons[0].message, /Habit Hooks plugin generic \(pip install habit-hooks-generic\)/);

  const env = { GATEREEVE_CODE_HEALTH_CACHE: join(tools.directory, `cache-plugins-${Date.now()}`) };
  await check(root, { useCache: true, env });
  assert.equal((await check(root, { useCache: true, env })).cache.hit, true);
  const upgraded = await check(root, { useCache: true, env: { ...env, FAKE_PLUGINS: JSON.stringify({ 'habit-hooks': '9.9.9', 'habit-hooks-generic': '10.0.0' }) } });
  assert.equal(upgraded.cache.hit, false, 'a changed plugin version never reuses the old baseline');

  const linked = fixtureRepository({ files: { 'src/a.js': 'x\n', '.gitignore': 'node_modules\n' } });
  write(linked, { 'node_modules/shared/keep.txt': 'x\n' });
  gitIn(linked, 'checkout', '-q', 'main');
  symlinkSync('node_modules/shared', join(linked, 'configs'));
  commit(linked, 'configs is a symlink at the base');
  gitIn(linked, 'checkout', '-q', 'feature');
  gitIn(linked, 'reset', '-q', '--hard', 'main');
  gitIn(linked, 'rm', '-q', 'configs');
  write(linked, { 'configs/newdir/eslint.config.js': 'export default [];\n', 'src/a.js': 'y\n' });
  commit(linked, 'configs becomes a real directory');
  const subject = (await check(linked)).governed.subject;
  const result = await check(linked, { approved: [subject] });
  assert.equal(result.verdict, 'UNAVAILABLE');
  assert.equal(existsSync(join(linked, 'node_modules', 'shared', 'newdir')), false, 'nothing is created through the symlink');
});

test('a package-local analyser package is part of the tool identity (round 6 codex/F2)', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'x\n', 'pkg/package.json': '{}\n', '.gitignore': 'node_modules\n' } });
  write(root, { 'src/a.js': 'y\n' });
  commit(root, 'touch');
  const install = version => write(root, { 'pkg/node_modules/typescript-eslint/package.json': JSON.stringify({ name: 'typescript-eslint', version }) });
  install('8.0.0');
  const env = { GATEREEVE_CODE_HEALTH_CACHE: join(tools.directory, `cache-local-${Date.now()}`) };
  const first = await check(root, { useCache: true, env });
  assert.deepEqual(first.tools['typescript-eslint'], { 'pkg/node_modules': '8.0.0' });
  assert.equal((await check(root, { useCache: true, env })).cache.hit, true);
  install('8.1.0');
  const upgraded = await check(root, { useCache: true, env });
  assert.deepEqual(upgraded.tools['typescript-eslint'], { 'pkg/node_modules': '8.1.0' });
  assert.equal(upgraded.cache.hit, false, 'a package-local upgrade never reuses the old baseline');
});

test('every tsconfig and jsconfig name is governed (round 6 codex/F14)', async () => {
  for (const name of ['tsconfig-base.json', 'tsconfigLint.json', 'tsconfig.base.json', 'pkg/jsconfig.app.json']) {
    const root = fixtureRepository({ files: { 'src/a.js': 'x\n', [name]: '{}\n' } });
    write(root, { [name]: '{ "compilerOptions": { "strict": false } }\n' });
    commit(root, `change ${name}`);
    const result = await check(root);
    assert.equal(result.verdict, 'UNAVAILABLE', `${name} needs an approval`);
    assert.ok(result.governed.subject, name);
    assert.equal((await check(root, { approved: [result.governed.subject] })).verdict, 'PASS', name);
  }
});

test('any package in a node_modules the analysers load from keys the cache (round 7 codex/F2)', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'x\n', 'pkg/package.json': '{}\n', '.gitignore': 'node_modules\n' } });
  write(root, { 'src/a.js': 'y\n' });
  commit(root, 'touch');
  const install = version => write(root, { 'pkg/node_modules/@acme/eslint-plugin-rules/package.json': JSON.stringify({ name: '@acme/eslint-plugin-rules', version }) });
  install('1.0.0');
  const env = { GATEREEVE_CODE_HEALTH_CACHE: join(tools.directory, `cache-tree-${Date.now()}`) };
  const first = await check(root, { useCache: true, env });
  assert.match(first.tools.nodeModules['pkg/node_modules'], /^sha256:/);
  assert.equal((await check(root, { useCache: true, env })).cache.hit, true);
  install('1.1.0');
  assert.equal((await check(root, { useCache: true, env })).cache.hit, false, 'an upgraded rule plugin never reuses the old baseline');
});

test('a custom plugin\'s missing tools are UNAVAILABLE even with nothing in scope (round 7 codex/F15)', async () => {
  const root = fixtureRepository({ config: BASE_CONFIG.replace('plugins = ["generic", "gatereeve"]', 'plugins = ["generic", "gatereeve", "custom"]'),
    files: { 'src/a.js': 'x\n', '.habit-hooks/custom/config.toml': 'sensors = ["custom-analyser"]\n' } });
  write(root, { 'README.md': 'docs only\n' });
  commit(root, 'docs');
  const subject = (await check(root)).governed.subject;
  const approved = subject ? [subject] : [];
  assert.equal((await check(root, { approved })).verdict, 'PASS', 'Habit Hooks reports nothing missing');
  const absent = await check(root, { approved, env: { FAKE_DETECTORS: JSON.stringify([{ plugin: 'custom', name: 'custom-tool', kind: 'command', install: 'pip install custom-tool', missing: true }]) } });
  assert.equal(absent.verdict, 'UNAVAILABLE');
  assert.match(absent.reasons[0].message, /custom-tool, declared by plugin custom \(pip install custom-tool\)/);
  const unknown = await check(root, { approved, env: { FAKE_DETECTORS_MODE: 'fail' } });
  assert.equal(unknown.verdict, 'UNAVAILABLE');
  assert.match(unknown.reasons[0].message, /tools declared by plugin custom \(Habit Hooks could not report them\)/);
});

test('a file path that normalizes to nothing is UNAVAILABLE, never dropped (round 8 codex/F17)', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'x\n' } });
  write(root, { 'src/a.js': 'y\n' });
  commit(root, 'touch');
  const result = await check(root, { env: { FAKE_SENSORS_MODE: 'dotfile' } });
  assert.equal(result.verdict, 'UNAVAILABLE');
  assert.match(result.reasons[0].message, /names no file/);
});

test('a hanging sensor is stopped at the timeout and reported UNAVAILABLE (round 8 codex/F18)', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'x\n' } });
  write(root, { 'src/a.js': 'y\n' });
  commit(root, 'touch');
  const started = Date.now();
  const result = await check(root, { timeoutMs: 1500, env: { FAKE_SENSORS_MODE: 'hang' } });
  assert.equal(result.verdict, 'UNAVAILABLE');
  assert.equal(result.reasons[0].cause, 'sensor-failed');
  assert.match(result.reasons[0].message, /timed out on the head after 1500 ms/);
  assert.ok(Date.now() - started < 60000, 'the sensor is killed, not waited for');
  assert.ok(result.reasons[0].remedy, 'the failure carries recovery guidance');
});

test('a plugin GateReeve cannot identify never reuses a cached baseline (round 8 codex/F16)', async () => {
  const root = fixtureRepository({ config: BASE_CONFIG.replace('plugins = ["generic", "gatereeve"]', 'plugins = ["generic", "gatereeve", "custom"]'),
    files: { 'src/a.js': 'x\n', '.habit-hooks/custom/config.toml': 'sensors = ["custom-analyser"]\n' } });
  write(root, { 'src/a.js': 'y\n' });
  commit(root, 'touch');
  const env = { GATEREEVE_CODE_HEALTH_CACHE: join(tools.directory, `cache-custom-${Date.now()}`) };
  const first = await check(root, { useCache: true, env });
  assert.equal(first.verdict, 'PASS', JSON.stringify(first.reasons));
  const second = await check(root, { useCache: true, env });
  assert.equal(second.cache.hit, false);
  assert.match(second.cache.reason, /cannot identify/);
});

test('a custom plugin\'s declared analysers are reported with their versions (round 9 codex/F16)', async () => {
  const root = fixtureRepository({ config: BASE_CONFIG.replace('plugins = ["generic", "gatereeve"]', 'plugins = ["generic", "gatereeve", "custom"]'),
    files: { 'src/a.js': 'x\n', '.habit-hooks/custom/config.toml': 'sensors = ["custom-analyser"]\n' } });
  write(root, { 'src/a.js': 'y\n' });
  commit(root, 'touch');
  const detectors = JSON.stringify([{ plugin: 'custom', name: 'eslint', kind: 'command', install: 'npm i eslint', missing: false }, { plugin: 'custom', name: 'some-lib', kind: 'node-module', install: 'npm i some-lib', missing: false }]);
  const result = await check(root, { env: { PATH: `${tools.eslintDirectory}${delimiter}${process.env.PATH}`, FAKE_DETECTORS: detectors, FAKE_ESLINT_VERSION: '9.1.0' } });
  assert.equal(result.verdict, 'PASS', JSON.stringify(result.reasons));
  assert.deepEqual(result.tools.declared, { 'custom/eslint': 'v9.1.0', 'custom/some-lib': 'node-module (see nodeModules)' });
});

test('a known plugin whose vendored copy adds an unknown sensor is asked of Habit Hooks (CH-R9-01)', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'x\n' } });
  write(root, { '.habit-hooks/gatereeve/config.toml': 'sensors = ["ruff-s110", "mystery"]\n' });
  commit(root, 'extra sensor');
  const subject = (await check(root)).governed.subject;
  const result = await check(root, { approved: [subject], useCache: true, env: { GATEREEVE_CODE_HEALTH_CACHE: join(tools.directory, `cache-extra-${Date.now()}`), FAKE_DETECTORS: JSON.stringify([{ plugin: 'gatereeve', name: 'mystery-tool', kind: 'command', install: 'pip install mystery-tool', missing: true }]) } });
  assert.equal(result.verdict, 'UNAVAILABLE');
  assert.match(result.reasons[0].message, /mystery-tool, declared by plugin gatereeve/);
});

test('an empty smell or a file outside the worktree is malformed output (round 9 codex/F19, CH-R9-02)', async () => {
  for (const mode of ['emptysmell', 'rootfile']) {
    const root = fixtureRepository({ files: { 'src/a.js': 'x\n' } });
    write(root, { 'src/a.js': 'y\n' });
    commit(root, 'touch');
    const result = await check(root, { env: { FAKE_SENSORS_MODE: mode } });
    assert.equal(result.verdict, 'UNAVAILABLE', mode);
    assert.equal(result.reasons[0].cause, 'sensor-failed', mode);
  }
});

test.after(() => rmSync(tools.directory, { recursive: true, force: true }));
