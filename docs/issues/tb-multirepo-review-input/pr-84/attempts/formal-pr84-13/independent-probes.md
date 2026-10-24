# Independent retention repair probes

Preliminary independent repair evidence; this is not formal code-review, spec-evaluation, or Judge passage. No implementation or prior formal reports were changed.

## Sources and method

Before: immutable formal12 snapshot `/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-cQ1LU6/repository`, evaluated HEAD `85f8b36f3fbeeff9b5e39941b1508e6c8d7ee9ca` (product `af3fad7c8ce4520366cd23adc8d4b879135ae6bc`). Standalone probe: `/tmp/gr-formal12-retention-probe.mjs`.

After: actual worktree source at `26122e3cb959790e6a57e0905ff1bea04412546f`. Separate standalone probe: `/tmp/gr-repair12-retention-probe.mjs`. Each script imports its respective implementation; the before script continued using the immutable snapshot after the repair was applied.

Each case creates a disposable repository and local bare remote, records real design/specification/implementation operations, prepares and reviews a candidate, observes actual local Git integration, executes a successful finalization command, records release-observer fixture evidence, and executes retention. It then changes only disposable evidence or helper fixtures and calls the actual `currentResult`, `milestone.check(completion)`, and `milestone.pass(completion)` paths.

The evaluator uses qualified fixture receipts and release transport is injected. These probes establish core eligibility, persistence and local integration behavior; they do not establish live model review quality, hosted release behavior, or installed native-host activation.

## Before: actual completion incorrectly succeeds

All four independent cases reproduced the defect:

| Case | Perturbation after retention PASS | Actual result |
|---|---|---|
| proof-loss | Delete retained failed-validator diagnostic proof | Historical gap reported; old retention remains PASS and eligible; completion allowed; actual passage reaches COMPLETE. |
| proof-corruption | Replace retained failed-validator diagnostic proof with corrupt bytes | Same incorrect eligibility and actual COMPLETE passage. |
| input-loss | Delete the unique invalid specification input referenced by the failed validation | Same incorrect eligibility and actual COMPLETE passage. |
| later-failure | After retention, run a failing validator on unchanged approved documents, restore helper and successfully validate, then delete the new failed proof | Same incorrect eligibility and actual COMPLETE passage. |

In each case, `historyGaps` explicitly reported a `spec-validation` gap with position `-1`, while `oldRetention` was `PASS`, `completionAllowed`, `retentionSatisfied`, and `completionPassed` were all true, and final phase was `COMPLETE`. This was an actual milestone passage, not only a function-level eligibility inference.

## After: four full-operation probes pass

All four repaired cases completed successfully with assertions:

- **proof-loss:** `currentResult` rejects the missing object; retention and completion are unsatisfied; actual completion passage rejects. Restoring exact original bytes recovers the same original retention proof and permits actual completion.
- **proof-corruption:** `currentResult` rejects with `Retained evidence integrity failure`; completion is blocked. Exact byte restoration recovers the original proof and permits actual completion.
- **input-loss:** `currentResult` rejects the missing unique failed input; completion is blocked. Exact restoration recovers the original proof and permits actual completion.
- **later-failure:** old retention rejects with `Failed specification evidence inventory changed; refresh retention proof`. Missing evidence blocks completion; restoring bytes alone still does not qualify the old retention proof. A fresh retention execution binds the new failure inventory and permits actual completion.

All historical retention result objects remained `PASS`; the repair changes their current eligibility rather than rewriting historical outcomes. Every repaired case ultimately reached `COMPLETE` only after the required restoration and, for a new failure inventory, fresh retention execution. The repaired standalone script exited successfully.

## Independent repository regression rerun

Command run against repaired source:

```sh
node --test --test-name-pattern='all gates, actual external integration and completion work without evidence commits' cli/test/current-core.test.js
```

Actual result: **1 PASS, 0 FAIL, 0 SKIP**, test duration **72,719.264208 ms**, total duration **72,782.6175 ms**.

This extended fixture separately covers deletion and corruption of both failed diagnostics and unique failed input, blocked actual completion, unchanged historical PASS, exact restoration, a failed combined amendment after retention, refusal to reuse old retention after the failure inventory grows, fresh retention recovery, actual COMPLETE passage, and subsequent missing runner-output rejection.

## Focused assessment

The result now retains candidate, decisions, integrations and validation failures alongside inventory/completion references (`current/execution.js:583–587`). Current retention qualification checks the failure-inventory identity and traverses the live closure (`current/core.js:416–422`). The independent probes support those repairs, including restoration and forward recovery. No additional supported defect was found in this focused delta. This is not a substitute for the forthcoming pinned whole-feature formal assessment or independent native Judge.
