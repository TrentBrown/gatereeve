# Design - tb-small-fixes-batch

**Status:** draft

## Problem

Issue #146 batches small fixes found during earlier runs:

- Verification and `metrics import --format github` call `gh api --slurp`,
  which `gh` 2.46 (Ubuntu's package) lacks, so verification came back
  UNAVAILABLE.
- `merge.prepare` refuses an open PR unless it is a draft, so people had to
  turn ready PRs back into drafts. `goal.park` has the same check.
- Six PR A open items: isolation evidence ignores execution records; a
  tombstone `lstat` race in `inspectScratch`; the quick inventory walks
  mount-root runs; a stale `purge-test-data --apply` line in PERFORMANCE.md; a
  regenerable-set test that only iterates its own constant; and PID reuse in
  the slice-1 SIGKILL escalation.

## Intent

Remove each defect with the smallest change that keeps existing contracts,
except the draft precondition, which the human chose to drop entirely.

## Chosen shape

**Draft status (contract change).**
- `merge.prepare` accepts any open PR, draft or ready for review, in default
  open delivery. Closed-PR delivery (`keepPullRequestsClosed`) is unchanged.
- The prepared action's shape is unchanged. Draft status is not part of it, so
  existing prepared actions and authorizations stay valid, and a draft flip
  after authorization does not invalidate it.
- `merge.execute` marks a draft PR ready before merging (GitHub refuses to
  merge a draft) and never turns it back into a draft. That covers both the
  in-process cleanup in `merge()` and the recovery step in `protectedMerge`.
  A failed merge leaves the PR open and ready, which a retry now accepts.
- `goal.park` accepts any open PR whose description lists every blocker.
- Documentation: PROTOCOL.md (operations table, merge-abort paragraph, goal
  sections), WORKFLOW.md, the light-run and PR-boundary procedures, and the
  CLI README stop describing a draft requirement. Open drafts stay a
  recommended default for new PRs.

**`--slurp` fallback.** Paginated job lists use `gh api --paginate --jq
'.jobs[]'`, which prints one JSON object per line and works on older `gh`.
A shared helper `paginatedItems` in `validation-scope.js` serves both the CI
run lookup and `fetchGitHubJobs`.

**PR A items.**
- `cli/scripts/isolation-evidence.js` snapshots the `records` table, reports
  its counts, and fails when the suite adds records for a project absent
  before.
- `inspectScratch` binds every file-count walk (runs, tombstones,
  `markStranded`) to the `runs` directory's device. A mount-root run fails the
  device check and is counted as unknown instead of walked, and a vanished
  tombstone counts as zero inside the existing error handling.
- PERFORMANCE.md shows `--apply` with `--workflow` / `--workflows-file`.
- The sweep test asserts `REGENERABLE` equals the spec's literal list.
- `escalationRoots` (in `local-agent-adapters.js`) walks descendants only
  from the tracked child while Node has not reaped it, and from recorded
  PIDs whose start time still matches.

## Alternatives considered

- **Explain the draft requirement instead** (the issue's other option): no
  contract change, but people still hit the refusal. Rejected by the human.
- **Record draft state in the action** (`draft: false`, or always):
  restoration stays correct, but a flip invalidates authorization. Rejected:
  the human wants no draft restriction.
- **Record draft state in the merge claim** and keep restoring drafts: correct,
  but keeps a restriction-shaped behavior nobody needs once preparation
  accepts ready PRs.
- **`--slurp` with a version check in the doctor:** still fails on older
  `gh`. The `--jq` form needs no version check.

## Constraints

- Keep edits to `local-agent-adapters.js` minimal (#140/#141 also edit it).
  No edits to `execution.js` or `boundary-review.js`.
- The release-conductor observer's `--slurp` use is out of scope. It serves
  GateReeve's own release flow, and its tests mock the slurped shape.
- Regenerate the staged desktop protocol copy with `stage:protocol`.
- No local paths or other projects' names in public issue or PR text.

## Open risks

- A failed merge now leaves the PR ready for review rather than a draft. With
  no GateReeve check on draft status, this only changes how the PR looks on
  GitHub. A draft was never a guard: anyone with access could mark it ready
  and merge outside GateReeve; branch protection is the real enforcement.
- The tombstone race and mount-root walk have no deterministic test.
  Reproducing them needs a concurrent delete or a real mount below the
  scratch root.

## Changes
