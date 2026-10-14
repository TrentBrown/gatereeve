# Branch Tracker - tb-configurable-gate-ordering

**Spec:** [spec.md](spec.md)
**Plan:** [plan.md](plan.md)
**Issues:** [issues.md](issues.md)
**Created:** 2026-10-14

## Workflow Position

The approved configurable ordering design is implemented in one FEATURE_FINAL slice P1-P5, PR #81. Formal attempt a4 failed R4/R7/R10 with four independent findings. Core returned the slice to IMPLEMENTING through evt-ordering-a4-remediation before changes. Class-wide remediation now covers launch-event binding, explicit presentation descendants, disabled-review packet inventory and pre-mutation migration refusal/reload adoption. Fresh readiness, current full verification and a new history-blind formal Judge remain required; no prior formal PASS is reused and no release/activation is asserted.

## Rubric Status

| # | Criterion | Status | Review | Notes |
|---|-----------|--------|--------|-------|
| R1 | Policy and graph compatibility | NOT YET | - | P1 |
| R2 | Validation | NOT YET | - | P1 |
| R3 | Conditional and protected behavior | NOT YET | - | P1 |
| R4 | Eligibility and freshness | NOT YET | - | P2 |
| R5 | Isolation and migration | NOT YET | - | P2 |
| R6 | Owner controls | NOT YET | - | P3 |
| R7 | Apply/discard safety | NOT YET | - | P3 |
| R8 | Exact DAG | NOT YET | - | P4 |
| R9 | Accessibility and derived grouping | NOT YET | - | P4 |
| R10 | Portable integration and safeguards | NOT YET | - | P5 |

## Review Log

- 2026-10-14: Design direction approved: "Okay, I approve of this. Make it so." Spec validation PASS; routine implementation plan derived from approved scope. No PR yet.

- Native advisory ordering-s1-ready-2 confirmed the three frontend fixes and identified one host catalog/feature-baseline drift defect. Core returned through evt-ordering-a2-remediation before changes. Host-computed candidate/catalog/model/journal fingerprint and expected-baseline core guard now bind confirmation; publication rechecks and guarded own-byte rollback cover late conflicts. New actual-manager/IPC tests pass; full CLI410/Desktop212/Python132+template2 and portable checks PASS. Fresh readiness3 and full-scope advisory review follow; no formal Judge PASS is claimed.

- Fresh attempt a3 recorded Verification PASS, then formal R7 assessment FAIL for publication/rollback ownership. Returned through evt-ordering-a3-remediation before changes; added repository-exclusive mutation lock and cross-context confirmation binding, with saved-policy reload. Focused tests and full Desktop214 PASS. Earlier native advisory3 is UNAVAILABLE/CONTRACT_INVALID; no accepted clean advisory or formal Judge PASS is claimed. Fresh readiness/attempt required.

### PR #81

[Review packet](pr-81/boundary.json) — preparation in progress; no human-review passage yet.

- Formal Judge a4: FAIL R4/R7/R10. F1 in-flight predecessor rebinding; F2 hidden retry presentation/packet barriers; F3 disabled review modules still mandatory to packet inventory; F4 journal-lock refusal saved policy without adoption. Actual findings and independent receipt retained under pr-81/attempts/retry-ordering-ready-4-pr81-a4/.
- Advisory4: UNAVAILABLE/CONTRACT_INVALID, with one actual provider attempt and no accepted advisory verdict. The retained proceed reason permitted formal entry; it did not waive formal checks.
- Revised class approach: preserve launch bindings through native/command/provider/finalization completion and check them in core recording; make explicit DAG dependencies authoritative instead of retry-wide barriers; validate modular packet inventory against the actual pinned attempt; restore only confirmed untouched core state after migration refusal and expose unchanged adoption after reload. Focused45/Desktop217/CLI413 PASS; final portable checks and fresh independent reviews are pending.
