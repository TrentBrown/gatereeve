# PR #47 Code Review

Pinned diff: `9a00ec850b999fe8abd51277cb5fe3f78a59bdfc..e263097113b8dca9e9b5f82888adc145b62c4538`

## Findings

No findings.

## Review notes

- `.github/workflows/homebrew-cask-finalize.yml:57-71` verifies the checked-out
  immutable source, current-main ancestry, successful primary publisher path,
  reviewed `main` producer branch, and source ancestry without confusing the
  producer run head with the notarized source revision.
- `.github/workflows/homebrew-cask-finalize.yml:78-99` authenticates the exact
  downloaded primary record's source commit and tag before sealing a Cask plan.
- `.github/workflows/homebrew-cask-publish.yml:63-110` and `:138-187` apply the
  same producer and packet checks independently to read-only rehearsal and
  protected publication. The dry run still rejects approval and mutation; the
  publication path still requires approver identity, exact plan digest, and
  the publication-only token.
- `cli/test/coordinated-workflow.test.js:158-207` guards all three paths against
  regression, including the rejected head-equality check, reviewed-main
  producer constraint, ancestry proof, and packet source identity.

## Residual risks and test gaps

- Static workflow contract tests cannot emulate GitHub's live run metadata or
  artifact service. The designed next step is one hosted finalization and
  protected dry-run after merge.
- The publisher relies on `actions/checkout` with `fetch-depth: 0` to make the
  descendant finalization head available for `merge-base`; this is the
  documented full-history mode and is also exercised by the upcoming hosted
  rehearsal.

**Result:** PASS.
