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

## S9. Verification round 1 failed on a missing dependency install

- **Answered by:** agent
- **Decision:** The first local Verification failed three checks because this
  fresh worktree had no `cli/node_modules` (`Cannot find package
  'commander'`). Installed with `npm ci --prefix cli` and reran the same
  checks with unchanged arguments.
- **Reversibility:** not applicable (environment).

## S10. Boundary review round 1 findings

- **Answered by:** agent
- **Decision:** Round 1 (head 850684d): both FAIL.
  - Codex high `closed-scope-sweep-reuse`: records from a closed scope could
    match a later scope with the same name and revision. Fixed with a scope
    epoch (`roundPolicy.epoch`, the number of times the scope has closed),
    required to match when collecting records and used in the #134 round key.
  - Claude medium `CR-1`: the prepass counted a finding's first raise as a
    re-report, so with same-revision grouping a re-review could never close
    a finding its round raised; a later round then reopened it. Fixed: only a
    re-report of an ID an earlier round raised counts as present.
  - Codex medium / Claude low: no local desktop test receipt. Added
    `npm test --prefix apps/desktop` to the local Verification.
  - Codex low: no receipt for the `--claims` help text. Added a check.
  - Claude low `CR-2` (a reused finding ID keeps the oldest raising report as
    origin): not changed. It needs a reviewer to reuse an ID for a different
    defect after its reports leave the packet; recorded for the PR.
  The new tests fail on the round-1 code. Claims were passed in the old
  `{findingId, claim}` shape because the run uses the installed rc.34 CLI.
- **Reversibility:** reversible.

## S11. Boundary review round 2 findings

- **Answered by:** agent
- **Decision:** Round 2 (head e810f4d): codex PASS (low CR-2 only); claude-code
  FAIL with two medium findings in one class (`round-group-spans-executions`):
  grouping by scope epoch, round and revision also merged sequential
  same-revision re-reviews, so (CR2-1) an earlier execution's `present` kept
  blocking a later dispute re-review's closures, and (CR2-2) a re-report in a
  same-revision re-review was not counted, so the outcome depended on
  processing order. Fixed as a class: within a round each provider's latest
  report is its perspective; a closure is blocked only by another provider's
  latest report; a re-report counts when an earlier report (not an earlier
  round) raised the ID; and the next round's history carries every closure
  since the finding was last reopened (`execution.js`, one more small edit),
  without which the superseding re-review never reached qualification. Sites
  found by searching every reader of round keys and finding closures:
  `review-findings.js` prepass and closure check, `execution.js` finding
  states and history selection. Tests: three new round-policy tests, which
  fail on the round-2 code (the order-dependent case in one order, as
  expected).
- **Reversibility:** reversible.

## S12. Hosted CI failure: new module missing from the declared inventory

- **Answered by:** agent
- **Decision:** Round 3 converged (both PASS) and hosted CI ran on d5e37f2.
  Both Ubuntu 24.04 jobs failed one test, `portability.test.js` "lints the
  canonical repository plugin sources": `current/sweep-records.js` was not
  listed in `plugin-src/contracts/workflow-inventory.json`. Added. The local
  Verification now also runs the portability test, plugin lint and native
  validation, which would have caught it. One paired round reviews the fix,
  then CI reruns.
- **Reversibility:** not applicable.

## S13. Merging main before merge

- **Answered by:** agent (merge authorized by Trent on 2026-11-27)
- **Decision:** The PR had fallen 26 commits behind main and conflicted with
  #142 in `execution.js` (the value now carries both `incorporated` and
  `sweepRecords`; the reuse check compares both). Merged main into the
  branch and moved the local `featureBaseSha` to the new merge base with
  main, as the workspace configuration defines it, so the FEATURE candidate
  reviews this feature's diff rather than #142's. One paired review round
  (round 5) and hosted CI rerun on the merged head before merging.
- **Reversibility:** reversible.

## S14. Boundary review round 5 findings

