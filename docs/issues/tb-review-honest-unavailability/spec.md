# Spec - tb-review-honest-unavailability

**Feature:** `tb-review-honest-unavailability`
**Created:** 2026-11-25
**Issue:** #140 (tracking #150)
**Design:** [`design.md`](design.md) (approved 2026-11-25), [`interview.md`](interview.md) D1–D6

## Summary

A paired boundary review reports only what happened. When a precondition
fails before any reviewer runs, `review.execute` refuses the operation or
records a `refused` outcome, and no round is charged. A reviewer that ran and
failed is reported by cause and still counts. A transient provider failure is
retried once, and every rejection names the field or ID to fix.

## Definition of Done

The global Definition of Done in the software development workflow applies.
In addition: the CLI test suite passes, and the desktop protocol mirror is
byte-identical to `plugin-src/shared/resources/protocol`.

## Acceptance Criteria

- **AC1. Fail fast on verification.** When verification is missing or not
  passing (no current verification result, or the latest current one is FAIL
  or UNAVAILABLE), `review.execute` refuses with error code
  `VERIFICATION_REQUIRED`. The message names the order `candidate.prepare` →
  `gate.execute ["verification"]` → `review.execute`. The refusal appends no
  event at all (in particular no `REVIEW_ROUND_STARTED` or
  `BOUNDARY_REVIEWED`), records no `unavailable` outcome, starts no reviewer,
  and counts no round. Retrying the same `operationId` after a passing
  verification succeeds. An individual `gate.execute ["review"]` without
  verification refuses with the same code, likewise appending no event and
  counting no round.
- **AC2. Distinct outcome statuses.** Each new `BOUNDARY_REVIEWED` provider
  outcome has status `completed`, `refused`, `provider-failed`,
  `verdict-rejected` or `could-not-assess`, and no other. `refused` takes
  precedence: any execution that launched no reviewer is `refused`, whatever
  else happened. Otherwise statuses are assigned as follows:
  - `completed`: the reviewer returned a validated PASS or FAIL.
  - `refused`: this execution launched no reviewer. Either a precondition
    stopped it before its provider launched, or an earlier execution of the
    same job is uncertain or already claimed, so this one did not run it.
  - `provider-failed`: the provider failed (`provider-error`, `timeout` or
    `other`), or the execution failed after the reviewer's provider launched.
  - `verdict-rejected`: the verdict failed the contract, JSON or schema
    (`contract` or `malformed-json`).
  - `could-not-assess`: the reviewer itself returned UNAVAILABLE
    (`missing-evidence`).

  A row describes the reviewer across all its attempts in the round (first
  attempt, transient retry, repair turn). It is `refused` only when no attempt
  launched a reviewer. Otherwise it is classified from the latest attempt that
  launched one, so a later attempt refused before launch never hides an
  earlier launched attempt. Rows with results keep their `results`
  references. Every row that is not `completed` carries a `reason`. Events recorded before this change are read
  with their original statuses and results unchanged.
- **AC3. Rounds count only when a reviewer ran.** A paired review whose
  outcomes are all `refused` counts no round. This includes a refusal raised
  while the review packet is assembled, such as planning lint. A round in which
  at least one reviewer's provider launched still counts, even when that
  reviewer then failed. Replaying events recorded before this change gives the
  same round counters as before.
- **AC4. One transient retry.** Every UNAVAILABLE result from a provider
  failure records the failure category as `providerFailure: {category}`. A
  reviewer whose provider fails with category
  `transient-service-failure` is re-executed automatically once in the same
  round. The retry runs under its own operation identity, distinct from the
  first attempt and from the repair turn, on the same round baseline, and no
  new round is counted. A second transient
  failure is reported as `provider-failed`. A successful retry supplies the
  outcome: the row is classified from the retry's result and references it. A timeout or a non-transient
  provider failure is not retried. A retried reviewer whose verdict is then
  rejected by the contract still receives its single repair turn.
- **AC5. Repair turn for both providers.** The single automatic repair turn is
  offered to both the `codex` and the `claude-code` reviewer, at most once per
  reviewer per round.
