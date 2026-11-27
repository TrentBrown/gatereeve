import './helpers/private-scratch.js';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { main } from '../../plugin-src/shared/resources/code-health/cli.js';
import { runCodeHealth } from '../../plugin-src/shared/resources/code-health/run.js';
import { neutralize } from '../../plugin-src/shared/resources/code-health/worktree.js';
import { parseNameStatus } from '../../plugin-src/shared/resources/code-health/scope.js';
import { selector, stringifyToml } from '../../plugin-src/shared/resources/code-health/process.js';
import { BASE_CONFIG, commit, fakeTools, fixtureRepository, gitIn, read, write } from './helpers/code-health-fixture.js';

const tools = fakeTools();
const cache = join(tools.directory, 'cache');

function check(root, options = {}) {
  const env = { ...process.env, GATEREEVE_CODE_HEALTH_CACHE: cache, ...options.env };
  return runCodeHealth({ cwd: root, base: 'main', habitSensors: tools.sensors, habitMapper: tools.mapper, useCache: false, ...options, env });
}

test('equal or lower counts per (file, smell, rule) pass; lines and messages are ignored', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'x\nSMELL:oversized-function:eslint:max-lines-per-function one\nSMELL:loose-equality:eslint:eqeqeq\n' } });
  write(root, { 'src/a.js': 'moved\n\n\nSMELL:oversized-function:eslint:max-lines-per-function renamed message\n' });
  commit(root, 'same count, fewer overall');
  const result = await check(root);
  assert.equal(result.verdict, 'PASS');
  assert.deepEqual(result.groups, []);
  assert.equal(result.findings.preExisting.length, 1);
  assert.equal(result.findings.new.length, 0);
});

test('an increased enforced group fails, with coaching first and an advisory split', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'SMELL:oversized-function:eslint:max-lines-per-function\nSMELL:deep-nesting:eslint:max-depth\n' } });
  write(root, { 'src/a.js': 'SMELL:oversized-function:eslint:max-lines-per-function\nSMELL:oversized-function:eslint:max-lines-per-function\nSMELL:deep-nesting:eslint:max-depth\nSMELL:warning-comment:eslint:no-warning-comments\n' });
  commit(root, 'regression');
  const result = await check(root);
  assert.equal(result.verdict, 'FAIL');
  assert.deepEqual(result.groups, [{ file: 'src/a.js', smell: 'oversized-function', source: 'eslint:max-lines-per-function', base: 1, head: 2 }]);
  assert.equal(result.findings.new.length, 2);
  assert.deepEqual(result.findings.preExisting.map(issue => issue.smell), ['deep-nesting']);
  assert.deepEqual(result.findings.advisory.map(issue => issue.smell), ['warning-comment']);
  assert.deepEqual(result.counts['oversized-function'], { new: 2, preExisting: 0, advisory: 0 });
  assert.match(result.coaching, /COACH oversized-function/);
  assert.doesNotMatch(result.coaching, /deep-nesting/);
});

test('a smell the base does not have at all is new; a different rule for the same smell is its own group', async () => {
  const root = fixtureRepository({ files: { 'src/a.py': 'SMELL:high-complexity:ruff:C901\n' } });
  write(root, { 'src/a.py': 'SMELL:high-complexity:ruff:C901\nSMELL:high-complexity:ruff:PLR0912\n', 'src/new.js': 'SMELL:@typescript-eslint/no-floating-promises:eslint:@typescript-eslint/no-floating-promises\n' });
  commit(root, 'new groups');
  const result = await check(root);
  assert.equal(result.verdict, 'FAIL');
  assert.deepEqual(result.groups.map(group => [group.file, group.source, group.base, group.head]).sort(), [
    ['src/a.py', 'ruff:PLR0912', 0, 1],
    ['src/new.js', 'eslint:@typescript-eslint/no-floating-promises', 0, 1],
  ]);
});

