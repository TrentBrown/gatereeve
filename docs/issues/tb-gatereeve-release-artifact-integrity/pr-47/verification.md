# PR #47 Verification

Pinned diff: `9a00ec850b999fe8abd51277cb5fe3f78a59bdfc..e263097113b8dca9e9b5f82888adc145b62c4538`

## Matrix

| Category | Command or evidence | Result |
|---|---|---|
| Build/typecheck | N/A: the changed implementation is GitHub Actions YAML plus Node contract assertions; no compiled production target changed | N/A |
| Lint/format | `git diff --check` | PASS |
| Unit/contract | `node --test cli/test/coordinated-workflow.test.js` | PASS, 5 tests |
| Broad portable suite | `npm test --prefix cli` | PASS, 169 tests, zero failures |
| Lifecycle documents | `validate_branch_docs.py docs/issues/tb-gatereeve-release-artifact-integrity` | PASS |
| Issue/tracker lint | `lint_issues.py` and `lint_tracker.py` for the cumulative feature folder | PASS |
| Integration | The broad CLI suite includes linked-Cask packet, dry-run, publication, idempotency, and coordinated release integration tests | PASS |
| Browser/UI | N/A: no UI or browser surface changed | N/A |
| Runtime/manual | User downloaded the exact RC.6 DMG, matched SHA-256 `47121af4f246dbef0d6597c9361df346baacf128d3042fa122a2c8d83772e314`, obtained Gatekeeper acceptance for DMG and app, and launched the installed app at `2026-09-01T14:44:59Z` | PASS |
| Hosted corrected workflow | Requires reviewed merge because protected hosted execution must use the workflow definition on `main` | PENDING BY DESIGN |

## Contract checks

- Finalization still accepts only a successful `workflow_dispatch` run of the
  primary publisher, now additionally requiring `head_branch == main`.
- The immutable release source must be an ancestor of the producer run head;
  it is no longer incorrectly required to equal a later recovery dispatch
  head.
- After download, both primary and Cask packets must contain the exact source
  commit and tag supplied as protected workflow inputs.
- Rehearsal remains read-only; publication still requires the protected
  `release-publication` environment, publication token, exact plan digest, and
  explicit approver identity.
- No Apple credential, signing, notarization, rebuild, tag, GitHub release, or
  Cask mutation occurs in this PR.

**Verdict:** PASS for the correction slice. Hosted Cask execution intentionally
remains after reviewed merge.
