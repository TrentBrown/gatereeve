# Decisions - gatereeve-desktop

**Feature start:** 2026-08-26

Permanent record of decisions promoted from `scratchpad.md`.

---

## Add snapshot and allow-listed named reads

**Confidence:** HIGH

**Blast Radius:** Shared protocol observer, plugin adapter, Commander CLI, staged packages, and future Electron main process

Keep the current read commands backward compatible and add a versioned compact snapshot operation plus named detail reads for artifact, events, attempt, and pinned model data. The shared protocol builds and validates these results; plugin, CLI, and Desktop consume them directly. Artifact reads resolve only IDs emitted by the canonical inventory, and callers may supply external source and freshness facts without those facts becoming durable workflow state.

**Triggered by:** P1 requires a stable read contract that is richer than status but cannot break existing consumers or expose arbitrary file reads

**Alternatives considered:**
Replace status outright - rejected because it would break current plugin and CLI consumers. Let Desktop replay events or parse CLI output - rejected because it creates a second protocol implementation. Expose a generic path reader - rejected because it weakens the read boundary and makes contracts non-portable.

**Promoted:** 2026-08-26. PR: https://github.com/TrentBrown/gatereeve/pull/2.
