# Spec - tb-gatereeve-release-artifact-integrity

**Feature:** `tb-gatereeve-release-artifact-integrity`
**Created:** 2026-08-31

## Summary

GateReeve must preserve and verify the complete Plugin marketplace candidate
across every hosted artifact boundary, fail before Apple trust or public
mutation when the tree changes, and prove the corrected lifecycle by
publishing and installing a fresh RC.6. RC.5 remains immutable failed-attempt
history and the verified RC.2 marketplace remains the deployed baseline until
RC.6 publication succeeds.

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Acceptance Criteria

- **AC1.** Producer commitment: Plugin preparation emits a valid marketplace
  tree containing both required catalogs, both platform package manifests,
  both build-provenance documents, both shared-file inventories, activation
  hooks, and release metadata. Before upload it emits a companion integrity
  manifest outside the publishable tree that commits to every regular file by
  relative path, byte count, SHA-256, and one deterministic aggregate tree
  digest. Unsafe paths, symlinks, non-files, duplicates, and manifest/tree
  disagreement are rejected.
- **AC2.** Pre-Apple round trip: The first hosted upload explicitly transports
  intentionally hidden Plugin files. A nonpublishing consumer downloads the
  artifact, verifies exact agreement with the producer commitment, and gates
  Desktop trust production. Missing, added, or changed files therefore fail
  before Developer ID signing, notarization, or candidate Apple binding.
- **AC3.** End-to-end preservation: Every later hosted handoff that carries the
  Plugin tree explicitly preserves hidden files, and trust assembly,
  distribution finalization, protected rehearsal, primary publication, and
  the retained primary result used by linked Cask finalization verify the same
  producer commitment before sealing, rebuilding records, or mutating public
  state.
- **AC4.** Semantic completeness: Exact inventory agreement does not replace
  Plugin validation. A transferred candidate must also prove matching tag,
  version, and source commit; valid Codex and Claude catalogs and manifests;
  valid activation hooks and provenance; internally valid shared-file
  inventories; and cross-platform shared inventory parity before it may be
  sealed or published.
- **AC5.** Regression coverage: Automated tests prove that a complete candidate
  passes and that stripped hidden files, missing visible files, added files,
  changed bytes, malformed integrity evidence, and semantically incomplete
  but self-consistent candidates fail. Workflow contract tests prove every
  relevant upload includes hidden files and Apple trust depends on successful
  transfer verification.
- **AC6.** Existing trust boundaries and history: The correction preserves the
  universal-DMG and Plugin/Desktop topology, separate `release-trust` and
  `release-publication` authority, retained-byte publication, ordered receipts,
  bounded retry rules, and repository-local implementation. It does not move
  or delete RC.5, reuse its version, change credentials, introduce UI work, or
  change PortReeve.
- **AC7.** Corrected primary publication: After the correction merges and exact
  mainline CI passes, a fresh RC.6 completes protected preparation, Apple trust
  production, native ARM64 and x64 evidence, read-only finalization, protected
  rehearsal, separately approved primary publication, and exact public
  asset/receipt verification without rebuilding the Plugin candidate.
- **AC8.** User installation path: The exact public RC.6 DMG installs and
  launches successfully on the user's Mac. A separately finalized, rehearsed,
  and approved linked Homebrew Cask then publishes the same trusted DMG digest,
  and `brew install --cask` or `brew upgrade --cask` results in an installable,
  launchable RC.6.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Producer commits to a safe complete Plugin tree | Preparation produces the required semantic surfaces plus a full regular-file path/size/SHA-256 inventory and deterministic tree digest outside the publishable tree; unsafe or inconsistent input is rejected | Any required semantic surface or file commitment is absent, unsafe entries are accepted, or the commitment can disagree with the prepared tree | Targeted unit/integration tests and an inspected prepared candidate plus integrity manifest |
| R2 | Artifact round trip gates Apple trust | A downloaded first-hop artifact exactly matches its producer commitment and Desktop trust depends on that verification job | Apple trust can start without verified round-trip integrity, or any missing/added/changed file passes | Workflow dependency inspection, workflow contract tests, and a nonpublishing hosted preparation trace |
| R3 | All later Plugin handoffs preserve and verify exact bytes | Each relevant upload includes hidden files and each consumer verifies the same commitment before sealing or mutation | Any later transfer can omit hidden files, silently change the tree, or proceed without the original commitment | Workflow contract tests, consumer tests, finalization/rehearsal artifacts, and digest comparison |
| R4 | Semantic Plugin verification remains mandatory | Exact transferred bytes also pass tag/source/version, catalogs, manifests, hooks, provenance, shared inventories, and parity checks | A self-consistent but malformed or incomplete Plugin tree can be sealed or published | Positive and adversarial semantic-validation tests plus hosted verification output |
| R5 | Regression suite covers the RC.5 failure class | Complete input passes; hidden stripping, visible loss, addition, mutation, malformed evidence, and self-consistent semantic incompleteness all fail deterministically | Any named failure class lacks a test or is accepted | Test names, commands, and zero-failure output; workflow contract assertions |
| R6 | Existing topology, authority, and history remain intact | Diff and hosted evidence show universal DMG, Plugin/Desktop topology, credential separation, retained-byte recovery, RC.5 immutability, no UI, and no PortReeve change | The correction alters topology or credentials, rebuilds at publication, mutates RC.5, adds UI, or changes PortReeve | Scoped diff/review, release records, Git refs, environment contract inspection, and decision log |
| R7 | RC.6 primary publication completes from exact retained bytes | Protected trust, native evidence, finalization, rehearsal, publication, public assets, digests, and ordered receipts all pass for one source and plan | Any primary stage fails, assets differ, receipts are incomplete, or publication rebuilds the Plugin tree | Hosted run URLs, source/tag/plan IDs, release record, receipts, public asset hashes, and marketplace verification |
| R8 | Direct and Homebrew Mac paths install RC.6 | User confirms exact public DMG install/launch, linked Cask publication completes under separate approval, and Homebrew installs or upgrades to launchable RC.6 | Direct install/launch fails, Cask is unlinked or unapproved, Homebrew remains on an older version, or RC.6 does not launch | User attestation with timestamp, Cask record/PR/merge evidence, Homebrew command output, installed version, Gatekeeper/launch confirmation |

## Changes

None.
