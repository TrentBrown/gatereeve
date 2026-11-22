# Spec - tb-unattended-autonomy

**Feature:** `tb-unattended-autonomy`
**Created:** 2026-11-21

## Summary

The autonomy dial gains a fourth value, `goal`. A goal run has exactly
`autonomous` authority and runs from the human grant to a pull request without
asking the human. It records every self-answered decision in the one
provenance-tagged interview/decision record, keeps itself active through the
harness-native goal (or a GateReeve Stop hook), and ends either at a ready,
unmerged final PR or parked behind a draft PR that lists its blockers.
Controlling input: `design.md` (approved 2026-11-21) with `interview.md`
D1-D10.

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Acceptance Criteria

- **AC1. Grant and authority.**
  - `run.start` and `run.set-dial` accept `autonomy: goal` only when all of
    the following hold:
    - an observed human `authority`;
    - the named `runId` (for `run.set-dial`);
    - a fixed `mandate: {goal, constraints}`;
    - the release branch observed as protected.
  - A request meeting all four is accepted. A request missing any of them is
    refused with the same refusal `mandated` gives.
  - An agent actor cannot raise a run to `goal`.
  - A goal run qualifies wherever `mandated` qualifies:
    - `autonomous-evaluator` planning decisions;
    - `review.adjudicate`;
    - in-mandate amendments without hand-back;
    - autonomous SLICE integration delivery;
    - a light run's tripwire escalating it to full rigor.
  - Checks that admit delegated *or* autonomous authority keep admitting
    `delegated`. Checks that admit only autonomous authority admit `mandated`
    and `goal`, never `delegated`.
  - A goal run never authorizes the final release-branch merge. It stays
    refused until the per-PR human instruction is recorded.
  - The defaults stay `full`/`supervised`, and no configuration can select
    `goal`.
  - Existing current/8 runs report the same dials and the same `status` as
    before, apart from the AC9 rename.
- **AC2. Terminal state in status.**
  - For a goal run, `status` reports a `goal` object with:
    - `condition`: the goal-condition text naming the run;
    - `terminal`: one of `ready-pr`, `parked` or `null`;
    - `reason`;
    - `decisions`: the agent decision entries of AC6.
  - `terminal` is `parked` while a recorded park is active. Parked takes
    precedence over ready-pr.
  - Otherwise `terminal` is `ready-pr` only when all of the following hold:
    - the acceptance milestone qualifies for the current FEATURE candidate;
    - `review.publish` recorded the current review summary on an open,
      unmerged PR (draft or not; see A2) whose head is the candidate head.
  - Otherwise `terminal` is `null`.
  - A run that is not a goal run reports no `goal` object.
- **AC3. Park and resume.**
  - The `goal.park` operation is accepted only in a goal run without an
    active park.
  - Its input names a PR, a non-empty list of blockers and non-empty
    retained evidence.
  - It records `PARKED` only when the named PR is open, is a draft, and its
    description contains every listed blocker.
  - `goal.park` is refused outside a goal run, when already parked, without
    a PR, with no blockers or evidence, or when the PR is closed, merged, not
    a draft, or missing a listed blocker.
  - A human `run.continue` with authority clears the park, and the run stays
    `goal`. A `run.continue` without human authority is refused.
  - `run.set-dial autonomy supervised` also ends goal mode and clears any
    park. Either actor may do this, as for `mandated`.
- **AC4. Question-tool guard.**
  - The Claude Code and Codex hook manifests route `AskUserQuestion` and
    `request_user_input` to the PreToolUse guard.
  - In a goal run without an active park, the guard denies the call. The
    denial reason tells the agent to answer the question itself and record an
    `Answered by: agent` entry.
  - With an active park, in any run that is not a goal run, or when the run
    state cannot be read, the guard does not deny.
  - The existing shell-command guard behavior is unchanged.
- **AC5. Stop hook (persistence floor).**
  - Both the Claude Code and Codex hook manifests register a Stop hook. The
    platform contracts record Stop-hook support for both.
  - In a goal run whose `goal.terminal` is `null`, the hook blocks stopping.
    Its reason names the goal condition and the current state.
  - There is one exception, the stall valve: after 3 consecutive blocks
    during which the run recorded no new protocol event, the hook admits the
    stop, so a stuck agent cannot loop without limit.
  - With `ready-pr` or `parked`, in any run that is not a goal run, or when
    the run state cannot be read, the hook does not block.
