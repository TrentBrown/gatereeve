**FAIL — three supported defects affect nine criteria; twelve criteria pass.**

This assessment covers the full approved rubric at FEATURE_FINAL for pinned head `257b22e65bd2ff7b70216b3b4985c91c54c88c16`, against base `643e3ea2b03f19b66595219c4f8df934596aa436`.

The specification, design, inventory, full Verification report and runtime attachment match their bound digests. All 49 patch chunks and the assembled patch material verify. The inventory contains 307 changes: 100 modified, 157 deleted and 50 added, with no renames or binary entries. All 150 retained new-file contents match the inventory blob IDs. All 23 desktop protocol files match canonical source.

**F1 — partial repository capture can authorize a whole-repository PR.** The resolver accepts a configured repository path when it is a contained directory; it does not establish that the directory is the Git root. Capture then runs `git ls-tree -r -z` from that directory without `--full-tree`. For a configuration pointing at `app/subdir`, source outside that subtree is omitted even though the manifest names commits from the entire `app` repository.

This omission propagates: an enclosing-repository source or shared-helper change can leave the captured content identity unchanged, disappear from delta paths, and preserve a content-scoped waiver. The protected adapter can then merge the complete PR using that partial review evidence. The Git-root guard in integration verification runs after the merge write. This is a static trace of the supplied source, not a hosted merge reproduction. Evidence: `protocol/context.js:158`, `current/evidence.js:57,168`, `current/execution.js:40`, `current/contracts.js:97`, `current/actions.js:89`, and `scripts/merge_verified.py:100`, under `plugin-src/shared/resources/`.

**F2 — default reviewer history omits valid prior failures and limits.** A spec/Judge FAIL may contain failed criterion rows or required coverage limitations without a structured blocking finding. Automatic history selection follows blocking-finding records, so that prior report is absent from the next default assessment unless manually selected. The requested-gate filter also excludes relevant reports from other gates by default.

A read-only in-memory call through the actual `executeGates` function, with stubbed state/store and qualification, confirmed that a prior spec FAIL for R1 plus a required integration limitation produced `history=[]` and `reconsiderClosures=[]`. No evaluator or filesystem publication was launched. Evidence: `current/execution.js:234,288,291,303`.

**F3 — matching unsupported activation copies block explicit resume.** `activationHead` treats an unsupported activation as opaque provenance only when its witness is absent. Two identical retained copies are rejected as conflicting. Because mutating preflight invokes this check before dispatching `run.resume-current`, the documented resume operation cannot establish a fresh current run from that state while preserving the records.

A read-only in-memory `CurrentStore` probe confirmed the error `Conflicting unsupported activation record` for matching unsupported primary/witness bytes. The existing unsupported-version test removes the witness first. Evidence: `current/store.js:175`, `current/core.js:580`, and `cli/test/current-core.test.js:583`.

| Criterion | Result | Assessment |
|---|---|---|
| R1 — Planning and milestone authority | FAIL | F1 permits acceptance/merge with incomplete repository proof. |
| R2 — Model-led execution | PASS | Explicit readiness and evaluation; real input needs remain; no round cap. |
| R3 — Canonical layouts | PASS | Repository-local and parent/no-Git records use optional Git tracking. |
| R4 — Exact source and requirements | FAIL | F1 binds partial trees to whole-repository commit identities. |
| R5 — Containment and isolation | PASS | Safe capture and declared read-only reviewer views are implemented. |
| R6 — Publication and retention | PASS | Exclusive publication, integrity checks and repeat/crash reconciliation preserve proof boundaries. |
| R7 — Local finalization | FAIL | F1 defeats complete source/PR protection before the merge write. |
| R8 — Independent grouped verdicts | PASS | Fresh qualification and separate code/spec verdicts are validated. |
| R9 — Complete obligation inventory | PASS | Required gates and proper execution roles remain explicit. |
| R10 — Equivalent-input reuse | PASS | Correctly captured equivalent inputs reuse original proof and provenance. |
| R11 — Relevant change and uncertainty | FAIL | F1 can conceal relevant changes outside the captured subdirectory. |
| R12 — Targeted delta coverage | FAIL | F1 removes real changed paths before delta coverage validation. |
| R13 — Bounded history and dispositions | FAIL | F2 omits prior criterion failures and coverage limits by default. |
| R14 — New discovery and blocking criteria | PASS | New supported defects remain reportable under approved criteria. |
| R15 — One scoped human decision | PASS | Combined decisions, pending state, provenance and repeat-safe amendments are implemented. |
| R16 — Honest exceptions and integration | FAIL | F1 can preserve exception applicability across a relevant omitted source change. |
| R17 — Enforcement coverage | FAIL | The protected merge adapter does not reject F1 before execution. |
| R18 — Coherent consumers and low ceremony | PASS | CLI/plugins/desktop share the current core; obsolete ordering controls are removed. |
| R19 — Direct cutover | PASS | One current execution path and resume guidance replace retired orchestration. |
| R20 — Resume without false history | FAIL | F3 blocks the current entry for matching unsupported activation copies. |
| R21 — Practical observations | PASS | Available metrics and outcomes remain truthful; no new benchmark gate is introduced. |

**Scope check: PASS.** The changed work remains within the approved implementation, consumer, helper, test and documentation scope.

**Gap check: FAIL.** Repository-root validation, complete relevant reviewer-history selection, and matching-copy unsupported resumption are missing safeguards.

**Contradiction check: FAIL.** F1 conflicts with C2/C4 source and applicability requirements; F2 conflicts with C3 reviewer knowledge; F3 conflicts with C5 current resumption.

The full bound Verification report was read. It reports 317 CLI passes and one skip on an earlier substantive revision, eleven focused final regressions, 172 desktop passes, 58 reused Python passes, a real fresh evaluator execution, plugin validation and package/runtime checks. Its stated limits remain applicable: native host interception is unverified, runtime smoke covered ARM64, and exact-current hosted CI was unavailable. The bound `runtime.png` was visually inspected. These mechanical checks do not cover F1–F3. No code was edited and no network tools were used.