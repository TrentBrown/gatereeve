# Issues - tb-lightweight-mode

**Feature:** `tb-lightweight-mode`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-11-15

Operational task breakdown derived from the plan. Each issue is one delivery slice
into the integration branch `tb-lightweight-mode`.

## I-1 - Contract 7 and run dials

- **Status:** merged
- **Estimate:** unknown
- **Plan steps:** P1, P9
- **Rubric criteria:** R1, R3, R2 (snapshot data)
- **Depends on:** none
- **PR:** #105 (merged 2026-11-16, `3857de2`)

Bump to `gatereeve/current/7`. Add rigor and autonomy at run start, with built-in
defaults, no config path and invalid-input rejection. Add dial-change events with
provenance and the asymmetric transition rules. Expose the dials in the snapshot.
Runs without dial events read as `full`/`supervised`.

## I-2 - Light rigor

- **Status:** merged
- **Estimate:** unknown
- **Plan steps:** P2, P9
- **Rubric criteria:** R4, R5
- **Depends on:** I-1
- **PR:** #106 (merged 2026-11-16, `09eeb93`)

Covers:
- `brief.md` commitments;
- brief-bound implementation authority;
- the escalation backfill requirement;
- light `review` basis;
- verification provenance in both rigors;
- the light-run procedure guidance.

## I-3 - Delivery targets, release merge authority, review summary on PR

- **Status:** merged
- **Estimate:** unknown
- **Plan steps:** P3, P4, P9
- **Rubric criteria:** R8 (non-delegated), R9
- **Depends on:** I-1
- **PR:** #107 (merged 2026-11-16, `c5d0373`)

Covers:
- scope/target binding;
- the FEATURE-shaped final PR;
- the integration==release rule;
- per-PR human release merges executed by the agent, including light runs;
- the standing-grant release-branch tightening and its visible reporting;
- external blockers;
- review summary publication on the PR;
- workspace-context guidance.

## I-4 - Guard, recovery messages, SessionStart and visibility

- **Status:** merged
- **Estimate:** unknown
- **Plan steps:** P7
- **Rubric criteria:** R2, R10, R11
- **Depends on:** I-1
- **PR:** #108 (merged 2026-11-16, `20f7560`)

Covers:
- widened merge/push guard;
- installation-aware recovery entry points;
- state-reporting SessionStart with the up-front "full or light?" question;
- CLI status dials;
- desktop header badge.

## I-5 - Tripwires and delegated autonomy

- **Status:** merged
- **Estimate:** unknown
- **Plan steps:** P5, P6
- **Rubric criteria:** R6, R7, R8 (delegated)
- **Depends on:** I-2, I-3
- **PR:** #109 (merged 2026-11-16, `bbc5560`)

Covers:
- tripwire classifiers and their supervised/delegated responses;
- the delegation decision and its release-protection precondition;
- the delegated authority kind gated by independent evaluator PASS;
- delegated slice delivery;
- hand-back triggers.

## I-6 - Measurement and rollout

- **Status:** merged
- **Estimate:** unknown
- **Plan steps:** P8, P9
- **Rubric criteria:** R12
- **Depends on:** I-1, I-2, I-3, I-4, I-5
- **PR:** #110 (merged 2026-11-16, `0a0e85e`)

Covers:
- observation dial and authority fields;
- event projection;
- confirmed escaped-defect origin links;
- report wording;
- parity and compatibility fixtures;
- inventory finalization.

## I-8 - Workspace configuration at run start and feature-final fixes

- **Status:** merged
- **Estimate:** unknown
- **Plan steps:** P10
- **Rubric criteria:** R8, R7, R10
- **Depends on:** I-1 to I-6
- **PR:** #113 (merged 2026-11-17, `ece5081`; review gate waived on a PASS verdict)

Covers:
- run-start creation of a minimal workspace configuration (default branch as
  integration and release), local Git exclude, recording and reporting;
- refusing to reuse another feature's configuration without a human instruction;
- a standalone operation for existing unconfigured runs, named by merge preparation;
- NEW1 (light scope change hands delegation back under any authority), NEW3
  (matching refspecs), F13 (wording).

## I-9 - Guard: Git spellings that name another repository

- **Status:** in-progress
- **Estimate:** unknown
- **Plan steps:** P7 (guard)
- **Rubric criteria:** R10
- **Depends on:** I-4, I-8
- **PR:** -

Covers:
- NEW6 from the second feature-final review: `git -C/path push` (attached `-C`)
  resolved protection from the hook's working directory instead of `/path`;
- the same resolution for `--git-dir` (both spellings), a `GIT_DIR` prefix,
  `env`/`sudo` directory options and literal `cd`/`pushd` earlier in a plain
  sequence, carried into `bash -c`/`eval`/`env -S`, per the coverage list in
  PROTOCOL.md (R10 amended 2026-11-17);
- `env -S` parsed as env arguments, with its trailing arguments;
- named best-effort limits, after which a push whose location is unknown is
  admitted rather than checked in the wrong place.

## I-7 - Feature-final review and release merge

- **Status:** in-progress
- **Estimate:** unknown
- **Plan steps:** Verification final step
- **Rubric criteria:** R1–R12
- **Depends on:** I-1 to I-9
- **PR:** #112 (open)

Covers:
- `FEATURE` candidate from `featureBaseSha`;
- full required gates and rubric evaluation;
- review summary on the final PR;
- completion report;
- merge into `main` on Trent's per-PR instruction.
