# Design - tb-synthetic-slice-review

**Status:** approved (gate passed 2026-09-28)

## Problem

The workflow currently equates every slice review boundary with a GitHub draft
pull request. That creates unwanted intermediate PR visibility for teams that
assemble reviewed slices on an integration branch before opening one final PR
to `main`. Removing draft PRs must not remove deterministic context pinning,
automated gates, human line review, reviewed-content verification, or the final
integration-to-release pull request.

## Intent

Make the transport used for slice review configurable while preserving the
same governed boundary semantics. Keep pull requests as the portable default.
Provide an opt-in synthetic-commit transport that reviews and integrates the
exact same Git object, and retain a real PR for feature-final review.

## Chosen shape

### Configuration and branch roles

Each configured repository gains two backward-compatible optional fields:

- `sliceBoundaryMode`: `pull-request` or `synthetic-commit`, defaulting to
  `pull-request`.
- `releaseBranch`: the target of the feature-final PR, defaulting to
  `integrationBranch`.

The chosen mode and branch roles are pinned into the governed feature context.
An active feature cannot change them implicitly.

### Shared boundary contract

Introduce a transport-neutral boundary context consumed by gate preparation,
packet validation, feature-final inspection, protocol snapshots, and agent
workflows. Existing schema-version-1 PR contexts and packets remain readable.
New contexts identify their transport and expose common base, head, merge-base,
evaluated-source, repository, and feature-base fields. Transport-specific
metadata lives below a discriminated review object.

### Synthetic slice boundary

Synthetic mode has a candidate phase followed by a review publication phase:

1. Pin the remote integration SHA and committed slice source SHA.
2. Run the existing boundary gates against that range.
3. Finalize declared evidence-only changes.
4. Create a single-parent commit with the integration SHA as parent and the
   finalized slice tree as its tree.
5. Push that commit to a deterministic temporary review branch and expose its
   GitHub commit URL for line comments.
6. Capture commit comments into the immutable evidence packet.
7. After explicit human acceptance, prove the integration ref still equals the
   pinned parent, the review ref still names the synthetic commit, and the
   finalized tree still matches.
8. Fast-forward the integration branch to that exact commit and record the
   integration through the protocol core.

Synthetic mode is therefore squash-only. Repositories that require preserved
slice commit topology continue to use PR mode.

### Final review

When `releaseBranch` differs from `integrationBranch`, feature-final review is
the real PR from integration to release. Slice packets remain slice-scoped;
the final PR evaluates the complete feature from the configured original base
and retains the ordinary GitHub review and merge workflow.

### Compatibility

- Omitted configuration retains the existing PR behavior.
- Existing model locks, journals, PR contexts, packet schema versions, and PR
  log entries remain readable.
- New presentation uses review-boundary terminology while recognizing legacy
  `PR_BOUNDARY` state in old locks.
- The QualityCode profile permits synthetic boundaries only through an
  explicit repository configuration; it remains PR-first by default.

## Alternatives considered

- **Keep PR-only workflow and rely on filters.** Rejected because it leaves the
  unwanted repository objects and asks reviewers to hide workflow noise.
- **Use an unconnected private mirror.** Rejected because it creates a second
  source-governance boundary and review comments do not transfer.
- **Create the synthetic commit before gates and store evidence elsewhere.**
  Rejected because it weakens the existing tracked evidence contract.
- **Create a separate merge commit after synthetic review.** Rejected for the
  primary mode because the integrated SHA would differ from the reviewed SHA.
- **Make synthetic review the QualityCode-wide default.** Rejected because the
  behavior is client-specific and would surprise other users.

## Constraints

- Development/integration direction remains one-way. Synthetic review advances
  only the configured integration branch from its pinned parent.
- No force push, history rewrite, branch-rule bypass, or PR fallback is
  inferred from selecting synthetic mode.
- The protocol core remains the reeve: adapters prepare evidence, while only
  accepted semantic operations record passage.
- All diff-driven gates use one authoritative pinned candidate context.
- Human acceptance is required before integration.
- The final integration-to-release PR remains mandatory when the two configured
  branch roles differ.

## Open risks

- Some GitHub protection configurations will make synthetic mode unavailable.
- Commit comments do not support every PR review affordance; the durable packet
  must compensate with explicit exported status.
- Renaming protocol vocabulary requires compatibility tests across CLI,
  Desktop, installed plugin composition, and historical fixtures.

## Changes

None.
