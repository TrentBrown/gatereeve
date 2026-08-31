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

---

## Recover forward from RC.5 without rewriting history

**Confidence:** HIGH

**Blast Radius:** RC.5 tag and evidence, marketplace deployment baseline, RC.6 publication identity

Retain RC.5, its Apple request history, and its sealed packet as failed-attempt evidence. Restore only the mutable marketplace branch to the verified RC.2 commit under explicit approval, then fix current main and publish a fresh RC.6 through the full protected lifecycle.

**Triggered by:** Primary publication created the RC.5 tag and pushed an incomplete marketplace before verification failed

**Alternatives considered:**
Retry the incomplete RC.5 packet — rejected because it reproduces the defect; add missing files to RC.5 — rejected because they were not in the sealed plan; delete or retarget RC.5 — rejected because release identity and published-history contracts are immutable.

**Promoted:** 2026-08-31. PR: #44.
