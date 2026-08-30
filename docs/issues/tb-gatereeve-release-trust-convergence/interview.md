# Interview - tb-gatereeve-release-trust-convergence

**Feature start:** 2026-08-30
**Status:** complete

Working design notes captured during the Grill Me interview. This file is the
primary design-phase artifact before `design.md` exists. Capture settled
answers, draft contracts, examples, rationale, and important open questions as
the interview progresses.

Update this file after each settled decision or other high-value design
clarification.

This file is the output of Grill Me and the input to the Design step. It is
not a substitute for `design.md`; it is the source material from which
`design.md` is synthesized.

## Settled decisions

### D1 - Use the confirmed repository-local feature identity

**Question:** Should the feature use
`tb-gatereeve-release-trust-convergence` exactly, with no external Tree issue
attached?

**Answer:** Yes.

**Decision:** The stable feature ID and first delivery branch are
`tb-gatereeve-release-trust-convergence`. The isolated worktree begins at
freshly fetched `origin/main` commit
`4a6a680be51b5b0c2b9454497a8950df739e1805`. No `development` or
`development-*` branch participates, and there is no external task identity to
record.

### D2 - Converge lifecycle semantics without copying product topology

**Question:** Is the intended result substantial conformance between
GateReeve and PortReeve for build authority, Apple trust, evidence, approval,
publication, and recovery while retaining each product's artifact graph and a
repository-local implementation?

**Answer:** The proposed interpretation is correct; proceed.

**Decision:** GateReeve will adopt the common release-trust invariants proven
by PortReeve, not PortReeve's complete release engine. GateReeve retains its
universal DMG and coordinated Plugin/Desktop surfaces. It does not add
PortReeve's separate ARM64/x64 DMGs, standalone native-CLI matrix, native
service, launchd behavior, or bare-CLI trust contract. The projects should
conform in source and byte authority, evidence, credential separation,
approval, immutability, publication, and recovery while remaining
repository-local. Published GateReeve history remains immutable.

### D3 - Evolve the release record through strict schema-version dispatch

**Question:** Should existing GateReeve release-record schema v1 become
strictly read-only while every new candidate uses schema v2 with explicit
pre-publication trust and recovery stages?

**Answer:** Yes.

**Decision:** Published and otherwise existing schema-v1 records remain
readable and inspectable under their original contract but cannot be mutated,
upgraded in place, or credited with evidence they never produced. Every new
candidate uses schema v2. Its lifecycle must represent the authority boundaries
that v1 omits, including protected trust production, notarization request
continuity, failed or superseded attempts, version immutability, final native
evidence, plan sealing, separate publication approval, and idempotent
publication completion. Compatibility dispatch must not weaken v2 validation
to accommodate v1 history.

### D4 - Retain a separately approved, immutably linked Cask phase

**Question:** Should GateReeve retain Homebrew Cask as a separately approved
post-publication record, linked immutably to the schema-v2 primary release,
while applying the same protected publication authority, exact-plan approval,
and idempotent recovery guarantees?

**Answer:** Yes; adopt the recommended separate linked record and shared
publication-only environment.

**Decision:** The primary coordinated release publishes the exact Plugin,
universal DMG, update metadata, and website surfaces before Cask preparation.
Direct installation and launch of that exact public DMG remain prerequisites
for sealing the Cask packet. The Cask record binds the primary release-record
digest, release ID, version, tag, source commit, DMG filename, size, digest,
Apple trust identity, and direct-install proof, then independently binds its
own Cask bytes, plan digest, approval, and publication receipt. Cask
publication uses a separately approved job through the publication-only
`release-publication` environment, which contains no Apple private material.
The primary release may truthfully be published while this auditable downstream
phase remains pending. This product-specific sequencing difference does not
weaken cross-project conformance.

### D5 - Complete on protected nonpublishing live acceptance

**Question:** Should feature acceptance require a main-only protected rehearsal
with a fresh unused RC identity, a complete schema-v2 packet, native ARM64 and
Intel evidence, persisted notarization history, a sealed publication plan, a
hosted publication dry run, and proof of zero public mutation, while leaving
actual RC and Cask publication to later separate approvals?

**Answer:** Yes.

**Decision:** The feature completes only after reviewed code reaches `main` and
a fresh candidate passes the real `release-trust` path on GitHub-hosted macOS,
including exact trusted universal-DMG bytes, accepted Apple request history,
independent native ARM64 and Intel evidence, schema-v2 finalization, and a
sealed plan. The hosted `release-publication` path must consume that exact
packet in dry-run mode and prove all public surfaces remained unchanged. The
live Apple attempt consumes its candidate identity: materially changed bytes
require the next unused RC version. Manual Mac installation evidence is useful
but optional for feature completion. No public tag, release, marketplace,
manifest, website, or Cask mutation is authorized by this acceptance boundary;
each later publication requires its own exact-plan approval.

