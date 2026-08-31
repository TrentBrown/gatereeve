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

P1-P4 are complete. R1, R4, R5, and R6 pass; R2 and
R3 retain their real hosted RC.6 evidence requirement, and R7-R8 remain later
feature work.

#### Merge and mainline verification

- Human review was accepted and PR #44 merged source
  `b3729bc76375f9cbe49659c87f1baabe6e8c646c` into `main` as
  `10a726411fd46f58263f8c989ac83f1a65bdf33f`.
- `merge_verified.py` passed by ancestry for the exact reviewed source.
- Mainline Plugin CI run
  [33451532082](https://github.com/TrentBrown/gatereeve/actions/runs/33451532082)
  passed after retrying only the failed unprotected packaging job. Its first
  `hdiutil create` attempt returned runner-level `Resource busy`; protected
  trust production had not begun. The retry passed the universal DMG plus
  native Apple Silicon and Intel packaged-runtime jobs.
- No `development` or `development-*` branch was merged or rebased into the
  topic or `main`.

### RC.6 primary acceptance

- Slice: `s2-rc6-primary-acceptance`
- Branch: `tb-gatereeve-release-artifact-integrity-02-rc6-acceptance`
- Scope: P5 / R2, R3, R4, R6, R7
- Status: implementing from exact corrected `main` merge `10a7264`.
