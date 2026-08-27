# Code Review - PR #9

**Result:** PASS - no findings.

**Pinned base:** `9ccee2ae49de3d2cb03b702da05f6cdcea432495`

**Pinned head:** `0eebfb89b76355c9e49e1a41a32d3c6f8eacfd4b`

## Findings

No correctness, regression, security, or test-gap finding blocks this slice.

## Review notes

- Product identity and the selected icon digest have one immutable contract;
  packaging fails before bundle creation if source metadata or artwork drifts
  (`apps/desktop/scripts/macos-package-contract.mjs:3-11`;
  `apps/desktop/scripts/package-macos.mjs:61-69`).
- The staging allow-list is positive rather than exclusion-driven. Tests,
  packaging scripts, visual fixtures, `node_modules`, candidate artwork, and
  Python cannot enter the runtime by incidental source-tree growth
  (`apps/desktop/scripts/package-macos.mjs:29-49`;
  `apps/desktop/test/macos-package.test.js:68-85`).
- DMG creation uses fixed absolute Apple tools with argument arrays, copies the
  signed bundle with `ditto`, creates a literal `/Applications` symlink, and
  always removes its exact temporary source directory
  (`apps/desktop/scripts/create-macos-dmg.mjs:16-44`).
- Verification is materially independent of package construction: it mounts
  the emitted DMG read-only, reads bundle metadata through `plutil`, checks
  every principal executable with `lipo`, verifies deep sealing, inspects the
  ASAR, and launches the mounted application
  (`apps/desktop/scripts/verify-macos-package.mjs:21-160`).
- CI uploads one artifact after one universal build. Both native jobs download
  that artifact and explicitly assert the host architecture before launch;
  neither rebuilds it (`.github/workflows/plugin-ci.yml:127-189`).
- The smoke-only user-data override is resolved and applied before preference
  initialization, preventing CI runs from inheriting or mutating runner state
  (`apps/desktop/main/index.js:34-38,69-70`).

## Residual risks and later evidence

- This code deliberately verifies only an ad-hoc candidate. Developer ID
  hardened-runtime signing, timestamping, notarization, stapling, and
  Gatekeeper acceptance remain blocking P6 evidence before any public surface.
- The icon's generated `.icns` is mechanically verified rather than manually
  inspected in Finder. The source itself received explicit human selection
  after multiple small-size preview rounds, and its digest is pinned.
- The repository's v4 GitHub JavaScript actions now emit a Node 20 deprecation
  warning on current runners. GitHub executes them under Node 24 and all jobs
  pass; a repository-wide action-version refresh is not part of this slice.
