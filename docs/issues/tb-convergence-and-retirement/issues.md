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

- **Status:** done
- **Estimate:** medium
- **Plan steps:** P2, P11
- **Rubric criteria:** R2, R13
- **Depends on:** none
- **Branch:** `tb-convergence-and-retirement-02-metrics-repair` (PR A, with I-6)
- **PR:** #129 (PR A, merged at `9e1d708` outside GateReeve by human decision, run note `prA-outside-merge-note`)

Test isolation and purge, capture conflict, status count, pending-decision
time; D33 scratch lock and workflow robustness (`decisions.md`, check
replacement, `job.abandon`).

## I-3 - Reviewer contract

- **Status:** done
- **Estimate:** large
- **Plan steps:** P3, P4
- **Rubric criteria:** R3, R5, R11 (former row 4, sweep records, moved by D36)
- **Depends on:** I-2
- **Branch:** `tb-convergence-and-retirement-03-reviewer-contract` (PR B1)
- **PR:** #130 (B1, merged at `2a23c1e`); sweep records and the remaining items moved by D36

Severity, failure scenario, class statement, sweep records, repair turn,
normalization, not-assessed, unavailable reasons, per-finding metrics; D32
and D33 substance/bookkeeping separation, per-request ID enums,
`validate-verdict`, substance-identity repair, per-rule rejection counts.

## I-4 - Round policy, follow-ups and failure model

- **Status:** done
- **Estimate:** large
- **Plan steps:** P5, P6, P7
- **Rubric criteria:** R6 (former rows 7 and 8, follow-ups and failure model, moved by D36)
- **Depends on:** I-3
- **Branch:** `tb-convergence-and-retirement-04-round-policy` (PR C1, with I-5)
- **PR:** #131 (C1, round policy, merged at `ec2cfe6`); follow-ups (P6) and failure model (P7) moved by D36

Round counter and schedule, goal wiring, follow-ups with defaults and the
Completion decision, failure-model lint.

## I-5 - CI after review convergence

- **Status:** done
- **Estimate:** medium
- **Plan steps:** P8
- **Rubric criteria:** R9
- **Depends on:** I-4
- **Branch:** delivered on the I-4 branch (PR C1)
- **PR:** #131 (merged at `ec2cfe6`)

Unpushed-head review, runner-role CI qualification, push warning, docs.

## I-6 - Worktree sweep

- **Status:** done
- **Estimate:** medium
- **Plan steps:** P9
- **Rubric criteria:** R10
- **Depends on:** none
- **Branch:** `tb-convergence-and-retirement-06-worktree-sweep`, delivered on the I-2 branch (PR A)
- **PR:** #129 (PR A, merged at `9e1d708` outside GateReeve by human decision, run note `prA-outside-merge-note`)

`gatereeve worktree sweep`.

## I-7 - Measurement report, surfaces and docs

- **Status:** done
- **Estimate:** medium
- **Plan steps:** P10
- **Rubric criteria:** R11
- **Depends on:** I-3, I-4
- **Branch:** delivered within slices 3–5
- **PR:** docs and compatibility in #130 and #131; metrics and surfaces moved by D36

D6 report, status and desktop surfaces, docs, packaging checks.
