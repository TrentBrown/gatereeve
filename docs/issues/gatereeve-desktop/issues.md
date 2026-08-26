# Issues - gatereeve-desktop

**Feature:** `gatereeve-desktop`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-08-26

Operational task breakdown derived from the plan.

## I-1 - Define snapshot schemas and readiness semantics

- **Status:** closed
- **Estimate:** unknown
- **Plan steps:** P1, P2
- **Rubric criteria:** R1, R2, R3, R4, R5, R6
- **Depends on:** none
- **PR:** [#2](https://github.com/TrentBrown/gatereeve/pull/2)

Create the canonical snapshot and named-read contracts, artifact and milestone
projection, readiness states, diagnostic modes, model provenance, and
non-mutating provider behavior. This begins intended PR slice 1.

## I-2 - Expose and prove the canonical observer across plugin and CLI

- **Status:** closed
- **Estimate:** unknown
- **Plan steps:** P3
- **Rubric criteria:** R1, R2, R3, R4, R5, R6
- **Depends on:** I-1
- **PR:** [#2](https://github.com/TrentBrown/gatereeve/pull/2)

Integrate the accepted contract with the plugin adapter and Commander.js,
update exact staging, and complete parity, packaging, readiness, and invariance
tests. This completes intended PR slice 1.

## I-3 - Build the Electron shell and observation coordinator

- **Status:** closed
- **Estimate:** unknown
- **Plan steps:** P4, P5
- **Rubric criteria:** R1, R3, R6, R7, R8
- **Depends on:** I-2
- **PR:** [#4](https://github.com/TrentBrown/gatereeve/pull/4)

Create the independent Electron package, read-only IPC boundary, explicit
worktree lifecycle, preferences, source enrichment, watchers, and targeted
remote polling. This is intended PR slice 2.

## I-4 - Build the state-first workflow experience

- **Status:** in-progress
- **Estimate:** unknown
- **Plan steps:** P6
- **Rubric criteria:** R2, R3, R4, R6, R8
- **Depends on:** I-3
- **PR:** -

Deliver the main GateReeve Desktop overview, state rail, milestones, slices,
boundary DAG, diagnostics, warnings, evidence, and governed action guidance.
This begins intended PR slice 3.

## I-5 - Build artifact, history, model, and Session inspection

- **Status:** in-progress
- **Estimate:** unknown
- **Plan steps:** P7
- **Rubric criteria:** R4, R5, R6, R8
- **Depends on:** I-3
- **PR:** -

Complete the integrated artifact viewers, direct explain-diff rendering,
external actions, Session context, event and attempt timeline, and full pinned
model view. This completes intended PR slice 3 and may proceed alongside I-4
after the shell contract is stable.

## I-6 - Add notifications and supported-platform quality

- **Status:** open
- **Estimate:** unknown
- **Plan steps:** P8
- **Rubric criteria:** R7, R8
- **Depends on:** I-4, I-5
- **PR:** -

Implement notification lifecycle and deduplication, close accessibility and
minimum-layout gaps, gather visual evidence, and prove Electron runtime on
Ubuntu and macOS. This begins intended PR slice 4.

## I-7 - Complete feature verification on the final delivery slice

- **Status:** open
- **Estimate:** unknown
- **Plan steps:** P9
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7, R8
- **Depends on:** I-6
- **PR:** -

Evaluate the assembled feature against every AC and rubric criterion, complete
the independent and PR-boundary gates, and produce the feature completion
report as part of intended PR slice 4 rather than a separate pseudo-boundary.
