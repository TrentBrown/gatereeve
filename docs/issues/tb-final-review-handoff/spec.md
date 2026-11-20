# Spec - tb-final-review-handoff

## Acceptance Criteria

- **AC1.** Pattern review is opt-in. Default acceptance proceeds without pattern evaluation; explicit evaluation and historical records work.
- **AC2.** HTML explainer leads final review. Exact candidate HTML covers behavior, checks and findings; failure pauses and retries generation alone.
- **AC3.** Claude format recovery. Both supplied response shapes decode and ambiguous fallback fails with existing verdict checks intact.
- **AC4.** One targeted Claude retry. Retry format and field failures once on same candidate, retain valid Codex assessment, explain eligible history IDs and preserve findings and dispositions. A finding path with an omitted alias resolves only to one exact pinned source path.
- **AC5.** Final scoped mutation execution. Opted-in run occurs after ordinary verification and paired review, uses pinned target and configured package filters and reuses identical inputs.
- **AC6.** Advisory evidence and pruning. The local explainer and thread summary link to the report in the acceptance packet. Skipped, completed and unavailable results are distinguishable. Pruning is opt-in.
- **AC7.** Legacy job recovery. New oversized IDs fail before checks; retained oversized operation reconciles once with original identity, verdict and receipts and unlocks subsequent writes.

- **AC8.** The first available and eligible configured preference for each provider is selected. After all preferences are exhausted or when none are configured, preserve judgment-based selection in that provider. Record the actual selection, effort and fallback rationale.
- **AC9.** Reclaim completed review scratch when inactivity, ownership, and filesystem safety are established. On Linux, probe process activity without recursively walking the source view. Preserve active, mounted, held, unowned and uncertain runs. Preserve the compact receipt and durable workflow evidence. Report deferred cleanup with an exact retry, and reconcile the view record after cleanup.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|---|---|---|---|
| R1 | AC1 - Pattern review is opt-in | Default acceptance proceeds without pattern evaluation; explicit evaluation and historical records work | Default invokes or waits for pattern review, or explicit use breaks | Default and explicit runs |
| R2 | AC2 - HTML explainer leads final review | Exact candidate HTML covers behavior, checks and findings; failure pauses and retries generation alone | Missing or stale explainer permits handoff or retry repeats review | Packet and retry scenarios |
| R3 | AC3 - Claude format recovery | Both supplied response shapes decode and ambiguous fallback fails with existing verdict checks intact | Usable output is lost or ambiguous or invalid evidence passes | Capture replays and ambiguous fixture |
| R4 | AC4 - One targeted Claude retry | Retry format and field failures once on same candidate, retain valid Codex assessment, explain eligible history IDs and preserve findings and dispositions. Recover an omitted alias only for a unique pinned path | Extra retry, valid peer rerun, lost material disposition, or ambiguous source admitted | Paired review retry and ambiguous path fixtures |
| R5 | AC5 - Final scoped mutation execution | Opted-in run occurs after ordinary verification and paired review, uses pinned target and configured package filters and reuses identical inputs | Execution repeats inside fixes or reuses stale results | Invocation and cache tests |
| R6 | AC6 - Advisory evidence and pruning | The local explainer and thread summary link to the retained advisory report. Skipped, completed and unavailable results are distinguishable. Pruning is opt-in | Local handoff lacks the report link when available, or advisory outcomes block handoff or trigger pruning | Completed, skipped and timeout cases |
| R7 | AC7 - Legacy job recovery | New oversized IDs fail before checks; retained oversized operation reconciles once with original identity, verdict and receipts and unlocks subsequent writes | Checks rerun, evidence changes or later writes fail | 129-character legacy fixture |
| R8 | AC8 - Ordered reviewer preferences | Selects the first qualifying configured preference and records the selection, skips and fallback rationale without changing providers or switching models for format correction | Skips a qualifying preference, falls back outside the provider, or treats malformed output as model unavailability | First-choice, partial-availability, exhaustion, unset and same-model retry scenarios |
| R9 | AC9 - Reclaim completed review scratch | Uses a Linux activity probe without a recursive view traversal, preserves safety checks and receipts, explains deferrals, and reconciles after exact cleanup | Eligible view retained because activity probing scales with the tree, unsafe removal, missing receipt, or stale view after exact cleanup | Linux large-tree benchmark, live working directory and hard-link handles, macOS fallback, hold, mount, identity and exact-run retry fixtures |
