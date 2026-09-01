# Issues - tb-release-conductor

**Feature:** `tb-release-conductor`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-09-01

Operational task breakdown derived from the plan.

## I-1 - Modernize action and CLI runtimes

- **Status:** in-progress
- **Estimate:** 0.5d
- **Plan steps:** P1
- **Rubric criteria:** R8
- **Depends on:** none
- **PR:** -

Move official actions and GateReeve jobs to supported Node 24 targets, replace
the exact-Node `qp-cli-core` dependency without changing public CLI behavior,
and verify clean installs and help/runtime tests.

## I-2 - Build immutable conductor state and discovery

- **Status:** in-progress
- **Estimate:** 1.5d
- **Plan steps:** P2
- **Rubric criteria:** R2, R4, R5, R6
- **Depends on:** I-1
- **PR:** -

Implement the versioned state chain, guarded lifecycle, status projections,
tag-only GitHub evidence discovery, and comprehensive local fixtures.

## I-3 - Convert release phases to reusable workflows

- **Status:** in-progress
- **Estimate:** 2d
- **Plan steps:** P3
- **Rubric criteria:** R1, R2, R3, R5, R6
- **Depends on:** I-2
- **PR:** -

Define reusable contracts and migrate provenance/artifact validation while
removing low-level dispatches and preserving every exact-byte and authority
invariant.

## I-4 - Orchestrate start and primary publication

- **Status:** in-progress
- **Estimate:** 1.5d
- **Plan steps:** P4
- **Rubric criteria:** R1, R2, R3, R4
- **Depends on:** I-2, I-3
- **PR:** -

Implement sole-entry preflight, protected trust, automatic sealing/rehearsal,
primary approval/publication, status artifacts, and direct-install wait state.

## I-5 - Orchestrate resume, recovery, Cask, and smoke

- **Status:** in-progress
- **Estimate:** 2d
- **Plan steps:** P5
- **Rubric criteria:** R3, R4, R5, R6
- **Depends on:** I-2, I-3, I-4
- **PR:** -

Implement tag-only recovery routing, direct-install attestation, linked Cask
automation, protected publication, native/public smoke aggregation, and all
failure/resume fixtures.

## I-6 - Remove alternate paths and narrow metadata CI

- **Status:** in-progress
- **Estimate:** 1d
- **Plan steps:** P6
- **Rubric criteria:** R1, R7, R8
- **Depends on:** I-3, I-4, I-5
- **PR:** -

Remove the legacy tag publisher, apply the exact metadata-only CI exception,
strengthen deterministic transport checks, and rewrite operator documentation
around conductor-only production.

## I-7 - Complete feature-final verification

- **Status:** in-progress
- **Estimate:** 1d
- **Plan steps:** P7
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7, R8
- **Depends on:** I-1, I-2, I-3, I-4, I-5, I-6
- **PR:** -

Run the full contract, simulation, lint, spec, topology, dependency, and review
boundary; publish the post-merge operational acceptance checklist.
