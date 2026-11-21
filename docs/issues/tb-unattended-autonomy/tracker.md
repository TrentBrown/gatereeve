# Branch Tracker - tb-unattended-autonomy

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-11-21

## Rubric Status

| # | Criterion (short) | Status | Review | Notes |
|---|-------------------|--------|----|-------|
| R1 | AC1 grant prerequisites | IMPLEMENTED | - | current-goal.test.js (set-dial and run.start grants/refusals) |
| R2 | AC1 parity and eligibility | IMPLEMENTED | - | current-goal-parity.test.js (adjudication, SLICE delivery, tripwire); current-goal.test.js (amendment, release merge refused); delegated suite |
| R3 | AC1 compatibility | IMPLEMENTED | - | full CLI suite; existing-test edits limited to rename assertions and skill counts |
| R4 | AC2 terminal state | IMPLEMENTED | - | current-goal.test.js (null, ready-pr, parked precedence, non-goal); current-goal-decisions.test.js (decisions) |
| R5 | AC3 park/resume | IMPLEMENTED | - | current-goal.test.js (draft + listed blockers, refusals, human continue, dial return) |
| R6 | AC4 question guard | IMPLEMENTED | - | current-goal-hooks.test.js; current-hook.test.js unchanged |
| R7 | AC5 Stop hook | IMPLEMENTED | - | current-goal-hooks.test.js (block, stall valve, terminal/non-goal/unreadable admit); manifests + platform contracts |
| R8 | AC6 record, pinning, review, publication | IMPLEMENTED | - | current-goal-decisions.test.js; grill-me/design/decision-record procedures |
| R9 | AC7 skill and guidance | IMPLEMENTED | - | shared/skills/goal; test_session_start.py goal tests; inventory |
| R10 | AC8 surfaces and packaging | IMPLEMENTED | - | current-goal-view.test.js; desktop current-view tests; plugin validate/lint/validate-native/build |
| R11 | AC9 rename and alias | IMPLEMENTED | - | current-goal.test.js alias + legacy replay; measurement, SessionStart and desktop rename assertions |

## Review Log

Append pull-request review boundary entries here.
