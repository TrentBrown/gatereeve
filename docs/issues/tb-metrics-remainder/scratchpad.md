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
