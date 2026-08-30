# PR 34 Verification

**Verdict:** PASS

**Pinned diff:** `3b0e719af9258e5b7ee8bc9b6b8a7dd908a5bc41..c9813f3c6d66f6b6c7a7e886e299772594b40d68`

## Verification Matrix

| Category | Result | Command and evidence |
|---|---|---|
| Build/typecheck | PASS | Changed executable JavaScript passed `node --check`; all workflow YAML parsed. Hosted Plugin CI built the universal macOS package and ran Desktop contract checks on Ubuntu 22.04 and 24.04. |
| Lint/format | PASS | `git diff --check` passed. The repository defines no ESLint or formatter command for these packages. |
| CLI suite | PASS | `npm test --prefix cli` passed 158 tests with 0 failures on the remediated pinned head. |
| Desktop suite | PASS | `npm test --prefix apps/desktop` passed 125 tests with 0 failures on the remediated pinned head. |
| Focused integration | PASS | Publication, Cask, workflow-contract, documentation, and native Cask-smoke suites passed 26 focused tests after remediation. |
| Portable acceptance | PASS | `bash ci/portable-acceptance.sh` passed locally and in both hosted Ubuntu acceptance jobs and containers. |
| Hosted Plugin/Desktop CI | PASS | [Run 33333444341](https://github.com/TrentBrown/gatereeve/actions/runs/33333444341) passed all 12 jobs, including universal packaging and packaged-runtime launches on native Apple Silicon and Intel runners. |
| Hosted Cask smoke | PASS | [Run 33333444342](https://github.com/TrentBrown/gatereeve/actions/runs/33333444342) passed exact public-tap installation and disposable local-tap install/upgrade on native Apple Silicon and Intel. |
| End-to-end/browser | NOT APPLICABLE | This slice changes release automation, schemas, and operator documentation; it changes no product UI or browser flow. |
| Live protected publication | DEFERRED | No protected environment or publication secret was used. P9 performs the authorized environment cutover, fresh Apple rehearsal, sealed finalization, and hosted nonpublishing dry run. |

## Exact-authority coverage

- Finalization accepts only a schema-v2 lifecycle ending at
  `desktop-trust-verified`, then revalidates the retained Plugin tree, final
  stapled universal DMG, both native evidence documents, Apple request, and
  trust facts before sealing `distribution-finalized`.
- Every input/output file and the publication plan is digest-bound. The
  publisher verifies the packet before each operation, requires the exact plan
  digest, and records an ordered create-once receipt prefix before `published`.
- Dry runs perform remote preflights only. Real primary publication uses the
  scoped workflow token; no Apple material is referenced by finalization or
  publication.
- Marketplace convergence refuses an equal, different, or newer deployed
  identity, preventing the direct retained-byte transport from rolling back
  published Plugin history.
- The linked Cask record can be created only after primary `published`; it
  binds the primary record/stage/plan/receipt digests, exact public DMG and
  Apple trust, post-publication install/launch attestation, exact Cask bytes,
  its own approval, and deterministic tap receipt.
- Schema-v1 coordinated and Cask records remain readable historical contracts;
  new hosted authority is schema v2 and does not persist a synthesized mutable
  schema-v1 record.

## Boundary remediation

Attempt 1 correctly failed because hosted run 33333176807 compared the
historical RC.1 packet with a public tap that had immutably advanced to RC.2.
The smoke fixture now pins retained RC.2 preparation run `33234514595`, leaves
RC.1 history untouched, and triggers for schema-v2 Cask changes. Remediated
run 33333444342 passed all four native Cask jobs.

## Known limitations

- Live environment contents, real Apple signing/notarization, and protected
  dry-run nonmutation evidence remain deliberately assigned to P9.
- GitHub currently emits platform deprecation notices for repository-wide
  `actions/*@v4` usage; no new application or workflow execution warning was
  introduced by this slice.
