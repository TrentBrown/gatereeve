# Verification - PR #27

**Scope:** slice
**Attempt:** `slice-01-trusted-project-protocol-foundation-attempt-2`
**Base:** `3cfbf858d502f34cd363fbfeec2d29f2791b39d5`
**Head:** `0dc90cea5a8dd135ee7b014cb93131263c58efa9`
**Result:** PASS

## Matrix

| Category | Command or check | Result | Evidence |
|---|---|---|---|
| Build/typecheck | No distinct build or typecheck script is defined for `apps/desktop`; production modules are parsed and loaded by the complete test and runtime-smoke commands below. | N/A | `apps/desktop/package.json` exposes `check` as the test suite. |
| Lint/format | `git diff --check 3cfbf858d502f34cd363fbfeec2d29f2791b39d5 0dc90cea5a8dd135ee7b014cb93131263c58efa9` | PASS | No whitespace errors. |
| Branch documents | `validate_branch_docs.py`, `lint_issues.py`, and `lint_tracker.py` against the cumulative feature folder | PASS | All three validators exited 0; decision markings are completed at the later triage gate. |
| Unit and integration | Focused coordinator/IPC/contract tests followed by `npm test` from `apps/desktop` | PASS | 16 focused tests and 101 complete-suite tests passed, 0 failed. The suite restaged canonical protocol sources and covered preferences, admission, coordinator lifecycle, IPC, preload/renderer integration, security boundaries, and staged-resource parity. |
| Canonical protocol | `node --test --test-name-pattern='snapshot distinguishes\|named reads\|boundary snapshots\|snapshot validators' test/snapshot.test.js` from `cli/` | PASS | 5 focused tests passed, including completion-report inventory, stable slice ordinals, exact `1,2,3,4a-4d,5,6,7` gate labels, and nested contract rejection. |
| Browser fixture | Production visual fixture loaded at `http://127.0.0.1:8765/visual/index.html`; DOM smoke asserted the GateReeve header, fixture project, and feature-state rail. | PASS | Browser-only production renderer fixture returned a nonempty 6,603-character semantic DOM snapshot. |
| Application runtime | Generated a temporary governed fixture, then ran `GATEREEVE_DESKTOP_SMOKE=1 GATEREEVE_DESKTOP_SMOKE_WORKTREE=<fixture> GATEREEVE_DESKTOP_SMOKE_USER_DATA=<user-data> npm start --prefix apps/desktop`. | PASS | Source-launched Electron opened the governed project, exercised preload/IPC/renderer and Setup, and exited 0 against the remediated head. Temporary directories were moved to Trash. |
| Packaging/deployment | Not run. | N/A | Explicitly outside the approved local iteration scope. |

## Changed-logic coverage

- Preference schema v1-to-v2 migration, stable append, activation, exact reorder,
  nearest-reference removal, invalid-field recovery, and serialized persistence.
- Governed-only project admission with canonical paths and structured missing,
  legacy, inconsistent, incompatible, malformed, and unreadable diagnostics.
- Startup revalidation of every saved project, deterministic last-project
  restoration, active-only watcher/polling, safe switching, and summary refresh.
- Narrow add, activate, reorder, and remove IPC/preload contracts with trusted
  renderer authentication and exact state validation.
- Filesystem-preservation proof for active project removal.
- Direct project-operation results are tested to return the settled
  `refreshing: false` state after cleanup.
- Canonical completion-report inventory plus deterministic slice and dependency
  ordering projection fields.

## Known unrelated failures

None observed.

## Pending manual verification

None for this foundation slice. Pointer and keyboard reordering UI, diagnostic
presentation, and per-project session workspace behavior remain planned work in
later slices and are not claimed complete here.
