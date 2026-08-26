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

---

## Package Electron Desktop as an independent canonical consumer

**Confidence:** HIGH

**Blast Radius:** apps/desktop package metadata, staged protocol resources, CI installation, and supported desktop runtime

Use Electron 43.2.0 in an independent apps/desktop package and stage an exact copy of the canonical protocol plus only the two workflow-context Python helpers it needs. Desktop imports its staged observer directly and has no runtime dependency on the optional Commander CLI or qp-cli-core. Keep the staging mechanic reusable by allowing a validated include list and consumer-specific manifest name while preserving the CLI default.

**Triggered by:** P4 introduces the first Desktop runtime and therefore a new framework dependency and packaging boundary

**Alternatives considered:**
Reuse the CLI process as the Desktop backend - rejected because the CLI is optional and the approved contract makes Desktop a peer consumer. Import protocol files across the repository at runtime - rejected because a packaged app must be self-contained. Copy all workflow documentation and commands - rejected because the observer needs the protocol and context resolver, not the complete plugin resource tree.

**Promoted:** 2026-08-26. PR: #4.

---

## Constrain Desktop to a named read-only IPC protocol

**Confidence:** HIGH

**Blast Radius:** Electron main, preload, renderer, filesystem access, shell integration, and future Desktop features

Expose only worktree selection, refresh, allow-listed named detail reads, and artifact open/reveal by canonical artifact ID. Validate the top-level renderer origin and every IPC input and output, keep context isolation and sandboxing enabled, deny navigation, permissions, and webviews, and resolve artifact paths only from the current validated snapshot. No workflow transition, generic path read, shell command, CLI execution, or agent-launch channel exists.

**Triggered by:** P4 creates a privileged main-process boundary that must expose observation without permitting workflow mutation or arbitrary execution

**Alternatives considered:**
Expose the shared plugin adapter wholesale - rejected because it contains mutations. Accept arbitrary file paths from the renderer - rejected because named artifacts already provide the required scope. Rely only on renderer validation - rejected because an Electron trust boundary requires main-process validation.

**Promoted:** 2026-08-26. PR: #4.
