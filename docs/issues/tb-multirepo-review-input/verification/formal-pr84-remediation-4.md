# Formal PR84 fourth remediation

Both independent code/spec and installed native OpenAI Judge failed attempt formal-pr84-4 on 856e2ee82294dbd4a8b35efd781a35ca7495a4b2. Actual reports and native receipts remain in the attempt. Advisory returned UNAVAILABLE/CONTRACT_INVALID. Installed core transition evt-pr84-remediate-4 authorized repair before edits. No waiver was requested or granted.

Implementation claims for the next independent assessment:

- CR4-1: all reviewer history, including delta support, is ordered by original run-result position. Duplicate delta support is not appended. An older closure cannot override a later reopening. Full gate-operation tests cover unchanged and changed candidates and require a new supported closure.
- CR4-2: runner results explicitly reference the actual executed-receipt manifest. Required verification coverage derives from those receipts, not unexecuted malformed declarations. Three invalid argument shapes now recover after a corrected check; failed executed checks remain required and partial outputs remain retained.
- Judge milestone race: checks return their run and event count. Milestone passage requires that exact checked state and uses the journal append compare-and-swap. A real candidate replacement during a passing check cannot gain passage.
- Judge merge race: capture the checked state before preparation, revalidate it before opening, after hosted checks and immediately before the write, and carry the same state into integration observation. A candidate replacement before the write closes the unmerged PR; a replacement after an observed hosted merge cannot be attributed to the new candidate. Tests use local/injected provider operations, not hosted mutations.
- Judge closure reuse: reuse considers only the latest verdict for each requested gate, its qualified applicability and unchanged explicit assessment inputs. Its own closure may change automatically derived history without forcing execution. Repeated claims retain their original finding and qualified resolution. A newer failure cannot resurrect an older pass.
- Judge selection order: repository selections and review-rule sets are canonicalized. Reversing the same repositories or code/spec request pair preserves proof identity and reuses the original separate verdicts.
- Judge contradictory guide: current native guidance consistently states that every inherited environment change conservatively invalidates runner proof. Source-only assessment remains isolated.

The four initial pre-repair probes failed on the pinned source, and the first two fixes passed 11 interaction tests in a disposable copy. The complete repair passes 16 targeted regressions. Broader verification and focused independent assessment are retained separately. These are implementer claims, not formal acceptance.

## Targeted independent inspection

The OpenAI formal_code_spec evaluator separately inspected the uncommitted repairs and tests after its formal FAIL. It reported no additional supported defect in this targeted inspection: chronological delta history, receipt-derived obligations, latest-verdict reuse, selection normalization and state binding were coherent. This inspection did not run tests, write a formal verdict or record gate passage. The next pinned formal assessment remains required.

The same race-class inspection also corrected decision passage: its checked state advances only through its own pending event. Core append responses project state only through the returned event sequence, excluding later concurrent events. Actual pause injections after pending publication and after validation retain the pending instruction and prevent DECIDED approval. Six targeted authority/retry tests pass; the independent evaluator inspected both refinements and found no additional issue. The full CLI and desktop suites were rerun after this final source refinement.