### D6 - Conform through shared anchors and product-specific topology stages

**Question:** Should cross-project conformance require common semantic anchor
stages while allowing GateReeve- and PortReeve-specific build and artifact
stages, with failed notarization work represented as durable attempts rather
than falsely completed stages?

**Answer:** Yes.

**Decision:** GateReeve schema v2 shares these semantic anchors with the proven
PortReeve lifecycle where their meaning genuinely matches:
`source-pinned`, `policy-resolved`, `artifact-digests-established`,
`candidate-qualified`, `authoritative-native-verified`,
`desktop-trust-verified`, `distribution-finalized`,
`publication-approved`, and `published`. GateReeve adds explicit
product-specific stages for Plugin candidate construction, universal Desktop
packaging, and trusted universal-DMG authority; PortReeve retains its native
CLI and architecture-specific stages. Every stage validates its predecessor
and exact evidence. In-progress, failed, timed-out, and superseded Apple work
lives in durable attempt records tied to the candidate identity and cannot be
represented as successful stage passage. Conformance fixtures test the shared
invariants using semantically equivalent repository-local data rather than
requiring identical stage arrays or copied implementation code.

### D7 - Require live environment cutover without per-release secret entry

**Question:** Should feature completion require the live GitHub environment and
credential migration, with the sensitive one-time transfer performed by the
user from the Mac or another secure recovery source?

**Answer:** Yes, after clarifying that this is a one-time environment setup and
that ordinary releases require approval rather than re-entry of credentials.

**Decision:** Feature completion requires the live creation and protection of
`release-trust`, one-time placement of GateReeve's Apple signing and
notarization credentials there, separation of publication-only authority into
`release-publication`, removal of Apple private material from the publication
environment after a validated cutover, and successful protected rehearsal of
the resulting boundary. The Playpen Linux host and repository never receive
the Apple private material. Each later release requires explicit approval of
the protected trust job and, separately, the sealed publication plan, but
GitHub supplies the already-stored environment secrets to the approved jobs;
the user re-uploads credentials only for rotation, revocation, replacement, or
environment recovery.

### D8 - Keep product UI outside the feature

**Question:** Should this feature contain no planned UI work because release
state is consumed by workflows, scripts, evidence records, and operator
documentation rather than GateReeve's product UI?

**Answer:** Yes.

**Decision:** No GateReeve product UI change is planned. The implementation
must preserve compatibility for any existing consumer discovered during work,
but adding or redesigning a release-state UI would be a scope change requiring
an explicit design amendment. Release observability belongs in structured
records, retained evidence, GitHub workflow state, and operator documentation.

## Current-state audit

Audit basis: GateReeve `origin/main` commit
`4a6a680be51b5b0c2b9454497a8950df739e1805`; completed PortReeve reference
commit `c07a3d0e5bfe731ea3d2a0c0dbde2d6e8991c720`; live GitHub environment
metadata inspected without reading secret values.