- **Answered by:** agent
- **Decision:** Round 5 (head 22de63b, after the main merge): codex
  UNAVAILABLE only because the PR state is not in the bound evidence (one low,
  scope-reset round count); claude-code FAIL with two mediums.
  - `CR5-1` (class `reintroduction-origin-lost`): the S5 history change
    cleared a finding's closures when a re-report or `present` reopened it,
    so from the round after a reintroduction the resolving review left
    history and qualification judged the finding from its first raise.
    Fixed: closures are kept when a finding reopens, and an open finding's
    history carries them. Sites: the re-report and `present` branches of
    `findingStates`, open-finding history selection and prioritization in
    `execution.js`. Test: round-policy.test.js "a reintroduced boundary
    finding stays a regression in the round after its reintroduction"
    (fails on the round-5 code).
  - `EV5-1`: no local receipt for `self-validation.test.js` and
    `review-packet.test.js` (both arrived from main). Swept the CLI tests for
    drivers of `gate.execute`, `review.execute`, `boundaryReviews` and the
    round policy; these two were the only uncovered ones. Added as a new
    Verification check.
- **Reversibility:** reversible.

## S15. Boundary review round 6 finding

- **Answered by:** agent
- **Decision:** Round 6 (head 63ed6dc, hand-back band): codex PASS (both
  round-5 findings resolved); claude-code FAIL with one medium in the CR5-1
  class (`CR6-1`): re-reports and `present` dispositions shared one
  `reopened` slot, so a later `present` overwrote the review that
  reintroduced a finding and qualification took the origin from a round that
  did not touch its path. Fixed as a class: a finding's history is its
  raising review plus every later report that reopened or closed it (`trail`
  in `execution.js`), used by history selection and prioritization alike.
  Test: round-policy.test.js "a reintroduced boundary finding keeps its
  reintroducing round through later present dispositions" (fails on the
  round-6 code). Round 7 needs the human `review-rounds` decision.
- **Reversibility:** reversible.

## S16. Round 7, the human decisions and a second main merge

- **Answered by:** human (Trent, through the question tool) for the decisions;
  agent for the merge resolution
- **Decision:** At the round-6 hand-back the run was parked behind PR #168 and
  Trent chose `continue` (recorded as a `review-rounds` decision). The agent
  then returned the run to supervised autonomy, which superseded the
  autonomous implementation authorization; Trent authorized implementation of
  the unchanged commitments. Round 7 (head f5a9f25): both PASS; hosted CI
  green. Main then gained #171 (#143), which conflicts in the evaluator
  instruction text: main's text is kept and this PR's two additions
  (`packet.sweepRecords.guide`, missed sites of a swept class in the rounds
  4-5 band) are reapplied to it. `REVIEW_CONTRACT_VERSION` stays at main's
  value, so a retained result under that version must match the merged
  rules exactly.
- **Reversibility:** reversible.

## S17. Boundary review round 8 finding

- **Answered by:** agent
- **Decision:** Round 8 (head 94d1183): claude-code PASS (lows CR8-1, EV8-1);
  codex FAIL with one high (`R1-command-path-cases`): R1 requires refusals
  through both `gate.execute` and `review.execute`, but an unknown
  disposition and an unknown claim key were only tested on `checkClaims`.
  Fixed: the command test now submits every invalid-claim case through both
  commands. Swept the rubric for other rows that require both commands: R1
  is the only one.
- **Reversibility:** reversible.

## S18. Boundary review round 9 finding

- **Answered by:** agent
- **Decision:** Round 9 (head 698bff4): claude-code PASS; codex FAIL with one
  high in the R1 class (`R1-valid-disputed-command-path`): the only command
  acceptance check used a stale claim that is dropped, so a valid disputed
  claim on a retained finding was not shown accepted through either command.
  Fixed with a test that sends it through `gate.execute` and then (on a new
  revision, so nothing is reused) `review.execute`, and checks the claim is
  retained, not dropped, and in every packet's `dispositionsRequired`. Swept
  every R1 Pass condition against the tests: the refusal cases, no launch
  and no result on refusal, and acceptance through both commands are now
  each tested through both commands.
- **Reversibility:** reversible.
