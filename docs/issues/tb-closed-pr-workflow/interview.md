# Interview - tb-closed-pr-workflow

**Feature start:** 2026-10-09
**Status:** complete

## D1 - Replace synthetic review

**Question:** Retain synthetic commits or replace them with closed pull requests?

**Answer:** Trent requested removing synthetic-commit mode and replacing it with PR closing.

**Decision:** Pull requests become the sole active review transport. Remove synthetic candidate publication, comment capture, and promotion. Preserve read access to historical records.

## D2 - Configuration shape

**Question:** Keep sliceBoundaryMode with a closed-PR mode, or retire the selector?

**Answer:** Codex recommended retiring the selector and introducing keepPullRequestsClosed; Trent replied, "Okay, let's do this now, please."

**Decision:** Add a repository-level boolean keepPullRequestsClosed, default false. Remove sliceBoundaryMode from current configuration and public documentation; preserve historical record interpretation.

## D3 - PR lifecycle

**Question:** When should PRs be open?

**Answer:** Trent proposed immediately closing new PRs and reopening at the point they need to merge. The agreed proposal keeps PRs closed throughout preparation, automated checks, and human review, reopening immediately before an authorized merge after checking the reviewed commit.

**Decision:** Apply the preference to intermediate and feature-final PRs. Reopening requires merge authorization, exact reviewed-head verification, and existing branch protection. Helpers may not reopen simply to run a review gate.

## Codebase findings

- plugin-src/shared/resources/protocol/context.js and scripts/workflow_context.py currently parse sliceBoundaryMode.
- scripts/synthetic_review.py implements the active synthetic publication and integration workflow.
- scripts/pr_context.py rejects CLOSED PRs during resolution and currentness checks; these paths need explicit pinned policy handling.
- scripts/boundary_context.py and boundary_packet.py interpret historical transport metadata, which must remain readable without permitting new synthetic operations.
- apps/desktop/main/github-observer.js already lists PRs in all states; its polling distinguishes open PRs and pending checks.
- cli/scripts/stage-protocol.js and apps/desktop/scripts/stage-protocol.mjs distribute the canonical shared resources.

## Remaining technical uncertainty

GitHub documentation describes close/reopen operations and reopened workflow events, but does not explicitly establish every formal-review affordance on CLOSED PRs. Verify these empirically as acceptance work. During closed review, persisted exact-commit GateReeve evidence and human acceptance remain authoritative for its own gates; any GitHub-required checks or reviews must still be satisfied in the authorized merge window. Never bypass repository protections or reopen to work around a helper limitation.

## Closing summary

The requested configuration and lifecycle are settled. Remaining questions are technical verification tasks rather than product choices. Synthesize design.md for the governed design gate. No implementation or release has begun.
