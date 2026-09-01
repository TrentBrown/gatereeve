# PR #49 Feature-Final Spec Evaluation

**Verdict:** PASS

**Feature range:** `0aac0e525bc59368301e22f305198ac70a09aef5..ceee50e46872530627833759ad5d4adf8da0bc89`

**Focused PR range:** `1c19304e67f34f12930b1c51c5e06621c05c6734..ceee50e46872530627833759ad5d4adf8da0bc89`

This is the complete-feature evaluation. The configured feature range includes
unrelated work merged to `main` during sequential delivery; only PRs #44, #46,
#47, and #49 and the cited hosted/public records are attributed to this
feature.

## Definition of Done

| Category | Result | Evidence |
|---|---|---|
| Build and static verification | PASS | Desktop renderer build, deterministic dual-platform Plugin builds, lifecycle document validation, `git diff --check`, Bash syntax, and portability checks pass in `verification.md`. |
| Unit and integration tests | PASS | CLI 169/169, Desktop 158/158, pattern 28/28, shared-script 64/64, and smoke-template 2/2 tests pass. |
| Security and dependency checks | PASS | `npm audit --audit-level=high` reports zero vulnerabilities; unsafe paths, symlinks, malformed evidence, mutations, and incomplete semantic trees are rejected by tests. |
| Hosted release behavior | PASS | RC.6 preparation, trust, native ARM64/Intel verification, finalization, rehearsal, publication, bounded recovery, and independent public verification all passed from exact retained bytes. |
| Installed-product behavior | PASS | Direct DMG and Homebrew RC.6 installs were Gatekeeper-accepted as `Notarized Developer ID` and launched on the user's Mac. |
| Documentation and governed evidence | PASS | Spec, plan, issues, tracker, decisions, verification, and the detailed RC.6 acceptance record are reconciled; all rubric rows are PASS. |

## Acceptance Criteria

| Criterion | Result | Evidence |
|---|---|---|
| AC1 — Producer commitment | PASS | `cli/src/plugin/plugin-candidate-integrity.js` emits and verifies safe path/size/SHA-256 entries plus a deterministic tree digest. Positive and adversarial integrity tests pass. |
| AC2 — Pre-Apple round trip | PASS | `.github/workflows/coordinated-release-prepare.yml` explicitly transports hidden files, verifies the downloaded candidate, and makes Desktop trust depend on that verification. Hosted preparation run 33452103818 passed this gate before Apple authority. |
| AC3 — End-to-end preservation | PASS | Preparation, trust assembly, finalization, rehearsal, primary publication/recovery, and linked Cask consumption retain and verify the same commitment. RC.6 records preserve exact source `10a7264` and DMG SHA-256 `47121af4...`. |
| AC4 — Semantic completeness | PASS | `hosted-publication-v2.js` composes exact-byte verification with tag/source/version, catalog, manifest, activation-hook, provenance, shared-inventory, and parity validation. Exact-but-incomplete adversarial tests fail. |
| AC5 — Regression coverage | PASS | Automated suites cover complete input, hidden stripping, visible loss, additions, byte mutation, malformed evidence, semantic incompleteness, hidden-file upload flags, and trust-job ordering. |
| AC6 — Existing boundaries and history | PASS | The universal DMG and Plugin/Desktop graph remain intact; `release-trust` and `release-publication` remain separate; publication uses retained bytes and bounded recovery; RC.5 is unchanged; no PortReeve or UI scope was added. |
| AC7 — Corrected primary publication | PASS | Runs 33452103818, 33455275343, 33455470808, 33456095160, and same-packet recovery 33458101816 completed trust and all five ordered public receipts for sealed plan `9639bdfc...`. Independent public hashes match. |
| AC8 — User installation path | PASS | Direct RC.6 DMG acceptance passed at `2026-09-01T14:44:59Z`. Linked Cask plan `9e9e979a...` published through tap PR #3; Homebrew replaced RC.2 with RC.6, Gatekeeper accepted the app, and launch passed at `2026-09-01T16:11:51Z`. |

## Rubric Evaluation

| # | Result | Evidence |
|---|---|---|
| R1 | PASS | Safe complete producer commitment is implemented and covered by positive, unsafe-path, symlink, and exact-tree tests. |
| R2 | PASS | The real first-hop round trip passed before protected Apple trust and is enforced by workflow dependencies and contract tests. |
| R3 | PASS | All later Plugin handoffs preserve hidden files and verify the producer commitment; hosted RC.6 records retain identical identities. |
| R4 | PASS | Exact inventory and semantic marketplace validation remain jointly mandatory at every sealed consumer. |
| R5 | PASS | Every named RC.5 failure class has deterministic regression coverage and the broad suites pass. |
| R6 | PASS | Topology, least-privilege environments, immutable history, retained-byte recovery, and repository-local scope are preserved. |
| R7 | PASS | RC.6 primary publication is complete for one source, plan, trusted DMG, and five ordered receipts. |
| R8 | PASS | Both the direct public DMG and linked Homebrew Cask installed launchable RC.6 builds accepted by Gatekeeper. |

## Pending Checks

None. No acceptance criterion or rubric row is `NOT YET` or `FAIL`.
