# Branch Tracker - tb-convergence-and-retirement

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-11-22

## Rubric Status

| # | Criterion (short) | Status | Review | Notes |
|---|-------------------|--------|----|-------|
| R1 | AC1 idle lock | DONE | PR #128 (7 paired rounds, PASS) | local-agent-idle-inhibitor.test.js (wrap, fallbacks, stdin, exit code, size guard, timeout, live lock list and release, receipt) |
| R2 | AC2 metrics repair | DONE | PR #129 (PR A, merged outside GateReeve by human decision) | PR A; D33 scratch lock implemented: scratch-cleanup.test.js (lockless creation, tombstone deleted outside the lock, live-holder waiter, interrupted lock reported), test-shards.test.js (per-shard roots, every test file imports helpers/private-scratch.js). metrics-repair.test.js (isolation, purge, capture conflicts, status counts, decision.ask, human wait, scratch file counts, stranded, report retention); live store copy: purge 49,236 fixture rows, capture succeeds |
| R3 | AC3 severity and class | DONE | PR #130 (B1, 4 paired rounds, PASS; CI 16/16) | PR B1 (`-03-reviewer-contract`): reviewer-contract.test.js (missing severity, failure scenario, class ID or statement rejected; low never blocks; higher paired rating wins), planning, spec, judge, review and light-brief gates, low-only FAIL recorded as PASS, dispositions cannot carry severity |
| R5 | AC5 robustness | DONE | PR #130 (B1) | delivered subset per amended AC5 (D36); the rest moved to the follow-up feature |
| R6 | AC6 round policy | DONE | PR #131 (C1, 6 paired rounds; review gate waived by human for ad075ed; CI 16/16) | PR C1 (`-04-round-policy`): round-policy.test.js (counter per scope, UNAVAILABLE rounds, amendment-only reset, consecutive-revision rounds, split closes scope, bands incl. low and medium regressions, regression carried to later rounds, independent failures never demoted, round 6 hand-back and refused adjudication, planning and light runs, light advice at 4) |
| R9 | AC9 CI after convergence | DONE | PR #131 (C1; AC9/R9 amended by D35) | PR C1: ci-after-convergence.test.js (unpushed local head, no-receipt review not qualifying, same-tree CI qualifies without re-review, uncovered receipt by name, every CI job must pass, different tree named, hosted-CI repo refused on local evidence, CI-failure delta path, push warning never denies) |
| R10 | AC10 sweep | DONE | PR #129 (PR A) | PR A; worktree-sweep.test.js |
| R11 | AC11 measurement and surfaces | DONE | PRs #130 and #131 | amended AC11 (D36): earlier-contract compatibility (reviewContractVersion, unrated findings), status.rounds, PROTOCOL/WORKFLOW/pr-boundary docs; metrics and surfaces moved |
| R12 | AC12 reviewer retention | DONE | PR #129 (PR A) | amended AC12 (D36): worktree-sweep.test.js lists unharvested workflow state; retention moved |
| R13 | AC13 workflow robustness | DONE | PR #129 (PR A) | PR A (D33): workflow-robustness.test.js (prepare names missing decisions.md; check replacement covered after consuming review PASS, uncovered after FAIL; job.abandon gone/live/delivery/legacy, older proof qualifies again); test_bootstrap_branch_docs.py (decisions.md created) |

Former rows 4 (sweep records), 7 (follow-ups) and 8 (failure model) moved to
the follow-up feature (D36, `follow-up-feature.md`).

## Review Log

Append pull-request review boundary entries here.
