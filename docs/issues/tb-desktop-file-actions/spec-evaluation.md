# Spec Evaluation - tb-desktop-file-actions

**Status:** PASS, pending Definition-of-Done native runtime check

## Verification Matrix

| Category | Result | Evidence |
|---|---|---|
| Build/syntax | PASS | `node --check preload/index.cjs` and `node --check main/artifact-actions.js` |
| Lint/format | PASS | `git diff --check` |
| Unit tests | PASS | `npm test`: 129 tests, 0 failures |
| IPC integration | PASS | Contract and IPC suites exercise canonical artifact ID routing and all new actions |
| Renderer integration | PASS | Renderer suite exercises grouped actions, editor selection, and primary-action update |
| Visual fixture | PASS | 1280x800 inspection: 420px inspector, 216px menu, no viewport overflow |
| Native application runtime | PENDING | Electron cannot launch on this Linux host because `libatk-1.0.so.0` is unavailable; macOS smoke required |

## Acceptance Criteria

| # | Status | Evidence |
|---|---|---|
| AC1 | PASS | Preferred/default opening is implemented in `artifact-actions.js` and covered by service/renderer tests. |
| AC2 | PASS | Fixed editor IDs, installed-app discovery, default app, and native chooser are contract-tested. |
| AC3 | PASS | Finder, Save As, Downloads, and copy path are wired; copy tests preserve the source and avoid overwrite. |
| AC4 | PASS | GitHub capability requires tracked Git content and a supported GitHub origin. |
| AC5 | PASS | Async failures route to toasts; semantic groups and fixture geometry are verified. |
| AC6 | PASS | UI uses `Save to Downloads`; no remote caching contract was added. |

## Rubric

| # | Result | Evidence |
|---|---|---|
| R1 | PASS | Contract, artifact service, IPC, and renderer tests. |
| R2 | PASS | Copy/location service tests and renderer action tests. |
| R3 | PASS | GitHub derivation tests and conditional renderer capabilities. |
| R4 | PASS | Renderer semantics tests and live visual fixture inspection. |

## Pending Manual Verification

On macOS, launch GateReeve, open a Markdown artifact, and verify editor
detection, remembered primary editor, Default Application, Choose Application,
Show in Finder, Save As, Save to Downloads, and Open on GitHub.
