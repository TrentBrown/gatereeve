# Issues - workflow-state-machine-cli

**Feature:** `workflow-state-machine-cli`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-08-25

Operational task breakdown derived from the approved plan.

## I-1 - Establish canonical protocol contracts and packaging

- **Status:** in-review
- **Estimate:** 1d
- **Plan steps:** P1
- **Rubric criteria:** R2, R3, R10
- **Depends on:** none
- **PR:** [#1](https://github.com/TrentBrown/gatereeve/pull/1)

Define normalized model, event, evidence, result, error, guard, and
compatibility contracts. Establish the canonical source and self-contained
plugin/optional-CLI packaging rule.

## I-2 - Build initialization, model lock, journal, and replay

- **Status:** in-review
- **Estimate:** 2d
- **Plan steps:** P2
- **Rubric criteria:** R1, R2, R3
- **Depends on:** I-1
- **PR:** [#1](https://github.com/TrentBrown/gatereeve/pull/1)

Implement atomic initialization, legacy detection, strict journal storage,
deterministic replay, compatibility checks, and explicit model migration.

## I-3 - Enforce feature, slice, suspension, and authorization lifecycle

- **Status:** in-review
- **Estimate:** 2d
- **Plan steps:** P3
- **Rubric criteria:** R4, R5
- **Depends on:** I-2
- **PR:** [#1](https://github.com/TrentBrown/gatereeve/pull/1)

Implement projection and semantic transitions with table-driven guard and
rejection tests, including the one-active-slice invariant.

## I-4 - Govern PR-boundary attempts and evidence freshness

- **Status:** in-review
- **Estimate:** 3d
- **Plan steps:** P4
- **Rubric criteria:** R6
- **Depends on:** I-3
- **PR:** [#1](https://github.com/TrentBrown/gatereeve/pull/1)

Integrate trusted existing helpers and enforce boundary dependency ordering,
attempt history, evidence fingerprints, invalidation, remediation, and passage.

## I-5 - Route feature-final evaluation and verify merged content

- **Status:** in-review
- **Estimate:** 2d
- **Plan steps:** P5
- **Rubric criteria:** R7
- **Depends on:** I-4
- **PR:** [#1](https://github.com/TrentBrown/gatereeve/pull/1)

Implement dual-range final-slice evaluation, merge verification across supported
merge modes, closeout, and return to delivery for missing implementation.

## I-6 - Govern discovered changes and sparse human decisions

- **Status:** in-review
- **Estimate:** 2d
- **Plan steps:** P6
- **Rubric criteria:** R5, R8
- **Depends on:** I-3
- **PR:** [#1](https://github.com/TrentBrown/gatereeve/pull/1)

Implement change records, authority classification, invalidation, amendment,
waiver, and renewed-authorization behavior.

## I-7 - Expose observation, assertions, history, and graphs

- **Status:** in-review
- **Estimate:** 2d
- **Plan steps:** P7
- **Rubric criteria:** R9
- **Depends on:** I-3, I-4, I-6
- **PR:** [#1](https://github.com/TrentBrown/gatereeve/pull/1)

Implement stable JSON and human views, Mermaid/JSON graphs, query semantics, and
nonmutating invariant checks.

## I-8 - Integrate plugin skills, hooks, and native packages

- **Status:** in-review
- **Estimate:** 3d
- **Plan steps:** P8
- **Rubric criteria:** R1, R6, R8, R10
- **Depends on:** I-4, I-6, I-7
- **PR:** [#1](https://github.com/TrentBrown/gatereeve/pull/1)

Route state-affecting skills through the core, enhance SessionStart, and include
the core in both self-contained native platform packages without a CLI
prerequisite.

## I-9 - Build the optional Commander gatereeve CLI surface

- **Status:** in-review
- **Estimate:** 2d
- **Plan steps:** P9
- **Rubric criteria:** R9, R10
- **Depends on:** I-7
- **PR:** [#1](https://github.com/TrentBrown/gatereeve/pull/1)

Rename and package the executable, add semantic command families, retain
maintainer namespaces, and prove plugin/CLI behavioral parity.

## I-10 - Complete acceptance coverage and documentation

- **Status:** in-review
- **Estimate:** 3d
- **Plan steps:** P10
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10
- **Depends on:** I-5, I-8, I-9
- **PR:** [#1](https://github.com/TrentBrown/gatereeve/pull/1)

Run full sequential, feature-final, legacy, migration, corruption,
cross-platform, installation, and side-effect acceptance scenarios; update all
user and maintainer documentation from verified behavior.
