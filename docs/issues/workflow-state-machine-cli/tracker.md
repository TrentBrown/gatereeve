# Branch Tracker - workflow-state-machine-cli

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-08-25

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|----|-------|
| R1 | Governed initialization and legacy coexistence | PASS | - | Atomic success/failure and legacy/inconsistent mode tests pass |
| R2 | Journal and projection integrity | PASS | - | Schema, replay, lock, corruption, and rejection-no-append tests pass |
| R3 | Model pinning and migration | PASS | - | Pinning, impact preview, confirmation, version skew, and recovery pass |
| R4 | Feature and slice lifecycle enforcement | PASS | - | Lifecycle, illegal transition, and one-active-slice scenarios pass |
| R5 | Suspension and implementation authority | PASS | - | Pause/resume and sequential feature authorization scenarios pass |
| R6 | PR-boundary ordering, freshness, and attempts | PASS | - | DAG, fingerprint, staleness, waiver, rerun, and remediation tests pass |
| R7 | Feature-final routing and closeout | PASS | - | Dual-range final scenario and Git merge-content verifier pass |
| R8 | Discovered-change governance | PASS | - | Change lifecycle, authority, invalidation, and reauthorization pass |
| R9 | Observer, graph, JSON, and exit-code contract | PASS | - | Observer/CLI parity, read-only, graph, and binary check tests pass |
| R10 | Plugin and optional CLI parity | PASS | - | Native package, SessionStart, staged CLI install, and namespace tests pass |

## PR Log

Append PR boundary entries here.
