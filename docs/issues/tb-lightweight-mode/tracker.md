# Branch Tracker - tb-lightweight-mode

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-11-15

## Rubric Status

| # | Criterion (short) | Status | Review | Notes |
|---|-------------------|--------|----|-------|
| R1 | Defaults, provenance, no config path | PASS (slice) | PR #105 | S1 review PASS 2026-11-16; re-checked at FEATURE review |
| R2 | Dial visibility | PARTIAL | PR #105 | S1 share (status/snapshot/next data) PASS; CLI, desktop, SessionStart pending I-4 |
| R3 | Asymmetric toggles | PASS (slice) | PR #105 | Rigor only rises (D16); delegated→supervised rule-level until S5 |
| R4 | Light commitments and authority | PASS (slice) | PR #106 | S2 review PASS 2026-11-16 |
| R5 | Light gates, review basis, verification provenance | PASS (slice) | PR #106 | S2 review PASS 2026-11-16; light-run procedure file and skill routing land in S4 |
| R6 | Tripwires | NOT YET | - | Planned for P5 / I-5 |
| R7 | Delegation precondition, planning substitution, hand-back | NOT YET | - | Planned for P6 / I-5 |
| R8 | Delivery targets and merge authority | PARTIAL | PR #107 | Non-delegated paths PASS (S3 review 2026-11-16); delegated paths P6 / I-5 |
| R9 | Review summary on the PR | PASS (slice) | PR #107 | S3 review PASS 2026-11-16 |
| R10 | Guard coverage and actionable recovery | NOT YET | - | Planned for P7 / I-4 |
| R11 | State-reporting SessionStart | NOT YET | - | Planned for P7 / I-4 |
| R12 | Measurement and rollout | NOT YET | - | Planned for P8 / I-6 |

## Review Log

Append pull-request review boundary entries here.

### 2026-11-16 — S1 (PR #105) merged into tb-lightweight-mode

- **Merge:** protected merge at `3857de2` (head `37e4bd4`, base `cf3ba2a`).
- **Authority:** Trent's acceptance and merge authorization, bound to the prepared
  action.
- **Gates:** context, review, verification and packet PASS.
- **Review rounds:** two UNAVAILABLE (malformed evaluator output); four FAIL with
  real defects (F1, F2, F5, F7, F11, plus non-blocking F3/F4/F6/F8/F9/F10/F12),
  all fixed; final PASS. One advisory remains: F13, rejection wording.
- **Spec change:** amended mid-slice twice — existing-run compatibility, and the
  rigor-lowering prohibition (D16).

### 2026-11-16 — S2 (PR #106) merged into tb-lightweight-mode

- **Merge:** protected merge at `09eeb93` (head `2394625`, base `3857de2`).
- **Authority:** Trent's acceptance and merge authorization, bound to the prepared
  action.
- **Gates:** context, review, verification and packet PASS.
- **Review rounds:** one; PASS with no blocking findings.
- **Advisories:** the light-run procedure is a `PROTOCOL.md` section until S4;
  raising rigor on an integrated light run returns it to design (errs towards
  rigor).

### 2026-11-16 — S3 (PR #107) merged into tb-lightweight-mode

- **Merge:** protected merge at `c5d0373` (head `5ed1935`, base `09eeb93`).
- **Authority:** Trent's acceptance and merge authorization, bound to the prepared
  action.
- **Gates:** context, review, verification and packet PASS.
- **Review rounds:** one; PASS with no blocking findings.
- **CI:** attempt 1 failed on a package-archive timeout and a packaged terminal
  smoke miss; the full rerun (attempt 2) passed.
- **Advisories carried forward:** N1 (publication skips a newer UNAVAILABLE
  review), N2 (pending required review classifies any refused merge as
  required-review), N3 (`review.publish` missing from the measurement allowlist,
  S6), N4 (S1/S2-era merge authorizations must be re-authorized; fails closed).
- **Deferred:** Git-fallback per-PR release merges (no workspace config).
