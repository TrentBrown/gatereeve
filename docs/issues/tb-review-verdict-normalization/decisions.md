# Decisions - tb-review-verdict-normalization

Permanent decision records promoted from `scratchpad.md` at PR boundaries.

## DEC-1. Full rigor, goal autonomy

- **Answered by:** human
- **Decision:** Full rigor (issue #150's "standard" maps to full). At the design
  gate Trent approved the design and granted goal autonomy ("Approved. I now
  grant you goal autonomy to complete this work."). Later planning decisions
  are `autonomous-evaluator` decisions citing independent planning reviews.
- **Source:** scratchpad S1.

## DEC-2. PR #152 outcome-row leftover deferred

- **Answered by:** agent
- **Decision:** Not in this PR. Spec review round 1 (high) found it outside the
  mandate's "keep the change focused on #141's scope"; the design was revised
  (Changes) and re-approved after design review round 2 PASS.
- **Alternatives:** keep it under the coordinating thread's fold-in permission
  (rejected: not part of the recorded mandate).
- **Reversibility:** fully reversible; its own small PR.
- **Source:** scratchpad S2, S4.

## DEC-3. "Blocks" means blocking and not low

- **Answered by:** agent
- **Decision:** An earlier finding blocks when `blocking: true` and its severity
  is not low (`findingBlocks`). `present` for a low earlier finding is the
  `present-non-blocking` case, not a FAIL.
- **Reversibility:** wording and one predicate.
- **Source:** scratchpad S3.

## DEC-4. Unwrap only where it is recorded

- **Answered by:** agent
- **Decision:** The adapter parser unwraps prose only when the caller passes a
  recording hook (`runStage` `onNormalized`). Only the review-gate execution
  does; planning reviews and analysis parse as before. Keeps the strict
  stage-result shape and guarantees no unrecorded correction (design review
  round 1, high).
- **Alternatives:** a `normalized` field on the stage result (rejected: breaks
  the strict shape for other callers).
- **Reversibility:** additive hook.
- **Source:** scratchpad S4, design Changes.

## DEC-5. Measurement for reviewers

- **Answered by:** agent
- **Decision:** The boundary review packet does not include `interview.md`, so
  the re-tally is reproduced here verbatim.

### Evidence base: re-tally of retained results (2026-11-26)

Read-only scan of every local run store's retained `result` objects (52 stores,
396 review/code/spec/judge results, 88 UNAVAILABLE). Stores deleted since the
PR #152 measurement are not included, so the rc.30/rc.31 bookkeeping cases are
under-represented; that measurement's table (PR #152 `decisions.md` DEC-8)
remains the priority order. Classes that #141 targets, as seen here:

| Class (rejection message) | Seen | Handling in this PR |
| --- | --- | --- |
| Unsupported model / configuration / authentication | 20 | Out of scope (provider configuration) |
| `Missing supported disposition for <id>` on a PASS (implementer claims the reviewer left undisposed) | 5 | Repair turn; the repair may now supply the omitted disposition |
| `Substantive assessment changes are not format repair` (the repair added the missing disposition) | 2 | Accepted: supplying an omitted disposition is format repair |
| `findings[0].blocking is required` (old-contract shape) | 3 | Repair turn with the field path (meaning, never guessed) |
| `Claude Code structured output returned malformed JSON` | 4 | Unwrap a single JSON object from prose; raw output was not retained, so fixtures are synthetic |
| `<field> is not allowed` (unknown extra property) | 1 | Stripped and recorded |
| `Assessment PASS contradicts criterion outcomes` (a criterion UNAVAILABLE on a PASS) | 1 | Repair turn with the criterion path (meaning) |
| `Finding must name source in scope` | 1 | Unchanged (repair turn) |
| Reviewer chose UNAVAILABLE, missing evidence | many | Out of scope (#142, #143) |

PR #152's measurement (219 results) attributed 30 rejections to bookkeeping
("PASS contradicts a present blocking finding" 7, missing disposition, undisclosed
disposition IDs, open finding carried as unaffected, format repair), 8 to
malformed JSON and 8 to schema shape.

