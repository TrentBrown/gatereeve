# Issues - tb-unattended-autonomy

**Feature:** `tb-unattended-autonomy`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-11-21

Operational task breakdown derived from the plan.

## I-1 - Goal dial and autonomous parity

- **Status:** in-review
- **Estimate:** medium
- **Plan steps:** P1
- **Rubric criteria:** R1, R2, R3
- **Depends on:** none
- **PR:** -

Add `goal` to the autonomy dial with autonomous grant prerequisites and route
all autonomous-authority checks through one predicate.

## I-2 - Park operation and terminal status

- **Status:** in-review
- **Estimate:** medium
- **Plan steps:** P2
- **Rubric criteria:** R4, R5
- **Depends on:** I-1
- **PR:** -

`goal.park`, `PARKED`, human resume, and `status.goal`.

## I-3 - Question guard and Stop hook

- **Status:** in-review
- **Estimate:** medium
- **Plan steps:** P3, P4
- **Rubric criteria:** R6, R7
- **Depends on:** I-2
- **PR:** -

PreToolUse question-tool branch, Stop hook, manifests and Codex contract check.

## I-4 - Provenance-tagged record and publication

- **Status:** in-review
- **Estimate:** medium
- **Plan steps:** P5
- **Rubric criteria:** R8
- **Depends on:** I-1
- **PR:** -

Procedure and template updates, planning-review rule, "Decisions made for you".

## I-5 - Goal skill, SessionStart, surfaces and docs

- **Status:** in-review
- **Estimate:** medium
- **Plan steps:** P6, P7
- **Rubric criteria:** R9, R10
- **Depends on:** I-2, I-3, I-4
- **PR:** -

New `goal` skill, session guidance, CLI/desktop views, docs, restaged
resources and package validation.

## I-6 - Rename `autonomous` to `mandated`

- **Status:** in-review
- **Estimate:** small
- **Plan steps:** P8
- **Rubric criteria:** R11
- **Depends on:** I-1
- **PR:** -

Dial value rename with input alias and legacy replay normalization (spec A1).
