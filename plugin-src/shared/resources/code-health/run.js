// One code-health run: scope, governed-change check, base and head sensor
// runs, the regression comparison, coaching and the result record.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { compare, regressionFindings } from './compare.js';
import { governedChange, identity } from './governed.js';
import { git, resolveTool, selector, Unavailable } from './process.js';
import { changedFiles, readCommitted, readConfig, resolveRevisions } from './scope.js';
import { coach, sense, toolVersion, writeRunConfig } from './sensors.js';
import { missingTooling, toolVersions } from './tools.js';
import { thresholds } from './thresholds.js';
import { Worktrees } from './worktree.js';
import { withScratch } from '../storage/scratch.js';

export const POLICY = 'code-health/1';
export const PLUGIN = 'gatereeve';
export const GATEREEVE_SMELLS = Object.freeze([
  '@typescript-eslint/no-floating-promises',
  '@typescript-eslint/no-misused-promises',
  'swallowed-exception',
]);

const OPT_OUT = 'or ask a human to opt this run out (`human.decide` kind `opt-out-code-health`).';
const SETUP_REMEDY = `Set it up with \`gatereeve code-health init --preset moderate\` (then install the tools it lists and get the config change approved), ${OPT_OUT}`;
const TOOLING_REMEDY = `Check the Habit Hooks installation and its tools (\`workflow-doctor --repository <path>\` lists what is missing), re-run \`gatereeve code-health init --preset moderate\` if the setup is incomplete, ${OPT_OUT}`;
const REMEDIES = { 'not-set-up': SETUP_REMEDY, 'plugin-not-configured': SETUP_REMEDY, 'missing-tool': SETUP_REMEDY, 'incomplete-run': TOOLING_REMEDY, 'sensor-failed': TOOLING_REMEDY, 'internal-error': TOOLING_REMEDY };
const LANGUAGES = [/\.(?:[cm]?[jt]sx?)$/, /\.pyi?$/];

async function checkPlugin(root, head, config) {
  const problems = [];
  if (!(config.plugins ?? []).includes(PLUGIN)) problems.push(`\`plugins\` in .habit-hooks/config.toml does not include "${PLUGIN}"`);
  if (await readCommitted(root, head, `.habit-hooks/${PLUGIN}/config.toml`) === null) problems.push(`the vendored plugin .habit-hooks/${PLUGIN}/ is not committed`);
  for (const smell of GATEREEVE_SMELLS) {
    if (config.smells?.[smell]?.severity !== 'enforced') problems.push(`[smells."${smell}"] severity is not "enforced"`);
    if (config.smells?.[smell]?.disabled === true) problems.push(`[smells."${smell}"] is disabled`);
  }
  if (problems.length) {
    throw new Unavailable('plugin-not-configured', `The GateReeve Habit Hooks plugin is not configured: ${problems.join('; ')}.`);
  }
}

function approvalMessage(governed) {
  const lines = governed.changes.map(change => `  ${change.path}: ${change.base ? (change.head ? 'changed' : 'removed') : 'added'}`);
  return [
    'Governed code-health configuration changed since the merge base and no matching human approval was supplied:',
    ...lines,
    `Approval subject: ${governed.subject}`,
    `A human approves this exact change with \`human.decide\` kind \`approve-code-health-config\`, subject ${governed.subject}. Any later edit to these files needs a new approval.`,
  ].join('\n');
}

// One tracked file per language the configuration selects but the change does
// not touch, so a missing plugin or tool for that language is found even when
// the change has no file in it. Probe findings never enter the comparison.
async function probeFiles(root, head, globs, headPaths) {
  const select = selector(globs);
  const output = await git(root, ['ls-tree', '-r', '-z', head]);
  const files = output.split('\0').filter(Boolean)
    .filter(entry => entry.startsWith('100'))
    .map(entry => entry.slice(entry.indexOf('\t') + 1))
    .filter(path => select(path));
  return LANGUAGES.filter(pattern => !headPaths.some(path => pattern.test(path)))
    .map(pattern => files.find(path => pattern.test(path)))
    .filter(Boolean);
}

async function cacheDirectory(root, env) {
  if (env.GATEREEVE_CODE_HEALTH_CACHE) return env.GATEREEVE_CODE_HEALTH_CACHE;
  const common = (await git(root, ['rev-parse', '--git-common-dir'])).trim();
  return join(isAbsolute(common) ? common : resolve(root, common), 'gatereeve-code-health');
}