- **AC6. One provenance-tagged decision record.**
  - grill-me, the design procedure and the decision-record procedure require
    an **Answered by:** `human | agent` field on every entry.
  - Agent entries also carry the options considered and whether the choice
    can be undone.
  - Under `goal`, grill-me self-answers and continues numbering from the
    last entry. Under every other autonomy it asks the human.
  - In a goal run, `interview.md` is pinned by hash at the latest planning
    approval point: `approve-design` or an amendment. While
    the current `interview.md` differs from the pin, the implementation and
    acceptance milestones report it as missing, until an amendment pins the
    new record.
  - Raising a run to `goal` never re-pins: it keeps the record pinned by the
    latest `approve-design` or amendment. An `interview.md` that already
    differs from that approved record blocks the goal run's milestones until
    an amendment pins it. Commitment subjects and milestones of non-goal runs
    are unchanged.
  - The agent decision entries are every entry marked `Answered by: agent` in
    `interview.md`, `scratchpad.md` and `decisions.md`. Each is identified by
    file and heading.
  - Under goal autonomy, both the planning-review and the boundary-review
    inputs include those entries. Both review rules require an assessment of
    them against the mandate.
  - `review.publish` for a goal run writes a "Decisions made for you"
    section listing every agent decision entry. It writes no such section for
    other autonomies.
  - A human confirming an agent entry changes its provenance to `human`. A
    human overriding it adds a superseding entry.
- **AC7. Goal skill and session guidance.**
  - A `goal` skill ships in both platform packages. Given an objective and
    optional constraints, it checks the prerequisites before writing anything
    (release protection, workspace configuration, second-provider
    availability) and reports the first failure to the human.
  - **New grant (no current run).** The skill:
    - creates a topic branch from the freshly fetched default branch;
    - starts the run with rigor full unless the human said light, writing
      or replacing the workspace configuration under the grant's authority;
    - raises autonomy to `goal` with the mandate.
  - **Raise (existing run, including after a human-led interview).** The
    skill only records `run.set-dial autonomy goal` with the mandate. It
    creates no branch, changes no rigor, and continues from the run's current
    phase.
  - **Persistence on both paths.** Where the harness offers a native goal
    tool, the skill arms it with the `goal.condition` text (Claude Code
    `set_goal`, Codex `create_goal`). Otherwise it states that the Stop hook
    (AC5) provides persistence.
  - Plain-language grants follow the matching path.
  - In a goal run, SessionStart guidance states:
    - the goal condition, with the instruction to check and re-arm the native
      goal when available;
    - the no-ask rule;
    - the scoped testing permission (test methods needed to prove the change;
      production, data deletion and harness approvals excluded), plus listing
      the methods used in the PR description;
    - waiting with a PR watcher while CI or reviews are pending, instead of
      ending the turn;
    - the park rule: a draft PR whose description lists the blockers, then
      `goal.park`, then pausing the native goal, then the question tool;
    - the ready-unmerged-PR endpoint.
  - The `goal` skill states the same rules.
- **AC8. Surfaces, docs and packaging.**
  - The CLI current view and the desktop current view display `goal`
    autonomy, its terminal state and the agent decision entries.
  - PROTOCOL.md, WORKFLOW.md, the software-development-workflow skill and
    USER-GUIDE.md document the goal level, park/resume, the testing
    permission and the endpoint.
  - The desktop resource copies and the platform/inventory contracts are
    regenerated, and their existing consistency checks pass.
- **AC9. Level rename.**
  - The autonomy dial values are `supervised | delegated | mandated | goal`.
  - `run.start` and `run.set-dial` accept `mandated`, and accept `autonomous`
    as an alias that records `mandated`.
  - Retained events that recorded `autonomous` replay as `mandated`, with all
    authority, adjudication, hand-back and delivery behavior unchanged.
  - `status`, SessionStart, the CLI, the desktop and the docs present
    `mandated` as the dial value.
  - The `autonomous-evaluator` authority kind is unchanged.

## Rubric

