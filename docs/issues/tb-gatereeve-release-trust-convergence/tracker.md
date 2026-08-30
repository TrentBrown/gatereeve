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
- **Review:** Approved by the user; governed review acceptance recorded at
  event sequence 30.
- **Merge:** `a01361aaf3c5779129e49972a33539c5984d0da0` on `main`; exact reviewed
  content verified by ancestry.
- **Hosted checks:** All 15 candidate/build/runtime/native checks passed. The
  two public-Cask baseline checks failed because the currently downloaded
  public bytes do not match the historical RC.1 Cask record SHA-256
  `963fb25d3b800aa1be596a0f57766d276499fecc1527b9958bc20a5f613febb2`.
  Candidate Cask install/upgrade passed on both architectures; linked public
  Cask reconciliation remains in planned P6/I-6 scope.

### PR #33 - Protected trust and native evidence

- **PR:** [#33](https://github.com/TrentBrown/gatereeve/pull/33)
- **Evidence packet:** [packet](pr-33/)
- **Evaluated source:**
  `dcabb44f49c251ae3126c072200a4b9163ed8a8a` based on reviewed `main`
  `a01361aaf3c5779129e49972a33539c5984d0da0`.
- **Scope:** P3-P4 / I-3-I-4 / R1, R2, R3, R4, R5, R8 foundations.
- **Summary:** Moves Apple trust production to the protected `release-trust`
  boundary, pins it to exact reviewed `main`, separates the submitted DMG from
  the final stapled DMG, retains recoverable request history, rejects generic
  reruns, and requires independent native Apple Silicon and Intel evidence
  before recording desktop trust.
- **Verification:** Desktop 125 passed; CLI 149 passed after review
  remediation; focused contract,
  syntax, YAML, documentation-example, and diff checks passed.
- **Boundary remediation:** Attempt 1 found and blocked a same-source/
  different-RC Plugin recovery mix and fail-open Rosetta probe errors. The
  lifecycle builder now validates `RELEASE.json`, native Intel authority uses
  a fail-closed hardware-capability fallback, and both negatives have tests.
- **Live limitation:** This PR boundary does not possess Apple credentials and
  therefore does not execute a live notarization request or GitHub-hosted
  native runner rehearsal. Those protected, nonpublishing checks remain part
  of P9/I-9 after the environment cutover is explicitly authorized.

## Slice Evidence

### s2-protected-trust-native-evidence

- Governed implementation started at event sequence 34 from reviewed `main`
  merge `a01361aaf3c5779129e49972a33539c5984d0da0`.
- Scope: P3-P4 / I-3-I-4 / R1, R2, R3, R4, R5, R8.
- Branch:
  `tb-gatereeve-release-trust-convergence-02-protected-trust-native-evidence`.
- Draft PR: [#33](https://github.com/TrentBrown/gatereeve/pull/33).
- Evaluated source: `dcabb44f49c251ae3126c072200a4b9163ed8a8a`.
- Desktop suite: 125 passed, 0 failed; CLI suite: 149 passed, 0 failed after
  review remediation.
- Live Apple trust and native-host rehearsal are intentionally deferred to
  P9/I-9 because this boundary neither receives nor mutates protected secrets.
- No `development` or `development-*` branch was merged or rebased.

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
