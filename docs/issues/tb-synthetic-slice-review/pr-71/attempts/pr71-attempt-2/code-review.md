# Code Review - PR 71 attempt 2

**Pinned range:** `0da23d3316150cd2fa404616d1b538ad730979c4..e8c26cf12f8a736928469c3b36ebafa5af8439d9`

## Findings

No unresolved findings.

The first boundary attempt found one fail-closed ordering defect: GitHub repository identity was derived after publishing the temporary review ref. Attempt 1 was returned to implementation. Commit `e8c26cf12f8a736928469c3b36ebafa5af8439d9` moves that validation before `git commit-tree` and `git push`; the new regression test proves an unrecognized destination leaves the review ref absent.

## Review coverage

- Configuration defaults and invalid-value parity across JavaScript and Python.
- Schema-v1 PR compatibility and schema-v2 transport-neutral context normalization.
- Exact synthetic commit topology, review-ref publication, comment capture, and non-force promotion.
- Race/drift checks at resolution, publication, and promotion boundaries.
- Schema-v3 evidence packet integrity, prior packet immutability, and review-log linkage.
- Feature-final integration-to-release PR routing and synthetic rejection.
- Historical `PR_BOUNDARY` model-lock replay while new models use `REVIEW_BOUNDARY`.
- Canonical source inventory, native package parity, and portable acceptance.

## Residual risks and test gaps

- GitHub commit-comment API behavior is normalized from fixtures/contracts rather than exercised by writing comments to this live repository.
- Branch protection behavior is intentionally delegated to GitHub: promotion uses an ordinary non-force ref update and fails if policy rejects it. The helper does not attempt to bypass protection.
- The integration-branch mutation path is tested against disposable bare remotes, not this repository's live `main`.

These residuals are intentional safety boundaries and do not block review.
