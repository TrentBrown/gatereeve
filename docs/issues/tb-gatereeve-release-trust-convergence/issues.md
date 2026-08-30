# Issues - tb-gatereeve-release-trust-convergence

**Feature:** `tb-gatereeve-release-trust-convergence`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-08-30

Operational task breakdown derived from the plan.

## I-1 - Implement schema-v2 lifecycle and v1 compatibility

- **Status:** closed
- **Estimate:** 1.5d
- **Plan steps:** P1
- **Rubric criteria:** R1, R2
- **Depends on:** none
- **PR:** [#32](https://github.com/TrentBrown/gatereeve/pull/32)

Add strict schema dispatch, guarded v2 stages, immutable identity/digest
binding, and compatibility fixtures without mutating historical v1 records.

## I-2 - Implement candidate reservation and Apple attempt recovery

- **Status:** closed
- **Estimate:** 2d
- **Plan steps:** P2
- **Rubric criteria:** R2, R4
- **Depends on:** I-1
- **PR:** [#32](https://github.com/TrentBrown/gatereeve/pull/32)

Replace synchronous opaque notarization with durable submit/reconcile/poll
records, finite polling, version burn, and fail-closed negative coverage.

## I-3 - Version native trust evidence and add conformance fixtures

- **Status:** closed
- **Estimate:** 1.5d
- **Plan steps:** P3
- **Rubric criteria:** R1, R2, R5, R8
- **Depends on:** I-1, I-2
- **PR:** [#33](https://github.com/TrentBrown/gatereeve/pull/33)

Align exact universal-DMG evidence, native aggregation, and shared semantic
fixtures while retaining GateReeve-specific trust surfaces.

## I-4 - Separate and harden protected trust production

- **Status:** closed
- **Estimate:** 2d
- **Plan steps:** P4
- **Rubric criteria:** R2, R3, R4, R5
- **Depends on:** I-2, I-3
- **PR:** [#33](https://github.com/TrentBrown/gatereeve/pull/33)

Rework the hosted preparation workflow for reviewed-main authority,
per-version serialization, `release-trust`, cleanup, recovery, retention, and
workflow-contract tests.

## I-5 - Implement hosted primary publication

- **Status:** in-review
- **Estimate:** 2d
- **Plan steps:** P5
- **Rubric criteria:** R3, R6
- **Depends on:** I-1, I-3, I-4
- **PR:** [#34](https://github.com/TrentBrown/gatereeve/pull/34)

Seal the v2 packet after trust, add exact-plan protected dry-run/publication,
and preserve deterministic receipt-based recovery.

## I-6 - Implement linked hosted Cask publication

- **Status:** in-review
- **Estimate:** 1.5d
- **Plan steps:** P6
- **Rubric criteria:** R3, R7
- **Depends on:** I-5
- **PR:** [#34](https://github.com/TrentBrown/gatereeve/pull/34)

Version and bind the separate Cask record, retain direct-install proof, and add
publication-only approval plus partial-retry tests.

## I-7 - Update release operations and migration documentation

- **Status:** in-review
- **Estimate:** 1d
- **Plan steps:** P7
- **Rubric criteria:** R1, R2, R3, R4, R6, R7
- **Depends on:** I-4, I-5, I-6
- **PR:** [#34](https://github.com/TrentBrown/gatereeve/pull/34)

Document and test the one-time environment cutover, ordinary approvals,
bounded recovery, version burn, hosted publication, and immutable history.

## I-8 - Complete sequential PR boundaries and mainline assembly

- **Status:** closed
- **Estimate:** 1d
- **Plan steps:** P8
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7, R8
- **Depends on:** I-1, I-2, I-3, I-4, I-5, I-6, I-7
- **PR:** -

Run every required gate for each proposed delivery boundary and assemble only
reviewed topic changes on `main` before live environment mutation.

## I-9 - Complete live cutover and nonpublishing acceptance

- **Status:** in-progress
- **Estimate:** 1d plus Apple processing time
- **Plan steps:** P9
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7, R8
- **Depends on:** I-8
- **PR:** -

Coordinate user-operated secret migration, audit the separated environments,
run a fresh protected RC rehearsal and hosted publication dry run, retain zero-
mutation evidence, and complete full rubric/judge verification.
