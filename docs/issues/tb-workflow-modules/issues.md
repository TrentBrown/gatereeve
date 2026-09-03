# Issues - tb-workflow-modules

**Feature:** `tb-workflow-modules`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-09-03

Operational task breakdown derived from the plan.

## I-1 - Define the module schemas and deterministic resolver

- **Status:** in-review
- **Estimate:** 2d
- **Plan steps:** P1, P2
- **Rubric criteria:** R1, R3, R7
- **Depends on:** none
- **PR:** [#61](https://github.com/TrentBrown/gatereeve/pull/61)

Add schemas, fixtures, canonical hashing, local definition discovery, tracked
policy resolution, DAG validation, full feature pinning, readiness distinction,
and explicit migration-impact behavior.

## I-2 - Convert existing PR gates to declarative built-ins

- **Status:** in-review
- **Estimate:** 2d
- **Plan steps:** P3
- **Rubric criteria:** R2, R3, R6
- **Depends on:** I-1
- **PR:** [#61](https://github.com/TrentBrown/gatereeve/pull/61)

Represent the complete current boundary with module definitions, preserve its
locked envelope and existing semantics, and prove canonical CLI/plugin/Desktop
parity and regression behavior. This completes delivery slice 1.

## I-3 - Add project module policy and waiver controls

- **Status:** open
- **Estimate:** 2d
- **Plan steps:** P4
- **Rubric criteria:** R1, R3
- **Depends on:** I-2
- **PR:** -

Build staged settings, dependency previews, atomic uncommitted writes,
active-feature migration confirmation, local-readiness display, and scoped
boundary/finalization waiver actions.

## I-4 - Generalize module graph and detail presentation

- **Status:** open
- **Estimate:** 2d
- **Plan steps:** P5
- **Rubric criteria:** R4, R7
- **Depends on:** I-2, I-3
- **PR:** -

Reuse the existing boundary graph beneath Implementing and add its parallel
Finalizing view, standard module detail, live status, actions, history, empty
states, responsive behavior, and accessibility. This completes delivery slice 2.

## I-5 - Add run adapters and provider process supervision

- **Status:** open
- **Estimate:** 2d
- **Plan steps:** P6
- **Rubric criteria:** R5, R6
- **Depends on:** I-2
- **PR:** -

Define skill/manual/command adapters and the allowlisted JSON-over-stdio provider
contract, including discovery, normalization, supervision, adversarial handling,
and protocol-validated automatic outcomes.

## I-6 - Add command authorization and task terminal sessions

- **Status:** open
- **Estimate:** 3d
- **Plan steps:** P7
- **Rubric criteria:** R5, R6
- **Depends on:** I-3, I-5
- **PR:** -

Implement informed-consent storage, exact detectable-input invalidation,
multi-session PTY presentation, bounded attempt evidence, cancellation/timeout,
restart recovery, and result mapping while preserving the user shell. This
completes delivery slice 3.

## I-7 - Add generic feature-finalization gating

- **Status:** open
- **Estimate:** 2d
- **Plan steps:** P8
- **Rubric criteria:** R3, R4, R7
- **Depends on:** I-4, I-5, I-6
- **PR:** -

Create feature-level finalization attempts and fingerprints, generic passage,
zero-module behavior, all adapter modes, reruns, failure/readiness states, N/A,
and feature-scoped waivers without release-specific core concepts.

## I-8 - Implement GateReeve Release provider

- **Status:** open
- **Estimate:** 2d
- **Plan steps:** P9
- **Rubric criteria:** R6, R8
- **Depends on:** I-5, I-7
- **PR:** -

Package the canonical release module/provider, adapt validated conductor state
and safe actions, prove final-merge source containment and multi-feature reuse,
and reject incomplete or invalid retained evidence.

## I-9 - Verify, merge, and dogfood the real release gate

- **Status:** open
- **Estimate:** 2d
- **Plan steps:** P10
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7, R8
- **Depends on:** I-7, I-8
- **PR:** -

Complete delivery slice 4 verification and review, merge it, then run a real
GateReeve release through terminal conductor completion with retained public,
installation, smoke, and feature-finalization evidence.
