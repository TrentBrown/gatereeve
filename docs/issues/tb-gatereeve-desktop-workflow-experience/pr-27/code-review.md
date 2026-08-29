# Code Review - PR #27

**Pinned diff:** `3cfbf858d502f34cd363fbfeec2d29f2791b39d5..0dc90cea5a8dd135ee7b014cb93131263c58efa9`
**Result:** PASS

## Findings

No blocking or non-blocking findings remain.

The first boundary attempt found that project operations returned a state
snapshot from inside `try`, before `finally` cleared `refreshing`. Commit
`0dc90ce` moved settled returns after cleanup and added direct-result assertions
in `apps/desktop/test/coordinator.test.js`. This second review evaluates that
remediated head.

## Review notes

- `apps/desktop/main/project-registry.js:14-93` confines admission to an
  explicit canonical directory and converts filesystem/protocol failures into
  read-only diagnostics without repair or adoption.
- `apps/desktop/main/preferences.js:31-119` performs deterministic v1 migration
  and exact-set reorder/removal operations without storing project contents.
- `apps/desktop/main/coordinator.js:289-415` preserves the active project when a
  new candidate is rejected, uses generation guards during observation,
  disables watcher/polling for later-invalid projects, and removes only saved
  references.
- `apps/desktop/main/coordinator.js:419-458` validates every saved project at
  startup while observing only the restored active project.
- `apps/desktop/main/ipc.js` and `apps/desktop/preload/index.cjs` expose only
  bounded project reference operations and retain exact top-level renderer
  authentication.
- `plugin-src/shared/resources/protocol/projection.js:99-171` rejects unknown or
  cyclic gate dependencies and derives stable serial/parallel labels from the
  pinned model order.
- Canonical protocol source and Desktop-staged copies are synchronized and
  verified by the staging test.

## Residual risks and test gaps

- Preference persistence failure injection is not yet covered; P8 should test
  unreadable/unwritable user-data conditions and confirm in-memory recovery.
- Pointer/keyboard project reordering, diagnostic rendering, and independent
  per-project workspace state are deliberately absent from this slice and must
  be reviewed in P4-P8.
- Windows/Linux accelerator behavior cannot be runtime-tested on this macOS
  host; that work belongs to the application-shell and hardening slices.
