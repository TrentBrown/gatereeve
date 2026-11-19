# Issues - tb-dual-model-review

**Feature:** `tb-dual-model-review`
**Spec:** [spec.md](spec.md)
**Plan:** [plan.md](plan.md)
**Created:** 2026-11-18

## I-1 - Paired proof, selection and concurrent review

- **Status:** in-review
- **Estimate:** large
- **Plan steps:** P1, P2
- **Rubric criteria:** R1, R2, R3, R4, R8
- **Depends on:** none
- **PR:** https://github.com/TrentBrown/gatereeve/pull/121

Introduce pair/selection identities and retained native receipts, runtime capability-based selection, isolated concurrent assessments and compatibility behavior. Cover independent coverage, operational failure and concurrency with meaningful tests.

## I-2 - Finding reconciliation and delta qualification

- **Status:** in-review
- **Estimate:** medium
- **Plan steps:** P3
- **Rubric criteria:** R1, R4, R5
- **Depends on:** I-1
- **PR:** https://github.com/TrentBrown/gatereeve/pull/121

Preserve reviewer provenance and findings, independently qualify changed scope, and expose persistent disputes without false clearance.

## I-3 - Autonomous grant, mandate and amendments

- **Status:** in-review
- **Estimate:** large
- **Plan steps:** P4
- **Rubric criteria:** R5, R6
- **Depends on:** I-1
- **PR:** https://github.com/TrentBrown/gatereeve/pull/121

Add the explicit named-run mode, fixed human mandate and independent in-mandate planning/amendment authority. Preserve current defaults, old-mode behavior and protected-release boundaries.

## I-4 - Autonomous adjudication and diminishing returns

- **Status:** in-review
- **Estimate:** large
- **Plan steps:** P5
- **Rubric criteria:** R4, R5, R7
- **Depends on:** I-2, I-3
- **PR:** https://github.com/TrentBrown/gatereeve/pull/121

Qualify documented residual-risk decisions and stop reasons separately from original reviewer outcomes. Block missing/incomplete proof, mandatory failures, integrity gaps and mandate violations.

## I-5 - Delivery, publication and consistent user interfaces

- **Status:** in-review
- **Estimate:** large
- **Plan steps:** P6
- **Rubric criteria:** R5, R7, R8
- **Depends on:** I-4
- **PR:** https://github.com/TrentBrown/gatereeve/pull/121

Integrate protected acceptance/delivery, truthful summaries, CLI/desktop behavior, native workflow instructions, staging and historical resumption behavior.

## I-6 - Independent final verification and PR readiness

- **Status:** in-review
- **Estimate:** medium
- **Plan steps:** P7
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7, R8
- **Depends on:** I-5
- **PR:** https://github.com/TrentBrown/gatereeve/pull/121

Run appropriate checks, resolve independent findings, retain rubric evidence and prepare the final PR. Record unavailable integration coverage and obtain explicit final-merge authorization separately.
