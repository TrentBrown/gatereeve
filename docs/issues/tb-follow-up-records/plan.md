# Plan - tb-follow-up-records

**Feature:** `tb-follow-up-records`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-11-27

## Strategy

One slice and one PR (FEATURE scope), closing #148. A new module
`plugin-src/shared/resources/protocol/current/follow-ups.js` owns the record,
review derivation, the non-review API, defaults, decision validation, issue
filing, redaction and the `follow-ups.md` renderer. The core gains two event
types (`FOLLOW_UP_RECORDED`, `FOLLOW_UP_DECIDED`), two operations
(`followup.decide`, `followup.render`), the `STARTED.followUps` marker, and
checks in `checkObserved` (completion, release merge), `goalStatus` and
`inspect`. The raise-time blocking rule moves from the metrics projection to
a shared helper so both use one rule. `review.publish` appends the follow-up
list. The projection (version 3) sets `followUp`. The reviewer path
(`execution.js`, `boundary-review.js`, `local-agent-adapters.js`) is read,
not edited, to stay clear of #147.

## Steps

- **P1.** `follow-ups.js`: raise-time rule (shared with
  `workflow-projection.js`), review derivation from retained results with
  `fixed`/reopen, record shape. **Advances:** R1.
- **P2.** `recordFollowUps` and `FOLLOW_UP_RECORDED` (dependency-scan origin,
  dedup, validation), state projection. **Advances:** R2.
- **P3.** `followup.decide`: input validation, bulk selection, authority
  rules, defaults, supersession, `FOLLOW_UP_DECIDED`. **Advances:** R3, R4.
- **P4.** Issue filing through `core.runtime.gh`: marker search and reuse,
  create, backlink, seed, redaction, failure handling. **Advances:** R5.
- **P5.** Enforcement: completion and release-merge checks, goal status and
  stale ready record, `status.followUps`. **Advances:** R6.
- **P6.** `follow-ups.md` renderer and `followup.render`. **Advances:** R7.
- **P7.** `review.publish` follow-up section. **Advances:** R8.
- **P8.** Metrics: `STARTED` marker, Completion milestone list, projection
  version 3 `followUp`, `rejected` value, measure 2 test. **Advances:** R9.
- **P9.** CLI `follow-ups` command group. **Advances:** R10.
- **P10.** PROTOCOL.md, USER-GUIDE.md, PERFORMANCE.md, cli/README.md;
  desktop restage. **Advances:** R11.
- **P11.** PR: "Closes #148", decisions, test methods; afterwards tell the
  dependency-scan design thread the record shape and API.

## Verification

Focused: `node --test` on the new and touched test files with
`GIT_CONFIG_GLOBAL=/dev/null`. Broad local: the CLI suite without the
host-dependent files (idle-inhibitor, scratch-cleanup, metrics-repair) on the
Mac. Final: hosted CI after review convergence.
