# Defect-class review - tb-configurable-gate-ordering

All three findings from ordering-s1-ready-1 are addressed as one asynchronous authority invariant: previews, cancellation and confirmation must refer to exactly the validated staged policy. Examined renderer mutation, dependency absorption, settings load/project switch, Discard, apply/confirmation and response-generation paths; main manager preserves owner ordering and rejects changed saved policy digest; preload/main IPC preserve ordering.

The new implementation snapshots ordering into both preview calls, invalidates validation and closes stale confirmation immediately on edits, captures exact validated IDs/ordering/policy digest for Apply, advances generations on Discard/settings load, rejects outdated responses and disables edits during application. Tests use the actual manager and renderer, deferred ordinary/dependency responses after Discard and new edits while confirmation is open; all pass. Full Desktop210 PASS.

Covered findings:
- advisory:ordering-s1-ready-1:0: Dependency absorption previews saved ordering while Apply submits staged ordering.
- advisory:ordering-s1-ready-1:1: Pending previews can restore changes after Discard.
- advisory:ordering-s1-ready-1:2: Apply can confirm newer ordering edits against an older preview.
