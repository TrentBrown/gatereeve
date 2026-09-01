# Interview - tb-gatereeve-release-artifact-integrity

**Feature start:** 2026-08-31
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

## Incident evidence

- RC.5 primary publication run `33423880449` created only the immutable tag
  receipt before failing Plugin marketplace verification.
- The tag `v0.1.0-rc.5` remains pinned to
  `1220138bf4248a72c1717955c4f62e3f1cda0599`; its Apple notarization request
  history and retained trusted DMG are immutable failed-candidate evidence.
- The transferred Plugin tree contained 309 visible files but omitted required
  hidden catalogs, package manifests, and build-provenance directories.
- Publication verification correctly rejected the incomplete deployed tree,
  but preparation and finalization had incorrectly accepted and sealed it.
- With explicit user approval, the mutable `marketplace` deployment branch was
  restored to the last complete RC.2 commit,
  `22c2d841e833af4d2aec351cf61d54dafaf8fcd3`. No tag, source branch, release
  artifact, credential, or secret was deleted or changed.

## D1 - Preserve RC.5 as failed history and correct forward as RC.6

**Question:** Should the incomplete marketplace deployment be restored to the
verified RC.2 commit and the transport defect be corrected through a newly
governed feature and fresh RC.6 identity?

**Answer:** Yes.

**Decision:** Preserve RC.5 and its tag as immutable failed-attempt evidence;
do not retry, repair, delete, or retarget its sealed packet. Restore only the
mutable marketplace deployment to verified RC.2, correct the artifact
transport and validation path on current `main`, and run the full hosted
lifecycle again using RC.6.

## D2 - Preserve the directory packet and harden each handoff

**Question:** Should the fix explicitly preserve hidden files in every Plugin
artifact handoff, validate the complete Plugin tree after download and before
sealing or publication, and retain the existing directory-based packet format
rather than introduce a new tar/archive format?

**Answer:** Approved.

**Decision:** Keep the repository-local directory packet. Configure each
relevant GitHub artifact upload to include the intentionally hidden Plugin
metadata, and make post-transfer validation fail before public mutation when
the candidate is incomplete or changed. Do not rebuild the Plugin candidate at
publication time and do not introduce a new archive format merely to repair
this transport defect.

## D3 - Bind transfers to a producer-side full-tree manifest

**Question:** Should preparation create a companion integrity manifest before
the first upload containing every relative path, byte count, SHA-256, and an
aggregate tree digest, with exact agreement required after every download and
before sealing or publication?

**Answer:** Approved.

**Decision:** A few required-path checks are insufficient. The producer must
commit to the complete candidate tree before transport, and each consumer must
verify the downloaded directory against that commitment. The manifest is
evidence alongside the existing directory packet, not a replacement package
and not authority to rebuild missing bytes.

## D4 - Verify Plugin transport before consuming Apple authority

**Question:** Should a nonpublishing job download and verify the Plugin
candidate immediately after its first upload, with Apple trust production
depending on successful round-trip verification?

**Answer:** Approved.

**Decision:** The first artifact boundary must be proven before Developer ID
signing or notarization begins. A missing or altered Plugin file therefore
fails the candidate while its version is still unbound by live Apple bytes or
request history, avoiding another RC.5-style identity loss.

## D5 - Complete this feature only after RC.6 reaches the user

**Question:** Should this corrective feature remain open through protected
RC.6 trust production, primary publication, direct public-DMG installation and
launch, separately approved Homebrew Cask publication, and successful Homebrew
installation or upgrade on the user's Mac?

**Answer:** Approved, with the clarification that this is the acceptance
boundary for this release-correction feature, not for every thread that
modifies GateReeve.

**Decision:** Use two feature-specific acceptance layers: engineering proof of
artifact preservation and fail-closed ordering, followed by operational proof
through the actual RC.6 public installation path. Ordinary GateReeve feature
threads retain their own acceptance criteria and the repository's normal
Definition of Done; they do not inherit a requirement to publish a release.

## Closing summary

The design is settled. RC.5 remains immutable failed-attempt evidence and the
marketplace has been restored to verified RC.2. The fix retains the existing
directory packet, explicitly transports hidden Plugin metadata, adds a
producer-side full-tree integrity manifest, and verifies the first artifact
round trip before Apple authority is consumed. Every later consumer verifies
the same commitment before sealing or mutation. The feature concludes only
after the corrected path publishes and installs RC.6 through both the direct
DMG and linked Homebrew Cask routes.

No unresolved product decision remains. Implementation details such as helper
names and exact manifest filenames may be chosen during planning without
changing these contracts. No UI work, PortReeve code change, shared runtime,
credential migration, or alteration of GateReeve's universal-DMG and
Plugin/Desktop topology is in scope.
