# Issues - tb-implementation-efficiency

**Feature:** `tb-implementation-efficiency`
**Spec:** [spec.md](spec.md)
**Plan:** [plan.md](plan.md)
**Created:** 2026-11-09

Status: P1–P7 implemented; P8 verification and governing review in progress. Estimates remain unknown; no unsupported time estimates are implied.

## I-1 - Evidence and acceptance-contract inventory

- **Status:** done
- **Estimate:** unknown
- **Plan steps:** P1
- **Rubric criteria:** R1, R2, R4, R5, R6, R8
- **Depends on:** none
- **PR:** none

Record current source/CI coverage, available fleet evidence, baseline limitations and the old-to-new obligation mapping.

## I-2 - Authoritative per-workflow SQLite

- **Status:** in-review
- **Estimate:** unknown
- **Plan steps:** P2
- **Rubric criteria:** R3, R4, R7, R8
- **Depends on:** I-1
- **PR:** none

Implement isolated persistence, queryable record groups, retry/concurrency behavior and visible loss handling.

## I-3 - Remove runtime fingerprint qualification

- **Status:** in-review
- **Estimate:** unknown
- **Plan steps:** P3
- **Rubric criteria:** R2, R3, R8
- **Depends on:** I-1, I-2
- **PR:** none

Replace recursive runtime proof with source/configuration/actual-result semantics and preserve approval/delivery guards.

## I-4 - Consolidated fresh independent assessment

- **Status:** in-review
- **Estimate:** unknown
- **Plan steps:** P4
- **Rubric criteria:** R1, R2, R3, R4
- **Depends on:** I-1, I-2, I-3
- **PR:** none

Replace compulsory separate Judge execution, supply bounded history and preserve all required assessment responsibilities.

## I-5 - Reporting projection and fleet snapshots

- **Status:** in-review
- **Estimate:** unknown
- **Plan steps:** P5
- **Rubric criteria:** R4, R5, R6
- **Depends on:** I-2
- **PR:** none

Add readable provenance, honest capture status and idempotent supported snapshot/legacy import without workflow authority transfer.

## I-6 - Deterministic reevaluation and explicit analysis

- **Status:** in-review
- **Estimate:** unknown
- **Plan steps:** P6
- **Rubric criteria:** R4, R5, R6, R7
- **Depends on:** I-5
- **PR:** none

Build shared report model, accounting, drill-downs/HTML and optional evidence-cited model analysis.

## I-7 - CLI/MCP/desktop adapters and bounded management

- **Status:** in-review
- **Estimate:** unknown
- **Plan steps:** P7
- **Rubric criteria:** R6, R7, R8
- **Depends on:** I-2, I-5, I-6
- **PR:** none

Expose shared operations, verify UI/package parity and include only straightforward management conveniences.

## I-8 - Rollout, final verification and authorized delivery

- **Status:** in-progress
- **Estimate:** unknown
- **Plan steps:** P8
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7, R8
- **Depends on:** I-3, I-4, I-5, I-6, I-7
- **PR:** none

Validate legacy preservation and explicit resume, evaluate complete rubric, prepare current-contract review and retain separate delivery authority.

## Implementation authorization - 2026-11-09

User instruction: “Approved”, responding to the concrete specification/plan approval request. Recorded authorize-implementation through the installed current adapter. Implementation is now authorized; merge/publication/installation/deployment remain separate.
