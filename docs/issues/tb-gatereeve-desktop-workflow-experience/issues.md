# Issues - tb-gatereeve-desktop-workflow-experience

**Feature:** `tb-gatereeve-desktop-workflow-experience`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-08-29

Operational task breakdown derived from the plan.

## I-1 - Extend projection, artifact, and ordering contracts

- **Status:** closed
- **Estimate:** 1d
- **Plan steps:** P1
- **Rubric criteria:** R5, R6
- **Depends on:** none
- **PR:** [#27](https://github.com/TrentBrown/gatereeve/pull/27)

Add completion-report inventory support, safe gate-detail data, deterministic
slice ordinals, dependency stages, and protocol contract tests.

## I-2 - Migrate preferences to the saved-project registry

- **Status:** closed
- **Estimate:** 1d
- **Plan steps:** P2
- **Rubric criteria:** R2, R3
- **Depends on:** none
- **PR:** [#27](https://github.com/TrentBrown/gatereeve/pull/27)

Create the schema-v2 persistent project-list model, v1 migration, stable order,
canonical deduplication, and reference-only list operations.

## I-3 - Implement project admission and coordinator switching

- **Status:** closed
- **Estimate:** 2d
- **Plan steps:** P3
- **Rubric criteria:** R2, R3
- **Depends on:** I-1, I-2
- **PR:** [#27](https://github.com/TrentBrown/gatereeve/pull/27)

Add structured validation and diagnostics, bounded startup revalidation,
last-project restoration, safe switching, active-only observation, and narrow
IPC/preload contracts.

## I-4 - Build the application shell and workspace store

- **Status:** in-review
- **Estimate:** 2d
- **Plan steps:** P4
- **Rubric criteria:** R1, R3, R8
- **Depends on:** I-3
- **PR:** [#28](https://github.com/TrentBrown/gatereeve/pull/28)

Create the project sidebar, fixed central tabs, version treatment, per-project
session workspace state, panel controls, shortcuts, and resizable layout.

## I-5 - Build the unified artifact inspector

- **Status:** in-review
- **Estimate:** 2d
- **Plan steps:** P5
- **Rubric criteria:** R6, R8
- **Depends on:** I-1, I-4
- **PR:** [#28](https://github.com/TrentBrown/gatereeve/pull/28)

Implement canonical and virtual tab identity, lifecycle and reconciliation,
unavailable states, safe artifact rendering, and the inventory-only Artifacts
view.

## I-6 - Implement the hierarchical Overview

- **Status:** in-review
- **Estimate:** 2d
- **Plan steps:** P6
- **Rubric criteria:** R4, R5, R8
- **Depends on:** I-1, I-4, I-5
- **PR:** [#29](https://github.com/TrentBrown/gatereeve/pull/29)

Add selectable feature state, state-owned milestones, slice and boundary
drill-down, attempts, gates, Finalizing and Complete behavior, and semantic
ordering markers.

## I-7 - Consolidate alerts and current workflow guidance

- **Status:** in-review
- **Estimate:** 1d
- **Plan steps:** P7
- **Rubric criteria:** R7, R8
- **Depends on:** I-4, I-6
- **PR:** [#30](https://github.com/TrentBrown/gatereeve/pull/30)

Remove duplicated notification surfaces, locate conditions at their approved
scope, relocate Sources and notification preferences, and implement conditional
expandable current guidance.

## I-8 - Complete integrated accessibility and runtime verification

- **Status:** open
- **Estimate:** 2d
- **Plan steps:** P8
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7, R8
- **Depends on:** I-3, I-4, I-5, I-6, I-7
- **PR:** -

Exercise the assembled experience through automated, visual, accessibility,
security-boundary, and running-application checks; resolve findings and prepare
full feature evidence.
