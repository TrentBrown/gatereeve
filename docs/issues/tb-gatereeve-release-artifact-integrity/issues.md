# Issues - tb-gatereeve-release-artifact-integrity

**Feature:** `tb-gatereeve-release-artifact-integrity`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-08-31

Operational task breakdown derived from the plan.

## I-1 - Implement the Plugin tree integrity contract

- **Status:** in-progress
- **Estimate:** 0.5d
- **Plan steps:** P1
- **Rubric criteria:** R1, R3, R4, R5
- **Depends on:** none
- **PR:** -

Create the producer commitment and strict exact-tree plus semantic verifier.

## I-2 - Harden hosted artifact handoffs and ordering

- **Status:** in-progress
- **Estimate:** 0.5d
- **Plan steps:** P2
- **Rubric criteria:** R2, R3, R4, R6
- **Depends on:** I-1
- **PR:** -

Preserve hidden files, verify each consumer, and gate Apple authority on the
first round trip.

## I-3 - Add regression coverage and operator documentation

- **Status:** in-progress
- **Estimate:** 0.5d
- **Plan steps:** P3
- **Rubric criteria:** R1, R2, R3, R4, R5, R6
- **Depends on:** I-1, I-2
- **PR:** -

Cover every named failure class and document the immutable RC.5/forward-fix
recovery rule.

## I-4 - Deliver and verify the correction on main

- **Status:** in-progress
- **Estimate:** 0.5d
- **Plan steps:** P4
- **Rubric criteria:** R1, R2, R3, R4, R5, R6
- **Depends on:** I-1, I-2, I-3
- **PR:** -

Complete the governed boundary, human review, permitted merge, and mainline CI.

## I-5 - Publish and verify RC.6 primary surfaces

- **Status:** open
- **Estimate:** unknown
- **Plan steps:** P5
- **Rubric criteria:** R2, R3, R4, R6, R7
- **Depends on:** I-4
- **PR:** -

Run the fresh protected trust and primary publication lifecycle from corrected
main.

## I-6 - Prove direct and Homebrew Mac installation

- **Status:** open
- **Estimate:** unknown
- **Plan steps:** P6, P7
- **Rubric criteria:** R6, R8
- **Depends on:** I-5
- **PR:** -

Collect direct DMG evidence, publish the separately approved linked Cask, prove
the Homebrew user path, and complete final rubric evaluation.
