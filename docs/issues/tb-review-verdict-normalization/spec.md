# Spec - tb-review-verdict-normalization

**Feature:** `tb-review-verdict-normalization`
**Created:** 2026-11-26
**Issue:** #141 (tracking #150)
**Design:** [`design.md`](design.md) (approved 2026-11-26), [`interview.md`](interview.md) D1–D10

## Summary

GateReeve corrects a reviewer verdict automatically only where the answer
follows from the verdict itself, and records each correction with its rule.
Meaning-changing gaps go to the single repair turn with the exact field path,
and the repair turn can supply what it was asked for. Rejections and
corrections are counted per rule in the metrics store.

Out of scope: #154 and the PR #152 outcome-row reference leftover
(interview D10, design Changes).

## Definition of Done

The global Definition of Done in the software development workflow applies.
In addition: the CLI test suite passes, and the desktop protocol mirror is
byte-identical to `plugin-src/shared/resources/protocol`.

## Acceptance Criteria

- **AC1. Prose unwrap.** When a review-gate execution's structured output
  (Codex output file, Claude structured or text result) is not valid JSON as a
  whole but contains exactly one balanced top-level JSON object, that object
  is used and every result of the execution records a normalization with rule
  `prose-unwrapped`. With no such object, or with more than one, the output is
  rejected as malformed JSON (`unavailableReason: malformed-json`), as today.
  Only a caller that records the correction gets the unwrap: planning reviews
  and analysis, which have no recording path, parse exactly as today and treat
  such output as malformed JSON.
- **AC2. Unknown properties stripped.** A property the verdict schema does not
  define, at any object level of a verdict or in the `{verdicts}` envelope, is
  removed before validation and recorded with rule `unknown-property` and its
  field path. The verdict is then validated as if the property were absent.
  Missing required properties, wrong types and invalid enum values are not
  stripped: they reach the repair turn with the field path.
- **AC3. PASS with a blocking finding is FAIL.** A PASS verdict that reports a
  blocking finding whose severity is not low, or a `present` disposition for an
  earlier finding that blocks (`blocking: true` and severity not low; an
  earlier-contract finding without severity blocks as recorded), is recorded
  as FAIL with rule
  `pass-with-blocking-finding`, naming the finding IDs and the original
  outcome. It is never rejected for that contradiction. A PASS whose only
  blocking findings are low, current or earlier, stays PASS (low never
  blocks); `present` for a low earlier finding is handled by AC5.
- **AC4. Format repair.** A repair turn is accepted when (a) it returns FAIL
  where the original PASS reported a blocking finding as in AC3, (b) it
  supplies a disposition for an ID the original verdict omitted, or (c) both:
  it returns FAIL where the original said PASS because a disposition it
  supplied for an omitted ID marks an earlier blocking finding `present`. A repair that
  keeps a PASS with a blocking finding is recorded as FAIL by AC3. Every other
  substance check of format repair is unchanged: in particular a stated
  disposition cannot change status, and any other outcome change is rejected.
- **AC5. `present` for non-blocking findings.** On a PASS, a required
  (claimed) earlier finding that does not block (`blocking: false`, or low
  severity) may carry the `present`
  disposition. The verdict is accepted and the disposition recorded with rule
  `present-non-blocking`.
