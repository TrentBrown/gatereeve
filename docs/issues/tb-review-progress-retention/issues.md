# Issues - tb-review-progress-retention

**Feature:** `tb-review-progress-retention`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-11-27

Operational task breakdown derived from the plan. GitHub issue #147.

## I-1 - Streamed capture in the runner and adapters

- **Status:** open
- **Estimate:** 2h
- **Plan steps:** P1, P2
- **Rubric criteria:** R1, R7
- **Depends on:** none
- **PR:** -

`onOutput` and `onPrompt` hooks, the 64 MiB limit, captured stdout on errors, and Claude stream-json.

## I-2 - Progress log and activity retention

- **Status:** open
- **Estimate:** 4h
- **Plan steps:** P3, P4
- **Rubric criteria:** R2, R3, R5, R8
- **Depends on:** I-1
- **PR:** -

`review-activity.js`, the execution and planning-review wiring, and the `activity` record field.

## I-3 - Reconstruction and watch

- **Status:** open
- **Estimate:** 3h
- **Plan steps:** P5, P6
- **Rubric criteria:** R4, R5, R6
- **Depends on:** I-2
- **PR:** -

`reconstructReview`, `read activity`, `review.progress`, `gatereeve review watch`, and the independence tests.

## I-4 - Docs and projection

- **Status:** open
- **Estimate:** 1h
- **Plan steps:** P7
- **Rubric criteria:** R8
- **Depends on:** I-3
- **PR:** -

`PROTOCOL.md`, CLI help and the user guide, the desktop projection, and the plugin build.
