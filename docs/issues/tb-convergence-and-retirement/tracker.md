# Branch Tracker - tb-convergence-and-retirement

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-11-22

## Rubric Status

| # | Criterion (short) | Status | Review | Notes |
|---|-------------------|--------|----|-------|
| R1 | AC1 idle lock | IMPLEMENTED | - | local-agent-idle-inhibitor.test.js (wrap, fallbacks, stdin, exit code, size guard, timeout, live lock list and release, receipt) |
| R2 | AC2 metrics repair | IMPLEMENTED | - | metrics-repair.test.js (isolation, purge, capture conflicts, status counts, decision.ask, human wait, scratch file counts, stranded, report retention); live store copy: purge 49,236 fixture rows, capture succeeds |
| R3 | AC3 severity and class | TODO | - | slice 3 |
| R4 | AC4 sweep records | TODO | - | slice 3 |
| R5 | AC5 robustness | TODO | - | slice 3 |
| R6 | AC6 round policy | TODO | - | slice 4 |
| R7 | AC7 follow-ups | TODO | - | slice 4 |
| R8 | AC8 failure model | TODO | - | slice 4 |
| R9 | AC9 CI after convergence | TODO | - | slice 5 |
| R10 | AC10 sweep | TODO | - | slice 6 |
| R11 | AC11 measurement and surfaces | TODO | - | slices 3–5 |

## Review Log

Append pull-request review boundary entries here.
