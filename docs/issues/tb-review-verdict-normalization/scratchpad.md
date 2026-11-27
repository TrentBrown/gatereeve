# Decision Scratchpad - tb-review-verdict-normalization

**Feature start:** 2026-11-26

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

Each entry records **Answered by:** `human | agent`. Agent entries also record
their alternatives and **Reversibility:**; goal runs publish them on the PR.

## S1. Rigor full, goal autonomy

- **Promoted:** DEC-1 in `decisions.md` (2026-11-26)

- **Answered by:** human
- **Decision:** Full rigor (issue #150's "standard" maps to full; GateReeve has
  only full and light). At the design gate Trent approved the design and
  granted goal autonomy: "Approved. I now grant you goal autonomy to complete
  this work."

## S2. PR #152 outcome-row leftover deferred

- **Promoted:** DEC-2 in `decisions.md` (2026-11-26)

- **Answered by:** agent
- **Decision:** Design item 8 and interview D10's fold-in of the PR #152 low
  finding (a failed read of a just-saved result drops the outcome row's
  reference) are left out of this PR. The spec planning review (Codex, round
  1, high) found it outside the mandate's "keep the change focused on #141's
  scope" constraint. `design.md` and `interview.md` stay as approved; the spec
  states the deferral.
- **Alternatives:** keep it, citing the coordinating thread's permission to
  fold in path-adjacent leftovers (rejected: the recorded mandate does not
  carry that permission, and the fix is independent of #141).
- **Reversibility:** fully reversible; the fix can land in its own PR.

## S3. AC3 low-severity wording

- **Promoted:** DEC-3 in `decisions.md` (2026-11-26)

- **Answered by:** agent
- **Decision:** "An earlier finding that blocks" means `blocking: true` and
  not low (`findingBlocks`), matching the code's existing definition; a
  `present` low earlier finding is AC5. Spec review round 1 (medium).
- **Reversibility:** wording only.

## S4. Design revised in PLANNING instead of descoped silently

- **Promoted:** DEC-2, DEC-4 in `decisions.md` (2026-11-26)

- **Answered by:** agent
- **Decision:** Spec review round 2 (high) found the S2 descope conflicts with
  the approved design. `design.md` item 8 is removed with a Changes entry,
  interview D10 is updated, and the design is re-approved under
  `autonomous-evaluator` authority after an independent design planning
  review. The same revision records the hook-based unwrap reporting (item 1).
- **Alternatives:** an `amend` decision (applies to delivery requirements after
  implementation authority; the run is still in PLANNING).
- **Reversibility:** reversible by a later design revision.

## S5. Local verification leaves two host-dependent test files to CI

- **Answered by:** agent
- **Decision:** The local broad receipt runs the CLI suite without
  `local-agent-idle-inhibitor.test.js` (hangs on macOS) and
  `scratch-cleanup.test.js`. Its "leftover tombstone alone is reclaimed" test
  fails on this host with "Installer root ownership changed" from the host's
  own installer directory, identically on unmodified `main` (`b92ad40`); this
  change does not touch the storage code. Hosted Ubuntu acceptance runs both
  files.
- **Alternatives:** keep the file and accept a failing local receipt
  (rejected: it would fail verification for an unrelated host condition).
- **Reversibility:** verification configuration only.
