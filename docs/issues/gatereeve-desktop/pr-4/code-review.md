# Code Review - PR #4

**Pinned diff:** `641be1354eb6c50029fb1cc3826776a1749d4c77..d3ba21e0f674d209ac3f37f9a1f785df95b647a8`
**Result:** PASS - no blocking findings

## Findings

No correctness, regression, security, or test-gap finding blocks review.

## Review notes

- The privileged boundary authenticates the exact top-level application frame and validates both Desktop envelopes and canonical snapshots/details (`apps/desktop/main/ipc.js:13-87`).
- Artifact OS actions resolve only from the current canonical inventory and reject missing, unsafe, or pathless entries (`apps/desktop/main/coordinator.js:251-256`).
- The main process imports the observer/context modules rather than the mutation-capable plugin adapter (`apps/desktop/main/protocol-adapter.js:3-29`).
- Process execution is fixed to argument-array `git`, `gh`, and the canonical Python context resolver; renderer input cannot select an executable or arbitrary arguments.
- Observation generation tokens prevent stale worktree or refresh results from replacing a newer selection (`apps/desktop/main/coordinator.js:116-231`).
- GitHub polling cannot overlap its 60-second interval because the `gh` subprocess has a 20-second timeout, and a local refresh invalidates an in-flight remote generation.
- Preference writes are atomic and serialized, and their normalized schema excludes observational data (`apps/desktop/main/preferences.js:64-92`).
- Custom protocol serving and BrowserWindow settings deny permissions, navigation, popup windows, Node integration, and webviews.

## Residual risks and test gaps

- Actual Electron launch could not run on this NUC because `libatk-1.0.so.0` is absent; P8 retains macOS and Ubuntu runtime verification.
- Window bounds are not yet clamped to attached displays after monitor changes.
- The initial renderer test covers the chooser-to-observation shell, not the full views planned for P6-P7.
- The canonical staged tree includes mutation files that are deliberately unreachable. Future IPC additions should continue to be reviewed against the exact allow-list test.
