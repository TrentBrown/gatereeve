# Branch Tracker - tb-gatereeve-release-artifact-integrity

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-08-31

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|----|-------|
| R1 | Safe producer commitment | PASS | #44 | Real Plugin preparation plus positive, unsafe-path, symlink, and exact-tree tests pass. |
| R2 | Round trip gates Apple trust | NOT YET | #44 | Dependency/upload contract tests pass; the real hosted RC.6 trace remains P5. |
| R3 | Later handoffs preserve exact bytes | NOT YET | #44 | Consumer and packet tests pass; real RC.6 handoff evidence remains P5. |
| R4 | Semantic verification remains mandatory | PASS | #44 | Positive and exact-but-incomplete adversarial semantic tests pass at every sealed consumer. |
| R5 | RC.5 regression coverage | PASS | #44 | Hidden stripping, visible loss, additions, mutations, malformed evidence, and semantic incompleteness all fail. |
| R6 | Topology, authority, and history preserved | PASS | #44 | Diff preserves the universal DMG, environment separation, retained-byte flow, and immutable RC.5 history. |
| R7 | RC.6 primary publication | NOT YET | - | Planned for P5 / I-5 |
| R8 | Direct and Homebrew Mac installation | NOT YET | - | Planned for P6-P7 / I-6 |

## PR Log

### PR #44 — Plugin release artifact integrity

- Pull request: [#44](https://github.com/TrentBrown/gatereeve/pull/44)
- Evidence packet: [pr-44](pr-44/boundary.json)
- Scope: slice

P1-P4 are complete. R1, R4, R5, and R6 pass; R2 and
R3 retain their real hosted RC.6 evidence requirement, and R7-R8 remain later
feature work.

#### Merge and mainline verification

- Human review was accepted and PR #44 merged source
  `b3729bc76375f9cbe49659c87f1baabe6e8c646c` into `main` as
  `10a726411fd46f58263f8c989ac83f1a65bdf33f`.
- `merge_verified.py` passed by ancestry for the exact reviewed source.
- Mainline Plugin CI run
  [33451532082](https://github.com/TrentBrown/gatereeve/actions/runs/33451532082)
  passed after retrying only the failed unprotected packaging job. Its first
  `hdiutil create` attempt returned runner-level `Resource busy`; protected
  trust production had not begun. The retry passed the universal DMG plus
  native Apple Silicon and Intel packaged-runtime jobs.
- No `development` or `development-*` branch was merged or rebased into the
  topic or `main`.

### RC.6 primary acceptance

- Slice: `s2-rc6-primary-acceptance`
- Branch: `tb-gatereeve-release-artifact-integrity-02-rc6-acceptance`
- Scope: P5 / R2, R3, R4, R6, R7
- Status: protected preparation, read-only finalization, and the separately
  approved nonpublishing rehearsal passed from exact corrected `main` merge
  `10a7264`; real primary publication awaits its distinct authorization.
- Preparation run
  [33452103818](https://github.com/TrentBrown/gatereeve/actions/runs/33452103818)
  passed the Plugin artifact round trip before Apple authority, Developer ID
  signing, accepted notarization, stapling, Gatekeeper assessment, native
  ARM64 and Intel verification, and lifecycle aggregation.
- Finalization run
  [33455275343](https://github.com/TrentBrown/gatereeve/actions/runs/33455275343)
  sealed plan SHA-256
  `9639bdfcb260673cea4acf137b073fe1b2f264e51b97663d85df9d94cf9f56e0`.
- Dry-run publication run
  [33455470808](https://github.com/TrentBrown/gatereeve/actions/runs/33455470808)
  passed exact-packet inspection and publication preflight with read-only
  permissions and no publication secret. Matching before/after inventories
  prove all public surfaces remained on RC.2 and the RC.6 tag/release remained
  absent.
- The user explicitly approved the exact sealed plan, and real publication run
  [33456095160](https://github.com/TrentBrown/gatereeve/actions/runs/33456095160)
  is waiting for its distinct protected deployment review. Although PR #43
  advanced `main` immediately before dispatch, RC.6 remains bound to ancestor
  source `10a7264`; the publisher workflow and release code are unchanged and
  the job checks out the exact sealed source rather than rebuilding from the
  new head.
- Publication run 33456095160 then recorded exact tag, marketplace, and GitHub
  prerelease receipts before GitHub returned HTTP 403 for the deterministic
  manifest PR because repository Actions are not permitted to create pull
  requests. The manifest and website remain unchanged on RC.2. Recovery is
  blocked only on an explicit persistent repository-permission choice, after
  which a new same-packet dispatch must idempotently resume at the manifest
  surface; generic rerun and replacement of completed history remain
  prohibited.
- The user enabled the required repository Actions PR setting without changing
  default read permissions. Same-packet recovery run
  [33458101816](https://github.com/TrentBrown/gatereeve/actions/runs/33458101816)
  is waiting at its new protected deployment review after immutable-surface
  preflight matched all three completed receipts.
