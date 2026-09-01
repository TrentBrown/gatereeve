# Code Review - PR #44

**Pinned range:** `0aac0e525bc59368301e22f305198ac70a09aef5..6531b39d8e905e98af9bb66bf4eb0af89c609d22`

## Findings

No findings.

The review checked the full pinned diff and surrounding release code for:

- unsafe traversal, symlink, special-file, duplicate, and nondeterministic-order handling in `cli/src/plugin/plugin-candidate-integrity.js`;
- exact source/tag/version, catalog, manifest, hook, provenance, shared-inventory, and platform-parity validation;
- failure cleanup and external manifest placement in `cli/src/plugin/release.js`;
- commitment identity propagation into trusted lifecycle and coordinated release records;
- exact-tree revalidation before finalization, rehearsal/publication, and linked Cask preparation;
- GitHub artifact path scope, hidden-file inclusion, least-privilege permissions, and the `plugin-candidate-round-trip` dependency before `desktop-trust`;
- compatibility with historical coordinated records lacking the new optional v1 commitment while requiring it for schema-v2 hosted publication;
- regression coverage for the RC.5 failure modes and documentation consistency.

## Residual risks and test gaps

- The actual GitHub artifact service has not yet transported the corrected
  packet. RC.6 preparation is the planned operational proof and remains
  blocking for R2/R3/R7, not for review of this code slice.
- Apple signing/notarization and native ARM64/x64 evidence cannot run on this
  Linux host. The workflows retain the protected macOS runner authorities and
  the feature plan requires their RC.6 evidence.
- The low-level historical coordinated-record path still accepts records
  without a commitment for backward compatibility. The production schema-v2
  hosted finalizer and packet verifier require the commitment and fail closed;
  tests cover both paths.
- No UI, browser, or local application runtime is affected. Direct and
  Homebrew Mac installation remain P6 / R8.
