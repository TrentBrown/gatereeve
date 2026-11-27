# Branch Tracker - tb-review-self-validation

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-11-26

## Rubric Status

| # | Criterion (short) | Status | Review | Notes |
|---|-------------------|--------|----|-------|
| R1 | One verdict contract | DONE | pending paired review | self-validation.test.js parity test; existing normalization/contract/boundary suites pass |
| R2 | Read-only self-validation tool | DONE | pending paired review | self-validation.test.js server over stdio with the exact launch, permission flags, refused write/spawn, instrumented no-network; real Claude and Codex smoke test (scratchpad S4) |
| R3 | Offered without widening the sandbox | DONE | pending paired review | local-agent-adapters.test.js full argument diffs and receipts; self-validation.test.js capable vs incapable adapter |
| R4 | A reviewer self-validates and corrects | DONE | pending paired review | self-validation.test.js fixture reviewer drives the real server, one attempt, no repair; instruction text |
| R5 | `not-assessed` for a missing peer disposition | DONE | pending paired review | self-validation.test.js unit cases and paired round (member unreconciled) |
| R6 | Attempt tokens and duration | DONE | pending paired review | current-boundary-review.test.js repair and transient attempts; current-measurement.test.js projection |
| R7 | Incorporated documents | DONE | pending paired review | review-packet.test.js phrase, links, notes, bounds, no fetch, view files, reuse, instructions, DoD parts, pointers |
| R8 | After-merge criteria | DONE | pending paired review | review-packet.test.js marker, candidate rules, packet field, instruction; planning.js unchanged |
| R9 | Documentation | DONE | pending paired review | PROTOCOL.md, spec template, pr-review.md; desktop mirror restaged |

## Review Log

Append pull-request review boundary entries here.
- 2026-11-27 boundary round 1 (FEATURE, head 0632708): both FAIL. Codex high
  `codex/incorporated-parenthesized-link` (fixed: CommonMark destinations with
  parentheses, escapes, angle brackets) and medium `codex/missing-boundary-build`;
  Claude medium `EV1`-`EV3` (no receipts for metrics-repair, idle-inhibitor and
  desktop suites) and lows `L1`, `L2`. Evidence answered by added checks
  (scratchpad S5, S8). Hosted CI on 0632708: all 16 checks passed.
- 2026-11-27 boundary round 2 (head 8006105): Claude PASS (round 1 findings
  resolved; low `N1`); Codex FAIL high `codex/nested-parenthesized-link`
  (fixed: a parenthesis-balancing scanner for link destinations) and mandate
  UNAVAILABLE (PR description not in evidence; recorded in `decisions.md`).
- 2026-11-27 boundary round 3 (head d95da48): Codex FAIL high
  `codex/nested-markdown-link-label` (fixed: links found from the closing `](`)
  and mandate UNAVAILABLE (PR state now observed by a verification receipt);
  Claude delta refused (agent decisions changed after its prior).
