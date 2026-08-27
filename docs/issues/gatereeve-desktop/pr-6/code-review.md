# Code Review - PR #6

**Pinned final-slice diff:** `ba4b22d26b1619206b7aae9d03b19df741eca71e..7b14fbe84796a9ad8d2701d5e4cf8c8bfa591f2f`
**Result:** PASS - no findings

## Findings

No correctness, regression, security, accessibility-contract, or in-scope test-gap finding remains.

## Review notes

- `notification-observer.js` separates condition identities from one-shot event identities. Conditions may notify again only after clearing and re-entering; review/merge/completion events remain observed across transient source unavailability. PR merge evidence from GitHub and the journal shares the same key.
- Worktree open and preference enablement call `reset`, producing a quiet baseline. Manual, focus, and filesystem refresh notify only after complete Git/GitHub enrichment; GitHub polling compares the newly enriched observation. Failed native delivery is intentionally isolated from canonical state.
- Coordinator shutdown closes the watcher, stops polling, invalidates in-flight generations, and removes subscribers. No background service or persisted notification history is introduced.
- The preference crosses one boolean-validated channel through main, preload, shared contract, renderer, and persisted preference defaults. No generic workflow mutation or execution channel was added.
- The renderer checkbox is a native named control with explanatory text; the attempt selector now has an explicit label. Focus rings include inputs and embedded artifact frames, status remains textual as well as colored, and minimum-width behavior no longer forces horizontal overflow.
- Runtime CI installs only the Desktop package. Ubuntu explicitly materializes Electron's binary before configuring the bundled SUID sandbox; macOS uses the same smoke contract. The application is never launched with `--no-sandbox`.
- Added tests cover every notification class, baseline/re-entry, GitHub/journal merge deduplication, preference persistence, IPC/preload validation, coordinator lifecycle, renderer control, labels, focus, and minimum-size CSS.

## Residual risks and test gaps

- Native notification appearance, sound, and desktop-environment policy vary by OS and user settings. The product contract is trigger/control/lifecycle behavior, not pixel-identical notification presentation.
- The local NUC cannot launch Electron because `libatk-1.0.so.0` is absent, so native screen-reader tooling was not run here. Exact-head supported-platform runtime CI and direct semantic/focus DOM assertions cover the release boundary.
- CI's Ubuntu SUID helper setup depends on Electron's documented package layout. A future Electron dependency upgrade should revalidate that path; Electron is currently locked and no automatic updater exists.
