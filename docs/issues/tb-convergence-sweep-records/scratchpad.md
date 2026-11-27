# Decision Scratchpad - tb-convergence-sweep-records

**Feature start:** 2026-11-26

Working record of decisions made during this feature's lifetime. Triage at
each PR boundary; promoted entries are appended to `decisions.md`.

Each entry records **Answered by:** `human | agent`. Agent entries also record
their alternatives and **Reversibility:**; goal runs publish them on the PR.

## S1. Rigor full, goal autonomy

- **Answered by:** human (relayed by the coordinating thread)
- **Decision:** Full rigor with goal autonomy, granted for the overnight work
  on #144. Planning decisions are `autonomous-evaluator` decisions citing
  independent planning reviews.

## S2. Design approved under autonomous-evaluator authority

- **Answered by:** agent
- **Decision:** `approve-design` recorded after the Codex design review
  (round 1) PASSed with no findings. Interview D1-D7 are agent answers for
  Trent to check.
- **Reversibility:** a later amendment can revise any entry.

## S3. Spec review round 1 low findings addressed before implementation

- **Answered by:** agent
- **Decision:** All six low findings from the Claude spec review were taken:
  F1-F4 tighten AC3, AC4, R2, R3 and R6; F6 adds plan step P7 (PR
  description). F5 (design status line reads "draft") is left: editing
  `design.md` would change the approved subject; the approval is recorded in
  the protocol and in S2.
- **Reversibility:** wording only.

## S4. Spec review round 2 findings fixed

- **Answered by:** agent
- **Decision:** Codex round 2 FAILed on two rubric-coverage gaps (R1 entry
  points, R4 round 5). Both are fixed in the rubric; no behavior changed.
- **Reversibility:** wording only.

## S5. #134 needed a third change: keep the raising review in history

- **Answered by:** agent
- **Decision:** The #134 tests showed the two planned changes (prepass counts
  re-reports, rounds grouped by scope, round and revision) were not enough.
  When a peer re-reported a finding, `execution.js` replaced the finding's
  history reference with the re-report, so the next round's history no longer
  held the raising review and the origin was lost before qualification ran.
  A re-report now keeps the first reference and records the re-report as
  `reopened`, exactly as a `present` disposition already did. Small edit in
  `execution.js` (shared with #142's work).
- **Alternatives:** read origins from the whole run instead of the selected
  history (rejected: a much wider change to history selection).
- **Reversibility:** reversible; history may hold one more report.

## S6. `review.execute` refuses an invalid claim up front

- **Answered by:** agent
- **Decision:** `review.execute` checks claims before either reviewer starts,
  in addition to the check in `gate.execute`. Without it, the per-reviewer
  check turned an invalid claim into two `refused` outcomes recorded in a
  `BOUNDARY_REVIEWED` event, which contradicts AC1 ("record no result").
- **Reversibility:** reversible.

## S7. Two fixed claims of one class: the other still present is a regression

- **Answered by:** agent
- **Decision:** AC4 as written: a finding is a class regression when its
  `classId` matches a record whose `findingId` differs. When the implementer
  claims two findings of one class fixed and one of them is still present, the
  other record makes it a regression, so it keeps blocking in rounds 4-5. This
  is the conservative reading: the sweep of the class claimed that site fixed
  too. A single claimed finding still present is judged by its own origin.
- **Alternatives:** exclude every claimed finding of the class (rejected for
  now: it weakens the rule, and the spec states the narrower exclusion).
- **Reversibility:** a one-line change in `sweptClassRegression`.

## S8. CLI help text for `--claims`

- **Answered by:** agent
- **Decision:** The `--claims` option description now names `disposition` and
  the sweep record.
- **Reversibility:** text only.
