# Branch Tracker - tb-review-verdict-normalization

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-11-26

## Rubric Status

| # | Criterion (short) | Status | Review | Notes |
|---|-------------------|--------|----|-------|
| R1 | Prose unwrap | DONE | pending paired review | verdict-normalization.test.js (candidates, Claude parser, both adapters with/without hook); current-boundary-review.test.js two-gate execution |
| R2 | Unknown properties stripped | DONE | pending paired review | verdict-normalization.test.js strip paths and missing-required; two-gate test envelope extra |
| R3 | PASS with a blocking finding is FAIL | DONE | pending paired review | verdict-normalization.test.js current/earlier blocking (rated, unrated), low stays PASS; reviewer-contract.test.js |
| R4 | Format repair | DONE | pending paired review | verdict-normalization.test.js repair supplies disposition, FAIL allowances, substance rejections |
| R5 | `present` for non-blocking findings | DONE | pending paired review | verdict-normalization.test.js M1 (blocking false) and L1 (blocking, low) |
| R6 | Stale IDs dropped | DONE | pending paired review | verdict-normalization.test.js undisclosed disposition; current-boundary-review.test.js paired and individual stale claims |
| R7 | Meaning goes to repair | DONE | pending paired review | verdict-normalization.test.js meaning cases with paths and rules; current-boundary-review.test.js missing blocking repair turn |
| R8 | Counts | DONE | pending paired review | verdict-normalization.test.js rejection rules; current-measurement.test.js per-rule counts 2/1 and rejection 1 |
| R9 | Tally fixtures | DONE | pending paired review | verdict-normalization.test.js tally fixtures (tally: ...) |
| R10 | Documentation and guidance | DONE | pending paired review | PROTOCOL.md rule table, repair allowance, corrected affected/disposition sentence; commands/pr-review.md; desktop mirror restaged |

## Review Log

Append pull-request review boundary entries here.
- 2026-11-26 boundary round 1 (FEATURE, head 9853bbd): codex PASS; claude-code
  FAIL with one medium finding `claude-code/R-141-1` (a low-only FAIL that marks
  an earlier blocking finding present recorded phantom `pass-with-blocking-finding`
  and `low-only-fail` rows). Fixed: the low-only re-check is accepted only when
  it yields PASS; test in `reviewer-contract.test.js`.
- 2026-11-26 boundary round 2 (head c15babb): claude-code PASS (R-141-1
  resolved); codex FAIL with one high finding `codex/review/R-141-2` (a stale
  claim on an otherwise reusable review reused the old result without
  recording `claim-not-retained`). Fixed: dropped claims are part of the reuse
  comparison, so the reviewer runs; test in `current-boundary-review.test.js`.
