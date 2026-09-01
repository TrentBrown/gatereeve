# Plan - tb-desktop-file-actions

**Feature:** `tb-desktop-file-actions`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-08-31

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge cases.

## Strategy

Add a main-process artifact-action service that owns editor discovery, bounded
launching, save dialogs/copying, Downloads resolution, and GitHub URL
derivation. Expose its capabilities and actions through exact IPC contracts,
then render a grouped split menu from returned capabilities. Preserve the
existing canonical artifact lookup as the only source of filesystem paths.

## Steps

- **P1.** Define editor/action contracts and implement the isolated artifact
  action service with deterministic injected dependencies. **Advances:** R1,
  R2, R3.
- **P2.** Wire narrow main/preload IPC handlers and error propagation around
  canonical artifact IDs. **Advances:** R1, R2, R3.
- **P3.** Replace the artifact header menu with the grouped accessible split
  menu and update the visual fixture API. **Advances:** R1, R2, R4.
- **P4.** Add service, contract, IPC, renderer, and visual regression coverage;
  run the complete desktop suite. **Advances:** R1, R2, R3, R4.

## Verification

- **Final step:** Run full rubric evaluation and produce the completion report.
