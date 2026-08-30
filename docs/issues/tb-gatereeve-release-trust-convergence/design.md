# Design - tb-gatereeve-release-trust-convergence

**Status:** approved (gate passed 2026-08-30)

## Problem

GateReeve already has a strong Apple distribution path: it builds a universal
macOS DMG, signs and notarizes it, staples it, performs native Apple Silicon
and Intel verification, coordinates Plugin and Desktop releases, seals a
publication plan, publishes deterministically, and recovers idempotently.
However, its current authority and record boundaries predate the stronger
release-trust lifecycle subsequently proven by PortReeve.

The current protected Apple job uses an environment named
`release-publication` that holds Apple signing and notarization material, while
ordinary publication is initiated locally. Release-record schema v1 begins
after Apple trust succeeds and therefore cannot durably represent live trust
attempts, notarization request continuity, candidate-version consumption, or
bounded recovery. The protected workflow can accept an arbitrary source ref,
and generic reruns can recreate bytes after live Apple work begins. GateReeve
also lacks a hosted, separately approved publication boundary and explicit
cross-project conformance fixtures.

These gaps permit ambiguity about which source and bytes are authoritative,
which credential class authorized each operation, and how to resume safely
after partial Apple or publication failure. Fixing them must not discard the
working GateReeve artifact topology or reinterpret already-published history.

## Intent

Bring GateReeve and PortReeve into substantial semantic conformance for:

- immutable reviewed-source and exact-byte authority;
- explicit release-record states, guards, and durable attempt history;
- structured Apple trust and native-architecture evidence;
- least-privilege separation of trust production from publication;
- protected nonpublishing rehearsal and separately approved publication;
- immutable candidate identity after live Apple work begins;
- bounded notarization recovery and idempotent partial-publication recovery;
- sealed publication planning and immutable published history; and
- repository-local fixtures that prove shared lifecycle invariants.

Conformance means the same guarantees and vocabulary where the products share
meaning. It does not mean identical artifact graphs or shared executable code.

## Chosen shape

### Preserve GateReeve's product topology

GateReeve retains one universal DMG, its coordinated Plugin and Desktop
surfaces, native ARM64 and Intel evidence for that exact DMG, and a separately
sequenced Homebrew Cask phase. It does not acquire PortReeve's separate
architecture DMGs, native CLI matrix, service lifecycle, launchd behavior, or
bare-CLI Gatekeeper contract. Both repositories continue to own their
implementations independently.

### Introduce a strict schema-v2 lifecycle

Existing schema-v1 records are permanently read-only and continue to validate
only under their original contract. They are not upgraded in place or credited
with evidence they never produced. Every new candidate uses schema v2.

Schema v2 has ordered, guarded stages that represent both the common semantic
anchors and GateReeve-specific topology. Shared anchors are
`source-pinned`, `policy-resolved`, `artifact-digests-established`,
`candidate-qualified`, `authoritative-native-verified`,
`desktop-trust-verified`, `distribution-finalized`,
`publication-approved`, and `published`. GateReeve-specific stages represent
Plugin construction, universal Desktop packaging, and trusted universal-DMG
authority without forcing PortReeve's architecture graph into GateReeve.

Live Apple work also has durable attempt records. Submission, polling,
acceptance, timeout, failure, recovery, and supersession are facts about an
attempt, not successful lifecycle stages. Every transition validates its
predecessor and binds the exact source, candidate identity, artifact digests,
request history, and evidence it consumes.

### Establish reviewed-source and exact-byte authority

Protected trust production accepts only an eligible commit from reviewed
`main`, pins its full SHA, and reserves a fresh candidate version. A
per-candidate concurrency and attempt namespace prevents concurrent or casual
duplicate production. Once the job creates live Apple-bound bytes or obtains a
notarization request, that version is consumed: changed bytes require a new
candidate version.

The protected producer emits one authoritative universal DMG and structured
trust evidence. Independent native Apple Silicon and Intel jobs download and
verify those exact bytes. Rosetta is not authoritative Intel evidence. The
primary Gatekeeper surfaces remain assessment of the notarized DMG and
execution assessment of the mounted application.

### Separate credential and approval boundaries

Create a protected `release-trust` GitHub environment containing GateReeve's
Apple Developer ID P12, its password, GateReeve's product-specific
notarization P8, and required nonsecret identity values. Trust jobs have
read-only repository permission and only the intentional artifact/evidence
output path. They have no tag, GitHub Release, Homebrew, npm, or other
publication authority.

Restrict `release-publication` to publication credentials. A job using that
environment consumes a finalized, verified release packet and the exact sealed
publication-plan digest. It cannot access Apple private material or rebuild,
resign, or renotarize trusted bytes.

The environment cutover is live feature work. The user performs the one-time
sensitive transfer from a Mac or secure recovery source; Apple private
material never passes through Playpen or the repository. After validation,
Apple secrets are removed from `release-publication`. Later releases require
separate trust and publication approvals, but GitHub injects the stored secrets
after approval; credentials are re-uploaded only for rotation, revocation,
replacement, or environment recovery.

### Make notarization and publication recovery bounded

The trust producer persists the notarization request identity and exact
candidate context as soon as a request exists, retains diagnostic outcomes,
and resumes by polling recorded history. Recovery has explicit finite limits
and may resubmit only when retained evidence proves that no request was
created. Generic GitHub **Re-run jobs** is not a valid recovery mechanism after
protected trust production begins.

