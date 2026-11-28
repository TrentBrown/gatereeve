// Fixture repositories and fake Habit Hooks executables for code-health tests.
// The fake `habit-sensors` reads the generated config's `files` list and emits
// one issue per `SMELL:<smell>:<source>` marker. Like the real tools it honors
// inline suppressions, so neutralization is observable.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const FAKE_SENSORS = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('habit-sensors 9.9.9-fake'); process.exit(0); }
const mode = process.env.FAKE_SENSORS_MODE || '';
const configPath = args[args.indexOf('--config') + 1];
const config = fs.readFileSync(configPath, 'utf8');
const files = JSON.parse((config.match(/^files = (\\[.*\\])$/m) || [, '[]'])[1]);
if (process.env.FAKE_SENSORS_LOG) {
  let probe = null;
  try { probe = fs.readFileSync('eslint.config.js', 'utf8').trim(); } catch {}
  fs.appendFileSync(process.env.FAKE_SENSORS_LOG, JSON.stringify({ cwd: process.cwd(), files, probe, nested: fs.existsSync('pkg/node_modules/marker') }) + '\\n');
}
if (mode === 'crash') { console.error('sensor exploded'); process.exit(3); }
if (mode === 'badjson') { console.log('not json'); process.exit(0); }
if (mode === 'notarray') { console.log('{"smell":"x"}'); process.exit(0); }
if (mode === 'badissue') { console.log('[{"smell":"oversized-function","issues":[{}]}]'); process.exit(0); }
if (mode === 'emptykey') { console.log('[{"smell":"oversized-function","issues":[{"key":""}]}]'); process.exit(0); }
if (mode === 'badfile') { console.log('[{"smell":"oversized-function","issues":[{"key":"src/a.js","details":{"file":123}}]}]'); process.exit(0); }
if (mode === 'emptysmell') { console.log('[{"smell":"","issues":[{"key":"src/a.js","details":{"file":"src/a.js"}}]}]'); process.exit(0); }
if (mode === 'rootfile') { console.log(JSON.stringify([{ smell: 'oversized-function', issues: [{ key: 'src/a.js', details: { file: process.cwd() } }] }])); process.exit(0); }
if (mode === 'contentkey') { console.log(!fs.readFileSync('src/a.js', 'utf8').includes('y') ? '[]' : '[{"smell":"oversized-function","issues":[{"key":"src/../src/a.js","details":{"content":"new issue"}}]}]'); process.exit(0); }
if (mode === 'contentescape') { console.log('[{"smell":"oversized-function","issues":[{"key":"src/../../outside.js","details":{"content":"x"}}]}]'); process.exit(0); }
if (mode === 'brokenabsolute') { console.log('[{"smell":"incomplete-run","issues":[{"key":"/home/u/.venv/bin/ruff: not executable","details":{"content":"/home/u/.venv/bin/ruff: not executable"}}]}]'); process.exit(0); }
if (mode === 'escape') { console.log('[{"smell":"oversized-function","issues":[{"key":"src/a.js","details":{"file":"../outside.js"}}]}]'); process.exit(0); }
if (mode === 'dotfile') { console.log('[{"smell":"oversized-function","issues":[{"key":"src/a.js","details":{"file":"./"}}]}]'); process.exit(0); }
if (mode === 'hang') { setTimeout(() => {}, 600000); return; }
if (mode === 'emptyfile') { console.log('[{"smell":"oversized-function","issues":[{"key":"src/a.js","details":{"file":""}}]}]'); process.exit(0); }
const bySmell = new Map();
const add = (smell, issue) => { if (!bySmell.has(smell)) bySmell.set(smell, []); bySmell.get(smell).push(issue); };
if (mode === 'incomplete') add('incomplete-run', { key: "sensor 'ruff' needs the 'ruff' command", details: { content: "sensor 'ruff' needs the 'ruff' command" } });
for (const file of files) {
  let text; try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  if (mode === 'parse' && text.includes('PARSE_ERROR')) { add('parse-error', { key: file, details: { file, line: 1, message: 'bad syntax', source: 'fake:parse' } }); continue; }
  const lines = text.split('\\n');
  let disabled = false;
  lines.forEach((line, index) => {
    if (/\\/\\*\\s*eslint-disable\\s*\\*\\//.test(line)) disabled = true;
    if (/\\/\\*\\s*eslint-enable\\s*\\*\\//.test(line)) disabled = false;
    const marker = line.match(/SMELL:([^:\\s]+):(\\S+)/);
    if (!marker || disabled) return;
    if (/eslint-disable-line|#\\s*noqa/.test(line)) return;
    if (index > 0 && /eslint-disable-next-line/.test(lines[index - 1])) return;
    const reported = mode === 'dotslash' ? './' + file : mode === 'dotdot' ? file.split('/')[0] + '/../' + file : mode === 'absolute' ? require('node:path').join(process.cwd(), file) : file;
    add(marker[1], { key: reported, details: { file: reported, line: index + 1, column: 1, message: line.trim(), source: marker[2] } });
  });
}
console.log(JSON.stringify([...bySmell].map(([smell, issues]) => ({ smell, details: {}, issues, language: 'javascript' }))));
`;

const FAKE_MAPPER = `#!/usr/bin/env node
if (process.env.FAKE_MAPPER_MODE === 'crash') { console.error('mapper exploded'); process.exit(2); }
const input = require('node:fs').readFileSync(0, 'utf8');
const findings = JSON.parse(input);
console.log(findings.map(f => '── ' + f.smell + ' (' + f.issues.length + ' issue) ── COACH ' + f.smell).join('\\n'));
process.exit(findings.length ? 1 : 0);
`;

export const BASE_CONFIG = `plugins = ["generic", "gatereeve"]
files = ["src/**/*.js", "src/**/*.py", "!**/test/**", "!**/*.test.*"]

[sensors.jscpd]
disabled = true

[smells."@typescript-eslint/no-floating-promises"]
severity = "enforced"

[smells."@typescript-eslint/no-misused-promises"]
severity = "enforced"

[smells.swallowed-exception]
severity = "enforced"
`;

// A fake ESLint for threshold and version reporting; it lives on PATH only
// when a test puts its directory there.
const FAKE_ESLINT = `#!/usr/bin/env node
if (process.argv[2] === '--version') { console.log('v' + (process.env.FAKE_ESLINT_VERSION || '9.0.0')); process.exit(0); }
if (process.argv[2] === '--print-config') { console.log(JSON.stringify({ rules: { 'max-lines-per-function': ['error', { max: 40 }], 'max-params': ['error', 5], complexity: ['error', 15], 'max-depth': ['error', { max: 4 }], 'max-lines': ['error', { max: 500 }] } })); process.exit(0); }
process.exit(2);
`;

// Stands in for the Python beside habit-sensors: answers the plugin inventory
// and missing-detector queries.
const FAKE_PYTHON = `#!/usr/bin/env node
if (process.env.FAKE_PYTHON_MODE === 'fail') process.exit(1);
if (process.argv.some(arg => arg.includes('declared_detectors'))) {
  if (process.env.FAKE_DETECTORS_MODE === 'fail') process.exit(1);
  console.log(process.env.FAKE_DETECTORS || '[]');
  process.exit(0);
}
console.log(process.env.FAKE_PLUGINS || JSON.stringify({ 'habit-hooks': '9.9.9', 'habit-hooks-generic': '9.9.9', 'habit-hooks-python': '9.9.9', 'habit-hooks-typescript': '9.9.9' }));
`;

// Every directory a code-health test creates is removed when its process
// exits; /tmp may be memory-backed.
const created = [];
process.once('exit', () => { for (const path of created) rmSync(path, { recursive: true, force: true }); });
export function temporary(prefix) {
  const path = mkdtempSync(join(tmpdir(), prefix));
  created.push(path);
  return path;
}

export function fakeTools() {
  const directory = temporary('gatereeve-code-health-tools-');
  const sensors = join(directory, 'habit-sensors');
  const mapper = join(directory, 'habit-mapper');
  const eslintDirectory = join(directory, 'eslint-bin');
  mkdirSync(eslintDirectory);
  for (const [path, content] of [[sensors, FAKE_SENSORS], [mapper, FAKE_MAPPER], [join(directory, 'python'), FAKE_PYTHON], [join(eslintDirectory, 'eslint'), FAKE_ESLINT]]) {
    writeFileSync(path, content);
    chmodSync(path, 0o755);
  }
  return { directory, sensors, mapper, eslintDirectory };
}

export function gitIn(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' } });
}

export function write(root, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

export function read(root, path) {
  return readFileSync(join(root, path), 'utf8');
}

export function commit(root, message) {
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-q', '--allow-empty', '-m', message);
  return gitIn(root, 'rev-parse', 'HEAD').trim();
}

// A repository with a committed code-health setup on `main` and a `feature`
// branch checked out at the same commit.
export function fixtureRepository({ config = BASE_CONFIG, files = {} } = {}) {
  const root = temporary('gatereeve-code-health-repo-');
  gitIn(root, 'init', '-q', '-b', 'main');
  write(root, {
    ...(config === null ? {} : { '.habit-hooks/config.toml': config, '.habit-hooks/gatereeve/config.toml': 'sensors = []\n' }),
    'eslint.config.js': 'export default [];\n',
    ...files,
  });
  commit(root, 'base');
  gitIn(root, 'checkout', '-q', '-b', 'feature');
  return root;
}
