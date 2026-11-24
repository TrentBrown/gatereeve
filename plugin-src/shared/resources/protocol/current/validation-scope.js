import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { requireThat, text } from './contracts.js';
const exec = promisify(execFile);

// Fetch observations ourselves. Caller-provided assertions are never CI receipts.
export async function fetchValidationRun(repository, run, attempt) {
  requireThat(/^[\w.-]+\/[\w.-]+$/.test(repository) && /^\d+$/.test(String(run)) && /^\d+$/.test(String(attempt)), 'CI scope needs repository, run and attempt');
  const base = `repos/${repository}/actions/runs/${run}/attempts/${attempt}`;
  const get = async (path, pages = false) => JSON.parse((await exec('gh', ['api', path, ...(pages ? ['--paginate', '--slurp'] : [])], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 })).stdout);
  const [details, pages] = await Promise.all([get(base), get(`${base}/jobs?per_page=100`, true)]);
  return { ...details, jobs: pages.flatMap(page => page.jobs ?? []) };
}
// `treeOf(alias, sha)` resolves a commit's tree locally (null when unknown).
export async function validationScope(configuration, candidate, fetchRun = fetchValidationRun, treeOf = async () => null) {
  const scope = configuration.validation;
  if (!scope) return { kind: 'unknown', limitation: 'No broad CI scope or independently assessed local alternative is recorded.' };
  if (scope.kind === 'alternative') {
    text(scope.reason, 'Alternative coverage reason'); text(scope.scope, 'Alternative coverage scope');
    return { kind: 'alternative', reason: scope.reason, scope: scope.scope, assurance: 'Proposed by implementer; actual local receipts and sufficiency require independent assessment.' };
  }
  requireThat(scope.kind === 'ci' && Array.isArray(scope.runs) && scope.runs.length > 0, 'Validation scope needs CI runs or an explicit alternative');
  const runs = [];
  for (const request of scope.runs) {
    const repo = candidate.repositories.find(repo => repo.alias === request.alias);
    requireThat(repo && !runs.some(run => run.alias === request.alias), 'CI scope needs distinct selected repositories');
    requireThat(Array.isArray(request.requiredChecks) && request.requiredChecks.length && request.requiredChecks.every(name => typeof name === 'string' && name.trim()), 'Declare required broad CI checks');
    const observed = await fetchRun(request.repository, request.run, request.attempt);
    // A CI run for a different tree is refused naming both trees (spec AC9);
    // the same tree on another commit is still not the exact candidate head.
    const candidateTree = await treeOf(request.alias, repo.head);
    const observedTree = observed.head_commit?.tree_id ?? await treeOf(request.alias, observed.head_sha);
    if (observed.head_sha !== repo.head) {
      requireThat(!observedTree || !candidateTree || observedTree === candidateTree,
        `CI run ${request.run} for ${request.alias} ran on tree ${observedTree} (head ${observed.head_sha}), which differs from the reviewed candidate tree ${candidateTree} (head ${repo.head})`);
      requireThat(false, `CI run ${request.run} for ${request.alias} ran on head ${observed.head_sha}, not the exact candidate head ${repo.head}${observedTree ? ` (same tree ${observedTree})` : ''}; acceptance needs CI on the exact candidate head`);
    }
    requireThat(observed.status === 'completed', 'CI run must complete on the exact candidate');
    // An empty job set is the absence of CI, never a passing CI scope.
    requireThat(observed.jobs.length > 0, `CI run ${request.run} reported no CI checks for ${request.alias}; no CI checks is not passing CI. Use an explicit local alternative with agent-run receipts`);
    const jobs = observed.jobs.map(job => ({ id: job.id, name: job.name, status: job.status, conclusion: job.conclusion, startedAt: job.started_at, completedAt: job.completed_at, url: job.html_url }));
    requireThat(request.requiredChecks.every(name => jobs.some(job => job.name === name && job.status === 'completed' && job.conclusion === 'success')), 'Required CI scope is missing, skipped or unsuccessful');
    runs.push({ alias: request.alias, repository: request.repository, run: String(request.run), attempt: String(request.attempt), head: observed.head_sha, tree: candidateTree,
      requiredChecks: request.requiredChecks, jobs, observedAt: new Date().toISOString() });
  }
  requireThat(candidate.repositories.every(repo => runs.some(run => run.alias === repo.alias)), 'CI backstop must cover selected repositories or use an assessed alternative');
  return { kind: 'ci', runs, assurance: 'Observed jobs; required scope is declared and independently assessed, not inferred from a green badge.' };
}
