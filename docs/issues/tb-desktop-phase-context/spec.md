# Spec - tb-desktop-phase-context

**Feature:** `tb-desktop-phase-context`
**Created:** 2026-08-31
**Status:** approved (criteria approved 2026-08-31)

## Summary

GateReeve Desktop must show a compact, selected-state Phase context surface
for Designing, Specifying, and Planning. The surface explains each phase's
accumulated inputs and produced artifacts, opens canonical artifacts through
the unified inspector, and leaves governance state and protocol boundaries
unchanged.

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Acceptance Criteria

- **AC1.** Selecting Designing, Specifying, or Planning displays exactly one
  Phase context surface directly below the feature-state rail and milestones.
  The surface follows the inspection selection rather than the governed
  current state and is hidden for Implementing, Finalizing, and Complete.
- **AC2.** Each supported selection displays the approved phase title,
  transformation description, ordered `Uses` entries, and ordered `Produces`
  entries: Design synthesis uses `interview.md` and the existing codebase and
  produces `design.md`; Specification drafting uses `design.md`,
  `interview.md`, the existing codebase, and architecture contracts and
  produces `spec.md`; Implementation planning uses `spec.md`, `design.md`,
  `interview.md`, repository structure, and tests and commands and produces
  `plan.md`, `issues.md`, and `tracker.md`.
- **AC3.** Artifact entries resolve by canonical artifact ID from the current
  snapshot, display their filename plus an accessible current status, and open
  through the existing unified inspector. Expected-but-absent artifacts open
  the existing honest pending or unavailable presentation, unsafe artifacts
  are disabled, and living source entries are visibly distinct and
  non-interactive.
- **AC4.** Existing state-selection behavior remains intact: selecting
  Designing, Specifying, or Planning still opens its primary `design.md`,
  `spec.md`, or `plan.md` artifact. Phase-context interaction changes only UI
  inspection state; it does not change the governed current-state indicator,
  selected-state milestones, current workflow guidance, or event journal.
- **AC5.** The Phase context surface uses a two-column `Uses`/`Produces` layout
  when space permits and stacks cleanly at constrained supported widths.
  Interactive artifacts are keyboard operable with clear accessible names,
  status, focus, and disabled semantics; interactive artifacts and inert live
  context remain distinguishable without relying on color alone.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Selected-state disclosure | The surface appears in the approved hierarchy position for exactly the three supported inspection selections, follows selection independently of current state, and hides elsewhere. | The surface follows governed current state, appears for an unsupported state, is duplicated, or occupies the wrong hierarchy level. | Renderer DOM tests across all six states plus production-fixture inspection. |
| R2 | Phase recipe fidelity | Every supported state shows the approved title, description, ordered Uses entries, and ordered Produces entries with artifact and live-source kinds preserved. | Any recipe entry, order, label, kind, title, or description differs from the approved contract. | Presentation unit tests and renderer text/order assertions. |
| R3 | Canonical artifact interaction | Artifact controls derive metadata from snapshot IDs, expose status accessibly, open the unified inspector for present and expected artifacts, disable unsafe entries, and leave live sources inert. | A control uses a path as authority, bypasses the inspector, hides expected artifacts, enables unsafe content, or makes a live source behave like a file. | Presentation and renderer tests covering present, pending, missing, changed, and unsafe inventory states. |
| R4 | Existing semantics and read-only boundary | Primary state artifacts still auto-open, Current and Selected remain independent, milestones and guidance keep their approved contexts, and no renderer interaction mutates the workflow journal. | State selection loses its primary opening behavior, context leaks between current and selected state, guidance changes incorrectly, or any interaction mutates governance state. | Existing and new renderer integration tests plus journal-invariance/read-only contract evidence. |
| R5 | Responsive and accessible presentation | The surface is usable in wide and constrained three-region layouts; artifact controls have keyboard focus and explicit names/statuses; source controls are non-interactive; distinctions survive non-color inspection. | Content overflows or becomes unreadable at supported widths, an artifact is unreachable or ambiguously named, or type/status depends on color alone. | Accessibility tests and visual fixture inspection at 1280x800 and 760x560 or narrower central-pane equivalents. |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.
