# Branch Tracker - workflow-state-machine-cli

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-08-25

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|----|-------|
| R1 | Governed initialization and legacy coexistence | PASS | [#1](https://github.com/TrentBrown/gatereeve/pull/1) | Atomic success/failure and legacy/inconsistent mode tests pass |
| R2 | Journal and projection integrity | PASS | [#1](https://github.com/TrentBrown/gatereeve/pull/1) | Schema, replay, lock, corruption, and rejection-no-append tests pass |
| R3 | Model pinning and migration | PASS | [#1](https://github.com/TrentBrown/gatereeve/pull/1) | Pinning, impact preview, confirmation, version skew, and recovery pass |
| R4 | Feature and slice lifecycle enforcement | PASS | [#1](https://github.com/TrentBrown/gatereeve/pull/1) | Lifecycle, illegal transition, and one-active-slice scenarios pass |
| R5 | Suspension and implementation authority | PASS | [#1](https://github.com/TrentBrown/gatereeve/pull/1) | Pause/resume and sequential feature authorization scenarios pass |
| R6 | PR-boundary ordering, freshness, and attempts | PASS | [#1](https://github.com/TrentBrown/gatereeve/pull/1) | DAG, fingerprint, staleness, waiver, rerun, and remediation tests pass |
| R7 | Feature-final routing and closeout | PASS | [#1](https://github.com/TrentBrown/gatereeve/pull/1) | Dual-range final scenario and Git merge-content verifier pass |
| R8 | Discovered-change governance | PASS | [#1](https://github.com/TrentBrown/gatereeve/pull/1) | Change lifecycle, authority, invalidation, and reauthorization pass |
| R9 | Observer, graph, JSON, and exit-code contract | PASS | [#1](https://github.com/TrentBrown/gatereeve/pull/1) | Observer/CLI parity, read-only, graph, and binary check tests pass |
| R10 | Plugin and optional CLI parity | PASS | [#1](https://github.com/TrentBrown/gatereeve/pull/1) | Native package, SessionStart, staged CLI install, and namespace tests pass |

## PR Log

Append PR boundary entries here.

### PR #1 - Governed workflow state protocol - 2026-08-25

- **Evidence packet:** [pr-1](pr-1/)
- **Plan steps covered:** P1-P10
- **Rubric criteria in scope:** R1-R10
- **Rubric criteria moved to PASS:** R1-R10
- **DoD:** PASS WITH MANUAL VERIFICATION
- **Status:** draft; awaiting human review
