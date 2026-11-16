# Branch Tracker - tb-lightweight-mode

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-11-15

## Rubric Status

| # | Criterion (short) | Status | Review | Notes |
|---|-------------------|--------|----|-------|
| R1 | Defaults, provenance, no config path | PASS (slice) | PR #105 | S1 review PASS 2026-11-16; re-checked at FEATURE review |
| R2 | Dial visibility | PASS (slice) | PR #105, #108 | S1 snapshot data; S4 CLI, desktop header and SessionStart (review PASS 2026-11-16) |
| R3 | Asymmetric toggles | PASS (slice) | PR #105 | Rigor only rises (D16); delegated→supervised rule-level until S5 |
| R4 | Light commitments and authority | PASS (slice) | PR #106 | S2 review PASS 2026-11-16 |
| R5 | Light gates, review basis, verification provenance | PASS (slice) | PR #106 | S2 review PASS 2026-11-16; light-run procedure file and skill routing land in S4 |
| R6 | Tripwires | PASS (slice) | PR #109 | S5 review PASS 2026-11-16; advisory N1 (stay-light binds path and rule) |
| R7 | Delegation precondition, planning substitution, hand-back | PASS (slice) | PR #109 | S5 review PASS 2026-11-16 after F1 fix; advisory N5 |
| R8 | Delivery targets and merge authority | PASS (slice) | PR #107, #109 | Non-delegated paths S3; delegated paths S5 (review PASS 2026-11-16) |
| R9 | Review summary on the PR | PASS (slice) | PR #107 | S3 review PASS 2026-11-16 |
| R10 | Guard coverage and actionable recovery | PASS (slice) | PR #108 | S4 review PASS 2026-11-16; best-effort advisories N1-N4 |
| R11 | State-reporting SessionStart | PASS (slice) | PR #108 | S4 review PASS 2026-11-16; delegated state fixture-tested until S5 |
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

### 2026-11-16 — S4 (PR #108) merged into tb-lightweight-mode

- **Merge:** protected merge at `20f7560` (head `0ab11a5`, base `c5d0373`).
- **Authority:** Trent's acceptance and merge authorization, bound to the prepared
  action.
- **Gates:** context, review, verification and packet PASS.
- **Review rounds:** one UNAVAILABLE (malformed evaluator output), then PASS with no
  blocking findings.
- **Verification:** a second run re-executed S1's dial checks, because S1 also
  covered R2 and earlier checks are coverage obligations for shared criteria.
- **Advisories carried forward (guard):** N1 (substitution-built commands, stdin
  scripts), N2 (unbalanced `)` in a heredoc inside `$(...)` false-denies), N3
  (malformed workspace config disables push denial), N4 (`git push --tags` on a
  protected branch false-denies).

### 2026-11-16 — S5 (PR #109) merged into tb-lightweight-mode

- **Merge:** protected merge at `bbc5560` (head `f6a7052`, base `20f7560`).
- **Authority:** Trent's acceptance and merge authorization, bound to the prepared
  action.
- **Gates:** context, review, verification and packet PASS.
- **Review rounds:** FAIL on `7fa0563` (F1: brief scope check missed sub-headings
  and other sections; advisories N1-N4), fixed in `f6a7052` with N2-N4 tightened;
  PASS on `f6a7052`. Four other attempts were UNAVAILABLE (malformed evaluator
  output).
- **CI:** attempt 1 lost one `current-core` shard to a SIGABRT on Ubuntu 24.04;
  the failed-job rerun passed.
- **Advisories carried forward:** N1 (stay-light binds path and rule, not
  content; design choice), N5 (any heading starting "findings" opens an excluded
  region in the brief scope check).
