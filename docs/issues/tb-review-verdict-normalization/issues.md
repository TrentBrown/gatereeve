# Issues - tb-review-verdict-normalization

**Feature:** `tb-review-verdict-normalization`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-11-26

Operational task breakdown derived from the plan. GitHub issue #141.

## I-1 - Parsing and shape normalization

- **Status:** in-review
- **Estimate:** 2h
- **Plan steps:** P1, P2
- **Rubric criteria:** R1, R2
- **Depends on:** none
- **PR:** -

Prose unwrap in the adapter parser and schema-guided strip of unknown properties.

## I-2 - Verdict and repair rules

- **Status:** in-review
- **Estimate:** 3h
- **Plan steps:** P3, P4, P5
- **Rubric criteria:** R3, R4, R5, R6, R7
- **Depends on:** none
- **PR:** -

PASS-with-blocking to FAIL, present non-blocking, stale IDs, repair allowances, field paths.

## I-3 - Counts

- **Status:** in-review
- **Estimate:** 2h
- **Plan steps:** P6
- **Rubric criteria:** R8
- **Depends on:** I-2
- **PR:** -

Rejection rules and metrics observations.

## I-4 - Fixtures and documentation

- **Status:** in-review
- **Estimate:** 2h
- **Plan steps:** P8, P9
- **Rubric criteria:** R9, R10
- **Depends on:** I-1, I-2, I-3
- **PR:** -

Tally fixtures, PROTOCOL.md, review guidance, desktop restage.
