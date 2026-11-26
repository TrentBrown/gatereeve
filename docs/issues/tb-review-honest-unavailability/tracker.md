# Branch Tracker - tb-review-honest-unavailability

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-11-25

## Rubric Status

| # | Criterion (short) | Status | Review | Notes |
|---|-------------------|--------|----|-------|
| R1 | Fail fast on verification | DONE | pending paired review | current-boundary-review.test.js: no/FAIL/UNAVAILABLE verification refusals, same operationId retry, individual review refusal |
| R2 | Distinct outcome statuses | DONE | pending paired review | current-boundary-review.test.js: status classes, refused (packet, claim, dial change), outcomeStatus unit cases; round-policy.test.js legacy statuses |
| R3 | Rounds count only when a reviewer ran | DONE | pending paired review | current-boundary-review.test.js refused rounds; round-policy.test.js all-refused projection and replay |
| R4 | One transient retry | DONE | pending paired review | current-boundary-review.test.js: retry per provider, second transient, timeout/auth, retry+repair, refused retry, repair timeout, providerFailure category |
| R5 | Repair turn for both providers | DONE | pending paired review | existing per-provider repair tests plus retry+repair test |
| R6 | Rejections name the field or ID | DONE | pending paired review | reviewer-contract.test.js message tests; claim message in current-boundary-review.test.js |
| R7 | Documentation | DONE | pending paired review | PROTOCOL.md Paired review outcomes, review.execute row, round policy, repair sentence; desktop mirror diff |
| R8 | Measurement recorded | DONE | pending paired review | interview.md Evidence base |

## Review Log

Append pull-request review boundary entries here.
