# Branch Tracker - tb-convergence-sweep-records

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-11-26

## Rubric Status

| # | Criterion (short) | Status | Review | Notes |
|---|-------------------|--------|----|-------|
| R1 | Claim disposition | DONE | pending paired review | sweep-records.test.js unit + both entry points refuse before launch, no result |
| R2 | Sweep record | DONE | pending paired review | sweep-records.test.js field paths, types, bounds, sites, one-site accepted |
| R3 | Records reach later rounds | DONE | pending paired review | sweep-records.test.js paired round, next round, individual review, re-claim, duplicates, dropped claim, closed scope, roundPolicy.revision |
| R4 | Regression rule | DONE | pending paired review | sweep-records.test.js rounds 4 and 5: new/present swept-class FAIL, other class demoted, claimed finding PASS; predicate unit |
| R5 | Reviewer guidance | DONE | pending paired review | sweep-records.test.js instruction sentence and guide rules |
| R6 | Peer re-reports and individual rounds | DONE | pending paired review | round-policy.test.js five #134 variants (resolved/unsupported, both orders, individual reviews); fail without the fix |
| R7 | Documentation | DONE | pending paired review | PROTOCOL.md Fix claims and sweep records + round policy; pr-review.md; desktop mirror identical |

## Review Log

Append pull-request review boundary entries here.
- 2026-11-27 boundary round 1 (FEATURE, head 850684d): codex FAIL (high
  closed-scope sweep reuse; medium missing desktop receipt; low help receipt);
  claude-code FAIL (medium CR-1 first raise counted as re-report; lows CR-2,
  CR-3). Fixed: scope epoch, first-raise rule, desktop and help receipts.
- 2026-11-27 boundary round 2 (head e810f4d): codex PASS (low CR-2);
  claude-code FAIL (medium CR2-1, CR2-2: round groups spanning sequential
  executions). Fixed: per-provider latest perspective, report-level re-report
  rule, all closures in history.
- 2026-11-27 boundary round 3 (head d5e37f2): codex PASS; claude-code PASS
  (low CR3-1). Hosted CI: portability lint failed (new module missing from
  the declared protocol inventory). Fixed; local Verification extended.
