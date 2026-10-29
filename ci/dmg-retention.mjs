import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ARTIFACT_NAME = 'gatereeve-universal-dmg';
export const WORKFLOW_PATH = '.github/workflows/plugin-ci.yml';
export const HOLDS_PATH = 'ci/dmg-retention-holds.json';
const check = (condition, message) => { if (!condition) throw new Error(message); };
const validId = id => Number.isSafeInteger(id) && id > 0;
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function parseHolds(value) {
  check(value?.schemaVersion === 1 && Array.isArray(value.holds)
    && Object.keys(value).sort().join() === 'holds,schemaVersion', 'Invalid holds document');
  const ids = new Set();
  for (const hold of value.holds) {
    check(hold && Object.keys(hold).sort().join() === 'artifactId,expiresAt,reason'
      && validId(hold.artifactId) && !ids.has(hold.artifactId)
      && typeof hold.reason === 'string' && hold.reason.trim().length > 0 && hold.reason.length <= 1000
      && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(hold.expiresAt ?? '')
      && time(hold.expiresAt)
      && new Date(hold.expiresAt).toISOString() === (hold.expiresAt.length === 20 ? hold.expiresAt.replace('Z', '.000Z') : hold.expiresAt),
    'Invalid, duplicate or non-expiring artifact hold');
    ids.add(hold.artifactId);
  }
  return value.holds;
}

