# Live Acceptance - tb-gatereeve-release-trust-convergence

**Feature:** `tb-gatereeve-release-trust-convergence`
**Slice:** `s6-final-acceptance`
**Status:** in progress on corrected mainline acceptance

## Reviewed mainline

- Reviewed slices: PRs [#32](https://github.com/TrentBrown/gatereeve/pull/32), [#33](https://github.com/TrentBrown/gatereeve/pull/33), [#34](https://github.com/TrentBrown/gatereeve/pull/34), and approval-boundary correction [#37](https://github.com/TrentBrown/gatereeve/pull/37).
- Current reviewed `origin/main`: `57fe66ba90ae1db1df970bf6988053136b567f23`.
- PR #34 reviewed head: `1e5497e2e1165ac2687e2112acef252a305fc738`.
- PR #34 merge ancestry: verified.
- PR #37 evaluated head: `3a7d447c444aff12100d6ff30a9c5e9aa0a4fda2`.
- PR #37 final approved head: `92a9937d80e0d93454564a3d9daa0e4b095a56c6`.
- PR #37 merge ancestry: both heads verified.
- `development` or `development-*` merged or rebased into the feature: no.
- Fresh corrected acceptance candidate: `v0.1.0-rc.4` (tag and release absent at the 2026-08-30T23:56:21Z audit).

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
   **Complete:** PR #37 merged as `57fe66ba90ae1db1df970bf6988053136b567f23`;
   RC.4 is reserved and absent before dispatch.
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
this now-merged correction.

PR #37 passed its full governed boundary, final approval-head CI, and user
review. It merged to `main` as
`57fe66ba90ae1db1df970bf6988053136b567f23`; the evaluated correction and final
approved PR heads are both verified ancestors. Slice `s6-final-acceptance`
started from that exact reviewed merge without merging or rebasing any
`development*` branch.

## RC.4 corrected-rehearsal baseline

Baseline time: 2026-08-30T23:56:21Z. Only environment metadata, variable
names, and secret names were inspected; no secret value was read or copied.

| Check | Initial identity |
|---|---|
| Reviewed source | `57fe66ba90ae1db1df970bf6988053136b567f23` |
| Candidate tag `v0.1.0-rc.4` | absent |
| Candidate GitHub release | absent |
| `release-trust` required reviewer | `TrentBrown`; self-review permitted |
| `release-trust` deployment policy | custom branch `main` only |
| `release-trust` variable names | four expected Apple identity variables |
| `release-trust` secret names | three expected Apple credential secrets |
| Marketplace head | `22c2d841e833af4d2aec351cf61d54dafaf8fcd3` |
| Mainline Desktop manifest blob | `e6c94d8699fc4fb1c54eb2c0fc4b1f99f84cb9b6` |
| Early Access response SHA-256 | `23195d7507f2eade6f87ce866533d3078ba423f13667ae0e4c41ebe25a51f17b` |
| Homebrew tap head | `91725d7e7aa3a8e0f82ddc2658f51d12a3385900` |
| Homebrew Cask blob | `f08840728d0b329a9dfe037467782d8c335c396e` |

The served Desktop manifest remains on public `0.1.0-rc.2` with universal-DMG
SHA-256 `ec50610dfbeffe9bf0004f313e1413ae6d62c58a88cc3b0fa2c25b30b280754f`.
This baseline is the zero-public-mutation comparator for the corrected
nonpublishing RC.4 rehearsal.

## RC.4 protected reviewer wait

Preparation run
[33343210101](https://github.com/TrentBrown/gatereeve/actions/runs/33343210101)
was dispatched for `v0.1.0-rc.4` from exact reviewed `main`
`57fe66ba90ae1db1df970bf6988053136b567f23`. Source resolution and the Plugin
candidate job passed. At 2026-08-30T23:59:41Z, the `desktop-trust` job entered
GitHub status `waiting` before any Apple trust production began.

GitHub created deployment `6172763830` for environment `release-trust`, ref
`main`, and the exact reviewed source SHA. The pending-deployments API reports
required reviewer `TrentBrown` and confirms that account can approve. This is
the real environment deployment/reviewer wait that RC.3 failed to create and
therefore proves the PR #37 boundary correction up to the human authorization
point. At that checkpoint the protected job remained unapproved pending
explicit user action in GitHub.

The user approved the pending deployment in GitHub. Deployment `6172763830`
recorded `queued` at 2026-08-31T15:37:17Z and `in_progress` at
2026-08-31T15:37:20Z before the protected job began trust production.

## RC.4 protected preparation evidence

Run [33343210101](https://github.com/TrentBrown/gatereeve/actions/runs/33343210101)
completed successfully without a retry. The retained artifact bytes were
downloaded and their hashes recomputed locally.

| Check | Result |
|---|---|
| Workflow conclusion | PASS: all seven jobs completed successfully |
| Protected approval | PASS: real `release-trust` deployment `6172763830` waited for and received required reviewer approval |
| Trusted lifecycle | PASS: schema v2, nine-stage digest chain ending at `desktop-trust-verified` |
| Submitted DMG | PASS: 246,140,822 bytes; SHA-256 `5241a504dd9b3c83e2910f6cceb8eb2aefe496d85f28565fe7ea01e8a43dc9f6` |
| Final stapled DMG | PASS: 246,143,121 bytes; SHA-256 `f932c9efb738c88fa234e843f9e4ad751e41e0eb9e8f96f5a6501e789fd16957` |
| Developer ID | PASS: `Developer ID Application: Trent Brown (PMWYD5A82A)` with hardened runtime and secure timestamp |
| Notarization | PASS: request `2de56a0a-b817-4c4a-a805-cdbec173b48c`, attempt `eb21739a-a83b-4e6d-a93b-6354805cf726`, status `Accepted` |
| Staple and Gatekeeper | PASS: staple validated; DMG assessment accepted |
| Native Apple Silicon | PASS: native ARM64 evidence digest `deadd5c258cccd692f91749c1586b5f385961984cffe42aa32eb49dcc5b0dd51` |
| Native Intel | PASS: native x64 evidence digest `1ed6e5c29c823bd3ae67788d6d869c9ded4b016d4ef2a15b84ed7f4ee63f5ed1` |
| Apple trust canonical digest | PASS: `274c9231d4be43a6f36ca6f49fcedc44ad90ce4be2b66bee9271a0c485a9dca6` |
| Native aggregate canonical digest | PASS: `ebdbfb412845dc57004c9ffcd05f777cdf1392a556a86abe49a32ae753526270` |
| Final lifecycle stage digest | PASS: `9c642a49897fa085c3ff3e283fe6ec3e93361ecb860cb16f7eb71c4d6ef202b1` |

RC.4 is permanently bound to this final DMG and Apple request history. Do not
use generic job reruns or reuse the version with changed bytes. The
post-preparation inventory exactly matches the RC.4 baseline: the tag and
release remain absent; Marketplace, mainline manifest, served Early Access
manifest, Homebrew tap, and Cask identities are all unchanged. Preparation
therefore caused zero public mutation.

## RC.4 sealed publication packet

Read-only finalization run
[33410776654](https://github.com/TrentBrown/gatereeve/actions/runs/33410776654)
completed successfully from preparation/trust run `33343210101`, exact source
`57fe66ba90ae1db1df970bf6988053136b567f23`, and candidate
`v0.1.0-rc.4`. The finalizer had only `actions: read` and `contents: read`.

The retained packet passed the repository-owned `inspect-hosted` validator at
stage `distribution-finalized`. Its exact publication-plan SHA-256 is
`a9a1b7efeeb1dbeeac6bfa400c5c6cc9b8f0a14ca49cbcffeab32954759c503e`.
The packet contains the same final universal DMG SHA-256
`f932c9efb738c88fa234e843f9e4ad751e41e0eb9e8f96f5a6501e789fd16957`,
an empty receipt list, and ordered future surfaces `tag`,
`pluginMarketplace`, `desktopPrerelease`, `updateManifest`, and
`earlyAccessWebsite`. No publication approval has been recorded and no public
mutation is authorized.

## Protected primary publication dry-run wait

Publication run
[33411027926](https://github.com/TrentBrown/gatereeve/actions/runs/33411027926)
was dispatched in `dry-run` mode with finalization run `33410776654`, exact
source `57fe66ba90ae1db1df970bf6988053136b567f23`, candidate
`v0.1.0-rc.4`, and sealed plan
`a9a1b7efeeb1dbeeac6bfa400c5c6cc9b8f0a14ca49cbcffeab32954759c503e`.
The input carries no `approved_by` value.

GitHub created `release-publication` deployment `6184570626` at
2026-08-31T15:53:38Z. The `protected-nonpublishing-rehearsal` job is visibly
waiting for required reviewer `TrentBrown`, while the write-capable
`publish-exact-plan` job is skipped. The waiting job has only `actions: read`
and `contents: read`; approval permits read-only remote preflights and does not
authorize public publication.
