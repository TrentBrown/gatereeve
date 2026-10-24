# Independent review remediation

The first Claude code/spec review returned FAIL with eleven findings, against
`review-source-manifest.json`. That verdict remains in history. These are
implementation claims pending independent reassessment of the final source.

| Finding | Correction and focused evidence |
| --- | --- |
| 1: routine planning edits revoke authority | Authority binds design/spec; captured plan/issues remain provenance. Status/task-breakdown regression passes. |
| 2: CLI/Electron environment invalidates equivalent proof | Review inputs omit incidental process identity; runner hashes declared env plus executable/dependency bytes. Host environment and dependency-change regressions pass. |
| 3: enforcement status lacks action coverage | Status now lists implementation/acceptance/merge/completion adapter coverage for both hosts and explicitly cooperative arbitrary shell. host-enforcement.md distinguishes exercised harness/SessionStart from live activation. |
| 4: stale packet inventory | Packet applicability recomputes current gate/result inventory; stale-packet regression passes. |
| 5: narrower check hides failed verification | Completed checks establish coverage; current qualified receipts must cover them. Startup no longer replaces expectations. Narrow-pass regression passes. |
| 6: unsupported/damaged active record cannot resume | Immutable successor activation preserves old bytes and grants no inherited authority. Both recovery cases pass. |
| 7: reconciliation only checks readability | Actual issues/tracker linters plus rubric/plan mappings and current support bytes; unknown-row negative passes. |
| 8: claims/dispositions missing from CLI/validation | CLI claims and optional provenance flags; relevant open findings auto-included, supported dispositions required for PASS. Missing-disposition negative and resolution case pass. |
| 9: dormant legacy Python/bundles shipped | Retired flow helpers and stage bundles removed with mapped obsolete tests; portability/native build pass. |
| 10: legacy desktop projection scaffold | Consumers now read current.phase; old projection, dependency renderer and unused presentation helpers removed; desktop suite and Electron smoke pass. |
| 11: ordinary Git links rejected | Symlinks retained as target bytes, gitlinks as typed commit/coverage metadata; targets never followed. Typed-capture regression passes. |

Six new review regressions pass; the two-repository delta exercise also passes,
including rejection of a delta that omits the changed repository. Full current
CLI tests: 228 pass, 1 optional skip, 0 fail; desktop172 pass; Python62 pass.
No result here asserts formal governed passage. Judge and independent review
records, not this implementer disposition table, determine independent outcomes.
