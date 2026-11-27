# Branch Tracker - tb-metrics-remainder

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-11-27

## Rubric Status

| # | Criterion (short) | Status | Review | Notes |
|---|-------------------|--------|----|-------|
| R1 | Finding fields | DONE | pending paired review | convergence-metrics.test.js R1 |
| R2 | Reviewer result fields | DONE | pending paired review | R2 |
| R3 | Round and pair rows | DONE | pending paired review | R3 (incl. unreadable result, retired status) |
| R4 | Validation | DONE | pending paired review | R4 |
| R5 | Reprojection | DONE | pending paired review | R5 (earlier rows unconverted, S4) |
| R6 | Measure 1 | DONE | pending paired review | R6 |
| R7 | Measure 2 | DONE | pending paired review | R7 |
| R8 | Measure 3 | DONE | pending paired review | R8 |
| R9 | Measure 4 | DONE | pending paired review | R9 |
| R10 | Per-reviewer table | DONE | pending paired review | R10 |
| R11 | Not recorded is not zero | DONE | pending paired review | R11 (incl. uncounted pairs) |
| R12 | CLI | DONE | pending paired review | R12 (CLI, filters, dataset, reevaluation HTML, MCP) |
| R13 | Desktop | DONE | pending paired review | desktop ipc.test.js, metrics-view.test.js |
| R14 | Documentation | DONE | pending paired review | USER-GUIDE, PERFORMANCE, PROTOCOL, cli/README; mirror restaged |

## Review Log

Append pull-request review boundary entries here.

- 2026-11-27 boundary round 1 (head 3b5460b): Codex FAIL, Claude FAIL; 12 findings fixed in b52be14 and 35271d4.
- 2026-11-27 boundary round 2 (head 35271d4): Claude PASS (one low note on AC6 text); Codex FAIL on the #148 dependency and the AC6 text. Hosted CI run 45990995350 passed. Parked on PR #169.
- 2026-11-27 Trent: "Confirm #148 + amend AC6"; spec amendment A1/A2 recorded, rounds restart.
