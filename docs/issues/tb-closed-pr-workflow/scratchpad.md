# Scratchpad - tb-closed-pr-workflow

## Decisions

None beyond the approved design.

## [1] Resolve live branch refs for closed PR review

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** PR provider, pinned context metadata, review instructions

Use GitHub branch-ref endpoints for current source/base when the PR is CLOSED. Retain githubReportedHeadSha/githubReportedBaseSha so stale native metadata is explicit. Closed review uses the existing pinned GateReeve packet and branch compare; reopening must expose the exact accepted final head before native merge. No second transport or tracking mechanism is introduced.

**Triggered by:** Actual push to closed PR 74 left GitHub headRefOid at its pre-push commit

**Alternatives considered:**
None recorded.

## [2] Retain verified legacy context ranges for automatic review

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Protocol execution preparation and staged consumers

Merge the original pinned context with the successful trusted currentness response. The guard still rejects stale source and policy; automatic review receives the exact original feature/slice range. This preserves the legacy preparation-helper format without a new transport or a caller-specific workaround.

**Triggered by:** Formal Judge runtime rejected a legacy PR context after its currentness guard omitted range fields

**Alternatives considered:**
Converting callers to schema 2 would leave existing legacy callers broken; rejecting legacy contexts would weaken promised PR compatibility.

## [3] Reuse closed ready PRs after failed merge

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** PR resolution, preparation retry and visibility policy

With keepPullRequestsClosed true, require CLOSED but allow ready PRs left by failed merge windows. Open ordinary review continues to require draft. This permits a new review on the same native PR without reopening during preparation.

**Triggered by:** A failed merge window marks draft ready before closing, which blocked subsequent preparation

**Alternatives considered:**
Reopening to reset draft would violate the approved preparation visibility policy.
