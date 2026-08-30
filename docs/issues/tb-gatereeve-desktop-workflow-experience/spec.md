# Spec - tb-gatereeve-desktop-workflow-experience

**Feature:** `tb-gatereeve-desktop-workflow-experience`
**Created:** 2026-08-29
**Status:** approved (criteria approved 2026-08-29)

## Summary

GateReeve Desktop must become a quieter, IDE-like workflow inspector. A saved
project is the root context; the central workspace progressively discloses
feature state, slice, PR-boundary attempt, and gate detail; and one docked
right panel presents the most recently selected canonical artifact or protocol
detail. Governed
workflow state remains distinct from observational UI selection throughout.

The application must persist a stable list of explicitly selected, fully
validated projects while keeping each project's detailed inspection workspace
session-scoped. Alerts, guidance, version and ordering cues, keyboard behavior,
and accessibility follow the approved design.

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Acceptance Criteria

- **AC1.** GateReeve presents a collapsible saved-project sidebar, fixed
  non-closable main tabs for Overview, Artifacts, History, Model, and Session,
  and a collapsible, resizable right panel backed by a per-project internal tab
  collection while presenting only the most recently selected item. Setup remains in the
  masthead. The running version appears unobtrusively beside the GateReeve name
  on the same baseline. The prescribed platform shortcuts and visible layout
  commands toggle both side panels without losing their state.

- **AC2.** Selecting a fully valid, supported governed directory adds and opens
  exactly one project identified by its canonical path. Missing, legacy,
  inconsistent, malformed, or incompatible records are not admitted as normal
  projects and instead produce a read-only diagnostic with paths, failed
  checks, relevant versions, and safe manual choices. GateReeve never modifies
  the selected directory or feature record.

- **AC3.** Projects append to a stable, persistently ordered list that supports
  pointer and keyboard reordering. Relaunch revalidates all saved projects and
  restores the last active project without silently substituting another. A
  later-invalid project remains as `Needs attention`. Switching projects
  restores independent session UI state; relaunch does not restore tabs or
  hierarchy selections. Removal affects only GateReeve's reference and selects
  the nearest remaining project or the empty state.

- **AC4.** Every presented feature state is selectable without changing
  workflow state. Current and Selected remain independently visible and
  accessible, including when they coexist. Initial selection follows governed
  current state; later refreshes and transitions do not steal selection.
  Selected-state milestones update accordingly. Designing, Specifying,
  Planning, Delivering Slices, Finalizing, and Complete expose the approved
  artifact or subordinate content.

- **AC5.** Delivering Slices shows every slice with status, stable
  natural-number delivery ordinal, and distinct Active and Selected meanings.
  Selection defaults and refresh preservation follow the approved design. Each
  selected slice exposes a boundary card, including the explicit no-boundary
  state. Attempt selection controls the dependency graph and opens its boundary
  document. Gate selections open canonical evidence or an honest artifact-less
  Gate Detail tab. Dependency-stage markers represent serial and parallel
  topology correctly.

- **AC6.** All artifact entry points use one application-level right panel.
  Canonical documents deduplicate within the internal per-project tab
  collection regardless of their opening context; protocol details use their
  scoped identity. The visible tab strip is suppressed, hiding the panel
  preserves its collection, and reopening an existing artifact activates it as
  the one visible item. Missing or invalidated content becomes explicitly
  unavailable rather than stale. The Artifacts main view is an inventory
  without an embedded second viewer, and `completion-report.md` participates
  in the trusted artifact contract.

- **AC7.** The Attention card and duplicate heading facts are absent. Only
  exceptional workflow-wide conditions appear in the consolidated
  high-visibility alert area. Object-owned problems remain with their slice,
  attempt, gate, action, Setup, or Sources context and are not duplicated
  globally. Current workflow guidance appears only when actions exist, always
  reflects governed current state, and expands to show its approved detail.

- **AC8.** Project selection and reordering, main navigation, hierarchy
  selection, tab operation, panel toggles, and resizing are keyboard operable
  with predictable focus. Current, Selected, Active, Needs attention, warning,
  and unavailable meanings have accessible text or state and never rely on
  color alone. Motion respects reduced-motion preferences, and the three-region
  layout remains usable at the minimum supported window size.

