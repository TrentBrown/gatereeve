# Issues - tb-review-self-validation

**Feature:** `tb-review-self-validation`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-11-26

Operational task breakdown derived from the plan. GitHub issue #142.

## I-1 - Shared contract and self-validation tool

- **Status:** in-review
- **Estimate:** 4h
- **Plan steps:** P1, P2, P3
- **Rubric criteria:** R1, R2, R3, R4
- **Depends on:** none
- **PR:** -

Extract the verdict contract, add the read-only MCP server and wire it into both adapters.

## I-2 - Peer dispositions and attempt records

- **Status:** in-review
- **Estimate:** 2h
- **Plan steps:** P4, P5
- **Rubric criteria:** R5, R6
- **Depends on:** I-1
- **PR:** -

`not-assessed` for missing peer dispositions; attempt kind, tokens and duration.

## I-3 - Complete review packets

- **Status:** in-review
- **Estimate:** 3h
- **Plan steps:** P6, P7
- **Rubric criteria:** R7, R8
- **Depends on:** none
- **PR:** -

Definition of Done and linked documents in the packet; after-merge rows out of boundary review.

## I-4 - Fixtures and documentation

- **Status:** in-review
- **Estimate:** 2h
- **Plan steps:** P8, P9
- **Rubric criteria:** R9
- **Depends on:** I-1, I-2, I-3
- **PR:** -

Remaining fixtures, PROTOCOL.md, guidance, desktop restage.
