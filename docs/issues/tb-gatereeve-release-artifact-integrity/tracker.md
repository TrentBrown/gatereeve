# Branch Tracker - tb-gatereeve-release-artifact-integrity

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-08-31

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|----|-------|
| R1 | Safe producer commitment | PASS | #44 | Real Plugin preparation plus positive, unsafe-path, symlink, and exact-tree tests pass. |
| R2 | Round trip gates Apple trust | PASS | #44 | RC.6 preparation round-tripped and verified the exact Plugin candidate before the gated Apple trust job began. |
| R3 | Later handoffs preserve exact bytes | PASS | #44 | Preparation, finalization, rehearsal, publication, recovery, marketplace, and public-download evidence retain the same producer commitment and exact bytes. |
| R4 | Semantic verification remains mandatory | PASS | #44 | Positive and exact-but-incomplete adversarial semantic tests pass at every sealed consumer. |
| R5 | RC.5 regression coverage | PASS | #44 | Hidden stripping, visible loss, additions, mutations, malformed evidence, and semantic incompleteness all fail. |
| R6 | Topology, authority, and history preserved | PASS | #44 | Diff preserves the universal DMG, environment separation, retained-byte flow, and immutable RC.5 history. |
| R7 | RC.6 primary publication | PASS | - | Exact source `10a7264` and plan `9639bdfc...` completed all five ordered surfaces; independent public asset and manifest digests match. |
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
- Status: complete. Protected preparation, read-only finalization, separately
  approved nonpublishing rehearsal, separately approved primary publication,
  bounded recovery, and independent public verification all passed from exact
  corrected `main` merge `10a7264`.
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
  passed its distinct protected deployment review. Although PR #43
  advanced `main` immediately before dispatch, RC.6 remains bound to ancestor
  source `10a7264`; the publisher workflow and release code are unchanged and
  the job checks out the exact sealed source rather than rebuilding from the
  new head.
- Publication run 33456095160 recorded exact tag, marketplace, and GitHub
  prerelease receipts before GitHub returned HTTP 403 for the deterministic
  manifest PR because repository Actions are not permitted to create pull
  requests. The manifest and website remain unchanged on RC.2. Recovery is
  blocked only on an explicit persistent repository-permission choice, after
  which a new same-packet dispatch must idempotently resume at the manifest
  surface; generic rerun and replacement of completed history remain
  prohibited. This partial result remains immutable recovery evidence.
