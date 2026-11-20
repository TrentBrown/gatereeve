# Spec - tb-final-review-handoff

## Acceptance Criteria

- **AC1.** Pattern review is opt-in. Default acceptance proceeds without pattern evaluation; explicit evaluation and historical records work.
- **AC2.** HTML explainer leads final review. Exact candidate HTML covers behavior, checks and findings; failure pauses and retries generation alone.
- **AC3.** Claude format recovery. Both supplied response shapes decode and ambiguous fallback fails with existing verdict checks intact.
- **AC4.** One targeted Claude retry. Retry format and field failures once on same candidate, retain valid Codex assessment, explain eligible history IDs and preserve findings and dispositions.
- **AC5.** Final scoped mutation execution. Opted-in run occurs after ordinary verification and paired review, uses pinned target and configured package filters and reuses identical inputs.
- **AC6.** Advisory evidence and pruning. Summary links to retained report; skipped, completed and unavailable results are distinguishable; pruning is opt-in.
- **AC7.** Legacy job recovery. New oversized IDs fail before checks; retained oversized operation reconciles once with original identity, verdict and receipts and unlocks subsequent writes.

- **AC8.** The first available and eligible configured preference for each provider is selected. After all preferences are exhausted or when none are configured, preserve judgment-based selection in that provider. Record the actual selection, effort and fallback rationale.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|---|---|---|---|
| R1 | AC1 - Pattern review is opt-in | Default acceptance proceeds without pattern evaluation; explicit evaluation and historical records work | Default invokes or waits for pattern review, or explicit use breaks | Default and explicit runs |
| R2 | AC2 - HTML explainer leads final review | Exact candidate HTML covers behavior, checks and findings; failure pauses and retries generation alone | Missing or stale explainer permits handoff or retry repeats review | Packet and retry scenarios |
| R3 | AC3 - Claude format recovery | Both supplied response shapes decode and ambiguous fallback fails with existing verdict checks intact | Usable output is lost or ambiguous or invalid evidence passes | Capture replays and ambiguous fixture |
| R4 | AC4 - One targeted Claude retry | Retry format and field failures once on same candidate, retain valid Codex assessment, explain eligible history IDs and preserve findings and dispositions | Extra retry, valid peer rerun, or lost material disposition | Paired review retry fixture |
| R5 | AC5 - Final scoped mutation execution | Opted-in run occurs after ordinary verification and paired review, uses pinned target and configured package filters and reuses identical inputs | Execution repeats inside fixes or reuses stale results | Invocation and cache tests |
| R6 | AC6 - Advisory evidence and pruning | Summary links to retained report; skipped, completed and unavailable results are distinguishable; pruning is opt-in | Mutation findings or errors block handoff or trigger pruning | Completed, skipped and timeout cases |
| R7 | AC7 - Legacy job recovery | New oversized IDs fail before checks; retained oversized operation reconciles once with original identity, verdict and receipts and unlocks subsequent writes | Checks rerun, evidence changes or later writes fail | 129-character legacy fixture |
| R8 | AC8 - Ordered reviewer preferences | Selects the first qualifying configured preference and records the selection, skips and fallback rationale without changing providers or switching models for format correction | Skips a qualifying preference, falls back outside the provider, or treats malformed output as model unavailability | First-choice, partial-availability, exhaustion, unset and same-model retry scenarios |
