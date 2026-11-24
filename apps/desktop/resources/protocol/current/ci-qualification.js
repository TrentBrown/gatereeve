import { requireThat } from './contracts.js';
import { checkIdentity } from './coverage.js';

// Runner-role CI qualification after review convergence (spec AC9, D25). No
// model is called: a passing `ci` Verification for the reviewed tree keeps the
// converged reviews qualifying when every local receipt they consumed is
// covered. A consumed receipt is covered when its check (`ciCheck`, else its
// purpose) is among the CI run's passing required checks for its repository,
// or when the CI Verification itself carries a passing receipt of the same
// check on the identical tree. Different trees were refused when the CI
// Verification was recorded (validation-scope.js).
export const CI_QUALIFICATION = 'ci-after-convergence/1';

const describe = receipt => `${receipt.repository}: ${receipt.purpose} (${[receipt.command, ...receipt.args].join(' ')})`;

export async function isCiVerification(core, ref) {
  try {
    const report = await core.store.json(ref);
    return report.gate === 'verification' && Boolean(report.runner) && (await core.store.json(report.runner)).validation?.kind === 'ci';
  } catch { return false; }
}

// Returns { policy, outcome, ci, consumed, trees, covered, uncovered, reason }.
// The CI Verification must already be current for the candidate (its head is
// the exact candidate head); this checks the facts the reviews relied on.
export async function qualifyCi(core, state, candidate, ciRef, consumedRefs, memo = new Map()) {
  const ci = await core.currentResult(ciRef, candidate, state, new Set(), memo, false);
  requireThat(ci.gate === 'verification' && ci.outcome === 'PASS', 'CI qualification needs a passing ci Verification');
  const runner = await core.store.json(ci.runner);
  requireThat(runner.validation?.kind === 'ci', 'CI qualification needs a ci Verification');
  const trees = runner.validation.runs.map(run => ({ alias: run.alias, head: run.head, tree: run.tree ?? null }));
  // The run must be on the exact candidate head: a same-tree other commit
  // (amended or empty commit) is not the candidate (spec AC9).
  const wrongHead = runner.validation.runs.filter(run => candidate.repositories.find(repo => repo.alias === run.alias)?.head !== run.head)
    .map(run => `${run.alias}: CI ran on ${run.head}, not the candidate head ${candidate.repositories.find(repo => repo.alias === run.alias)?.head ?? 'unknown'}`);
  // The CI scope the converged reviews assessed: every planned job declared by
  // the consumed local Verifications must be required and successful here.
  const planned = new Set();
  for (const ref of consumedRefs) {
    if (ref.hash === ciRef.hash) continue;
    try {
      const report = await core.store.json(ref);
      if (report.gate === 'verification' && report.runner) for (const name of (await core.store.json(report.runner)).validation?.ciRequiredChecks ?? []) planned.add(name);
    } catch { /* unreadable consumed proof is reported below as uncovered */ }
  }
  const unplanned = planned.size ? [] : ['the converged reviews assessed no planned CI scope (validation.ciRequiredChecks on the consumed Verification)'];
  const missingPlanned = [...planned].filter(name => !runner.validation.runs.some(run => run.requiredChecks.includes(name)
    && run.jobs.some(job => job.name === name && job.status === 'completed' && job.conclusion === 'success')));
  const failedRequired = runner.validation.runs.flatMap(run => run.requiredChecks.filter(name =>
    !run.jobs.some(job => job.name === name && job.status === 'completed' && job.conclusion === 'success')).map(name => `${run.alias}: ${name}`));
  const passing = new Map(runner.validation.runs.map(run => [run.alias, new Set(run.requiredChecks.filter(name =>
    run.jobs.some(job => job.name === name && job.status === 'completed' && job.conclusion === 'success')))]));
  const sameTree = new Set((runner.receipts ?? []).filter(item => item.outcome === 'PASS').map(checkIdentity));
  const covered = [], uncovered = [];
  for (const ref of consumedRefs) {
    if (ref.hash === ciRef.hash) continue;
    const report = await core.store.json(ref);
    if (report.gate !== 'verification' || !report.runner) continue;
    for (const receipt of (await core.store.json(report.runner)).receipts ?? []) {
      const by = passing.get(receipt.repository)?.has(receipt.ciCheck ?? receipt.purpose) ? 'ci-required-check'
        : sameTree.has(checkIdentity(receipt)) ? 'same-tree-receipt' : null;
      (by ? covered : uncovered).push({ verification: ref.hash, receipt: describe(receipt), ...(by ? { by } : {}) });
    }
  }
  // No reviewer assesses the post-convergence CI scope, so the agent-declared
  // required list is not trusted alone: every job of the observed run must
  // succeed or be skipped (spec AC9 "every required check passed").
  const failedJobs = runner.validation.runs.flatMap(run => run.jobs.filter(job => !(job.status === 'completed' && ['success', 'skipped'].includes(job.conclusion)))
    .map(job => `${run.alias}: ${job.name} (${job.status}/${job.conclusion ?? 'none'})`));
  const reasons = [...wrongHead, ...unplanned, ...missingPlanned.map(name => `planned CI check ${name} is not a passing required check of the run`),
    ...failedRequired.map(name => `required CI check ${name} did not pass`),
    ...failedJobs.map(name => `CI job ${name} did not succeed`),
    ...uncovered.map(row => `consumed local receipt ${row.receipt} from Verification ${row.verification} is not covered by a passing required CI check or a same-tree receipt in the final Verification`)];
  return { policy: CI_QUALIFICATION, outcome: reasons.length ? 'FAIL' : 'PASS', ci: ciRef.hash, consumed: consumedRefs.map(ref => ref.hash),
    trees, covered, uncovered, reason: reasons.length ? `CI qualification failed: ${reasons.join('; ')}` : 'CI qualified the converged reviews without a model call' };
}
