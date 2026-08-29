# Branch Tracker - tb-gatereeve-desktop-workflow-experience

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-08-29

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|----|-------|
| R1 | Application shell | NOT YET | - | Planned for P4, P8 / I-4, I-8 |
| R2 | Project admission | NOT YET | [#27](https://github.com/TrentBrown/gatereeve/pull/27) | Trusted admission, canonical deduplication, diagnostics, and non-mutation tests implemented; diagnostic UI and final integrated verification remain. |
| R3 | Project lifecycle | NOT YET | [#27](https://github.com/TrentBrown/gatereeve/pull/27) | Preference migration, ordering, restoration, revalidation, active-only observation, and reference-only removal implemented; per-project UI state and accessible controls remain. |
| R4 | Feature-state inspection | NOT YET | - | Planned for P6, P8 / I-6, I-8 |
| R5 | Slice and boundary hierarchy | NOT YET | [#27](https://github.com/TrentBrown/gatereeve/pull/27) | Stable slice ordinals and deterministic gate dependency-stage labels implemented; hierarchy UI remains. |
| R6 | Unified artifact panel | NOT YET | [#27](https://github.com/TrentBrown/gatereeve/pull/27) | Completion report and named gate-detail protocol contracts implemented; panel UI remains. |
| R7 | Alert policy | NOT YET | - | Planned for P7, P8 / I-7, I-8 |
| R8 | Accessibility and constrained layout | NOT YET | - | Planned for P4-P8 / I-4, I-5, I-6, I-7, I-8 |

## PR Log

- **PR #27 - Trusted project and protocol foundation** (draft): P1-P3; protocol
  ordering and completion-report contracts, schema-v2 saved-project preferences,
  strict governed admission, project switching, active-only observation, and
  narrow project IPC. Formal boundary packet: [`pr-27/`](pr-27/).
