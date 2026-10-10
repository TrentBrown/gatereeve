# Decisions - tb-closed-pr-workflow

## Approved design

See design.md and interview.md for the approved configuration, lifecycle and historical compatibility decisions.

## D4 - Live refs for closed PRs

Closed PR #74 retained its initial reported head after a push. Use live remote branch refs while preserving githubReportedHeadSha/githubReportedBaseSha. Review the pinned packet/branch comparison; require the reopened native PR to expose the accepted final head. Missing live refs block review. The native PR remains the tracking identity.

## D5 - Legacy range compatibility

After the trusted currentness guard succeeds, merge its response into the pinned context so automatic review retains the feature/slice range and closure policy. Guard failures still block execution. Canonical and staged consumers share this behavior, covered by the execution-preparation regression.

## D6 - Reuse ready closed PRs after failed merges

CLOSED is the visibility requirement for enabled policy; draft status is required only for ordinary OPEN review. A failed merge may already have marked the PR ready, so closed ready PRs can be re-evaluated without reopening. Creation remains draft, and native merge protection and exact-head authorization remain unchanged. A failure-to-new-review regression verifies the complete path.
