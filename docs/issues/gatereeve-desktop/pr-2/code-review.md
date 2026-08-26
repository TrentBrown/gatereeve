# Code Review - PR #2, attempt 2

## Findings

### P1 - Artifact inventory reports an unsafe symlink as present

**Files:** `plugin-src/shared/resources/protocol/snapshot.js:393`, `cli/test/snapshot.test.js:165`

`fileMetadata()` checks only that the lexical artifact path is inside the
feature home and then calls `stat()`, which follows symlinks. A `design.md`
symlink resolving outside the feature therefore receives `exists: true`,
`unsafe: false`, and status `present`. `safeArtifactContent()` performs a later
realpath containment check and rejects the read, so the canonical inventory and
the named read disagree about whether the advertised artifact is available.

This is user-visible in Desktop: the artifact can be shown as present and
clickable, then fail as outside the feature record. Resolve both the feature
home and artifact realpaths during metadata collection, mark an escaping
symlink unsafe/unavailable, retain the read-time recheck for race resistance,
and assert the inventory status in the existing symlink test.

## Residual risks and test gaps

- Boundary evidence paths are portable only when providers use feature-home-relative paths or absolute paths within the selected feature home; the protocol guide should make that convention explicit if external providers will construct evidence directly.
- The host lacks `unzip`, so one unrelated release-bundle assertion cannot run; all other 103 broad-suite tests pass.

## Verdict

**FAIL** - one blocking correctness finding.
