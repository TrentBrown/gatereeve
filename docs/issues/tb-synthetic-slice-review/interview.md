# Interview - tb-synthetic-slice-review

**Feature start:** 2026-09-29
**Status:** concluded

## Problem and audience

The default agentic workflow opens a draft pull request before its boundary
checks. Quality Process uses sequential slices that first integrate into a
feature integration branch and later opens one final pull request from that
integration branch into `main`. Brad does not want the intermediate slice pull
requests visible in the repository pull-request list. The final
integration-to-`main` pull request remains required.

The portable default must remain the current pull-request workflow because
other users expect GitHub pull requests for slice review.

## Settled decisions

1. The configurable unit is the **slice boundary mode**, not the final feature
   boundary. Supported modes are `pull-request` and `synthetic-commit`.
2. Omission means `pull-request`; existing repositories and features therefore
   retain current behavior without migration.
3. The mode is selected per configured repository and locked into the governed
   feature model/context. It must not silently change during a feature.
4. Synthetic mode applies only to delivery from a slice branch into the
   configured integration branch. The integration branch still reaches the
   configured release branch through a real pull request.
5. A configured repository may name a `releaseBranch`. When omitted it defaults
   to `integrationBranch`, preserving the existing direct-to-final model.
6. Synthetic mode uses squash semantics. After gates and declared evidence-only
   changes are finalized, GateReeve creates a single-parent commit whose parent
   is the pinned integration commit and whose tree is the finalized slice tree.
7. The synthetic commit is published on a temporary GitHub review branch so a
   reviewer can use the commit diff and line comments. After acceptance, the
   exact reviewed commit is fast-forwarded onto the integration branch.
8. If the integration branch moves, the review ref moves, the finalized tree
   changes, or an undeclared post-evaluation path changes, the attempt is stale
   and cannot integrate.
9. Synthetic mode must fail closed when branch rules prohibit the required
   fast-forward. It must never weaken protection or silently fall back to a PR.
10. Review comments and the review commit/ref identity must be captured in the
    durable boundary packet before the temporary review branch is removed.
11. Protocol and evidence concepts are generalized from PR-specific naming,
    while readers retain compatibility with existing PR packets and governed
    model locks.

## Draft configuration

```json
{
  "repositories": {
    "client": {
      "path": ".",
      "remote": "origin",
      "integrationBranch": "tb-feature-integration",
      "releaseBranch": "main",
      "sliceBoundaryMode": "synthetic-commit"
    }
  }
}
```

The repository-local configuration is authoritative for branch roles. Branch
names alone must not be used to infer integration or release direction.

## Boundary sequence

1. Pin the remote integration commit and the committed source change.
2. Run the ordinary boundary modules against that immutable source range.
3. Permit only declared evidence paths after evaluation.
4. Create and publish the synthetic squash commit from the finalized tree.
5. Request human review of the commit page and collect commit comments.
6. On explicit acceptance, revalidate the integration base, review ref, source
   ancestry, evidence-only delta, and exact tree.
7. Fast-forward the integration branch to the exact synthetic commit and record
   reviewed-content integration through GateReeve.
8. Continue with later slices from the updated integration branch.
9. Open a normal pull request from integration to release for feature-final
   review and completion.

## Alternatives rejected

- Hidden draft pull requests: GitHub supplies no ordinary per-PR visibility
  control for repository readers.
- Private forks: they do not provide the required isolation and complicate
  company-source governance.
- Security-advisory forks: reserved for genuine vulnerability remediation.
- Compare pages alone: readable but do not provide persistent line comments.
- A global synthetic default: would surprise nearly every other workflow user.

## Remaining implementation risks

- Existing code and documents use `PR_BOUNDARY`, `pr_context.py`, `pullRequest`,
  and `PR Log` as structural vocabulary. Compatibility must be intentional.
- GitHub commit comments have fewer review semantics than PR review threads.
- Branch protection may make synthetic integration unavailable in some
  repositories; configuration does not constitute bypass authority.
