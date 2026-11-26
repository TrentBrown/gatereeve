# Issues - tb-review-honest-unavailability

**Feature:** `tb-review-honest-unavailability`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-11-25

Operational task breakdown derived from the plan. GitHub issue #140.

## I-1 - Fail fast on verification

- **Status:** in-review
- **Estimate:** 1h
- **Plan steps:** P1
- **Rubric criteria:** R1
- **Depends on:** none
- **PR:** -

Shared helper, `VERIFICATION_REQUIRED` refusal before the round starts.

## I-2 - Outcome statuses and round counting

- **Status:** in-review
- **Estimate:** 2h
- **Plan steps:** P2, P3
- **Rubric criteria:** R2, R3
- **Depends on:** I-1
- **PR:** -

Refusal tagging, provider failure category, outcome classification, count at
provider launch, projection skips all-refused rounds.

## I-3 - Transient retry

- **Status:** in-review
- **Estimate:** 1h
- **Plan steps:** P4
- **Rubric criteria:** R4, R5
- **Depends on:** I-2
- **PR:** -

One retry for `transient-service-failure` under a distinct operation identity on
the same round baseline, followed by the existing single repair turn.

## I-4 - Rejection messages

- **Status:** in-review
- **Estimate:** 1h
- **Plan steps:** P5
- **Rubric criteria:** R6
- **Depends on:** none
- **PR:** -

Field path or finding/claim ID in each touched rejection.

## I-5 - Documentation, mirror and measurement

- **Status:** in-review
- **Estimate:** 30m
- **Plan steps:** P6, P7
- **Rubric criteria:** R7, R8
- **Depends on:** I-1, I-2, I-3, I-4
- **PR:** -

`PROTOCOL.md`, desktop mirror restage, measurement in `interview.md`.
