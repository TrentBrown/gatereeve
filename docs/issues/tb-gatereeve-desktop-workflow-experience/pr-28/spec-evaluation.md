# Spec Evaluation - PR #28

**Pinned diff:** `aa9797beadd0e79b499c8b780d6b580b2fafddcd..c9554a39e94dc4b4f3d4de7c0adf470667232f8d`

**Result:** PASS for the P4-P5 slice. No in-scope acceptance criterion fails.
The cumulative rubric remains partially `NOT YET` because later P6-P8 work is
explicitly outside this PR.

## Acceptance-criteria evaluation

| Criterion | Slice result | Evidence |
|---|---|---|
| AC1 | PASS | The masthead renders the same-baseline version and both layout commands; the project sidebar, five fixed main tabs, and docked inspector are separate regions (`apps/desktop/renderer/index.html:15`, `apps/desktop/renderer/index.html:20`, `apps/desktop/renderer/index.html:62`, `apps/desktop/renderer/index.html:68`, `apps/desktop/renderer/index.html:128`). Native menu accelerators use Command/Control+B and Command+Option or Control+Alt+B (`apps/desktop/main/window.js:31`). Panel state is kept in the per-project workspace store (`apps/desktop/renderer/workspace-state.js:79`). |
| AC3 | PASS for P4 contribution | The renderer exposes pointer drag reorder plus explicit keyboard-native up/down controls and reference-only removal, while project switching restores its canonical-path workspace (`apps/desktop/renderer/renderer.js:245`, `apps/desktop/renderer/renderer.js:1261`). Store tests prove project isolation and serialization (`apps/desktop/test/workspace-state.test.js:11`). Relaunch persistence remains intentionally limited to the existing project registry; detailed tabs and hierarchy stay session-scoped. |
| AC6 | PASS for P5 | Artifact inventory has no embedded viewer (`apps/desktop/renderer/index.html:107`); the single application inspector owns closable tabs (`apps/desktop/renderer/index.html:128`). Canonical path identity, attempt-and-gate identity, nearest-tab close, hidden-panel preservation, and unavailable reconciliation live in one store (`apps/desktop/renderer/workspace-state.js:26`, `apps/desktop/renderer/workspace-state.js:40`, `apps/desktop/renderer/workspace-state.js:92`, `apps/desktop/renderer/workspace-state.js:117`, `apps/desktop/renderer/workspace-state.js:127`). Renderer integration and store tests exercise these behaviors. Later P6 hierarchy entry points will reuse this same panel. |
| AC8 | PASS for P4-P5 controls | Controls use semantic buttons, tabs, a tablist, and a focusable separator (`apps/desktop/renderer/index.html:65`, `apps/desktop/renderer/index.html:69`, `apps/desktop/renderer/index.html:129`, `apps/desktop/renderer/index.html:132`). Focus restoration and keyboard resizing are implemented in the renderer, motion is reduced through the media query, and the three-track grid constrains the inspector to the available width (`apps/desktop/renderer/styles.css:440`, `apps/desktop/renderer/styles.css:525`). The live 940 x 700 fixture check found no document-level horizontal overflow. |

## Rubric evaluation

| # | Criterion | PR #28 result | Cumulative tracker | Evidence |
|---|---|---|---|---|
| R1 | Application shell | PASS | NOT YET | All P4 shell behavior is implemented and covered by UI, shortcut, constrained-layout, and source-runtime checks. P8 retains final integrated verification. |
| R3 | Project lifecycle | PASS for P4 contribution | NOT YET | Per-project session state and accessible controls now join the P2-P3 persistence/coordinator foundation. P8 retains restart/switching end-to-end verification. |
| R6 | Unified artifact panel | PASS for P5 | NOT YET | Canonical/virtual identity, lifecycle, reconciliation, and the inventory-only view pass. P6 will add the remaining hierarchy opening surfaces, and P8 retains final integration. |
| R8 | Accessibility and constrained layout | PASS for P4-P5 controls | NOT YET | Keyboard-native operations, focus restoration, reduced motion, and minimum-width fit pass for this slice. P6-P8 still add and verify later hierarchy controls. |

## Definition-of-Done matrix

The exact verification commands and results are recorded in
[`verification.md`](verification.md). There are 106 passing automated tests,
the live HTML fixture interactions pass, the constrained-width measurement
passes, and the unpackaged source Electron governed-fixture smoke exits 0.

## Scope conclusion

The implementation matches P4-P5. It does not claim the P6 hierarchical
Overview, P7 alert consolidation, or P8 final integrated closeout.
