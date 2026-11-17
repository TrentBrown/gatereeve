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
| R7 | Delegation precondition, planning substitution, hand-back | PASS (slice) | PR #109, #113 | S5 review PASS 2026-11-16 after F1 fix; S8 fixes NEW1 (human-approved light scope change hands back) |
| R8 | Delivery targets and merge authority | PASS (slice) | PR #107, #109, #113 | Non-delegated paths S3; delegated paths S5 (review PASS 2026-11-16); S8 workspace configuration at run start (NEW2, amended 2026-11-17; review gate waived on a PASS verdict) |
| R9 | Review summary on the PR | PASS (slice) | PR #107 | S3 review PASS 2026-11-16 |
| R10 | Guard coverage and actionable recovery | PASS (slice) | PR #108, #113 | S4 review PASS 2026-11-16; best-effort advisories N1-N4; S8 denies matching refspecs (NEW3) |
| R11 | State-reporting SessionStart | PASS (slice) | PR #108, #113 | S4 review PASS 2026-11-16; delegated state fixture-tested until S5; S8 reports the workspace configuration |
| R12 | Measurement and rollout | PASS (slice) | PR #110 | S6 review PASS 2026-11-16 (two rounds); advisories A1, A2 |

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

### 2026-11-16 — S6 (PR #110) merged into tb-lightweight-mode

- **Merge:** protected merge at `0a0e85e` (head `8db5d9a`, base `bbc5560`).
- **Authority:** Trent's acceptance and merge authorization, bound to the prepared
  action.
- **Gates:** context, review, verification and packet PASS.
- **Review rounds:** PASS on `14ffc57` with advisories N1 (guard regression from
  this slice: comment/heredoc skipping inside `${...}`/`$((...))`) and N2
  (standing applications counted as human touches), both fixed in `8db5d9a`;
  PASS on `8db5d9a`.
- **CI:** on `815034c` the new parity test failed in the Ubuntu 22.04 container,
  whose image omits the desktop app; fixed in `14ffc57`.
- **Advisories carried forward:** A1 (`authorityBasis` is copied from any
  `authority.basis`; measurement only), A2 (unquoted `${X:-$(...)}` is not parsed
  as a nested command; pre-existing, best-effort guard).
- **Carried-forward fixes landed in S6:** S5 N5, S3 N1, S3 N2, S3 N3, S4 N2, S4 N4.

### 2026-11-17 — Feature-final review of PR #112: FAIL; amendment and S8

- **Review:** independent FEATURE review on `2781eaa`. The Claude Code evaluator
  could not start (`spawn E2BIG`: the installed plugin passes the whole prompt as one
  command-line argument, over Linux's 128 KiB limit), so the Codex evaluator
  (`gpt-6.1-sol`, high) ran it: FAIL with NEW1 (human-approved light scope change
  kept delegation), NEW2 (no per-PR human merge without a workspace configuration,
  contrary to design §5), NEW3 (`git push origin :` matching refspec admitted), plus
  advisories A1, A2, N1, F13.
- **Amendment:** Trent chose option C — delivery always uses a workspace
  configuration, written at run start when missing. Design and spec Changes entries
  dated 2026-11-17 (commit `74fdd09`). Approved by Trent ("Yes") and recorded as a
  GateReeve `amend` decision followed by spec re-validation and implementation
  re-authorization; the "(pending)" wording in those entries was left as drafted
  because editing it would change the authorized commitments.
- **S8:** implements the amendment plus NEW1, NEW3 and F13.
- **Follow-up:** the Claude Code evaluator adapter should pass its prompt on stdin
  (done in S8).

### 2026-11-17 — S8 (PR #113) merged into tb-lightweight-mode

- **Merge:** protected merge at `ece5081` (head `6941f2e`, base `2781eaa`).
- **Authority:** Trent's waiver of the review gate for candidate `6941f2e` ("Yes. I
  waive it"), recorded with his acceptance and merge authorization in one decision
  bound to the prepared action.
- **Gates:** context, verification and packet PASS. Review: the Codex evaluator
  (`gpt-6.1-sol`, high) returned PASS on `6941f2e` (R7, R8, R10, R11 pass; F1,
  NEW1–NEW5 and N5 resolved; no new blocking defect), but the installed rc.26
  recorded it UNAVAILABLE because its history assessment listed an open finding
  among reconsidered closures. Recorded as a waiver on that exact candidate, not a
  pass.
- **Review rounds:** FAIL on `6f823b1` with NEW4 (`run.resume-current` could start a
  fresh run under another feature's configuration), fixed in `5f59b37`; three PASS
  verdicts on `5f59b37` rejected by the same validation bug and one Claude attempt
  failed with `spawn E2BIG`; FAIL on `1400155` with NEW5 (early evaluator exit
  crashed the host with an unhandled stdin EPIPE), fixed in `6941f2e` with the CLI
  contradiction N5; PASS on `6941f2e` as above.
- **Review machinery fixes landed in S8 (approved by Trent):** history assessments
  may list already-required finding IDs; the Claude Code evaluator receives its
  prompt on stdin; an evaluator that exits before consuming its prompt is a
  classified failure. They take effect for runs on a plugin built from this
  release; this run stays on rc.26, so the FEATURE review may need the same
  waiver.
- **Advisories carried forward:** N1 (stay-light binds path and rule), A1, A2.

### 2026-11-17 — S9 (PR #114) merged; feature-final review of PR #112, round 2: FAIL

- **S9:** records-only slice (S8 merge and waiver). Codex review PASS; Trent's
  acceptance and merge authorization; protected merge at `106dbe1`.
- **Review:** FEATURE candidate on `106dbe1` (R1–R12); CI and verification (11
  re-executed checks) PASS. Codex (`gpt-6.1-sol`, high): FAIL on R10 with NEW6 —
  `git -C/path push` (attached `-C`) resolved protection from the hook's working
  directory, so a push to a protected branch of another repository was admitted.
  The other eleven criteria pass and the prior blocking fixes remain supported.
  Advisories A1, A2, N1 carried.
- **S10:** fixes NEW6, and follows the other ways a command line selects the
  repository (`--git-dir`, `GIT_DIR`, `env`/`sudo` options, earlier literal
  `cd`/`export` in execution order); `env -S` is parsed as env arguments.
