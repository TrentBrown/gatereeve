# Issues - tb-small-fixes-batch

**Feature:** `tb-small-fixes-batch`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-11-25

Operational task breakdown derived from the plan. Delivered as one PR closing
GitHub issue #146.

## I-1 - gh --slurp fallback

- **Status:** open
- **Estimate:** small
- **Plan steps:** P1, P7
- **Rubric criteria:** R1
- **Depends on:** none
- **PR:** -

Paginated job reads via `--paginate --jq`.

## I-2 - Relax draft-status preconditions

- **Status:** open
- **Estimate:** small
- **Plan steps:** P2, P3, P7
- **Rubric criteria:** R2, R3, R4, R5
- **Depends on:** none
- **PR:** -

`merge.prepare`, `merge.execute`, delivery recovery and `goal.park` stop
requiring or restoring draft status; documentation follows.

## I-3 - PR A open items

- **Status:** open
- **Estimate:** small
- **Plan steps:** P4, P5, P6, P7
- **Rubric criteria:** R6, R7, R8
- **Depends on:** none
- **PR:** -

Isolation evidence, scratch inventory, PERFORMANCE.md, `REGENERABLE` pin and
the PID-reuse guard.
