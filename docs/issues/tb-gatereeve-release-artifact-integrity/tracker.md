# Branch Tracker - tb-gatereeve-release-artifact-integrity

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-08-31

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|----|-------|
| R1 | Safe producer commitment | PASS | #44 | Real Plugin preparation plus positive, unsafe-path, symlink, and exact-tree tests pass. |
| R2 | Round trip gates Apple trust | NOT YET | #44 | Dependency/upload contract tests pass; the real hosted RC.6 trace remains P5. |
| R3 | Later handoffs preserve exact bytes | NOT YET | #44 | Consumer and packet tests pass; real RC.6 handoff evidence remains P5. |
| R4 | Semantic verification remains mandatory | PASS | #44 | Positive and exact-but-incomplete adversarial semantic tests pass at every sealed consumer. |
| R5 | RC.5 regression coverage | PASS | #44 | Hidden stripping, visible loss, additions, mutations, malformed evidence, and semantic incompleteness all fail. |
| R6 | Topology, authority, and history preserved | PASS | #44 | Diff preserves the universal DMG, environment separation, retained-byte flow, and immutable RC.5 history. |
| R7 | RC.6 primary publication | NOT YET | - | Planned for P5 / I-5 |
| R8 | Direct and Homebrew Mac installation | NOT YET | - | Planned for P6-P7 / I-6 |

## PR Log

### PR #44 — Plugin release artifact integrity

- Pull request: [#44](https://github.com/TrentBrown/gatereeve/pull/44)
- Evidence packet: [pr-44](pr-44/boundary.json)
- Scope: slice

P1-P3 are implemented and P4 is in review. R1, R4, R5, and R6 pass; R2 and
R3 retain their real hosted RC.6 evidence requirement, and R7-R8 remain later
feature work.