Fail means any Pass condition is not met; the Fail column lists the most
likely failures.

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | AC1 grant prerequisites | Tests show `run.set-dial` to `goal` accepted with human authority + runId + mandate + protection and refused when each one is missing or the actor is agent, and `run.start` with `goal` accepted with human authority + mandate + protection and refused without the mandate | A valid grant refused, any missing prerequisite accepted, or an agent raise accepted | CLI protocol tests |
| R2 | AC1 parity and eligibility | Tests show a goal run passing each listed autonomous path; existing delegated tests pass; a release-target merge under goal is refused without the per-PR human instruction | Any listed path refused for goal, a delegated path lost, or a goal release merge allowed without the per-PR human instruction | CLI protocol tests |
| R3 | AC1 compatibility | The existing CLI suite passes; the only existing-test edits are AC9 rename assertions and the skill-inventory counts that the added `goal` skill (AC7) raises from 28 to 29; defaults remain full/supervised | Any other existing test changed, any existing test failing, or defaults changed | Full CLI test run + diff of existing tests |
| R4 | AC2 terminal state | Tests cover `null`, `ready-pr` (every condition), `parked`, parked precedence over ready-pr, `decisions`, and the missing `goal` object for non-goal runs | Any state reported when its conditions are not all met, or a covered case untested | CLI protocol tests |
| R5 | AC3 park/resume | Tests show park accepted only per AC3 (open draft PR containing every blocker) and refused for each listed refusal; resume only by human `run.continue`; dial return clears the park | Any listed refusal accepted, a valid park refused, or a non-human continue accepted | CLI protocol tests |
| R6 | AC4 question guard | Hook tests show deny under goal without park, no deny with park, non-goal or unreadable state; both manifests route both tools; existing shell-guard tests unchanged and passing | Any case decided otherwise, or a manifest missing a tool | Hook tests + manifest inspection |
| R7 | AC5 Stop hook | Hook tests show block for goal + `null` terminal (reason names condition and state), admit after the stall limit with no new event and re-block after progress, and admit for ready-pr, parked, non-goal and unreadable state; both manifests and contracts register it | A block in an admitted case, a missing block for goal + `null` within the stall limit, or a missing registration | Hook tests + manifest/contract inspection |
| R8 | AC6 record, pinning, review and publication | Procedure files require provenance fields and goal self-answering; tests show a changed `interview.md` blocking a goal run's milestones until an amendment re-pins it (and no effect for non-goal runs), agent entries parsed from all three files, agent entries in planning and boundary review inputs and rules under goal, and the publication section for goal only listing every entry | Any requirement missing, an entry omitted, non-goal subjects changed, or the section present for non-goal | Doc review + protocol/publication tests |
| R9 | AC7 skill and guidance | `goal` skill in both packages covers prerequisite-first order, the separate new-grant and raise paths, native-goal arming with Stop-hook fallback, and the rules listed; SessionStart tests show each listed guidance item for goal runs only | Missing skill or path, writes before checks, a listed rule absent, or goal guidance shown for non-goal runs | Package inventory + skill text review + SessionStart tests |
| R10 | AC8 surfaces and packaging | CLI and desktop views show goal, terminal state and agent decisions; docs updated; resource sync and contract checks pass | Any surface or doc missing, or a consistency check failing | View tests + sync/contract checks |
| R11 | AC9 rename and alias | Tests show `mandated` accepted with the same prerequisites, `autonomous` input recorded as `mandated`, and a retained `autonomous` event replaying as `mandated` with authority and hand-back intact; surfaces/docs name `mandated` | `mandated` refused, `autonomous` input or retained event refused or reported unnormalized, or any surface still presenting `autonomous` as a dial value | CLI protocol tests + view/SessionStart tests + doc grep |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.

- **A1 - 2026-11-21.** Added AC9 and R11: the `autonomous` level is renamed
  `mandated`, with an alias for inputs and retained records (design Changes,
  interview D11). The AC1 compatibility clause is narrowed as AC9 states. No
  other criterion is weakened.
- **A2 - 2026-11-21.** AC2 and R4 correction. GateReeve keeps a delivery PR an
  open draft until its merge is authorized (PROTOCOL.md: "Open drafts remain
  the default"; `merge.prepare` requires an open draft). AC2's "non-draft"
  condition for `ready-pr` therefore can never hold, and it is superseded:
  `ready-pr` requires an open, unmerged PR (draft or not) whose head is the
  candidate head, plus every other AC2 condition. `parked` remains
  distinguished by a recorded park, not by draft state. R4's pass and fail
  conditions read accordingly. Recorded under the mandate as an in-mandate
  amendment with an independent planning review.
- **A3 - 2026-11-21.** Clarifications from the independent planning review
  (codex gpt-6.1-sol, findings F1-F10), all within design.md:
  - `interview.md` pinned at the latest approval point (`approve-design` or
    an amendment; a goal grant never re-pins), with a goal run's milestones
    blocked while it differs (F1; second review F2);
  - boundary as well as planning review of agent entries from all three
    files (F2);
  - agent entries in status and views (F3);
  - separate new-grant and raise paths (F4);
  - the Stop hook on both platforms as the persistence floor, with native
    goal optional (F5; Codex Stop support observed);
  - park requires an open draft PR listing the blockers, and the native goal
    is paused on park (F6);
  - delegated eligibility preserved (F7);
  - parked precedence (F8);
  - binary rubric failure definitions (F9);
  - test methods listed in the PR and PR-watcher waiting (F10).

  The terminal-state criterion now folds in the A2 draft clause, the Stop-hook
  criterion adds the stall valve as a bounded exception, the rename criterion
  is restated, and the compatibility rubric row now admits the rename
  assertion edits.
- **A4 - 2026-11-22.** R3 also admits updating the existing skill-inventory
  count assertions (`contracts.test.js`, `portability.test.js`) from 28 to 29.
  That change necessarily follows from shipping the `goal` skill the goal
  skill criterion requires. The boundary reviewers (codex REV-3) read R3
  literally as forbidding it. No behavior criterion changes.