test('test globs are out of scope and a rename compares against its base path', async () => {
  const body = 'SMELL:oversized-function:eslint:max-lines-per-function\nline\nline\nline\nline\n';
  const root = fixtureRepository({ files: { 'src/old.js': body } });
  gitIn(root, 'mv', 'src/old.js', 'src/renamed.js');
  write(root, { 'src/test/a.js': 'SMELL:oversized-function:eslint:x\n', 'src/b.test.js': 'SMELL:oversized-function:eslint:x\n' });
  commit(root, 'rename and tests');
  const log = join(tools.directory, `log-${Date.now()}.jsonl`);
  const result = await check(root, { env: { FAKE_SENSORS_LOG: log } });
  assert.equal(result.verdict, 'PASS');
  assert.deepEqual(result.scope.files, [{ head: 'src/renamed.js', base: 'src/old.js' }]);
  const runs = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(runs.map(run => run.files), [['src/renamed.js'], ['src/old.js']]);
});

test('the base run sees the head governed files and the checkout is left untouched', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'SMELL:oversized-function:eslint:x\n' } });
  write(root, { 'eslint.config.js': 'export default ["head"];\n', 'src/a.js': 'SMELL:oversized-function:eslint:x\n// eslint-disable-next-line\nSMELL:oversized-function:eslint:x\n' });
  commit(root, 'config and suppressed regression');
  const before = read(root, 'src/a.js');
  const unapproved = await check(root);
  assert.equal(unapproved.verdict, 'UNAVAILABLE');
  const log = join(tools.directory, `overlay-${Date.now()}.jsonl`);
  const result = await check(root, { approved: [unapproved.governed.subject], env: { FAKE_SENSORS_LOG: log } });
  const runs = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(runs.map(run => run.probe), ['export default ["head"];', 'export default ["head"];']);
  assert.equal(result.verdict, 'FAIL', 'a suppression added on the branch hides nothing');
  assert.equal(result.governed.matched, unapproved.governed.subject);
  assert.equal(read(root, 'src/a.js'), before);
  assert.equal(gitIn(root, 'status', '--porcelain'), '');
  assert.equal(gitIn(root, 'worktree', 'list').trim().split('\n').length, 1);
});

test('deleting an eslint-enable or adding code inside a disabled region does not hide a new finding', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': '/* eslint-disable */\nSMELL:oversized-function:eslint:x\n/* eslint-enable */\nok\n' } });
  write(root, { 'src/a.js': '/* eslint-disable */\nSMELL:oversized-function:eslint:x\nok\nSMELL:oversized-function:eslint:x\n' });
  commit(root, 'remove enable');
  const result = await check(root);
  assert.equal(result.verdict, 'FAIL');
  assert.deepEqual(result.groups.map(group => [group.base, group.head]), [[1, 2]]);
});

test('legacy suppressions surface as pre-existing advisory findings', async () => {
  const root = fixtureRepository({ files: { 'src/a.py': 'SMELL:high-complexity:ruff:C901  # noqa: C901\n' } });
  write(root, { 'src/a.py': 'SMELL:high-complexity:ruff:C901  # noqa: C901\nother = 1\n' });
  commit(root, 'touch');
  const result = await check(root);
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.findings.preExisting.length, 1);
});

test('neutralize rewrites directives in place and preserves lines', () => {
  const js = '// eslint-disable-next-line no-x\nconst a = 1; // eslint-disable-line\n/* eslint-disable */\n/* eslint no-x: off */\n/* eslint-enable */\n';
  const out = neutralize('a.mjs', js);
  assert.equal(out.split('\n').length, js.split('\n').length);
  assert.doesNotMatch(out, /eslint-(disable|enable)|\/\* eslint /);
  assert.equal(neutralize('a.py', 'x = 1  # noqa: E501\n# ruff: noqa\n# flake8: noqa\n'), 'x = 1  # gatereeve-neutralized: E501\n# gatereeve-neutralized\n# gatereeve-neutralized\n');
  assert.equal(neutralize('README.md', '<!-- eslint-disable -->'), '<!-- eslint-disable -->');
});

test('the base cache is reused only for an identical scoped file set', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'SMELL:oversized-function:eslint:x\n', 'src/b.js': 'SMELL:oversized-function:eslint:x\n' } });
  write(root, { 'src/a.js': 'SMELL:oversized-function:eslint:x\n// touched\n' });
  commit(root, 'touch a');
  const env = { GATEREEVE_CODE_HEALTH_CACHE: join(tools.directory, `cache-${Date.now()}`) };
  const first = await check(root, { useCache: true, env });
  const second = await check(root, { useCache: true, env });
  assert.equal(first.cache.hit, false);
  assert.equal(second.cache.hit, true);
  write(root, { 'src/b.js': 'SMELL:oversized-function:eslint:x\n// touched\n' });
  commit(root, 'touch b too');
  const third = await check(root, { useCache: true, env });
  assert.equal(third.cache.hit, false);
  assert.notEqual(third.cache.key, first.cache.key);
  assert.equal(third.verdict, 'PASS', 'b.js legacy finding is in the fresh baseline');
});

