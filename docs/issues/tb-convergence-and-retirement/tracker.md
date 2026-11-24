# Branch Tracker - tb-convergence-and-retirement

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-11-22

## Rubric Status

| # | Criterion (short) | Status | Review | Notes |
|---|-------------------|--------|----|-------|
| R1 | AC1 idle lock | DONE | PR #128 (7 paired rounds, PASS) | local-agent-idle-inhibitor.test.js (wrap, fallbacks, stdin, exit code, size guard, timeout, live lock list and release, receipt) |
| R2 | AC2 metrics repair | IN PROGRESS | - | PR A; D33 scratch lock implemented: scratch-cleanup.test.js (lockless creation, tombstone deleted outside the lock, live-holder waiter, interrupted lock reported), test-shards.test.js (per-shard roots, every test file imports helpers/private-scratch.js). metrics-repair.test.js (isolation, purge, capture conflicts, status counts, decision.ask, human wait, scratch file counts, stranded, report retention); live store copy: purge 49,236 fixture rows, capture succeeds |
| R3 | AC3 severity and class | IMPLEMENTED | - | PR B1 (`-03-reviewer-contract`): reviewer-contract.test.js (missing severity, failure scenario, class ID or statement rejected; low never blocks; higher paired rating wins), planning, spec, judge, review and light-brief gates, low-only FAIL recorded as PASS, dispositions cannot carry severity |
| R4 | AC4 sweep records | TODO | - | slice 3 |
| R5 | AC5 robustness | IN PROGRESS | - | PR B1 core (required dispositions, per-request ID enums, normalized affected IDs incl. UNAVAILABLE-only IDs, present-low, one repair turn for either provider judged by substance identity, unavailableReason): reviewer-contract, current-history-assessment, current-boundary-review; B2: validate-verdict, misplaced-field normalization, not-assessed, per-rule counts |
| R6 | AC6 round policy | TODO | - | slice 4 |
| R7 | AC7 follow-ups | TODO | - | slice 4 |
| R8 | AC8 failure model | TODO | - | slice 4 |
| R9 | AC9 CI after convergence | TODO | - | slice 5 |
| R10 | AC10 sweep | IMPLEMENTED | - | PR A; worktree-sweep.test.js |
| R11 | AC11 measurement and surfaces | TODO | - | PRs B and C |
| R12 | AC12 reviewer retention | TODO | - | PR B |
| R13 | AC13 workflow robustness | IN PROGRESS | - | PR A (D33): workflow-robustness.test.js (prepare names missing decisions.md; check replacement covered after consuming review PASS, uncovered after FAIL; job.abandon gone/live/delivery/legacy, older proof qualifies again); test_bootstrap_branch_docs.py (decisions.md created) |

## Review Log

Append pull-request review boundary entries here.
