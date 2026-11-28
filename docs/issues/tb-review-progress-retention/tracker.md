# Branch Tracker - tb-review-progress-retention

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-11-27

## Rubric Status

| # | Criterion (short) | Status | Review | Notes |
|---|-------------------|--------|----|-------|
| R1 | Claude stream-json | DONE | boundary rounds 1-3 | local-agent-adapters.test.js args, last result event, malformed stream; live receipt runs the installed Claude Code with stream-json, --verbose and --json-schema; three live boundary rounds ran on it |
| R2 | Progress log | DONE | boundary rounds 1-3 | review-activity.test.js mid-run file contents, trailer on its own line, pruning, refused planning review trailer |
| R3 | Activity retention | DONE | boundary rounds 1-3 | review-activity.test.js paired round, five failure endings, pre-launch refusal, planning success and failed attempt |
| R4 | Reconstruction | DONE | boundary rounds 1-3 | review-activity.test.js rebuild after deleting progress and views, mixed stream, corrupt and missing objects, CLI read activity |
| R5 | Independence | DONE | boundary rounds 1-3 | review-activity.test.js peer view during a live pair and later-round view and packet carry no progress or activity bytes |
| R6 | Watch | DONE | boundary rounds 1-3 | review-activity.test.js selection, states, bounds, header-less journal job, writes nothing; CLI watch --follow and --json |
| R7 | Output limit | DONE | boundary rounds 1-3 | local-agent-adapters.test.js real runner past 64 MiB; retention under the limit ending |
| R8 | Compatibility | DONE | boundary rounds 1-3 | Verification receipts: focused and further suites, portability, plugin lint and build, desktop projection; hosted Plugin CI planned (12 jobs) |
| R9 | Run folders not committed | DONE | boundary rounds 1-3 | review-activity.test.js .gitignore writer and upgrade; R9 receipt: 0 tracked run-folder files at HEAD, base an ancestor, 867 removed |

## Review Log

Append pull-request review boundary entries here.

- 2026-11-28, FEATURE candidate against base `f6f421d`: paired boundary
  rounds 1 (both FAIL; 14 blocking findings fixed), 2 (Claude PASS, Codex FAIL
  on 2 medium; fixed) and 3 (Claude PASS, Codex FAIL on 3 medium evidence and
  record findings; fixed: live R1 receipt, plugin build receipt, these records).