| Conformance dimension | GateReeve current state | Gap or design pressure |
|---|---|---|
| Immutable source pinning | `coordinated-release-prepare.yml` resolves `source_ref` once and passes the full commit through Plugin, Desktop, evidence, and release-record assembly. | The protected path accepts an arbitrary `source_ref`; it does not prove that the selected source is reviewed `main`. There is no per-version concurrency or protected-attempt namespace guard. |
| Exact-byte authority | The trusted universal DMG is uploaded once, downloaded by native ARM64 and Intel jobs, hashed in both evidence documents, and copied unchanged into the coordinated packet. Publication revalidates the packet before mutation. | Preserve this topology. Add authority and recovery around creation of the trusted bytes rather than replacing the working downstream byte flow. |
| Release-record lifecycle | Schema v1 enforces `prepared`, `approved`, `publishing`, and `published`, fixed ordered surfaces, exact approval digest, and per-surface receipts. | It begins only after Apple trust has succeeded. It cannot represent trust qualification, live protected production, notarization request continuity, failed attempts, or version burn. Published v1 records must remain readable and unchanged, implying versioned evolution rather than reinterpretation. |
| Apple credential custody | The signing job has `contents: read`, uses an ephemeral keychain, stages an intentional trusted bundle, and cleans up credential files. | The live repository has only `release-publication`; it contains the Apple P12, password, product-specific P8, and Apple identity variables. A `release-trust` environment does not exist. The custody boundary is therefore named and governed as publication even though the job is nonpublishing. |
| Trust evidence | `apple-trust.json` binds source, version, DMG digest, Developer ID identity, Team ID, hardened runtime, timestamp, accepted notarization ID, staple validation, and DMG Gatekeeper acceptance. | Evidence is emitted only after synchronous success. There is no create-once producer record, no in-progress request history, no retained diagnostics, and no explicit assertion that the producer lacks publication authority. |
| Native Apple evidence | Independent `macos-15` ARM64 and `macos-15-intel` jobs verify the exact universal DMG, both universal slices, strict signatures, DMG Gatekeeper open assessment, mounted-app Gatekeeper execution assessment, and real application smoke. | This already matches the relevant common contract. Rosetta is not used as Intel authority. GateReeve should not invent PortReeve's bare-CLI evidence. |
| Protected nonpublishing rehearsal | `apple_trust=true` runs protected signing and emits a publication-ready packet without public mutation. GateReeve used this successfully for RC releases. | Move it to `release-trust`, restrict trusted source authority, preserve zero-public-mutation evidence, and make protected-attempt/recovery rules explicit. |
| Notarization continuity and retry | `notarize-macos.mjs` runs `notarytool submit --wait` and records the request only after `Accepted`. | A timeout or post-submission failure can lose the request ID and exact recovery state. There is no finite persisted poll/submit state machine, no proof permitting resubmission, no failed-attempt artifact, and no guard against generic GitHub job reruns. |
| Version immutability | Publication rejects conflicting tags, releases, assets, manifests, and Cask identities. | Trust production does not reserve the candidate version when live Apple work begins. Re-dispatch or rerun can reconstruct changed bytes and submit them under the same version. |
| Sealed publication planning | The coordinated packet generates exact `SHA256SUMS`, future Desktop metadata, a deterministic publication plan, and a digest bound into approval. | Preserve this mechanism while aligning vocabulary and ensuring the digest is sealed only after the new trust lifecycle and recovery evidence are complete. |
| Publication authority and recovery | Repository-local publishers preflight all surfaces, record ordered receipts, transport metadata through deterministic PRs, and resume partial publication idempotently. Tests exercise every partial boundary. | Normal publication is a maintainer-local command authenticated by local `gh`; there is no hosted `release-publication` job consuming the sealed packet. Approval is recorded from CLI flags rather than derived from a protected publication environment. |
| Homebrew Cask | GateReeve intentionally creates a separate, digest-bound Cask record after direct-DMG installation proof, then uses deterministic PR transport and native ARM/Intel smoke. | Fresh design must decide whether to retain this linked post-publication phase or fold Cask identity into the coordinated record. The existing direct-install prerequisite argues against mechanically copying PortReeve's topology. |
| Immutable published history | Existing publication adapters reject conflicting public identities and converge exact completed surfaces. RC.1 and RC.2 records and installed-product evidence remain inspectable. | New schemas and fixtures must dispatch old records read-only and must not synthesize new trust history for published RCs. |
| Cross-project conformance | Both projects already share several concepts and Gatekeeper surfaces by design. | There is no explicit GateReeve conformance fixture suite for the newly proven PortReeve vocabulary, stage invariants, recovery cases, environment split, or exact-byte negative cases. |
| Operations documentation | `RELEASING.md` and `APPLE-RELEASE-SETUP.md` document the existing preparation, approval, recovery, Cask, and credential procedures. | They still prescribe Apple secrets in `release-publication`, allow the current synchronous notarization model, and do not prohibit generic reruns after protected trust begins. |

## Interview closeout

The interview is concluded. The settled design is a targeted lifecycle
convergence, not a release-system replacement: GateReeve keeps its universal
DMG and Plugin/Desktop/Cask topology while adopting the trust authority,
evidence, immutability, approval, recovery, and publication separation proven
by PortReeve. Existing schema-v1 and published release history remain
read-only. New work uses a schema-v2 lifecycle with durable Apple attempt
history and repository-local conformance fixtures. Live acceptance includes a
one-time environment cutover and a protected nonpublishing rehearsal; routine
releases require approvals but not credential re-entry. No product UI work is
planned.

The remaining uncertainty is implementation-level rather than directional:
the specification must make record fields, transition guards, bounded recovery
limits, evidence retention, environment migration checks, and negative
conformance cases binary and testable. The live secret transfer remains an
intentional user-operated step because neither the Playpen host nor repository
may receive Apple private material.

## Open design questions

None. Implementation details called out in the closeout must be resolved in
the specification without expanding or weakening the settled design.
