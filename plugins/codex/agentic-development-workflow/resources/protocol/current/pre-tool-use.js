import { pathToFileURL } from 'node:url';
import { access } from 'node:fs/promises';

// A narrow delivery-action guard, not a shell parser or a filesystem sandbox.
// Normal edits, tests and commits do not invoke milestone admission here.
export async function preToolUse(event) {
  const command = event?.tool_input?.command ?? event?.tool_input?.cmd;
  if (typeof command !== 'string') return {};
  const directMerge = /(?:^|[;&|\n])\s*(?:[^\s'";|&]*\/)?gh\s+(?:(?:-R|--repo)\s+[^\s;|&]+\s+)?pr\s+merge(?:\s|$)/u.test(command);
  if (!directMerge) return {};
  let reason;
  try {
    const { CurrentCore } = await import('./core.js');
    const { contextFor } = await import('./adapter.js');
    const context = await contextFor({ cwd: event.cwd });
    await access(context.featureHome); // Missing configured records cannot authorize delivery.
    const core = await CurrentCore.at(context);
    if (!await core.store.active()) reason = 'Resume the preserved feature through the current protocol before merging.';
    else {
      const check = await core.check('merge');
      reason = check.allowed ? 'The milestone is eligible, but this shell command is not bound to the prepared PR action.'
        : `Merge milestone is blocked: ${check.missing.join('; ')}.`;
    }
  } catch { reason = 'GateReeve could not validate the merge milestone.'; }
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
    permissionDecisionReason: `${reason} Use gatereeve merge prepare and merge execute so the exact action is revalidated.` } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  try { process.stdout.write(`${JSON.stringify(await preToolUse(JSON.parse(input)))}\n`); }
  catch { process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'GateReeve hook input could not be validated. Retry with a valid host tool event.' } })+'\n'); }
}
