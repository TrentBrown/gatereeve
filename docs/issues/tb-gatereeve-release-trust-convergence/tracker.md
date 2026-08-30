# Branch Tracker - tb-gatereeve-release-trust-convergence

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-08-30

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|----|-------|
| R1 | Schema lifecycle | NOT YET | [#34](https://github.com/TrentBrown/gatereeve/pull/34) | P1, P3, P7, and reviewed P8 assembly complete; protected P9 evidence remains |
| R2 | Source and byte authority | NOT YET | [#34](https://github.com/TrentBrown/gatereeve/pull/34) | P1-P4, finalization/version-burn operations, and reviewed P8 assembly complete; protected P9 evidence remains |
| R3 | Credential custody | NOT YET | [#34](https://github.com/TrentBrown/gatereeve/pull/34) | Disjoint workflow authority and migration contract implemented through P7; live cutover remains P9 |
| R4 | Notarization recovery | NOT YET | [#34](https://github.com/TrentBrown/gatereeve/pull/34) | Durable bounded recovery, operator prohibition/migration contract, and reviewed P8 assembly complete; live request evidence remains P9 |
| R5 | Native verification | NOT YET | - | Repository and hosted preflight evidence plus P8 assembly complete; fresh protected native evidence remains P9 |
| R6 | Finalization and publication | NOT YET | [#34](https://github.com/TrentBrown/gatereeve/pull/34) | Exact schema-v2 seal, read-only rehearsal, hosted approval, receipts, retry, and reviewed P8 assembly complete; live dry-run evidence remains P9 |
| R7 | Cask linkage | NOT YET | [#34](https://github.com/TrentBrown/gatereeve/pull/34) | Linked v2 record, post-primary proof, separate hosted approval, idempotent receipt, and P8 assembly complete; final P9 conformance remains |
| R8 | Conformance and acceptance | NOT YET | - | Shared fixtures and reviewed P8 assembly complete; environment cutover and protected zero-mutation rehearsal remain P9 |

## PR Log

Append PR boundary entries here.

### Mainline acceptance preflight

- PR #34 merged to `main` as
  `ee29569afedd8950b7278f5b1d21183c19e02803`; reviewed head
  `1e5497e2e1165ac2687e2112acef252a305fc738` is ancestral.
- Slice `s4-mainline-acceptance` is governed as `FEATURE_FINAL` for P8-P9 and
  I-8-I-9. I-8 is complete; I-9 is in progress.
- CLI 158 passed, Desktop 125 passed, portable acceptance passed, and branch
  documents validated against the assembled mainline.
- The name-only live audit found `release-trust` absent and the historical
  `release-publication` environment still holding four Apple variables and
  three Apple secrets. No secret value was inspected.
- `v0.1.0-rc.3` is absent as both tag and release and is the proposed fresh
  acceptance identity.
- Initial public identities are retained in [`live-acceptance.md`](live-acceptance.md).
- No live environment or public surface has been mutated by this preflight.

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
  `c4b48421ef038d6ca917c03da7e24fdd07af69df` based on reviewed `main`
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
- **Hosted checks:** [Run 33331377471](https://github.com/TrentBrown/gatereeve/actions/runs/33331377471)
  passed all 13 jobs, including both acceptance containers, the universal
  macOS package, and packaged-runtime launches on native Apple Silicon and
  Intel runners.
- **Final-head checks:** [Run 33331833526](https://github.com/TrentBrown/gatereeve/actions/runs/33331833526)
  passed all 13 required checks on final PR head
  `9cfcf635e4a7225335bf1d7b3570e658ddcac3cf`.
- **Boundary remediation:** Attempt 1 found and blocked a same-source/
  different-RC Plugin recovery mix and fail-open Rosetta probe errors. The
  lifecycle builder now validates `RELEASE.json`, native Intel authority uses
  Apple's documented missing-key semantics while propagating actual probe
  errors, and both negatives have tests. Attempt 2 hosted CI also found that
  the acceptance image omitted the new recovery workflow; its Dockerfile now
  copies that contract for container verification.
- **Live limitation:** This PR boundary does not possess Apple credentials and
  therefore does not execute a live notarization request. The protected,
  nonpublishing notarization rehearsal remains part of P9/I-9 after the
  environment cutover is explicitly authorized.
- **Review:** Approved by the user; governed review acceptance recorded at
  event sequence 66.
- **Merge:** `3b0e719af9258e5b7ee8bc9b6b8a7dd908a5bc41` on `main`; exact evaluated
  source and the final evidence-only PR head were verified by ancestry.

### PR #34 - Hosted publication, Cask, and operations

- **PR:** [#34](https://github.com/TrentBrown/gatereeve/pull/34)
- **Evidence packet:** [packet](pr-34/)
- **Evaluated source:**
  `c9813f3c6d66f6b6c7a7e886e299772594b40d68` based on reviewed `main`
  `3b0e719af9258e5b7ee8bc9b6b8a7dd908a5bc41`.
- **Scope:** P5-P7 / I-5-I-7 / R1, R2, R3, R4, R6, R7.
- **Summary:** Adds schema-v2 distribution finalization, sealed hosted primary
  publication with read-only rehearsal and ordered receipts, a separately
  linked v2 Cask record/publisher, and the one-time credential/environment
  migration and recovery runbook.
- **Verification:** CLI 158/158, Desktop 125/125, focused integration 26/26,
  portable acceptance, JavaScript syntax, workflow YAML, and diff checks
  passed. [Plugin/Desktop run 33333444341](https://github.com/TrentBrown/gatereeve/actions/runs/33333444341)
  passed all 12 jobs; [Cask run 33333444342](https://github.com/TrentBrown/gatereeve/actions/runs/33333444342)
  passed public install and local upgrade on native ARM64 and Intel.
- **Boundary remediation:** Attempt 1 found that the public-Cask smoke fixture
  still pinned RC.1 after immutable tap history advanced to RC.2. The fixture
  now binds retained RC.2 preparation run `33234514595`, preserves RC.1
  history, and passes all four native jobs.
- **Independent judgment:** PASS WITH CONCERNS. P5-P7 are complete in
  repository scope; live environment contents, Apple authority, and protected
  zero-mutation rehearsal remain P8-P9.
- **Code review:** PASS with no open findings after remediation.
- **Live limitation:** No environment, Apple credential, tag, release,
  marketplace, manifest, website, or Cask was mutated by this PR boundary.

## Slice Evidence

### s3-hosted-publication-cask-operations

- Proposed and planned under the approved P5-P7 delivery boundary after the
  exact PR #33 merge reached `main`.
- Scope: P5-P7 / I-5-I-7 / R1, R2, R3, R4, R6, R7.
- Branch:
  `tb-gatereeve-release-trust-convergence-03-hosted-publication-cask-operations`.
- Integration base: `3b0e719af9258e5b7ee8bc9b6b8a7dd908a5bc41`.
- Draft PR: [#34](https://github.com/TrentBrown/gatereeve/pull/34).
- Implementation source: `5e7e9eb43b602454d99942db245e51ac73dbd1c5`.
- Primary publication now seals a schema-v2 packet from the exact trusted
  Plugin tree, universal DMG, and native evidence; the protected dry run has
  read-only permission and no secret, while real publication appends ordered
  idempotent receipts without rebuilding.
- Cask remains a separately approved post-publication schema-v2 record binding
  the primary record/stage/plan/receipt digests, public DMG install-and-launch
  proof, exact Cask bytes, and deterministic tap receipt.
- Local verification: CLI 158 passed; Desktop 125 passed; portable acceptance,
  focused publication/Cask/workflow/documentation and native smoke suites,
  JavaScript
  syntax, YAML parse, and diff checks passed.
- Hosted verification: run 33333444341 passed all 12 Plugin/Desktop jobs and
  run 33333444342 passed all four native public/local Cask jobs on evaluated
  source `c9813f3c6d66f6b6c7a7e886e299772594b40d68`.
- Boundary attempt 1 correctly failed against stale RC.1 public-Cask authority;
  attempt 2 evaluates the remediated explicit RC.2 fixture without rewriting
  historical bytes or evidence.
- No live environment, Apple credential, tag, release, marketplace, manifest,
  website, or Cask mutation occurred in this slice implementation.
- No `development` or `development-*` branch was merged or rebased.

### s2-protected-trust-native-evidence

- Governed implementation started at event sequence 34 from reviewed `main`
  merge `a01361aaf3c5779129e49972a33539c5984d0da0`.
- Scope: P3-P4 / I-3-I-4 / R1, R2, R3, R4, R5, R8.
- Branch:
  `tb-gatereeve-release-trust-convergence-02-protected-trust-native-evidence`.
- Draft PR: [#33](https://github.com/TrentBrown/gatereeve/pull/33).
- Evaluated source: `c4b48421ef038d6ca917c03da7e24fdd07af69df`.
- Desktop suite: 125 passed, 0 failed; CLI suite: 149 passed, 0 failed after
  review remediation.
- Hosted CI run 33331377471 passed all 13 jobs, including both native macOS
  packaged-runtime launches and both Linux acceptance containers.
- Final-head CI run 33331833526 also passed all 13 required checks.
- Merged to `main` as `3b0e719af9258e5b7ee8bc9b6b8a7dd908a5bc41`;
  governed merge verification is event sequence 67.
- Live Apple trust is intentionally deferred to P9/I-9 because this boundary
  neither receives nor mutates protected secrets.
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