- The user enabled the required repository Actions PR setting without changing
  default read permissions. Same-packet recovery run
  [33458101816](https://github.com/TrentBrown/gatereeve/actions/runs/33458101816)
  passed its new protected deployment review, matched and skipped all three
  completed receipts, merged deterministic one-file manifest PR
  [#45](https://github.com/TrentBrown/gatereeve/pull/45) as
  `2b16a4f709d05da89b84bb87bafa77068cac2a1f`, and verified the public Early
  Access response.
- The final packet state is `published` with all five ordered receipts. Public
  DMG SHA-256 `47121af4...`, `SHA256SUMS` SHA-256 `b8d55361...`, marketplace
  commit `4a204590...`, and byte-identical main/Early Access manifest SHA-256
  `19e35e21...` independently match the sealed RC.6 record. Homebrew remains
  intentionally on RC.2 for the separately approved P6 Cask lifecycle.

### PR #46 — RC.6 primary acceptance evidence

- Pull request: [#46](https://github.com/TrentBrown/gatereeve/pull/46)
- Evidence packet: [pr-46](pr-46/boundary.json)
- Scope: slice
- P5 is complete. R2, R3, and R7 pass from exact hosted and independently
  downloaded public evidence; P6/P7 and R8 remain the final Mac/Cask slice.
- Human review was accepted, and GitHub merged exact reviewed head
  `68a3977ed60c11f07ce2a36886cb892540322d99` into `main` as
  `9a00ec850b999fe8abd51277cb5fe3f78a59bdfc`. Ancestry verification passed;
  no `development` or `development-*` branch participated.

### RC.6 Mac acceptance and linked Cask provenance correction

- Abandoned premature feature-final slice: `s3-mac-cask-acceptance`
- Active slice: `s3-cask-provenance-correction`
- Branch: `tb-gatereeve-release-artifact-integrity-03-mac-cask-acceptance`
- Scope: slice / P6 / R6, R8
- Status: in progress. Direct installation of the exact public RC.6 DMG is the
  prerequisite for linked Cask finalization and its distinct publication
  approval. The direct install now passes: exact public DMG SHA-256
  `47121af4...`, DMG and app Gatekeeper source `Notarized Developer ID`, app
  launch, and user timestamp `2026-09-01T14:44:59Z` are recorded. A false
  dispatch-head/source equality in the linked Cask workflows must be corrected
  and merged before hosted finalization; no Cask public mutation has occurred.
  A fresh feature-final slice will perform Cask finalization, protected
  rehearsal/publication, Homebrew installation, and P7 closeout after this
  correction passes its own reviewed delivery boundary.

### PR #47 — linked Cask provenance correction

- Pull request: [#47](https://github.com/TrentBrown/gatereeve/pull/47)
- Evidence packet: [pr-47](pr-47/boundary.json)
- Scope: slice / P6 / R6, R8
- Status: merged. The pinned source diff removes invalid equality between a
  moving workflow-dispatch head and the immutable release source, constrains
  producer workflows to reviewed `main`, proves source ancestry, and verifies
  exact source commit/tag identity from the downloaded sealed packets. The
  direct Mac RC.6 proof is recorded; Cask publication remains nonmutating and
  awaits its fresh feature-final slice. Human review was accepted, and exact
  topic head `54950a995577626ec690acc7697ccd502c990e12` is an ancestor of
  `origin/main` merge `1c19304e67f34f12930b1c51c5e06621c05c6734`. No
  `development` or `development-*` branch participated.

### RC.6 linked Cask and Homebrew feature-final acceptance

- Slice: `s4-cask-acceptance`
- Branch: `tb-gatereeve-release-artifact-integrity-04-cask-acceptance`
- Scope: feature-final / P6-P7 / R1-R8
- Status: in progress from exact corrected `origin/main`
  `1c19304e67f34f12930b1c51c5e06621c05c6734`. This slice will seal the
  linked Cask from retained primary publication run `33458101816`, execute the
  protected nonpublishing rehearsal, obtain distinct approval for its exact
  plan digest, publish idempotently, and collect Homebrew installation and
  launch evidence before complete-feature evaluation.
- Linked finalization run
  [33525598814](https://github.com/TrentBrown/gatereeve/actions/runs/33525598814)
  passed and sealed exact Cask plan `9e9e979a...` for immutable source
  `10a7264` and DMG digest `47121af4...`. Protected dry-run
  [33525707781](https://github.com/TrentBrown/gatereeve/actions/runs/33525707781)
  passed after `release-publication` environment review. It retained the exact
  plan, Cask, record, source, and DMG commitments with publication still
  unapproved/pending and no receipt. The live tap remained RC.2 at blob
  `f08840728d0b329a9dfe037467782d8c335c396e`, proving no Cask mutation
  occurred. Distinct approval of exact plan `9e9e979a...` is now required for
  real publication.
- The user approved exact plan `9e9e979a...`, and protected publication run
  [33527077278](https://github.com/TrentBrown/gatereeve/actions/runs/33527077278)
  passed environment review plus exact source/finalizer binding. It stopped
  before mutation because `release-publication` did not yet contain the
  documented one-time `GATEREEVE_PUBLICATION_TOKEN`; `GH_TOKEN` was empty.
  The retained result artifact is `9808463980`, the live Cask remains RC.2 at
  blob `f0884072...`, and no RC.6 tap PR exists. Same-plan recovery is pending
  one-time configuration of the least-privilege tap token; generic rerun is
  prohibited.
