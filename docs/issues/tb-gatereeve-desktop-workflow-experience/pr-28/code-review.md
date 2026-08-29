# Code Review - PR #28

**Pinned diff:** `aa9797beadd0e79b499c8b780d6b580b2fafddcd..c9554a39e94dc4b4f3d4de7c0adf470667232f8d`

## Findings

No findings.

The review covered the renderer-owned workspace model, project switching and
reordering handlers, artifact tab identity and refresh reconciliation, preload
and main-process IPC boundaries, application menu accelerators, constrained
layout CSS, and the changed automated tests. The push-only layout channel is
allow-listed and carries only two fixed commands; it introduces no renderer-to-
main mutation surface. Artifact content continues through the existing named
reader and confined renderer protocol.

## Residual risks and test gaps

- The current running-app smoke does not synthesize native macOS menu
  accelerators. Menu construction and platform shortcut strings are covered by
  `apps/desktop/test/window.test.js`; final human shortcut verification remains
  a P8 check.
- Pointer drag reordering is implemented, while automated coverage is stronger
  for keyboard-native controls and coordinator ordering than for synthetic drag
  events. Accessible up/down controls provide the deterministic keyboard path.
- Relaunch restoration intentionally excludes workspace tabs and hierarchy
  selection. The store is serializable for future persistence but this PR does
  not write it to preferences.

## Verification reviewed

- `npm test`: 106 passing, 0 failing.
- Live fixture: canonical deduplication, second-tab creation, active close,
  inspector hide/restore, and constrained-width fit passed.
- Unpackaged source Electron governed-fixture smoke: exit 0.
