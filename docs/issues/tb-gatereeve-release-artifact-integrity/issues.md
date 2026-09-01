# Issues - tb-gatereeve-release-artifact-integrity

**Feature:** `tb-gatereeve-release-artifact-integrity`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-08-31

Operational task breakdown derived from the plan.

## I-1 - Implement the Plugin tree integrity contract

- **Status:** closed
- **Estimate:** 0.5d
- **Plan steps:** P1
- **Rubric criteria:** R1, R3, R4, R5
- **Depends on:** none
- **PR:** [#44](https://github.com/TrentBrown/gatereeve/pull/44)

Create the producer commitment and strict exact-tree plus semantic verifier.

## I-2 - Harden hosted artifact handoffs and ordering

- **Status:** closed
- **Estimate:** 0.5d
- **Plan steps:** P2
- **Rubric criteria:** R2, R3, R4, R6
- **Depends on:** I-1
- **PR:** [#44](https://github.com/TrentBrown/gatereeve/pull/44)

Preserve hidden files, verify each consumer, and gate Apple authority on the
first round trip.

## I-3 - Add regression coverage and operator documentation

- **Status:** closed
- **Estimate:** 0.5d
- **Plan steps:** P3
- **Rubric criteria:** R1, R2, R3, R4, R5, R6
- **Depends on:** I-1, I-2
- **PR:** [#44](https://github.com/TrentBrown/gatereeve/pull/44)

Cover every named failure class and document the immutable RC.5/forward-fix
recovery rule.

## I-4 - Deliver and verify the correction on main

- **Status:** closed
- **Estimate:** 0.5d
- **Plan steps:** P4
- **Rubric criteria:** R1, R2, R3, R4, R5, R6
- **Depends on:** I-1, I-2, I-3
- **PR:** [#44](https://github.com/TrentBrown/gatereeve/pull/44)

Complete the governed boundary, human review, permitted merge, and mainline CI.

## I-5 - Publish and verify RC.6 primary surfaces

- **Status:** closed
- **Estimate:** unknown
- **Plan steps:** P5
- **Rubric criteria:** R2, R3, R4, R6, R7
- **Depends on:** I-4
- **PR:** [#46](https://github.com/TrentBrown/gatereeve/pull/46)

Run the fresh protected trust and primary publication lifecycle from corrected
main. Completed through same-packet bounded recovery after a repository Actions
PR-permission prerequisite surfaced at the fourth ordered publication surface.
PR #46 was human-approved and merged into `main` as
`9a00ec850b999fe8abd51277cb5fe3f78a59bdfc`; exact reviewed head
`68a3977ed60c11f07ce2a36886cb892540322d99` is its ancestor.

## I-6 - Prove direct and Homebrew Mac installation

- **Status:** in-review
- **Estimate:** unknown
- **Plan steps:** P6, P7
- **Rubric criteria:** R6, R8
- **Depends on:** I-5
- **PR:** [#47](https://github.com/TrentBrown/gatereeve/pull/47) (provenance correction), [#49](https://github.com/TrentBrown/gatereeve/pull/49) (feature-final acceptance)

Collect direct DMG evidence, publish the separately approved linked Cask, prove
the Homebrew user path, and complete final rubric evaluation.

The exact public DMG install, Gatekeeper checks, and launch passed on the user's
Mac at `2026-09-01T14:44:59Z`. PR #47 corrected linked-Cask provenance and
merged as `1c19304e67f34f12930b1c51c5e06621c05c6734`. Fresh linked-Cask
finalization, protected rehearsal, exact-plan approval, publication, and
bounded configuration recovery then completed. Tap PR #3 merged the exact
sealed RC.6 Cask as `3b07cf6d740261298a6a596f25f3c456ed9bac35`.
Homebrew replaced RC.2 with RC.6 on the user's Mac, reported installed version
`0.1.0-rc.6`, and Gatekeeper accepted the launched app as `Notarized Developer
ID` at `2026-09-01T16:11:51Z`. PR #49 carries the complete acceptance record
and final feature evaluation.