- **AC9.** The approved interface-polish fixture is implemented in the actual
  Electron renderer. State, slice, and gate selection use consistent,
  layout-stable card semantics; the state rail uses sentence capitalization
  and presents `DELIVERING_SLICES` as `Implementing`; and the boundary renders
  its serial/parallel topology as an explicit seven-stage graph. Redundant
  subtitles, pills, empty messages, dependency prose, and model link are
  absent. The inspector shows the most recently selected item in a compact
  rendered/source-capable toolbar with copy, split Open, and expand actions.
  Source state is available from a modal, invalid projects show an exclusive
  diagnostic, and hiding either sidebar never displaces the central workspace.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Application shell | All AC1 regions, version treatment, commands, shortcuts, and state-preserving toggles work on supported platforms. | Any required region or command is absent, closability semantics are wrong, or toggling loses state. | UI integration tests, platform shortcut tests, and runtime screenshots. |
| R2 | Project admission | Valid records are canonically deduplicated; every rejected class receives the required non-mutating diagnostic. | An invalid record enters the workspace, diagnostics omit required facts, duplicates appear, or files are mutated. | Admission fixture tests, filesystem before-and-after checks, and diagnostic UI tests. |
| R3 | Project lifecycle | Ordering, accessible reordering, launch restoration, revalidation, per-project session state, removal, and empty-state behavior match AC3. | Ordering moves unexpectedly, restoration chooses another project, state leaks between projects, or removal affects disk. | Preference migration and unit tests plus restart and switching end-to-end tests. |
| R4 | Feature-state inspection | Current and Selected remain distinct; all initialization, refresh, milestone, artifact, and disclosure behaviors match AC4 without journal mutation. | Selection changes governance state, steals or loses inspection unexpectedly, or exposes the wrong state content. | Snapshot-driven UI tests, accessibility assertions, and a journal-invariance check. |
| R5 | Slice and boundary hierarchy | Slice, attempt, gate, empty-state, artifact, and semantic-ordering behaviors match AC5 across serial and parallel fixtures. | Any hierarchy level shows unrelated data, defaults incorrectly, or numbering implies a false order. | Protocol fixture tests, hierarchy end-to-end tests, and visual verification. |
| R6 | Unified artifact panel | Every opening surface uses the correctly deduplicated internal tab collection while the panel presents only the active item and preserves trusted unavailable states. | Duplicate canonical identities, a visible tab strip, arbitrary file access, stale content, lost hidden state, or a second embedded viewer remains. | Tab-state unit tests, named-reader security tests, and panel end-to-end tests. |
| R7 | Alert policy | The exception matrix renders each condition once at its approved scope, and workflow guidance follows current state only. | Routine conditions become global alerts, conditions are duplicated, or guidance follows inspection selection. | Warning and action fixture matrices, UI integration tests, and screenshots. |
| R8 | Accessibility and constrained layout | Every interaction and semantic distinction in AC8 is keyboard- and assistive-technology-accessible at supported widths and motion settings. | A required control is unreachable, focus becomes lost, meaning relies only on color, or the minimum layout is unusable. | Keyboard walkthrough, accessibility audit, and reduced-motion and minimum-width runtime checks. |
| R9 | Interface polish fidelity | Every behavior and removal in AC9 works in the production renderer and retains independent accessible current, selected, focus, and status semantics. | The change exists only in the visual fixture, a redundant surface remains, selection changes layout, graph topology is misleading, inspector actions fail, or hiding a sidebar corrupts layout. | Renderer DOM and accessibility tests, full Desktop suite, and live production-fixture browser verification. |

## Changes

- **2026-08-30:** Added AC9 and R9 after approval of the live interface-polish
  fixture, before moving the prototype behavior into production code.
- **2026-08-30:** Reconciled AC1, AC6, and R6 with the approved active-item-only
  inspector while retaining the serializable internal tab collection.
