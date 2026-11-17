import { pathToFileURL } from 'node:url';
import { access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { classifyShellCommand, pushDestinations, destinationMatches } from './command-guard.js';
import { resolveEntryPoints, recoveryText, UNAVAILABLE } from './entry-point.js';

// A best-effort delivery-action guard, not a shell implementation or a sandbox.
// It denies recognized merges (`gh pr merge`, `gh api` merge endpoints) and
// `git push` to a configured integration or release branch. Normal edits, tests,
// commits and topic-branch pushes do not invoke milestone admission here.
// GitHub branch protection remains the real enforcement.
const BEST_EFFORT = 'This guard is best-effort; GitHub branch protection is the real enforcement.';
const exec = promisify(execFile);

function deny(reason) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
}

async function currentBranch(cwd, gitExecutable) {
  try { return (await exec(gitExecutable, ['-C', cwd, 'branch', '--show-current'], { encoding: 'utf8', timeout: 5000 })).stdout.trim() || null; }
  catch { return null; }
}

// Configured integration/release branches, across every configured repository.
// An unconfigured (Git fallback) workspace names none, so nothing is protected.
async function protectedBranches(cwd, contextFor) {
  try {
    const context = await contextFor({ cwd });
    const branches = new Map();
    for (const repository of context.repositories ?? []) {
      if (repository.releaseBranch) branches.set(repository.releaseBranch, 'release');
      if (repository.integrationBranch && !branches.has(repository.integrationBranch)) branches.set(repository.integrationBranch, 'integration');
    }
    return { branches, alias: context.repository?.alias ?? null };
  } catch { return { branches: new Map(), alias: null }; }
}

async function pushReasons(pushes, cwd, runtime, contextFor) {
  const reasons = [];
  for (const push of pushes) {
    // More possible directories than the guard tracks: deny rather than guess.
    if (push.overflow) { reasons.push('git push may run in more directories than the guard tracks; run it as a separate command.'); continue; }
    // Every repository the push could act on, resolved from the hook's directory;
    // a protected destination in any of them denies it. A location the guard
    // cannot name (push.unknown) is admitted: best-effort, never a guess.
    const directories = [...new Set((push.locations ?? []).map(steps => steps.reduce((at, next) => resolve(at, next ?? '.'), cwd)))];
    for (const directory of directories) reasons.push(...await directoryReasons(push, directory, runtime, contextFor));
  }
  return [...new Set(reasons)];
}

async function directoryReasons(push, directory, runtime, contextFor) {
  const reasons = [];
  const { branches } = await protectedBranches(directory, contextFor);
  if (!branches.size) return reasons;
  // The current branch matters only for an implicit destination or HEAD/@.
  const needsCurrent = !push.all && (push.refspecs.length === 0 || push.refspecs.some(spec => /(?:^\+?|:)(?:HEAD|@)$/u.test(spec)));
  const destinations = pushDestinations(push, needsCurrent ? await currentBranch(directory, runtime.gitExecutable ?? 'git') : null);
  for (const [branch, role] of branches) {
    if (destinations.some(destination => destinationMatches(destination, branch))) {
      reasons.push(`git push would update the configured ${role} branch ${branch}; it changes only through a reviewed PR and the protected merge.`);
    }
  }
  return reasons;
}

async function mergeReason(event) {
  try {
    const { CurrentCore } = await import('./core.js');
    const { contextFor } = await import('./adapter.js');
    const context = await contextFor({ cwd: event.cwd });
    await access(context.featureHome); // Missing configured records cannot authorize delivery.
    const core = await CurrentCore.at(context);
    if (!await core.store.active()) return 'Resume the preserved feature through the current protocol before merging.';
    const check = await core.check('merge');
    return check.allowed ? 'The milestone is eligible, but this shell command is not bound to the prepared PR action.'
      : `Merge milestone is blocked: ${check.missing.join('; ')}.`;
  } catch { return 'GateReeve could not validate the merge milestone.'; }
}

export async function preToolUse(event, runtime = {}) {
  const command = event?.tool_input?.command ?? event?.tool_input?.cmd;
  if (typeof command !== 'string') return {};
  const findings = classifyShellCommand(command);
  if (!findings.length) return {};
  const cwd = event.cwd ?? process.cwd();
  const merges = findings.filter(item => item.kind !== 'git-push');
  const pushes = findings.filter(item => item.kind === 'git-push');
  const { contextFor } = await import('./adapter.js');
  const reasons = pushes.length ? await pushReasons(pushes, cwd, runtime, contextFor) : [];
  if (merges.length) reasons.unshift(await mergeReason(event));
  if (!reasons.length) return {};
  const entry = await resolveEntryPoints({ env: runtime.env ?? process.env, ...(runtime.adapterPath !== undefined ? { adapterPath: runtime.adapterPath } : {}) });
  const { alias } = await protectedBranches(cwd, contextFor);
  const number = merges.find(item => item.number)?.number;
  const input = { repository: alias ?? '<alias>', number: number ?? '<PR>', method: merges.find(item => item.method)?.method ?? 'merge' };
  const recovery = recoveryText(entry, ['merge.prepare', 'merge.execute'], { cwd, requests: { 'merge.prepare': { input }, 'merge.execute': { input } } });
  const path = merges.length ? 'Prepare and execute the merge through the protected action'
    : 'Push a topic branch and open a PR instead; then prepare and execute its merge through the protected action';
  return deny(`${reasons.join(' ')} ${path} so the exact PR action is revalidated (merge.execute needs recorded human authorization). Entry points here: ${recovery}. ${BEST_EFFORT}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  try { process.stdout.write(`${JSON.stringify(await preToolUse(JSON.parse(input)))}\n`); }
  catch {
    let entry = UNAVAILABLE;
    try { entry = recoveryText(await resolveEntryPoints(), ['status']); } catch { /* Keep the unavailable text. */ }
    process.stdout.write(`${JSON.stringify(deny(`GateReeve hook input could not be validated. Retry with a valid host tool event; inspect state with ${entry}.`))}\n`);
  }
}
