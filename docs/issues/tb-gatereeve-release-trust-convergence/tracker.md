# Branch Tracker - tb-gatereeve-release-trust-convergence

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-08-30

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|----|-------|
| R1 | Schema lifecycle | NOT YET | - | P1 complete: guarded v2 prefix, exact v1 dispatch, immutable RC.2 fixture; P3, P7-P9 remain |
| R2 | Source and byte authority | NOT YET | - | P1-P2 complete: reservation plus source/DMG binding and changed-byte rejection; P3-P4, P7-P9 remain |
| R3 | Credential custody | NOT YET | - | P4-P9 / I-4-I-9 |
| R4 | Notarization recovery | NOT YET | - | P2 complete: durable submitting/request/poll/timeout/reconcile/reject/supersede contracts; P4, P7-P9 remain |
| R5 | Native verification | NOT YET | - | P3-P4, P8-P9 / I-3-I-4, I-8-I-9 |
| R6 | Finalization and publication | NOT YET | - | P5, P7-P9 / I-5, I-7-I-9 |
| R7 | Cask linkage | NOT YET | - | P6-P9 / I-6-I-9 |
| R8 | Conformance and acceptance | NOT YET | - | P3, P8-P9 / I-3, I-8-I-9 |

## PR Log

Append PR boundary entries here.

### PR #32 - Lifecycle and notarization recovery contracts

- **PR:** [#32](https://github.com/TrentBrown/gatereeve/pull/32)
- **Evidence packet:** [packet](pr-32/)
- **Scope:** P1-P2 / I-1-I-2 / R1, R2, R4 foundations.
- **Summary:** Adds strict schema-v2 lifecycle history, immutable candidate and
  Apple-artifact identity, explicit schema-v1 compatibility, and append-only
  recoverable notarization attempts with bounded polling and fail-closed
  submission reconciliation.
- **Verification:** Desktop 121 passed; CLI 142 passed; static checks passed.
- **Independent judgment:** PASS WITH CONCERNS. No blocking defect; protected
  hosted Apple rehearsal and environment/publication boundaries remain
  intentionally assigned to later slices.

## Slice Evidence

### s1-lifecycle-recovery-contracts

- Desktop suite: `npm test` in `apps/desktop` - 121 passed, 0 failed.
- CLI suite: `npm test` in `cli` - 142 passed, 0 failed.
- Static checks: `git diff --check` and `node --check` for every changed
  executable module - passed.
- Contract negatives cover skipped/reordered/tampered stages, changed Apple
  bytes under the same version, malformed submission output, abrupt/explicit
  submission uncertainty, exactly 60 pending polls, request-preserving retry,
  Apple rejection, missing/mismatched Apple request identity, and fresh-version
  supersession.
- Historical compatibility uses the committed published RC.2 release record
  as a byte-for-byte unchanged schema-v1 fixture.