async function readHolds(request, repository) {
  const file = await request(`repos/${repository}/contents/${HOLDS_PATH}?ref=main`);
  check(file?.type === 'file' && file.encoding === 'base64' && /^[a-f0-9]{40}$/u.test(file.sha ?? '')
    && typeof file.content === 'string' && file.content.length <= 1_000_000, 'Holds file unavailable or invalid');
  return { revision: file.sha, holds: parseHolds(JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'))) };
}

export async function listArtifacts(request, repository) {
  const found = new Map();
  for (let page = 1; ; page++) {
    check(page <= 10_000, 'Artifact pagination exceeded safety limit');
    const result = await request(`repos/${repository}/actions/artifacts?name=${ARTIFACT_NAME}&per_page=100&page=${page}`);
    check(Array.isArray(result?.artifacts) && result.artifacts.length <= 100, 'Invalid artifact inventory');
    const previousSize = found.size;
    for (const artifact of result.artifacts) {
      check(validId(artifact.id), 'Invalid artifact ID');
      const previous = found.get(artifact.id);
      check(!previous || JSON.stringify(previous) === JSON.stringify(artifact), 'Artifact changed during pagination; retry preview');
      found.set(artifact.id, artifact);
    }
    check(!result.artifacts.length || found.size > previousSize, 'Artifact pagination did not advance');
    if (result.artifacts.length < 100) return [...found.values()];
  }
}

function validateArtifact(artifact) {
  check(validId(artifact.id) && validId(artifact.workflow_run?.id) && time(artifact.created_at)
    && typeof artifact.expired === 'boolean' && Number.isSafeInteger(artifact.size_in_bytes)
    && artifact.size_in_bytes >= 0, 'Incomplete artifact metadata');
}
function validateRun(run, id, repository) {
  check(run?.id === id && run.repository?.full_name === repository
    && typeof run.path === 'string' && typeof run.status === 'string'
    && typeof run.head_branch === 'string' && typeof run.event === 'string'
    && (run.status !== 'completed' || ['success', 'failure', 'cancelled', 'timed_out', 'action_required', 'neutral', 'skipped', 'stale', 'startup_failure'].includes(run.conclusion)),
  'Run state unavailable or inconsistent');
}
const successfulMain = run => run.path === WORKFLOW_PATH && run.status === 'completed'
  && run.conclusion === 'success' && run.event === 'push' && run.head_branch === 'main';
const newestFirst = (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id;

export function planRetention(artifacts, runs, holds, now = Date.now()) {
  check(Number.isFinite(now), 'Invalid current time');
  const selected = artifacts.filter(a => a.name === ARTIFACT_NAME && !a.expired
    && successfulMain(runs.get(a.workflow_run?.id) ?? {})).sort(newestFirst)[0];
  return [...artifacts].sort(newestFirst).map(a => {
    const run = runs.get(a.workflow_run?.id);
    const hold = holds.find(h => h.artifactId === a.id && Date.parse(h.expiresAt) > now);
    const reason = a.name !== ARTIFACT_NAME ? 'other-artifact-name'
      : a.expired ? 'already-expired'
        : run?.path !== WORKFLOW_PATH ? 'other-workflow'
          : run.status !== 'completed' ? 'active-consumers'
            : hold ? 'unexpired-hold'
              : a.id === selected?.id ? 'latest-successful-main' : 'superseded-or-completed-branch';
    return { artifactId: a.id, runId: a.workflow_run?.id, name: a.name, bytes: a.size_in_bytes,
      createdAt: a.created_at, source: a.workflow_run?.head_sha ?? null, digest: a.digest ?? null,
      decision: reason === 'superseded-or-completed-branch' ? 'delete' : 'retain', reason,
      ...(hold ? { hold } : {}) };
  });
}

async function optionalGet(request, endpoint) {
  try { return await request(endpoint); }
  catch (error) { if (error.status === 404) return null; throw error; }
}

// Deletion never discovers targets outside the initial plan. All authority and
// live state reads fail closed. GitHub has no atomic run-state + artifact DELETE.
export async function cleanup({ request, repository, apply = false, previewHolds = null, now = () => Date.now(), save = async () => {} }) {
  check(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository), 'Invalid repository');
  check(!apply || previewHolds === null, 'Local holds are preview-only; deletion requires the live main policy');
  const report = { schemaVersion: 1, policy: 'ordinary-ci-dmg-retention/1', repository,
    mode: apply ? 'apply' : 'preview', startedAt: new Date(now()).toISOString(), plan: [], outcomes: [], errors: [] };
  try {
    const policy = previewHolds === null ? await readHolds(request, repository)
      : { revision: 'local-preview', holds: parseHolds(previewHolds) };
    report.holdsSource = previewHolds === null ? `${HOLDS_PATH}@main` : 'local-preview-only';
    report.holdsRevision = policy.revision;
    const artifacts = await listArtifacts(request, repository), runs = new Map();
    for (const a of artifacts.filter(a => a.name === ARTIFACT_NAME && !a.expired)) {
      validateArtifact(a);
      if (!runs.has(a.workflow_run.id)) {
        const run = await request(`repos/${repository}/actions/runs/${a.workflow_run.id}`);
        validateRun(run, a.workflow_run.id, repository); runs.set(run.id, run);
      }
    }
    report.plan = planRetention(artifacts, runs, policy.holds, now());
    const keeper = artifacts.filter(a => a.name === ARTIFACT_NAME && !a.expired
      && successfulMain(runs.get(a.workflow_run?.id) ?? {})).sort(newestFirst)[0];
    await save(report);
    if (apply) for (const item of [...report.plan].reverse().filter(item => item.decision === 'delete')) {
      // A newly uploaded artifact is never in this deletion set. If the selected
      // keeper disappears or its run restarts, stop rather than delete a fallback.
      if (keeper) {
        const retained = await optionalGet(request, `repos/${repository}/actions/artifacts/${keeper.id}`);
        check(retained && !retained.expired && retained.name === ARTIFACT_NAME
          && retained.workflow_run?.id === keeper.workflow_run.id, 'Retained main installer changed or disappeared');
        const run = await request(`repos/${repository}/actions/runs/${keeper.workflow_run.id}`);
        validateRun(run, keeper.workflow_run.id, repository);
        check(successfulMain(run), 'Retained main installer run no longer qualifies');
      }
      const current = await optionalGet(request, `repos/${repository}/actions/artifacts/${item.artifactId}`);
      if (!current) report.outcomes.push({ artifactId: item.artifactId, status: 'already-absent' });
      else {
        validateArtifact(current);
        check(current.name === ARTIFACT_NAME && current.workflow_run.id === item.runId
          && current.created_at === item.createdAt && current.size_in_bytes === item.bytes
          && (current.digest ?? null) === item.digest, 'Deletion target identity changed');
        const livePolicy = await readHolds(request, repository);
        check(livePolicy.revision === policy.revision, 'Holds changed during cleanup; preview again');
        const run = await request(`repos/${repository}/actions/runs/${item.runId}`);
        validateRun(run, item.runId, repository);
        const reason = run.path !== WORKFLOW_PATH ? 'other-workflow'
          : run.status !== 'completed' ? 'active-consumers'
            : successfulMain(run) && !successfulMain(runs.get(item.runId)) ? 'new-successful-main'
              : livePolicy.holds.some(h => h.artifactId === item.artifactId && Date.parse(h.expiresAt) > now()) ? 'unexpired-hold'
                : current.expired ? 'already-expired' : null;
        if (reason) report.outcomes.push({ artifactId: item.artifactId, status: 'skipped', reason });
        else {
          // DELETE is not automatically retried: an uncertain result stays
          // visible and a later sweep re-observes the ID before doing anything.
          try {
            await request(`repos/${repository}/actions/artifacts/${item.artifactId}`, { method: 'DELETE' });
            report.outcomes.push({ artifactId: item.artifactId, status: 'deleted', bytes: item.bytes });
          } catch (error) {
            if (error.status !== 404) throw error;
            report.outcomes.push({ artifactId: item.artifactId, status: 'already-absent' });
          }
        }
      }
      await save(report);
    }
  } catch (error) { report.errors.push(String(error.message).slice(0, 2000)); }
  report.completedAt = new Date(now()).toISOString();
  report.ok = report.errors.length === 0;
  await save(report);
  return report;
}

export function githubRequest(token, { fetcher = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  check(typeof token === 'string' && token.trim().length > 0, 'GitHub authentication required');
  return async (endpoint, { method = 'GET' } = {}) => {
    check(endpoint.startsWith('repos/') && !endpoint.includes('..'), 'Invalid GitHub API endpoint');
    for (let attempt = 0; ; attempt++) {
      const response = await fetcher(`https://api.github.com/${endpoint}`, { method, redirect: 'error',
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response.status === 204 ? null : response.json();
      const retry = response.status === 429 || response.status >= 500
        || response.status === 403 && (response.headers.get('retry-after') !== null || response.headers.get('x-ratelimit-remaining') === '0');
      const delay = Number(response.headers.get('retry-after') ?? 2 ** attempt);
      if (method === 'GET' && retry && attempt < 2 && Number.isFinite(delay) && delay >= 0 && delay <= 30) {
        await response.body?.cancel(); await sleep(delay * 1000); continue;
      }
      await response.body?.cancel();
      const error = new Error(`GitHub ${method} ${endpoint}: HTTP ${response.status}`);
      error.status = response.status; throw error;
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), options = { apply: false, repository: 'TrentBrown/gatereeve' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') options.apply = true;
    else if (['--repo', '--output', '--holds-file'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) options[({ '--repo': 'repository', '--output': 'output', '--holds-file': 'holdsFile' })[args[i]]] = args[++i];
    else throw new Error('Usage: node ci/dmg-retention.mjs [--repo owner/repo] [--output receipt.json] [--holds-file preview.json] [--apply]');
  }
  if (options.apply) check(process.env.GITHUB_ACTIONS === 'true'
    && process.env.GITHUB_WORKFLOW === 'CI installer retention' && process.env.GITHUB_REF === 'refs/heads/main'
    && process.env.GITHUB_REPOSITORY === options.repository && /^\d+$/u.test(process.env.GITHUB_RUN_ID ?? ''),
  'Apply through the serialized CI installer retention workflow on main; local execution is preview-only');
  if (options.holdsFile) options.previewHolds = JSON.parse(await readFile(options.holdsFile, 'utf8'));
  const token = process.env.GH_TOKEN || execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const save = async report => { if (options.output) { await mkdir(dirname(resolve(options.output)), { recursive: true }); await writeFile(options.output, JSON.stringify(report, null, 2)); } };
  const report = await cleanup({ ...options, request: githubRequest(token), save });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
