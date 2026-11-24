# Issues - tb-convergence-and-retirement

**Feature:** `tb-convergence-and-retirement`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-11-22

Operational task breakdown derived from the plan. One issue per slice.

## I-1 - Reviewer idle-inhibitor lock

- **Status:** done
- **Estimate:** small
- **Plan steps:** P1
- **Rubric criteria:** R1
- **Depends on:** none
- **Branch:** `tb-convergence-and-retirement-01-reviewer-idle-lock`
- **PR:** #128 (merged into the integration branch at `c15107a`)

Wrap reviewer launches in `systemd-inhibit` on Linux; receipt field.

## I-2 - Metrics repair

- **Status:** todo
- **Estimate:** medium
- **Plan steps:** P2, P11
- **Rubric criteria:** R2, R13
- **Depends on:** none
- **Branch:** `tb-convergence-and-retirement-02-metrics-repair` (PR A, with I-6)
- **PR:** -

Test isolation and purge, capture conflict, status count, pending-decision
time; D33 scratch lock and workflow robustness (`decisions.md`, check
replacement, `job.abandon`).

## I-3 - Reviewer contract

- **Status:** todo
- **Estimate:** large
- **Plan steps:** P3, P4
- **Rubric criteria:** R3, R4, R5, R11
- **Depends on:** I-2
- **Branch:** `tb-convergence-and-retirement-03-reviewer-contract` (PR B)
- **PR:** -

Severity, failure scenario, class statement, sweep records, repair turn,
normalization, not-assessed, unavailable reasons, per-finding metrics; D32
and D33 substance/bookkeeping separation, per-request ID enums,
`validate-verdict`, substance-identity repair, per-rule rejection counts.

## I-4 - Round policy, follow-ups and failure model

- **Status:** todo
- **Estimate:** large
- **Plan steps:** P5, P6, P7
- **Rubric criteria:** R6, R7, R8
- **Depends on:** I-3
- **Branch:** `tb-convergence-and-retirement-04-round-policy` (PR C, with I-5)
- **PR:** -

Round counter and schedule, goal wiring, follow-ups with defaults and the
Completion decision, failure-model lint.

## I-5 - CI after review convergence

- **Status:** todo
- **Estimate:** medium
- **Plan steps:** P8
- **Rubric criteria:** R9
- **Depends on:** I-4
- **Branch:** delivered on the I-4 branch (PR C)
- **PR:** -

Unpushed-head review, runner-role CI qualification, push warning, docs.

## I-6 - Worktree sweep

- **Status:** todo
- **Estimate:** medium
- **Plan steps:** P9
- **Rubric criteria:** R10
- **Depends on:** none
- **Branch:** `tb-convergence-and-retirement-06-worktree-sweep`, delivered on the I-2 branch (PR A)
- **PR:** -

`gatereeve worktree sweep`.

## I-7 - Measurement report, surfaces and docs

- **Status:** todo
- **Estimate:** medium
- **Plan steps:** P10
- **Rubric criteria:** R11
- **Depends on:** I-3, I-4
- **Branch:** delivered within slices 3–5
- **PR:** -

D6 report, status and desktop surfaces, docs, packaging checks.
