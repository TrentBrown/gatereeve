# Decision Scratchpad - tb-review-honest-unavailability

**Feature start:** 2026-11-25

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

Each entry records **Answered by:** `human | agent`. Agent entries also record
their alternatives and **Reversibility:**; goal runs publish them on the PR.

## S1. Rigor "standard" maps to full

- **Answered by:** agent
- **Decision:** Issue #150 calls this PR "standard" rigor (vs "light" for
  #146). GateReeve offers only full or light, so the run is full, with a
  short design step because the human had already agreed scope.
- **Alternatives:** light (rejected: #150 distinguishes this PR from the light one).
- **Reversibility:** rigor cannot be lowered within a run.

## S2. Mandated autonomy

- **Answered by:** human
- **Decision:** At the design gate the human granted mandated autonomy for
  this work. After the pause the agent proposed the fixed mandate (deliver
  #140 as designed in one PR with `Closes #140`, and no merge without the
  human), and the human replied "Proceed".

## S3. Spec review took six rounds

- **Answered by:** human (round-6 choice); agent (fixes)
- **Decision:** Codex reviewed the spec in five rounds. Each FAILed with
  narrower, valid findings: rubric gaps, a sixth status, refused/provider-failed
  precedence, retry identity, attempt-level classification, and the
  `providerFailure` field. At the round-6 hand-back the human chose a sixth
  review, which PASSed. Implementation authority was then recorded as
  `autonomous-evaluator`, citing that PASS.
- **Friction:** the round-6 hand-back can only be recorded after round 6
  runs, so "continue" comes after the sixth review, not before it.

## S4. Classification follows the attempt that launched

- **Answered by:** agent
- **Decision:** Each reviewer runs as up to three attempts in one round:
  first, transient retry, repair. Each attempt records whether a reviewer
  launched (`reviewerLaunched` on results, `beforeAdmission` /
  `reviewerLaunched` on thrown errors). The row is `refused` only when no
  attempt launched.
- **Alternatives:** classify from the last attempt only. Rejected because a
  refused retry would hide a launched first attempt (spec review round 4).
- **Reversibility:** internal; the fields are additive.

## S5. Round count moved to the provider launch

- **Answered by:** agent
- **Decision:** `countReviewRound` now runs immediately before
  `independent()`, not before job admission. A packet-assembly refusal (for
  example planning lint) therefore charges no round.
- **Reversibility:** one-line move.

## S6. Repair turn already covered both providers (issue #140 scope 6)

- **Answered by:** agent
- **Decision:** No code change was needed. The stale PROTOCOL.md sentence
  ("Claude-only retry") was the source of the "anthropic only" report, and it
  is now corrected.
