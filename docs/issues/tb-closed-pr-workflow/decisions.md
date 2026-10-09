# Decisions - tb-closed-pr-workflow

## Approved design

See design.md and interview.md for the approved configuration, lifecycle and historical compatibility decisions.

## D4 - Live refs for closed PRs

Closed PR #74 retained its initial reported head after a push. Use live remote branch refs while preserving githubReportedHeadSha/githubReportedBaseSha. Review the pinned packet/branch comparison; require the reopened native PR to expose the accepted final head. Missing live refs block review. The native PR remains the tracking identity.
