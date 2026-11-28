// `code-health init --preset moderate`: write the full starting configuration
// (every language, so files added later are covered, AC6/R9) without
// overwriting anything that already exists. Detected languages only shape the
// report.
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git } from './process.js';

const PRESET = join(dirname(fileURLToPath(import.meta.url)), 'preset');
export const PRESETS = Object.freeze(['moderate']);

const JS_FILE = /\.(?:[cm]?[jt]sx?)$/;
const PY_FILE = /\.pyi?$/;
const JS_GLOBS = ['**/*.js', '**/*.mjs', '**/*.cjs', '**/*.jsx', '**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];
const PY_GLOBS = ['**/*.py', '**/*.pyi'];
// Dot-files (.prettierrc.js), dot-directories (.github/, .habit-hooks/) and
// minified files are out of scope: TypeScript's include wildcards skip them,
// so a file there would be a parse error to the type-aware rules (CH-S2-02,
// CH-S3-01).
export const EXCLUDED_GLOBS = Object.freeze([
  '!**/node_modules/**', '!**/.venv/**', '!**/venv/**', '!**/dist/**', '!**/build/**', '!**/coverage/**',
  '!**/fixtures/**', '!**/test/**', '!**/tests/**', '!**/*.test.*', '!**/*.spec.*', '!**/.*', '!**/.*/**', '!**/*.min.js',
]);
export const SCAN_GLOBS = Object.freeze([...JS_GLOBS, ...PY_GLOBS, ...EXCLUDED_GLOBS]);

export const JS_DEV_DEPENDENCIES = Object.freeze(['eslint', 'typescript', 'typescript-eslint', '@typescript-eslint/parser', '@typescript-eslint/eslint-plugin', 'knip', 'ts-morph', '@types/node']);
export const PYTHON_PACKAGES = Object.freeze(['habit-hooks', 'habit-hooks-generic', 'habit-hooks-typescript', 'habit-hooks-python', 'ruff', 'deptry']);

const list = values => `[${values.map(value => JSON.stringify(value)).join(', ')}]`;

// Habit Hooks hands each sensor the whole scope unless the sensor has its own
// `files`; Ruff would then try to parse JavaScript as Python. Scope each
// language's sensors to that language.
function sensorScopes() {
  const sections = [];
  for (const sensor of ['ruff', 'deptry']) sections.push(`\n[sensors.${sensor}]\nfiles = ${list(PY_GLOBS)}`);
  for (const sensor of ['eslint', 'knip', 'comment']) sections.push(`\n[sensors.${sensor}]\nfiles = ${list(JS_GLOBS)}`);
  return sections.join('\n');
}

export function projectConfig({ files = SCAN_GLOBS } = {}) {
  const plugins = ['gatereeve', 'typescript', 'python', 'generic'];
  return `# GateReeve code-health configuration (preset: moderate).
# Everything under .habit-hooks/ is governed: the code-health check is
# UNAVAILABLE until a human approves a change to it (human.decide kind
# approve-code-health-config). Tests are out of scope by design.
plugins = ${list(plugins)}
files = ${list(files)}

# duplicated-code is advisory only; enable jscpd here if you want it.
[sensors.jscpd]
disabled = true
${sensorScopes()}
[smells."@typescript-eslint/no-floating-promises"]
severity = "enforced"
guide = "floating-promise.md"

[smells."@typescript-eslint/no-misused-promises"]
severity = "enforced"
guide = "misused-promise.md"

[smells.swallowed-exception]
severity = "enforced"
`;
}

export function pluginConfig() {
  return `# GateReeve Habit Hooks plugin (vendored by gatereeve code-health init).
sensors = ["ruff-s110"]
transformers = []
detectors = [
  { name = "ruff", kind = "command", install = "pip install ruff" },
]
`;
}

async function hasRuffConfig(root) {
  if (existsSync(join(root, 'ruff.toml')) || existsSync(join(root, '.ruff.toml'))) return true;
  const pyproject = join(root, 'pyproject.toml');
  return existsSync(pyproject) && /^\s*\[tool\.ruff(\.|\])/m.test(await readFile(pyproject, 'utf8'));
}

function hasEslintConfig(root) {
  return ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', 'eslint.config.mts', 'eslint.config.cts', '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml']
    .some(name => existsSync(join(root, name)));
}

export async function initCodeHealth({ cwd = process.cwd(), preset = 'moderate' } = {}) {
  if (!PRESETS.includes(preset)) throw new Error(`Unknown preset "${preset}" (available: ${PRESETS.join(', ')})`);
  const root = (await git(cwd, ['rev-parse', '--show-toplevel'])).trim();
  const tracked = (await git(root, ['ls-files', '-z'])).split('\0').filter(Boolean);
  const languages = { javascript: tracked.some(path => JS_FILE.test(path)), python: tracked.some(path => PY_FILE.test(path)) };
  const plan = [
    ['.habit-hooks/config.toml', { text: projectConfig() }],
    ['.habit-hooks/gatereeve/config.toml', { text: pluginConfig() }],
  ];
  for (const guide of await readdir(join(PRESET, 'habit-hooks', 'gatereeve', 'guides'))) {
    plan.push([`.habit-hooks/gatereeve/guides/${guide}`, { from: join(PRESET, 'habit-hooks', 'gatereeve', 'guides', guide) }]);
  }
  for (const sensor of ['ruff-s110.toml', 'ruff_s110.py']) {
    plan.push([`.habit-hooks/gatereeve/sensors/${sensor}`, { from: join(PRESET, 'habit-hooks', 'gatereeve', 'sensors', sensor) }]);
  }
  const notes = [];
  if (hasEslintConfig(root)) notes.push('An ESLint config already exists; add the moderate limits and the typescript-eslint no-floating-promises/no-misused-promises rules from the preset to it yourself.');
  else plan.push(['eslint.config.mjs', { from: join(PRESET, 'eslint.config.mjs.template') }]);
  if (existsSync(join(root, 'tsconfig.json'))) notes.push('A tsconfig.json already exists; make sure it sets allowJs, checkJs and noEmit and includes every scanned extension (.js, .mjs, .cjs, .jsx, .ts, .tsx, .mts, .cts), or type-aware rules report those files as parse errors.');
  else plan.push(['tsconfig.json', { from: join(PRESET, 'tsconfig.json.template') }]);
  if (await hasRuffConfig(root)) notes.push('A Ruff config already exists; set lint.mccabe.max-complexity = 15, lint.pylint.max-args = 5 and lint.pylint.max-statements = 40 in it yourself.');
  else plan.push(['ruff.toml', { from: join(PRESET, 'ruff.toml.template') }]);
  const written = [];
  const existing = [];
  for (const [path, source] of plan) {
    const target = join(root, path);
    if (existsSync(target)) {
      existing.push(path);
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    if (source.from) await copyFile(source.from, target);
    else await writeFile(target, source.text, { flag: 'wx' });
    written.push(path);
  }
  return {
    preset, root, languages, written, existing, notes,
    devDependencies: [...JS_DEV_DEPENDENCIES],
    pythonPackages: [...PYTHON_PACKAGES],
  };
}

export function renderInit(report) {
  const detected = Object.entries(report.languages).filter(([, on]) => on).map(([name]) => name).join(' and ') || 'no language yet';
  const lines = [`Code-health preset "${report.preset}" (JavaScript/TypeScript and Python; detected: ${detected}):`, ''];
  if (report.written.length) lines.push('Written:', ...report.written.map(path => `  ${path}`), '');
  if (report.existing.length) lines.push('Already present, left untouched:', ...report.existing.map(path => `  ${path}`), '');
  lines.push(...report.notes, ...(report.notes.length ? [''] : []));
  lines.push('Still to do:');
  if (report.devDependencies.length) lines.push(`  npm install --save-dev ${report.devDependencies.join(' ')}`);
  lines.push(`  pip install ${report.pythonPackages.join(' ')}   (or pipx/uvx; habit-sensors must be on PATH or in .venv)`);
  lines.push('  Commit these files. They are governed configuration, so the next `gatereeve code-health --base <integration branch>` reports UNAVAILABLE with an approval subject.');
  lines.push('  A human then approves that exact change: human.decide kind approve-code-health-config with that subject.');
  return `${lines.join('\n')}\n`;
}