test('every UNAVAILABLE cause names its way forward', async () => {
  const notSetUp = fixtureRepository({ config: null, files: { 'src/a.js': 'x\n' } });
  const plain = () => {
    const root = fixtureRepository({ files: { 'src/a.js': 'SMELL:oversized-function:eslint:x\nPARSE_ERROR\n' } });
    write(root, { 'src/a.js': 'SMELL:oversized-function:eslint:x\nPARSE_ERROR\nmore\n' });
    commit(root, 'change');
    return root;
  };
  const noPlugin = fixtureRepository({ config: BASE_CONFIG.replace('"gatereeve"', '"python"'), files: { 'src/a.js': 'x\n' } });
  const notEnforced = fixtureRepository({ config: BASE_CONFIG.replace('[smells.swallowed-exception]\nseverity = "enforced"', '[smells.swallowed-exception]\nseverity = "suggested"'), files: { 'src/a.js': 'x\n' } });
  const disabled = fixtureRepository({ config: BASE_CONFIG.replace('[smells.swallowed-exception]\nseverity = "enforced"', '[smells.swallowed-exception]\nseverity = "enforced"\ndisabled = true'), files: { 'src/a.js': 'x\n' } });
  const cases = [
    ['not-set-up', notSetUp, {}],
    ['missing-tool', plain(), { habitSensors: join(tools.directory, 'absent') }],
    ['plugin-not-configured', noPlugin, {}],
    ['plugin-not-configured', notEnforced, {}],
    ['plugin-not-configured', disabled, {}],
    ['missing-tool', plain(), { habitMapper: join(tools.directory, 'absent-mapper') }],
    ['incomplete-run', plain(), { env: { FAKE_SENSORS_MODE: 'incomplete' } }],
    ['incomplete-run', plain(), { env: { FAKE_SENSORS_MODE: 'parse' } }],
    ['sensor-failed', plain(), { env: { FAKE_SENSORS_MODE: 'crash' } }],
    ['sensor-failed', plain(), { env: { FAKE_SENSORS_MODE: 'badjson' } }],
    ['sensor-failed', plain(), { env: { FAKE_SENSORS_MODE: 'notarray' } }],
  ];
  for (const [cause, root, options] of cases) {
    const result = await check(root, options);
    assert.equal(result.verdict, 'UNAVAILABLE', cause);
    assert.equal(result.reasons[0].cause, cause);
    assert.match(result.reasons[0].remedy, /code-health init --preset moderate/, cause);
    assert.match(result.reasons[0].remedy, /opt-out-code-health/, cause);
  }
});

test('a governed change needs a matching approval; stale approvals are ignored', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'x\n' } });
  write(root, { '.habit-hooks/config.toml': BASE_CONFIG.replace('"!**/test/**", ', '"!**/test/**", "!src/hidden/**", ') });
  commit(root, 'narrow scope');
  const blocked = await check(root);
  assert.equal(blocked.verdict, 'UNAVAILABLE');
  assert.equal(blocked.reasons[0].cause, 'unapproved-config');
  assert.match(blocked.reasons[0].message, /\.habit-hooks\/config\.toml: changed/);
  assert.match(blocked.reasons[0].message, new RegExp(blocked.governed.subject.replace(':', ':')));
  assert.match(blocked.reasons[0].message, /approve-code-health-config/);
  const stale = `sha256:${'0'.repeat(64)}`;
  assert.equal((await check(root, { approved: [stale] })).verdict, 'UNAVAILABLE');
  const passed = await check(root, { approved: [stale, blocked.governed.subject] });
  assert.equal(passed.verdict, 'PASS');
  assert.equal(passed.governed.matched, blocked.governed.subject);
  write(root, { '.habit-hooks/gatereeve.json': '{"governedPaths":["custom/**"]}\n' });
  commit(root, 'second governed edit');
  assert.equal((await check(root, { approved: [blocked.governed.subject] })).verdict, 'UNAVAILABLE', 'a later edit invalidates the earlier approval');
});

