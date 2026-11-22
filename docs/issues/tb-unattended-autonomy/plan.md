# Plan - tb-unattended-autonomy

**Feature:** `tb-unattended-autonomy`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-11-21

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge cases.

## Strategy

Treat `goal` as "autonomous authority plus attendance rules":

1. **Protocol core.**
   - Add two predicates:
     - `autonomousValue`: true for `mandated` and `goal`;
     - `unattendedValue`: true for `delegated`, `mandated` and `goal`.
   - Route every current `=== 'autonomous'` check through `autonomousValue`
     and every `['delegated', 'autonomous']` check through `unattendedValue`,
     so delegated eligibility is preserved (spec A3, F7). Today that is 37
     sites across contracts, core, delegation, authorization, delivery,
     boundary-review, execution, autonomous, adapter, fleet and the views.
   - Add the new `PARKED` state and the `goal.park` operation, and project
     `status.goal`.
2. **Hooks.**
   - Extend the PreToolUse guard with a question-tool branch.
   - Add a Stop hook script. Both read `status` through the same adapter and
     fail open.
3. **Prose and skills.**
   - Add provenance fields and the goal branch to grill-me, the design
     procedure and the decision-record procedure.
   - Add the new `goal` skill.
   - Add goal guidance to SessionStart, and update PROTOCOL, WORKFLOW,
     USER-GUIDE and the software-development-workflow skill.
4. **Publication.** Parse `Answered by: agent` entries from the three record
   files and write "Decisions made for you" in `review.publish` for goal runs.
5. **Surfaces and packaging.**
   - Show the level in the CLI and desktop current views.
   - Restage the desktop and CLI protocol resources and update the platform
     and workflow inventory contracts.
   - Rebuild and validate the native packages.

Delivery is one FEATURE candidate and PR into `main`. Integration and release
are the same branch, so there is no SLICE delivery.

## Steps

- **P1.** Dial value and authority parity.
  - Add `goal` to `DIALS.autonomy`.
  - Apply the mandate, human-authority, runId and protection requirements for
    `goal` in `startDial` and `dialChange`.
  - Add `hasAutonomousAuthority` and replace every autonomous check with it.
  - Keep the release-merge refusal.
  - Tests: one goal-run counterpart for each existing autonomous test path,
    plus refusal tests.
  - **Advances:** R1, R2, R3.
- **P2.** Park and terminal state (spec AC2, AC3 as clarified by A3).
  - A park requires an open draft PR whose description contains every
    blocker.
  - Parked takes precedence over ready-pr.
  - `status.goal.decisions` lists the agent decision entries.
  - Add the `goal.park` operation (input: `pr`, `blockers`, `evidence`) and the
    `PARKED` reducer event.
  - `run.continue` with human authority clears the park.
  - Add the `status.goal` projection (condition text, terminal, reason),
    computed from the acceptance milestone, the published summary and the
    observed PR state.
  - Tests cover each terminal state and every refusal.
  - **Advances:** R4, R5.
- **P3.** Question guard.
  - Add a question-tool branch to `pre-tool-use.js`.
  - Add matchers for `AskUserQuestion` and `request_user_input` in both
    `hooks.json` files.
  - Add hook tests for deny, park-allow, non-goal and unreadable state, with
    the shell-guard tests unchanged.
  - **Advances:** R6.
- **P4.** Stop hook.
  - Add a `stop.js` script. It blocks with the goal condition and the next
    action from `next`.
  - Register it in the Claude manifest.
  - Register the hook in the Codex manifest too (Codex 0.171.0 was observed
    to support Stop hooks), and record Stop-hook support for both platforms in
    `platform-contracts.json`.
  - Add hook tests.
  - **Advances:** R7.
- **P5.** One decision record.
  - Add the provenance-field and goal self-answer rules to grill-me,
    `commands/design.md` and `commands/decision-record.md`, and update the
    decision templates.
  - Add an agent-decision parser for `interview.md`, `scratchpad.md` and
    `decisions.md`.
  - Pin `interview.md` at `approve-design` or amendment. The goal grant
    never re-pins. Report a differing record as a missing milestone item in
    goal runs.
  - Pass the agent entries to planning-review and boundary-review inputs
    under goal, with rule clauses requiring their assessment.
  - Add the publication parser and the "Decisions made for you" section, with
    tests.
  - **Advances:** R8.
- **P6.** `goal` skill and SessionStart.
  - Add the `plugin-src/shared/skills/goal/SKILL.md` skill:
    - prerequisite checks first;
    - separate paths for a new grant (fresh branch, start, raise) and a raise
      (set-dial only);
    - native goal arming where available, with the Stop hook stated as the
      fallback.
  - Register it in the workflow inventory.
  - Add goal-run guidance in `session_start.py`, with Python tests.
  - **Advances:** R9.
- **P7.** Surfaces, docs and packaging.
  - Show goal and its terminal state in `cli/src/commands/current.js` and
    `apps/desktop/renderer/current-view.js`, with view tests.
  - Update the docs.
  - Restage the desktop resources, then run `plugin build`, `validate` and
    `validate-native`.
  - **Advances:** R10.

- **P8.** Rename `autonomous` to `mandated` (spec A1).
  - Change the dial value to `mandated` in `DIALS`, `AUTONOMOUS_VALUES`,
    fleet and every view.
  - Add an input alias normalization in `startDial` / `dialChange`, and a
    replay normalization of retained `STARTED` / `DIAL_SET` values in the core
    reducer.
  - Update the docs and SessionStart wording.
  - Tests cover the alias, legacy replay and surfaces.
  - **Advances:** R11.

## Verification

- Focused checks: `node --test` on the touched CLI test files and the Python
  SessionStart tests after each step.
- Broad checks: the full CLI suite, desktop tests, plugin validate and
  validate-native, `ci/portable-acceptance.sh`, and `git diff --check`.
- **Final step:** Run full rubric evaluation and produce the completion report.
