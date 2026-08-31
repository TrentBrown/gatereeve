# Plan - tb-desktop-phase-context

**Feature:** `tb-desktop-phase-context`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-08-31
**Status:** authorized (gate passed 2026-08-31)

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge cases.

## Strategy

Implement the feature as one renderer-only slice. Add a small immutable phase
recipe and resolver to `presentation.js`; the resolver will join semantic
artifact IDs to the current snapshot while preserving living context as a
separate non-artifact kind. Add one hidden hierarchy surface to the existing
Overview DOM and render it from the selected feature state before the existing
delivery, closeout, and guidance surfaces. Reuse `openArtifact` so every
artifact control keeps the unified inspector's canonical identity, pending,
unsafe, and reread behavior.

Style the surface with GateReeve's existing hierarchy-card language and a
responsive two-column-to-stacked layout. Prove the presentation contract in
unit tests, interaction and state independence in renderer tests, semantic
controls in accessibility tests, and constrained behavior in the production
visual fixture. No protocol, main-process, preload, IPC, persistence, or model
change is planned.

## Steps

- **P1. Presentation contract.** Add the approved Designing, Specifying, and
  Planning recipes plus a pure resolver that returns phase copy and ordered
  artifact/source entries using snapshot artifact metadata. Cover unsupported
  states, missing inventory entries, present/pending/changed/unsafe statuses,
  and exact ordering in presentation unit tests. **Advances:** R2, R3.
- **P2. Overview rendering and interaction.** Add the Phase context hierarchy
  surface to `renderer/index.html`, register its elements, render it from the
  observational selected state, and create artifact buttons that call the
  existing `openArtifact` path while sources remain inert. Preserve automatic
  primary-artifact opening, selected/current independence, milestone context,
  guidance context, and hiding for unsupported states. **Advances:** R1, R3,
  R4.
- **P3. Responsive and accessible styling.** Apply compact artifact and source
  chip treatments with explicit text/icon/kind/status differences, visible
  focus and disabled semantics, wrapping, and a two-column layout that stacks
  at constrained central-workspace widths. **Advances:** R5.
- **P4. Renderer, accessibility, and fixture coverage.** Extend the canonical
  renderer fixture inventory to include every referenced feature artifact.
  Add DOM/interaction assertions for all three recipes, all unsupported
  states, present and pending opening, unsafe disabling, live-source
  non-interactivity, accessible names/statuses, and the unaffected governed
  current context. **Advances:** R1, R2, R3, R4, R5.
- **P5. Integrated verification.** Run focused presentation, renderer, and
  accessibility tests; run the complete Desktop test suite; inspect the
  production visual fixture at 1280x800 and 760x560 or equivalent constrained
  pane widths; then evaluate AC1-AC5 and R1-R5 from fresh evidence. **Advances:**
  R1, R2, R3, R4, R5.

## Verification

- `node --test test/presentation.test.js test/renderer.test.js test/accessibility.test.js`
  from `apps/desktop`.
- `npm test` from `apps/desktop`, including protocol staging and the complete
  Desktop suite.
- Production renderer fixture inspection at 1280x800 and 760x560 or equivalent
  constrained central-pane widths, covering Designing, Specifying, Planning,
  and an unsupported state.
- Confirm `git diff` contains no protocol, main-process, preload, IPC, or
  workflow-model changes.
- **Final step:** Run full rubric evaluation and produce the completion report.
