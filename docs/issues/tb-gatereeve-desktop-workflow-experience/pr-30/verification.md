# PR #30 Verification - Alert and attention policy

**Pinned base:** `68e0c17c9274401cc938ae8c01b84f935a4128fe`

**Pinned head:** `f1af98bc9175aec38b4236c744972614ed9ce46f`

## Verification matrix

| Category | Command or evidence | Result |
|---|---|---|
| Build/typecheck | No independent build or typecheck script exists for the plain-ESM Desktop renderer. `npm test` ran the required `stage:protocol` pretest successfully. | PASS |
| Lint/format | `git diff --check 68e0c17c9274401cc938ae8c01b84f935a4128fe..f1af98bc9175aec38b4236c744972614ed9ce46f` | PASS |
| Unit tests | `cd apps/desktop && npm test` | PASS - 110 tests passed, 0 failed |
| Integration tests | The same complete Desktop suite passed renderer, accessibility, IPC, coordinator, protocol-adapter, setup, and workspace integration coverage. | PASS |
| End-to-end/browser smoke | Production HTML, CSS, and renderer modules are exercised through the Electron-free fixture plus `linkedom` renderer integration tests. Eight URL-selectable alert/locality scenarios are present. Automated control of the existing `file://` fixture was blocked by the in-app browser local-URL policy; no bypass was attempted. | PASS for automated slice coverage; visual review remains available in the open fixture |
| Application runtime | No Electron packaging, installation, or deployment cycle was run. This renderer-only slice follows the approved fixture-first loop; full running-Electron and constrained-layout verification remains assigned to P8/I-8. | N/A for this slice |
| Known unrelated failures | None. | PASS |

## Behavior coverage

- Routine source activity produces no global alert; governance warnings are
  deduplicated; suspension, incompatible records, and observer failures retain
  high visibility.
- Sources are a quiet disclosure inside project context, while gate reasons and
  blockers remain on their gate cards.
- Setup incompleteness is expressed by the Setup entry point instead of a global
  readiness banner.
- Current workflow guidance is hidden with no actions, remains tied to governed
  current state when inspection selection changes, and expands through native
  `details`/`summary` semantics to show conditions, inputs, authority, and the
  non-executing copy command.
- The standalone Attention card and duplicate diagnostic/warning surfaces are
  absent.

## Pending manual verification

Review the default fixture and the query scenarios `governance`, `suspended`,
`inconsistent`, `incompatible`, `runtime`, `no-actions`, and `gate-blocked` from
`apps/desktop/visual/index.html`. Final running-application checks remain in
P8/I-8 and do not block this focused slice.