- **AC6. Rejections name the field or ID.** Every verdict rejection this change
  touches keeps its current leading sentence and appends the offending field
  path (for example `criteria[2]`) or finding/claim ID. The touched rejections
  are: PASS with a present blocking finding, an undisclosed disposition ID,
  finding source out of scope, a blocking finding without an approved
  criterion, a missing supported disposition, the format-repair preservation
  checks, and a claim without a retained finding. A finding claimed by the
  implementer that lacks a supported disposition on PASS says "your claim
  about <id> needs a resolved, unsupported, unaffected or present-low
  disposition".
- **AC7. Documentation.** `PROTOCOL.md` documents the following:
  - the `VERIFICATION_REQUIRED` refusal and the order it names;
  - the outcome statuses;
  - when a round counts;
  - the transient retry.

  The stale statement that format retry is Claude-only is corrected.
- **AC8. Measurement recorded.** The feature docs record the re-measured
  UNAVAILABLE tally across local run stores and archives, broken down by
  cause and plugin version, and state which causes remain reachable on rc.33.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Fail fast on verification (AC1) | Protocol tests show all of the following. <br>• `review.execute` with no verification refuses with `VERIFICATION_REQUIRED` naming the order, appends no event, starts no reviewer and counts no round. <br>• `review.execute` whose latest verification is FAIL, and one whose latest verification is UNAVAILABLE, each refuse the same way. <br>• Retrying the identical refused `operationId` after a passing verification completes the review. <br>• `gate.execute ["review"]` with no verification refuses with the same code, appends no event and counts no round | Any Pass condition is unmet or untested | `cli/test/current-boundary-review.test.js` |
| R2 | Distinct outcome statuses (AC2) | Tests show each of the following: <br>• `completed`, `refused`, `provider-failed`, `verdict-rejected` and `could-not-assess` are each assigned as AC2 states, including `refused` for an uncertain or already-claimed execution; <br>• new events use no other status; <br>• every non-completed row has a `reason`; <br>• rows with results keep their exact `results` references; <br>• a pre-change event's statuses and results are read unchanged | Any Pass condition is unmet or untested | `cli/test/current-boundary-review.test.js` |
| R3 | Rounds count only when a reviewer ran (AC3) | Tests show each of the following: <br>• an all-`refused` paired round counts no round, including a packet-assembly refusal; <br>• an individual review refused before provider launch counts no round; <br>• a round in which a reviewer launched and then failed counts; <br>• pre-change events replay to the same counters | Any Pass condition is unmet or untested | `cli/test/current-boundary-review.test.js`, `cli/test/round-policy.test.js` |
| R4 | One transient retry (AC4) | Tests show each of the following: <br>• exactly one automatic retry for `transient-service-failure`, under an operation identity distinct from the first attempt and the repair, on the same baseline, with no new round counted; <br>• a successful retry ends `completed` and references the retry's validated result; <br>• `provider-failed` after a second transient failure; <br>• no retry for timeout or non-transient failures; <br>• provider-failure results record `providerFailure.category`; <br>• exactly one repair turn after a retried rejected verdict, ending `verdict-rejected` when the repair also returns a rejected verdict and `provider-failed` when the repair's provider fails; <br>• a retry or repair refused before launch, after an earlier attempt launched, leaves the row classified from the launched attempt (never `refused`), and the round counts | Any Pass condition is unmet or untested | `cli/test/current-boundary-review.test.js` |
| R5 | Repair turn for both providers (AC5) | Tests exercise the repair turn for both `codex` and `claude-code` and show each gets exactly one repair turn | Any Pass condition is unmet or untested | `cli/test/current-boundary-review.test.js` |
| R6 | Rejections name the field or ID (AC6) | Tests show each touched rejection names its field path or finding/claim ID and keeps its original leading sentence, and the claimed-finding rejection uses the stated claim wording | Any Pass condition is unmet or untested | `cli/test/reviewer-contract.test.js`, `cli/test/current-boundary-review.test.js` |
| R7 | Documentation (AC7) | `PROTOCOL.md` covers the refusal and its order, the statuses, round counting and the retry. It no longer says retry is Claude-only. The desktop mirror matches the source byte for byte | Any Pass condition is unmet | `plugin-src/shared/resources/PROTOCOL.md`, mirror diff |
| R8 | Measurement recorded (AC8) | `interview.md` records the tally by cause and by version, and the rc.33 reachability statement | Any Pass condition is unmet | `docs/issues/tb-review-honest-unavailability/interview.md` |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.