After trust and native verification complete, GateReeve seals its deterministic
publication plan. Hosted publication requires explicit environment approval
for that exact digest and resumes idempotently from per-surface receipts. A
retry must converge the same release record and cannot alter trusted bytes or
the approved plan.

### Retain Cask as a linked downstream release

The primary record publishes the Plugin, universal DMG, update metadata, and
website surfaces. Direct installation and launch of that exact public DMG then
remain prerequisites for a separate Cask record. The Cask record immutably
binds the primary record digest and release identity, DMG identity and trust
evidence, direct-install proof, its own Cask bytes, sealed plan, approval, and
receipt. Cask publication uses its own approval through the publication-only
environment. The primary release may be complete while this downstream phase
is pending.

### Prove conformance and live acceptance

GateReeve adds repository-local fixtures and tests for the shared anchor
semantics, exact-byte binding, stage ordering, attempt history, credential
separation, version burn, bounded recovery, sealed approval, and idempotent
publication. Fixtures reproduce equivalent semantic cases rather than copying
PortReeve code or requiring identical stage arrays.

Feature completion requires reviewed code on `main`, the live environment
cutover, and a protected nonpublishing rehearsal using a fresh unused RC
identity. The rehearsal must produce a complete schema-v2 packet, real Apple
request history, the exact universal DMG, independent native ARM64 and Intel
evidence, a sealed plan, and a hosted publication dry run that proves zero
public mutation. The rehearsal consumes its RC identity. Actual primary and
Cask publication remain later, separately approved operations. A manual Mac
installation is useful but optional for this feature's acceptance.

### Keep release observability out of the product UI

No product UI work is planned. Structured records, retained evidence, GitHub
workflow state, and operator documentation provide release observability. If
implementation discovers an existing UI consumer, compatibility must be
preserved; adding a release-state UI requires an explicit design amendment.

## Alternatives considered

- Copy PortReeve's complete release engine: rejected because its native CLI,
  service, and architecture-specific packaging solve different product needs.
- Change either product's DMG topology for superficial symmetry: rejected;
  conformance is semantic, not artifact-shape identity.
- Mutate or reinterpret schema-v1 records: rejected because it would fabricate
  historical evidence and weaken immutable published-history guarantees.
- Keep Apple and publication credentials together: rejected because signing
  authority does not require public mutation authority and vice versa.
- Enter credentials for every release: rejected as error-prone and unnecessary;
  protected environment approval gates access to stored credentials.
- Use repository-wide secrets, a persistent Mac runner, or a new external
  secret/signing service: rejected for this feature because each broadens
  custody or infrastructure without improving the selected boundary enough to
  justify the operational cost.
- Treat generic workflow reruns as recovery: rejected because they can recreate
  changed bytes or lose continuity with an existing Apple request.
- Fold Cask into the primary record: rejected because GateReeve intentionally
  requires proof from installation of the already-public DMG before sealing
  Cask publication.
- Create a shared cross-repository runtime package now: rejected until both
  independent implementations stabilize and measurable duplication justifies
  another dependency boundary.
- Add a release-state product UI: rejected because no current product-facing
  consumer or user requirement was found.

## Constraints

- Base work on `origin/main` commit
  `4a6a680be51b5b0c2b9454497a8950df739e1805` in the governed feature
  `tb-gatereeve-release-trust-convergence`.
- Never merge or rebase `development` or `development-*` into this topic,
  `main`, or another deployed-stage branch.
- Preserve GateReeve's universal DMG and Plugin/Desktop/Cask release topology.
- Preserve all published GateReeve bytes and records; schema v1 is read-only.
- Keep GateReeve and PortReeve implementations repository-local.
- Use GitHub-hosted native macOS runners for Apple trust and ARM64/Intel
  evidence. Do not copy Apple secrets to Playpen.
- Keep GateReeve's notarization key product-specific. The team Developer ID
  certificate may be reused according to existing policy.
- Separate trust-production approval from publication approval. Implementation
  approval and rehearsal do not authorize public mutation.
- Once live Apple bytes or request history exist, changed bytes require a new
  version. Recovery uses retained exact bytes and recorded history.
- Do not rewrite released RC history, invent bare-CLI requirements, or import
  PortReeve's native-service behavior.
- No planned product UI changes.

## Open risks

- The one-time secret migration requires coordinated user action from a secure
  source and must avoid a window where the validated release path has neither
  usable trust credentials nor a safe rollback.
- GitHub runner interruption can occur between Apple request creation and
  evidence upload. The specification must define a durable handoff point and
  evidence retention strategy that preserves request continuity across that
  failure boundary.
- A protected rehearsal can occur only after reviewed implementation reaches
  `main`; delivery sequencing must preserve governance and make the final live
  acceptance result part of the feature record without treating rehearsal as
  publication authority.
- Hosted publication must preserve the existing deterministic multi-surface
  recovery behavior while replacing implicit maintainer-local authority with
  an environment approval. Adapter and permission mistakes could otherwise
  overgrant the hosted job.
- Schema-v2 compatibility dispatch and conformance vocabulary can drift if
  tests assert names without asserting the underlying exact-byte and authority
  invariants.
- A live Apple attempt necessarily consumes a fresh RC identity even when the
  feature rehearsal exposes a defect. Capacity for additional unused RC
  identities must be accepted during validation.

## Changes

None.
