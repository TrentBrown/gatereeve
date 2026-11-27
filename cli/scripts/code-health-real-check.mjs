#!/usr/bin/env node
// Real-tool check for the code-health preset (spec R9): initialize a fixture
// repository with `code-health init`, add files with a floating Promise, a
// misused Promise, a blind except, a try/except/pass and a known-safe
// node:test call, and run the wrapper with the real Habit Hooks, ESLint and
// Ruff. Skips (exit 0, with a reason) when the tools are not installed.
//
//   node cli/scripts/code-health-real-check.mjs --node-modules <dir> [--bin <dir>] [--json <out>]
//
// <dir> must contain eslint, typescript, typescript-eslint, knip, ts-morph and
// @types/node; --bin is prepended to PATH for habit-sensors, ruff and deptry.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const resources = resolve(here, '../../plugin-src/shared/resources/code-health');
const fixture = resolve(here, '../test/fixtures/code-health-real');
const { initCodeHealth } = await import(join(resources, 'init.js'));
const { runCodeHealth } = await import(join(resources, 'run.js'));

const args = process.argv.slice(2);
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const nodeModules = option('--node-modules');
const bin = option('--bin');
const out = option('--json');
const env = { ...process.env, PATH: [bin, process.env.PATH].filter(Boolean).join(delimiter), GIT_CONFIG_GLOBAL: '/dev/null' };
const onPath = name => (env.PATH ?? '').split(delimiter).some(directory => existsSync(join(directory, name)));

const missing = [
  ...(!nodeModules || !existsSync(join(nodeModules, 'eslint')) ? ['--node-modules with eslint and typescript-eslint'] : []),
  ...['habit-sensors', 'ruff', 'deptry'].filter(name => !onPath(name)),
];
if (missing.length) {
  console.log(`SKIP code-health real-tool check: missing ${missing.join(', ')}`);
  process.exit(0);
}

const git = (cwd, ...rest) => execFileSync('git', rest, {
  cwd, encoding: 'utf8',
  env: { ...env, GIT_AUTHOR_NAME: 'check', GIT_AUTHOR_EMAIL: 'check@example.invalid', GIT_COMMITTER_NAME: 'check', GIT_COMMITTER_EMAIL: 'check@example.invalid' },
});

const root = mkdtempSync(join(tmpdir(), 'gatereeve-code-health-real-'));
const expectations = [
  ['src/promise.js', '@typescript-eslint/no-floating-promises'],
  ['src/misused.js', '@typescript-eslint/no-misused-promises'],
  ['src/blind.py', 'swallowed-exception', 'ruff:BLE001'],
  ['src/silent.py', 'swallowed-exception', 'ruff:S110'],
];
let failures = [];
try {
  git(root, 'init', '-q', '-b', 'main');
  cpSync(join(fixture, 'package.json'), join(root, 'package.json'));
  writeFileSync(join(root, 'seed.js'), 'export const seed = 1;\n');
  writeFileSync(join(root, 'seed.py'), 'SEED = 1\n');
  writeFileSync(join(root, '.gitignore'), 'node_modules\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'project');
  const report = await initCodeHealth({ cwd: root, preset: 'moderate' });
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'code-health setup');
  symlinkSync(resolve(nodeModules), join(root, 'node_modules'));
  git(root, 'checkout', '-q', '-b', 'feature');
  cpSync(join(fixture, 'src'), join(root, 'src'), { recursive: true });
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'add smells');
  const result = await runCodeHealth({ cwd: root, base: 'main', env, useCache: false });
  if (out) writeFileSync(out, JSON.stringify({ init: report, result }, null, 2));
  console.log(`verdict ${result.verdict}; tools ${JSON.stringify(result.tools)}`);
  for (const reason of result.reasons) console.log(`reason ${reason.cause}: ${reason.message}`);
  const enforced = result.findings.new.concat(result.findings.preExisting);
  for (const [file, smell, source] of expectations) {
    const hit = enforced.find(issue => issue.file === file && issue.smell === smell && (!source || issue.source === source));
    console.log(`${hit ? 'ok  ' : 'MISS'} ${file} ${smell}${source ? ` ${source}` : ''}`);
    if (!hit) failures.push(`${file} ${smell}`);
  }
  const runnerFloating = [...enforced, ...result.findings.advisory].filter(issue => issue.file === 'src/runner.cjs' && /promise/i.test(issue.smell));
  const runnerParse = result.reasons.some(reason => /runner\.cjs/.test(reason.message));
  console.log(`${runnerFloating.length || runnerParse ? 'BAD ' : 'ok  '} src/runner.cjs: node:test call not reported, file parses`);
  if (runnerFloating.length || runnerParse) failures.push('src/runner.cjs');
  if (result.verdict !== 'FAIL') failures.push(`verdict ${result.verdict} (expected FAIL)`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
if (failures.length) {
  console.log(`FAIL code-health real-tool check: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('PASS code-health real-tool check');
