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
