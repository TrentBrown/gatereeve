# Decision Scratchpad - tb-metrics-remainder

**Feature start:** 2026-11-27

Working record of decisions made during this feature's lifetime. Triage at
each PR boundary; promoted entries are appended to `decisions.md`.

Each entry records **Answered by:** `human | agent`. Agent entries also record
their alternatives and **Reversibility:**; goal runs publish them on the PR.

## S1. Rigor full, goal autonomy

- **Promoted:** DEC-1 in `decisions.md` (2026-11-27)

- **Answered by:** human
- **Decision:** Full rigor and goal autonomy, from Trent's overnight grant
  relayed by the coordinating thread. Planning decisions are
  `autonomous-evaluator` decisions citing independent planning reviews.

## S2. Design approval settled by autonomous judgment (design review round 4)

- **Promoted:** DEC-2 in `decisions.md` (2026-11-27)

- **Answered by:** agent
- **Decision:** Approve the design under `autonomous-evaluator` authority with
  judgment after four Codex design reviews. Rounds 1-3 findings were fixed in
  the design (join key, partial-coverage success, own-findings identity, open
  scopes in the median). The repeated finding, that the Completion-decision
  half of D6.2 (and its use in D6.3) needs follow-up records, was disposed
  `unsupported`: those records are #148, which the human sequenced after this
  issue (#150 wave 4; follow-up seed lists AC7 apart from AC11).
- **Alternatives:** build minimal follow-up records here (duplicates #148);
  keep iterating (round 6 hands back to the human).
- **Reversibility:** high; measure 2's decided part starts counting once #148
  sets `followUp`.

## S3. Implementation authorization settled by autonomous judgment (spec review round 5)

- **Promoted:** DEC-3 in `decisions.md` (2026-11-27)

- **Answered by:** agent
- **Decision:** Authorize implementation after five Codex spec reviews; rounds
  1-4 findings fixed. Round 5 (mandate PASS) found that AC6's waiver wording
  can close more than one unpassed scope of a workflow. Accepted as residual
  risk and implemented as written: a spec revision would need a round-6
  review, which hands back and refuses adjudication.
- **Alternatives:** amend the spec (hand-back); implement the reviewer's
  single-scope reading (deviates from the approved text).
- **Reversibility:** high; a later spec amendment can narrow the rule.

## S4. Reprojection keeps earlier rows unconverted

- **Promoted:** DEC-6 in `decisions.md` (2026-11-27)

- **Answered by:** agent
- **Decision:** Interview D8 said an earlier-version workflow is reprojected
  from its first event. An existing rule (and test) says earlier reporting rows
  are never converted, for example given dial fields after the fact. Both hold:
  replayed rows keep every stored field and gain only the convergence fields;
  rows with none are untouched; only new per-reviewer rows are added. AC5 is
  met (same IDs, new fields in the latest version, no duplicates).
- **Alternatives:** full reprojection (breaks the earlier rule); forward only
  (fails AC5).
- **Reversibility:** high.

## S5. Rounds and statuses from real journals

- **Promoted:** DEC-7 in `decisions.md` (2026-11-27)

- **Answered by:** agent
- **Decision:** A dry run over five retained local run journals (read-only,
  into a scratch metrics store) showed that `BOUNDARY_REVIEWED` records the
  scope and revision but not the round, and that pre-#140 outcome rows carry
  retired status values. The pair round now comes from the reviewers' result
  inputs, else the counted round of the revision; a pair with neither is
  reported as uncounted (not a round, not "not recorded"); out-of-vocabulary
  statuses and reasons are omitted rather than failing the projection.
- **Alternatives:** treat roundless pairs as not recorded (permanently marks
  those runs incomplete).
- **Reversibility:** high.

## S6. Desktop delivered; Mac-only test failure is pre-existing

- **Promoted:** DEC-8 in `decisions.md` (2026-11-27)

- **Answered by:** agent
- **Decision:** The desktop part was small (an IPC action and a card control),
  so the AC13 fallback was not used. `desktop reevaluation uses the staged
  measurement` fails on this Mac with "Unsafe metrics directory" on unmodified
  `main` too (temporary-directory symlink); it is skipped in the local
  verification receipt and runs in hosted CI.
- **Reversibility:** n/a.

## S7. #136 and the live-store purge not folded in

- **Promoted:** DEC-9 in `decisions.md` (2026-11-27)

- **Answered by:** agent
- **Decision:** As interview D11: #136 is a planning-qualification fix in
  `delegation.js`; `metrics purge-test-data --workflows-file` already exists,
  and the parked item is an operation on a live remote store, which this run
  must not touch.

## S8. Boundary review round 1 fixes

- **Answered by:** agent
- **Decision:** Fixed every round-1 finding except the #148 dependency:
  - the recorded reviewer status wins, so a reused result is `refused`;
  - scope instances split at each round-1 count (successive slices,
    amendments);
  - each provider's final outcome per round counts once (re-reviews);
  - a review waiver closes only the scope instance of the workflow's latest
    reviewed round;
  - added the missing validation, threshold and dataset Markdown tests;
  - added receipts for `metrics-repair.test.js` and the desktop reevaluation
    test, which pass with a realpath `TMPDIR` on this host.

  The waiver change narrows DEC-3. Both reviewers rated AC6's literal reading
  high, and the narrower rule matches design D6 ("attributed to the latest
  pair's scope"). An earlier abandoned scope now stays open, so measure 1
  reads "not measurable" rather than "met".
- **Alternatives:** keep AC6's literal reading (both reviewers block on it).
- **Reversibility:** high.

## S9. Human answers to the park (PR #169)

- **Promoted:** DEC-2 and DEC-3 updates in `decisions.md` (2026-11-27)

- **Answered by:** human
- **Decision:** "Confirm #148 + amend AC6 (Recommended)": the
  Completion-decision half of measure 2 ships with #148; AC6 is amended to
  the narrowed waiver rule and scope instances (spec Changes A1, A2). This
  confirms agent entries S2 and S8 and supersedes S3.

## S10. Restarted-scope round 1 fixes

- **Answered by:** agent
- **Decision:** A round passes only when one recorded pair had every reviewer
  complete with PASS. Reviewers from separate pair events (a reused result
  beside a later retry) no longer combine into a PASS no pair recorded (Codex,
  high). Added a receipt for `terminal-renderer.test.js`, which loads the
  changed metrics card (Claude, low). Claude's other low note is left as is: a
  rounds 4-5 FAIL that the boundary treats as PASS because only demoted
  findings explain it reads as not passed in the measure. AC3 defines the
  pair outcome by the returned outcomes, and the effect is conservative (never
  a false "met").
- **Reversibility:** high.

## S11. Restarted-scope round 2 fixes

- **Answered by:** agent
- **Decision:** `tracedWithFollowUp` counts distinct linked demoted findings
  with a follow-up record (new `tracedFindings` gives all linked demoted
  findings), not defects. A review result without a reviewer status (an
  earlier projection) makes measures 1 and 4 incomplete. The PERFORMANCE.md
  measure 1 text now states the one-pair PASS rule.
- **Reversibility:** high.

## S12. Merge of main and post-merge round fixes

- **Answered by:** agent
- **Decision:** main (#142's attempt, duration and token fields) was merged
  in, keeping both field sets. The post-merge round's two Codex findings
  were fixed: waiver `gates` must be protocol gate IDs (unknown IDs are
  dropped at projection and rejected by validation), and a final reviewer
  outcome without a recorded status counts as not recorded in measure 4
  instead of UNAVAILABLE. Claude's low note on Unicode line separators in
  class statements was also fixed. Its other two low notes were left as
  they are: the receipt purpose wording stays unchanged so the check
  identity stays stable, and the replay re-reads results that were
  already projected.
- **Reversibility:** high.

## S13. Round 6-7 fixes after the second merge of main

- **Answered by:** agent (round 6 continued by the human)
- **Decision:** Round 5 Codex findings: the reviewer table counts rule rows
  of review results only, and a counted reviewer outcome without a status is
  not recorded in measure 1. Both are fixed; round 6 passed. Main (#171) was
  then merged in cleanly. In round 7, a fresh pass without history found two
  more issues, both fixed: capture skipped replayed rows as same-time
  conflicts (now a replay-only difference is an upgrade, `replayVersion` in
  fleet.js), and measure 3 now counts every earlier finding as not recorded.
  Codex's medium non-blocking note (a `--since` boundary can split a round
  from its findings) and Claude's low note on the local receipt's suite list
  are left as follow-ups.
- **Reversibility:** high.
