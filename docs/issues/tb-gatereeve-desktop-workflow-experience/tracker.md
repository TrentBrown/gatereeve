# Branch Tracker - tb-gatereeve-desktop-workflow-experience

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-08-29

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|----|-------|
| R1 | Application shell | NOT YET | [#28](https://github.com/TrentBrown/gatereeve/pull/28) | Three-region shell, fixed central tabs, version treatment, native shortcuts, state-preserving panel controls, resizing, and source-runtime smoke implemented in P4; final integrated P8 verification remains. |
| R2 | Project admission | NOT YET | [#27](https://github.com/TrentBrown/gatereeve/pull/27) | Trusted admission, canonical deduplication, diagnostics, and non-mutation tests implemented; diagnostic UI and final integrated verification remain. |
| R3 | Project lifecycle | NOT YET | [#27](https://github.com/TrentBrown/gatereeve/pull/27), [#28](https://github.com/TrentBrown/gatereeve/pull/28) | Preference migration, ordering, restoration, revalidation, active-only observation, reference-only removal, accessible project controls, and isolated per-project session workspace state are implemented; restart and final P8 verification remain. |
| R4 | Feature-state inspection | NOT YET | - | Planned for P6, P8 / I-6, I-8 |
| R5 | Slice and boundary hierarchy | NOT YET | [#27](https://github.com/TrentBrown/gatereeve/pull/27) | Stable slice ordinals and deterministic gate dependency-stage labels implemented; hierarchy UI remains. |
| R6 | Unified artifact panel | NOT YET | [#27](https://github.com/TrentBrown/gatereeve/pull/27), [#28](https://github.com/TrentBrown/gatereeve/pull/28) | Completion-report and named gate-detail contracts plus canonical application-level tabs, deduplication, close/hide behavior, reconciliation, and inventory-only Artifacts UI are implemented; later hierarchy entry points and final P8 verification remain. |
| R7 | Alert policy | NOT YET | - | Planned for P7, P8 / I-7, I-8 |
| R8 | Accessibility and constrained layout | NOT YET | [#28](https://github.com/TrentBrown/gatereeve/pull/28) | P4-P5 controls, focus restoration, reduced motion, keyboard resizing, semantic tabs, and minimum-width inspector fit are implemented and fixture-checked; P6-P8 obligations remain. |

## PR Log

### PR #27 - Trusted project and protocol foundation

- **URL:** https://github.com/TrentBrown/gatereeve/pull/27
- **Scope:** P1-P3 foundation slice,
  `slice-01-trusted-project-protocol-foundation`
- **Issues:** I-1, I-2, I-3
- **Rubric movement:** R2, R3, R5, and R6 remain `NOT YET`; this PR supplies
  their trusted protocol, preference, admission, coordinator, and IPC
  foundations while later UI and integrated verification obligations remain.
- **Evidence:** [PR #27 packet](pr-27/boundary.json)

### PR #28 - Application shell and unified inspector

- **URL:** https://github.com/TrentBrown/gatereeve/pull/28
- **Scope:** P4-P5 application-shell slice,
  `slice-02-application-shell-unified-inspector`
- **Issues:** I-4, I-5
- **Rubric movement:** R1, R3, R6, and R8 remain `NOT YET`; this PR supplies
  the shell, per-project session state, unified inspector, and constrained-layout
  foundations while later hierarchy and final integrated verification obligations
  remain.
- **Evidence:** [PR #28 packet](pr-28/boundary.json)
