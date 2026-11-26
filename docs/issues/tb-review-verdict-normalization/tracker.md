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
