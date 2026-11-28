# Branch Tracker - tb-follow-up-records

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-11-27

## Rubric Status

| # | Criterion (short) | Status | Review | Notes |
|---|-------------------|--------|----|-------|
| R1 | Review follow-ups | DONE | pending paired review | follow-ups.test.js: reasons, origin, waived/adjudicated, regression path, swept site, latest blocking, routing, fixed/unsupported/peer/reopen |
| R2 | Non-review origins | DONE | pending paired review | follow-ups.test.js: synthetic dependency-scan origin, dedup, returned IDs, refusals |
| R3 | Decisions | DONE | pending paired review | follow-ups.test.js: IDs, select, supersession, policy skip, 8 refusals, bulk failure + retry |
| R4 | Authority and defaults | DONE | pending paired review | follow-ups.test.js: defaults table; supervised/delegated/mandated/goal authority |
| R5 | Filing new work | DONE | pending paired review | follow-ups.test.js: gh stub create/reuse/seed/failure, redaction incl. followUpRedactions, own-name rule |
| R6 | Enforcement | DONE | pending paired review | follow-ups.test.js: completion, release merge, goal park/ready, stale ready, status, light, unmarked, unreadable |
| R7 | Generated view | DONE | pending paired review | follow-ups.test.js: follow-ups.md sections and record details |
| R8 | PR surface | DONE | pending paired review | follow-ups.test.js: review.publish lists every follow-up; none statement |
| R9 | Metrics measure 2 | DONE | pending paired review | follow-ups-metrics.test.js + convergence-metrics.test.js: projection v3, follow-up rows, reopen, measure 2/3, Completion list |
| R10 | CLI | DONE | pending paired review | follow-ups.test.js: CLI list/decide/render |
| R11 | Documentation | DONE | pending paired review | PROTOCOL.md, USER-GUIDE.md, PERFORMANCE.md, cli/README.md, goal skill, completion-recovery, WORKFLOW.md; mirror identical |

## Review Log

Append pull-request review boundary entries here.
