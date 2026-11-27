// Effective thresholds, read from the tools themselves (design D16): ESLint's
// resolved configuration for a scoped file, and Ruff's settings tables.
import { parseToml, resolveTool, run } from './process.js';
import { readCommitted } from './scope.js';

const ESLINT_RULES = {
  'max-lines-per-function': 'functionLines',
  'max-params': 'parameters',
  complexity: 'complexity',
  'max-depth': 'depth',
  'max-lines': 'fileLines',
};

function ruleLimit(entry) {
  if (!Array.isArray(entry)) return null;
  const [level, option] = entry;
  if (level === 0 || level === 'off') return 'off';
  if (typeof option === 'number') return option;
  if (option && typeof option === 'object') return option.max ?? option.maximum ?? null;
  return null;
}

async function eslintThresholds(worktree, files, env) {
  const file = files.find(path => /\.(?:[cm]?[jt]sx?)$/.test(path));
  const eslint = await resolveTool('eslint', { root: worktree, env });
  if (!file || !eslint) return null;
  const result = await run(eslint, ['--print-config', file], { cwd: worktree, env, timeoutMs: 120000 });
  if (result.code !== 0) return null;
  try {
    const rules = JSON.parse(result.stdout).rules ?? {};
    return Object.fromEntries(Object.entries(ESLINT_RULES).map(([rule, name]) => [name, ruleLimit(rules[rule])]));
  } catch {
    return null;
  }
}

async function ruffThresholds(root, head) {
  for (const [path, prefix] of [['ruff.toml', []], ['.ruff.toml', []], ['pyproject.toml', ['tool', 'ruff']]]) {
    const text = await readCommitted(root, head, path);
    if (text === null) continue;
    const parsed = prefix.reduce((value, key) => value?.[key], await parseToml(text));
    if (!parsed) continue;
    const lint = parsed.lint ?? parsed;
    return {
      complexity: lint.mccabe?.['max-complexity'] ?? null,
      parameters: lint.pylint?.['max-args'] ?? null,
      statements: lint.pylint?.['max-statements'] ?? null,
      branches: lint.pylint?.['max-branches'] ?? null,
      source: path,
    };
  }
  return null;
}

export async function thresholds({ root, head, worktree, files, env }) {
  return {
    eslint: worktree ? await eslintThresholds(worktree, files, env) : null,
    ruff: await ruffThresholds(root, head).catch(() => null),
  };
}
