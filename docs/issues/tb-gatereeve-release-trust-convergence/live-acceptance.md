# Live Acceptance - tb-gatereeve-release-trust-convergence

**Feature:** `tb-gatereeve-release-trust-convergence`
**Slice:** `s4-mainline-acceptance`
**Status:** blocked on required-reviewer enforcement correction

## Reviewed mainline

- Reviewed slices: PRs [#32](https://github.com/TrentBrown/gatereeve/pull/32), [#33](https://github.com/TrentBrown/gatereeve/pull/33), and [#34](https://github.com/TrentBrown/gatereeve/pull/34).
- Assembled `origin/main`: `ee29569afedd8950b7278f5b1d21183c19e02803`.
- PR #34 reviewed head: `1e5497e2e1165ac2687e2112acef252a305fc738`.
- PR #34 merge ancestry: verified.
- `development` or `development-*` merged or rebased into the feature: no.
- Fresh acceptance candidate: `v0.1.0-rc.3` (tag and release absent at the audit).

The original feature base predates an unrelated reviewed Desktop delivery that
also reached `main`. Feature-final evaluation must distinguish those existing
mainline UI commits from this release-trust feature, which introduced no
product UI scope.

## Initial environment audit

Audit time: 2026-08-30 after PR #34 merged. Only environment metadata, variable
names, and secret names were inspected; no secret value was read or copied.

| Environment | Protection | Variables by name | Secrets by name | Result |
|---|---|---|---|---|
| `release-trust` | Environment absent | none | none | CUTOVER REQUIRED |
| `release-publication` | Required reviewer Trent Brown; self-review permitted; custom `main` branch policy | four Apple identity variables | three Apple credential secrets | HISTORICAL COMBINED CUSTODY |

The historical `release-publication` inventory contains no publication token.
That token is not needed for the required primary dry run, but must be stored
once before a future real linked-Cask publication.

## Authorized cutover progress

The user explicitly authorized creation and non-secret configuration of the
new trust environment on 2026-08-30.

| Check | Result |
|---|---|
| `release-trust` created | PASS |
| Required reviewer | PASS: `TrentBrown` |
| Self-review for the single maintainer | PASS: permitted |
| Deployment policy | PASS: custom branch `main` only |
| Four Apple identity variables copied | PASS: names and timestamps verified |
| Three Apple credential secrets populated | PASS: names and update timestamps verified after direct user entry |

The historical Apple entries remain intact in `release-publication` as the
rollback path until the protected rehearsal succeeds. This bounded overlap is
not the final accepted custody state. No secret value was read, printed,
transported through Playpen, or written to the repository.

## RC.3 protected preparation evidence

Preparation run
[33340560850](https://github.com/TrentBrown/gatereeve/actions/runs/33340560850)
completed successfully from exact reviewed `main`
`ee29569afedd8950b7278f5b1d21183c19e02803` for candidate
`v0.1.0-rc.3`. RC.3 is now permanently bound to these submitted bytes and
Apple request history; do not use generic job reruns or reuse the version with
changed bytes.

| Check | Result |
|---|---|
| Workflow conclusion | PASS: all seven jobs completed successfully |
| Trusted lifecycle | PASS: schema v2, nine-stage digest chain ending at `desktop-trust-verified` |
| Submitted DMG | PASS: 246,161,757 bytes; SHA-256 `5841f78df0dcee3c379bef16e0f0bc7ebb9475dc5f9356698fdbc762e157db12` |
| Final stapled DMG | PASS: 246,164,056 bytes; SHA-256 `d09973d4f488ed809d8b5ff2ecbc4659b6e86b16d9f8216c288229f125f4156f` |
| Developer ID | PASS: `Developer ID Application: Trent Brown (PMWYD5A82A)` with hardened runtime and secure timestamp |
| Notarization | PASS: request `faa0580d-941c-4df3-90b8-38570ff52ac4`, attempt `aef4b5d4-93ab-44e5-a5a0-4aac88226ed1`, status `Accepted` |
| Staple and Gatekeeper | PASS: staple validated; DMG assessment accepted |
| Native Apple Silicon | PASS: native ARM64, not Rosetta; mounted app and governed fixture launched |
| Native Intel | PASS: native x64, not Rosetta; mounted app and governed fixture launched |
| Apple trust digest | PASS: `80233fba6421254e98079e1f5581fbe43aab4993ca5644af1d6266988e9e0882` |
| Native aggregate digest | PASS: `ef356f04768647d3b2cc9da798097eca779812b8e04f7e5854c117590ae05a64` |

The retained final and submitted DMG hashes were recomputed after download and
match the release record. The repository validators accepted the lifecycle,
both native documents, their canonical document digests, and their aggregate.

## Approval-boundary finding

The `release-trust` environment metadata is configured with required reviewer
`TrentBrown` and a custom `main` branch policy. Nevertheless, run
`33340560850` produced neither a pending deployment nor any `release-trust`
deployment record and did not pause for approval. The job declarations use
`deployment: false`, which suppresses the GitHub deployment through which
environment reviewer protection is enforced.

Therefore RC.3 is accepted as exact Apple trust and native evidence but is
**not** accepted as proof of R3/P9 authorization. Finalization and the
publication dry run are paused. The correction must remove deployment
suppression from every protected trust/publication job in a fresh reviewed
slice and prove an actual reviewer wait using a fresh candidate identity.
Apple credentials remain in the historical publication environment only as
the bounded rollback path until that corrected rehearsal succeeds.

## Initial public inventory

| Surface | Initial identity |
|---|---|
| Candidate tag `v0.1.0-rc.3` | absent |
| Candidate GitHub release | absent |
| Marketplace head | `22c2d841e833af4d2aec351cf61d54dafaf8fcd3` |
| Mainline Desktop manifest blob | `e6c94d8699fc4fb1c54eb2c0fc4b1f99f84cb9b6` |
| Early Access response SHA-256 | `23195d7507f2eade6f87ce866533d3078ba423f13667ae0e4c41ebe25a51f17b` |
| Homebrew tap head | `91725d7e7aa3a8e0f82ddc2658f51d12a3385900` |
| Homebrew Cask blob | `f08840728d0b329a9dfe037467782d8c335c396e` |

The served Desktop manifest remained on public `0.1.0-rc.2` with universal-DMG
SHA-256 `ec50610dfbeffe9bf0004f313e1413ae6d62c58a88cc3b0fa2c25b30b280754f`.

The same inventory was repeated immediately after RC.3 preparation. Every
identity above remained byte-for-byte unchanged, and the RC.3 tag and GitHub
release remained absent. Preparation therefore caused zero public mutation.

## Locally provable acceptance

| Check | Result |
|---|---|
| CLI suite | PASS: 158 tests, zero failures |
| Desktop suite | PASS: 125 tests, zero failures |
| Portable acceptance | PASS: Node, Python, and shell acceptance layers completed without failures |
| Branch-document validation | PASS |
| Reviewed-main ancestry | PASS |

## Required live sequence

1. Create `release-trust` with Trent Brown as required reviewer, self-review
   permitted, and a custom `main` deployment policy. **Complete.**
2. Copy the four non-secret Apple identity variables from the historical
   environment by name and securely populate the three Apple secrets once.
   **Complete.**
   Secret values must never transit Playpen, logs, artifacts, or this record.
3. Audit names and protection metadata, then dispatch `v0.1.0-rc.3` from the
   exact current reviewed `main`. **Complete.**
4. Retain schema-v2 trust, Apple request history, exact universal DMG, and
   independent native ARM64/Intel evidence. **Complete.**
5. Correct the suppressed deployment/reviewer boundary in a fresh reviewed
   slice, merge that correction to `main`, and use a fresh RC identity.
6. Approve the corrected `release-trust` job only after verifying its source
   and inputs, then retain the fresh exact trust packet.
7. Seal the exact packet and run the corrected protected primary publication
   dry run after its distinct reviewer approval.
8. Compare the final public inventory with the initial inventory and require
   zero mutation.
9. Only after the corrected trust rehearsal succeeds, delete the Apple variables and
   secrets from `release-publication` and re-audit custody.
10. Run feature-final spec evaluation and independent judgment.

No public primary or Cask publication is authorized by this sequence.

## Corrective delivery slice

The original feature-final attempt was abandoned without merge after retaining
its evidence. Governed slice `s5-approval-boundary-correction` started at event
sequence 96 on branch
`tb-gatereeve-release-trust-convergence-05-approval-boundary-correction` from
current `origin/main` `93da66d10736b7bbf58be1d2765808c1f7b4a75c`.
That mainline commit is reviewed PR #36 from
`tb-gatereeve-desktop-workflow-experience-06-interface-polish`; it is not a
`development*` integration and is unrelated product-UI work.

The correction removes deployment suppression from protected preparation,
bounded trust recovery, primary rehearsal/publication, and Cask
rehearsal/publication. Contract tests now require the correct environment on
all six jobs and reject `deployment: false`. Current local evidence: all four
edited workflows parse as YAML, the 10 focused workflow/documentation tests
pass, all 158 CLI tests pass, all 125 Desktop tests pass, and portable
acceptance passes. A fresh hosted rehearsal and candidate remain required after
this correction passes review and merges.
