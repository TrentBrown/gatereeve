# Decisions - tb-metrics-remainder

Permanent decision records promoted from `scratchpad.md` at PR boundaries.

All entries except DEC-1 were answered by the agent under goal autonomy and
are listed on the PR under "Decisions made for you". Design choices D1-D11
are in `interview.md`.

## DEC-1. Full rigor, goal autonomy

- **Answered by:** human
- **Decision:** Full rigor and goal autonomy from Trent's overnight grant.
  Planning decisions are `autonomous-evaluator` decisions citing independent
  planning reviews.
- **Source:** scratchpad S1.

## DEC-2. Follow-up dependency settled by judgment at the design gate

- **Answered by:** agent; confirmed by the human on 2026-11-27 (scratchpad S9)
- **Decision:** Measure 2's Completion-decision part and measure 3's
  follow-up link wait for #148's follow-up records; the design defines the
  `followUp` field so they start counting without another metrics change, and
  reports the missing part as not measurable, never as met.
- **Alternatives:** build follow-up records here; keep iterating to the
  round-6 hand-back.
- **Reversibility:** high.
- **Source:** scratchpad S2, interview D3 and D4.

## DEC-3. A review waiver closes only the latest reviewed scope

- **Answered by:** agent; approved by the human as spec amendment A1 on 2026-11-27 (scratchpad S9)
- **Decision:** At the spec gate, AC6's waiver wording (closing every
  unpassed scope whose latest pair precedes the waiver) was accepted as
  residual risk. Boundary review round 1 rated that reading high in both
  reviews, so the implementation narrows it (scratchpad S8): a waiver closes
  only the scope instance of the workflow's latest reviewed round, which is
  also where a waive after a FAIL streak is attributed (design D6). An
  earlier abandoned scope stays open.
- **Alternatives:** amend the spec (round-6 hand-back).
- **Reversibility:** high.
- **Source:** scratchpad S3, S8 and S9.

## DEC-4. "Second reviewer" read as every reviewer provider

- **Answered by:** agent
- **Decision:** Measure 4 is met only when every provider is below 10%
  UNAVAILABLE and reported findings; the class-ID overlap is an
  informational proxy only.
- **Reversibility:** high; a report-time rule.
- **Source:** interview D5.

## DEC-5. Text kept out of the reporting store

- **Answered by:** agent
- **Decision:** Only enumerations, flags, counts and short labels are
  projected; a class statement only as one line of at most 200 characters.
  Failure scenarios, evidence and paths stay in the run journal.
- **Reversibility:** medium (exported snapshots keep what was projected).
- **Source:** interview D7.

## DEC-6. Replay without converting earlier rows

- **Answered by:** agent
- **Decision:** Earlier-version workflows are replayed; replayed rows gain
  only the convergence fields, other rows stay untouched (the existing rule
  that earlier reporting rows are never converted). A replayed version that
  differs only in convergence fields supersedes the earlier version in
  snapshot capture and import, instead of being skipped as a same-time
  conflict (post-merge review round 7).
- **Reversibility:** high.
- **Source:** scratchpad S4, S13, interview D8.

## DEC-7. Pair rounds from reviewer inputs; uncounted pairs

- **Answered by:** agent
- **Decision:** From a dry run on real journals: the pair round comes from
  the reviewers' inputs or the counted revision; a pair with neither is
  uncounted (not a round); out-of-vocabulary statuses are omitted instead of
  failing the projection.
- **Reversibility:** high.
- **Source:** scratchpad S5.

## DEC-8. CLI surface is `metrics convergence`; desktop delivered

- **Answered by:** agent
- **Decision:** `gatereeve metrics convergence` is the CLI status surface;
  `gatereeve status` (already showing scopes and rounds) and `metrics status`
  are unchanged. The desktop part was small, so the fallback was not used.
- **Source:** interview D9, D10; scratchpad S6.

## DEC-9. #136 and the live-store purge left out

- **Answered by:** agent
- **Decision:** Neither falls out of this change; the purge command already
  exists and the live store is off limits for this run.
- **Source:** interview D11; scratchpad S7.
