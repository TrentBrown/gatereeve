# Interview - tb-review-honest-unavailability

**Feature start:** 2026-11-25
**Status:** concluded 2026-11-25

Short design step. The human agreed scope and order for this PR in the
coordinating thread (tracking issue #150); GitHub issue #140 is the design
input. Entries below record what was settled from the issue, the source, and
a re-measurement, plus the few choices the issue left open.

Each entry: **Question** / **Answer** / **Answered by:** `human | agent` /
**Decision**.

## Evidence base: re-measurement (issue #140 step 1)

Measured 2026-11-25, read-only, from every local run store's retained objects
(28 stores) and every local run archive (7, parsed in memory). Plugin versions
are attributed by the result's completion time against release tag dates, since
run stores do not record the plugin version; treat the split as approximate.

**Review results:** 219, of which 75 (34%) UNAVAILABLE.

| Cause | Count | Versions |
| --- | --- | --- |
| Verdict rejected by bookkeeping/semantic contract (dispositions, claims, PASS with present blocking finding, format repair) | 30 | rc.30, rc.31 |
| Reviewer chose UNAVAILABLE (could not assess: missing evidence or post-merge criteria) | 15 | rc.26–rc.33 |
| Provider failure (11 transient service failures, 1 unsupported model) | 12 | rc.26, rc.30 |
| Malformed JSON | 8 | rc.30, rc.31 |
| Schema shape (missing or extra field) | 8 | rc.30, rc.31 |
| Run-level precondition recorded as a result (planning lint: tracker names an unknown criterion; no reviewer launched) | 2 | rc.33 |

| Version | Results | UNAVAILABLE |
| --- | --- | --- |
| rc.26 | 34 | 3 |
| rc.29 | 16 | 1 |
| rc.30 | 63 | 25 |
| rc.31 | 98 | 43 |
| rc.33 | 8 | 3 |

**Rounds that wrote no reviewer result** (from run-store event logs, which
only the newer stores have): 2 `BOUNDARY_REVIEWED` events (4 provider outcomes)
recorded every provider `unavailable` although no reviewer ran:

- rc.31: "Disposition claim lacks a retained finding" (an implementer claim
  named an ID GateReeve no longer held).
- rc.33: "This assessment requires actual applicable verification evidence"
  (no verification result yet). Both counted a review round.

**Still occurring on rc.33.** rc.33 has only 8 results, too few to rate
frequencies. Every rejection message in the table above is still present in
the rc.33 source (and `main` is identical to rc.33 for the four files this
change edits), so each cause remains reachable. Observed on rc.33: the
verification precondition refusal, the planning-lint precondition recorded as
results, and one reviewer-chosen UNAVAILABLE.

## Entries

### D1. Fail fast on the verification precondition

**Question:** Where is the verification requirement checked, and what does a
missing one produce?
**Answer:** `review.execute` resolves the consumed proof once, before
`REVIEW_ROUND_STARTED` and before fanning out, using the same resolution the
per-reviewer path uses (supplied `consumed`, else the latest current passing
verification). Missing or non-passing proof refuses the operation with
`VERIFICATION_REQUIRED`, naming `candidate.prepare` → `gate.execute
["verification"]` → `review.execute`. Nothing is appended, so the same
`operationId` can be retried after verification. The individual
`gate.execute ["review"]` path gives the same code and message.
**Answered by:** human (issue #140 scope 2, agreed in the coordinating thread)
**Decision:** As stated.

### D2. Outcome statuses on `BOUNDARY_REVIEWED`

**Question:** How do the distinct statuses appear?
**Answer:** Each provider outcome's `status` is one of:
`completed` (validated PASS/FAIL), `refused` (precondition: the reviewer was
never launched), `provider-failed` (transient, timeout, authentication,
configuration), `verdict-rejected` (contract, malformed JSON or schema), and
`could-not-assess` (the reviewer itself returned UNAVAILABLE). Rows with a
result keep `results`; every non-completed row carries `reason`. Events written
before this change keep their `completed`/`unavailable` values and are read as
before. The result-level `unavailableReason` codes are unchanged.
**Answered by:** agent (shape within issue #140 scope 4)
**Decision:** As stated.

### D3. Which rounds count

**Question:** When does a round count?
**Answer:** A round counts when at least one reviewer was launched, even if it
then failed. The per-reviewer count moves from before job admission to just
before the provider is launched, so a packet-assembly precondition failure
(for example planning lint) does not count. The `BOUNDARY_REVIEWED` projection
skips counting only when every outcome is `refused`; old events keep counting
as before, so replaying an existing run never changes its counter.
**Answered by:** agent (issue #140 scope 3; replay stability chosen to avoid
re-banding retained proof)
**Decision:** As stated.

### D4. Transient provider retry

**Question:** Which provider failures are retried automatically, and how often?
**Answer:** Once per reviewer per round, only for the
`transient-service-failure` category (rate limit, 429/5xx, temporary,
connection reset). Timeouts, authentication, credit, unsupported model and
configuration failures are not retried: they are unlikely to clear within
seconds, and a timed-out review would double the round's wall time. The retry
shares the round baseline, like the repair turn, so it is not a new round. A
retried reviewer that then returns an invalid verdict still gets its repair
turn.
**Answered by:** agent (issue #140 scope 5 says "transient")
**Decision:** As stated.

### D5. Repair turn for both providers

**Question:** Does the repair turn need extending to Codex?
**Answer:** No change needed. In rc.33 `boundary-review.js` already offers the
single repair turn to either provider, and
`cli/test/current-boundary-review.test.js` tests it for both `codex` and
`claude-code`. The handoff's "anthropic only" description predates that. This
PR keeps the existing tests and adds one combined with the transient retry.
**Answered by:** agent (observed in source and tests)
**Decision:** Scope 6 is satisfied by existing behavior; no code change.

### D6. Rejection messages name the field or ID

**Question:** How far do message changes go?
**Answer:** Text only, no semantic change (semantics are #141's). Each
rejection keeps its current leading sentence, so existing matches still work,
and appends the offending field path (for example `verdicts[0].criteria[2]`)
or finding/claim ID. A claimed finding without a supported disposition says
"your claim about <id> needs a resolved, unsupported, unaffected or
present-low disposition".
**Answered by:** human (issue #140 scope 7); format chosen by agent
**Decision:** As stated.
