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

- **Answered by:** agent
- **Decision:** Measure 2's Completion-decision part and measure 3's
  follow-up link wait for #148's follow-up records; the design defines the
  `followUp` field so they start counting without another metrics change, and
  reports the missing part as not measurable, never as met.
- **Alternatives:** build follow-up records here; keep iterating to the
  round-6 hand-back.
- **Reversibility:** high.
- **Source:** scratchpad S2, interview D3 and D4.

## DEC-3. AC6 waiver wording accepted as residual risk at the spec gate

- **Answered by:** agent
- **Decision:** A review waiver closes every unpassed boundary scope whose
  latest pair precedes it, as AC6 is written; a waive after a FAIL streak is
  attributed to the workflow's latest pair. An abandoned earlier scope in the
  same workflow reads as waived rather than open.
- **Alternatives:** amend the spec (round-6 hand-back).
- **Reversibility:** high.
- **Source:** scratchpad S3.

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
  that earlier reporting rows are never converted).
- **Reversibility:** high.
- **Source:** scratchpad S4, interview D8.

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
