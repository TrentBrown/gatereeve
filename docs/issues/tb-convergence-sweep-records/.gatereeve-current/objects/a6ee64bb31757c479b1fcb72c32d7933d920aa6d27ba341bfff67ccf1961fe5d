# Decisions - tb-convergence-sweep-records

Permanent decision records promoted from `scratchpad.md` at PR boundaries.

## DEC-1. Full rigor, goal autonomy

- **Answered by:** human (relayed by the coordinating thread)
- **Decision:** Full rigor with goal autonomy for the overnight work on #144.
  Planning decisions are `autonomous-evaluator` decisions citing independent
  planning reviews (design: Codex round 1 PASS; spec: Claude round 1 PASS with
  six low findings, Codex round 2 FAIL on two rubric gaps, Codex round 3 PASS).
- **Source:** scratchpad S1-S4.

## DEC-2. A fixed disposition is the implementer's claim, and it is required

- **Answered by:** agent
- **Decision:** Claims gain a required `disposition` (`fixed` or `disputed`);
  `fixed` requires a sweep record, `disputed` forbids one. Callers that send
  `{findingId, claim}` are refused naming `claims[i].disposition`.
- **Alternatives:** an optional label (lets the sweep be skipped); a reviewer
  disposition (reviewers verify, implementers claim).
- **Reversibility:** input contract; more disposition values can be added.
- **Source:** interview D1, D2.

## DEC-3. Swept class is the claimed finding's classId; records live in review inputs

- **Answered by:** agent
- **Decision:** A record takes `classId` from the claimed finding. Packets
  carry the open scope's records, read from earlier boundary-review inputs;
  a closed scope's records are not carried. A finding of a swept class other
  than the record's own finding is a regression of the previous fix in
  qualification; GateReeve never sets a reviewer's `blocking` flag. With two
  fixed claims in one class, the other claimed finding still present counts as
  a regression (S7).
- **Reversibility:** reversible.
- **Source:** interview D3-D5, scratchpad S7.

## DEC-4. #134 folded in, with a third change in execution.js

- **Answered by:** agent
- **Decision:** Re-reported IDs count as present in the peer prepass; rounds
  are grouped by the round policy's scope, round and revision; and a re-report
  keeps the raising review in the next round's history (`execution.js`),
  without which the origin was lost before qualification.
- **Reversibility:** reversible.
- **Source:** interview D6, scratchpad S5.

## DEC-5. Smaller implementation choices

- **Answered by:** agent
- **Decision:** `review.execute` refuses an invalid claim before either
  reviewer starts (S6); the rounds 4-5 band instruction names missed sites of a
  swept class; the `--claims` help text names the new fields (S8).
- **Reversibility:** reversible.
