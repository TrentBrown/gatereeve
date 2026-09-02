# Issues - tb-release-conductor

**Feature:** `tb-release-conductor`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-09-01

Operational task breakdown derived from the plan.

## I-1 - Modernize action and CLI runtimes

- **Status:** in-review
- **Estimate:** 0.5d
- **Plan steps:** P1
- **Rubric criteria:** R8
- **Depends on:** none
- **PR:** [#52](https://github.com/TrentBrown/gatereeve/pull/52)

Move official actions and GateReeve jobs to supported Node 24 targets, replace
the exact-Node `qp-cli-core` dependency without changing public CLI behavior,
and verify clean installs and help/runtime tests.

## I-2 - Build immutable conductor state and discovery

- **Status:** in-review
- **Estimate:** 1.5d
- **Plan steps:** P2
- **Rubric criteria:** R2, R4, R5, R6
- **Depends on:** I-1
- **PR:** [#52](https://github.com/TrentBrown/gatereeve/pull/52)

Implement the versioned state chain, guarded lifecycle, status projections,
tag-only GitHub evidence discovery, and comprehensive local fixtures.

## I-3 - Convert release phases to reusable workflows

- **Status:** in-review
- **Estimate:** 2d
- **Plan steps:** P3
- **Rubric criteria:** R1, R2, R3, R5, R6
- **Depends on:** I-2
- **PR:** [#52](https://github.com/TrentBrown/gatereeve/pull/52)

Define reusable contracts and migrate provenance/artifact validation while
removing low-level dispatches and preserving every exact-byte and authority
invariant.

## I-4 - Orchestrate start and primary publication

- **Status:** in-review
- **Estimate:** 1.5d
- **Plan steps:** P4
- **Rubric criteria:** R1, R2, R3, R4
- **Depends on:** I-2, I-3
- **PR:** [#52](https://github.com/TrentBrown/gatereeve/pull/52)

Implement sole-entry preflight, protected trust, automatic sealing/rehearsal,
primary approval/publication, status artifacts, and direct-install wait state.

## I-5 - Orchestrate resume, recovery, Cask, and smoke

- **Status:** in-review
- **Estimate:** 2d
- **Plan steps:** P5
- **Rubric criteria:** R3, R4, R5, R6
- **Depends on:** I-2, I-3, I-4
- **PR:** [#52](https://github.com/TrentBrown/gatereeve/pull/52)

Implement tag-only recovery routing, direct-install attestation, linked Cask
automation, protected publication, native/public smoke aggregation, and all
failure/resume fixtures.

## I-6 - Remove alternate paths and narrow metadata CI

- **Status:** in-review
- **Estimate:** 1d
- **Plan steps:** P6
- **Rubric criteria:** R1, R7, R8
- **Depends on:** I-3, I-4, I-5
- **PR:** [#52](https://github.com/TrentBrown/gatereeve/pull/52)

Remove the legacy tag publisher, apply the exact metadata-only CI exception,
strengthen deterministic transport checks, and rewrite operator documentation
around conductor-only production.

## I-7 - Complete feature-final verification

- **Status:** in-review
- **Estimate:** 1d
- **Plan steps:** P7
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7, R8
- **Depends on:** I-1, I-2, I-3, I-4, I-5, I-6
- **PR:** [#52](https://github.com/TrentBrown/gatereeve/pull/52)

Run the full contract, simulation, lint, spec, topology, dependency, and review
boundary; publish the post-merge operational acceptance checklist.

## I-8 - Make repeated PR validation efficient and resilient

- **Status:** in-review
- **Estimate:** 0.5d
- **Plan steps:** P8
- **Rubric criteria:** R9
- **Depends on:** I-7
- **PR:** [#52](https://github.com/TrentBrown/gatereeve/pull/52)

Safely collapse evidence-only follow-up validation, cancel superseded PR runs,
reuse container/npm build layers, and retry only the bounded transient DMG
verification failure without masking invalid packages.

## I-9 - Recover schema-v2 primary publication state

- **Status:** in-progress
- **Estimate:** 1h
- **Plan steps:** P4, P5
- **Rubric criteria:** R4, R5
- **Depends on:** I-4, I-5
- **PR:** pending

Read the exact public DMG identity from the published schema-v2 lifecycle,
regression-test the schema boundary exposed by RC.11, and resume the retained
release without rebuilding or republishing its primary artifacts.
