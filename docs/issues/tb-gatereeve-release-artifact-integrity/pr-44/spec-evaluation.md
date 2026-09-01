# Spec Evaluation - PR #44

**Scope:** slice
**Pinned range:** `0aac0e525bc59368301e22f305198ac70a09aef5..6531b39d8e905e98af9bb66bf4eb0af89c609d22`
**Verdict:** PASS for the implementation slice; later hosted release and Mac acceptance remain `NOT YET`.

## Definition of Done

- **Build status:** PASS — deterministic Codex and Claude Plugin builds ran in portable acceptance.
- **Lint status:** PASS — source/native validation, portability lint, documentation shell checks, and `git diff --check` passed.
- **Tests written:** integrity-manifest unit/adversarial tests, producer and CLI round trips, lifecycle/finalization tests, and GitHub workflow contract tests.
- **Test suite status:** PASS — 169 Node tests, 94 Python tests, and zero npm audit vulnerabilities.
- **Integration verified:** Yes — preparation through trusted lifecycle, finalization, publication packet verification, and linked Cask preparation are covered in-process; the real hosted RC.6 path remains P5.
- **Application runs:** N/A for this release-tooling slice.
- **Pending manual verification:** RC.6 protected hosted lifecycle and direct/Homebrew Mac install under P5-P6.

## Acceptance Criteria

| # | Status | Evidence |
|---|---|---|
| AC1 | PASS | `plugin-candidate-integrity.js` validates semantic surfaces, inventories every safe regular file, rejects symlinks/unsafe paths, and writes an external path/bytes/SHA-256/tree commitment; real `plugin-src` preparation passes. |
| AC2 | NOT YET | The preparation workflow explicitly uploads hidden files, downloads the packet in `plugin-candidate-round-trip`, verifies it, and makes `desktop-trust` depend on that job. Contract tests pass; the real RC.6 hosted trace remains P5. |
| AC3 | NOT YET | Trust assembly, recovery, finalization, rehearsal/publication packet verification, and linked Cask preparation consume the retained commitment; every Plugin-carrying upload includes hidden files. Real RC.6 retained-artifact evidence remains P5. |
| AC4 | PASS | Verification independently checks RELEASE identity, both catalogs/manifests/hooks/provenance/shared inventories, actual shared bytes, and Codex/Claude parity. A self-consistent incomplete candidate fails. |
| AC5 | PASS | Named tests reject hidden and visible loss, additions, byte mutation, malformed evidence, semantic incompleteness, unsafe manifest placement, and symlinks; workflow assertions cover upload flags and the Apple dependency. |
| AC6 | PASS | The pinned diff retains the universal DMG, Plugin/Desktop surfaces, separate trust/publication environments, retained-byte recovery/publication, and repo-local code. It changes no UI, PortReeve code, credentials, tags, or RC.5 history. |
| AC7 | NOT YET | Corrected mainline merge/CI and the fresh RC.6 primary publication are P4-P5 after human review. |
| AC8 | NOT YET | Direct RC.6 and separately approved Homebrew installation/launch evidence is P6. |

## Rubric

| # | Result | Scope | Notes |
|---|---|---|---|
| R1 | PASS | PR #44 | Producer commitment and safe-tree invariants have direct positive and adversarial evidence. |
| R2 | NOT YET | P5 | Code and workflow ordering pass; real hosted round-trip evidence is deliberately retained. |
| R3 | NOT YET | P5 | All consumers and uploads are covered in tests; real hosted handoff evidence is deliberately retained. |
| R4 | PASS | PR #44 | Semantic validation remains mandatory before trust records or publication packets can be accepted. |
| R5 | PASS | PR #44 | Every named RC.5 failure class has deterministic regression coverage. |
| R6 | PASS | PR #44 | Diff and workflow tests preserve topology, least privilege, retained-byte behavior, and immutable history. |
| R7 | NOT YET | P5 | No public RC.6 mutation is authorized or claimed at this boundary. |
| R8 | NOT YET | P6 | No Mac/Homebrew acceptance is authorized or claimed at this boundary. |

No in-scope criterion fails. The remaining `NOT YET` rows are explicit later
feature work and do not broaden or weaken this slice.
