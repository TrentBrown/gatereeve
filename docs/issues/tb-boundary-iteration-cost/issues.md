# Issues - tb-boundary-iteration-cost

**Feature:** `tb-boundary-iteration-cost`
**Spec:** [spec.md](spec.md)
**Plan:** [plan.md](plan.md)
**Created:** 2026-10-12

Operational task breakdown derived from P1-P7. Estimates remain unknown pending implementation; no external tracker task is assigned or created by this planning work. I-6 is cumulative packaging/guidance work delivered incrementally with earlier issues, not a requirement to hold all packaging until the final slice.

## I-1 - Review view identity and formal history exclusion

- **Status:** in-progress
- **Estimate:** unknown
- **Plan steps:** P1
- **Rubric criteria:** R4, R5, R10, R18, R22
- **Depends on:** none
- **PR:** -

Build the immutable allowed-input view and audit receipt; cover semantic record classification, aliases, approved requirement reconciliation and older model behavior.

## I-2 - Bounded large review input and binary/rename fidelity

- **Status:** in-progress
- **Estimate:** unknown
- **Plan steps:** P2
- **Rubric criteria:** R15, R16, R17, R18, R24
- **Depends on:** I-1
- **PR:** -

Replace aggregate payload construction with references; prove deduplication, rename/binary fidelity, mixed-feature scope and measured oversized fixture behavior.

## I-3 - Guarded post-merge finalization recovery

- **Status:** open
- **Estimate:** unknown
- **Plan steps:** P3
- **Rubric criteria:** R19, R20, R21, R22, R23
- **Depends on:** I-1, I-2
- **PR:** -

Add dedicated semantic recovery/replay, source/waiver/remaining-evidence checks and explicit compatible adoption; preserve ordinary closeout and old journals.

## I-4 - Advisory readiness execution and durable records

- **Status:** open
- **Estimate:** unknown
- **Plan steps:** P4
- **Rubric criteria:** R1, R2, R3, R6, R7, R8, R9, R10, R11, R23
- **Depends on:** I-1, I-2
- **PR:** -

Implement readiness trigger, isolated review, compact records, defect-class and recurrence checks, prior finding checklist, evidence-only reuse and bounded error retry.

## I-5 - Repeat-safe formal retry and deferred presentation

- **Status:** open
- **Estimate:** unknown
- **Plan steps:** P5
- **Rubric criteria:** R3, R12, R13, R14, R23, R24
- **Depends on:** I-3, I-4
- **PR:** -

Orchestrate exact existing PR/fresh attempt/gate bookkeeping, interruption reconciliation and clean-path presentation without formal PASS reuse.

## I-6 - Portable adapters, package contracts and canonical guidance

- **Status:** open
- **Estimate:** unknown
- **Plan steps:** P6
- **Rubric criteria:** R2, R4, R5, R7, R8, R11, R12, R13, R19, R21, R22, R23, R24
- **Depends on:** I-1, I-2, I-3, I-4, I-5
- **PR:** -

Deliver scoped adapter/resource changes with each slice, then validate final package inventory/selectors/staged hosts and consistent user-facing invocation/guidance.

## I-7 - Full journey, compatibility and cost evidence

- **Status:** open
- **Estimate:** unknown
- **Plan steps:** P7
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R23, R24
- **Depends on:** I-1, I-2, I-3, I-4, I-5, I-6
- **PR:** -

Complete failure/recovery/old-record scenarios and measurement report, then run full rubric and governed feature-final review. Do not claim release or real MyLifeMap repair.
