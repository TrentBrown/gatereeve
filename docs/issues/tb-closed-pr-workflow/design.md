# Design - tb-closed-pr-workflow

**Status:** approved (gate passed 2026-10-09)

## Problem

GateReeve rc.14 introduced a second review mechanism to avoid intermediate open PRs. Synthetic commits require special publication, temporary refs, captured commit comments, and integration rules. Trent wants to remove that mechanism and use ordinary PRs that stay out of the open-PR queue until an authorized merge.

## Intent

Use one PR review workflow with one optional repository setting:

```json
{
  "keepPullRequestsClosed": true
}
```

The setting defaults to false and applies to slice and feature-final PRs. Keep reviewed-content pinning, evidence, human acceptance, and merge protections intact.

## Chosen shape

### Configuration

- Introduce a strictly boolean keepPullRequestsClosed at the existing repository configuration level. Omission means false.
- Retire sliceBoundaryMode from current configuration, templates, and active workflow instructions. Old configuration containing it receives an actionable migration error rather than silently falling back or continuing synthetic operations.
- Pin the new preference into the review context. Reject policy drift during an active boundary; do not silently interpret a closed PR under ordinary open-PR rules.
- Retain releaseBranch and existing branch-role semantics because those are independent of synthetic review.
- Keep the public setting in repository configuration for this change; do not add a separate Desktop settings workflow.

### Create and keep closed

- Reuse ordinary draft PRs and their native identity, diff, branches, and checks.
- Provide a deterministic shared helper to create or reuse the intended PR, close it immediately when the preference is true, verify CLOSED state, and resolve its exact context. Fail visibly if closure fails; do not claim the queue is clear.
- Keep the PR closed throughout preparation, evidence finalization, and human review. Helpers must find closed PRs explicitly and must not create duplicate PRs because an open-only search returned nothing.
- CLOSED is a permitted pre-merge state only when explicitly configured. MERGED and missing/deleted PRs remain invalid for starting or continuing a new boundary.
- Preserve repository identity, branch identity, clean committed/pushed source, exact evaluated SHA, feature base, evidence-only finalization, and stale-source rejection.
- Existing PRs encountered by the helper follow the same preference; do not mass-close unrelated repository PRs.

### Review and merge

- Use existing GateReeve review packets and human acceptance of the pinned commit while the PR is closed.
- Do not promise that closing a PR makes it private or prevents creation notifications.
- Reopen only after explicit authorization to merge this PR and after verifying that its reviewed source is still current. Never reopen merely to satisfy an existing helper.
- Opening the merge window does not grant permission to merge changed or unreviewed content. Recheck identity, branch direction, exact source, required checks, and repository-required reviews after reopening. A change requires renewed review through the existing workflow.
- Satisfy GitHub protections in the authorized merge window. If merge preparation fails or the merge attempt is abandoned, close the unmerged PR again and report the reason. Do not bypass protections or leave it open as a workaround.
- Record integration only through the existing protocol core after actual merge evidence verifies the reviewed content.

### Remove synthetic operations while preserving history

- Remove the active synthetic resolve/publish/capture-comments/promote helper and all current workflow routing into those operations.
- Keep only read/interpretation compatibility necessary for archived contexts, packets, model locks, and journals. Historical records do not authorize new synthetic execution.
- An in-flight synthetic boundary must stop with migration guidance rather than silently switching its review identity or attempting promotion.
- Preserve useful shared boundary abstractions and vocabulary instead of undoing unrelated workflow/module changes.
- Stage canonical shared changes into CLI/Desktop resources and update tests and distribution contracts so shipped surfaces agree.

## Alternatives considered

- **Keep sliceBoundaryMode and add a closed-PR value:** rejected because there is now only one active review mechanism; a lifecycle preference does not need a transport selector.
- **Keep synthetic mode alongside the new switch:** rejected because it retains the complexity Trent asked to remove.
- **Allow closed PRs unconditionally:** rejected because it weakens the ordinary workflow and hides policy/configuration mistakes.
- **Briefly reopen during preparation or review:** rejected because it puts PRs back into the queue before merge authorization.
- **Rewrite archived evidence:** rejected because released feature records should remain truthful and readable.

## Constraints

- The plugin protocol core remains the passage authority. No new setting bypasses gates, human review, or merge verification.
- Development branches remain one-way integration sinks under Trent's cross-project instructions. Identify source and target and verify direction before any merge/rebase.
- main is protected. Implement on a delivery branch from current origin/main and review the change through a PR kept closed during preparation/review.
- Remove the active synthetic mechanism without changing unrelated release, module, or Whiteboard behavior.
- Release/installation is a separate boundary; a local implementation or approved PR is not a published release.

## Open risks

- Verify actual closed-PR formal review, diff/comment, push/head, close/reopen, and CI behavior before declaring acceptance. GitHub documentation does not explicitly guarantee every closed-review affordance.
- Reopening can trigger required CI; wait for authoritative results before merge. Local checks while closed cannot substitute for required hosted checks.
- Preserve old model and evidence interpretation without accidentally retaining active synthetic operations. Cover these separately with compatibility and rejection checks.

## Evidence informing the design

- Existing implementation: plugin-src/shared/resources/protocol/context.js; scripts/workflow_context.py, pr_context.py, boundary_context.py, boundary_packet.py, and synthetic_review.py; commands/pr-boundary.md.
- GitHub PR state API: https://docs.github.com/en/rest/pulls/pulls#update-a-pull-request
- GitHub workflow event semantics: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request

## Changes

None.
