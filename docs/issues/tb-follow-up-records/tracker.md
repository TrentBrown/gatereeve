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
- 2026-11-28 boundary round 1 (FEATURE, head c26be0b): codex FAIL (high:
  PR summary text unredacted; high: withdrawn follow-ups stale in the metrics
  store; medium: unavailable records published as "no follow-ups");
  claude-code FAIL (medium: no test of `present` after `fixed`; medium: no
  test that decide writes follow-ups.md; five lows). Fixed all, including the
  lows on observation-time churn and non-review unavailable results.
- 2026-11-28 boundary round 2 (head 8408c33): claude-code PASS (low: docs
  drift); codex FAIL (high: feature ID in the follow-ups.md title; medium:
  follow-ups.md and the CLI list read "none" with unavailable records; two
  lows on local receipts that hosted CI covers). Fixed the three and the docs.
- 2026-11-28 boundary round 3 (head 387f16d): claude-code PASS (low: CLI
  test had a known record); codex FAIL (high: a one-segment absolute path
  such as /srv escaped redaction). Every absolute path is now redacted; the
  CLI test uses a run with no known follow-up.
- 2026-11-28 boundary round 4 (head d0f4f41): claude-code PASS (low: an
  absolute path with a space outside the configured roots is partly kept;
  out-of-contract reviewer text); codex FAIL (high: a repository alias that
  is a listed client name appeared in follow-ups.md). The alias, dedup key
  and tracking repository are now redacted on public surfaces.
- 2026-11-28 boundary round 5 (head 1f3bd5e): claude-code PASS (lows: the
  kept issue URL needs a cross-repository filing; two receipt gaps hosted CI
  covers); codex FAIL (high: a client-named GitHub repository in the issue
  URL). The URL now gets the term redaction (it keeps its form).