async function cached(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function store(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

export async function runCodeHealth({
  cwd = process.cwd(), base, approved = [], env = process.env, habitSensors, habitMapper,
  timeoutMs = 600000, useCache = true,
}) {
  const result = {
    schemaVersion: 1, policy: POLICY, verdict: 'UNAVAILABLE', base, mergeBase: null, head: null, headTree: null,
    scope: { files: [] }, governed: { subject: null, matched: null, changes: [], hashes: {} },
    counts: {}, groups: [], findings: { new: [], preExisting: [], advisory: [] }, thresholds: null,
    tools: {}, coaching: '', reasons: [], cache: { hit: false },
  };
  return withScratch({ purpose: 'code-health worktrees' }, scratch => evaluate(result, { cwd, base, approved, env, habitSensors, habitMapper, timeoutMs, useCache, scratch: scratch.path }));
}

async function evaluate(result, { cwd, base, approved, env, habitSensors, habitMapper, timeoutMs, useCache, scratch }) {
  const trees = new Worktrees(cwd, { scratch });
  try {
    if (!base) throw new Unavailable('invalid-base', 'A --base ref is required');
    const root = (await git(cwd, ['rev-parse', '--show-toplevel'])).trim();
    trees.root = root;
    Object.assign(result, await resolveRevisions(root, base));
    const { config } = await readConfig(root, result.head);
    await checkPlugin(root, result.head, config);

    const governed = await governedChange(root, result.mergeBase, result.head);
    result.governed = { subject: governed.subject, matched: null, changes: governed.changes, hashes: governed.hashes };
    if (governed.subject) {
      if (!approved.includes(governed.subject)) throw new Unavailable('unapproved-config', approvalMessage(governed));
      result.governed.matched = governed.subject;
    }

    const sensors = await resolveTool('habit-sensors', { root, override: habitSensors ?? env.GATEREEVE_HABIT_SENSORS, env });
    if (!sensors) throw new Unavailable('missing-tool', 'habit-sensors is not installed (install `habit-hooks` and its plugins, for example `pip install habit-hooks habit-hooks-python habit-hooks-typescript`).');
    const mapper = await resolveTool('habit-mapper', { root, override: habitMapper ?? env.GATEREEVE_HABIT_MAPPER ?? join(dirname(sensors), 'habit-mapper'), env });
    if (!mapper) throw new Unavailable('missing-tool', 'habit-mapper (part of habit-hooks) is not installed next to habit-sensors; coaching cannot be rendered.');
    result.tools = await toolVersions({ root, sensors, sensorsVersion: await toolVersion(sensors, env), env });
    const missing = await missingTooling({ root, head: result.head, config, env, sensors });
    if (missing.length) throw new Unavailable('missing-tool', `Code-health tooling is missing:\n  ${missing.join('\n  ')}`);

    const files = await changedFiles(root, result.mergeBase, result.head, config.files);
    result.scope.files = files;
    const headPaths = files.map(file => file.head);
    const basePaths = files.filter(file => file.base).map(file => file.base);
    const probes = await probeFiles(root, result.head, config.files, headPaths);
    result.scope.probes = probes;

    let headTree = null;
    let headConfig = null;
    let headFindings = [];
    if (headPaths.length || probes.length) {
      headTree = await trees.add(result.head, 'head');
      await trees.neutralize(headTree, headPaths);
      headConfig = await writeRunConfig(headTree, config, [...headPaths, ...probes]);
      const scoped = new Set(headPaths);
      headFindings = (await sense({ executable: sensors, worktree: headTree, configPath: headConfig, env, timeoutMs, side: 'head', probes }))
        .map(finding => ({ ...finding, issues: finding.issues.filter(issue => scoped.has(issue.details?.file ?? issue.key)) }))
        .filter(finding => finding.issues.length);
    }

    let baseFindings = [];
    if (basePaths.length) {
      const key = identity({ policy: POLICY, mergeBase: result.mergeBase, files: files.filter(file => file.base), governed: governed.hashes, tools: result.tools, config });
      const path = join(await cacheDirectory(root, env), `${key.slice(7)}.json`);
      const hit = useCache ? await cached(path) : null;
      if (hit) {
        baseFindings = hit;
        result.cache = { hit: true, key };
      } else {
        const baseTree = await trees.add(result.mergeBase, 'base');
        await trees.overlay(baseTree, result.head, governed.baseHashes, governed.hashes);
        await trees.neutralize(baseTree, basePaths);
        const baseConfig = await writeRunConfig(baseTree, config, basePaths);
        baseFindings = await sense({ executable: sensors, worktree: baseTree, configPath: baseConfig, env, timeoutMs, side: 'merge base' });
        result.cache = { hit: false, key };
        if (useCache) await store(path, baseFindings).catch(() => {});
      }
    }

    const outcome = compare({ baseFindings, headFindings, config, files });
    Object.assign(result, { verdict: outcome.verdict, counts: outcome.counts, groups: outcome.groups, findings: outcome.findings });
    if (outcome.groups.length) {
      const coaching = await coach({ executable: mapper, worktree: headTree, configPath: headConfig, env, findings: regressionFindings(headFindings, outcome.groups) });
      result.coaching = coaching.text;
      if (coaching.error) result.reasons.push({ cause: 'coaching-failed', message: coaching.error });
    }
    result.thresholds = await thresholds({ root, head: result.head, worktree: headTree, files: headPaths, env });
  } catch (error) {
    result.verdict = 'UNAVAILABLE';
    const unavailable = error instanceof Unavailable;
    const cause = unavailable ? error.cause : 'internal-error';
    const message = unavailable ? error.message : `The code-health check could not run: ${error.message}`;
    result.reasons.push({ cause, message, ...(REMEDIES[cause] ? { remedy: REMEDIES[cause] } : {}) });
  } finally {
    await trees.cleanup().catch(() => {});
  }
  return result;
}

export const exitCode = verdict => ({ PASS: 0, FAIL: 1 })[verdict] ?? 2;
