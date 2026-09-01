# Verification - PR #44

**Scope:** slice
**Base:** `0aac0e525bc59368301e22f305198ac70a09aef5`
**Evaluated source:** `6531b39d8e905e98af9bb66bf4eb0af89c609d22`

## Matrix

| Category | Result | Evidence |
|---|---|---|
| Build / typecheck | PASS | `node --check` passed for every changed release module; `bash ci/portable-acceptance.sh` built both native Plugin packages twice and proved byte-for-byte determinism. |
| Lint / format | PASS | `git diff --check`; `plugin validate`, `plugin validate-native`, and `plugin lint` inside portable acceptance; documentation Bash-block syntax tests. |
| Unit tests | PASS | Integrity tests cover complete input, hidden and visible loss, additions, changed bytes, malformed evidence, semantic incompleteness, unsafe placement, and symlinks. |
| Integration tests | PASS | CLI prepare/verify round trip, trusted lifecycle assembly, hosted finalization/publication, linked Cask preparation, and workflow contract tests all pass. |
| End-to-end / browser | N/A | No UI or browser behavior changes. The real hosted GitHub artifact and Apple path is deliberately retained for RC.6 after merge. |
| Application runtime | N/A | This slice changes release tooling and GitHub workflows, not a locally running product surface. Direct Mac installation and launch are P6 / R8. |

## Commands and outcomes

- `node --test cli/test/plugin-candidate-integrity.test.js cli/test/trusted-release-lifecycle-v2.test.js cli/test/hosted-publication-v2.test.js cli/test/coordinated-workflow.test.js` — PASS, 20/20.
- `node --test cli/test/release.test.js cli/test/plugin-candidate-integrity.test.js cli/test/hosted-publication-v2.test.js cli/test/trusted-release-lifecycle-v2.test.js cli/test/coordinated-workflow.test.js` — PASS, 30/30.
- `node --test cli/test/cli.test.js` — PASS, 6/6, including command-line preparation plus integrity verification.
- `bash ci/portable-acceptance.sh` — PASS on Linux x86_64 with Python 3.14.4 and Node 24.19.0:
  - 169/169 Node tests.
  - 28/28 pattern tests, 64/64 shared script tests, and 2/2 smoke-template tests.
  - `npm audit --audit-level=high`: zero vulnerabilities.
  - Native validation, portability lint, deterministic dual-platform build, package parity, no symlinks, setup, and workflow-doctor smoke checks all passed.
- Branch documents: `validate_branch_docs.py`, `lint_spec.py`, `lint_issues.py`, and `lint_tracker.py` — PASS. Decision triage is intentionally performed at its later boundary gate.

## Known failures and pending external proof

No automated failures are known. GitHub-hosted first-hop artifact transport,
Apple signing/notarization, native ARM64/x64 evidence, primary publication, and
Mac/Homebrew installation remain explicit later feature work under P5-P6 and
R2-R3/R7-R8; they are not silently claimed by this slice.
