// One code-health run: scope, governed-change check, base and head sensor
// runs, the regression comparison, coaching and the result record.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { compare, regressionFindings } from './compare.js';
import { governedChange, identity } from './governed.js';
import { git, resolveTool, Unavailable } from './process.js';
import { changedFiles, readCommitted, readConfig, resolveRevisions } from './scope.js';
import { coach, sense, toolVersion, writeRunConfig } from './sensors.js';
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

const SETUP_REMEDY = 'Set it up with `gatereeve code-health init --preset moderate` (then install the tools it lists and get the config change approved), or ask a human to opt this run out (`human.decide` kind `opt-out-code-health`).';
const SETUP_CAUSES = new Set(['not-set-up', 'missing-tool', 'plugin-not-configured', 'incomplete-run']);

async function checkPlugin(root, head, config) {
  const problems = [];
  if (!(config.plugins ?? []).includes(PLUGIN)) problems.push(`\`plugins\` in .habit-hooks/config.toml does not include "${PLUGIN}"`);
  if (await readCommitted(root, head, `.habit-hooks/${PLUGIN}/config.toml`) === null) problems.push(`the vendored plugin .habit-hooks/${PLUGIN}/ is not committed`);
  for (const smell of GATEREEVE_SMELLS) {
    if (config.smells?.[smell]?.severity !== 'enforced') problems.push(`[smells."${smell}"] severity is not "enforced"`);
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
    result.tools.habitSensors = await toolVersion(sensors, env);

    const files = await changedFiles(root, result.mergeBase, result.head, config.files);
    result.scope.files = files;
    const headPaths = files.map(file => file.head);
    const basePaths = files.filter(file => file.base).map(file => file.base);

    let headTree = null;
    let headConfig = null;
    let headFindings = [];
    if (headPaths.length) {
      headTree = await trees.add(result.head, 'head');
      await trees.neutralize(headTree, headPaths);
      headConfig = await writeRunConfig(headTree, config, headPaths);
      headFindings = await sense({ executable: sensors, worktree: headTree, configPath: headConfig, env, timeoutMs, side: 'head' });
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
    if (outcome.groups.length && headTree) {
      result.coaching = await coach({ executable: mapper, worktree: headTree, configPath: headConfig, env, findings: regressionFindings(headFindings, outcome.groups) });
    }
    result.thresholds = await thresholds({ root, head: result.head, worktree: headTree, files: headPaths, env });
  } catch (error) {
    if (!(error instanceof Unavailable)) throw error;
    result.verdict = 'UNAVAILABLE';
    result.reasons.push({ cause: error.cause, message: error.message, ...(SETUP_CAUSES.has(error.cause) ? { remedy: SETUP_REMEDY } : {}) });
  } finally {
    await trees.cleanup();
  }
  return result;
}

export const exitCode = verdict => ({ PASS: 0, FAIL: 1 })[verdict] ?? 2;
