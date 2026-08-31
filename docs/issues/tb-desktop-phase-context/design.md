# Design - tb-desktop-phase-context

**Status:** approved (gate passed 2026-08-31)

## Problem

Selecting Designing, Specifying, or Planning in GateReeve's feature-state rail
reveals milestones but leaves the central workspace with little explanation of
what each phase consumes or creates. The renderer opens one primary artifact,
but users cannot see the accumulated context behind that artifact or navigate
directly among the related records without switching to the complete Artifacts
inventory.

The static workflow reference explains this relationship well as a complete
Artifact Flow. Reproducing that full lifecycle in GateReeve would duplicate a
documentation surface and compete with the application's selected-state
hierarchy, especially when the project and inspector sidebars constrain the
central workspace.

## Intent

Make the first three feature states useful inspection destinations by showing
the selected phase's inputs and outputs in place. The surface should teach how
durable context accumulates, provide direct access to canonical artifacts, and
remain clearly separate from governed passage, milestones, and current
workflow guidance.

## Chosen shape

Add one `Phase context` hierarchy surface directly below the feature-state
rail and its selected-state milestones. Show it only when the inspection
selection is Designing, Specifying, or Planning. Its content follows the
inspection selection even when the governed current state is elsewhere.

The surface heading contains a `Selected state` kicker, a phase-specific title,
and a concise transformation statement. Below it, a two-column layout presents
`Uses` and `Produces`; the columns stack at constrained workspace widths.

The phase recipes are:

- **Design synthesis:** uses `interview.md` and the existing codebase; produces
  `design.md`.
- **Specification drafting:** uses `design.md`, `interview.md`, the existing
  codebase, and architecture contracts; produces `spec.md`.
- **Implementation planning:** uses `spec.md`, `design.md`, `interview.md`,
  repository structure, and tests and commands; produces `plan.md`,
  `issues.md`, and `tracker.md`.

Artifact entries resolve by semantic artifact ID against the canonical
snapshot inventory. Each compact artifact control shows its filename and
accessible status, uses the existing safe artifact-opening path, and opens in
the unified inspector. Expected-but-absent artifacts retain GateReeve's honest
pending or unavailable presentation; unsafe artifacts remain disabled. Living
context such as the codebase or repository structure appears as a visually
distinct neutral chip and is not interactive.

Selecting Designing, Specifying, or Planning continues to open that state's
primary `design.md`, `spec.md`, or `plan.md` artifact automatically. The new
surface supplements this established behavior by exposing the supporting
inputs and additional outputs.

The recipes and descriptive copy belong to the desktop presentation layer.
Artifact existence, status, path, and safety continue to come exclusively from
the canonical snapshot. This feature adds no protocol transition, journal
event, workflow-model metadata, arbitrary file reading, or IPC capability.

## Alternatives considered

- **Render the complete Artifact Flow on Overview:** rejected because it
  duplicates documentation, ignores the selected-state hierarchy, and is too
  wide and dense for the three-region desktop shell.
- **Put the phase context inside the rail surface:** rejected because
  milestones are state progress while the new content is subordinate
  inspection detail; a separate hierarchy surface matches the existing slices
  and closeout grammar.
- **Replace automatic primary-artifact opening with explicit chip clicks:**
  rejected for this feature because it would change already approved state
  selection behavior without being necessary to add the new context.
- **Add recipes to the pinned workflow model:** rejected because the content is
  explanatory presentation for the currently supported model, and changing
  the model would alter governance identity for no protocol benefit.
- **Make live source chips interactive:** rejected because GateReeve has no
  canonical artifact identity for broad repository concepts and must not
  introduce arbitrary path access.

## Constraints

- The dedicated worktree and `tb-desktop-phase-context` branch start directly
  from `origin/main`; no `tb-desktop-file-actions` changes may enter this work.
- Selecting or opening phase context changes only UI inspection state and must
  never mutate the event journal or governed workflow projection.
- All artifact access must use IDs from the snapshot inventory and the existing
  unified inspector boundary.
- Current and Selected state meanings, milestones, and current workflow
  guidance must retain their independent semantics.
- Interactive and inert chips, artifact statuses, focus, and disabled states
  must be understandable without color alone and keyboard accessible where
  interactive.
- The layout must remain usable at GateReeve's supported minimum window and
  pane widths and respect reduced-motion preferences.

## Open risks

- Several Planning inputs and outputs may wrap heavily when both sidebars are
  visible; constrained-width visual verification must establish sensible
  breakpoints and spacing.
- Automatic primary-artifact opening plus explicit artifact controls could feel
  redundant if selection treatment is too strong; the surface should remain a
  context map rather than imply a second selected artifact.
- Artifact status text can make compact chips noisy. Accessibility and visual
  tests must find a treatment that remains explicit without recreating the
  full artifact inventory card.

## Changes
