# Spec - tb-gatereeve-release-trust-convergence

**Feature:** `tb-gatereeve-release-trust-convergence`
**Created:** 2026-08-30
**Status:** approved and validated (gate passed 2026-08-30)

## Summary

GateReeve must adopt the release-trust authority, evidence, immutability,
approval, recovery, and publication contracts proven by PortReeve while
preserving its universal macOS DMG and coordinated Plugin/Desktop/Cask
topology. New releases use a fail-closed schema-v2 lifecycle with durable Apple
attempt history, exact-byte authority, independent native verification, and
separate protected trust and publication environments. Existing schema-v1 and
published release history remain read-only.

The feature ends only after live environment cutover and a protected,
nonpublishing rehearsal from reviewed `main`. Actual public primary and Cask
publication remain separately approved later operations. No GateReeve product
UI work is included.

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Acceptance Criteria

- **AC1.** Versioned lifecycle and compatibility. Every new candidate uses
  release-record schema v2 and advances through the ordered shared anchors
  `source-pinned`, `policy-resolved`, `artifact-digests-established`,
  `candidate-qualified`, `authoritative-native-verified`,
  `desktop-trust-verified`, `distribution-finalized`,
  `publication-approved`, and `published`, with explicit GateReeve Plugin,
  universal-Desktop, and trusted-universal-DMG stages. Attempt failures cannot
  masquerade as completed stages. Schema-v1 records remain readable but reject
  mutation, upgrade, or synthetic v2 evidence.
- **AC2.** Source, topology, and byte authority. Protected production resolves
  the exact current reviewed `main` SHA, uses that SHA in every job, retains
  GateReeve's Plugin plus universal-DMG topology, and serializes work by
  candidate version without cancellation. Every downstream stage verifies
  exact artifact sizes and SHA-256 digests. Once Apple-bound bytes or a
  notarization request exists, changed bytes under that version are rejected
  and require a fresh RC identity.
- **AC3.** Credential and approval separation. `release-trust` contains only
  GateReeve Apple credentials and identity configuration, runs with read-only
  repository permission, has no publication credentials, and unconditionally
  removes temporary credentials and keychains. `release-publication` contains
  only publication authority and cannot sign, notarize, or rebuild artifacts.
  The live cutover removes Apple private material from
  `release-publication` after validation, without placing it on Playpen or in
  repository artifacts or logs.
- **AC4.** Durable, bounded notarization recovery. An immutable attempt record
  exists before submission and binds an attempt ID, version, source SHA, DMG
  digest, state, and timestamps. The returned Apple request ID is recorded
  before polling. Production polling uses a 30-second interval for at most 60
  polls per invocation; timeout is a durable recoverable state, not rejection.
  Recovery polls the recorded request rather than resubmitting. If interruption
  leaves request creation uncertain, Apple history must reconcile it;
  resubmission is prohibited unless evidence establishes that no request
  exists. Trust and diagnostic artifacts are retained for at least 30 days.
- **AC5.** Independent native Apple verification. Native Apple Silicon and
  Intel runners independently verify the exact authoritative universal DMG,
  both binary slices, strict Developer ID signatures, hardened runtime, secure
  timestamp, accepted notarization, staple, DMG Gatekeeper assessment,
  mounted-app execution assessment, coordinated identity, and real application
  smoke. Aggregation requires exactly one create-once document from each
  architecture and rejects missing, duplicate, stale, altered, synthetic,
  Rosetta-substituted, or cross-architecture evidence.
- **AC6.** Finalization and hosted primary publication. Checksums, update
  metadata, release assets, and the sealed publication plan derive only from
  the final trusted bytes and completed native evidence. The protected hosted
  publication job consumes the exact packet and approved plan digest without
  rebuilding. Dry run proves zero public mutation. Real publication records
  deterministic per-surface receipts and recovers idempotently against the
  same record and bytes.
- **AC7.** Linked Homebrew Cask lifecycle. Cask remains a separately approved
  post-publication record. It requires direct installation and launch evidence
  for the exact public DMG and binds the primary record digest, release
  identity, source SHA, DMG identity and trust, its own Cask bytes, plan digest,
  approval, and receipt. Its hosted publisher uses publication-only authority
  and retries idempotently. Primary publication may be complete while Cask
  remains pending.
- **AC8.** Conformance and live acceptance. Repository-local fixtures prove
  the shared PortReeve/GateReeve lifecycle invariants while retaining
  product-specific topology. From reviewed `main`, a fresh unused RC completes
  the live `release-trust` path, real Apple request history, exact universal
  DMG, native ARM64/Intel evidence, schema-v2 finalization, sealed plan, and
  hosted publication dry run. Before/after evidence proves no public tag,
  release, marketplace, manifest, website, or Cask mutation. Manual Mac
  installation is optional, and no product UI change is introduced.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Schema lifecycle | All v2 transitions and attempts validate; v1 remains unchanged and read-only. | A stage can be skipped or reordered, an attempt appears successful, or v1 is mutated. | State-machine tests and v1/v2 fixtures. |
| R2 | Source and byte authority | Reviewed-main SHA, candidate identity, concurrency, and exact bytes remain bound throughout. | Arbitrary source, changed bytes, duplicate production, cancellation, or version reuse is accepted. | Workflow assertions, digest fixtures, and negative tests. |
| R3 | Credential custody | Trust and publication authority are disjoint, least-privileged, cleaned up, and migrated live. | Secrets overlap, escape, reach Playpen, or permit the wrong operation. | Environment metadata, workflow tests, cleanup evidence, and cutover checklist. |
| R4 | Notarization recovery | Request history survives normal failure; polling is bounded; recovery reuses the request and fails closed on ambiguity. | A request is lost, polling is unbounded, or resubmission occurs without proof. | Attempt fixtures, timeout/interruption tests, and retained live evidence. |
| R5 | Native verification | Exactly one complete native ARM64 and Intel document verifies every required trust surface for the same DMG. | Any architecture or check is absent, substituted, duplicated, stale, or digest-inconsistent. | Native evidence documents and aggregation tests. |
| R6 | Finalization and publication | Final metadata and approval bind exact trusted bytes; dry run is nonmutating; publication recovery is idempotent. | Publication rebuilds, accepts another plan, mutates during dry run, or conflicts on retry. | Packet inspection, plan-digest tests, public-state snapshots, and receipt tests. |
| R7 | Cask linkage | The separate Cask record has complete immutable linkage, approval, installation proof, and retry behavior. | Cask is unlinked, premature, differently authorized, or non-idempotent. | Cask fixtures, publisher tests, and linked record inspection. |
| R8 | Conformance and acceptance | Shared invariants pass and the protected live rehearsal completes with zero public mutation and no UI scope. | Conformance diverges or any required live evidence, environment cutover, or nonmutation proof is absent. | Conformance suite, hosted packet, environment audit, and before/after public inventory. |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.
