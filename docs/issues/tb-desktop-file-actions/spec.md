# Spec - tb-desktop-file-actions

**Feature:** `tb-desktop-file-actions`
**Created:** 2026-08-31

## Summary

Provide a secure, coherent split-button file-action menu for canonical local
artifacts in GateReeve Desktop.

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Acceptance Criteria

- **AC1.** An available artifact has a primary `Open` action that opens it in
  the configured editor when available and otherwise in the OS default app.
- **AC2.** The menu lists only detected supported editors and also offers the
  OS default and a one-time application chooser; renderer input cannot name an
  arbitrary executable.
- **AC3.** The menu offers `Show in Finder`, `Save As...`, `Save to Downloads`,
  and `Copy path`, with cancellation treated as a normal no-op and canonical
  source files left unchanged.
- **AC4.** `Open on GitHub` appears only when a safe GitHub URL can be derived
  for a tracked artifact and opens that URL externally.
- **AC5.** File actions report actionable failures in the existing toast UI and
  the menu remains usable at supported inspector widths.
- **AC6.** Local-only semantics are explicit: no action is labeled `Download`,
  and no remote caching behavior is introduced.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Primary and editor-specific opening are correct and bounded. | Tests show default/configured/editor/chooser routes use canonical artifact IDs and approved editor choices. | Any open route accepts arbitrary paths/commands or selects the wrong target. | Contract, service, IPC, and renderer tests. |
| R2 | Copy and location actions have accurate behavior. | Finder, Save As, Downloads, and copy-path actions work; cancellation is non-error and source bytes are unchanged. | An action mutates the source, mishandles cancellation, or uses a misleading download label. | File-action and IPC tests plus fixture inspection. |
| R3 | GitHub availability is provenance-driven. | A tracked artifact under a GitHub remote yields a branch/path URL; unsupported/untracked cases omit it. | The action appears with an unsafe, fabricated, or non-GitHub URL. | URL derivation unit tests and renderer tests. |
| R4 | UI is coherent, accessible, and failure-aware. | Grouped split menu has accessible names, closes after actions, and surfaces rejected operations. | Controls are ambiguous, inaccessible, overflow-prone, or failures are silent. | Renderer tests and visual fixture review. |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.
