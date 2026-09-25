# Issues - tb-whiteboard-test-gate

**Feature:** `tb-whiteboard-test-gate`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-09-24

Operational task breakdown derived from the plan. All tasks are intended for
one feature pull request, with separate commits and reviewable boundaries where
practical.

## I-1 - Multi-plugin packaging and Whiteboard package identities

- **Status:** closed
- **Estimate:** unknown
- **Plan steps:** P1
- **Rubric criteria:** R1, R7
- **Depends on:** none
- **PR:** #67

Generalize the existing single-plugin source, marketplace, inventory, smoke,
integrity, and release contracts, then add independent Codex and Claude Code
Whiteboard Test package identities.

## I-2 - Agent-workflow protocol and evidence contracts

- **Status:** closed
- **Estimate:** unknown
- **Plan steps:** P2
- **Rubric criteria:** R1, R2, R6, R7
- **Depends on:** I-1
- **PR:** #67

Define and validate staged-agent modules, capability profiles, bounded inputs,
typed outputs, isolation policies, receipts, fingerprints, snapshots, and
versioned compatibility across the canonical and staged protocol copies.

## I-3 - Headless scheduler and governed execution runtime

- **Status:** closed
- **Estimate:** unknown
- **Plan steps:** P3
- **Rubric criteria:** R2, R3, R5, R6, R7
- **Depends on:** I-2
- **PR:** #67

Implement automatic eligible execution, read-only pinned inputs, disposable
scratch, output capture, manifest validation, receipts, crash recovery, bounded
retries, and protocol-core outcome recording.

## I-4 - Codex and Claude Code isolation adapters

- **Status:** closed
- **Estimate:** unknown
- **Plan steps:** P4
- **Rubric criteria:** R3, R7
- **Depends on:** I-2, I-3
- **PR:** #67

Implement both provider adapters and their conformance tests, including fresh
contexts, capability mapping, zero inherited turns, read-only access, typed
outputs, and fail-closed readiness.

## I-5 - Whiteboard Test plugin and defense artifacts

- **Status:** closed
- **Estimate:** unknown
- **Plan steps:** P5
- **Rubric criteria:** R1, R2, R3, R4, R5, R6
- **Depends on:** I-2, I-3, I-4
- **PR:** #67

Implement the module, role resources, question contract, evidence packet,
manifest, presentation, findings, visuals, outcome rules, and deterministic
validator for slice and feature-final boundaries.

## I-6 - Desktop agent workflow and sandboxed presentation

- **Status:** closed
- **Estimate:** unknown
- **Plan steps:** P6
- **Rubric criteria:** R4, R6, R7
- **Depends on:** I-3, I-5
- **PR:** #67

Expose shared runtime state and artifacts in Desktop, render the bound HTML in
the required sandbox, and verify interaction, accessibility, and surface parity.

## I-7 - Isolated Judge module upgrade

- **Status:** closed
- **Estimate:** unknown
- **Plan steps:** P7
- **Rubric criteria:** R7, R8
- **Depends on:** I-2, I-3, I-4
- **PR:** #67

Version Judge onto the agent-workflow primitive, remove same-context fallback,
add `judge.json`, retain blocking/no-remediation semantics, and prove historical
evidence compatibility.

## I-8 - Integrated acceptance, documentation, and PR boundary

- **Status:** in-progress
- **Estimate:** unknown
- **Plan steps:** P8, P9
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7, R8
- **Depends on:** I-5, I-6, I-7
- **PR:** #67

Complete representative failure and lifecycle fixtures, broad regressions,
Desktop and plugin dogfood, documentation, rubric evaluation, and the single
governed PR boundary.
