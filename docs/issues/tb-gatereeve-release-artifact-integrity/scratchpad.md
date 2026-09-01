# Decision Scratchpad - tb-gatereeve-release-artifact-integrity

**Feature start:** 2026-08-31

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

## [1] Bind Plugin transport to an external full-tree commitment

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Plugin preparation, hosted artifact handoffs, trust assembly, finalization, publication, and Cask finalization

Generate the integrity manifest beside, not inside, the publishable marketplace tree. It commits to safe regular-file paths, sizes, SHA-256 values, and a deterministic aggregate digest. Every consumer verifies that original commitment before authority or mutation, while semantic Plugin checks remain independently mandatory.

**Triggered by:** RC.5 sealed and attempted to deploy a Plugin tree whose hidden metadata had been omitted by artifact transport

**Alternatives considered:**
Required-path checks only — rejected because arbitrary missing or changed files could escape; archive transport — rejected as unnecessary packet-topology expansion; publication-time rebuild — rejected because it breaks retained-byte authority.

## [2] Recover forward from RC.5 without rewriting history

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** RC.5 tag and evidence, marketplace deployment baseline, RC.6 publication identity

Retain RC.5, its Apple request history, and its sealed packet as failed-attempt evidence. Restore only the mutable marketplace branch to the verified RC.2 commit under explicit approval, then fix current main and publish a fresh RC.6 through the full protected lifecycle.

**Triggered by:** Primary publication created the RC.5 tag and pushed an incomplete marketplace before verification failed

**Alternatives considered:**
Retry the incomplete RC.5 packet — rejected because it reproduces the defect; add missing files to RC.5 — rejected because they were not in the sealed plan; delete or retarget RC.5 — rejected because release identity and published-history contracts are immutable.

## [3] Permit deterministic publication PR creation without broadening default authority

[x] **Promote**

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
