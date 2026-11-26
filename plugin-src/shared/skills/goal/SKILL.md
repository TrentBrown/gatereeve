---
name: goal
description: "Grant a GateReeve goal run: unattended work from the grant to a ready, unmerged pull request without asking the human. Use when the user says goal mode, run this as a goal, take this to a PR without asking me, or asks GateReeve to use /goal; also to raise an existing run to goal autonomy, including after a human-led interview."
---

# Goal run

Resolve `<plugin-root>` as the parent of `skills/` from this file's real path.
Read `<plugin-root>/resources/PROTOCOL.md` (Goal autonomy) and use the current
adapter for every state change.

Goal autonomy (`autonomy: goal`) carries exactly `mandated` authority. It adds
attendance rules: the human is not watching, so the run never asks, records
every choice it makes on the human's behalf, and keeps going until `status`
reports `goal.terminal` as `ready-pr` or `parked`.

The harness's own `/goal` command only arms the harness loop. This skill also
grants the GateReeve authority and records the mandate.

## 1. Collect the grant while the human is present

The grant is the last attended moment. Take from the human's own words:

- the **goal** (objective) and any **constraints**, recorded verbatim as the
  fixed `mandate: {goal, constraints}`;
- **rigor**: `full` unless the human said light.

Then check every prerequisite **before writing anything**, and report the
first failure to the human immediately:

1. The release branch is observed as protected (`status` `branches`; the
   grant is refused otherwise).
2. A usable workspace configuration exists, or the human's grant covers
   writing or replacing it for this feature.
3. Two review providers are available for the paired boundary review. A
   missing second provider would only become a park later, so say so now.

## 2a. New grant (no current run)

1. Fetch and create a topic branch from the fresh default branch
   (`<prefix><feature>`).
2. `run.start` with the rigor choice and the human's observed instruction as
   authority, writing or replacing the workspace configuration under that
   authority (`workspace: {replace: true, authority}` when another feature is
   configured).
3. `run.set-dial` `{dial: autonomy, value: goal, actor: human, runId,
   authority, reason, mandate}`.

## 2b. Raise (an existing run, including after a human-led interview)

Record only `run.set-dial autonomy goal` with the mandate and the named
`runId`. Create no branch, change no rigor, and continue from the run's current
phase. The raise never re-pins `interview.md`: if the record changed since its
last approval, an amendment must pin it before milestones pass.

## 3. Arm persistence

- Where the harness offers a native goal tool, arm it with the exact
  `goal.condition` text from `status`: Claude Code `set_goal`, Codex
  `create_goal`. The human's own words stated the goal, so no confirmation is
  needed.
- Otherwise, say that the GateReeve Stop hook provides persistence. It blocks
  the turn from ending until `goal.terminal` is set. It admits the stop after 3
  consecutive blocks with no new protocol event.
- After a restart or compaction, check the native goal (`get_goal`) and
  re-arm it if it is missing.

## 4. Work rules until the goal is terminal

- **Never ask.** The question tools are denied in a goal run. Answer each
  question yourself with the most defensible, preferably reversible, option.
  Record it with `Answered by: agent`, the options considered and its
  reversibility: in `interview.md` during planning (grill-me continues the
  numbering), and in `scratchpad.md` afterwards (decision-record
  `--answered-by agent`). These entries are assessed by the planning and
  boundary reviewers and listed on the PR under "Decisions made for you".
- **Planning gates** use `planning.review` and `autonomous-evaluator`
  decisions. Settle a completed negative review only with evidence-backed
  judgment.
- **Testing permission.** The grant covers the test methods needed to prove
  the change, even where project files say to ask first: running the app,
  simulators or devices, browser automation and screenshots. List each method
  used in the PR description. Rules about *how* to test still apply.
  Production, data deletion and harness or system approval prompts are not
  covered.
- **Stay active.** While CI or review bots are pending, wait with a PR watcher
  (for example `watch_pull_request`) instead of ending the turn.
- **Blockers.** A blocker is a missing second provider, an unprovable check,
  credentials or production access, a needed mandate change, lost
  protection, or a usage limit you can still act on. When one stops you:
  1. advance as far as you can;
  2. open (or keep) the PR (draft or ready), and list every blocker in its description;
  3. record `goal.park` `{pr: {repository, number}, blockers, evidence}`;
  4. pause the native goal (`pause_goal` / `update_goal` blocked);
  5. ask through the harness question tool with the PR link, the blocker and
     your recommended options.

  A human `run.continue` resumes the run. Never bypass a protection or change
  the mandate.
- **Endpoint.** Stop at a ready, unmerged final PR: acceptance qualifies and
  `review.publish` has published the current summary. Do not merge into the
  release branch. That needs the human's per-PR instruction, and deployment
  is separately authorized.