test('pyproject dependency edits are not governed but its lint tables are', async () => {
  const root = fixtureRepository({ files: { 'pyproject.toml': '[project]\nname = "x"\ndependencies = []\n\n[tool.ruff.lint.pylint]\nmax-args = 5\n' } });
  write(root, { 'pyproject.toml': '[project]\nname = "x"\ndependencies = ["requests"]\n\n[tool.ruff.lint.pylint]\nmax-args = 5\n' });
  commit(root, 'dependency');
  assert.equal((await check(root)).governed.subject, null);
  write(root, { 'pyproject.toml': '[project]\nname = "x"\ndependencies = ["requests"]\n\n[tool.ruff.lint.pylint]\nmax-args = 9\n' });
  commit(root, 'loosen');
  const result = await check(root);
  assert.equal(result.verdict, 'UNAVAILABLE');
  assert.deepEqual(result.governed.changes.map(change => change.path), ['pyproject.toml']);
});

test('the CLI exit contract and JSON record', async () => {
  const root = fixtureRepository({ files: { 'src/a.js': 'SMELL:oversized-function:eslint:x\n' } });
  write(root, { 'src/a.js': 'SMELL:oversized-function:eslint:x\nSMELL:oversized-function:eslint:x\n' });
  commit(root, 'regression');
  let out = '';
  const stdout = { write: text => { out += text; } };
  const env = { ...process.env, GATEREEVE_CODE_HEALTH_CACHE: cache };
  const args = ['run', '--base', 'main', '--json', '--cwd', root, '--habit-sensors', tools.sensors, '--habit-mapper', tools.mapper, '--no-cache'];
  assert.equal(await main(args, { stdout, env }), 1);
  const record = JSON.parse(out);
  for (const field of ['verdict', 'base', 'mergeBase', 'head', 'headTree', 'governed', 'counts', 'thresholds', 'tools', 'findings', 'coaching', 'scope']) assert.ok(field in record, field);
  assert.ok('subject' in record.governed && 'matched' in record.governed && 'hashes' in record.governed);
  assert.equal(record.tools.habitSensors, 'habit-sensors 9.9.9-fake');
  out = '';
  assert.equal(await main(args.filter(arg => arg !== '--json'), { stdout, env }), 1);
  assert.ok(out.indexOf('COACH oversized-function') < out.indexOf('Issues in regressed groups'));
  gitIn(root, 'reset', '-q', '--hard', 'HEAD~1');
  assert.equal(await main(args, { stdout: { write() {} }, env }), 0);
  assert.equal(await main([...args, '--habit-sensors', join(tools.directory, 'absent')], { stdout: { write() {} }, env }), 2);
  assert.equal(await main(['run'], { stdout: { write() {} }, stderr: { write() {} }, env }), 2);
});

test('helpers: name-status parsing, Habit Hooks globs and TOML output', () => {
  assert.deepEqual(parseNameStatus('M\0a.js\0R087\0old.js\0new.js\0A\0n.js\0D\0gone.js\0'), [
    { kind: 'M', head: 'a.js', base: 'a.js' },
    { kind: 'R', head: 'new.js', base: 'old.js' },
    { kind: 'A', head: 'n.js', base: null },
    { kind: 'D', head: null, base: 'gone.js' },
  ]);
  const select = selector(['**/*.js', '!**/test/**', '!**/*.test.*']);
  assert.equal(select('a.js'), true);
  assert.equal(select('src/deep/a.js'), true);
  assert.equal(select('src/test/a.js'), false);
  assert.equal(select('src/a.test.js'), false);
  assert.equal(select('src/a.py'), false);
  assert.equal(stringifyToml({ plugins: ['a'], files: ['x'], smells: { 'a/b': { severity: 'enforced' } }, sensors: { jscpd: { disabled: true } } }),
    'plugins = ["a"]\nfiles = ["x"]\n\n[smells."a/b"]\nseverity = "enforced"\n\n[sensors.jscpd]\ndisabled = true\n');
});

test.after(() => rmSync(tools.directory, { recursive: true, force: true }));