- **AC6. Stale IDs dropped.** On the consolidated review gate, a disposition
  naming an ID disclosed nowhere (not in supplied history, claims or the
  verdict's own findings) is dropped and recorded with rule
  `disposition-not-disclosed`. An implementer claim naming a finding that no
  retained review reports is dropped before the reviewer starts, recorded with
  rule `claim-not-retained` on every result of that execution, and the
  reviewer runs without it. Neither fails the round.
- **AC7. Meaning goes to repair.** The following stay contract errors that
  trigger the repair turn, and each names the exact field path to repair, plus
  the finding or criterion ID where one exists: a missing or invalid required
  verdict field (`review.findings[0].blocking`); a missing supported
  disposition for an open or claimed finding on a PASS (`dispositions`, with
  the finding ID, or `dispositions[i]` when a row with the wrong status
  exists); an open finding carried as `unaffected` (`dispositions[i]`); a PASS
  with a criterion that is not PASS (`criteria[i]`); a duplicate disposition
  with a different status (`dispositions[i]` and the row it repeats).
  GateReeve never fills these values itself.
- **AC8. Counts.** Every UNAVAILABLE result rejected by the verdict contract
  records a stable `rejectionRule`. The metrics projection writes, for each
  review result, one observation per normalization rule with its count, and
  one per rejection rule, so the metrics store holds per-rule normalization
  and rejection counts.
- **AC9. Tally fixtures.** For each tally class this change targets (PASS with
  a present blocking finding, `present` for a claimed advisory finding,
  undisclosed disposition, stale claim, extra property, prose-wrapped JSON,
  repair supplying a missing disposition, repair after a PASS with a blocking
  finding), a fixture shaped like the retained case produces a validated
  PASS or FAIL, not UNAVAILABLE. Where AC1–AC6 name a rule for the class, the
  rule is recorded; the two repair classes are accepted by `validateFormatRepair`
  and record no normalization (the reviewer, not GateReeve, supplied the
  value). Fixtures for the meaning-changing classes (missing `blocking`,
  missing disposition) reach the repair turn, and a repair that supplies the
  value is accepted.
- **AC10. Documentation and guidance.** `PROTOCOL.md` documents the rules
  above, the format-repair allowance and the counts, and its statement about
  disclosed-but-not-required disposition IDs matches the code. The review
  command guidance tells the implementer to claim only findings it changed.


## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Prose unwrap (AC1) | Tests show one object inside prose is used, reported through the `onNormalized` hook, and recorded as `prose-unwrapped` on every result of an execution that requests two gates, for both the Codex and the Claude parsing paths; no object or two objects stay `malformed-json`; and an adapter call without the hook (as planning reviews and analysis make) rejects the same prose-wrapped output as malformed JSON with an unchanged stage-result shape | Any Pass condition is unmet or untested | `cli/test/local-agent-adapters.test.js`, `cli/test/verdict-normalization.test.js` |
| R2 | Unknown properties stripped (AC2) | Tests show extra properties at verdict, nested-row and envelope level are removed and recorded with their field paths, and that a missing required field is not stripped but reaches repair with its path | Any Pass condition is unmet or untested | `cli/test/verdict-normalization.test.js` |
| R3 | PASS with a blocking finding is FAIL (AC3) | Tests show a PASS with a blocking non-low finding, and a PASS with `present` for an earlier blocking non-low finding (rated and unrated), are each recorded as FAIL with the rule, IDs and original outcome; a PASS whose only blocking findings are low, and a PASS with `present` for an earlier finding marked blocking but rated low, stay PASS | Any Pass condition is unmet or untested | `cli/test/verdict-normalization.test.js`, `cli/test/reviewer-contract.test.js` |
| R4 | Format repair (AC4) | Tests show a repair returning FAIL after a PASS with a blocking finding, a repair supplying an omitted disposition, and a repair returning FAIL because its supplied disposition marks an earlier blocking finding `present`, are each accepted; a repair changing a stated disposition or any other outcome is still rejected | Any Pass condition is unmet or untested | `cli/test/verdict-normalization.test.js`, `cli/test/reviewer-contract.test.js` |
| R5 | `present` for non-blocking findings (AC5) | Tests show a PASS with `present` for a claimed earlier finding is accepted with the `present-non-blocking` record both when that finding has `blocking: false` and when it is marked blocking but rated low | Any Pass condition is unmet or untested | `cli/test/verdict-normalization.test.js` |
| R6 | Stale IDs dropped (AC6) | Tests show an undisclosed review disposition is dropped with its record; a paired review with a stale claim runs both reviewers, excludes the claim from each packet and records `claim-not-retained` on every result of each reviewer's execution; and an individual review with a stale claim does the same for its result | Any Pass condition is unmet or untested | `cli/test/verdict-normalization.test.js`, `cli/test/current-boundary-review.test.js` |
| R7 | Meaning goes to repair (AC7) | Tests show each listed case is a contract error naming the exact field path stated in AC7 (and the ID where one exists), and that a paired round sends it to the repair turn | Any Pass condition is unmet or untested | `cli/test/verdict-normalization.test.js`, `cli/test/current-boundary-review.test.js` |
| R8 | Counts (AC8) | Tests show contract rejections carry the expected `rejectionRule`; for a review result where one rule applied twice and another once, the metrics projection stores one observation per rule with `count` 2 and 1; and a rejected result stores one `verdict-rejection` observation with its rule and `count` 1 | Any Pass condition is unmet or untested | `cli/test/verdict-normalization.test.js`, `cli/test/current-measurement.test.js` |
| R9 | Tally fixtures (AC9) | One fixture per listed class produces PASS or FAIL as AC9 states, with the AC1–AC6 rule recorded where one applies, and the two repair classes accepted without a normalization record | Any Pass condition is unmet or untested | `cli/test/verdict-normalization.test.js` |
| R10 | Documentation and guidance (AC10) | `PROTOCOL.md` and `commands/pr-review.md` contain the stated content; the desktop mirror matches the source byte for byte | Any Pass condition is unmet | `plugin-src/shared/resources/PROTOCOL.md`, `plugin-src/shared/resources/commands/pr-review.md`, mirror diff |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.
