# Decisions - tb-gatereeve-release-artifact-integrity

**Feature start:** 2026-08-31

Permanent record of decisions promoted from `scratchpad.md`.

---

## Bind Plugin transport to an external full-tree commitment

**Confidence:** HIGH

**Blast Radius:** Plugin preparation, hosted artifact handoffs, trust assembly, finalization, publication, and Cask finalization

Generate the integrity manifest beside, not inside, the publishable marketplace tree. It commits to safe regular-file paths, sizes, SHA-256 values, and a deterministic aggregate digest. Every consumer verifies that original commitment before authority or mutation, while semantic Plugin checks remain independently mandatory.

**Triggered by:** RC.5 sealed and attempted to deploy a Plugin tree whose hidden metadata had been omitted by artifact transport

**Alternatives considered:**
Required-path checks only — rejected because arbitrary missing or changed files could escape; archive transport — rejected as unnecessary packet-topology expansion; publication-time rebuild — rejected because it breaks retained-byte authority.

**Promoted:** 2026-08-31. PR: #44.

## Recover forward from RC.5 without rewriting history

**Confidence:** HIGH

**Blast Radius:** RC.5 tag and evidence, marketplace deployment baseline, RC.6 publication identity

Retain RC.5, its Apple request history, and its sealed packet as failed-attempt evidence. Restore only the mutable marketplace branch to the verified RC.2 commit under explicit approval, then fix current main and publish a fresh RC.6 through the full protected lifecycle.

**Triggered by:** Primary publication created the RC.5 tag and pushed an incomplete marketplace before verification failed

**Alternatives considered:**
Retry the incomplete RC.5 packet — rejected because it reproduces the defect; add missing files to RC.5 — rejected because they were not in the sealed plan; delete or retarget RC.5 — rejected because release identity and published-history contracts are immutable.

**Promoted:** 2026-08-31. PR: #44.

---

## Permit deterministic publication PR creation without broadening default authority

**Confidence:** HIGH

**Blast Radius:** Repository Actions policy and the update-manifest publication surface

Enable the repository setting that allows GitHub Actions to create and approve
pull requests, while retaining read-only default workflow permissions. The
coordinated publisher may therefore create its deterministic one-file manifest
PR only after the separate `release-publication` environment approval; this
setting does not grant Apple credentials, bypass the protected environment, or
authorize arbitrary write access for workflows that do not request it.

**Triggered by:** RC.6 primary publication completed its first three ordered surfaces but received HTTP 403 when creating the designed update-manifest PR

**Alternatives considered:**
Manually create the manifest PR — rejected because it would break deterministic publication/recovery transport; grant broad default write permissions — rejected as unnecessary authority expansion; redesign the publisher during a live partial release — rejected because same-packet bounded recovery was already designed and retained exact bytes and receipts.

**Promoted:** 2026-09-01. PR: [#46](https://github.com/TrentBrown/gatereeve/pull/46).

---

## Bind linked Cask authority to packet identity, not dispatch branch head

**Confidence:** HIGH

**Blast Radius:** Linked Cask finalization and protected dry-run/publication workflows

Treat GitHub workflow-run metadata as proof of successful execution by the
required workflow from reviewed `main`, while treating the downloaded, fully
validated primary or Cask packet as the authority for source tag, source
commit, trusted DMG, and plan identity. Replace the invalid equality between a
moving workflow-dispatch branch head and the immutable release source with two
checks: the producer ran from `main`, and the immutable release source is an
ancestor of that producer head. After artifact download, explicitly compare
the packet source tag and commit with the protected workflow inputs before
sealing, rehearsing, or publishing.

**Triggered by:** Direct-install acceptance exposed that successful primary publication run 33458101816 has GitHub head_sha cf9bbf7 while its immutable sealed release source is ancestor 10a7264

**Alternatives considered:**
Pass cf9bbf7 as the source input — rejected because it would misstate the notarized RC.6 source; replay primary publication from a ref whose head is 10a7264 — rejected as needless mutation/recovery work against already complete receipts; trust packet fields without constraining the producer branch — rejected because an arbitrary-branch workflow could otherwise claim release authority; drop source binding entirely — rejected because run provenance alone does not bind the packet to RC.6.

**Promoted:** 2026-09-01. PR: pending.
