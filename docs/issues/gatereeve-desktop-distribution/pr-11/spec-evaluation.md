# Specification Evaluation - PR #11

**Scope:** Apple trust boundary P6 / I-5

**Pinned range:** `20b555eb6abeae051b32cfc309321478c196337a..34d272628b42662b2f0781175b9ebcc7da98b63e`

## Definition of Done

- **Build status:** PASS - hosted Universal macOS package and all source
  contract jobs pass.
- **Lint status:** PASS - syntax, YAML/documentation contract checks, and
  `git diff --check` pass.
- **Tests written:** Apple trust unit tests, coordinated-record trust tests,
  workflow-policy tests, package-contract tests, and maintainer-documentation
  assertions.
- **Test suite status:** PASS with a documented local environment limit - 66
  Desktop tests and 11 focused integration tests pass locally; all hosted
  Ubuntu/container/macOS/ARM64/Intel checks pass. The NUC lacks `unzip`, so one
  unrelated local bundle test cannot start its external tool.
- **Integration verified:** Yes for deterministic contracts and hosted native
  development packages; real protected Apple services remain the post-merge
  nonpublishing rehearsal.
- **Application runs:** Yes - the exact universal development DMG passes native
  governed-fixture smoke on Apple Silicon and Intel.
- **Pending manual verification:** Approve and observe the first protected
  `apple_trust=true` rehearsal from merged `main`.

## Acceptance criteria

| Criterion | Result | Evidence |
|---|---|---|
| AC5 - Apple trust and credential readiness | PARTIAL / NOT YET | The maintainer runbook was executed successfully through enrollment, G2 Developer ID Application identity, team API key authentication, encrypted recovery, and protected GitHub configuration. Code and tests enforce ephemeral credentials, complete trust evidence, and fail-closed public surfaces. The real protected notarization rehearsal and later publicly distributable DMG remain pending. |
| AC6 - Coordinated and recoverable releases | ADVANCED / NOT YET | Trusted evidence is now bound to the exact DMG and both native verification records, and publication still requires exact-plan approval. Live protected preparation and later public convergence remain. |

## Rubric

| # | Criterion | Result | Scope | Notes |
|---|---|---|---|---|
| R5 | Apple trust | NOT YET | P6 plus later P8/P10 | P6 implementation and credential readiness pass; the protected rehearsal, public RC proof, and final verification remain. |
| R6 | Coordinated release and recovery | NOT YET | P5, P6, P8, P10 | Trust facts can no longer be asserted as arbitrary strings and must agree across exact native evidence. Live preparation/publication evidence remains. |

No acceptance criterion is contradicted and no public mutation authority was
added. The slice is implementation-complete and reviewable, but it is not the
feature's Apple-trust completion boundary.
