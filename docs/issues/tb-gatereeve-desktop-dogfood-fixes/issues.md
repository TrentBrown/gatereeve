# Issues - tb-gatereeve-desktop-dogfood-fixes

**Feature:** `tb-gatereeve-desktop-dogfood-fixes`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-08-29

Operational task breakdown derived from the plan.

## I-1 - Make Python prerequisite selection compatibility-aware

- **Status:** closed
- **Estimate:** 0.5d
- **Plan steps:** P1
- **Rubric criteria:** R1
- **Depends on:** none
- **PR:** [#20](https://github.com/TrentBrown/gatereeve/pull/20)

Write the required failing discovery/Setup cases, then select the first
compatible bounded Python while retaining authoritative override behavior and
diagnostics.

## I-2 - Apply GateReeve branding and stable Setup layout

- **Status:** closed
- **Estimate:** 0.5d
- **Plan steps:** P2
- **Rubric criteria:** R2, R3
- **Depends on:** none
- **PR:** [#20](https://github.com/TrentBrown/gatereeve/pull/20)

Use the approved icon and maintain one Setup surface across onboarding and
selected-worktree layouts without sidebar collapse.

## I-3 - Keep the selected artifact current and readable

- **Status:** closed
- **Estimate:** 1d
- **Plan steps:** P3
- **Rubric criteria:** R4, R5
- **Depends on:** none
- **PR:** [#20](https://github.com/TrentBrown/gatereeve/pull/20)

Add test-first automatic/manual refresh, race protection, cache busting, scroll
retention, stale-content recovery, and canonical-removal behavior.

## I-4 - Render safe Markdown emphasis

- **Status:** closed
- **Estimate:** 0.5d
- **Plan steps:** P4
- **Rubric criteria:** R6
- **Depends on:** none
- **PR:** [#20](https://github.com/TrentBrown/gatereeve/pull/20)

Extend the semantic inline tokenizer for strong/emphasis while protecting code,
identifiers, malformed input, and literal image syntax.

## I-5 - Confine Markdown link navigation

- **Status:** closed
- **Estimate:** 0.5d
- **Plan steps:** P5
- **Rubric criteria:** R6, R7
- **Depends on:** I-4
- **PR:** [#20](https://github.com/TrentBrown/gatereeve/pull/20)

Support system-browser HTTP(S), canonical relative artifacts, and fragments
through validated boundaries while keeping unsafe targets inert.

## I-6 - Verify the assembled Desktop product slice

- **Status:** closed
- **Estimate:** 0.5d
- **Plan steps:** P6
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7
- **Depends on:** I-1, I-2, I-3, I-4, I-5
- **PR:** [#20](https://github.com/TrentBrown/gatereeve/pull/20)

Run full Desktop checks, package/asset verification, visual and runtime smoke,
and constraint review before entering the PR boundary.

## I-7 - Complete and merge the governed product PR

- **Status:** closed
- **Estimate:** 0.5d
- **Plan steps:** P7
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7
- **Depends on:** I-6
- **PR:** [#20](https://github.com/TrentBrown/gatereeve/pull/20)

Produce all required pinned boundary evidence, obtain human review, and merge
the topic branch into `main` without importing a `development*` branch.

## I-8 - Prepare Apple-trusted coordinated release evidence

- **Status:** closed
- **Estimate:** 0.5d
- **Plan steps:** P8
- **Rubric criteria:** R8
- **Depends on:** I-7
- **PR:** [#21](https://github.com/TrentBrown/gatereeve/pull/21)

Prepare matched `v0.1.0-rc.2` artifacts from merged `main`, verify Apple trust
and both native architectures, and inspect the dry-run publication plan.

Preparation run
[`33234514595`](https://github.com/TrentBrown/gatereeve/actions/runs/33234514595)
is pinned to merged `main` commit
`1b7c7e519c90a13d140f59c65e0304bb78000753`. Candidate creation, Apple trust,
trusted ARM64/Intel verification, immutable-record inspection, and the
coordinated publication dry run passed without public mutation. Exact Homebrew
packet preparation moves to I-9 because it requires direct-install proof from
the as-yet unpublished DMG.

PR #21 merged the reviewed preparation record into `main` as
`44ec46123726393fc25be5a540be3021ac259d35`; the governed merge is recorded.

## I-9 - Publish and install the approved Homebrew release

- **Status:** in-progress
- **Estimate:** 0.5d
- **Plan steps:** P9
- **Rubric criteria:** R8
- **Depends on:** I-8
- **PR:** [#23](https://github.com/TrentBrown/gatereeve/pull/23)

After explicit release approval, publish the coordinated artifacts, update and
smoke the cask, upgrade the user's Mac, and run the installed-app checklist.

The approved coordinated publication is complete: tag `v0.1.0-rc.2`, Plugin
marketplace commit `22c2d841e833af4d2aec351cf61d54dafaf8fcd3`, signed Desktop
prerelease, manifest [PR #22](https://github.com/TrentBrown/gatereeve/pull/22),
and the Early Access website all verify. Trent Brown confirmed direct
installation of the exact public DMG on the user's Mac at
`2026-08-29T15:45:56Z`. The exact Cask packet was approved and published
through [tap PR #2](https://github.com/TrentBrown/homebrew-gatereeve/pull/2),
merged as `91725d7e7aa3a8e0f82ddc2658f51d12a3385900`. The public Cask bytes
match the approved SHA-256
`0f369a3651876036042ce2ca4c1785bcd0077641c114647379899178980b3e8f`.
Hosted [run 33262844457](https://github.com/TrentBrown/gatereeve/actions/runs/33262844457)
then passed literal public-tap installation and disposable Cask upgrade on
both arm64 and x64.

PR #23 merged the fail-closed predecessor verification and exact prepared
packet into `main` as `18a24fa18746264439a93a09fcc5cdf178a85cd9`.
The continuation slice
`desktop-dogfood-cask-publication-and-installation` is implementing. Public
Homebrew installation or upgrade and the installed-app checklist on the user's
Mac are the only remaining I-9 operations.

## I-10 - Complete the feature rubric and report

- **Status:** open
- **Estimate:** 0.5d
- **Plan steps:** P10
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7, R8
- **Depends on:** I-9
- **PR:** -

Reconcile all persisted evidence, require a fully passing tracker, and produce
the completion report and final checkpoint.
