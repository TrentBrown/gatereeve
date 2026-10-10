# Spec - tb-closed-pr-workflow

**Feature:** `tb-closed-pr-workflow`
**Created:** 2026-10-09

## Summary

Replace active synthetic review with ordinary PRs and the optional repository preference keepPullRequestsClosed, as approved in design.md.

## Definition of Done

The global software-development workflow Definition of Done applies. Source review is pre-merge; publication, installation, and release acceptance remain separate post-merge obligations.

## Acceptance Criteria

- **AC1.** The repository boolean keepPullRequestsClosed defaults to false, rejects non-booleans, and retired sliceBoundaryMode configuration produces migration guidance.
- **AC2.** Preparation creates or reuses only the exact intended unmerged PR, immediately closes it when configured, verifies closure, and refuses ambiguous or failed operations.
- **AC3.** Resolution, gates, evidence finalization, and currentness accept CLOSED only with a pinned true preference, reject policy/source/identity drift, and preserve default OPEN draft behavior.
- **AC4.** Reopening requires explicit authorization of the exact reviewed PR head, permitted branch direction, and current context; merge uses native protections and re-closes the unmerged PR on failed or abandoned attempts.
- **AC5.** No active workflow can resolve, publish, capture comments for, or promote synthetic candidates; archived models, journals, contexts, and packets remain readable, and active synthetic attempts fail with migration guidance.
- **AC6.** Canonical plugin, staged CLI/Desktop resources, and workflow instructions agree on PR-only behavior; required local verification passes and actual GitHub closed-PR behavior is recorded without claiming release.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Configuration (AC1) | The repository boolean keepPullRequestsClosed defaults to false, rejects non-booleans, and retired sliceBoundaryMode configuration produces migration guidance. | Any stated behavior is absent or its negative cases are accepted. | JavaScript/Python parity and configuration tests |
| R2 | PR preparation (AC2) | Preparation creates or reuses only the exact intended unmerged PR, immediately closes it when configured, verifies closure, and refuses ambiguous or failed operations. | Any stated behavior is absent or its negative cases are accepted. | Injected-provider operation tests and live closed PR evidence |
| R3 | Pinned closed review (AC3) | Resolution, gates, evidence finalization, and currentness accept CLOSED only with a pinned true preference, reject policy/source/identity drift, and preserve default OPEN draft behavior. | Any stated behavior is absent or its negative cases are accepted. | Real Git fixture tests including drift and historical PR contexts |
| R4 | Authorized merge window (AC4) | Reopening requires explicit authorization of the exact reviewed PR head, permitted branch direction, and current context; merge uses native protections and re-closes the unmerged PR on failed or abandoned attempts. | Any stated behavior is absent or its negative cases are accepted. | Mock GitHub lifecycle tests covering success, failure, unauthorized use, drift, and development-source rejection |
| R5 | Synthetic retirement (AC5) | No active workflow can resolve, publish, capture comments for, or promote synthetic candidates; archived models, journals, contexts, and packets remain readable, and active synthetic attempts fail with migration guidance. | Any stated behavior is absent or its negative cases are accepted. | Compatibility fixtures, active rejection tests, inventory and policy checks |
| R6 | Portable delivery (AC6) | Canonical plugin, staged CLI/Desktop resources, and workflow instructions agree on PR-only behavior; required local verification passes and actual GitHub closed-PR behavior is recorded without claiming release. | Any stated behavior is absent or its negative cases are accepted. | Python, CLI/Desktop suites, build/parity checks and empirical GitHub receipt |

## Changes

- 2026-10-09: AC3 uses the live remote branch source/base when a closed PR reports stale native refs. Evidence also preserves GitHub-reported refs. AC4 must compare the actual reopened PR head with the accepted final head before merge. This clarifies the approved exact-source behavior after empirical discovery, without adding scope or weakening criteria.
