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

- **Status:** in-progress
- **Estimate:** 0.5d
- **Plan steps:** P8
- **Rubric criteria:** R8
- **Depends on:** I-7
- **PR:** -

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

## I-9 - Publish and install the approved Homebrew release

- **Status:** open
- **Estimate:** 0.5d
- **Plan steps:** P9
- **Rubric criteria:** R8
- **Depends on:** I-8
- **PR:** -

After explicit release approval, publish the coordinated artifacts, update and
smoke the cask, upgrade the user's Mac, and run the installed-app checklist.

## I-10 - Complete the feature rubric and report

- **Status:** open
- **Estimate:** 0.5d
- **Plan steps:** P10
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7, R8
- **Depends on:** I-9
- **PR:** -

Reconcile all persisted evidence, require a fully passing tracker, and produce
the completion report and final checkpoint.
