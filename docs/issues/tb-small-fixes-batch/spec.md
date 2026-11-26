# Spec - tb-small-fixes-batch

**Feature:** `tb-small-fixes-batch`
**Created:** 2026-11-25

## Summary

Closes issue #146: verification works without `gh api --slurp`, GateReeve
places no draft-status precondition on a PR, and the six PR A open items are
fixed, as approved in `design.md`.

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Acceptance Criteria

- **AC1.** The CI run lookup used by verification and
  `metrics import --format github` read paginated job lists with
  `gh api <path> --paginate --jq '.jobs[]'` and never pass `--slurp`. Jobs from
  every page are returned in order, and an empty listing yields no jobs.
- **AC2.** In default open delivery, `merge.prepare` accepts an open PR whether
  it is a draft or ready for review, and refuses a PR that is not open. The
  prepared action has exactly the fields it had before this change, so an
  action prepared from a draft PR is identical to one prepared before the
  change. Closed-PR delivery (`keepPullRequestsClosed`) behaves as before.
- **AC3.** `merge.execute` marks a draft PR ready before merging and merges a
  ready PR without a `ready` call. After a failed or interrupted merge, neither
  `merge.execute` nor delivery recovery turns the PR back into a draft, and a
  retry of the same authorized action proceeds. A draft-status change after
  authorization does not invalidate the authorization.
- **AC4.** `goal.park` accepts an open PR, draft or ready for review, whose
  description lists every blocker, and still refuses a PR that is not open.
- **AC5.** PROTOCOL.md, WORKFLOW.md, the light-run and PR-boundary procedures
  and the CLI README describe no draft requirement for `merge.prepare`,
  `merge.execute` or `goal.park`, and no restoration of draft status. Open
  drafts may remain a recommended default for new PRs.
- **AC6.** The CLI isolation-evidence script reports execution-record counts
  (the `records` table) before and after the suite, and fails when the suite
  added execution records for a project the shared store did not contain
  before.
- **AC7.** The scratch inventory measures every file count (runs, tombstones,
  stranded runs) against the `runs` directory's filesystem, so a run folder on
  another filesystem (a mount root) is not walked and its file count is
  unknown; a tombstone that vanishes after listing counts as zero files instead
  of failing the inventory.
- **AC8.** PERFORMANCE.md shows `purge-test-data --apply` with `--workflow` or
  `--workflows-file`; the sweep test asserts `REGENERABLE` equals the spec's
  literal list; and the delayed SIGKILL escalation walks descendants only from
  the tracked child while Node has not reaped it and from recorded PIDs whose
  start time still matches.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | AC1 | Both callers use `--paginate --jq '.jobs[]'`, no `--slurp`; multi-line and empty outputs parse | `--slurp` remains in either caller, or pages are lost or misparsed | `cli/test/small-fixes.test.js` plus diff of `validation-scope.js` and `performance/import.js` |
| R2 | AC2 | Ready and draft open PRs prepare; closed PR refused; draft-prepared action fields unchanged; closed delivery unchanged | Ready PR refused, action gains a field, or closed delivery changes | `cli/test/current-delivery-targets.test.js` and existing `current-core` closed-delivery tests |
| R3 | AC3 | Ready PR merges with no `ready` call; failed merge leaves PR ready and a retry merges; draft flip after authorization still merges | Any `ready --undo` call, a refused retry, or a flip invalidating authority | `cli/test/current-delivery-targets.test.js`, `cli/test/current-core.test.js` |
| R4 | AC4 | Park on a ready PR records PARKED; non-open PR refused | Ready PR refused or non-open PR accepted | `cli/test/current-goal.test.js` |
| R5 | AC5 | No listed document states a draft requirement or draft restoration | Any listed document still states one | Diff and `rg` over the listed documents |
| R6 | AC6 | Script snapshots `records`, prints counts, adds a failure for new record projects | Execution records are not counted or new projects pass silently | Diff of `cli/scripts/isolation-evidence.js` and a local run of the script |
| R7 | AC7 | All three walks use the `runs` device; tombstone stat inside error handling | Any walk uses the run's own device, or a vanished tombstone rejects | Diff of `storage/scratch.js` and passing `scratch-cleanup` / `metrics-repair` tests |
| R8 | AC8 | Doc line fixed; literal-list assertion present; `escalationRoots` excludes reaped child and mismatched PIDs | Any of the three missing | Diff, `cli/test/worktree-sweep.test.js`, `cli/test/small-fixes.test.js` |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.
