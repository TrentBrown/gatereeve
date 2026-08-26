# Verification - PR #4

**Scope:** Slice 2, P4-P5 (`desktop-shell-observation`)
**Pinned diff:** `641be1354eb6c50029fb1cc3826776a1749d4c77..d3ba21e0f674d209ac3f37f9a1f785df95b647a8`
**Result:** PASS for the slice, with supported-platform Electron launch retained for P8 and manual verification below

## Verification matrix

| Category | Result | Exact command and evidence |
|---|---|---|
| Build/package | PASS | `npm pack --dry-run --json` in `apps/desktop`; 43 intended runtime files, 58 KB package / 250 KB unpacked, no CLI package or tests included |
| Syntax/lint/format | PASS | `find apps/desktop/main apps/desktop/renderer -type f -name '*.js' -print0 \| xargs -0 -n1 node --check`; `node --check apps/desktop/preload/index.cjs`; `git diff --check 641be1354eb6c50029fb1cc3826776a1749d4c77..d3ba21e0f674d209ac3f37f9a1f785df95b647a8` |
| Unit tests | PASS | `PYTHONDONTWRITEBYTECODE=1 npm test` in `apps/desktop`: 21/21 pass, covering contracts, preferences, Git/GitHub classification, watcher debounce, polling, window isolation, and renderer state |
| Integration tests | PASS | Same Desktop suite proves exact staged-protocol reads, journal invariance, diagnostic modes, trusted IPC, local-before-remote observation, graceful remote degradation, recents-only persistence, and polling stop/continuation behavior |
| Canonical staging compatibility | PASS | `PYTHONDONTWRITEBYTECODE=1 node --test cli/test/stage-protocol.test.js`: 2/2 pass, including unchanged CLI defaults and validated consumer-specific staging |
| Repository regression | PASS in CI | All seven PR checks passed: Plugin CI acceptance and container jobs on Ubuntu 22.04/24.04, Desktop contract jobs on Ubuntu 22.04/24.04, and Cloudflare Pages |
| End-to-end/browser | PASS for slice-level DOM flow | `apps/desktop/test/renderer.test.js` exercises initial explicit selection and transition to a canonical governed snapshot through the preload-shaped API. Full state/artifact views are P6-P7. |
| Application runtime | PENDING MANUAL | Electron downloaded successfully, but this NUC execution environment lacks `libatk-1.0.so.0`, so the binary cannot start here. Native Ubuntu and macOS launch evidence is explicitly planned for P8. |

## Deterministic document checks

- `validate_branch_docs.py docs/issues/gatereeve-desktop` - PASS (expected warning for decisions awaiting boundary triage).
- `lint_issues.py docs/issues/gatereeve-desktop` - PASS.
- `lint_tracker.py docs/issues/gatereeve-desktop` - PASS.
- `git diff --check` - PASS.

## Read-only and persistence assertions

- Main imports only the staged context, observer, and snapshot validators; it does not import the plugin adapter or transition APIs.
- Renderer IPC is restricted to explicit selection, refresh, named detail reads, and open/reveal by an artifact ID already present in the current validated snapshot.
- Window sandboxing, context isolation, permission denial, navigation denial, and webview denial are asserted directly.
- Protocol reads preserve the event-journal digest.
- The persisted JSON schema contains only recent/last worktrees and window geometry; snapshots, artifacts, GitHub results, and governance state are not persisted.
- Local changes trigger debounced full canonical recomputation. No local interval poll or global filesystem scan exists.
- GitHub polling is 60 seconds only while the last reliable observation reports an open PR or pending check; a transient remote failure preserves an already-needed poll, and merge/completion stops it.

## Known unrelated/local-environment failures

- The broad local CLI suite passes 104/105 tests. Its sole failure invokes a host `unzip` executable that is absent on this NUC. The same repository acceptance suites passed in both Ubuntu GitHub jobs, demonstrating that the failure is environmental and unrelated to this diff.
- One deliberately parallel local verification attempt ran `npm test` and `npm pack` against the same generated staging destination concurrently and caused transient missing-file failures. Sequential reruns of both exact commands pass; CI also runs them without a shared-destination race.

## Manual verification

On a supported Ubuntu or macOS host with Electron runtime libraries:

1. Run `npm ci` and `npm start` from `apps/desktop`.
2. Confirm the chooser opens a selected GateReeve worktree and shows local state before Git and GitHub enrichment.
3. Focus and manually refresh the window and confirm the source timestamps/statuses update.
4. Minimize the window while an open PR is selected and confirm GitHub polling continues; close the application and confirm no process remains.

These launch checks do not block this infrastructure slice's PR gate because P8 owns supported-platform runtime evidence and the criteria depending on it remain `NOT YET`.
