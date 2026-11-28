// Running Habit Hooks: one `habit-sensors --all` per side over an explicit
// file list, and `habit-mapper` for coaching. Anything short of a clean JSON
// array of findings makes the result UNAVAILABLE.
import { realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { run, stringifyToml, Unavailable } from './process.js';

// Habit Hooks 1.5.0 `catalogue.DEFAULT_SEVERITY`. Project `[smells.<name>]`
// overrides win; smells the catalogue does not name follow `uncoached`.
export const DEFAULT_SEVERITY = Object.freeze({
  'oversized-function': 'enforced', 'too-many-parameters': 'enforced', 'high-complexity': 'enforced',
  'deep-nesting': 'enforced', 'oversized-file': 'enforced', 'oversized-block': 'enforced',
  'unused-variable': 'enforced', 'loose-equality': 'enforced', 'var-declaration': 'enforced',
  'non-const-binding': 'enforced', 'duplicate-import': 'enforced', 'warning-comment': 'suggested',
  'explicit-any': 'suggested', 'non-null-assertion': 'suggested', 'redundant-type-annotation': 'enforced',
  'non-essential-comment': 'suggested', 'duplicated-code': 'suggested', 'unused-class-member': 'enforced',
  'unused-file': 'enforced', 'unused-export': 'enforced', 'test-only-dead-code': 'enforced',
  'unused-dependency': 'enforced', 'unused-import': 'enforced', 'swallowed-exception': 'suggested',
  'parse-error': 'enforced', 'incomplete-run': 'enforced',
});

export const BROKEN_RUN_SMELLS = Object.freeze(['incomplete-run', 'parse-error']);

export function severityOf(smell, config) {
  const override = config.smells?.[smell];
  if (override?.severity) return override.severity === 'enforced' ? 'enforced' : 'suggested';
  if (smell in DEFAULT_SEVERITY) return DEFAULT_SEVERITY[smell];
  return config.uncoached === 'enforce' ? 'enforced' : 'suggested';
}

export function disabledSmell(smell, config) {
  if (config.smells?.[smell]?.disabled === true) return true;
  const uncoached = !(smell in DEFAULT_SEVERITY) && !config.smells?.[smell]?.severity;
  return uncoached && config.uncoached === 'ignore';
}

export async function toolVersion(executable, env) {
  const result = await run(executable, ['--version'], { env, timeoutMs: 30000 });
  if (result.code !== 0) throw new Unavailable('missing-tool', `${executable} --version failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout.trim();
}

// The run's configuration is the head's, with `files` replaced by the exact
// scoped list for this side, written next to (not over) the committed config.
// Never through a symlink: the target is unlinked and recreated, and its
// directory must resolve inside the temporary worktree.
export async function writeRunConfig(worktree, config, files) {
  const directory = join(worktree, '.habit-hooks');
  const [base, parent] = await Promise.all([realpath(worktree), realpath(directory)]);
  if (parent !== join(base, '.habit-hooks')) throw new Unavailable('invalid-config', '.habit-hooks resolves outside the repository; refusing to write the run configuration');
  const path = join(directory, '.gatereeve-code-health.toml');
  await rm(path, { force: true });
  await writeFile(path, stringifyToml({ ...config, files }), { flag: 'wx' });
  return path;
}

// An issue names its file: details.file when present, else key. Either way it
// must be a non-empty string, or the run's output is malformed.
const nonEmpty = value => typeof value === 'string' && value.length > 0;
const validIssue = issue => issue && typeof issue === 'object' && !Array.isArray(issue)
  && (issue.details === undefined || (issue.details && typeof issue.details === 'object'))
  && (issue.details?.file === undefined ? nonEmpty(issue.key) : nonEmpty(issue.details.file));

function validFindings(value) {
  return Array.isArray(value) && value.every(finding => finding && nonEmpty(finding.smell)
    && Array.isArray(finding.issues) && finding.issues.every(validIssue));
}

// Habit Hooks may report a file as './x' or as an absolute path; compare and
// scope by the repository-relative path only.
function relativeFile(file, worktree) {
  if (typeof file !== 'string') return file;
  let path = file.replace(/\\/g, '/');
  const root = worktree.replace(/\\/g, '/').replace(/\/$/, '');
  if (path.startsWith(`${root}/`)) path = path.slice(root.length + 1);
  return path.replace(/^(\.\/)+/, '');
}

export async function sense({ executable, worktree, configPath, env, timeoutMs, side, probes = [] }) {
  const result = await run(executable, ['--all', '--config', configPath], { cwd: worktree, env, timeoutMs });
  const tail = (result.stderr || '').trim().split('\n').slice(-3).join(' | ');
  if (result.timedOut) throw new Unavailable('sensor-failed', `habit-sensors timed out on the ${side} after ${timeoutMs} ms`);
  if (result.code !== 0) throw new Unavailable('sensor-failed', `habit-sensors exited ${result.code ?? result.signal} on the ${side}${tail ? `: ${tail}` : ''}`);
  let findings;
  try {
    findings = JSON.parse(result.stdout);
  } catch {
    throw new Unavailable('sensor-failed', `habit-sensors emitted output on the ${side} that is not JSON`);
  }
  if (!validFindings(findings)) throw new Unavailable('sensor-failed', `habit-sensors emitted JSON on the ${side} that is not a findings array`);
  for (const finding of findings) for (const issue of finding.issues) {
    if (issue.details?.file) issue.details.file = relativeFile(issue.details.file, worktree);
    else if (typeof issue.key === 'string' && !issue.details?.content) issue.key = relativeFile(issue.key, worktree);
    // Validated again after normalization: './', the worktree itself or any
    // path still absolute (outside the worktree) names no file in scope, and an issue without one would be dropped from scope, not
    // counted (round 8 codex/F17).
    const file = issue.details?.file ?? issue.key;
    if (!nonEmpty(file) || file === '.' || file === worktree || file.startsWith('/') || /^[A-Za-z]:[\\/]/.test(file)) throw new Unavailable('sensor-failed', `habit-sensors emitted JSON on the ${side} with an issue that names no file`);
  }
  // A probe file only shows that the tools run; its own parse errors are not
  // this change's concern. Tooling failures (incomplete-run) still count.
  const ignored = new Set(probes);
  const broken = findings
    .map(finding => ({ ...finding, issues: finding.issues.filter(issue => !(finding.smell === 'parse-error' && ignored.has(issue.details?.file ?? issue.key))) }))
    .filter(finding => BROKEN_RUN_SMELLS.includes(finding.smell) && finding.issues.length);
  if (broken.length) {
    const detail = broken.flatMap(finding => finding.issues.map(issue => `${finding.smell}: ${issue.details?.file ?? ''} ${issue.details?.message ?? issue.details?.content ?? issue.key}`.trim()));
    throw new Unavailable('incomplete-run', `The ${side} run did not complete cleanly:\n  ${detail.slice(0, 10).join('\n  ')}`, { issues: detail });
  }
  return findings;
}

// Coaching is Habit Hooks' own: the mapper renders guides for whatever
// findings it is given, so it receives only the regressions.
export async function coach({ executable, worktree, configPath, env, findings }) {
  if (findings.length === 0) return { text: '', error: null };
  const result = await run(executable, ['--config', configPath], { cwd: worktree, env, input: JSON.stringify(findings), timeoutMs: 120000 });
  // habit-mapper exits 1 when it coached an enforced smell; that is success.
  if (result.code === null || result.code > 1 || !result.stdout.trim()) {
    const detail = (result.stderr || result.stdout || String(result.code ?? result.signal)).trim().split('\n').slice(-2).join(' | ');
    return { text: '', error: `habit-mapper could not render coaching (${detail}); the regressions are listed below without it.` };
  }
  return { text: result.stdout.trim(), error: null };
}
