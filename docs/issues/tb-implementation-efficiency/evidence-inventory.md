# Evidence and obligation inventory

## Baseline and limits

The supplied rc.23 export contains 303 records. The handoff reports 63,061 seconds
of root operation duration, of which 59.5% is unexplained by recorded children.
This is an attribution gap inside observed operations, not 59.5% of all developer
time. A script check found one overlapping root interval, so the report's prose
claim of entirely serial roots is not accepted as an exact elapsed total.

Thirty verification records were all PASS; six candidate rounds each repeated
the full checks. Fifty reuse attempts lacked proof and nine had changed inputs.
Most rerun reasons are unknown. The export does not prove that each review found
only one defect, nor that the entire unexplained duration was fingerprinting.
Project identity mappings remain unconfirmed; do not relabel opaque IDs MyLifeMap
solely from the handoff's context.

rc.24 already introduced stat/cache-assisted runtime hashes, bounded reviewer
history and SQLite metrics storage. These are distinct from this feature's
removal of runtime-tree qualification. The staged baseline on this worktree
passed 35 current-planning/performance tests in approximately 2.9 seconds. Earlier
attempts were invalid due to disabling metrics for a metrics test, then missing
staged CLI dependencies; they are not performance comparisons.

Local GateReeve CI distinguishes full source changes from review-artifact-only
changes. MyLifeMap CI has fast, integration, PostgreSQL, browser and evaluation
jobs plus conditional deployed checks. A success badge does not establish that
all of those ran. Acceptance must inspect actual candidate/check scope.

Playpen and AWS were linked during investigation. No fresh complete fleet export
has been obtained. UpCloud was unreachable twice. The supplied files are a
historical snapshot; source freshness and missing hosts remain explicit. Fixtures
exercise import semantics but are not measurements of those machines.

## Responsibilities after consolidation

| Existing obligation | New required coverage | Mechanism |
|---|---|---|
| Source/context | Same exact selected source/target and approved inputs | Core context check |
| Build/lint/unit/integration/browser checks | Agent-selected focused checks; broad candidate CI or assessed alternative at acceptance | Actual runner and CI receipts |
| Code review | Defects, reachable behavior, regressions, interactions | Independent review: code |
| Spec evaluation and Judge | Every approved criterion, contradictions, evidence sufficiency | Independent review: requirements/evidence |
| Feature reconciliation | Plan/issues/tracker and complete requirement mapping | Independent review: scope |
| Decision triage | Material decisions and real approval scope | Independent review: scope |
| Pattern review | Resolved rules, deterministic triggers, manual/applicability judgments | Bound pattern inputs in independent review |
| Findings/fixes | All relevant unresolved/claimed/affected findings; original failures retained | Independent review: findings |
| Explanation | Concrete behavior, choices, evidence and limits | Independent review summary |
| Packet integrity | Retained references and applicable results | Core packet check |
| Merge/finalization/release/retention | Existing authority, direction and actual observations | Unchanged protected boundaries |

The separate named reviews remain available when useful. There is no mandatory
implementer self-review gate and no automatic multi-model council. Multiple
models are encouraged for consequential or uncertain changes and repeated misses.
The independent assessment must batch supported findings rather than stop after
the first one. Additional rounds follow changed evidence, not arbitrary limits.

## Measurement interpretation

Compare fixed datasets with source coverage, collector/contract version, strategy,
actual executions, outcomes and unresolved limitations. Report summed worker time
separately from union elapsed per clock. Never add overlapping nested durations or
infer a cross-host critical path. Reruns, findings and fixes are observations, not
causal evidence that one strategy is superior. No numerical improvement target or
universal speedup is claimed by this implementation.

## Current connectivity and imported-data exercise

A fresh linked-environment inventory during implementation reported Playpen
reachable and AWS unreachable; UpCloud remains unlinked after the earlier failed
attempts. The historical Playpen analysis thread was read and confirmed that its
MyLifeMap project attribution was an inference, not a resolved identity.

The shared legacy-import adapter successfully imported all 303 supplied records
into a separate disposable reporting store. A combined fixed dataset includes
explicit missing fresh AWS, UpCloud and Playpen-current sources. This exercises
real export compatibility without touching the source backup, its key, live
metrics or other projects' workflow state. The generated report lives at
`/private/tmp/gatereeve-implementation-efficiency-review/reevaluation-rc23.html`.
